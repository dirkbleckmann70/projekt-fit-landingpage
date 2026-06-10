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

console.log('no-show-format: alle Tests OK');
