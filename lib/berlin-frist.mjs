// Stunden bis Termin in Europe/Berlin-Wandzeit (DST-korrekt via Intl).
// new Date("YYYY-MM-DDTHH:MM") würde in Vercel-TZ (UTC) parsen → bis ~2h Versatz.
// Vorlage: supabase/functions/cancel-or-refund/frist.ts.
export function berlinOffsetMinutes(utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asUtcOfBerlinWall = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return Math.round((asUtcOfBerlinWall - utcMs) / 60000);
}
export function hoursUntilBerlin(date, time, nowMs = Date.now()) {
  if (!date) return 0;
  const [y, mo, da] = date.split('-').map(Number);
  const [h, m] = (time ?? '00:00').split(':').map(Number);
  const asIfUtc = Date.UTC(y, (mo ?? 1) - 1, da, h ?? 0, m ?? 0);
  const startMs = asIfUtc - berlinOffsetMinutes(asIfUtc) * 60000;
  return (startMs - nowMs) / 3600000;
}
