// Sammel-Prüflauf aller Portal-Tests — Stabilisierungs-Vorhaben Paket 1.5 (03.07.2026).
// Lauf: node landingpage/scripts/run-portal-tests.cjs  (oder: npm test im landingpage/-Ordner)
//
// Neue Portal-Testdateien hier eintragen — der Lauf ist Pflichtteil des
// Ein-Befehl-Prüflaufs (Paket 1.6) und der Pre-Build-Checkliste.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const TESTS = [
  'test-no-show-format.cjs',   // Geld-Stände/Fristen No-Show (B-2026-06-18-05 u.a.)
  'test-berlin-frist.mjs',     // 24h-Verschiebe-Frist Europe/Berlin (B-2026-06-19-02-Umfeld)
  'test-status-parity.cjs',    // Status-Übersetzung Portal ↔ DB-Kanon (Paket 1.3)
  'test-shared-modules.cjs',   // constants/design-tokens/audit-log (Paket 1.5)
];

let failed = 0;
for (const t of TESTS) {
  const file = path.join(__dirname, t);
  process.stdout.write(`── ${t}\n`);
  try {
    execFileSync(process.execPath, [file], { stdio: 'inherit' });
  } catch {
    failed++;
    console.error(`✘ ${t} ROT`);
  }
}

if (failed > 0) {
  console.error(`\n✘ Portal-Tests: ${failed} von ${TESTS.length} Testdateien ROT`);
  process.exit(1);
}
console.log(`\n✔ Portal-Tests komplett grün (${TESTS.length} Testdateien)`);
