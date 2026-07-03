// Status-Paritäts-Test PORTAL-SEITE — kein Framework, nur node:assert.
// Lauf: node landingpage/scripts/test-status-parity.cjs
//
// Stabilisierungs-Vorhaben Paket 1.3 (03.07.2026).
// ZWILLING: app/__tests__/unit/booking/statusParity.test.ts (APP-SEITE).
// Die LEGACY_TO_DB-Tabelle unten und die APP_TO_DB-Tabelle im Zwilling
// beschreiben DIESELBE Übersetzung (Alt-Status → deutscher 7-Wert-DB-Kanon).
// Beide synchron halten! Phase 3 ersetzt beide durch EINE generierte Quelle.
//
// mapStatusForDb/mapStatusForFrontend sind in api/admin/index.js NICHT
// exportiert (ESM-Serverless-Handler) — sie werden per Quelltext-Extraktion
// (Klammer-Zählung) geladen. Bricht die Extraktion, schlägt der Test laut
// fehl (Umbenennung/Umbau der Funktionen wird so ebenfalls bemerkt).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../shared/constants.js');

// ── Funktions-Extraktion ────────────────────────────────────────────────────
const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'api', 'admin', 'index.js'), 'utf8');

function extractFunction(name) {
  const sigIdx = apiSrc.indexOf(`function ${name}(`);
  assert.notStrictEqual(sigIdx, -1, `Funktion ${name} nicht in api/admin/index.js gefunden`);
  const braceStart = apiSrc.indexOf('{', sigIdx);
  let depth = 0;
  for (let i = braceStart; i < apiSrc.length; i++) {
    if (apiSrc[i] === '{') depth++;
    else if (apiSrc[i] === '}') {
      depth--;
      if (depth === 0) return apiSrc.slice(sigIdx, i + 1);
    }
  }
  assert.fail(`Funktion ${name}: schliessende Klammer nicht gefunden`);
}

const mapStatusForFrontend = new Function(`return ${extractFunction('mapStatusForFrontend')}`)();
const mapStatusForDb = new Function(`return ${extractFunction('mapStatusForDb')}`)();

const CANON = ['angefragt', 'reserviert', 'bestaetigt', 'laeuft gerade', 'abgeschlossen', 'storniert', 'strittig'];

// ── 1. Zwillings-Tabelle: Alt-Status → DB-Fragment (mapStatusForDb) ─────────
// Kern-Parität zur App: gleicher DB-`status` + gleiche storno_wer/storno_grund
// je Alt-Status. Portal-Eigenheit: 'confirmed' räumt zusätzlich 3 Flags ab.
// Fund B-2026-07-03-01(a): 'replacement_found' setzt hier das Ersatz-Flag,
// die App NICHT (doppelter switch-Case dort) — Ist-Stand festgenagelt.
const LEGACY_TO_DB = [
  ['pending', { status: 'angefragt' }],
  ['confirmed', { status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: false, flag_neuer_ort_vorgeschlagen: false, flag_ersatz_trainer_gesucht: false }],
  ['finding_replacement', { status: 'bestaetigt', flag_ersatz_trainer_gesucht: true }],
  ['replacement_pending', { status: 'bestaetigt', flag_ersatz_trainer_gesucht: true }],
  ['replacement_found', { status: 'bestaetigt', flag_ersatz_trainer_gesucht: true }],
  ['reschedule_proposed', { status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: true }],
  ['location_proposed', { status: 'bestaetigt', flag_neuer_ort_vorgeschlagen: true }],
  ['awaiting_checkout', { status: 'laeuft gerade', flag_checkout_bestaetigung_ausstehend: true }],
  ['payment_open', { status: 'bestaetigt', flag_zahlung_offen: true }],
  ['checked_in', { status: 'laeuft gerade' }],
  ['checked_in_trainer', { status: 'laeuft gerade' }],
  ['completed', { status: 'abgeschlossen' }],
  ['paid', { status: 'abgeschlossen' }],
  ['cancelled', { status: 'storniert', storno_wer: 'kunde', storno_grund: 'cancelled' }],
  ['cancelled_by_trainer', { status: 'storniert', storno_wer: 'trainer', storno_grund: 'cancelled_by_trainer' }],
  ['fully_cancelled', { status: 'storniert', storno_wer: 'kunde', storno_grund: 'fully_cancelled' }],
  ['rejected', { status: 'storniert', storno_wer: 'trainer', storno_grund: 'rejected' }],
  ['expired', { status: 'storniert', storno_wer: 'system', storno_grund: 'expired' }],
  ['refunded', { status: 'storniert', storno_wer: 'kunde', storno_grund: 'refunded' }],
  ['disputed', { status: 'strittig' }],
  ['escalated', { status: 'strittig' }],
  // Neuer Kanon: 1:1 durchreichen
  ...CANON.map((s) => [s, { status: s }]),
];

for (const [legacy, expected] of LEGACY_TO_DB) {
  assert.deepStrictEqual(mapStatusForDb(legacy), expected, `mapStatusForDb('${legacy}')`);
}

// ── 2. DB-CHECK-Sicherheit (Schutz B-2026-05-30-03) ─────────────────────────
// JEDER im Admin-Dropdown wählbare Status MUSS auf einen der 7 Kanon-Werte
// abbilden — sonst DB-CHECK-Verletzung (Wurzel des Ersatztrainer-Bugs 30.05.).
for (const editable of C.ADMIN_EDITABLE_STATUSES) {
  const result = mapStatusForDb(editable);
  assert.ok(CANON.includes(result.status),
    `ADMIN_EDITABLE '${editable}' → '${result.status}' ist KEIN DB-Kanon-Wert (CHECK-Verletzung!)`);
}

