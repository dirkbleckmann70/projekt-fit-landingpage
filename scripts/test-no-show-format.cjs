// Test fuer shared/no-show-format.js — kein Framework, nur node:assert.
// Lauf: node landingpage/scripts/test-no-show-format.cjs
const assert = require('node:assert');
const { fmtFristRest, geldStaende } = require('../shared/no-show-format.js');

// --- fmtFristRest ---
assert.equal(fmtFristRest(new Date('2026-06-11T09:30:00Z'), new Date('2026-06-10T15:18:00Z')), '18 Std 12 Min');
assert.equal(fmtFristRest(new Date('2026-06-10T10:00:00Z'), new Date('2026-06-10T12:00:00Z')), 'abgelaufen');
assert.equal(fmtFristRest(new Date('2026-06-10T12:00:00Z'), new Date('2026-06-10T12:00:00Z')), 'abgelaufen'); // exakt 0
assert.equal(fmtFristRest(new Date('2026-06-10T12:45:00Z'), new Date('2026-06-10T12:00:00Z')), '0 Std 45 Min');
assert.equal(fmtFristRest(null, new Date('2026-06-10T12:00:00Z')), '–'); // ungueltig

// --- geldStaende ---
const g1 = geldStaende({ paid: true, final_price_cents: 10900, trainer_payout_cents: 4500, trainer_paid_out_at: null, status: 'strittig' });
assert.equal(g1.kundeBezahlt, true);
assert.equal(g1.kundeBetragCents, 10900);
assert.equal(g1.trainerAuszahlung, 'gesperrt');
assert.equal(g1.trainerBetragCents, 4500);

const g2 = geldStaende({ paid: true, trainer_payout_cents: 4500, trainer_paid_out_at: '2026-06-12T10:00:00Z', status: 'abgeschlossen' });
assert.equal(g2.trainerAuszahlung, 'ausgezahlt');

const g3 = geldStaende({ paid: false, status: 'bestaetigt' });
assert.equal(g3.kundeBezahlt, false);
assert.equal(g3.trainerAuszahlung, 'offen');

// abgeschlossen + bezahlt + noch nicht ausgezahlt -> 'faellig' + Fristdatum (Default 48h)
const g4 = geldStaende({ paid: true, status: 'abgeschlossen', completed_at: '2026-06-15T10:00:00Z', trainer_payout_cents: 4500, trainer_paid_out_at: null });
assert.equal(g4.trainerAuszahlung, 'faellig');
assert.equal(g4.auszahlungFaelligAt, '2026-06-17T10:00:00.000Z'); // +48h

// Frist-Stunden konfigurierbar (z.B. 72h)
const g5 = geldStaende({ paid: true, status: 'abgeschlossen', completed_at: '2026-06-15T10:00:00Z', trainer_paid_out_at: null }, 72);
assert.equal(g5.auszahlungFaelligAt, '2026-06-18T10:00:00.000Z'); // +72h

// abgeschlossen aber NICHT bezahlt -> bleibt 'offen' (keine Faelligkeit)
const g6 = geldStaende({ paid: false, status: 'abgeschlossen', completed_at: '2026-06-15T10:00:00Z' });
assert.equal(g6.trainerAuszahlung, 'offen');
assert.equal(g6.auszahlungFaelligAt, null);

// ausgezahlt schlaegt abgeschlossen -> 'ausgezahlt' (kein 'faellig')
const g7 = geldStaende({ paid: true, status: 'abgeschlossen', completed_at: '2026-06-15T10:00:00Z', trainer_paid_out_at: '2026-06-17T11:00:00Z' });
assert.equal(g7.trainerAuszahlung, 'ausgezahlt');

// B-2026-06-18-05: No-Show Kunde (storniert, Geld behalten) -> Trainer-Auszahlung
// ENTFAELLT, Betrag 0 (NICHT 'offen' mit Honorarsatz). DB-Rohwert 'storniert'.
const g8 = geldStaende({ paid: true, status: 'storniert', price_cents: 10900, trainer_payout_cents: 4500, trainer_paid_out_at: null });
assert.equal(g8.trainerAuszahlung, 'entfaellt');
assert.equal(g8.trainerBetragCents, 0);
assert.equal(g8.kundeBetragCents, 10900); // Kundenumsatz bleibt (Geld behalten)

// Gleicher Fall mit api/admin-gemapptem Frontend-Wert 'cancelled'
const g9 = geldStaende({ paid: true, status: 'cancelled', final_price_cents: 10900, trainer_payout_cents: 4500, trainer_paid_out_at: null });
assert.equal(g9.trainerAuszahlung, 'entfaellt');
assert.equal(g9.trainerBetragCents, 0);

// strittig hat Vorrang vor storniert: solange Klaerung laeuft -> 'gesperrt'
const g10 = geldStaende({ paid: true, status: 'strittig', trainer_payout_cents: 4500, trainer_paid_out_at: null });
assert.equal(g10.trainerAuszahlung, 'gesperrt');

// abgelehnte/abgelaufene Buchung -> ebenfalls 'entfaellt'
const g11 = geldStaende({ paid: false, status: 'rejected' });
assert.equal(g11.trainerAuszahlung, 'entfaellt');
const g12 = geldStaende({ paid: false, status: 'expired' });
assert.equal(g12.trainerAuszahlung, 'entfaellt');

console.log('no-show-format: alle Tests OK');
