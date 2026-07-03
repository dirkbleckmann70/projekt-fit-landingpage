// Tests fuer shared/-Bausteine — kein Framework, nur node:assert.
// Lauf: node landingpage/scripts/test-shared-modules.cjs
//
// Stabilisierungs-Vorhaben Paket 1.5 (03.07.2026).
// design-tokens.js + audit-log.js haben KEINEN module.exports-Block (Browser-
// Dateien) — sie werden hier per Quelltext-Ladung mit Attrappen-Umgebung
// ausgefuehrt (kein Produktiv-Code-Touch noetig).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SHARED = path.join(__dirname, '..', 'shared');
const C = require('../shared/constants.js');

// ═══ 1. constants.js — Ueberfaellig-Erkennung (isOverdue / overdueDays) ══════

// Aktiver Status + Termin weit in der Vergangenheit → ueberfaellig
assert.strictEqual(C.isOverdue({ status: 'bestaetigt', scheduled_date: '2000-01-01' }), true);
assert.strictEqual(C.isOverdue({ status: 'confirmed', scheduled_date: '2000-01-01' }), true);
// Termin in der Zukunft → nicht ueberfaellig
assert.strictEqual(C.isOverdue({ status: 'bestaetigt', scheduled_date: '2099-01-01' }), false);
// Nicht-aktive Status zaehlen nie als ueberfaellig
assert.strictEqual(C.isOverdue({ status: 'storniert', scheduled_date: '2000-01-01' }), false);
assert.strictEqual(C.isOverdue({ status: 'abgeschlossen', scheduled_date: '2000-01-01' }), false);
// Ohne Datum → false
assert.strictEqual(C.isOverdue({ status: 'bestaetigt' }), false);

// overdueDays: 3 Tage zurueck → 3 (lokale Mitternachts-Rechnung, floor)
{
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = C.overdueDays({ scheduled_date: iso });
  assert.ok(days === 3 || days === 2, `overdueDays 3 Tage zurueck: erwartet 3 (bzw. 2 an Zeitumstellungs-Tagen), erhalten ${days}`);
  assert.strictEqual(C.overdueDays({}), 0);
}

// ═══ 2. design-tokens.js — badge + gtBadge (Schutz B-2026-06-07-02) ══════════

const designSrc = fs.readFileSync(path.join(SHARED, 'design-tokens.js'), 'utf8');
const fakeWindow = {};
new Function('window', designSrc)(fakeWindow);
const D = fakeWindow.DESIGN;
assert.ok(D && typeof D.badge === 'function' && typeof D.gtBadge === 'function', 'window.DESIGN unvollstaendig');

// badge: bekannter Status → Label + Farben
assert.ok(D.badge('confirmed').includes('Bestätigt'));
assert.ok(D.badge('confirmed').includes('#16a34a'));
// badge: unbekannter Status → neutraler Fallback mit Status-Text
assert.ok(D.badge('voelligunbekannt').includes('voelligunbekannt'));
assert.ok(D.badge('voelligunbekannt').includes('#64748b'));
// badge: leer → Gedankenstrich
assert.ok(D.badge('').includes('–'));

// gtBadge (B-2026-06-07-02): inaktiv → Abgelaufen, egal wie viele Teilnehmer
assert.ok(D.gtBadge(10, 6, false).includes('Abgelaufen'));
// aktiv + genug Teilnehmer → Bestaetigt
assert.ok(D.gtBadge(6, 6, true).includes('Bestätigt'));
assert.ok(D.gtBadge(9, 6, true).includes('Bestätigt'));
// aktiv + zu wenige → "Geplant · X/Y"
assert.ok(D.gtBadge(5, 6, true).includes('Geplant · 5/6'));
// Mindestzahl 0/1/fehlt gilt als erfuellt (kein Mindest-Gate)
assert.ok(D.gtBadge(0, 0, true).includes('Bestätigt'));
assert.ok(D.gtBadge(0, 1, true).includes('Bestätigt'));
assert.ok(D.gtBadge(0, null, true).includes('Bestätigt'));
// fehlende Teilnehmerzahl → 0/Y
assert.ok(D.gtBadge(null, 8, true).includes('Geplant · 0/8'));

// ═══ 3. audit-log.js — Klartext-Renderer (Schutz B-2026-06-07-04) ════════════

