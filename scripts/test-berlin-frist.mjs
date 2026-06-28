import assert from 'node:assert';
import { hoursUntilBerlin } from '../lib/berlin-frist.mjs';

// Sommer (MESZ, +2h): 12:00 Berlin = 10:00 UTC. now 09:00 UTC → 1h.
assert.strictEqual(
  Math.round(hoursUntilBerlin('2026-07-01', '12:00', Date.UTC(2026, 6, 1, 9, 0)) * 100) / 100,
  1, 'Sommer-Offset falsch',
);
// Winter (MEZ, +1h): 12:00 Berlin = 11:00 UTC. now 09:00 UTC → 2h.
assert.strictEqual(
  Math.round(hoursUntilBerlin('2026-01-01', '12:00', Date.UTC(2026, 0, 1, 9, 0)) * 100) / 100,
  2, 'Winter-Offset falsch',
);
// Vergangenheit → negativ.
assert.ok(hoursUntilBerlin('2026-01-01', '08:00', Date.UTC(2026, 0, 1, 9, 0)) < 0, 'Vergangenheit nicht negativ');
console.log('berlin-frist OK');