// ── 3. mapStatusForFrontend: Kanon-Zeilen ohne Flags ────────────────────────
const rowsPlain = [
  [{ status: 'angefragt' }, 'pending'],
  [{ status: 'reserviert' }, 'pending'],
  [{ status: 'bestaetigt' }, 'confirmed'],
  [{ status: 'laeuft gerade' }, 'checked_in'],
  [{ status: 'abgeschlossen' }, 'completed'],
  [{ status: 'strittig' }, 'disputed'],
];
for (const [row, expected] of rowsPlain) {
  assert.strictEqual(mapStatusForFrontend(row), expected, `mapStatusForFrontend(${JSON.stringify(row)})`);
}

// ── 4. mapStatusForFrontend: Flag-Overlays + Vorrang ────────────────────────
// payment_open überlagert ALLES (Teilspec 2).
assert.strictEqual(
  mapStatusForFrontend({ status: 'bestaetigt', flag_zahlung_offen: true, flag_neuer_termin_vorgeschlagen: true }),
  'payment_open', 'payment_open muss Termin-Vorschlag überlagern');
assert.strictEqual(
  mapStatusForFrontend({ status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: true, proposed_date: '2026-07-05' }),
  'reschedule_proposed');
// Fund B-2026-07-03-01(b), Ist-Stand festgenagelt: Portal zeigt reschedule_proposed
// auch OHNE proposed_date (App heilt das Phantom seit B-2026-06-04-03). Ändert
// sich dieses Verhalten (Angleichung an die App), diese Zeile bewusst anpassen.
assert.strictEqual(
  mapStatusForFrontend({ status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: true }),
  'reschedule_proposed', 'Ist-Stand Phantom-Verhalten Portal (Fund 03.07., s. BUGS B-2026-07-03-01)');
assert.strictEqual(
  mapStatusForFrontend({ status: 'bestaetigt', flag_neuer_ort_vorgeschlagen: true }),
  'location_proposed');
assert.strictEqual(
  mapStatusForFrontend({ status: 'bestaetigt', flag_ersatz_trainer_gesucht: true }),
  'finding_replacement');
assert.strictEqual(
  mapStatusForFrontend({ status: 'laeuft gerade', flag_checkout_bestaetigung_ausstehend: true }),
  'awaiting_checkout');

// ── 5. mapStatusForFrontend: Storno-Verfeinerung ────────────────────────────
const rowsStorno = [
  [{ status: 'storniert', storno_wer: 'trainer', storno_grund: 'rejected' }, 'rejected'],
  [{ status: 'storniert', storno_wer: 'trainer', storno_grund: 'cancelled_by_trainer' }, 'cancelled_by_trainer'],
  [{ status: 'storniert', storno_wer: 'system', storno_grund: 'expired' }, 'expired'],
  [{ status: 'storniert', storno_wer: 'system', storno_grund: 'past_termin' }, 'expired'],
  [{ status: 'storniert', storno_wer: 'kunde', storno_grund: 'fully_cancelled' }, 'fully_cancelled'],
  [{ status: 'storniert', storno_wer: 'kunde', storno_grund: 'refunded' }, 'refunded'],
  [{ status: 'storniert', storno_wer: 'kunde', storno_grund: 'cancelled' }, 'cancelled'],
  // Fund B-2026-07-03-01(d), Ist-Stand: no_show-Gründe fallen im Portal auf
  // 'cancelled' zurück (App zeigt EXPIRED). Bewusst festgenagelt, kein stiller Fix.
  [{ status: 'storniert', storno_wer: 'system', storno_grund: 'no_show_kunde' }, 'cancelled'],
];
for (const [row, expected] of rowsStorno) {
  assert.strictEqual(mapStatusForFrontend(row), expected, `Storno-Fall ${JSON.stringify(row)}`);
}

// ── 6. shared/constants.js: 7-Wert-Kanon vollständig verdrahtet ─────────────
const canonKeys = ['ANGEFRAGT', 'RESERVIERT', 'BESTAETIGT', 'LAEUFT_GERADE', 'ABGESCHLOSSEN', 'STORNIERT', 'STRITTIG'];
assert.deepStrictEqual(canonKeys.map((k) => C.BOOKING_STATUS[k]), CANON, 'BOOKING_STATUS Kanon-Werte');
for (const s of CANON) {
  assert.ok(typeof C.STATUS_LABELS[s] === 'string' && C.STATUS_LABELS[s].length > 0, `STATUS_LABELS['${s}'] fehlt`);
  assert.ok(typeof C.STATUS_BADGE_CLASS[s] === 'string' && C.STATUS_BADGE_CLASS[s].length > 0, `STATUS_BADGE_CLASS['${s}'] fehlt`);
  assert.ok(C.ADMIN_EDITABLE_STATUSES.includes(s), `ADMIN_EDITABLE_STATUSES ohne '${s}'`);
}

console.log('✔ test-status-parity: alle Prüfungen grün (mapStatusForDb ' + LEGACY_TO_DB.length + ' Fälle, Frontend-Mapping, DB-CHECK-Wächter, Kanon-Konstanten)');