const auditSrc = fs.readFileSync(path.join(SHARED, 'audit-log.js'), 'utf8');
// Helfer-Attrappen (im Browser liefern auth-guard.js/constants.js diese Globals)
const stubs = {
  STATUS_LABELS: C.STATUS_LABELS,
  formatEuro: (c) => (c / 100).toFixed(2).replace('.', ',') + ' €',
  formatDate: (d) => 'D[' + d + ']',
  formatDateTime: (d) => 'DT[' + d + ']',
};
const audit = new Function(
  'STATUS_LABELS', 'formatEuro', 'formatDate', 'formatDateTime',
  auditSrc + '\nreturn { auditEscape, formatAuditDetails, renderAuditEntry, AUDIT_BOOKING_ACTIONS };'
)(stubs.STATUS_LABELS, stubs.formatEuro, stubs.formatDate, stubs.formatDateTime);

// auditEscape: XSS-Zeichen werden entschaerft
assert.strictEqual(audit.auditEscape('<b>"&\''), '&lt;b&gt;&quot;&amp;&#39;');
assert.strictEqual(audit.auditEscape(null), '');

// formatAuditDetails: Buchung erstellt → Art, Preis, Rabatt-Code als Klartext
{
  const txt = audit.formatAuditDetails('booking', 'created',
    { art: 'pt_einzel', scheduled_date: '2026-07-10', price_cents: 7900, discount_code: 'SORRY-ABC123' });
  assert.ok(txt.includes('Personal Training'));
  assert.ok(txt.includes('79,00 €'));
  assert.ok(txt.includes('SORRY-ABC123'));
}
// Storno → Verursacher deutsch + Rueckerstattung
{
  const txt = audit.formatAuditDetails('booking', 'cancelled',
    { storno_wer: 'kunde', storno_grund: 'cancelled', refund_cents: 1000 });
  assert.ok(txt.includes('Kunde'));
  assert.ok(txt.includes('10,00 €'));
}
// XSS ueber Details-Werte bleibt entschaerft
{
  const txt = audit.formatAuditDetails('booking', 'created', { discount_code: '<script>alert(1)</script>' });
  assert.ok(!txt.includes('<script>'));
  assert.ok(txt.includes('&lt;script&gt;'));
}

// renderAuditEntry: bekannter Eintrag → Icon + Label + Akteur
{
  const html = audit.renderAuditEntry({ kind: 'booking', action: 'confirmed', actor_type: 'trainer', at: '2026-07-01T10:00:00Z' });
  assert.ok(html.includes('✅'));
  assert.ok(html.includes('Vom Trainer bestaetigt'));
  assert.ok(html.includes('durch Trainer'));
}
// B-2026-06-07-04: KEIN Roh-Daten-Block — Details erscheinen NUR als Klartext,
// nie als JSON-Feldnamen-Dump.
{
  const html = audit.renderAuditEntry({
    kind: 'booking', action: 'cancelled', actor_type: 'kunde', at: '2026-07-01T10:00:00Z',
    details: { storno_wer: 'kunde', refund_cents: 1000, internes_feld_xyz: 'geheim' },
  });
  assert.ok(!html.includes('<pre'), 'Roh-Daten-<pre>-Block darf nicht zurueckkehren (B-2026-06-07-04)');
  assert.ok(!html.includes('refund_cents'), 'JSON-Feldnamen duerfen nicht im HTML landen');
  assert.ok(html.includes('10,00 €'), 'Klartext-Zusammenfassung muss da sein');
}
// Streitfall-Entscheidung: admin_note + no_show_outcome → eigener Titel
{
  const html = audit.renderAuditEntry({
    kind: 'booking', action: 'admin_note', actor_type: 'admin', at: '2026-07-01T10:00:00Z',
    details: { no_show_outcome: 'trainer_nicht_da' },
  });
  assert.ok(html.includes('⚖️'));
  assert.ok(html.includes('Streitfall entschieden'));
  assert.ok(html.includes('Trainer war nicht da'));
}
// Unbekannte Aktion → Fallback-Label statt Crash
{
  const html = audit.renderAuditEntry({ kind: 'booking', action: 'zukunfts_aktion_42', actor_type: 'system', at: '2026-07-01T10:00:00Z' });
  assert.ok(html.includes('zukunfts_aktion_42'));
}

console.log('✔ test-shared-modules: constants (isOverdue/overdueDays), design-tokens (badge/gtBadge), audit-log (Escape/Klartext/kein Roh-Block) — alle Prüfungen grün');
