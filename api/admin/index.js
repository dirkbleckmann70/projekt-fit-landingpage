// ============================================================================
// Zentrale Admin API – Alle Admin-Endpunkte in einer Serverless Function
// Route: /api/admin?action=<action>
//
// Vercel Hobby Plan erlaubt max 12 Functions.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import { readFileSync } from 'fs';

// Documents-Action braucht bodyParser: false → wird per config gesteuert
export const config = { api: { bodyParser: false } };

// B-2026-06-19-02 / B-2026-06-28-02: Stunden bis Termin in Europe/Berlin-Wandzeit
// (DST-korrekt via Intl). INLINE statt Import aus ../../lib/berlin-frist.mjs:
// Vercel buendelt eine lokale .mjs aus ../../lib/ NICHT zuverlaessig in diese
// Serverless-Function (package.json ohne "type":"module") → FUNCTION_INVOCATION_FAILED,
// das legte das ganze Admin-Portal lahm. Logik identisch zu lib/berlin-frist.mjs
// (dort vom Unit-Test geprueft) — bei Aenderung BEIDE Stellen anpassen.
function berlinOffsetMinutes(utcMs) {
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
function hoursUntilBerlin(date, time, nowMs = Date.now()) {
  if (!date) return 0;
  const [y, mo, da] = date.split('-').map(Number);
  const [h, m] = (time ?? '00:00').split(':').map(Number);
  const asIfUtc = Date.UTC(y, (mo ?? 1) - 1, da, h ?? 0, m ?? 0);
  const startMs = asIfUtc - berlinOffsetMinutes(asIfUtc) * 60000;
  return (startMs - nowMs) / 3600000;
}

const ALLOWED_ORIGINS = [
  'https://projektfit.net',
  'https://www.projektfit.net',
  'http://localhost:3000',
  'http://localhost:5500',
];

function getCorsOrigin(req) {
  const origin = req.headers?.origin || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;
  if (!action) {
    return res.status(400).json({ error: 'action Parameter fehlt. Beispiel: /api/admin?action=data&type=all_trainers' });
  }

  // ── Auth Check ──
  // Bestimmte Endpoints sind auch fuer Trainer zugaenglich
  const trainerAllowedTypes = ['customer_names', 'booking_locations', 'trainer_audit_log', 'no_show_customer_phone', 'gt_participant_contacts'];
  const isTrainerAllowedRead = action === 'data' && req.method === 'GET' && trainerAllowedTypes.includes(req.query.type);
  const isTrainerAllowedWrite = (action === 'bookings' && req.method === 'PUT') ||
                               (action === 'update-participant' && req.method === 'PUT') ||
                               (action === 'gt_kurs_abschluss' && req.method === 'PUT');
  const isCustomerAllowed = ['location-accept', 'location-reject', 'reschedule-accept', 'reschedule-reject'].includes(action) && req.method === 'PUT';
  const isTrainerAllowed = isTrainerAllowedRead || isTrainerAllowedWrite || isCustomerAllowed;

  if (isTrainerAllowed) {
    const authError = await verifyAuthenticated(req);
    if (authError) return res.status(401).json({ error: authError });
  } else {
    const adminAuthError = await verifyAdmin(req);
    if (adminAuthError) return res.status(401).json({ error: adminAuthError });
  }

  const supabase = getServiceClient();

  try {
    switch (action) {

      // ═══════════════════════════════════════════════════════════════════
      // DATA – GET: KPIs, Trainer, Buchungen, Gruppen, etc.
      // ═══════════════════════════════════════════════════════════════════
      case 'data': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return await handleData(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // TRAINERS – POST (erstellen) + PUT (aktualisieren)
      // ═══════════════════════════════════════════════════════════════════
      case 'trainers': {
        if (req.method === 'POST') return await handleTrainersPost(req, res, supabase);
        if (req.method === 'PUT') return await handleTrainersPut(req, res, supabase);
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // ACTIVATE-TRAINER – POST
      // ═══════════════════════════════════════════════════════════════════
      case 'activate-trainer': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleActivateTrainer(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // DEACTIVATE-TRAINER – POST
      // ═══════════════════════════════════════════════════════════════════
      case 'deactivate-trainer': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleDeactivateTrainer(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // DELETE-TRAINER – DELETE
      // ═══════════════════════════════════════════════════════════════════
      case 'delete-trainer': {
        if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
        return await handleDeleteTrainer(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // BOOKINGS – PUT (Status + paid ändern)
      // ═══════════════════════════════════════════════════════════════════
      case 'bookings': {
        if (req.method === 'PUT') return await handleBookingsPut(req, res, supabase);
        if (req.method === 'DELETE') return await handleBookingsDelete(req, res, supabase);
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // RESCHEDULE-ACCEPT – PUT (Kunde nimmt Terminvorschlag an)
      // ═══════════════════════════════════════════════════════════════════
      case 'reschedule-accept': {
        if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
        return await handleRescheduleAccept(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // RESCHEDULE-REJECT – PUT (Kunde lehnt Terminvorschlag ab)
      // ═══════════════════════════════════════════════════════════════════
      case 'reschedule-reject': {
        if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
        return await handleRescheduleReject(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // CUSTOMERS – GET (alle) + POST (erstellen) + PUT (aktualisieren) + DELETE (löschen)
      // ═══════════════════════════════════════════════════════════════════
      case 'customers': {
        return await handleCustomers(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // UPDATE-PARTICIPANT – PUT (attended, customer_paid, trainer_paid)
      // ═══════════════════════════════════════════════════════════════════
      case 'update-participant': {
        if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
        return await handleUpdateParticipant(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // GT-KURS-ABSCHLUSS – PUT (Trainer "Kurs abschließen" + Admin-Notfall)
      // Setzt group_classes.durchfuehrung_status='abgeschlossen' + durchgefuehrt_am
      // und nimmt die gt_teilnahme-Buchungen atomisch auf 'abgeschlossen' mit.
      // ═══════════════════════════════════════════════════════════════════
      case 'gt_kurs_abschluss': {
        if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const caller = await getCallerInfo(req);
        if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

        const groupClassId = body.group_class_id;
        if (!groupClassId || !/^[0-9a-f-]{36}$/i.test(groupClassId)) {
          return res.status(400).json({ error: 'group_class_id (UUID) erforderlich' });
        }

        const { data: gc, error: gcErr } = await supabase
          .from('group_classes').select('id, trainer_id, durchfuehrung_status').eq('id', groupClassId).maybeSingle();
        if (gcErr || !gc) return res.status(404).json({ error: 'Kurs nicht gefunden' });

        // Ownership: Admin darf alles; Trainer nur eigenen Kurs.
        if (caller.actorType !== 'admin') {
          const { data: tp } = await supabase.from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
          if (!tp || tp.id !== gc.trainer_id) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kurs' });
        }

        if (!['geplant', 'laeuft'].includes(gc.durchfuehrung_status)) {
          return res.status(409).json({ error: `Kurs bereits ${gc.durchfuehrung_status}` });
        }

        const nowIso = new Date().toISOString();
        // 1) Kurs abschließen — atomarer Race-/Doppelklick-Schutz via .in()
        const { data: upd, error: updErr } = await supabase
          .from('group_classes')
          .update({ durchfuehrung_status: 'abgeschlossen', durchgefuehrt_am: nowIso })
          .eq('id', groupClassId)
          .in('durchfuehrung_status', ['geplant', 'laeuft'])
          .select('id');
        if (updErr) return res.status(500).json({ error: updErr.message });
        if (!upd || upd.length === 0) return res.status(409).json({ error: 'Abschluss nicht möglich (Status geändert)' });

        // 2) Teilnehmer-Buchungen mitnehmen (Kunde sieht "fand statt"). Nicht-stornierte gt_teilnahme.
        const { error: partErr } = await supabase
          .from('bookings')
          .update({ status: 'abgeschlossen', completed_at: nowIso })
          .eq('group_class_id', groupClassId)
          .eq('art', 'gt_teilnahme')
          .not('status', 'in', '("storniert","abgeschlossen")')
          .select('id');
        if (partErr) { console.error('gt_kurs_abschluss participant-sync (best-effort):', partErr.message); }

        return res.status(200).json({ ok: true, group_class_id: groupClassId });
      }

      // ═══════════════════════════════════════════════════════════════════
      // ADD-PARTICIPANT – POST
      // ═══════════════════════════════════════════════════════════════════
      case 'add-participant': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleAddParticipant(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // GROUPS – POST + PUT + DELETE
      // ═══════════════════════════════════════════════════════════════════
      case 'groups': {
        return await handleGroups(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // GROUP_SERIES – POST: Serientermin (mehrere GTs auf einmal)
      // ═══════════════════════════════════════════════════════════════════
      case 'group_series': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const { name, trainer_id, city, location_name, location_address,
                equipment, time, duration_minutes, max_participants,
                price_per_person_cents, dates } = body;

        if (!name || !trainer_id || !city || !time || !dates || !dates.length) {
          return res.status(400).json({ error: 'name, trainer_id, city, time, dates[] required' });
        }

        const crypto = await import('crypto');
        const series_id = crypto.randomUUID();

        const rows = dates.map(d => ({
          name,
          trainer_id,
          city,
          location_name: location_name || null,
          location_address: location_address || null,
          scheduled_date: d,
          scheduled_time: time + ':00',
          start_time: time + ':00',
          // B-2026-06-04-04: getDay() = 0-6 (So=0) → erfuellt CHECK group_classes_day_of_week_check
          // (0..6). Das alte `|| 7` machte Sonntag zu 7 → Constraint-Verletzung beim Serien-Speichern.
          // day_of_week ist bei datums-fixen Kursen ohnehin nur Metadaten (Anzeige via scheduled_date).
          day_of_week: new Date(d + 'T12:00:00Z').getDay(),
          duration_minutes: duration_minutes || 60,
          max_participants: max_participants || 12,
          price_per_person_cents: Math.round(price_per_person_cents),
          is_active: true,
          series_id,
          equipment: Array.isArray(equipment) ? equipment : null,
        }));

        const { data, error } = await supabase.from('group_classes').insert(rows).select();
        if (error) throw error;

        return res.json({ success: true, count: rows.length, series_id });
      }

      // ═══════════════════════════════════════════════════════════════════
      // LOCATIONS – POST + PUT
      // ═══════════════════════════════════════════════════════════════════
      case 'locations': {
        return await handleLocations(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // TRAINER-AVATAR – POST (hochladen) + DELETE (löschen)
      // ═══════════════════════════════════════════════════════════════════
      case 'trainer-avatar': {
        return await handleTrainerAvatar(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // LICENSE – GET (signierte URL) + DELETE (Datei löschen)
      // ═══════════════════════════════════════════════════════════════════
      case 'license': {
        return await handleLicense(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // GET-FILE-URL – POST (signierte URL für beliebigen Bucket)
      // ═══════════════════════════════════════════════════════════════════
      case 'get-file-url': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleGetFileUrl(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // DOCUMENTS – GET + POST (multipart) + DELETE
      // ═══════════════════════════════════════════════════════════════════
      case 'documents': {
        return await handleDocuments(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // DELETE-STORAGE-FILE – POST (Datei aus beliebigem Bucket löschen)
      // ═══════════════════════════════════════════════════════════════════
      case 'delete-storage-file': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const { path, bucket } = body;
        if (!path) return res.status(400).json({ error: 'path ist erforderlich' });
        const { error: delErr } = await supabase.storage.from(bucket || 'trainer-documents').remove([path]);
        if (delErr) throw delErr;
        return res.json({ success: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // TRAINER-AVAILABILITY – GET + POST
      // ═══════════════════════════════════════════════════════════════════
      case 'trainer-availability': {
        if (req.method === 'GET') return await handleTrainerAvailabilityGet(req, res, supabase);
        if (req.method === 'POST') return await handleTrainerAvailabilityPost(req, res, supabase);
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // TESTERS – GET + POST + PUT + DELETE
      // ═══════════════════════════════════════════════════════════════════
      case 'testers': {
        return await handleTesters(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // INVOICES – GET (Liste mit optionalem year/type Filter)
      // ═══════════════════════════════════════════════════════════════════
      case 'invoices': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        let query = supabase
          .from('invoices')
          .select('*')
          .order('issued_at', { ascending: false });
        if (req.query.year) {
          const y = parseInt(req.query.year);
          query = query
            .gte('issued_at', `${y}-01-01`)
            .lt('issued_at', `${y + 1}-01-01`);
        }
        if (req.query.type && req.query.type !== 'all') {
          query = query.eq('invoice_type', req.query.type);
        }
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ data });
      }

      // ═══════════════════════════════════════════════════════════════════
      // OPEN_PAYMENTS – GET (Teilspec 2): Liste aller Buchungen mit
      // flag_zahlung_offen=true (Kartenzahlung gescheitert, Bar-Klaerung offen).
      // Sortiert nach zahlung_offen_seit (aelteste zuerst).
      // ═══════════════════════════════════════════════════════════════════
      case 'open_payments': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const { data, error } = await supabase
          .from('bookings')
          .select(`
            id, status, flag_zahlung_offen, zahlung_offen_seit, bar_gemeldet_am, bar_gemeldet_durch,
            price_cents, final_price_cents, art, customer_id, trainer_id,
            scheduled_date, scheduled_time,
            customers!inner(full_name, email),
            trainer:trainer_profiles!bookings_trainer_id_fkey(full_name, email)
          `)
          .eq('flag_zahlung_offen', true)
          // B-2026-06-10-01 A7: stornierte Buchungen mit noch gesetztem
          // flag_zahlung_offen duerfen NICHT als offene Forderung erscheinen.
          .not('status', 'in', '("storniert","cancelled","refunded","cancelled_by_trainer","fully_cancelled")')
          .order('zahlung_offen_seit', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        // GT-Teilnahmen bekommen gp_-Prefix auf die ID (Buchungs-Integrations-Karte §4),
        // damit das Frontend zwischen PT-Buchung und GT-Teilnahme unterscheiden kann.
        // Status durch Frontend-Bruecke schicken — bei flag_zahlung_offen=true liefert
        // mapStatusForFrontend automatisch 'payment_open' (Task 26 Bridge),
        // konsistent zu den anderen Buchungs-Endpunkten.
        // days_open: NULL-Defense fuer Datensaetze ohne zahlung_offen_seit
        // (sollte laut Trigger nie vorkommen, aber Defense-in-Depth).
        const rows = (data ?? []).map((r) => ({
          ...withFrontendStatus(r),
          id: r.art === 'gt_teilnahme' ? `gp_${r.id}` : r.id,
          days_open: r.zahlung_offen_seit
            ? Math.floor((Date.now() - new Date(r.zahlung_offen_seit).getTime()) / 86_400_000)
            : null,
        }));
        return res.status(200).json({ data: rows });
      }

      // ═══════════════════════════════════════════════════════════════════
      // TRAINER_DEBTS – GET (Teilspec 2): Aggregierte Summe cash_pulsly_owed_cents
      // pro Trainer. Zeigt welche Trainer Bargeld vom Kunden eingenommen haben,
      // das Pulsly noch nicht abgefuehrt wurde. Sortiert nach Hoehe der Schuld
      // absteigend (UX: groesste Posten zuerst).
      // ═══════════════════════════════════════════════════════════════════
      case 'trainer_debts': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const { data, error } = await supabase
          .from('bookings')
          .select('trainer_id, cash_pulsly_owed_cents, trainer:trainer_profiles!bookings_trainer_id_fkey(id, full_name, email)')
          .gt('cash_pulsly_owed_cents', 0);
        if (error) return res.status(500).json({ error: error.message });

        // Aggregation pro Trainer
        const map = new Map();
        for (const row of (data ?? [])) {
          const tId = row.trainer_id;
          if (!tId) continue; // NULL-Defense: verwaiste Buchung ohne Trainer ignorieren
          if (!map.has(tId)) {
            map.set(tId, {
              trainer_id: tId,
              trainer_name: row.trainer?.full_name ?? '(unbekannt)',
              trainer_email: row.trainer?.email ?? null,
              total_owed_cents: 0,
              count: 0,
            });
          }
          const entry = map.get(tId);
          entry.total_owed_cents += row.cash_pulsly_owed_cents;
          entry.count += 1;
        }
        // Sortierung: hoechste Schulden zuerst (UX-Verbesserung gegenueber Plan)
        return res.status(200).json({
          data: Array.from(map.values()).sort((a, b) => b.total_owed_cents - a.total_owed_cents),
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // MARK-CASH – POST (Teilspec 2): Admin-Override fuer Bar-Zahlungs-Meldung.
      // Setzt bookings.bar_gemeldet_am + bar_gemeldet_durch (= trainerId, FK auf
      // trainer_profiles.id) im Namen des Trainers. Nutzt das gleiche Audit-Schema
      // wie mark-cash-by-trainer (action='gemeldet_durch_trainer'), markiert aber
      // via details.admin_override=true, dass der Admin im Trainer-Namen gemeldet
      // hat. KEIN paid=true — das macht weiterhin der Admin per separatem
      // verify-cash (process-cash-payment Edge Function).
      //
      // cash_payment_audit-CHECK erlaubt nur 4 action-Werte (gemeldet_durch_trainer,
      // verifiziert_durch_admin, verrechnet, storniert). Es gibt KEIN
      // gemeldet_durch_admin — deshalb der admin_override-Marker in details.
      // ═══════════════════════════════════════════════════════════════════
      case 'mark-cash': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const bookingId = stripGpPrefix(body?.bookingId ?? '');
        const trainerId = body?.trainerId;
        if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return res.status(400).json({ error: 'invalid bookingId' });
        if (!/^[0-9a-f-]{36}$/i.test(trainerId ?? '')) return res.status(400).json({ error: 'invalid trainerId' });

        // Admin-Identitaet aus dem Bearer-Token (verifyAdmin oben hat schon geprueft,
        // dass der Token gueltig + role=admin ist). Wir holen die user.id fuer
        // cash_payment_audit.actor_id direkt aus dem Token.
        const authHeader = req.headers.authorization ?? '';
        const token = authHeader.replace('Bearer ', '');
        const { data: adminAuth } = await supabase.auth.getUser(token);
        const adminUserId = adminAuth?.user?.id ?? null;
        const adminEmail = adminAuth?.user?.email ?? null;

        // Buchung laden, Konsistenz pruefen
        const { data: booking, error: bErr } = await supabase
          .from('bookings')
          .select('id, trainer_id, flag_zahlung_offen, final_price_cents, price_cents, bar_gemeldet_am')
          .eq('id', bookingId)
          .single();
        if (bErr || !booking) return res.status(404).json({ error: 'booking not found' });
        if (!booking.flag_zahlung_offen) return res.status(409).json({ error: 'booking has no open payment flag' });
        if (booking.trainer_id !== trainerId) return res.status(409).json({ error: 'trainerId mismatch with booking.trainer_id' });
        if (booking.bar_gemeldet_am) return res.status(409).json({ error: 'cash already reported' });

        const amountCents = booking.final_price_cents ?? booking.price_cents;

        // bar_gemeldet_*-UPDATE (gleicher Schritt wie mark-cash-by-trainer Edge
        // Function). .select() Pflicht (RLS-Silent-Fail-Schutz, CLAUDE.md-Gotcha).
        // Pre-Push-Review K-1: Atomic-Lock via `.is('bar_gemeldet_am', null)`-Filter
        // — verhindert Race-Condition bei Doppel-Click. Wenn ein paralleler Call
        // den Slot bereits belegt hat, gibt PostgREST 0 Zeilen zurueck und wir
        // antworten mit 409 statt mit Doppel-Audit.
        const { data: updRows, error: updErr } = await supabase
          .from('bookings')
          .update({
            bar_gemeldet_am: new Date().toISOString(),
            bar_gemeldet_durch: trainerId,
          })
          .eq('id', bookingId)
          .is('bar_gemeldet_am', null)
          .select('id');
        if (updErr) return res.status(500).json({ error: updErr.message });
        if (!updRows || updRows.length === 0) {
          // Atomic-Lock verloren: anderer Call war zuerst (oder bar_gemeldet_am
          // wurde zwischen Vor-Check und UPDATE belegt). Verhindert Doppel-Audit.
          return res.status(409).json({ error: 'cash already reported (race-condition lost)' });
        }

        // cash_payment_audit-Insert (Best-Effort: Audit-Fehler darf nicht den
        // bereits erfolgten Bar-Melden-Schritt mit HTTP 500 ueberschreiben —
        // gleiches Pattern wie process-cash-payment + mark-cash-by-trainer).
        // pulsly_anteil_cents=0 beim Melden (wird beim Verifizieren gefuellt,
        // analog zur Trainer-Meldung).
        try {
          const { error: auditErr } = await supabase.from('cash_payment_audit').insert({
            booking_id: bookingId,
            action: 'gemeldet_durch_trainer', // CHECK erlaubt nur diese 4 Werte
            actor_type: 'admin',
            actor_id: adminUserId,
            amount_cents: amountCents,
            pulsly_anteil_cents: 0,
            details: {
              admin_override: true,
              admin_email: adminEmail,
              on_behalf_of_trainer: trainerId,
            },
          });
          if (auditErr) console.error('cash_payment_audit insert failed (non-blocking):', auditErr);
        } catch (e) {
          console.error('cash_payment_audit insert threw (non-blocking):', e);
        }

        return res.status(200).json({ ok: true, bookingId, trainerId });
      }

      // ═══════════════════════════════════════════════════════════════════
      // VERIFY-CASH – POST (Teilspec 2): Pass-through zur process-cash-payment
      // Edge Function (Task 14). Reicht den Admin-Bearer-Token weiter, die
      // Function prueft intern via auth.getUser() + role=admin. apikey wird
      // mit Service-Role gefuellt (Gateway-Anforderung).
      // ═══════════════════════════════════════════════════════════════════
      case 'verify-cash': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const bookingId = stripGpPrefix(body?.bookingId ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return res.status(400).json({ error: 'invalid bookingId' });

        const adminToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
        const resp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/process-cash-payment`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${adminToken}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({ booking_id: bookingId }),
        });
        const respBody = await resp.json().catch(() => ({}));
        return res.status(resp.status).json(respBody);
      }

      // ═══════════════════════════════════════════════════════════════════
      // SEND-PAYMENT-REMINDER – POST (Teilspec 2): manueller Versand der
      // „offene Zahlung"-Erinnerungsmail an den Kunden. Replay-Schutz: kein
      // Doppel-Click innerhalb von 5 Minuten (verhindert versehentliche
      // Doppel-Mails durch nervoeses Mehrfach-Klicken). Audit-Eintrag VOR
      // Mail-Versand (DB-Update vor externer Aktion — Memory
      // feedback_workflow_safety).
      // ═══════════════════════════════════════════════════════════════════
      case 'send-payment-reminder': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const bookingId = stripGpPrefix(body?.bookingId ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return res.status(400).json({ error: 'invalid bookingId' });

        // Buchung + Customer + Trainer laden
        const { data: b, error: bErr } = await supabase
          .from('bookings')
          .select(`
            id, scheduled_date, scheduled_time, price_cents, final_price_cents, flag_zahlung_offen,
            customers!inner(full_name, first_name, last_name, email),
            trainer:trainer_profiles!bookings_trainer_id_fkey(full_name)
          `)
          .eq('id', bookingId)
          .single();
        if (bErr || !b) return res.status(404).json({ error: 'booking not found' });
        if (!b.flag_zahlung_offen) return res.status(409).json({ error: 'booking has no open payment flag' });

        const customerEmail = b.customers?.email;
        if (!customerEmail) return res.status(409).json({ error: 'customer has no email' });

        // Replay-Schutz: kein Doppel-Click innerhalb 5 Minuten.
        // Filter auf manuelle Erinnerung (details.manual=true) — automatische
        // Cron-Erinnerungen aus payment-open-reminder (details.day_index)
        // sollen den manuellen Click NICHT blockieren.
        const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
        const { data: replay } = await supabase
          .from('booking_audit')
          .select('id')
          .eq('booking_id', bookingId)
          .eq('action', 'zahlung_offen_erinnerung_gesendet')
          .eq('details->>manual', 'true')
          .gte('created_at', fiveMinAgo)
          .limit(1);
        if (replay && replay.length > 0) {
          return res.status(409).json({ error: 'reminder already sent within last 5 minutes' });
        }

        // Daten fuer Mail-Body zusammenbauen (Konventionen aus CLAUDE.md +
        // payment-open-reminder Edge Function: deutsches Datumsformat
        // DD.MM.YYYY, Komma-Trenner fuer Betrag, Fallback-Kaskade fuer
        // Kunden-Namen).
        const customerName = (b.customers?.full_name?.trim())
          || [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(' ').trim()
          || b.customers?.email
          || 'Kunde';
        const trainerName = b.trainer?.full_name ?? 'deinem Trainer';
        const dateParts = (b.scheduled_date ?? '').split('-'); // YYYY-MM-DD
        const scheduledDate = dateParts.length === 3
          ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`
          : '—';
        const timeParts = (b.scheduled_time ?? '').split(':'); // HH:MM[:SS]
        const scheduledTime = timeParts.length >= 2 ? `${timeParts[0]}:${timeParts[1]}` : '';
        const cents = b.final_price_cents ?? b.price_cents ?? 0;
        const amountEur = (cents / 100).toFixed(2).replace('.', ',');

        const htmlBody = `<p>Hallo ${escapeHtml(customerName)},</p>
<p>fuer deine Buchung am ${scheduledDate}${scheduledTime ? ' um ' + scheduledTime + ' Uhr' : ''} bei ${escapeHtml(trainerName)} ist die Karten-Belastung von <strong>${amountEur} EUR</strong> offen.</p>
<p>Bitte aktualisiere deine Zahlungsmethode in der Pulsly-App oder uebergib den Betrag bar an deinen Trainer.</p>
<p>Bei Fragen: <a href="mailto:info@pulsly.de">info@pulsly.de</a></p>
<p>Buchungs-ID: ${bookingId}</p>
<p>Pulsly</p>`;

        // Audit-Eintrag VOR Mail-Versand (Workflow-Safety: DB-Lock vor externer
        // Aktion — bei Mail-Versand-Fehler bleibt der Audit-Eintrag stehen und
        // sperrt den naechsten Click 5 min lang; das verhindert Spam durch
        // Retry-Klick-Loops bei dauerhaftem Brevo-Ausfall).
        // Pre-Push-Review K-2: KEIN try/catch hier — wenn der Audit-Insert
        // fehlschlaegt, MUSS der Endpunkt 500 zurueckgeben OHNE Mail zu senden.
        // Sonst waere der Replay-Schutz wirkungslos: User wuerde nochmal klicken,
        // Audit haengt schief, zweite Mail rausginge unkontrolliert.
        const { error: auditInsertErr } = await supabase.from('booking_audit').insert({
          booking_id: bookingId,
          action: 'zahlung_offen_erinnerung_gesendet',
          actor_type: 'admin',
          details: { manual: true, amount_cents: cents },
        });
        if (auditInsertErr) {
          console.error('booking_audit insert failed — abort before send-email:', auditInsertErr);
          return res.status(500).json({ error: 'audit insert failed, mail not sent', detail: auditInsertErr.message });
        }

        // Mail-Versand via send-email Edge Function.
        // send-email akzeptiert { to, subject, htmlBody } (htmlBody — NICHT html).
        // B-2026-05-14-55 Fix: SERVICE_ROLE_JWT-Fallback fuer Bearer-Header,
        // damit Gateway-JWT-Check bei spaeterer Umstellung nicht still 401 liefert.
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
        const bearerKey = process.env.SERVICE_ROLE_JWT ?? serviceKey;
        const resp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${bearerKey}`,
            apikey: serviceKey,
          },
          body: JSON.stringify({
            to: customerEmail,
            subject: `Pulsly: Offener Betrag ${amountEur} EUR`,
            htmlBody,
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          return res.status(500).json({ error: 'send-email failed', detail: errText });
        }
        return res.status(200).json({ ok: true });
      }

      // ═══════════════════════════════════════════════════════════════════
      // ISSUE-OPEN-INVOICE – POST (Teilspec 2): Stellt eine offene Forderung
      // als reguläre Rechnung aus (Task 20: type='offene_forderung'). Pass-through
      // zur generate-invoice Edge Function mit Service-Role-Auth (Function
      // schreibt invoices + bookings.invoice_id und braucht admin-Rechte).
      //
      // generate-invoice verlangt fuer offene_forderung: booking_id + amount_cents.
      // amount_cents = bookings.final_price_cents ?? price_cents (Brutto, inkl. USt).
      // ═══════════════════════════════════════════════════════════════════
      case 'issue-open-invoice': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const bookingId = stripGpPrefix(body?.bookingId ?? '');
        if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return res.status(400).json({ error: 'invalid bookingId' });

        // amount_cents aus der Buchung ermitteln (final_price_cents bevorzugt,
        // sonst price_cents — wie ueberall in der Teilspec-2-Welt).
        const { data: bk, error: bkErr } = await supabase
          .from('bookings')
          .select('id, price_cents, final_price_cents, flag_zahlung_offen')
          .eq('id', bookingId)
          .single();
        if (bkErr || !bk) return res.status(404).json({ error: 'booking not found' });
        if (!bk.flag_zahlung_offen) return res.status(409).json({ error: 'booking has no open payment flag' });
        const amountCents = bk.final_price_cents ?? bk.price_cents;
        if (!amountCents || amountCents <= 0) return res.status(409).json({ error: 'booking has no positive amount' });

        // Pre-Push-Review W-4: Idempotenz-Check. Ohne diesen Pre-Check wuerde
        // ein Doppel-Klick auf „Rechnung stellen" zwei `offene_forderung`-
        // Rechnungen + zwei Mails erzeugen — generate-invoice hat keinen
        // eigenen Idempotenz-Schutz auf bookings.invoice_id.
        const { data: existingInv } = await supabase
          .from('invoices')
          .select('id')
          .eq('booking_id', bookingId)
          .eq('type', 'offene_forderung')
          .limit(1);
        if (existingInv && existingInv.length > 0) {
          return res.status(409).json({ error: 'invoice already issued for this booking', invoice_id: existingInv[0].id });
        }

        // Service-Role-Auth (klassisches eyJ-JWT in Vercel-Env — generate-invoice
        // ist deployed MIT JWT-Verify, akzeptiert also nur einen gueltigen JWT,
        // und Service-Role hat die noetigen DB-Rechte fuer invoices/booking-Updates).
        // B-2026-05-14-55 Fix: SERVICE_ROLE_JWT zuerst (klassischer JWT), Fallback
        // auf sb_secret_*-Key.
        const key = process.env.SERVICE_ROLE_JWT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
        const resp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/generate-invoice`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${key}`,
            apikey: key,
          },
          body: JSON.stringify({
            type: 'offene_forderung', // Plan-Bug: Plan-Step 5 schreibt 'offene_forderung_rechnung' — korrekter Wert ist 'offene_forderung' (Task 20)
            booking_id: bookingId,
            amount_cents: amountCents,
          }),
        });
        const respBody = await resp.json().catch(() => ({}));
        return res.status(resp.status).json(respBody);
      }

      // ═══════════════════════════════════════════════════════════════════
      // MANUAL-DEBT-OFFSET – POST (Teilspec 2 Task 29): Admin markiert alle
      // offenen Bar-Schulden eines Trainers (cash_pulsly_owed_cents > 0) als
      // „manuell ausgeglichen". Setzt pro Buchung cash_pulsly_owed_cents=0
      // mit Atomic-Lock (.gt-Filter im UPDATE schliesst Race-Bedingungen aus)
      // und schreibt einen cash_payment_audit-Eintrag (action='verrechnet').
      //
      // cash_payment_audit-CHECK erlaubt action='verrechnet' + actor_type='admin'
      // (live verifiziert 12.05.). amount_cents + pulsly_anteil_cents bekommen
      // den gleichen Wert — Pulsly bekommt den vollen offenen Betrag rechnerisch
      // zugeschlagen, ohne dass tatsaechlich Geld geflossen ist.
      //
      // Best-Effort beim Audit-Insert (CLAUDE.md _shared-Helper-Pattern):
      // Audit-Fehler darf den bereits geschriebenen UPDATE nicht ueberschreiben.
      // ═══════════════════════════════════════════════════════════════════
      case 'manual-debt-offset': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        const body = await getBody(req);
        const trainerId = body?.trainerId;
        if (!/^[0-9a-f-]{36}$/i.test(trainerId ?? '')) return res.status(400).json({ error: 'invalid trainerId' });

        // Admin-Identitaet aus dem Bearer-Token holen (gleicher Pattern wie
        // case 'mark-cash'). adminUserId geht in cash_payment_audit.actor_id,
        // adminEmail in details.admin_email fuer spaetere Nachvollziehbarkeit.
        const authHeader = req.headers.authorization ?? '';
        const token = authHeader.replace('Bearer ', '');
        const { data: adminAuth } = await supabase.auth.getUser(token);
        const adminUserId = adminAuth?.user?.id ?? null;
        const adminEmail = adminAuth?.user?.email ?? null;

        // Alle offenen Schulden des Trainers laden
        const { data: debts, error: dErr } = await supabase
          .from('bookings')
          .select('id, cash_pulsly_owed_cents')
          .eq('trainer_id', trainerId)
          .gt('cash_pulsly_owed_cents', 0);
        if (dErr) return res.status(500).json({ error: dErr.message });
        if (!debts || debts.length === 0) return res.status(409).json({ error: 'no open debts for trainer' });

        // Pro Buchung: cash_pulsly_owed_cents=0 + audit-Eintrag.
        // Atomic-Lock via .gt('cash_pulsly_owed_cents', 0) im UPDATE: wenn
        // ein paralleler Call die Schuld bereits ausgeglichen hat, kommt 0
        // Zeilen zurueck → wir zaehlen das als „failed" und ueberspringen
        // den Audit-Eintrag (kein Doppel-Audit). .select() ist RLS-Pflicht.
        let success = 0;
        let failed = 0;
        for (const d of debts) {
          const { data: updRows, error: updErr } = await supabase
            .from('bookings')
            .update({ cash_pulsly_owed_cents: 0 })
            .eq('id', d.id)
            .gt('cash_pulsly_owed_cents', 0)
            .select('id');
          if (updErr || !updRows || updRows.length === 0) {
            failed++;
            continue;
          }
          // cash_payment_audit-Eintrag (Best-Effort: Fehler hier kippt nicht
          // den schon geschriebenen UPDATE — gleiches Pattern wie mark-cash).
          try {
            const { error: auditErr } = await supabase.from('cash_payment_audit').insert({
              booking_id: d.id,
              action: 'verrechnet', // CHECK-konform (live verifiziert)
              actor_type: 'admin',
              actor_id: adminUserId,
              amount_cents: d.cash_pulsly_owed_cents,
              pulsly_anteil_cents: d.cash_pulsly_owed_cents,
              details: {
                manual_offset: true,
                admin_email: adminEmail,
                on_behalf_of_trainer: trainerId,
              },
            });
            if (auditErr) console.error('cash_payment_audit insert failed (non-blocking):', auditErr);
          } catch (e) {
            console.error('cash_payment_audit insert threw (non-blocking):', e);
          }
          success++;
        }

        return res.status(200).json({ ok: true, success, failed, totalDebts: debts.length });
      }

      // ═══════════════════════════════════════════════════════════════════
      // COMPANY-SETTINGS – GET (laden) + PUT (speichern)
      // Teilspec 2 Task 27a Refactor: PUT mit Allow-Liste statt freiem ...body-Spread
      // (Sicherheit: kein Override von id/system-Spalten via Frontend).
      // Allow-Liste deckt sowohl die alten Firmendaten-Felder (company_name,
      // street, iban, ...) als auch die neuen Teilspec-2-Settings ab
      // (processing_fee_percent, gt_threshold_default, ...).
      // ═══════════════════════════════════════════════════════════════════
      case 'company-settings': {
        if (req.method === 'GET') {
          const { data, error } = await supabase
            .from('company_settings')
            .select('*')
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          return res.json({ data: data || {} });
        }
        if (req.method === 'PUT') {
          // Allow-Liste: nur diese Keys duerfen vom Frontend aus geschrieben werden.
          // Schuetzt id, updated_at (System-Spalten) sowie generell vor
          // unbekannten Free-Form-Spalten. Bei Schema-Erweiterung MUSS diese
          // Liste mitgepflegt werden (sonst kann das neue Feld nicht persistiert
          // werden). PostgREST-Cache-Reload nicht noetig: wir aendern nur Werte,
          // nicht das Schema.
          const ALLOWED_KEYS = [
            // Firmendaten (Bestand)
            'company_name', 'legal_form', 'owner_name',
            'street', 'postal_code', 'city', 'country',
            'tax_number', 'vat_id',
            'email', 'phone', 'website',
            'bank_name', 'iban', 'bic',
            'handelsregister_nr', 'registergericht', 'geschaeftsfuehrer',
            // Rechnungs-Bestand (Frontend sendet diese 4 Felder; DB-Spalten
            // existieren aktuell NICHT, Supabase wirft entsprechend einen DB-Fehler
            // bei Schreibversuch. Konvention "no_regressions": altes Spread-Verhalten
            // war auch DB-Fehler — durch die Allow-Liste hier explizit beibehalten,
            // statt stillschweigend zu droppen. Wenn die Spalten spaeter angelegt
            // werden, funktioniert das Speichern automatisch.)
            'default_vat_rate',
            'invoice_prefix',
            'next_invoice_number',
            'invoice_footer_text',
            // Settings (Teilspec 2 + bestehende mwst_satz)
            'processing_fee_percent',
            'processing_fee_min_cents',
            'gt_threshold_default',
            'gt_threshold_check_hours_before',
            'payment_open_reminder_days',
            'payment_open_admin_alert_days',
            'trainer_payout_grace_hours',
            'sorry_code_validity_months',
            'sorry_code_discount_percent',
            'checkout_reminder_hours',
            'checkout_auto_release_hours',
            'mwst_satz',
          ];
          const body = await getBody(req);
          const updateData = {};
          for (const k of ALLOWED_KEYS) {
            if (body && Object.prototype.hasOwnProperty.call(body, k)) {
              updateData[k] = body[k];
            }
          }
          if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
              error: 'Keine erlaubten Felder im Request-Body. Pruefe die Allow-Liste in der Admin-API.',
            });
          }
          updateData.updated_at = new Date().toISOString();

          // Prüfen ob bereits ein Eintrag existiert (Single-Row-Tabelle)
          const { data: existing } = await supabase
            .from('company_settings')
            .select('id')
            .single();
          let result;
          if (existing?.id) {
            result = await supabase
              .from('company_settings')
              .update(updateData)
              .eq('id', existing.id)
              .select()
              .single();
          } else {
            result = await supabase
              .from('company_settings')
              .insert(updateData)
              .select()
              .single();
          }
          if (result.error) throw result.error;
          return res.json({ data: result.data });
        }
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // ═══════════════════════════════════════════════════════════════════
      // INVOICE-PDF – GET (signierte Storage URL)
      // ═══════════════════════════════════════════════════════════════════
      case 'invoice-pdf': {
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id ist erforderlich' });
        const { data: invoice, error: invErr } = await supabase
          .from('invoices')
          .select('pdf_path')
          .eq('id', id)
          .single();
        if (invErr) throw invErr;
        if (!invoice?.pdf_path) return res.status(404).json({ error: 'Kein PDF verfügbar' });
        const { data: signedData, error: signErr } = await supabase.storage
          .from('invoices')
          .createSignedUrl(invoice.pdf_path, 3600);
        if (signErr) throw signErr;
        return res.json({ url: signedData.signedUrl });
      }

      // ═══════════════════════════════════════════════════════════════════
      // LOCATION_DETAILS – GET + POST + PUT + DELETE
      // ═══════════════════════════════════════════════════════════════════
      case 'location_details':
        return handleLocationDetails(req, res, supabase)

      // ═══════════════════════════════════════════════════════════════════
      // UPLOAD_LOCATION_IMAGE – POST (Base64 → Supabase Storage)
      // ═══════════════════════════════════════════════════════════════════
      case 'upload_location_image':
        return handleUploadLocationImage(req, res, supabase)

      // ═══════════════════════════════════════════════════════════════════
      // LOCATION-ACCEPT – PUT (Kunde nimmt Trainer-Treffpunkt an)
      // ═══════════════════════════════════════════════════════════════════
      case 'location-accept': {
        if (req.method !== 'PUT') return res.status(405).json({ success: false, error: 'PUT only' });
        return handleLocationAccept(req, res, supabase)
      }

      // ═══════════════════════════════════════════════════════════════════
      // LOCATION-REJECT – PUT (Kunde lehnt Trainer-Treffpunkt ab)
      // ═══════════════════════════════════════════════════════════════════
      case 'location-reject': {
        if (req.method !== 'PUT') return res.status(405).json({ success: false, error: 'PUT only' });
        return handleLocationReject(req, res, supabase)
      }

      // ═══════════════════════════════════════════════════════════════════
      // TRAINER-VACATION – POST (erstellen) + DELETE (löschen)
      // ═══════════════════════════════════════════════════════════════════
      case 'trainer_vacation': {
        return await handleTrainerVacation(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // GT-KARTEN – Kartentypen, manuelle Erstellung, Karten-Update
      // ═══════════════════════════════════════════════════════════════════
      case 'gt_card_type': {
        if (req.method === 'POST') {
          const body = await getBody(req);
          const { id, name, sessions_count, discount_percent, validity_months, is_active } = body;
          if (id) {
            // Update existing
            const { data, error } = await supabase.from('gt_card_types')
              .update({ name, sessions_count, discount_percent, validity_months, is_active, updated_at: new Date().toISOString() })
              .eq('id', id).select().single();
            if (error) return res.status(500).json({ error: error.message });
            return res.json(data);
          } else {
            // Create new
            const { data, error } = await supabase.from('gt_card_types')
              .insert({ name, sessions_count, discount_percent, validity_months }).select().single();
            if (error) return res.status(500).json({ error: error.message });
            return res.json(data);
          }
        }
        return res.status(405).json({ error: 'Method not allowed' });
      }

      case 'gt_card_manual': {
        if (req.method === 'POST') {
          const body = await getBody(req);
          const { customer_id, card_type_id, price_cents_override } = body;

          // Kartentyp laden
          const { data: ct, error: ctErr } = await supabase.from('gt_card_types').select('*').eq('id', card_type_id).single();
          if (ctErr || !ct) return res.status(404).json({ error: 'Kartentyp nicht gefunden' });

          // Kunde laden (brauchen auth_user_id)
          const { data: cust, error: custErr } = await supabase.from('customers').select('auth_user_id').eq('id', customer_id).single();
          if (custErr || !cust) return res.status(404).json({ error: 'Kunde nicht gefunden' });

          // B-2026-05-14-51 Fix: mwst_satz aus company_settings statt hardcoded.
          // Pulsly = Verkaeufer der 10er-Karten an den Kunden (Beschluss 26.04.2026),
          // also gilt der Company-MwSt-Satz, nicht der Trainer-Satz. Bei
          // Kleinunternehmer-Pulsly waere das 0. Aktuell 19, aber NIE hardcoden.
          const { data: companySettings } = await supabase
            .from('company_settings')
            .select('mwst_satz')
            .limit(1)
            .single();
          const companyMwstSatz = companySettings?.mwst_satz ?? 19;

          // Preis berechnen oder Override
          let priceCents = price_cents_override;
          if (!priceCents) {
            const { data: classes } = await supabase.from('group_classes')
              .select('price_per_person_cents').eq('is_active', true).gt('price_per_person_cents', 0);
            const avg = classes && classes.length > 0
              ? Math.round(classes.reduce((s, c) => s + c.price_per_person_cents, 0) / classes.length)
              : 1500;
            priceCents = Math.round(ct.sessions_count * avg * (1 - ct.discount_percent / 100));
          }

          const expiresAt = new Date();
          expiresAt.setMonth(expiresAt.getMonth() + ct.validity_months);

          const { data: card, error: cardErr } = await supabase.from('gt_cards').insert({
            customer_id,
            auth_user_id: cust.auth_user_id,
            card_type_id,
            sessions_total: ct.sessions_count,
            sessions_remaining: ct.sessions_count,
            price_cents: priceCents,
            discount_percent: ct.discount_percent,
            expires_at: expiresAt.toISOString(),
            paid: true,
            payment_source: 'admin_manual',
            mwst_satz: companyMwstSatz,
          }).select().single();

          if (cardErr) return res.status(500).json({ error: cardErr.message });

          // Rechnung generieren — B-2026-05-14-47 Fix: direkter fetch() statt
          // supabase.functions.invoke() (schluckt Response-Bodies bei non-2xx).
          try {
            const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
            const invoiceResp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/generate-invoice`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ type: 'rechnung_gt_card', gt_card_id: card.id, customer_id }),
            });
            const invoiceResult = await invoiceResp.json().catch(() => ({}));
            if (!invoiceResp.ok) {
              console.error('gt_card_manual: generate-invoice failed', invoiceResp.status, invoiceResult);
            } else if (invoiceResult?.invoice_id) {
              await supabase.from('gt_cards').update({ invoice_id: invoiceResult.invoice_id }).eq('id', card.id);
            }
          } catch (e) { console.error('Invoice generation failed:', e); }

          return res.json({ success: true, card });
        }
        return res.status(405).json({ error: 'Method not allowed' });
      }

      case 'gt_card_update': {
        if (req.method === 'PUT') {
          const body = await getBody(req);
          const { id, is_active, sessions_remaining, deactivated_reason } = body;
          const update = { updated_at: new Date().toISOString() };
          if (is_active !== undefined) update.is_active = is_active;
          if (sessions_remaining !== undefined) {
            // Cap: sessions_remaining darf sessions_total nicht ueberschreiten
            const { data: card } = await supabase.from('gt_cards').select('sessions_total').eq('id', id).single();
            if (card && sessions_remaining > card.sessions_total) {
              return res.status(400).json({ error: `sessions_remaining (${sessions_remaining}) darf sessions_total (${card.sessions_total}) nicht ueberschreiten` });
            }
            update.sessions_remaining = sessions_remaining;
          }
          if (deactivated_reason) update.deactivated_reason = deactivated_reason;
          if (is_active === false) update.deactivated_at = new Date().toISOString();

          const { data, error } = await supabase.from('gt_cards').update(update).eq('id', id).select().single();
          if (error) return res.status(500).json({ error: error.message });
          return res.json(data);
        }
        return res.status(405).json({ error: 'Method not allowed' });
      }

      default:
        return res.status(404).json({ error: `Unbekannte Action: ${action}` });
    }
  } catch (err) {
    console.error(`Admin API Error [${action}]:`, err);
    // Deutsche Fehlermeldungen für bekannte DB-Fehler
    const msg = err.message || '';
    if (msg.includes('foreign key')) {
      return res.status(400).json({ error: 'Aktion nicht möglich: Es bestehen noch Verknüpfungen zu anderen Datensätzen. Bitte löse diese zuerst auf.' });
    }
    if (msg.includes('violates unique constraint')) {
      return res.status(400).json({ error: 'Ein Eintrag mit diesen Daten existiert bereits.' });
    }
    if (msg.includes('violates not-null constraint')) {
      return res.status(400).json({ error: 'Ein Pflichtfeld wurde nicht ausgefüllt.' });
    }
    if (msg.includes('column') && msg.includes('does not exist')) {
      return res.status(500).json({ error: 'Datenbank-Schema veraltet. Bitte SQL-Migration ausführen (siehe docs/sql-admin-erweiterungen.sql).' });
    }
    return res.status(500).json({ error: msg || 'Unbekannter Fehler', details: err.code || null });
  }
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Personen-Logbuch (Verlauf pro Kunde + Trainer) ──────────────────────────
// Whitelist welche Audit-Actions im Personen-Logbuch erscheinen. Trainer-Sicht
// (TRAINER_OPERATIONAL) enthaelt KEINE Geld-Vorgaenge; Admin-Sicht (full) sieht
// zusaetzlich Zahlungen, Rechnungen und Bar-Zahlungen.
const PERSON_KEY_BOOKING = new Set(['created','confirmed','rescheduled','location_changed','check_in','check_out','trainer_checkout','completed','cancelled','escalated','replacement_trainer_search_started','replacement_trainer_accepted','replacement_trainer_confirmed','replacement_trainer_assigned','storno_invoice_created','admin_note','charge_succeeded','charge_failed_card','manual_paid_set','manual_payout_set','manual_admin_added_participant','admin_field_change','bar_verifiziert']);
const PERSON_KEY_PAYMENT = new Set(['payment_succeeded','payment_captured','refund_created','transfer_created']);
const PERSON_KEY_INVOICE = new Set(['created']);
const PERSON_KEY_CASH = new Set(['gemeldet_durch_trainer','verifiziert_durch_admin']);
const TRAINER_OPERATIONAL = new Set(['created','confirmed','rescheduled','location_changed','check_in','check_out','trainer_checkout','completed','cancelled','escalated','replacement_trainer_search_started','replacement_trainer_accepted','replacement_trainer_confirmed','replacement_trainer_assigned']);
// HAERTUNG (Review C-2): NIEMALS Geld-/Preis-Felder aufnehmen
// (price_cents, final_price_cents, refund_amount_cents, fee_cents, payout_cents,
//  amount_cents, discount_*). Der Renderer (shared/audit-log.js) wuerde sie sonst
// im Trainer-Portal sofort anzeigen. Nur betriebliche Termin-/Ort-/Ersatz-Felder.
const TRAINER_DETAIL_KEYS = ['old_date','new_date','old_time','new_time','old_location','new_location','is_trainer_proposal','reason','storno_grund','storno_wer','trainer_id','new_trainer_id','old_trainer_id','new_trainer_name','kandidaten_count','art','booking_type','trainer_checked_out_at'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function buildPersonAuditLog(supabase, { column, personId, mode }) {
  const { data: bks, error: bkErr } = await supabase
    .from('bookings').select('id, scheduled_date, art')
    .eq(column, personId).order('scheduled_date', { ascending: false }).limit(300);
  if (bkErr) throw bkErr;
  const ids = (bks || []).map(b => b.id);
  if (!ids.length) return [];
  const meta = new Map((bks || []).map(b => [b.id, { date: b.scheduled_date, art: b.art }]));
  const refOf = id => { const m = meta.get(id); return m ? { date: m.date, art: m.art } : null; };

  if (mode === 'trainer') {
    const { data: aud } = await supabase.from('booking_audit')
      .select('booking_id, action, actor_type, actor_id, details, created_at')
      .in('booking_id', ids).order('created_at', { ascending: false }).limit(300);
    return (aud || [])
      .filter(e => TRAINER_OPERATIONAL.has(e.action))
      .map(e => {
        const src = e.details || {};
        const details = {};
        for (const k of TRAINER_DETAIL_KEYS) if (src[k] !== undefined) details[k] = src[k];
        return { kind: 'booking', at: e.created_at, action: e.action, actor_type: e.actor_type, actor_id: e.actor_id, details, booking_ref: refOf(e.booking_id) };
      });
  }

  const [invByBooking, invByGp] = await Promise.all([
    supabase.from('invoices').select('id, invoice_number, storno_ref, booking_id, group_participant_id').in('booking_id', ids),
    supabase.from('invoices').select('id, invoice_number, storno_ref, booking_id, group_participant_id').in('group_participant_id', ids),
  ]);
  const invMap = new Map();
  for (const i of [...(invByBooking.data || []), ...(invByGp.data || [])]) invMap.set(i.id, i);
  const invs = [...invMap.values()];
  const invIdToNumber = new Map(invs.map(i => [i.id, i.invoice_number || i.storno_ref || i.id.slice(0, 8)]));
  const invIdToBooking = new Map(invs.map(i => [i.id, i.booking_id || i.group_participant_id]));
  const invoiceIds = invs.map(i => i.id);

  const [auditRes, payRes, invAuditRes, cashRes] = await Promise.all([
    supabase.from('booking_audit').select('booking_id, action, actor_type, actor_id, details, created_at')
      .in('booking_id', ids).order('created_at', { ascending: false }).limit(300),
    supabase.from('payment_events').select('entity_id, action, actor_type, actor_id, details, amount_cents, currency, stripe_object_type, stripe_object_id, occurred_at')
      .in('entity_id', ids).in('entity_type', ['booking', 'group_participant']).order('occurred_at', { ascending: false }).limit(300),
    invoiceIds.length
      ? supabase.from('invoice_audit').select('invoice_id, action, actor_type, actor_id, details, timestamp')
        .in('invoice_id', invoiceIds).order('timestamp', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    supabase.from('cash_payment_audit').select('booking_id, action, actor_type, actor_id, amount_cents, pulsly_anteil_cents, details, occurred_at')
      .in('booking_id', ids).order('occurred_at', { ascending: false }).limit(300),
  ]);

  return [
    ...(auditRes.data || []).filter(e => PERSON_KEY_BOOKING.has(e.action)).map(e => ({
      kind: 'booking', at: e.created_at, action: e.action, actor_type: e.actor_type, actor_id: e.actor_id, details: e.details, booking_ref: refOf(e.booking_id),
    })),
    ...(payRes.data || []).filter(e => PERSON_KEY_PAYMENT.has(e.action)).map(e => ({
      kind: 'payment', at: e.occurred_at, action: e.action, actor_type: e.actor_type, actor_id: e.actor_id, details: e.details, amount_cents: e.amount_cents, currency: e.currency, stripe_object_type: e.stripe_object_type, stripe_object_id: e.stripe_object_id, booking_ref: refOf(e.entity_id),
    })),
    ...(invAuditRes.data || []).filter(e => PERSON_KEY_INVOICE.has(e.action)).map(e => ({
      kind: 'invoice', at: e.timestamp, action: e.action, actor_type: e.actor_type, actor_id: e.actor_id, details: e.details, invoice_label: invIdToNumber.get(e.invoice_id) || null, booking_ref: refOf(invIdToBooking.get(e.invoice_id)),
    })),
    ...(cashRes.data || []).filter(e => PERSON_KEY_CASH.has(e.action)).map(e => ({
      kind: 'cash', at: e.occurred_at, action: e.action, actor_type: e.actor_type, actor_id: e.actor_id, amount_cents: e.amount_cents, booking_ref: refOf(e.booking_id),
      details: { ...(e.details || {}), pulsly_anteil_cents: e.pulsly_anteil_cents, trainer_anteil_cents: (e.amount_cents != null && e.pulsly_anteil_cents != null) ? e.amount_cents - e.pulsly_anteil_cents : null },
    })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

// Token-Validierung: einen Anon-Key-Client benutzen, NICHT den Service-Role-
// Client. Seit der Supabase-Auth-Migration 2025 liefert das JS-SDK ES256-
// Tokens — der Service-Role-Client kann diese nicht validieren und
// auth.getUser(token) wirft 'Ungültiger Token'. Mit dem Anon-Key-Client
// laeuft die Validierung gegen den oeffentlichen JWKS-Endpoint und akzeptiert
// beide Token-Formate (HS256 und ES256).
// Hardcoded ANON-Key als letzter Fallback (klassischer JWT, identisch zum
// auth-guard.js des Admin-Portals). Anon-Keys sind nicht geheim — sie sind im
// Browser-Code ohnehin sichtbar. Wenn die Vercel-Env-Vars SUPABASE_ANON_KEY
// und SUPABASE_PUBLISHABLE_KEY nicht gesetzt sind, crasht createClient ohne
// diesen Fallback und die API liefert eine HTML-500-Seite (JSON-Parse-Fehler
// im Browser).
const ADMIN_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoc2p5ZGdrbm15c2lyY3VianNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjk5NDAsImV4cCI6MjA4ODc0NTk0MH0.nGPKA30cm-EPsyt0Pn5YWxcMjMdNzg_1yN87LdK0rZI';

function getAuthClient() {
  const anonKey = process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || ADMIN_ANON_JWT;
  return createClient(process.env.SUPABASE_URL, anonKey);
}

async function verifyAuthenticated(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return 'Token fehlt';
  const token = authHeader.split(' ')[1];
  const supabase = getAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return 'Ungültiger Token';
  return null;
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return 'Token fehlt';

  const token = authHeader.split(' ')[1];
  const supabase = getAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return 'Ungültiger Token';
  if (!user.user_metadata?.role?.includes('admin')) return 'Kein Admin-Zugang';
  return null;
}

// ─── Teilspec 1 ID-Bridge ───────────────────────────────────────────────────
// fetchGroupParticipantsAsBookings setzt fuer GT-Teilnahmen den Praefix 'gp_'
// auf die Buchungs-ID (Frontend-Konvention). Phase-2-Migration hat die UUIDs
// 1:1 von group_participants nach bookings gespiegelt, also entspricht der
// gestrippte UUID direkt der bookings.id. JEDER Admin-API-Endpunkt der eine
// Buchungs-ID vom Frontend empfaengt MUSS diesen Helper benutzen — sonst
// brechen GT-Buchungen still ein (UPDATE/SELECT findet 0 Zeilen).
function stripGpPrefix(id) {
  if (typeof id !== 'string') return id;
  return id.startsWith('gp_') ? id.slice(3) : id;
}

// HTML-Escape fuer Mail-Bodies (Teilspec 2 Task 27b send-payment-reminder).
// Verhindert dass Kunden-Namen / Trainer-Namen mit HTML-Sonderzeichen das
// Markup zerschiessen oder eine Mini-XSS-Lücke öffnen. Klein gehalten —
// nur die 5 HTML-relevanten Zeichen.
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Teilspec 1 Status-Bridge ───────────────────────────────────────────────
// Frontend (Trainer-Portal-HTMLs + Admin-Portal-HTMLs) arbeitet noch mit dem
// Legacy-Wortschatz (pending/confirmed/reschedule_proposed/...). Die DB
// akzeptiert nur den neuen 7-Wert-Kanon. Diese zwei Helper bilden die Bruecke,
// damit das Frontend unangetastet bleibt — die UX-Vereinheitlichung (eigener
// Auftrag nach Teilspec 1) raeumt das spaeter zentral auf.

function mapStatusForFrontend(row) {
  const status = row.status;
  // Teilspec 2 — Payment-Open ueberlagert alles andere wenn die Karte abgelehnt wurde.
  // Auch bei flag_neuer_termin_vorgeschlagen oder flag_neuer_ort_vorgeschlagen gewinnt
  // payment_open — Admin/Trainer muss zuerst die Zahlung klaeren bevor irgendwas anderes
  // passiert. Pseudo-Status, kein DB-CHECK — DB bleibt 'bestaetigt' + flag_zahlung_offen=true.
  if (status === 'bestaetigt' && row.flag_zahlung_offen === true) {
    return 'payment_open';
  }
  // Status 'bestaetigt' + Flag → virtueller Sub-Status
  if (status === 'bestaetigt') {
    if (row.flag_neuer_termin_vorgeschlagen) return 'reschedule_proposed';
    if (row.flag_neuer_ort_vorgeschlagen) return 'location_proposed';
    if (row.flag_ersatz_trainer_gesucht) return 'finding_replacement';
    return 'confirmed';
  }
  if (status === 'laeuft gerade') {
    if (row.flag_checkout_bestaetigung_ausstehend) return 'awaiting_checkout';
    return 'checked_in';
  }
  if (status === 'storniert') {
    const wer = row.storno_wer;
    const grund = row.storno_grund;
    if (wer === 'trainer' && grund === 'rejected') return 'rejected';
    if (wer === 'trainer') return 'cancelled_by_trainer';
    if (wer === 'system' && (grund === 'expired' || grund === 'past_termin')) return 'expired';
    if (grund === 'fully_cancelled') return 'fully_cancelled';
    if (grund === 'refunded') return 'refunded';
    return 'cancelled';
  }
  if (status === 'angefragt') return 'pending';
  if (status === 'reserviert') return 'pending';
  if (status === 'abgeschlossen') return 'completed';
  if (status === 'strittig') return 'disputed';
  return status;
}

function withFrontendStatus(row) {
  return { ...row, status: mapStatusForFrontend(row) };
}

// Legacy-Status (vom Frontend gesendet) auf neuen 7-Wert-Kanon mappen.
// Liefert das Update-Objekt-Fragment, das ans bookings-Update geht.
function mapStatusForDb(legacyStatus) {
  switch (legacyStatus) {
    case 'pending':
      return { status: 'angefragt' };
    case 'confirmed':
      return { status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: false, flag_neuer_ort_vorgeschlagen: false, flag_ersatz_trainer_gesucht: false };
    // Ersatz-Trainer-Vorgang (ARCHITEKTUR.md Vorgang 6): Status bleibt 'bestaetigt'
    // + Zusatz-Merkmal flag_ersatz_trainer_gesucht (analog reschedule/location).
    // Beim 7-Status-Umbau (Teilspec 1) wurde dieses Mapping vergessen → die
    // Ersatztrainer-Zuweisung im Portal lief in den DB-CHECK-Constraint.
    case 'finding_replacement':
    case 'replacement_pending':
    case 'replacement_found':
      return { status: 'bestaetigt', flag_ersatz_trainer_gesucht: true };
    case 'reschedule_proposed':
      return { status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: true };
    case 'location_proposed':
      return { status: 'bestaetigt', flag_neuer_ort_vorgeschlagen: true };
    case 'awaiting_checkout':
      return { status: 'laeuft gerade', flag_checkout_bestaetigung_ausstehend: true };
    // Teilspec 2 — payment_open ist ein Pseudo-Status (DB bleibt 'bestaetigt' + Flag).
    case 'payment_open':
      return { status: 'bestaetigt', flag_zahlung_offen: true };
    case 'checked_in':
    case 'checked_in_trainer':
      return { status: 'laeuft gerade' };
    case 'completed':
    case 'paid':
      return { status: 'abgeschlossen' };
    case 'cancelled':
      return { status: 'storniert', storno_wer: 'kunde', storno_grund: 'cancelled' };
    case 'cancelled_by_trainer':
      return { status: 'storniert', storno_wer: 'trainer', storno_grund: 'cancelled_by_trainer' };
    case 'fully_cancelled':
      return { status: 'storniert', storno_wer: 'kunde', storno_grund: 'fully_cancelled' };
    case 'rejected':
      return { status: 'storniert', storno_wer: 'trainer', storno_grund: 'rejected' };
    case 'expired':
      return { status: 'storniert', storno_wer: 'system', storno_grund: 'expired' };
    case 'refunded':
      return { status: 'storniert', storno_wer: 'kunde', storno_grund: 'refunded' };
    case 'disputed':
    case 'escalated':
      return { status: 'strittig' };
    // Neuer Kanon: 1:1 durchreichen
    case 'angefragt':
    case 'reserviert':
    case 'bestaetigt':
    case 'laeuft gerade':
    case 'abgeschlossen':
    case 'storniert':
    case 'strittig':
      return { status: legacyStatus };
    default:
      return { status: legacyStatus };
  }
}

async function getAdminEmail(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.email || null;
}

// ─── Schritt 4 (Fix-Stufe 1): Server-Hook fuer Status-Wechsel ────────────────
// Der Trainer-Portal-Bestaetigen-Knopf, der Admin-Portal-Bestaetigen-Knopf, sowie
// alle Absagen/Ablehnen-Knoepfe rufen `PUT /api/admin?action=bookings` (handleBookingsPut)
// auf. Bisher wurde dort nur der DB-Status geaendert — confirm-and-charge bzw.
// cancel-or-refund wurden uebersprungen. Damit zog Trainer-Bestaetigung kein Geld,
// und Storno-Pfade hatten weder Refund noch Stornobeleg.
// (B-2026-05-14-10/13/14/46 + W-1 + B-2026-05-11-01)
//
// Diese Helper kapseln die Edge-Function-Aufrufe + die Caller-Typ-Erkennung.
// Wir reichen IMMER das User-Token des Aufrufers weiter — die Edge Functions
// machen die Auth-Pruefung intern (--no-verify-jwt deployed, auth.getUser()).

async function getCallerInfo(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const role = (user.user_metadata?.role || '').toString();
  let actorType;
  if (role.includes('admin')) actorType = 'admin';
  else if (role.includes('trainer')) actorType = 'trainer';
  else actorType = 'customer';
  return { token, authUid: user.id, role, actorType, email: user.email || null };
}

async function callEdgeFunction(name, token, payload) {
  const url = `${process.env.SUPABASE_URL}/functions/v1/${name}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    console.error(`[admin-api] ${name} fetch failed:`, netErr.message);
    return { httpOk: false, status: 0, body: { error: `Netzwerkfehler beim Aufruf von ${name}: ${netErr.message}` } };
  }
  let body = {};
  try { body = await res.json(); } catch { /* empty body */ }
  return { httpOk: res.ok, status: res.status, body };
}

// Ableiten welcher StornoReason an cancel-or-refund geht. Basiert auf aktuellem
// DB-Status + Aufrufer-Rolle + Termin-Distanz (kunde_spaet bei <24h).
// Trainer auf pending-Anfrage = trainer_reject (kein Vertrag), Trainer auf
// bestaetigt = trainer (Stornobeleg + SORRY-Code). Admin = admin_kulanz.
function deriveCancelReason({ currentStatus, scheduledDate, scheduledTime, actorType, explicitStornoGrund }) {
  if (explicitStornoGrund === 'expired') return 'system_expired';
  if (actorType === 'system') return 'system_expired';
  if (actorType === 'admin') return 'admin_kulanz';
  if (actorType === 'trainer') {
    if (currentStatus === 'angefragt' || currentStatus === 'reserviert') return 'trainer_reject';
    return 'trainer';
  }
  // customer
  if (scheduledDate && scheduledTime) {
    const dt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (!Number.isNaN(dt.getTime())) {
      const hoursUntil = (dt.getTime() - Date.now()) / 3600000;
      if (hoursUntil < 24) return 'kunde_spaet';
    }
  }
  return 'kunde_rechtzeitig';
}

// Reichert eine Liste Trainer-Objekte um ihre EINSATZORTE an (B-2026-06-02-04/05).
// Quelle ist ausschliesslich die Zuweisung trainer_service_cities + nur AKTIVE Orte.
// Der Wohnort (trainer_profiles.city) ist KEIN Einsatzort und wird hier nicht verwendet.
// Setzt t.cities = [{ city_id, city }] und t.city_ids = [city_id]. Mutiert in-place.
async function enrichTrainersWithCities(supabase, trainers) {
  if (!trainers || trainers.length === 0) return;
  const [{ data: junction }, { data: serviceCities }] = await Promise.all([
    supabase.from('trainer_service_cities').select('trainer_id, city_id'),
    supabase.from('service_locations').select('id, city').eq('is_active', true),
  ]);
  const cityName = {};
  (serviceCities || []).forEach(c => { cityName[c.id] = c.city; });
  const byTrainer = {};
  (junction || []).forEach(r => {
    // Inaktiver/gelöschter Ort → kein aktiver Name → überspringen.
    if (!cityName[r.city_id]) return;
    if (!byTrainer[r.trainer_id]) byTrainer[r.trainer_id] = [];
    byTrainer[r.trainer_id].push({ city_id: r.city_id, city: cityName[r.city_id] });
  });
  trainers.forEach(t => {
    const list = byTrainer[t.id] || [];
    t.cities = list;
    t.city_ids = list.map(c => c.city_id);
  });
}

async function enrichBookings(supabase, bookings) {
  if (bookings.length === 0) return [];

  // Trainer-Namen + Stadt
  const trainerIds = [...new Set(bookings.map(b => b.trainer_id).filter(Boolean))];
  let trainerMap = {};
  if (trainerIds.length > 0) {
    const { data: trainers } = await supabase
      .from('trainer_profiles')
      .select('id, full_name, city, payout_cents, mwst_satz')
      .in('id', trainerIds);
    if (trainers) trainers.forEach(t => { trainerMap[t.id] = t; });
  }

  // Kunden-Namen aus customers-Tabelle für Buchungen ohne customer_name
  const missingNameIds = [...new Set(
    bookings
      .filter(b => !b.customer_name && b.customer_id)
      .map(b => b.customer_id)
  )];
  let customerMap = {};
  if (missingNameIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, email')
      .in('id', missingNameIds);
    if (customers) customers.forEach(c => { customerMap[c.id] = c; });
  }

  return bookings.map(b => ({
    ...b,
    // Teilspec 1: DB-Status auf Legacy-Status fuers Frontend zurueckmappen.
    status:            mapStatusForFrontend(b),
    trainer_name:      trainerMap[b.trainer_id]?.full_name || null,
    trainer_city:      trainerMap[b.trainer_id]?.city || null,
    trainer_mwst_satz: trainerMap[b.trainer_id]?.mwst_satz ?? null,
    // Trainer-Auszahlungsrate aus trainer_profiles (ueberschreibt nicht das buchungseigene payout_cents)
    trainer_rate_cents: trainerMap[b.trainer_id]?.payout_cents ?? null,
    // payout_cents: Buchungseigenes Feld bevorzugen, sonst Trainer-Rate als Fallback
    payout_cents:      b.payout_cents ?? trainerMap[b.trainer_id]?.payout_cents ?? null,
    customer_name: b.customer_name ||
      customerMap[b.customer_id]?.full_name ||
      customerMap[b.customer_id]?.email ||
      null,
  }));
}

// ─── GT-Teilnahmen als Buchungs-Objekte laden ─────────────────────────────────
// Teilspec 1: GT-Teilnahmen liegen jetzt in bookings mit art='gt_teilnahme'.
// Spaltenmapping (alt -> neu): customer_paid -> paid; trainer_paid weg
// (trainer_paid_out_at IS NOT NULL ist Indikator); customer_name/email kommen
// ueber JOIN auf customers; mwst_satz weg (kommt ueber trainer-Profil-Fallback);
// Status-Werte 'cancelled'/'refunded' -> 'storniert'.
async function fetchGroupParticipantsAsBookings(supabase) {
  const { data: participants, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('art', 'gt_teilnahme')
    .order('created_at', { ascending: false });
  if (error || !participants || participants.length === 0) return [];

  const classIds = [...new Set(participants.map(p => p.group_class_id).filter(Boolean))];
  const { data: classes } = await supabase
    .from('group_classes')
    .select('*')
    .in('id', classIds);
  const classMap = {};
  if (classes) classes.forEach(c => { classMap[c.id] = c; });

  const trainerIds = [...new Set((classes || []).map(c => c.trainer_id).filter(Boolean))];
  const trainerMap = {};
  if (trainerIds.length > 0) {
    const { data: trainers } = await supabase
      .from('trainer_profiles')
      .select('id, full_name, city, payout_cents, mwst_satz')
      .in('id', trainerIds);
    if (trainers) trainers.forEach(t => { trainerMap[t.id] = t; });
  }

  // Customer-Daten ueber JOIN nachladen (bookings hat customer_name/email NICHT mehr direkt)
  const customerIds = [...new Set(participants.map(p => p.customer_id).filter(Boolean))];
  const customerMap = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, first_name, last_name, email')
      .in('id', customerIds);
    if (customers) customers.forEach(c => { customerMap[c.id] = c; });
  }

  // T9 (B-2026-06-14-12): GT-Trainer-Honorar faellt EINMAL pro Kurs an
  // (= group_classes.payout_snapshot_cents, Fallback Trainer-Satz payout_cents),
  // NICHT je Teilnahme. Frueher trug jede Teilnahme-Zeile ein eigenes
  // anteiliges/Roh-Honorar → Admin-Finanzen + Buchungsliste summierten das
  // Honorar je Teilnehmer (zu hoch). Loesung: das einmalige Kurs-Honorar EINER
  // aktiven Teilnahme zuordnen (bevorzugt einer bezahlten, damit der paid-Check
  // in effKosten/effectiveCost greift), alle anderen 0 → Summe je Kurs = 1x
  // Honorar. bookings.trainer_payout_cents ist je Teilnahme unzuverlaessig
  // (500/3000/4500 gemischt) und wird fuer die Honorar-Anzeige NICHT mehr genutzt.
  const payoutCarrierByClass = {};  // group_class_id -> { id, paid }
  participants.forEach(p => {
    if ((p.status || '').toLowerCase() === 'storniert') return;
    const cid = p.group_class_id;
    const cur = payoutCarrierByClass[cid];
    if (!cur) payoutCarrierByClass[cid] = { id: p.id, paid: !!p.paid };
    else if (!cur.paid && p.paid) payoutCarrierByClass[cid] = { id: p.id, paid: true };
  });

  return participants.map(p => {
    const gc       = classMap[p.group_class_id] || {};
    const trainer  = trainerMap[gc.trainer_id]  || {};
    const customer = customerMap[p.customer_id] || {};
    const isCancelled = (p.status || '').toLowerCase() === 'storniert';

    const priceFromParticipant      = p.price_cents;
    const finalPriceFromParticipant = p.final_price_cents;

    const priceCents      = priceFromParticipant     ?? (gc.price_per_person_cents || 0);
    const finalPriceCents = finalPriceFromParticipant ?? priceCents;

    // T9 (B-2026-06-14-12): nur die Traeger-Teilnahme des Kurses traegt das
    // einmalige Kurs-Honorar, alle anderen 0 (Summe je Kurs = 1x Honorar).
    const isPayoutCarrier = !isCancelled && payoutCarrierByClass[p.group_class_id]?.id === p.id;
    const payoutCents     = isPayoutCarrier ? (gc.payout_snapshot_cents ?? trainer.payout_cents ?? 0) : 0;
    // bookings hat keine mwst_satz-Spalte — Fallback auf Trainer-Profil
    const mwstSatz        = trainer.mwst_satz ?? null;

    // Payment-Status aus Stripe-Status ableiten, sonst paid-Flag
    let paymentStatus = 'pending';
    if (p.stripe_payment_status) {
      paymentStatus = p.stripe_payment_status;
    } else if (p.paid) {
      paymentStatus = 'paid';
    }

    const customerFullName =
      customer.full_name
      || [customer.first_name, customer.last_name].filter(Boolean).join(' ')
      || customer.email
      || '–';

    return {
      // gp_-Praefix bleibt fuer Frontend-Kompatibilitaet (Trainer-Portal-Code unterscheidet Buchungs-Arten daran).
      id:                 `gp_${p.id}`,
      booking_type:       'group',
      customer_name:      customerFullName,
      customer_id:        p.customer_id || null,
      trainer_id:         gc.trainer_id    || null,
      trainer_name:       trainer.full_name || null,
      trainer_city:       trainer.city || gc.city || null,
      trainer_mwst_satz:  mwstSatz,
      scheduled_date:     gc.scheduled_date  || p.scheduled_date || null,
      scheduled_time:     gc.scheduled_time  || p.scheduled_time || null,
      // Status auf Legacy-Status fuers Frontend zurueckmappen (Teilspec-1-Bridge)
      status:             mapStatusForFrontend(p) || 'confirmed',
      storno_wer:         p.storno_wer || null,
      storno_grund:       p.storno_grund || null,
      price_cents:        isCancelled ? 0 : priceCents,
      final_price_cents:  isCancelled ? 0 : finalPriceCents,
      payout_cents:       isCancelled ? 0 : payoutCents,
      trainer_rate_cents: isCancelled ? 0 : payoutCents,
      // B-2026-05-14-50 Q-05: paid + stripe_payment_status durchreichen, damit
      // das Frontend (admin/finances.html effBrutto/effKosten) den paid-Check
      // korrekt machen kann. Vorher fehlten diese Felder im GT-Response,
      // damit waeren alle GT-Teilnahmen als unbezahlt durchgefallen.
      paid:               !!p.paid,
      stripe_payment_status: p.stripe_payment_status || null,
      payment_status:     paymentStatus,
      stripe_payment_intent_id: p.stripe_payment_intent_id || null,
      stripe_payment_id:  p.stripe_payment_id || null,
      location_name:      p.location_name || gc.city || null,
      location:           p.location_name || gc.city || null,
      notes:              gc.name ? `Kurs: ${gc.name}` : null,
      created_at:         p.created_at || null,
      group_class_id:     p.group_class_id || null,
      group_class_name:   gc.name || null,
      storno_invoice_id:  p.storno_invoice_id || null,
      invoice_id:         p.invoice_id || null,
      is_test_data:       p.is_test_data || false,
    };
  });
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ maxFileSize: 20 * 1024 * 1024, multiples: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Ungültiges JSON')); }
    });
  });
}

// bodyParser ist aus → für JSON-Actions manuell parsen
async function getBody(req) {
  if (req.body) return req.body;
  return await parseJsonBody(req);
}

// ─── ACTION: data ────────────────────────────────────────────────────────────

async function handleData(req, res, supabase) {
  const { type, limit, group_id } = req.query;

  switch (type) {
    case 'kpi_trainers': {
      const { count, error } = await supabase
        .from('trainer_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_active', true);
      if (error) throw error;
      return res.json({ count });
    }

    case 'kpi_pending': {
      const { count, error } = await supabase
        .from('trainer_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return res.json({ count });
    }

    case 'kpi_bookings_week': {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());
      if (error) throw error;
      return res.json({ count });
    }

    case 'kpi_revenue_month': {
      // B-2026-05-14-50 Folge C.2: final_price_cents ist der von Stripe
      // tatsaechlich belastete Betrag nach Rabatt — muss zuerst gelesen werden.
      // Vorher: price_cents (Listenpreis) → bei Rabattcode-Buchungen zu hoher Umsatz.
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('bookings')
        .select('price_cents, final_price_cents')
        .gte('created_at', monthStart.toISOString())
        .in('status', ['bestaetigt', 'laeuft gerade', 'abgeschlossen']);
      if (error) throw error;
      const total = (data || []).reduce((sum, b) => sum + (b.final_price_cents ?? b.price_cents ?? 0), 0);
      return res.json({ total_cents: total });
    }

    case 'all_trainers': {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Aggregate ratings from trainer_reviews
      const { data: reviews } = await supabase
        .from('trainer_reviews')
        .select('trainer_id, rating');

      if (reviews && reviews.length > 0) {
        const ratingMap = {};
        reviews.forEach(r => {
          if (!ratingMap[r.trainer_id]) ratingMap[r.trainer_id] = { sum: 0, count: 0 };
          ratingMap[r.trainer_id].sum += r.rating || 0;
          ratingMap[r.trainer_id].count += 1;
        });
        (data || []).forEach(t => {
          const agg = ratingMap[t.id];
          if (agg && agg.count > 0) {
            t.rating = Math.round((agg.sum / agg.count) * 10) / 10;
            t.review_count = agg.count;
          }
        });
      }

      // Einsatzorte anreichern (nur aktive Zuweisung — Wohnort zählt NICHT, B-2026-06-02-04/05).
      try {
        await enrichTrainersWithCities(supabase, data || []);
      } catch (e) {
        console.error('all_trainers cities-Anreicherung fehlgeschlagen:', e?.message || e);
      }

      // Wunsch-Einsatzorte der Bewerbung auflösen (Anzeige-String + aktive Vorhak-IDs).
      // ALLE service_locations (auch inaktive) — separat von der aktiv-only Anreicherung.
      try {
        const hasWish = (data || []).some(t => t.bewerbung_wunsch && (
          (Array.isArray(t.bewerbung_wunsch.city_ids) && t.bewerbung_wunsch.city_ids.length) || t.bewerbung_wunsch.text));
        if (hasWish) {
          const { data: allLocs } = await supabase.from('service_locations').select('id, city, is_active');
          const locMap = {};
          (allLocs || []).forEach(l => { locMap[String(l.id)] = l; });
          (data || []).forEach(t => {
            const w = t.bewerbung_wunsch;
            if (!w) return;
            const wishIds = Array.isArray(w.city_ids) ? w.city_ids.map(String) : [];
            const parts = wishIds.map(id => {
              const l = locMap[id];
              if (!l) return null;
              return l.is_active ? l.city : `${l.city} (zurzeit nicht aktiv)`;
            }).filter(Boolean);
            if (w.text) parts.push(`zusätzlich gemeldet: ${w.text}`);
            t.bewerbung_wunsch_display = parts.length ? parts.join(', ') : null;
            t.bewerbung_wunsch_active_ids = wishIds.filter(id => locMap[id] && locMap[id].is_active);
          });
        }
      } catch (e) {
        console.error('Bewerbungs-Wunsch-Aufloesung fehlgeschlagen:', e?.message || e);
      }

      return res.json({ data });
    }

    case 'active_trainers': {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('id, full_name')
        .eq('status', 'active')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return res.json({ data });
    }

    case 'pending_trainers': {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('id, full_name, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data });
    }

    case 'recent_trainers': {
      const n = parseInt(limit) || 5;
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('id, full_name, email, city, status, created_at')
        .order('created_at', { ascending: false })
        .limit(n);
      if (error) throw error;
      return res.json({ data });
    }

    case 'all_bookings': {
      // Teilspec 1: PT + GT liegen in derselben Tabelle bookings — PT-Filter
      // nur auf 'pt_einzel', sonst Doppler mit fetchGroupParticipantsAsBookings.
      const [ptResult, gtRows] = await Promise.all([
        supabase.from('bookings').select('*').eq('art', 'pt_einzel').order('scheduled_date', { ascending: false }),
        fetchGroupParticipantsAsBookings(supabase),
      ]);
      if (ptResult.error) throw ptResult.error;
      const enriched = await enrichBookings(supabase, ptResult.data || []);
      const combined = [...enriched, ...gtRows]
        .sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''));
      return res.json({ data: combined });
    }

    case 'recent_bookings': {
      // Teilspec 1: nur PT-Einzeltrainings; GT-Teilnahmen werden ueber 'all_bookings' eingeblendet.
      const n = parseInt(limit) || 5;
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('art', 'pt_einzel')
        .order('created_at', { ascending: false })
        .limit(n);
      if (error) throw error;
      const enriched = await enrichBookings(supabase, data || []);
      return res.json({ data: enriched });
    }

    case 'finances': {
      // Teilspec 1: PT auf art='pt_einzel' filtern, sonst Doppler mit fetchGroupParticipantsAsBookings.
      const [ptResult, gtRows] = await Promise.all([
        supabase.from('bookings').select('*').eq('art', 'pt_einzel').order('scheduled_date', { ascending: false }),
        fetchGroupParticipantsAsBookings(supabase),
      ]);
      if (ptResult.error) throw ptResult.error;
      const enriched = await enrichBookings(supabase, ptResult.data || []);
      const combined = [...enriched, ...gtRows]
        .sort((a, b) => (b.scheduled_date || '').localeCompare(a.scheduled_date || ''));
      return res.json({ data: combined });
    }

    case 'credits': {
      const { data, error } = await supabase
        .from('gutschriften')
        .select('*')
        .order('ausgestellt_am', { ascending: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      return res.json({ data: data || [] });
    }

    case 'active_locations': {
      const { data, error } = await supabase
        .from('service_locations')
        .select('*')
        .eq('is_active', true)
        .order('city');
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      return res.json({ data: data || [] });
    }

    case 'service_locations': {
      const { data, error } = await supabase
        .from('service_locations')
        .select('*')
        .order('city');
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      return res.json({ data: data || [] });
    }

    case 'all_groups': {
      const { data, error } = await supabase
        .from('group_classes')
        .select('*')
        .order('scheduled_date', { ascending: false, nullsFirst: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      const groups = data || [];
      // B-2026-06-11-01: Teilnehmerzahl je Kurs aus bookings (art='gt_teilnahme')
      // zaehlen. Die alte Spalte group_classes.current_participants existiert NICHT
      // mehr (GT-Teilnahmen liegen seit Teilspec 1 in bookings) → die Kursliste +
      // KPIs in admin/groups.html zeigten ueberall „0/12". Nicht-stornierte
      // Teilnahmen = angemeldet (analog Trainer-Portal pcMap + fetchGroupParticipantsAsBookings).
      if (groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        // B-2026-06-10-01 A11: zusaetzlich zur Teilnehmerzahl (current_participants,
        // B-2026-06-11-01) den REALISIERTEN Umsatz je Kurs aus BEZAHLTEN Teilnahmen
        // aggregieren (paid_revenue_cents). gt_cards/Karten-Teilnahmen sind ohne
        // Einzel-paid-Flag; hier zaehlen die bezahlten Einzel-Buchungen. Frontend
        // (admin/groups.html Monats-KPI) nutzt paid_revenue_cents statt Prognose.
        const { data: parts } = await supabase
          .from('bookings')
          .select('group_class_id, paid, price_cents, final_price_cents')
          .eq('art', 'gt_teilnahme')
          .in('group_class_id', groupIds)
          .neq('status', 'storniert');
        const countByClass = {};
        const paidRevByClass = {};
        (parts || []).forEach(p => {
          if (!p.group_class_id) return;
          countByClass[p.group_class_id] = (countByClass[p.group_class_id] || 0) + 1;
          if (p.paid) {
            paidRevByClass[p.group_class_id] =
              (paidRevByClass[p.group_class_id] || 0) + (p.final_price_cents ?? p.price_cents ?? 0);
          }
        });
        groups.forEach(g => {
          g.current_participants = countByClass[g.id] || 0;
          g.paid_revenue_cents   = paidRevByClass[g.id] || 0;
        });
      }
      return res.json({ data: groups });
    }

    case 'group_participants': {
      if (!group_id) return res.status(400).json({ error: 'group_id fehlt' });
      // Teilspec 1: GT-Teilnahmen liegen in bookings (art='gt_teilnahme').
      // Status auf Legacy-Wert mappen, damit Frontend-Vergleiche (cancelled/refunded) weiter matchen.
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('art', 'gt_teilnahme')
        .eq('group_class_id', group_id)
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      // B-2026-06-07-06: bookings hat customer_name/email/phone NICHT mehr direkt
      // (GT-Teilnahmen wurden nach bookings migriert) → Kundendaten per JOIN auf
      // customers nachladen, sonst zeigt groups.html Name/E-Mail/Telefon als „–"
      // (Teilnehmerliste wirkte leer). Status-Mapping (withFrontendStatus) bleibt.
      const partCustomerIds = [...new Set((data || []).map(b => b.customer_id).filter(Boolean))];
      const partCustomerMap = {};
      if (partCustomerIds.length > 0) {
        const { data: custs } = await supabase
          .from('customers')
          .select('id, full_name, first_name, last_name, email, phone')
          .in('id', partCustomerIds);
        if (custs) custs.forEach(c => { partCustomerMap[c.id] = c; });
      }
      const mapped = (data || []).map(row => {
        const c = partCustomerMap[row.customer_id] || {};
        return {
          ...row,
          status: mapStatusForFrontend(row),
          customer_name:
            row.customer_name
            || c.full_name
            || [c.first_name, c.last_name].filter(Boolean).join(' ')
            || c.email
            || '–',
          customer_email: row.customer_email || c.email || null,
          customer_phone: row.customer_phone || c.phone || null,
        };
      });
      return res.json({ data: mapped });
    }

    case 'all_customers': {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      return res.json({ data: data || [] });
    }

    case 'customer_bookings': {
      const customerId = req.query.customer_id;
      if (!customerId) return res.status(400).json({ error: 'customer_id fehlt' });
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('customer_id', customerId)
        .order('scheduled_date', { ascending: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      const enriched = await enrichBookings(supabase, data || []);
      return res.json({ data: enriched });
    }

    // ─── Abo-Mapping (B-2026-05-14-02 / Vorgang 8) ────────────────────────
    // Liefert die fuenf Steuer-Spalten fuer einen einzelnen Kunden:
    // subscription_tier / subscription_until / subscription_synced_at sind
    // read-only (kommen ueber den RevenueCat-Webhook von Apple), die beiden
    // bookings_unlock_*-Felder werden ueber /api/customer-promotion gesetzt.
    case 'customer_subscription': {
      const customerId = req.query.customer_id;
      if (!customerId) return res.status(400).json({ error: 'customer_id fehlt' });
      const { data, error } = await supabase
        .from('customers')
        .select('id, subscription_tier, subscription_until, subscription_source, subscription_synced_at, bookings_unlocked_until, bookings_unlock_note, bookings_unlock_set_by, bookings_unlock_set_at')
        .eq('id', customerId)
        .maybeSingle();
      if (error) {
        // Spalten existieren noch nicht (Migration nicht durch) → leere
        // Antwort mit gleicher Shape, Frontend zeigt dann „–".
        if (error.code === '42703' || error.code === '42P01') {
          return res.json({
            id: customerId,
            subscription_tier: null,
            subscription_until: null,
            subscription_source: null,
            subscription_synced_at: null,
            bookings_unlocked_until: null,
            bookings_unlock_note: null,
            bookings_unlock_set_by: null,
            bookings_unlock_set_at: null,
          });
        }
        throw error;
      }
      if (!data) return res.status(404).json({ error: 'Kunde nicht gefunden' });
      return res.json(data);
    }

    // ─── Calendar: Trainer mit Einsatzorten (für Filter) ────────────────
    case 'calendar_trainers': {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('id, full_name, city, status')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      // Einsatzorte anreichern — Kalender-Stadtfilter nutzt t.cities, NICHT den Wohnort (B-2026-06-02-04/05).
      try {
        await enrichTrainersWithCities(supabase, data || []);
      } catch (e) {
        console.error('calendar_trainers cities-Anreicherung fehlgeschlagen:', e?.message || e);
      }
      return res.json({ data: data || [] });
    }

    // ─── Calendar: Availability für mehrere Trainer ───────────────────
    case 'calendar_availability': {
      const trainerIds = req.query.trainer_ids ? req.query.trainer_ids.split(',') : [];
      if (trainerIds.length === 0) return res.json({ data: [] });
      const { data, error } = await supabase
        .from('trainer_availability')
        .select('trainer_id, day_of_week, start_hour, end_hour, start_time, end_time, specific_date, series_id, is_active')
        .in('trainer_id', trainerIds)
        .eq('is_active', true);
      if (error) throw error;
      return res.json({ data: data || [] });
    }

    // ─── Customer Names (für Trainer-Portal) ───────────────────────────
    case 'customer_names': {
      const ids = req.query.ids ? req.query.ids.split(',').filter(Boolean) : [];
      if (ids.length === 0) return res.json({ data: [] });
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, first_name, last_name')
        .in('id', ids);
      if (error) throw error;
      return res.json({ data: data || [] });
    }

    // ─── No-Show Teil 2 (Phase A): Kunden-Telefon NUR fuer den eigenen aktiven ──
    // Termin des anfragenden Trainers. Datenschutz: keine breite Telefon-Liste —
    // der Trainer bekommt die Nummer ausschliesslich fuer EINE eigene Buchung,
    // und nur waehrend der Termin aktiv/strittig ist (kein Abgreifen aus Altdaten).
    case 'no_show_customer_phone': {
      const caller = await getCallerInfo(req);
      if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });
      const bookingId = req.query.booking_id;
      if (!bookingId || !UUID_RE.test(bookingId)) return res.status(400).json({ error: 'booking_id fehlt/ungueltig' });

      const { data: bk } = await supabase
        .from('bookings')
        .select('trainer_id, customer_id, status')
        .eq('id', bookingId).maybeSingle();
      if (!bk) return res.status(404).json({ error: 'Buchung nicht gefunden' });

      // Ownership: Trainer darf nur seine EIGENE Buchung abfragen (fremde trainer_id
      // bringt nichts — wir leiten das Profil aus dem Token ab). Admin darf immer.
      if (caller.actorType !== 'admin') {
        const { data: tp } = await supabase.from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
        if (!tp || tp.id !== bk.trainer_id) return res.status(403).json({ error: 'Kein Zugriff auf diese Buchung' });
      }
      if (!['bestaetigt', 'strittig', 'laeuft gerade'].includes(bk.status)) {
        return res.status(403).json({ error: 'Telefonnummer nur waehrend des aktiven Termins' });
      }
      if (!bk.customer_id) return res.json({ phone: null });
      const { data: cust } = await supabase.from('customers').select('phone').eq('id', bk.customer_id).maybeSingle();
      return res.json({ phone: cust?.phone ?? null });
    }

    // ─── GT-Teilnehmer-Kontakte (Name + Telefon) — B-2026-06-07-06 ──────────────
    // Trainer + Admin sollen die Teilnehmer ihrer Gruppenkurse mit Klarname +
    // Telefon sehen (so wie bei Einzeltraining). Datenschutz: server-seitig auf
    // die EIGENEN Kurse des Trainers gescopt (trainer_profiles via auth_user_id),
    // Admin sieht alle. Der Client kann KEINE fremden customer_ids abgreifen —
    // es werden ausschliesslich Teilnehmer der erlaubten Kurse zurueckgegeben.
    case 'gt_participant_contacts': {
      const caller = await getCallerInfo(req);
      if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

      let classQuery = supabase.from('group_classes').select('id');
      if (caller.actorType === 'admin') {
        if (req.query.group_id) classQuery = classQuery.eq('id', req.query.group_id);
      } else {
        const { data: tp } = await supabase
          .from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
        if (!tp) return res.status(403).json({ error: 'Kein Trainer-Profil' });
        classQuery = classQuery.eq('trainer_id', tp.id);
        if (req.query.group_id) classQuery = classQuery.eq('id', req.query.group_id);
      }
      const { data: classes } = await classQuery;
      const classIds = (classes || []).map(c => c.id);
      if (classIds.length === 0) return res.json({ data: {} });

      const { data: parts } = await supabase
        .from('bookings')
        .select('customer_id')
        .eq('art', 'gt_teilnahme')
        .in('group_class_id', classIds)
        .neq('status', 'storniert');
      const custIds = [...new Set((parts || []).map(p => p.customer_id).filter(Boolean))];
      if (custIds.length === 0) return res.json({ data: {} });

      const { data: custs } = await supabase
        .from('customers')
        .select('id, full_name, first_name, last_name, phone, email')
        .in('id', custIds);
      const contactMap = {};
      (custs || []).forEach(c => {
        contactMap[c.id] = {
          customer_name:
            c.full_name
            || [c.first_name, c.last_name].filter(Boolean).join(' ')
            || c.email
            || 'Teilnehmer',
          customer_phone: c.phone || null,
          customer_email: c.email || null,
        };
      });
      return res.json({ data: contactMap });
    }

    // ─── Calendar: Bookings für Woche + Trainer ───────────────────────
    case 'calendar_bookings': {
      const trainerIds = req.query.trainer_ids ? req.query.trainer_ids.split(',') : [];
      const weekStart = req.query.week_start;
      const weekEnd = req.query.week_end;
      if (trainerIds.length === 0 || !weekStart || !weekEnd) return res.json({ data: [] });
      // Teilspec 1: nur PT-Einzeltrainings; Status auf Legacy-Wert mappen.
      // Flag-Spalten + storno-Felder mitladen, damit mapStatusForFrontend richtig mappen kann.
      const { data, error } = await supabase
        .from('bookings')
        .select('id, trainer_id, customer_id, scheduled_date, scheduled_time, status, price_cents, trainer_payout_cents, booking_type, art, flag_neuer_termin_vorgeschlagen, flag_neuer_ort_vorgeschlagen, flag_checkout_bestaetigung_ausstehend, flag_zahlung_offen, storno_wer, storno_grund')
        .in('trainer_id', trainerIds)
        .eq('art', 'pt_einzel')
        .gte('scheduled_date', weekStart)
        .lte('scheduled_date', weekEnd);
      if (error) throw error;
      return res.json({ data: (data || []).map(withFrontendStatus) });
    }

    // ─── Calendar: Group classes für Trainer ──────────────────────────
    case 'calendar_groups': {
      const trainerIds = req.query.trainer_ids ? req.query.trainer_ids.split(',') : [];
      if (trainerIds.length === 0) return res.json({ data: [] });
      const { data, error } = await supabase
        .from('group_classes')
        .select('id, name, trainer_id, scheduled_date, scheduled_time, start_time, day_of_week, is_active, price_per_person_cents, max_participants')
        .in('trainer_id', trainerIds)
        .eq('is_active', true);
      if (error) throw error;
      return res.json({ data: data || [] });
    }

    // ─── Calendar Modal: Kunde + Trainer Details ──────────────────────
    case 'booking_detail': {
      const bookingCustomerId = req.query.customer_id;
      const bookingTrainerId = req.query.trainer_id;
      const result = {};

      if (bookingCustomerId) {
        const { data: cust } = await supabase
          .from('customers')
          .select('full_name, email, phone')
          .eq('id', bookingCustomerId)
          .single();
        result.customer = cust || {};

        const { data: hd } = await supabase
          .from('customer_health_data')
          .select('health_notes, limitations')
          .eq('customer_id', bookingCustomerId)
          .single();
        result.health = hd || null;
      }

      if (bookingTrainerId) {
        const { data: trainer } = await supabase
          .from('trainer_profiles')
          .select('full_name, phone')
          .eq('id', bookingTrainerId)
          .single();
        result.trainer = trainer || {};
      }

      return res.json(result);
    }

    // ─── Angeschriebene Ersatz-Trainer einer Buchung (B-2026-06-02-03) ──
    case 'replacement_requests': {
      const rrBookingId = stripGpPrefix(req.query.booking_id);
      if (!rrBookingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rrBookingId)) {
        return res.status(400).json({ error: 'booking_id (uuid) erforderlich' });
      }
      const { data, error } = await supabase
        .from('replacement_requests')
        .select('candidate_trainer_id, status, sent_at, answered_at, trainer_profiles(full_name)')
        .eq('booking_id', rrBookingId)
        .order('sent_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: data ?? [] });
    }

    // ─── Beweis-Auszuege zu einer Buchung (No-Show Teil 3 B5) ─────────────────
    // Admin-only (NICHT in trainerAllowedTypes) — Beweis-PDFs sind vertraulich.
    case 'booking_evidence': {
      const beBookingId = stripGpPrefix(req.query.booking_id);
      if (!beBookingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(beBookingId)) {
        return res.status(400).json({ error: 'booking_id (uuid) erforderlich' });
      }
      const { data: beRows, error: beErr } = await supabase
        .from('booking_evidence')
        .select('id, pdf_path, trigger, admin_outcome, created_at')
        .eq('booking_id', beBookingId)
        .order('created_at', { ascending: false });
      if (beErr) return res.status(500).json({ error: beErr.message });
      // Signed-URLs (60 Min, wie invoice-pdf) fuer den Vorschau-Knopf — Bucket privat.
      const beWithUrls = [];
      for (const r of (beRows ?? [])) {
        const { data: signed } = await supabase.storage.from('invoices').createSignedUrl(r.pdf_path, 3600);
        beWithUrls.push({ ...r, signed_url: signed?.signedUrl ?? null });
      }
      return res.json({ data: beWithUrls });
    }

    // ─── Belege zu einer Buchung (B-2026-06-17-01) ────────────────────────────
    // Alle zu dieser Buchung gehoerenden Belege (Rechnung, Gutschrift,
    // Storno-Gutschrift, Stornobeleg, …). Verbindung wie in booking_audit_log:
    // booking_id (PT) ODER group_participant_id (GT-Bridge, 1:1 gespiegelt).
    // Admin-only (NICHT in trainerAllowedTypes) — Honorar-/Belegdaten vertraulich.
    // PDF-Oeffnen laeuft ueber den bestehenden 'invoice-pdf'-Endpunkt (id).
    case 'booking_invoices': {
      const biBookingId = stripGpPrefix(req.query.booking_id);
      if (!biBookingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(biBookingId)) {
        return res.status(400).json({ error: 'booking_id (uuid) erforderlich' });
      }
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, type, status, total_cents, storno_ref, issued_at, recipient_name, pdf_path')
        .or(`booking_id.eq.${biBookingId},group_participant_id.eq.${biBookingId}`)
        .order('issued_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: data ?? [] });
    }

    // ─── Status-Logbuch zu einer Buchung (booking_audit + payment_events + invoice_audit) ──
    case 'booking_audit_log': {
      const bookingId = stripGpPrefix(req.query.booking_id);
      if (!bookingId) return res.status(400).json({ error: 'booking_id fehlt' });
      // UUID-Format-Pruefung (verhindert PostgREST-Fehler + reduziert Angriffsflaeche)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
        return res.status(400).json({ error: 'booking_id ist keine gueltige UUID' });
      }

      // Schritt 1: alle Rechnungen finden, die zu dieser Buchung gehoeren.
      // booking_id ist die normale Verbindung; group_participant_id ist die Legacy-Bridge
      // (Phase-2-Migration hat die IDs 1:1 von gp.id nach bookings.id gespiegelt).
      const { data: invoicesForBooking } = await supabase
        .from('invoices')
        .select('id, invoice_number, storno_ref')
        .or(`booking_id.eq.${bookingId},group_participant_id.eq.${bookingId}`);
      const invoiceIdToNumber = new Map((invoicesForBooking || []).map(i => [i.id, i.invoice_number || i.storno_ref || i.id.slice(0, 8)]));
      const invoiceIds = (invoicesForBooking || []).map(i => i.id);

      // Schritt 2: vier Quellen parallel laden.
      const [auditRes, payRes, invAuditRes, cashRes] = await Promise.all([
        supabase.from('booking_audit')
          .select('id, action, actor_type, actor_id, details, created_at')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('payment_events')
          .select('id, action, actor_type, actor_id, details, amount_cents, currency, stripe_object_type, stripe_object_id, occurred_at')
          .eq('entity_id', bookingId)
          // Wichtig: entity_type beschraenken — sonst koennen UUIDs aus 'gt_card'-Events
          // zufaellig mit bookings.id kollidieren und falsche Eintraege auftauchen.
          // 'group_participant' ist die Legacy-Bridge (Phase-2-Migration spiegelt IDs 1:1).
          .in('entity_type', ['booking', 'group_participant'])
          .order('occurred_at', { ascending: false })
          .limit(200),
        invoiceIds.length > 0
          ? supabase.from('invoice_audit')
            .select('id, invoice_id, action, actor_type, actor_id, details, timestamp')
            .in('invoice_id', invoiceIds)
            .order('timestamp', { ascending: false })
            .limit(200)
          : Promise.resolve({ data: [], error: null }),
        // cash_payment_audit — Teilspec-2 Bar-Zahlung. booking_id ist direkter FK.
        supabase.from('cash_payment_audit')
          .select('id, action, actor_type, actor_id, amount_cents, pulsly_anteil_cents, details, occurred_at')
          .eq('booking_id', bookingId)
          .order('occurred_at', { ascending: false })
          .limit(200),
      ]);

      // Schritt 3: zu einem einzigen Strom zusammenfuehren + chronologisch sortieren.
      const events = [
        ...(auditRes.data || []).map(e => ({
          kind: 'booking',
          at: e.created_at,
          action: e.action,
          actor_type: e.actor_type,
          actor_id: e.actor_id,
          details: e.details,
        })),
        ...(payRes.data || []).map(e => ({
          kind: 'payment',
          at: e.occurred_at,
          action: e.action,
          actor_type: e.actor_type,
          actor_id: e.actor_id,
          details: e.details,
          amount_cents: e.amount_cents,
          currency: e.currency,
          stripe_object_type: e.stripe_object_type,
          stripe_object_id: e.stripe_object_id,
        })),
        ...(invAuditRes.data || []).map(e => ({
          kind: 'invoice',
          at: e.timestamp,
          action: e.action,
          actor_type: e.actor_type,
          actor_id: e.actor_id,
          details: e.details,
          invoice_label: invoiceIdToNumber.get(e.invoice_id) || null,
        })),
        ...(cashRes.data || []).map(e => ({
          kind: 'cash',
          at: e.occurred_at,
          action: e.action,
          actor_type: e.actor_type,
          actor_id: e.actor_id,
          amount_cents: e.amount_cents,
          // Spalten pulsly_anteil_cents + abgeleiteter trainer_anteil_cents werden in
          // formatAuditDetails als details-Felder erwartet — direkt ins details-Objekt
          // mergen, damit die Frontend-Render-Logik kein neues Schema lernen muss.
          // Trainer-Anteil ist rechnerisch (Gesamt minus Pulsly-Anteil), keine eigene Spalte.
          details: {
            ...(e.details || {}),
            pulsly_anteil_cents: e.pulsly_anteil_cents,
            trainer_anteil_cents: (e.amount_cents != null && e.pulsly_anteil_cents != null)
              ? e.amount_cents - e.pulsly_anteil_cents
              : null,
          },
        })),
      ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

      return res.json({ data: events });
    }

    // ─── Personen-Logbuch Kunde (Admin): voller Verlauf inkl. Geld-Vorgaenge ──
    case 'customer_audit_log': {
      const customerId = req.query.customer_id;
      if (!customerId || !UUID_RE.test(customerId)) return res.status(400).json({ error: 'customer_id fehlt/ungueltig' });
      const events = await buildPersonAuditLog(supabase, { column: 'customer_id', personId: customerId, mode: 'full' });
      return res.json({ data: events });
    }

    // ─── Personen-Logbuch Trainer: Admin voll, Trainer eigen + OHNE Geld ──────
    case 'trainer_audit_log': {
      const caller = await getCallerInfo(req);
      if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });
      let trainerId, mode;
      const queryTid = req.query.trainer_id;
      if (caller.actorType === 'admin' && queryTid) {
        // Admin-Detailseite uebergibt eine trainer_id -> Voll-Sicht (mit Geld).
        trainerId = queryTid; mode = 'full';
      } else {
        // Trainer-Portal-Kontext (KEIN trainer_id-Param): immer den EIGENEN Trainer
        // ableiten, betrieblich/ohne Geld. Gilt auch fuer Doppelrollen 'admin,trainer'
        // (sonst landet ein admin,trainer-Konto faelschlich im Admin-Zweig ohne Param).
        // Sicherheit: ein Trainer kann durch Mitschicken einer fremden trainer_id NICHT
        // fremde Daten sehen — wir nehmen IMMER sein eigenes Profil.
        const { data: tp } = await supabase.from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
        if (!tp) return res.status(403).json({ error: 'Kein Trainer-Profil fuer diesen Account' });
        trainerId = tp.id; mode = 'trainer';
      }
      if (!trainerId || !UUID_RE.test(trainerId)) return res.status(400).json({ error: 'trainer_id fehlt/ungueltig' });
      const events = await buildPersonAuditLog(supabase, { column: 'trainer_id', personId: trainerId, mode });
      return res.json({ data: events });
    }

    // ─── Status-Logbuch zu einer 10er-Karte (payment_events + invoice_audit) ──
    // Analog zu booking_audit_log, aber fuer Karten:
    //  - payment_events mit entity_type='gt_card' (Kauf, Rueckgabe, Failed)
    //  - invoice_audit ueber invoices.gt_card_id (Rechnung + Stornobeleg)
    //  - Karten haben KEIN booking_audit (kein booking_id-Feld) und KEINE Bar-Zahlung
    case 'card_audit_log': {
      const cardId = req.query.card_id;
      if (!cardId) return res.status(400).json({ error: 'card_id fehlt' });
      // UUID-Format-Pruefung
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardId)) {
        return res.status(400).json({ error: 'card_id ist keine gueltige UUID' });
      }

      // Schritt 1: Karte selbst laden (fuer synthetische Eintraege)
      const { data: card } = await supabase
        .from('gt_cards')
        .select('id, created_at, purchased_at, expires_at, is_active, sessions_total, sessions_remaining, customer_id, card_type_id, invoice_id, storno_invoice_id')
        .eq('id', cardId)
        .maybeSingle();

      // Schritt 2: alle Rechnungen finden, die zu dieser Karte gehoeren
      // (Original-Rechnung + Stornobeleg)
      const { data: invoicesForCard } = await supabase
        .from('invoices')
        .select('id, invoice_number, storno_ref')
        .eq('gt_card_id', cardId);
      const invoiceIdToNumber = new Map((invoicesForCard || []).map(i => [i.id, i.invoice_number || i.storno_ref || i.id.slice(0, 8)]));
      const invoiceIds = (invoicesForCard || []).map(i => i.id);

      // Schritt 3: zwei Quellen parallel laden (payment_events + invoice_audit)
      const [payRes, invAuditRes] = await Promise.all([
        supabase.from('payment_events')
          .select('id, action, actor_type, actor_id, details, amount_cents, currency, stripe_object_type, stripe_object_id, occurred_at')
          .eq('entity_id', cardId)
          .eq('entity_type', 'gt_card')
          .order('occurred_at', { ascending: false })
          .limit(200),
        invoiceIds.length > 0
          ? supabase.from('invoice_audit')
            .select('id, invoice_id, action, actor_type, actor_id, details, timestamp')
            .in('invoice_id', invoiceIds)
            .order('timestamp', { ascending: false })
            .limit(200)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Schritt 4: zu einem einzigen Strom zusammenfuehren
      const events = [
        ...(payRes.data || []).map(e => ({
          kind: 'payment',
          at: e.occurred_at,
          action: e.action,
          actor_type: e.actor_type,
          actor_id: e.actor_id,
          details: e.details,
          amount_cents: e.amount_cents,
          currency: e.currency,
          stripe_object_type: e.stripe_object_type,
          stripe_object_id: e.stripe_object_id,
        })),
        ...(invAuditRes.data || []).map(e => ({
          kind: 'invoice',
          at: e.timestamp,
          action: e.action,
          actor_type: e.actor_type,
          actor_id: e.actor_id,
          details: e.details,
          invoice_label: invoiceIdToNumber.get(e.invoice_id) || null,
        })),
      ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

      // Schritt 5: Karte-Spalten als zusaetzlichen Kontext mitliefern
      // (fuer synthetische Eintraege im Frontend: Kauf-Datum, Ablauf, Sessions)
      return res.json({
        data: events,
        card: card ? {
          id: card.id,
          created_at: card.created_at,
          purchased_at: card.purchased_at,
          expires_at: card.expires_at,
          is_active: card.is_active,
          sessions_total: card.sessions_total,
          sessions_remaining: card.sessions_remaining,
        } : null,
      });
    }

    // ─── Dashboard KPIs (exakte Berechnungen) ─────────────────────────
    case 'dashboard_kpis': {
      const mondayISO = req.query.monday;
      const monthISO = req.query.month_start;

      const [trainersRes, pendingRes, weekBookingsRes, monthRevenueRes] = await Promise.all([
        supabase.from('trainer_profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('trainer_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('scheduled_date', mondayISO).in('status', ['bestaetigt', 'laeuft gerade', 'abgeschlossen']),
        supabase.from('bookings').select('price_cents, final_price_cents, paid').eq('status', 'abgeschlossen').gte('scheduled_date', monthISO),
      ]);

      return res.json({
        active_trainers: trainersRes.count ?? 0,
        pending_trainers: pendingRes.count ?? 0,
        week_bookings: weekBookingsRes.count ?? 0,
        // B-2026-06-10-01: final_price_cents (nach Rabatt, von Stripe belastet) statt
        // price_cents (Listenpreis) + nur bezahlte zählen — analog kpi_revenue_month
        // (B-2026-05-14-50). status='abgeschlossen' schliesst Storno/disputed bereits aus.
        month_revenue_cents: (monthRevenueRes.data || []).reduce((sum, b) => sum + (b.paid ? (b.final_price_cents ?? b.price_cents ?? 0) : 0), 0),
      });
    }

    // ─── Testers: Alle laden ──────────────────────────────────────────
    case 'all_testers': {
      const { data, error } = await supabase
        .from('test_users')
        .select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      return res.json({ data: data || [] });
    }

    case 'booking_locations': {
      // GT-Buchungen kommen mit gp_-Prefix — strippen, sonst leere Antwort statt Treffer.
      const bookingId = stripGpPrefix(req.query?.bookingId)
      if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId required' })
      const { data, error } = await supabase.from('booking_locations').select('*').eq('booking_id', bookingId).order('sort_order')
      if (error) return res.status(500).json({ success: false, error: error.message })
      return res.json({ success: true, data })
    }

    case 'trainer_vacations': {
      const trainerIds = (req.query.trainer_ids || '').split(',').filter(Boolean);
      let query = supabase.from('trainer_vacations').select('*, trainer_profiles(full_name)');
      if (trainerIds.length) query = query.in('trainer_id', trainerIds);
      query = query.order('start_date', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ data: (data || []).map(v => ({
        ...v,
        trainer_name: v.trainer_profiles?.full_name || null
      })) });
    }

    case 'discount_codes': {
      const trainerId = req.query.trainer_id;
      let query = supabase.from('discount_codes').select('*, trainer_profiles:source_trainer_id(full_name)');
      if (trainerId) query = query.eq('source_trainer_id', trainerId);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ data: (data || []).map(dc => ({
        ...dc,
        source_trainer_name: dc.trainer_profiles?.full_name || null
      })) });
    }

    case 'gt_card_types': {
      const { data, error } = await supabase
        .from('gt_card_types')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return res.json({ data: data || [] });
    }

    case 'gt_cards': {
      const { data, error } = await supabase
        .from('gt_cards')
        .select('*, gt_card_types(name, unit_price_cents, sessions_count, discount_percent), customers(full_name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
    }

    case 'gt_card_bookings': {
      const cardId = req.query.card_id;
      if (!cardId) return res.status(400).json({ error: 'card_id required' });
      // Teilspec 1: Karten-Buchungen liegen in bookings (art='gt_teilnahme' + gt_card_id).
      // Status auf Legacy-Wert fuers Frontend mappen.
      const { data, error } = await supabase
        .from('bookings')
        .select('*, group_classes(name, scheduled_date, scheduled_time)')
        .eq('art', 'gt_teilnahme')
        .eq('gt_card_id', cardId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json((data || []).map(withFrontendStatus));
    }

    case 'customers': {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, first_name, last_name, email, phone')
        .order('full_name', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return res.json({ data: (data || []).map((c) => ({
        ...c,
        full_name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email || '–',
      })) });
    }

    default:
      return res.status(400).json({ error: `Unbekannter Datentyp: ${type}` });
  }
}

// ─── ACTION: trainers ────────────────────────────────────────────────────────

// Kanonischer Wertesatz fuer trainer_profiles.status (englisch). Quelle der Wahrheit
// fuer ALLE Filter/RLS/App/Ersatz-Suche. Spiegelt den DB-CHECK-Constraint
// trainer_profiles_status_chk. KEINE deutschen Varianten ('aktiv') zulassen.
const VALID_TRAINER_STATUS = ['pending', 'active', 'gesperrt'];

async function handleTrainersPost(req, res, supabase) {
  const body = await getBody(req);
  const { full_name, email, phone, city, street_address, postal_code, wohnort, specializations, bio, steuernummer, is_kleinunternehmer, hourly_rate_cents, payout_cents, status, city_ids } = body;

  if (status != null && !VALID_TRAINER_STATUS.includes(status)) {
    return res.status(400).json({ error: `Ungueltiger Status '${status}'. Erlaubt: ${VALID_TRAINER_STATUS.join(', ')}.` });
  }

  const hasCityIds = Array.isArray(city_ids) && city_ids.length > 0;

  // Stadtname fürs Übergangsfeld: aus city ODER aus der ersten gewählten Stadt.
  let cityName = city;
  if (!cityName && hasCityIds) {
    const { data: sl } = await supabase.from('service_locations').select('city').eq('id', city_ids[0]).single();
    cityName = sl?.city || null;
  }

  if (!full_name || !email || !cityName) {
    return res.status(400).json({ error: 'Name, E-Mail und mindestens eine Stadt sind Pflichtfelder' });
  }

  const { data, error } = await supabase.from('trainer_profiles').insert({
    full_name,
    email: email.trim().toLowerCase(),
    phone: phone || null,
    city: cityName,
    street_address: street_address || null,
    postal_code: postal_code || null,
    wohnort: wohnort || null,
    specializations: specializations || null,
    bio: bio || null,
    steuernummer: steuernummer || null,
    is_kleinunternehmer: is_kleinunternehmer || false,
    hourly_rate_cents: hourly_rate_cents || null,
    payout_cents: payout_cents || null,
    status: status || 'pending',
    is_active: false,
  }).select();

  if (error) throw error;

  // K3: bei Mehrfach-Auswahl die Städte atomar über die RPC setzen.
  const newId = data?.[0]?.id;
  if (newId && hasCityIds) {
    const { error: rpcErr } = await supabase.rpc('trainer_set_cities', {
      p_trainer_id: newId,
      p_city_ids: city_ids,
    });
    if (rpcErr) throw rpcErr;
  }

  return res.json({ success: true, data: data?.[0] });
}

async function handleTrainersPut(req, res, supabase) {
  const body = await getBody(req);
  // K7: city_ids gehört NICHT in die trainer_profiles-Allow-List (eigene Junction).
  const { trainerId, city_ids, ...fields } = body;

  if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });

  const hasCityIds = Array.isArray(city_ids);
  if (hasCityIds && city_ids.length === 0) {
    return res.status(400).json({ error: 'Mindestens eine Stadt ist erforderlich' });
  }

  const allowed = [
    'full_name', 'email', 'phone', 'city', 'specializations', 'bio',
    'steuernummer', 'is_kleinunternehmer', 'mwst_satz', 'street_address', 'postal_code', 'wohnort',
    'status', 'hourly_rate_cents', 'payout_cents', 'contract_files', 'avatar_url',
  ];

  const update = {};
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }
  // Wenn Städte über city_ids kommen, besitzt die RPC das city-Feld (erste Stadt).
  if (hasCityIds) delete update.city;

  if ('status' in update && !VALID_TRAINER_STATUS.includes(update.status)) {
    return res.status(400).json({ error: `Ungueltiger Status '${update.status}'. Erlaubt: ${VALID_TRAINER_STATUS.join(', ')}.` });
  }

  // B-2026-06-27-01: status und is_active dürfen sich nie widersprechen.
  // Wird der Status gesetzt, leiten wir is_active daraus ab: nur 'active' ist
  // einsetzbar. So kann das Edit-Formular keinen 'gesperrt'-Trainer mit
  // is_active=true (Portal-Zugang + Sichtbarkeit) hinterlassen.
  if ('status' in update) {
    update.is_active = update.status === 'active';
  }

  // Feld-Update (falls vorhanden) — K4: .select() gegen RLS-Silent-Fail.
  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase.from('trainer_profiles').update(update).eq('id', trainerId).select();
    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Trainer nicht gefunden oder nicht aktualisierbar (RLS?)' });
    }
  } else if (!hasCityIds) {
    return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
  }

  // K3: Städte atomar über die RPC setzen (DELETE+INSERT+city-Übergang in einer Transaktion).
  if (hasCityIds) {
    const { error: rpcErr } = await supabase.rpc('trainer_set_cities', {
      p_trainer_id: trainerId,
      p_city_ids: city_ids,
    });
    if (rpcErr) throw rpcErr;
  }

  return res.json({ success: true });
}

// ─── ACTION: activate-trainer ────────────────────────────────────────────────

async function handleActivateTrainer(req, res, supabase) {
  const body = await getBody(req);
  const { trainerId } = body;

  if (!trainerId) return res.status(400).json({ success: false, error: 'trainerId ist erforderlich' });

  const { data: trainer, error: fetchError } = await supabase
    .from('trainer_profiles')
    .select('id, email, full_name, status, auth_user_id')
    .eq('id', trainerId)
    .single();

  if (fetchError || !trainer) {
    return res.status(404).json({ success: false, error: 'Trainer nicht gefunden' });
  }

  // Reaktivierung: Trainer hatte schon einen Auth-Account und war bereits aktiv
  const isReactivation = !!trainer.auth_user_id && ['active', 'gesperrt'].includes(trainer.status);

  let authUserId = trainer.auth_user_id;

  if (!authUserId) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: trainer.email,
      email_confirm: true,
      user_metadata: {
        full_name: trainer.full_name,
        role: 'trainer',
        trainer_profile_id: trainer.id,
      },
    });

    if (authError) {
      if (authError.message?.includes('already been registered') || authError.status === 422) {
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users?.find(u => u.email === trainer.email);
        if (existing) {
          authUserId = existing.id;
        } else {
          return res.status(500).json({ success: false, error: 'Auth-Account existiert, konnte aber nicht gefunden werden' });
        }
      } else {
        return res.status(500).json({ success: false, error: 'Auth-Account erstellen fehlgeschlagen' });
      }
    } else {
      authUserId = authData.user.id;
    }
  }

  const { error: updateError } = await supabase
    .from('trainer_profiles')
    .update({ status: 'active', is_active: true, auth_user_id: authUserId })
    .eq('id', trainerId);

  if (updateError) {
    return res.status(500).json({ success: false, error: 'Profil-Update fehlgeschlagen', authUserId });
  }

  // Reaktivierung: Nur Status setzen, kein Onboarding
  if (isReactivation) {
    return res.json({ success: true, message: `Trainer ${trainer.full_name} reaktiviert.`, authUserId, trainerId });
  }

  // Erstmalige Aktivierung: Onboarding-Link generieren
  let onboardingLink = null;
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: trainer.email,
    options: { redirectTo: 'https://projektfit.net/trainer-portal/set-password/' }
  });
  if (!linkError && linkData?.properties?.action_link) {
    onboardingLink = linkData.properties.action_link;
  } else {
    // Fallback: Recovery Link
    const { data: recData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: trainer.email,
      options: { redirectTo: 'https://projektfit.net/trainer-portal/set-password/' }
    });
    if (recData?.properties?.action_link) {
      onboardingLink = recData.properties.action_link;
    }
  }

  // E-Mail mit Onboarding-Link ueber Brevo senden
  let emailSent = false;
  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey && onboardingLink) {
    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': brevoKey },
        body: JSON.stringify({
          sender: { name: 'Projekt Fit', email: process.env.BREVO_SENDER_EMAIL || 'dirkbleckmann70@gmail.com' },
          to: [{ email: trainer.email, name: trainer.full_name }],
          subject: 'Willkommen bei Projekt Fit – Dein Trainer-Zugang',
          htmlContent: `<h2>Hallo ${trainer.full_name},</h2>
            <p>willkommen im Team! Dein Trainer-Account bei <strong>Projekt Fit</strong> wurde aktiviert.</p>
            <p>Klicke auf den folgenden Button um dein Passwort zu setzen und dich erstmalig anzumelden:</p>
            <p><a href="${onboardingLink}" style="display:inline-block;padding:14px 28px;background:#40916C;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">Passwort setzen &amp; anmelden</a></p>
            <p style="font-size:13px;color:#666">Dieser Link ist 24 Stunden gueltig. Danach kannst du ueber "Passwort vergessen" auf der <a href="https://projektfit.net/trainer-portal/">Login-Seite</a> einen neuen Link anfordern.</p>
            <p>Viel Erfolg!<br>Dein Projekt Fit Team</p>`
        })
      });
      emailSent = resp.ok;
      if (!resp.ok) {
        const brevoErr = await resp.json().catch(() => ({}));
        console.error('[activate-trainer] Brevo response:', resp.status, brevoErr);
      }
    } catch (e) { console.error('[activate-trainer] Brevo error:', e.message); }
  }

  const msg = emailSent
    ? `Trainer ${trainer.full_name} aktiviert! Onboarding-E-Mail mit Passwort-Link gesendet.`
    : `Trainer ${trainer.full_name} aktiviert. E-Mail konnte nicht gesendet werden.`;
  return res.json({ success: true, message: msg, authUserId, trainerId, onboardingLink: emailSent ? null : onboardingLink });
}

// ─── ACTION: deactivate-trainer ──────────────────────────────────────────────

async function handleDeactivateTrainer(req, res, supabase) {
  const body = await getBody(req);
  const { trainerId } = body;

  if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });

  const { data: trainer, error: fetchError } = await supabase
    .from('trainer_profiles')
    .select('id, full_name, status')
    .eq('id', trainerId)
    .single();

  if (fetchError || !trainer) return res.status(404).json({ error: 'Trainer nicht gefunden' });

  const { error: updateError } = await supabase
    .from('trainer_profiles')
    .update({ status: 'gesperrt', is_active: false })
    .eq('id', trainerId);

  if (updateError) throw updateError;
  return res.json({ success: true, message: `Trainer ${trainer.full_name} deaktiviert` });
}

// ─── ACTION: delete-trainer ──────────────────────────────────────────────────

async function handleDeleteTrainer(req, res, supabase) {
  const body = await getBody(req);
  const { trainerId } = body;

  if (!trainerId) return res.status(400).json({ error: 'trainerId fehlt' });

  const { data: trainer, error: fetchErr } = await supabase
    .from('trainer_profiles')
    .select('id, full_name, status, auth_user_id, license_files, contract_files')
    .eq('id', trainerId)
    .single();

  if (fetchErr || !trainer) return res.status(404).json({ error: 'Trainer nicht gefunden' });
  if (trainer.status === 'active') {
    return res.status(400).json({ error: 'Aktive Trainer können nicht gelöscht werden. Bitte zuerst deaktivieren.' });
  }

  try {
    // 1. Alle GT-Teilnahmen loeschen, deren Kurs diesem Trainer gehoert.
    // Teilspec 1: bookings (art='gt_teilnahme'); Legacy-Tabelle group_participants
    // wird parallel mit aufgeraeumt, falls noch Daten drin liegen.
    const { data: trainerGroups } = await supabase
      .from('group_classes')
      .select('id')
      .eq('trainer_id', trainerId);
    if (trainerGroups && trainerGroups.length > 0) {
      const groupIds = trainerGroups.map(g => g.id);
      const { error: partErr } = await supabase
        .from('bookings')
        .delete()
        .eq('art', 'gt_teilnahme')
        .in('group_class_id', groupIds);
      if (partErr) console.error('bookings (gt_teilnahme) DELETE:', partErr.message);
      const { error: legacyErr } = await supabase
        .from('group_participants')
        .delete()
        .in('group_class_id', groupIds);
      if (legacyErr && legacyErr.code !== '42P01') console.error('group_participants DELETE:', legacyErr.message);
    }

    // 2. group_classes: trainer_id auf NULL setzen
    const { error: gcErr } = await supabase
      .from('group_classes')
      .update({ trainer_id: null })
      .eq('trainer_id', trainerId);
    if (gcErr && gcErr.code !== '42P01') console.error('group_classes UPDATE:', gcErr.message);

    // 3. trainer_availability löschen
    const { error: taErr } = await supabase.from('trainer_availability').delete().eq('trainer_id', trainerId);
    if (taErr && taErr.code !== '42P01') console.error('trainer_availability DELETE:', taErr.message);

    // 4. trainer_reviews löschen
    const { error: trErr } = await supabase.from('trainer_reviews').delete().eq('trainer_id', trainerId);
    if (trErr && trErr.code !== '42P01') console.error('trainer_reviews DELETE:', trErr.message);

    // 5. bookings: trainer_id auf NULL setzen (Buchungen bleiben erhalten)
    const { error: bkErr } = await supabase.from('bookings').update({ trainer_id: null }).eq('trainer_id', trainerId);
    if (bkErr && bkErr.code !== '42P01') console.error('bookings UPDATE:', bkErr.message);

    // 6. gutschriften: trainer_id auf NULL setzen (falls Tabelle existiert)
    const { error: gsErr } = await supabase.from('gutschriften').update({ trainer_id: null }).eq('trainer_id', trainerId);
    if (gsErr && gsErr.code !== '42P01') console.error('gutschriften UPDATE:', gsErr.message);

    // 7. Dateien aus Supabase Storage löschen (trainer-documents/{trainerId}/* + contracts/*)
    const BUCKET = 'trainer-documents';
    const { data: storageFiles } = await supabase.storage.from(BUCKET).list(trainerId);
    if (storageFiles && storageFiles.length > 0) {
      const paths = storageFiles.map(f => `${trainerId}/${f.name}`);
      await supabase.storage.from(BUCKET).remove(paths);
    }
    // Auch Unterordner contracts/ löschen
    const { data: contractFiles } = await supabase.storage.from(BUCKET).list(`${trainerId}/contracts`);
    if (contractFiles && contractFiles.length > 0) {
      const cPaths = contractFiles.map(f => `${trainerId}/contracts/${f.name}`);
      await supabase.storage.from(BUCKET).remove(cPaths);
    }

    // 8. trainer_profiles Eintrag löschen
    const { error: deleteErr } = await supabase.from('trainer_profiles').delete().eq('id', trainerId);
    if (deleteErr) {
      console.error('trainer_profiles DELETE error:', deleteErr.message);
      if (deleteErr.message.includes('foreign key')) {
        return res.status(400).json({
          error: 'Trainer kann nicht gelöscht werden: Es bestehen noch Verknüpfungen in der Datenbank. Bitte wende dich an den Support.',
        });
      }
      return res.status(500).json({ error: 'Trainer konnte nicht gelöscht werden: ' + deleteErr.message });
    }

    // 9. Falls auth_user_id vorhanden: Auth-User nur löschen wenn sicher
    if (trainer.auth_user_id) {
      // Prüfe ob der Auth-User ein Admin ist → NIEMALS löschen
      const { data: { user: authUser } } = await supabase.auth.admin.getUserById(trainer.auth_user_id);
      const userRole = authUser?.user_metadata?.role || '';
      if (userRole.includes('admin')) {
        console.log(`Auth-User ${trainer.auth_user_id} ist Admin (${userRole}) – wird NICHT gelöscht`);
      } else {
        // Prüfe ob andere trainer_profiles die gleiche auth_user_id nutzen
        const { count } = await supabase
          .from('trainer_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('auth_user_id', trainer.auth_user_id)
          .neq('id', trainerId);
        if (count && count > 0) {
          console.log(`Auth-User ${trainer.auth_user_id} wird von ${count} anderen Profilen genutzt – wird NICHT gelöscht`);
        } else {
          const { error: authErr } = await supabase.auth.admin.deleteUser(trainer.auth_user_id);
          if (authErr) console.error('Auth-User löschen fehlgeschlagen:', authErr.message);
        }
      }
    }

    return res.json({ success: true, message: `Trainer "${trainer.full_name}" und alle zugehörigen Daten gelöscht.` });

  } catch (err) {
    console.error('handleDeleteTrainer Fehler:', err);
    return res.status(500).json({ error: 'Trainer konnte nicht gelöscht werden. Bitte versuche es erneut oder wende dich an den Support.' });
  }
}

// ─── ACTION: bookings ────────────────────────────────────────────────────────

async function handleBookingsPut(req, res, supabase) {
  const body = await getBody(req);
  const { status, paid, scheduled_date, scheduled_time, price_cents, final_price_cents, trainer_payout_cents, trainer_id, location_name, location_address, admin_note, assign_replacement } = body;
  // GT-Buchungen kommen vom Frontend mit gp_-Prefix — strippen, sonst findet das UPDATE 0 Zeilen.
  const bookingId = stripGpPrefix(body.bookingId);

  if (!bookingId) return res.status(400).json({ error: 'bookingId ist erforderlich' });
  // Format-Schutz: ungueltige IDs sauber als 400 abweisen statt PostgREST-500 zu
  // riskieren (Review No-Show Teil 2). Gilt fuer alle PUT-Pfade; GT-IDs sind nach
  // stripGpPrefix reine Buchungs-UUIDs.
  if (!UUID_RE.test(bookingId)) return res.status(400).json({ error: 'bookingId ist keine gueltige UUID' });

  // ── Ersatztrainer FINAL zuweisen (Admin-Hoheit, Vorgang 6) — B-2026-06-02-09 ──
  // Eigener Pfad mit fruehem return: umgeht bewusst den isConfirm/confirm-and-charge-
  // Apparat (weiter unten) und den generischen admin_field_change-Audit. Fachlich =
  // replacement-customer-confirm (atomarer Trainer-Tausch), plus Geschwister-
  // Zurueckziehen (sonst nur in replacement-accept). KEINE Rechnungs-Aktion + KEINE
  // erneute Abbuchung: der Trainer steht nicht auf der Kundenrechnung, die Trainer-
  // Gutschrift entsteht erst bei Auszahlung mit dem dann gueltigen Trainer.
  if (assign_replacement === true && trainer_id) {
    const caller = await getCallerInfo(req);
    if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const { data: current, error: curErr } = await supabase
      .from('bookings')
      .select('trainer_id, customer_id')
      .eq('id', bookingId).single();
    if (curErr || !current) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // Honorar-Satz des NEUEN Trainers per SELECT (app-Regel 3: nie hardcoded).
    const { data: repl, error: replErr } = await supabase
      .from('trainer_profiles').select('payout_cents, full_name, auth_user_id')
      .eq('id', trainer_id).maybeSingle();
    if (replErr || !repl) return res.status(400).json({ error: 'Ersatztrainer nicht gefunden' });

    const nowIso = new Date().toISOString();

    // Atomarer Tausch (pendant replacement-customer-confirm). .select() gegen
    // RLS-Silent-Fail (CLAUDE.md).
    const { data: swapped, error: swapErr } = await supabase.from('bookings').update({
      trainer_id,
      trainer_payout_cents: repl.payout_cents,
      replacement_trainer_name: repl.full_name,
      status: 'bestaetigt',
      flag_ersatz_trainer_gesucht: false,
      flag_ersatz_kunde_bestaetigung_offen: false,
      replacement_customer_confirm_deadline: null,
      updated_at: nowIso,
    }).eq('id', bookingId).select('id');
    if (swapErr) throw swapErr;
    if (!swapped || swapped.length === 0) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // Geschwister-Anfragen aufraeumen (pendant replacement-accept): Gewinner →
    // zugesagt, alle anderen offenen → zurueckgezogen. Best-effort: der Tausch ist
    // bereits durch, ein Fehler hier darf den 200-Erfolg nicht kippen (nur loggen).
    try {
      await supabase.from('replacement_requests')
        .update({ status: 'zugesagt', answered_at: nowIso })
        .eq('booking_id', bookingId).eq('candidate_trainer_id', trainer_id)
        .in('status', ['angeschrieben', 'kunden_vorschlag_offen']).select();
      await supabase.from('replacement_requests')
        .update({ status: 'zurueckgezogen', answered_at: nowIso })
        .eq('booking_id', bookingId).neq('candidate_trainer_id', trainer_id)
        .in('status', ['angeschrieben', 'kunden_vorschlag_offen']).select();
    } catch (e) { console.error('Ersatz-Geschwister-Aufraeumen (best-effort):', e.message); }

    // Audit (best-effort, GoBD-Diff). Tabelle: booking_audit (NICHT _log).
    try {
      await supabase.from('booking_audit').insert({
        booking_id: bookingId,
        action: 'replacement_trainer_assigned',
        actor_type: caller.actorType || 'admin',
        actor_id: caller.authUid || null,
        details: { old_trainer_id: current.trainer_id, new_trainer_id: trainer_id, new_trainer_name: repl.full_name },
      });
    } catch (e) { console.error('Audit replacement_trainer_assigned (best-effort):', e.message); }

    // Push (best-effort): neuer Trainer + Kunde. send-push ist verify-jwt deployed →
    // klassischer Service-Role-JWT (NICHT caller.token = Admin-ES256 → 401-Risiko).
    const pushToken = process.env.SERVICE_ROLE_JWT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      if (repl.auth_user_id) {
        await callEdgeFunction('send-push', pushToken, { user_id: repl.auth_user_id, title: 'Du uebernimmst einen Termin', body: 'Du wurdest als Ersatztrainer eingetragen. Details in der App.', data: { type: 'replacement_assigned', bookingId } });
      }
      if (current.customer_id) {
        const { data: cust } = await supabase.from('customers').select('auth_user_id').eq('id', current.customer_id).maybeSingle();
        if (cust?.auth_user_id) {
          await callEdgeFunction('send-push', pushToken, { user_id: cust.auth_user_id, title: 'Ersatztrainer bestaetigt', body: `${repl.full_name} uebernimmt deinen Termin.`, data: { type: 'replacement_confirmed', bookingId } });
        }
      }
    } catch (e) { console.error('Ersatz-Push (best-effort):', e.message); }

    return res.json({ success: true, replacement_assigned: true });
  }

  // ── No-Show Teil 2 (Phase B): Trainer startet die Eskalation aus der App ──
  // Eigener Pfad mit fruehem return (Trainer-Writes auf bookings sind sonst RLS-
  // gesperrt → muss ueber Service-Role hier laufen). Setzt status='strittig' +
  // escalation_started_at ATOMAR in EINEM Update — derselbe Invariant wie der
  // App-Pfad onNoShowEscalate + der Cron no-show-resolve: nie `strittig` ohne
  // escalation_started_at (sonst greift Cron-Stufe 2 bei +60min nie). Idempotent:
  // nur aus `bestaetigt` + nur wenn noch nicht eskaliert.
  if (body.no_show_escalate === true) {
    const caller = await getCallerInfo(req);
    if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const { data: bk, error: bkErr } = await supabase
      .from('bookings')
      .select('trainer_id, customer_id, status, escalation_started_at')
      .eq('id', bookingId).maybeSingle();
    if (bkErr || !bk) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // Ownership: nur der eigene Trainer (oder Admin) darf eskalieren.
    if (caller.actorType !== 'admin') {
      const { data: tp } = await supabase.from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
      if (!tp || tp.id !== bk.trainer_id) return res.status(403).json({ error: 'Kein Zugriff auf diese Buchung' });
    }

    const nowIso = new Date().toISOString();
    const { data: esc, error: escErr } = await supabase.from('bookings')
      .update({ status: 'strittig', escalation_started_at: nowIso, updated_at: nowIso })
      .eq('id', bookingId).eq('status', 'bestaetigt').is('escalation_started_at', null)
      .select('id');
    if (escErr) throw escErr;
    const didEscalate = !!(esc && esc.length > 0);

    if (didEscalate) {
      // B-2026-06-15-10: optionale Begruendung des Trainers (Freitext) mitschreiben.
      const escNote = typeof body.note === 'string' ? body.note.trim() : '';
      // Audit (best-effort, GoBD). Tabelle: booking_audit (NICHT _log).
      try {
        await supabase.from('booking_audit').insert({
          booking_id: bookingId,
          action: 'no_show_escalated',
          actor_type: caller.actorType || 'trainer',
          actor_id: caller.authUid || null,
          details: { stage: 1, source: 'trainer_app', ...(escNote ? { note: escNote } : {}) },
        });
      } catch (e) { console.error('Audit no_show_escalated (best-effort):', e.message); }

      // B-2026-06-15-10: Begruendung in bookings.notes anhaengen (Muster wie
      // Admin-Klaerungsfall no_show_resolve_admin) — fuer Verlauf/Beweis.
      if (escNote) {
        try {
          const { data: exN } = await supabase.from('bookings').select('notes').eq('id', bookingId).maybeSingle();
          const stampN = nowIso.slice(0, 16).replace('T', ' ');
          const newN = `[Trainer ${stampN}] Eskalation: ${escNote}`;
          await supabase.from('bookings').update({ notes: exN?.notes ? `${exN.notes}\n${newN}` : newN }).eq('id', bookingId);
        } catch (e) { console.error('No-Show-Eskalations-Note (best-effort):', e.message); }
      }

      // Push an beide (best-effort). send-push ist verify-jwt → Service-Role-JWT,
      // NICHT caller.token (Trainer-ES256 → 401-Risiko).
      const pushToken = process.env.SERVICE_ROLE_JWT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        if (bk.customer_id) {
          const { data: cust } = await supabase.from('customers').select('auth_user_id').eq('id', bk.customer_id).maybeSingle();
          if (cust?.auth_user_id) {
            await callEdgeFunction('send-push', pushToken, { user_id: cust.auth_user_id, title: 'Termin: bitte abstimmen', body: 'Zu deinem bestaetigten Termin gab es keinen Check-in. Bitte mit deinem Trainer abstimmen.', data: { type: 'no_show_escalated', bookingId } });
          }
        }
        const { data: tpush } = await supabase.from('trainer_profiles').select('auth_user_id').eq('id', bk.trainer_id).maybeSingle();
        if (tpush?.auth_user_id) {
          await callEdgeFunction('send-push', pushToken, { user_id: tpush.auth_user_id, title: 'Termin: bitte abstimmen', body: 'Du hast den Termin als strittig gemeldet. Bitte mit dem Kunden abstimmen.', data: { type: 'no_show_escalated', bookingId } });
        }
      } catch (e) { console.error('No-Show-Eskalations-Push (best-effort):', e.message); }
    }

    return res.json({ success: true, escalated: didEscalate });
  }

  // ── No-Show Phase C (C-1): Trainer „Kunde kommt noch" ──────────────────────
  // Zurück auf `bestaetigt` + 15-Min-Schonfrist; der Cron pausiert bis dahin und
  // re-eskaliert danach automatisch (escalation_started_at=NULL). R3: nur aus
  // `strittig` (gewinnt-genau-einer gegen Cron/C-3). R6: max. 2 Schonfristen.
  if (body.no_show_resume === true) {
    const caller = await getCallerInfo(req);
    if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const { data: bk, error: bkErr } = await supabase
      .from('bookings')
      .select('trainer_id, customer_id, status, no_show_resume_count')
      .eq('id', bookingId).maybeSingle();
    if (bkErr || !bk) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    if (caller.actorType !== 'admin') {
      const { data: tp } = await supabase.from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
      if (!tp || tp.id !== bk.trainer_id) return res.status(403).json({ error: 'Kein Zugriff auf diese Buchung' });
    }
    if ((bk.no_show_resume_count ?? 0) >= 2) {
      return res.status(400).json({ error: 'Maximale Schonfrist erreicht. Bitte verschieben oder stornieren.' });
    }

    const nowIso = new Date().toISOString();
    const graceUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: resumed, error: resErr } = await supabase.from('bookings')
      .update({
        status: 'bestaetigt',
        escalation_started_at: null,
        no_show_grace_until: graceUntil,
        no_show_resume_count: (bk.no_show_resume_count ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq('id', bookingId).eq('status', 'strittig')
      .lt('no_show_resume_count', 2) // R6/F1: atomare Limit-Sperre (verhindert >2 bei Race)
      .select('id');
    if (resErr) throw resErr;
    const didResume = !!(resumed && resumed.length > 0);

    if (didResume) {
      try {
        await supabase.from('booking_audit').insert({
          booking_id: bookingId,
          action: 'no_show_resolved',
          actor_type: caller.actorType || 'trainer',
          actor_id: caller.authUid || null,
          details: { outcome: 'kommt_noch', grace_until: graceUntil, source: 'trainer_app' },
        });
      } catch (e) { console.error('Audit no_show_resolved kommt_noch (best-effort):', e.message); }
      const pushToken = process.env.SERVICE_ROLE_JWT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        if (bk.customer_id) {
          const { data: cust } = await supabase.from('customers').select('auth_user_id').eq('id', bk.customer_id).maybeSingle();
          if (cust?.auth_user_id) {
            await callEdgeFunction('send-push', pushToken, { user_id: cust.auth_user_id, title: 'Termin läuft weiter', body: 'Ihr habt euch abgestimmt — wir warten noch kurz. Bitte eincheckt, sobald ihr da seid.', data: { type: 'no_show_resumed', bookingId } });
          }
        }
      } catch (e) { console.error('No-Show-Resume-Push (best-effort):', e.message); }
    }
    return res.json({ success: true, resumed: didResume });
  }

  // ── No-Show Phase D / Stufe 4: Trainer-Widerspruch „ich war da" ────────────
  // In der offenen 24h-Frist (no_show_trainer_deadline gesetzt, noch strittig,
  // noch nicht final) setzt der Trainer no_show_trainer_disputed=true → der Cron
  // Stufe 3 (`no_show_trainer_disputed = false`) loest NICHT automatisch zugunsten
  // des Kunden auf, der Fall geht an den Admin (manuelle Entscheidung).
  if (body.no_show_dispute === true) {
    const caller = await getCallerInfo(req);
    if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

    const { data: bk, error: bkErr } = await supabase
      .from('bookings')
      .select('trainer_id, customer_id, status, no_show_trainer_deadline')
      .eq('id', bookingId).maybeSingle();
    if (bkErr || !bk) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    if (caller.actorType !== 'admin') {
      const { data: tp } = await supabase.from('trainer_profiles').select('id').eq('auth_user_id', caller.authUid).maybeSingle();
      if (!tp || tp.id !== bk.trainer_id) return res.status(403).json({ error: 'Kein Zugriff auf diese Buchung' });
    }

    const nowIso = new Date().toISOString();
    const { data: disp, error: dispErr } = await supabase.from('bookings')
      .update({ no_show_trainer_disputed: true, updated_at: nowIso })
      .eq('id', bookingId)
      .eq('status', 'strittig')
      .not('no_show_trainer_deadline', 'is', null)
      .is('storno_grund', null)
      .select('id');
    if (dispErr) throw dispErr;
    const didDispute = !!(disp && disp.length > 0);

    if (didDispute) {
      try {
        await supabase.from('booking_audit').insert({
          booking_id: bookingId,
          action: 'no_show_escalated',
          actor_type: caller.actorType || 'trainer',
          actor_id: caller.authUid || null,
          details: { stage: 4, outcome: 'trainer_widerspruch', source: 'trainer_app' },
        });
      } catch (e) { console.error('Audit no_show_dispute (best-effort):', e.message); }
    }
    return res.json({ success: true, disputed: didDispute });
  }

  // ─── No-Show Teil 3: Admin loest Streitfall auf (3 Ausgaenge) ──────────────
  // outcome: trainer_nicht_da (Refund+SORRY+Trainer0+Zaehler) | kunde_nicht_da
  // (Kunde zahlt, kein Refund, Trainer0) | training_fand_statt (normaler Abschluss,
  // Trainer-Auszahlung ueber regulaere Frist). Pflicht-Notiz. Pre-Impl-Review 10.06.
  if (body.no_show_resolve_admin === true) {
    const caller = await getCallerInfo(req);
    if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });
    // B1: action=bookings PUT ist auch fuer Trainer offen → expliziter Admin-Gate.
    if (caller.actorType !== 'admin') return res.status(403).json({ error: 'Nur Admins duerfen Streitfaelle aufloesen' });

    const outcome = body.outcome;
    const note = (body.note || '').trim();
    if (!['trainer_nicht_da', 'kunde_nicht_da', 'training_fand_statt'].includes(outcome)) {
      return res.status(400).json({ error: 'Ungueltiger outcome' });
    }
    if (!note) return res.status(400).json({ error: 'Begruendung (note) ist Pflicht' });

    const { data: bk, error: bkErr } = await supabase
      .from('bookings')
      .select('id, trainer_id, customer_id, status, scheduled_date, scheduled_time, completed_at')
      .eq('id', bookingId).maybeSingle();
    if (bkErr || !bk) return res.status(404).json({ error: 'Buchung nicht gefunden' });
    if (bk.status !== 'strittig') return res.status(409).json({ error: 'Buchung ist nicht (mehr) strittig' });

    const nowIso = new Date().toISOString();

    if (outcome === 'training_fand_statt') {
      // Ausgang 3: normaler Abschluss. KEIN Sofort-Transfer — die regulaere
      // Auszahlung (trainer-payout-grace, 48h ab completed_at) uebernimmt. User-Freigabe
      // 10.06.: normale Frist, Architektur-konform. completed_at = Originaltermin
      // (Grace laeuft ab Termin-Zeit, Training fand DANN statt).
      const terminIso = bk.scheduled_date
        ? new Date(`${bk.scheduled_date}T${bk.scheduled_time || '00:00:00'}`).toISOString()
        : nowIso;
      const { data: upd, error: updErr } = await supabase.from('bookings')
        .update({ status: 'abgeschlossen', completed_at: bk.completed_at || terminIso, no_show_resolving_at: nowIso, updated_at: nowIso })
        .eq('id', bookingId).eq('status', 'strittig').is('storno_grund', null).is('no_show_resolving_at', null)
        .select('id');
      if (updErr) throw updErr;
      if (!upd || upd.length === 0) return res.status(409).json({ error: 'Buchung wird bereits aufgeloest oder ist nicht mehr strittig' });
    } else {
      // Ausgang 1 + 2: vorhandene Geld-Mechanik (cancel-or-refund) wiederverwenden.
      const reason = outcome === 'trainer_nicht_da' ? 'no_show_trainer' : 'no_show_kunde';
      // F-03: resolving_at als atomarer Pre-Lock (verhindert Cron-Wettlauf).
      const { data: lock, error: lockErr } = await supabase.from('bookings')
        .update({ no_show_resolving_at: nowIso })
        .eq('id', bookingId).eq('status', 'strittig').is('storno_grund', null).is('no_show_resolving_at', null)
        .select('id');
      if (lockErr) throw lockErr;
      if (!lock || lock.length === 0) return res.status(409).json({ error: 'Buchung wird bereits aufgeloest' });

      const r = await callEdgeFunction('cancel-or-refund', caller.token, {
        booking_id: bookingId, reason, actor_type: 'admin', note,
      });
      // B2: callEdgeFunction liefert { httpOk, status, body } — NICHT r.ok.
      if (!r.httpOk) {
        await supabase.from('bookings').update({ no_show_resolving_at: null }).eq('id', bookingId);
        return res.status(502).json({ error: 'cancel-or-refund fehlgeschlagen', detail: r.body });
      }
      // B3 + F-04: Zaehler NUR bei Trainer-No-Show, NUR nach Erfolg, best-effort.
      if (reason === 'no_show_trainer') {
        try {
          const { error: cntErr } = await supabase.rpc('increment_trainer_no_show_count', { p_trainer_id: bk.trainer_id });
          if (cntErr) console.error('increment_trainer_no_show_count (best-effort):', cntErr.message);
        } catch (e) { console.error('increment_trainer_no_show_count (best-effort):', e.message); }
      }
    }

    // Pflicht-Kommentar revisionssicher: Buchungs-Notiz + Tagebuch (best-effort, kein throw).
    try {
      const { data: ex } = await supabase.from('bookings').select('notes').eq('id', bookingId).maybeSingle();
      const stamp = nowIso.slice(0, 16).replace('T', ' ');
      const newNote = `[Admin ${stamp}] No-Show-Entscheidung: ${outcome} — ${note}`;
      await supabase.from('bookings').update({ notes: ex?.notes ? `${ex.notes}\n${newNote}` : newNote }).eq('id', bookingId);
      await supabase.from('booking_audit').insert({
        booking_id: bookingId, action: 'admin_note',
        actor_type: 'admin', actor_id: caller.authUid || null,
        details: { no_show_outcome: outcome, note, source: 'admin_klaerungsfall' },
      });
    } catch (e) { console.error('No-Show-Pflicht-Kommentar (best-effort):', e.message); }

    // B5: gerichtsfesten Beweis-Auszug erzeugen (best-effort, kein throw — sonst HTTP 500
    // nach erfolgtem Geld-Vorgang; CLAUDE.md Audit-Helper-Regel). generate-evidence-pdf
    // laeuft MIT JWT-Verify -> direkter fetch mit Service-Role-Key als Bearer UND apikey
    // (identisches Muster wie generate-invoice; NICHT callEdgeFunction, das apikey=anon setzt).
    try {
      const evKey = process.env.SERVICE_ROLE_JWT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
      const evResp = await fetch(`${process.env.SUPABASE_URL}/functions/v1/generate-evidence-pdf`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${evKey}`, 'apikey': evKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, trigger: 'admin_decision', admin_outcome: outcome }),
      });
      if (!evResp.ok) console.error('[no_show_resolve_admin] generate-evidence-pdf non-ok:', evResp.status, await evResp.text().catch(() => ''));
    } catch (e) { console.error('[no_show_resolve_admin] generate-evidence-pdf (best-effort):', e.message); }

    return res.json({ success: true, outcome });
  }

  // ── Admin "Termin verschieben" (verbindlich, B-2026-06-18-06) ──
  // Eigener Pfad mit fruehem return (Muster: assign_replacement / no_show_escalate).
  // Verbindliches Verschieben durch den Admin: setzt scheduled_date/-time DIREKT.
  // KEIN proposed_date/flag_neuer_termin_vorgeschlagen — das ist der Trainer-VORSCHLAG-
  // Weg (body.reschedule), der hier bewusst NICHT genutzt + NICHT veraendert wird.
  // Frist + Doppeltermin + Verfuegbarkeit gespiegelt vom reschedule-Block
  // (Z.3526-3601), bewusst dupliziert statt diesen umzubauen (Regressionsschutz,
  // Watchlist B-2026-06-15-11). mapStatusForFrontend bleibt unberuehrt.
  if (body.admin_reschedule) {
    const caller = await getCallerInfo(req);
    if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });
    if (caller.actorType !== 'admin') return res.status(403).json({ error: 'Nur der Admin darf verbindlich verschieben' });

    const newDate = body.admin_reschedule.date;
    const newTimeRaw = body.admin_reschedule.time;
    if (!newDate || !newTimeRaw) return res.status(400).json({ error: 'admin_reschedule braucht date und time' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return res.status(400).json({ error: 'date muss YYYY-MM-DD sein' });
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(newTimeRaw)) return res.status(400).json({ error: 'time muss HH:MM sein' });
    const newTime = newTimeRaw.slice(0, 5);

    const { data: current, error: fetchErr } = await supabase
      .from('bookings')
      .select('status, scheduled_date, scheduled_time, trainer_id, customer_id')
      .eq('id', bookingId)
      .single();
    if (fetchErr || !current) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // 'laeuft gerade' + 'abgeschlossen' bewusst ausgeschlossen (laufendes/beendetes
    // Training nicht verschiebbar; gleiche Liste wie der Trainer-reschedule-Block).
    if (!['angefragt', 'reserviert', 'bestaetigt', 'strittig'].includes(current.status)) {
      return res.status(400).json({ error: `Verschieben nur bei angefragt/reserviert/bestaetigt/strittig moeglich, aktuell: ${current.status}` });
    }

    // Verbindliches Verschieben braucht einen zugewiesenen Trainer (sonst greifen
    // Doppeltermin-/Verfuegbarkeits-Pruefung mit irrefuehrender Meldung).
    if (!current.trainer_id) {
      return res.status(400).json({ error: 'Keine Trainerzuweisung — verbindliches Verschieben nicht moeglich' });
    }

    // Frist: 24h bei 'bestaetigt', sonst nur "in der Zukunft" (B-15-11 / ARCHITEKTUR Vorgang 3).
    // B-2026-06-19-02: in Europe/Berlin gerechnet (DST-korrekt), identisch zum
    // Trainer-reschedule-Block. Admin-VERBINDLICH-Pfad bleibt davon unberührt.
    const hoursUntil = hoursUntilBerlin(newDate, newTime);
    if (current.status === 'bestaetigt') {
      if (hoursUntil < 24) return res.status(400).json({ error: 'Neuer Termin muss mindestens 24h in der Zukunft liegen' });
    } else if (hoursUntil <= 0) {
      return res.status(400).json({ error: 'Neuer Termin muss in der Zukunft liegen' });
    }

    // Doppeltermin: Trainer hat zur neuen Zeit keine andere aktive Buchung.
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('trainer_id', current.trainer_id)
      .eq('scheduled_date', newDate)
      .eq('scheduled_time', newTime + ':00')
      .in('status', ['angefragt', 'reserviert', 'bestaetigt', 'laeuft gerade'])
      .neq('id', bookingId);
    if (conflicts && conflicts.length > 0) return res.status(409).json({ error: 'Trainer hat bereits einen Termin zu dieser Zeit' });

    // Verfuegbarkeit: Trainer laut trainer_availability im Dienst.
    const dayOfWeek = (() => { const j = new Date(newDate + 'T00:00:00').getDay(); return j === 0 ? 7 : j; })();
    const proposedHour = parseInt(newTime.split(':')[0]);
    const { data: dateAvail } = await supabase.from('trainer_availability')
      .select('start_hour, end_hour, start_time, end_time')
      .eq('trainer_id', current.trainer_id).eq('specific_date', newDate).eq('is_active', true);
    const { data: weekdayAvail } = await supabase.from('trainer_availability')
      .select('start_hour, end_hour, start_time, end_time')
      .eq('trainer_id', current.trainer_id).eq('day_of_week', dayOfWeek).is('specific_date', null).eq('is_active', true);
    const availability = [...(dateAvail || []), ...(weekdayAvail || [])];
    if (!availability || availability.length === 0) return res.status(400).json({ error: 'Trainer ist an diesem Tag nicht verfuegbar' });
    const isInSlot = availability.some(function (s) {
      if (s.start_time && s.end_time) {
        var st = parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]);
        var et = parseInt(s.end_time.split(':')[0]) * 60 + parseInt(s.end_time.split(':')[1]);
        var pt = proposedHour * 60 + parseInt((newTime.split(':')[1]) || '0');
        return pt >= st && pt < et;
      }
      return proposedHour >= s.start_hour && proposedHour < s.end_hour;
    });
    if (!isInSlot) return res.status(400).json({ error: 'Trainer ist zu dieser Uhrzeit nicht verfuegbar' });

    // Verbindliches Update — Termin DIREKT setzen. KEIN proposed_*/flag (kein Vorschlag).
    // .select() gegen RLS-Silent-Fail (CLAUDE.md).
    const nowIso = new Date().toISOString();
    const oldDate = current.scheduled_date;
    const oldTime = (current.scheduled_time || '').slice(0, 5);
    // BLOCKER B2 (Pre-Impl-Review): bei Quelle 'strittig' die No-Show-Marker loeschen,
    // sonst greift der No-Show-Cron erneut auf den verschobenen Termin zu / re-eskaliert
    // (pendant Trainer-reschedule-Block Z.3611-3614).
    const updatePayload = {
      scheduled_date: newDate,
      scheduled_time: newTime + ':00',
      updated_at: nowIso,
      // Verbindliche Admin-Entscheidung schliesst einen etwaigen offenen Trainer-
      // TERMIN-Vorschlag ab (sonst mappt mapStatusForFrontend weiter auf
      // 'reschedule_proposed' -> Kunde sieht Annehmen/Ablehnen-Banner fuer einen
      // ueberholten Vorschlag). Offener ORT-Vorschlag bleibt unberuehrt (Admin
      // aendert nur die Zeit).
      flag_neuer_termin_vorgeschlagen: false,
      proposed_date: null,
      proposed_time: null,
    };
    if (current.status === 'strittig') {
      updatePayload.escalation_started_at = null;
      updatePayload.no_show_grace_until = null;
    }
    const { data: moved, error: moveErr } = await supabase.from('bookings')
      .update(updatePayload)
      .eq('id', bookingId).select('id');
    if (moveErr) throw moveErr;
    if (!moved || moved.length === 0) return res.status(404).json({ error: 'Buchung nicht gefunden' });

    // Audit 'rescheduled' (best-effort) — gleicher Typ wie der Trainer-Weg (Z.3622) →
    // Logbuch zeigt "Termin verschoben (alt->neu)" (audit-log.js Z.129-131).
    try {
      await supabase.from('booking_audit').insert({
        booking_id: bookingId,
        action: 'rescheduled',
        actor_type: caller.actorType || 'admin',
        actor_id: caller.authUid || null,
        details: { old_date: oldDate, new_date: newDate, old_time: oldTime, new_time: newTime, by: 'admin' },
      });
    } catch (e) { console.error('Audit rescheduled (admin, best-effort):', e.message); }

    // Push (best-effort) an Kunde + Trainer. SERVICE_ROLE_JWT (send-push verify-jwt).
    const pushToken = process.env.SERVICE_ROLE_JWT ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    const [_y, _m, _d] = newDate.split('-');
    const pushBody = `Dein Termin wurde auf ${_d}.${_m}.${_y} ${newTime} Uhr verschoben.`;
    try {
      let custUid = null, trainerUid = null;
      if (current.customer_id) {
        const { data: cust } = await supabase.from('customers').select('auth_user_id').eq('id', current.customer_id).maybeSingle();
        custUid = cust?.auth_user_id || null;
      }
      if (current.trainer_id) {
        const { data: tp } = await supabase.from('trainer_profiles').select('auth_user_id').eq('id', current.trainer_id).maybeSingle();
        trainerUid = tp?.auth_user_id || null;
      }
      // Dedup falls Kunde == Trainer (pendant push-notify.ts): nur eine Nachricht.
      const sent = new Set();
      for (const uid of [custUid, trainerUid]) {
        if (uid && !sent.has(uid)) {
          sent.add(uid);
          await callEdgeFunction('send-push', pushToken, { user_id: uid, title: 'Termin verschoben', body: pushBody, data: { type: 'rescheduled', bookingId } });
        }
      }
    } catch (e) { console.error('Admin-Verschiebe-Push (best-effort):', e.message); }

    return res.json({ success: true, rescheduled: true, new_date: newDate, new_time: newTime });
  }

  const update = {};
  // Logbuch Schritt 1: zusaetzliche Bewegungs-Eintraege (best-effort), die NACH
  // dem erfolgreichen UPDATE geschrieben werden. Bewegungen die NICHT ueber den
  // bestehenden admin_field_change-Audit (Preis/Payout/Trainer/Termin) oder ueber
  // cancel-or-refund (Storno mit Geld) laufen, werden hier gesammelt.
  const extraAudits = [];

  if (status !== undefined) {
    // Teilspec 1: Legacy-Status-Werte vom Frontend werden hier zentral auf den
    // neuen 7-Wert-Kanon plus storno_wer/storno_grund + flag_*-Spalten gemappt.
    const newCanon = ['angefragt', 'reserviert', 'bestaetigt', 'laeuft gerade', 'abgeschlossen', 'storniert', 'strittig'];
    const legacyCanon = [
      'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED',
      'pending', 'confirmed', 'completed', 'cancelled',
      'cancelled_by_trainer', 'expired', 'rejected', 'disputed',
      'checked_in', 'paid', 'refunded',
      'reschedule_proposed', 'location_proposed',
      'finding_replacement', 'replacement_pending', 'replacement_found',
      'fully_cancelled', 'awaiting_checkout',
      'payment_open', // Teilspec 2: Pseudo-Status aus mapStatusForFrontend, ueber Bridge zurueckmappbar
    ];
    if (![...newCanon, ...legacyCanon].includes(status)) {
      return res.status(400).json({ error: `Ungueltiger Status: ${status}` });
    }
    // Mapping anwenden (Lower-case fuer Konsistenz mit DB-CHECK)
    const normalized = typeof status === 'string' ? status.toLowerCase() : status;
    Object.assign(update, mapStatusForDb(normalized));
  }

  if (paid !== undefined) {
    update.paid = !!paid;
  }

  // NEU: Termin-Aenderung (Admin-Hoheit)
  if (scheduled_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
      return res.status(400).json({ error: 'scheduled_date muss YYYY-MM-DD Format haben' });
    }
    update.scheduled_date = scheduled_date;
  }

  if (scheduled_time !== undefined) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(scheduled_time)) {
      return res.status(400).json({ error: 'scheduled_time muss HH:MM Format haben' });
    }
    update.scheduled_time = scheduled_time;
  }

  // NEU: Preis-Korrektur (Admin-Hoheit, mit Audit)
  if (price_cents !== undefined) {
    const val = parseInt(price_cents);
    if (isNaN(val) || val < 0) return res.status(400).json({ error: 'price_cents muss >= 0 sein' });
    update.price_cents = val;
  }

  if (final_price_cents !== undefined) {
    const val = parseInt(final_price_cents);
    if (isNaN(val) || val < 0) return res.status(400).json({ error: 'final_price_cents muss >= 0 sein' });
    update.final_price_cents = val;
  }

  if (trainer_payout_cents !== undefined) {
    const val = parseInt(trainer_payout_cents);
    if (isNaN(val) || val < 0) return res.status(400).json({ error: 'trainer_payout_cents muss >= 0 sein' });
    update.trainer_payout_cents = val;
  }

  // Trainer wechseln (Ersatztrainer zuweisen)
  if (trainer_id !== undefined) {
    update.trainer_id = trainer_id;
  }

  // Ort aendern (Trainer-Vorschlag)
  if (location_name !== undefined) {
    update.location_name = location_name;
  }
  if (location_address !== undefined) {
    update.location_address = location_address;
  }

  // Admin-Notiz anfuegen (Audit-Trail)
  if (admin_note) {
    // Bestehende Notizen beibehalten, neue anfuegen
    const { data: existing } = await supabase.from('bookings').select('notes').eq('id', bookingId).single();
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newNote = `[Admin ${timestamp}] ${admin_note}`;
    update.notes = existing?.notes ? `${existing.notes}\n${newNote}` : newNote;
    extraAudits.push({ action: 'admin_note', details: { note: admin_note } });
  }

  // ─── Reschedule: Trainer schlaegt neuen Termin vor ─────────────────────
  if (body.reschedule) {
    const { proposed_date, proposed_time } = body.reschedule;

    if (!proposed_date || !proposed_time) {
      return res.status(400).json({ error: 'reschedule braucht proposed_date und proposed_time' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposed_date)) {
      return res.status(400).json({ error: 'proposed_date muss YYYY-MM-DD Format haben' });
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(proposed_time)) {
      return res.status(400).json({ error: 'proposed_time muss HH:MM Format haben' });
    }

    const { data: current, error: fetchErr } = await supabase
      .from('bookings')
      .select('status, scheduled_date, scheduled_time, trainer_id')
      .eq('id', bookingId)
      .single();

    if (fetchErr || !current) {
      return res.status(404).json({ error: 'Buchung nicht gefunden' });
    }

    // No-Show Phase C (C-2): Reschedule auch aus `strittig` erlauben (Trainer schlägt
    // statt Storno einen neuen Termin vor). Die 24h-Regel gilt NUR fuer `bestaetigt`
    // (ein strittiger Termin liegt bereits in der Vergangenheit).
    if (!['angefragt', 'reserviert', 'bestaetigt', 'strittig'].includes(current.status)) {
      return res.status(400).json({ error: `Reschedule nur bei angefragt/reserviert/bestaetigt/strittig moeglich, aktuell: ${current.status}` });
    }

    // B-2026-06-15-11 + B-2026-06-19-02: 24h-Vorlauf zum NEUEN Termin, in
    // Europe/Berlin gerechnet. Gilt nur für 'bestaetigt'; sonst nur "in der Zukunft".
    const hoursUntil = hoursUntilBerlin(proposed_date, proposed_time);
    if (current.status === 'bestaetigt') {
      if (hoursUntil < 24) {
        return res.status(400).json({ error: 'Neuer Termin muss mindestens 24h in der Zukunft liegen' });
      }
    } else if (hoursUntil <= 0) {
      return res.status(400).json({ error: 'Vorgeschlagener Termin muss in der Zukunft liegen' });
    }

    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('trainer_id', current.trainer_id)
      .eq('scheduled_date', proposed_date)
      .eq('scheduled_time', proposed_time + ':00')
      // Teilspec 1: Status 'reschedule_proposed' ist abgeschafft — flag-basiertes Vorschlagen.
      // Aktive Status, die einen Slot belegen.
      .in('status', ['angefragt', 'reserviert', 'bestaetigt', 'laeuft gerade'])
      .neq('id', bookingId);

    if (conflicts && conflicts.length > 0) {
      return res.status(409).json({ error: 'Trainer hat bereits einen Termin zu dieser Zeit' });
    }

    const dayOfWeek = (() => {
      const jsDay = new Date(proposed_date + 'T00:00:00').getDay();
      return jsDay === 0 ? 7 : jsDay;
    })();
    const proposedHour = parseInt(proposed_time.split(':')[0]);

    // Check both date-specific and day_of_week-based availability
    const { data: dateAvail } = await supabase
      .from('trainer_availability')
      .select('start_hour, end_hour, start_time, end_time')
      .eq('trainer_id', current.trainer_id)
      .eq('specific_date', proposed_date)
      .eq('is_active', true);

    const { data: weekdayAvail } = await supabase
      .from('trainer_availability')
      .select('start_hour, end_hour, start_time, end_time')
      .eq('trainer_id', current.trainer_id)
      .eq('day_of_week', dayOfWeek)
      .is('specific_date', null)
      .eq('is_active', true);

    const availability = [...(dateAvail || []), ...(weekdayAvail || [])];

    if (!availability || availability.length === 0) {
      return res.status(400).json({ error: 'Trainer ist an diesem Tag nicht verfuegbar' });
    }

    const isInSlot = availability.some(function(s) {
      if (s.start_time && s.end_time) {
        var st = parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]);
        var et = parseInt(s.end_time.split(':')[0]) * 60 + parseInt(s.end_time.split(':')[1]);
        var pt = proposedHour * 60 + parseInt((proposed_time.split(':')[1]) || '0');
        return pt >= st && pt < et;
      }
      return proposedHour >= s.start_hour && proposedHour < s.end_hour;
    });
    if (!isInSlot) {
      return res.status(400).json({ error: 'Trainer ist zu dieser Uhrzeit nicht verfuegbar' });
    }

    // Teilspec 1: Status bleibt 'bestaetigt' — der Vorschlag wird ueber das Flag markiert.
    update.proposed_date = proposed_date;
    update.proposed_time = proposed_time;
    update.reschedule_proposed_at = new Date().toISOString();
    update.flag_neuer_termin_vorgeschlagen = true;
    update.status = 'bestaetigt';
    // No-Show Phase C (C-2 aus `strittig`): Eskalations-/Schonfrist-Marker löschen,
    // damit der Cron den Termin mit offenem Vorschlag nicht erneut anfasst (R5).
    if (current.status === 'strittig') {
      update.escalation_started_at = null;
      update.no_show_grace_until = null;
    }

    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const oldDate = current.scheduled_date;
    const oldTime = (current.scheduled_time || '').slice(0, 5);
    const auditNote = `[Reschedule ${timestamp}] Trainer schlaegt vor: ${proposed_date} ${proposed_time} (vorher: ${oldDate} ${oldTime})`;
    const { data: existingNotes } = await supabase.from('bookings').select('notes').eq('id', bookingId).single();
    update.notes = existingNotes?.notes ? `${existingNotes.notes}\n${auditNote}` : auditNote;
    extraAudits.push({ action: 'rescheduled', details: { old_date: oldDate, new_date: proposed_date, old_time: oldTime, new_time: proposed_time } });
  }

  // ─── Location-Vorschlag: Trainer schlaegt anderen Treffpunkt vor ─────────
  // Welle 2b Phase 2 (B-26-05): Trainer-„Termin aendern"-Modal kann einen der
  // zwei booking_locations-Eintraege als neuen Treffpunkt vorschlagen. Spec:
  // docs/superpowers/specs/2026-05-26-reschedule-flow-fixes-design.md.
  // Architektur-Pendant zum reschedule-Block oben — parallele Flags erlaubt
  // (Kunde sieht ggf. beide Vorschlaege gleichzeitig).
  if (body.proposed_location_id) {
    const proposedLocationId = body.proposed_location_id;
    if (typeof proposedLocationId !== 'string') {
      return res.status(400).json({ error: 'proposed_location_id muss eine gueltige UUID sein' });
    }

    const { data: currentLoc, error: fetchLocErr } = await supabase
      .from('bookings')
      .select('status, scheduled_date, scheduled_time, location_name, location_address, notes')
      .eq('id', bookingId)
      .single();

    if (fetchLocErr || !currentLoc) {
      return res.status(404).json({ error: 'Buchung nicht gefunden' });
    }

    if (!['angefragt', 'reserviert', 'bestaetigt'].includes(currentLoc.status)) {
      return res.status(400).json({ error: `Standort-Vorschlag nur bei angefragt/reserviert/bestaetigt moeglich, aktuell: ${currentLoc.status}` });
    }

    // 24h-Mindestvorlauf zum AKTUELLEN Termin (ARCHITEKTUR.md Vorgang 3
    // "Ort-Vorschlag analog zum Termin-Vorschlag").
    if (currentLoc.status === 'bestaetigt') {
      const bookingDateTime = new Date(`${currentLoc.scheduled_date}T${currentLoc.scheduled_time}`);
      const diffHours = (bookingDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        return res.status(400).json({ error: 'Standort-Vorschlag nur >= 24h vor dem Termin moeglich' });
      }
    }

    // Vorgeschlagene Location muss zu DIESER Buchung gehoeren.
    const { data: loc, error: locErr } = await supabase
      .from('booking_locations')
      .select('id, name, address, is_custom')
      .eq('id', proposedLocationId)
      .eq('booking_id', bookingId)
      .single();

    if (locErr || !loc) {
      return res.status(400).json({ error: 'proposed_location_id gehoert nicht zu dieser Buchung' });
    }

    if (loc.name === currentLoc.location_name && loc.address === currentLoc.location_address) {
      return res.status(400).json({ error: 'Vorgeschlagener Standort entspricht dem aktiven Treffpunkt' });
    }

    update.selected_location_id = loc.id;

    const locTimestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let locAuditNote;

    // B-29-03 (04.06.2026): Ob es ein Trainer-DRITTORT (Kunde muss bestaetigen)
    // oder ein vom KUNDEN angebotener Ort (sofort uebernehmen) ist, signalisiert
    // der Client explizit (`location_is_trainer_proposal`). Grund: `is_custom`
    // unterscheidet NICHT zwischen einer vom Kunden selbst eingegebenen eigenen
    // Adresse (is_custom=true, trotzdem Kunden-Ort) und einem echten Trainer-
    // Drittort -> sonst wird der Kunde fuer seinen EIGENEN Ort um Bestaetigung
    // gebeten. Fallback fuer alte Clients ohne das Feld: bisherige is_custom-
    // Heuristik (Pille=Kunden-Ort wurde frueher per is_custom=false erkannt).
    const isTrainerProposal = typeof body.location_is_trainer_proposal === 'boolean'
      ? body.location_is_trainer_proposal
      : (loc.is_custom === true);

    if (!isTrainerProposal) {
      // Trainer waehlt einen der vom Kunden angebotenen Orte (Pille) -> SOFORT
      // uebernehmen, KEINE Kunden-Bestaetigung noetig (auch wenn es eine
      // vom Kunden eingegebene eigene Adresse mit is_custom=true ist).
      // Geschaeftsregel ARCHITEKTUR.md Vorgang 3 (29.05.2026).
      // Haengendes Vorschlag-Flag aus einem frueheren Drittort-Vorschlag AKTIV
      // bereinigen — sonst zeigt der Kunde weiter den Annehmen-Block.
      update.location_name = loc.name;
      update.location_address = loc.address;
      update.flag_neuer_ort_vorgeschlagen = false;
      update.location_proposed_by = null;
      update.location_proposed_at = null;
      locAuditNote = `[Location ${locTimestamp}] Trainer waehlt Kunden-Treffpunkt (sofort uebernommen): ${loc.name} (vorher: ${currentLoc.location_name || '—'})`;
    } else {
      // Trainer-Drittort (Trainer hat einen NEUEN, eigenen Ort angelegt)
      // -> Vorschlag mit Kunden-Bestaetigung (bisheriges Verhalten). Name/Adresse
      // werden erst beim Akzeptieren (handleLocationAccept) in die Buchung
      // uebernommen.
      update.flag_neuer_ort_vorgeschlagen = true;
      update.location_proposed_by = 'trainer';
      update.location_proposed_at = new Date().toISOString();
      locAuditNote = `[Location ${locTimestamp}] Trainer schlaegt eigenen Treffpunkt vor: ${loc.name} (vorher: ${currentLoc.location_name || '—'})`;
    }

    // Audit anhaengen. Wenn der reschedule-Block oben update.notes bereits
    // gesetzt hat (paralleler Termin- + Ort-Vorschlag), an dessen Wert
    // anhaengen — sonst Basis aus DB-Notes der Buchung.
    if (update.notes !== undefined) {
      update.notes = `${update.notes}\n${locAuditNote}`;
    } else {
      update.notes = currentLoc.notes ? `${currentLoc.notes}\n${locAuditNote}` : locAuditNote;
    }
    extraAudits.push({ action: 'location_changed', details: { old_location: currentLoc.location_name || '—', new_location: loc.name, is_trainer_proposal: isTrainerProposal } });
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
  }

  update.updated_at = new Date().toISOString();

  // B-2026-05-14-48 Fix: Audit-Pre-Read fuer Geld-/Termin-/Trainer-relevante
  // Aenderungen. Alte Werte VOR dem UPDATE holen, damit booking_audit-Eintrag
  // den Vorher/Nachher-Diff zeigt (GoBD-Pflicht bei Preis-/Payout-/Termin-Aenderungen).
  const AUDIT_FIELDS = ['price_cents', 'final_price_cents', 'trainer_payout_cents', 'trainer_id', 'scheduled_date', 'scheduled_time'];
  const changedAuditFields = AUDIT_FIELDS.filter(f => update[f] !== undefined);
  let oldAuditValues = null;
  if (changedAuditFields.length > 0) {
    const { data: oldRow } = await supabase
      .from('bookings')
      .select(AUDIT_FIELDS.join(','))
      .eq('id', bookingId)
      .single();
    oldAuditValues = oldRow;
  }

  // Logbuch Schritt 1: alten Status VOR dem UPDATE lesen (fuer Status-only-Audit).
  let oldStatusForAudit = null;
  if (status !== undefined) {
    const { data: sRow } = await supabase.from('bookings').select('status').eq('id', bookingId).single();
    oldStatusForAudit = sRow?.status ?? null;
  }

  // ─── Server-Hook (Schritt 4) ───────────────────────────────────────────────
  // Wenn der Status auf 'bestaetigt' wechselt → confirm-and-charge belastet die
  // hinterlegte Karte und setzt status+paid selber. Wenn der Status auf
  // 'storniert' wechselt und Geld im Spiel ist → cancel-or-refund macht Refund +
  // Stornobeleg + SORRY-Code + storno_wer/storno_grund.
  //
  // Variante b (User-Antwort steht aus, Default aus Phase-7-Task-34a): Bei
  // Karten-Ablehnung laeuft der Auto-Storno IN confirm-and-charge — die
  // Admin-API liefert nur `{ success: true, charge_failed: true, reason }`
  // und macht keinen weiteren DB-Touch.
  const isConfirm = update.status === 'bestaetigt';
  const isStorno = update.status === 'storniert';

  if (isConfirm || isStorno) {
    const { data: current, error: currentErr } = await supabase
      .from('bookings')
      .select('id, status, paid, art, scheduled_date, scheduled_time, stripe_payment_intent_id, stripe_setup_intent_id, stripe_payment_method_id')
      .eq('id', bookingId)
      .single();

    if (currentErr || !current) {
      return res.status(404).json({ error: 'Buchung nicht gefunden' });
    }

    const caller = await getCallerInfo(req);
    if (!caller) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    if (isConfirm) {
      // Karten-Belastung nur wenn Buchung noch nicht bezahlt UND eine Karte
      // hinterlegt ist. Sonst regulaeres UPDATE durchlaufen lassen (z.B. Admin
      // reaktiviert eine reservierte Buchung ohne Geldfluss).
      const stateAllowsCharge =
        !current.paid &&
        ['angefragt', 'reserviert'].includes(current.status) &&
        (current.stripe_setup_intent_id || current.stripe_payment_method_id);

      if (stateAllowsCharge) {
        const ccRes = await callEdgeFunction('confirm-and-charge', caller.token, { booking_id: bookingId });
        if (!ccRes.httpOk) {
          return res.status(502).json({ error: ccRes.body?.error || 'Karten-Belastung fehlgeschlagen', detail: ccRes.body });
        }
        // ok=false bedeutet Karten-Ablehnung. confirm-and-charge hat in dem Fall
        // bereits cancel-or-refund aufgerufen (Phase-7-Task-34a Auto-Storno).
        // Wir liefern die Info nach oben — KEIN weiteres UPDATE auf den Status,
        // sonst wuerden wir den Storno wieder ueberschreiben.
        if (ccRes.body && ccRes.body.ok === false) {
          return res.json({ success: true, charge_failed: true, reason: ccRes.body.reason || 'card_declined' });
        }
        // Erfolg: confirm-and-charge hat status='bestaetigt' + paid=true gesetzt.
        // Status/Flag/Paid-Felder aus dem update-Objekt entfernen, damit das
        // anschliessende UPDATE diese Felder nicht ueberschreibt.
        delete update.status;
        delete update.flag_zahlung_offen;
        delete update.paid;
        // Welle 2b Folge-Bug (B-2026-05-26-16): Reschedule-/Location-Flags NUR
        // loeschen wenn der gleiche Request keinen Vorschlag mitsendet.
        // Sonst wurden die Flags vom reschedule-/location-Block gerade gesetzt
        // und wuerden hier stillschweigend verworfen — der Kunde saehe keinen
        // Vorschlag, obwohl proposed_*/selected_location_id in der DB sitzen.
        if (!body.reschedule) {
          delete update.flag_neuer_termin_vorgeschlagen;
        }
        if (!body.proposed_location_id) {
          delete update.flag_neuer_ort_vorgeschlagen;
        }
      }
    }

    if (isStorno) {
      // Storno via cancel-or-refund laufen lassen, sobald Geld im Spiel ist
      // (paid=true oder Stripe-IDs gesetzt). Reine Pending-Storni ohne Geld
      // koennen direkt per UPDATE laufen, brauchen aber trotzdem cancel-or-refund,
      // damit Stornobeleg + Audit + SORRY-Code-Logik konsistent durchlaufen.
      const hasMoneyState =
        current.paid ||
        current.stripe_payment_intent_id ||
        current.stripe_setup_intent_id ||
        current.stripe_payment_method_id;

      // Auch ohne Geldfluss: bei bestaetigter Buchung muss cancel-or-refund
      // gerufen werden (Stornobeleg + Trainer-Push + Audit). Bei rein angefragt/
      // reserviert + kein Geld reicht direkter UPDATE (Frueh-Ablehnung).
      const isLowStakesPending =
        !hasMoneyState && ['angefragt', 'reserviert'].includes(current.status);

      if (!isLowStakesPending) {
        const reason = deriveCancelReason({
          currentStatus: current.status,
          scheduledDate: current.scheduled_date,
          scheduledTime: current.scheduled_time,
          actorType: caller.actorType,
          explicitStornoGrund: update.storno_grund,
        });
        const corRes = await callEdgeFunction('cancel-or-refund', caller.token, {
          booking_id: bookingId,
          reason,
          actor_type: caller.actorType,
          actor_id: caller.authUid,
          note: admin_note || undefined,
        });
        if (!corRes.httpOk) {
          return res.status(502).json({ error: corRes.body?.error || 'Storno fehlgeschlagen', detail: corRes.body });
        }
        // cancel-or-refund hat status='storniert' + storno_wer/storno_grund
        // gesetzt. Diese Felder aus dem update-Objekt entfernen.
        delete update.status;
        delete update.storno_wer;
        delete update.storno_grund;
      } else {
        // Low-Stakes-Storno (angefragt/reserviert ohne Geld): laeuft direkt per
        // UPDATE (kein cancel-or-refund) -> der cancelled-Audit muss hier ergaenzt
        // werden, sonst fehlt die Bewegung im Logbuch. Best-effort nach dem UPDATE.
        extraAudits.push({ action: 'cancelled', details: { reason: update.storno_grund || 'admin_storno', low_stakes: true } });
      }
    }

    // Wenn nach dem Edge-Function-Aufruf keine weiteren Felder mehr zum updaten
    // sind, sind wir fertig (nur das automatisch hinzugefuegte updated_at + ggf.
    // notes bleiben uebrig — notes sind aber harmlos).
    const remainingKeys = Object.keys(update).filter(k => k !== 'updated_at');
    if (remainingKeys.length === 0) {
      return res.json({ success: true });
    }
  }

  const { data, error } = await supabase.from('bookings').update(update).eq('id', bookingId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    // RLS-Silent-Fail-Schutz: bei Service-Role-Client unwahrscheinlich, aber
    // notes-Konflikte / fehlender Datensatz wuerden 0 Zeilen liefern. CLAUDE.md
    // Konvention.
    return res.status(404).json({ error: 'Buchung nicht gefunden oder konnte nicht aktualisiert werden' });
  }

  // B-2026-05-14-48 Fix: Audit-Post-Write fuer Geld-/Termin-/Trainer-Aenderungen.
  // GoBD-Pflicht — Finanz-/Vertrags-Aenderungen muessen mit Akteur + Zeitstempel
  // + Vorher/Nachher-Diff nachvollziehbar bleiben. Best-effort: niemals werfen,
  // sonst werfen wir den HTTP-200-Erfolg weg.
  if (changedAuditFields.length > 0 && oldAuditValues) {
    try {
      const caller = await getCallerInfo(req);
      const newAuditValues = changedAuditFields.reduce((acc, f) => { acc[f] = update[f]; return acc; }, {});
      await supabase.from('booking_audit').insert({
        booking_id: bookingId,
        action: 'admin_field_change',
        actor_type: caller?.actorType || 'admin',
        actor_id: caller?.authUid || null,
        details: {
          source: 'admin-api/bookings-put',
          changed_fields: changedAuditFields,
          old_values: oldAuditValues,
          new_values: newAuditValues,
          admin_note: admin_note || null,
        },
      });
    } catch (auditErr) {
      console.error('handleBookingsPut booking_audit insert fehlgeschlagen (best-effort):', auditErr.message);
    }
  }

  // Logbuch Schritt 1: gesammelte Zusatz-Bewegungen + Status-only-Aenderung
  // best-effort schreiben. Der bestehende admin_field_change-Audit oben und der
  // cancel-or-refund-cancelled-Eintrag werden NICHT dupliziert.
  try {
    const auditCaller = await getCallerInfo(req);
    const auditActor = { actor_type: auditCaller?.actorType || 'admin', actor_id: auditCaller?.authUid || null };
    for (const a of extraAudits) {
      await supabase.from('booking_audit').insert({ booking_id: bookingId, ...auditActor, action: a.action, details: a.details });
    }
    // Status-only: Status wurde geaendert, aber KEINE Geld-/Termin-/Trainer-Felder
    // (sonst greift der admin_field_change-Audit oben), der Status ueberlebte das
    // UPDATE (also NICHT ueber confirm-and-charge konsumiert) und ist kein Storno
    // (eigener cancelled-Eintrag).
    if (status !== undefined && update.status !== undefined && update.status !== 'storniert' && changedAuditFields.length === 0) {
      await supabase.from('booking_audit').insert({
        booking_id: bookingId,
        ...auditActor,
        action: 'admin_field_change',
        details: { field: 'status', from: oldStatusForAudit, to: update.status },
      });
    }
  } catch (auditErr) {
    console.error('handleBookingsPut Logbuch-Extra-Audit fehlgeschlagen (best-effort):', auditErr.message);
  }

  return res.json({ success: true });
}

// ─── ACTION: bookings DELETE ────────────────────────────────────────────────

// Wandelt einen rohen Postgres-Fremdschluessel-Fehler in einen deutschen Klartext-Hinweis um.
// Damit der Admin im Browser nicht „update or delete on table bookings violates foreign key
// constraint booking_audit_booking_id_fkey on table booking_audit" sieht, sondern eine
// Erklaerung was los ist und was er stattdessen tun kann.
function translateDeleteError(error) {
  if (!error) return null;
  const msg = (error.message || '').toLowerCase();
  const isFkError = error.code === '23503' || msg.includes('foreign key constraint');
  if (!isFkError) return null;

  if (msg.includes('booking_audit')) {
    return 'Diese Buchung kann nicht gelöscht werden. Zu ihr ist im Hintergrund ein Tagebuch '
      + '(Schritt-für-Schritt-Protokoll: wer hat wann was gemacht) gespeichert. Das Finanzamt '
      + 'verlangt, dass dieses Protokoll mindestens 10 Jahre erhalten bleibt — auch wenn die '
      + 'Buchung selbst weg ist. Aus diesem Grund lehnt das System das Löschen ab. '
      + 'Bitte nutze stattdessen den Storno-Knopf (rotes X). Die Buchung bleibt dann mit dem '
      + 'Vermerk „storniert" in der Liste, der Kunde bekommt sein Geld zurück, und ein '
      + 'Stornobeleg für die Buchhaltung wird erzeugt.';
  }
  if (msg.includes('invoice')) {
    return 'Diese Buchung kann nicht gelöscht werden, weil zu ihr bereits eine Rechnung '
      + 'oder ein Stornobeleg erzeugt wurde. Rechnungen dürfen nicht verschwinden wenn die '
      + 'zugehörige Buchung weg ist (Finanzamt-Vorgabe). Bitte nutze stattdessen den '
      + 'Storno-Knopf (rotes X) — der erzeugt einen Stornobeleg, der mit der bestehenden '
      + 'Rechnung sauber verknüpft wird.';
  }
  // Anderer Fremdschlüssel-Konflikt (selten — z.B. discount_codes)
  return 'Diese Buchung kann nicht gelöscht werden, weil noch andere Einträge mit ihr '
    + 'verbunden sind. Bitte nutze stattdessen den Storno-Knopf (rotes X) — der räumt die '
    + 'Verknüpfungen sauber auf.';
}

async function handleBookingsDelete(req, res, supabase) {
  const body = await getBody(req);
  const { bookingIds } = body;

  if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
    return res.status(400).json({ error: 'bookingIds (Array) ist erforderlich' });
  }

  if (bookingIds.length > 50) {
    return res.status(400).json({ error: 'Maximal 50 Buchungen gleichzeitig loeschen' });
  }

  const realIds = bookingIds.filter(id => !id.startsWith('gp_'));
  const gpIds = bookingIds.filter(id => id.startsWith('gp_')).map(id => id.slice(3));
  let deletedCount = 0;

  try {
    // 1. Echte Buchungen loeschen
    if (realIds.length > 0) {
      await supabase.from('trainer_reviews').delete().in('booking_id', realIds);
      await supabase.from('invoices').delete().in('booking_id', realIds);
      await supabase.from('bookings').update({ selected_location_id: null }).in('id', realIds);
      await supabase.from('booking_locations').delete().in('booking_id', realIds);
      const { error, count } = await supabase.from('bookings').delete({ count: 'exact' }).in('id', realIds);
      if (error) {
        const friendly = translateDeleteError(error);
        return res.status(friendly ? 409 : 500).json({ error: friendly || ('Loeschen fehlgeschlagen: ' + error.message) });
      }
      deletedCount += count || realIds.length;
    }

    // 2. GT-Teilnahmen loeschen.
    // Teilspec 1: GT-Teilnahmen liegen in bookings (art='gt_teilnahme'); IDs sind 1:1
    // gleich mit der Legacy-Tabelle group_participants_legacy — beide werden aufgeraeumt.
    if (gpIds.length > 0) {
      const { error: bErr, count: bCount } = await supabase
        .from('bookings')
        .delete({ count: 'exact' })
        .eq('art', 'gt_teilnahme')
        .in('id', gpIds);
      if (bErr) {
        const friendly = translateDeleteError(bErr);
        return res.status(friendly ? 409 : 500).json({ error: friendly || ('Loeschen fehlgeschlagen: ' + bErr.message) });
      }
      deletedCount += bCount || gpIds.length;
      // Legacy-Tabelle parallel aufraeumen (falls noch Daten drin liegen)
      const { error: lErr } = await supabase.from('group_participants').delete().in('id', gpIds);
      if (lErr && lErr.code !== '42P01') console.error('group_participants legacy DELETE:', lErr.message);
    }

    return res.json({ success: true, deleted: deletedCount });
  } catch (err) {
    return res.status(500).json({ error: 'Loeschen fehlgeschlagen: ' + (err.message || err) });
  }
}

// ─── ACTION: groups ──────────────────────────────────────────────────────────

async function handleGroups(req, res, supabase) {
  if (req.method === 'POST') {
    const body = await getBody(req);
    const { name, trainer_id, city, location_name, location_address, day_of_week, start_time, duration_minutes, max_participants, price_per_person_cents, is_active, scheduled_date, scheduled_time } = body;

    if (!name || !trainer_id || !city) {
      return res.status(400).json({ error: 'Kursname, Trainer und Stadt sind Pflichtfelder' });
    }

    // Calculate day_of_week from scheduled_date if provided
    let computedDayOfWeek = day_of_week;
    if (scheduled_date && computedDayOfWeek == null) {
      computedDayOfWeek = new Date(scheduled_date + 'T12:00:00Z').getDay(); // 0-6, CHECK-konform (B-2026-06-04-04)
    }

    const { equipment } = body;
    const { data, error } = await supabase.from('group_classes').insert({
      name, trainer_id, city,
      location_name: location_name || null,
      location_address: location_address || null,
      day_of_week: computedDayOfWeek ?? null,
      start_time: start_time || scheduled_time || null,
      scheduled_date: scheduled_date || null,
      scheduled_time: scheduled_time || start_time || null,
      duration_minutes: duration_minutes || 60,
      max_participants: max_participants || 12,
      price_per_person_cents: price_per_person_cents || null,
      is_active: is_active !== false,
      equipment: Array.isArray(equipment) ? equipment : null,
    }).select();

    if (error) throw error;
    return res.json({ success: true, data: data?.[0] });
  }

  if (req.method === 'PUT') {
    const body = await getBody(req);
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    // min_participants seit Teilspec 2 editierbar — wird unten gegen max_participants validiert.
    const allowed = ['name', 'trainer_id', 'city', 'location_name', 'location_address', 'day_of_week', 'start_time', 'duration_minutes', 'min_participants', 'max_participants', 'price_per_person_cents', 'is_active', 'scheduled_date', 'scheduled_time', 'equipment'];
    const update = {};
    for (const key of allowed) { if (key in fields) update[key] = fields[key]; }

    // Recalculate day_of_week if scheduled_date changed
    if (update.scheduled_date) {
      update.day_of_week = new Date(update.scheduled_date + 'T12:00:00Z').getDay(); // 0-6, CHECK-konform (B-2026-06-04-04)
    }

    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Keine aktualisierbaren Felder' });

    // Schwellen-Validation: min_participants muss eine ganze Zahl >= 1 sein UND darf
    // nicht groesser als max_participants sein (sonst waere die Schwelle nie erreichbar).
    // DB-CHECK 'min_participants > 0' faengt die untere Grenze ab, aber die min<=max-Bedingung
    // gibt es im Schema nicht — daher hier serverseitig pruefen, auch wenn das Frontend
    // bereits per data-max blockiert.
    if ('min_participants' in update) {
      const mp = update.min_participants;
      if (!Number.isInteger(mp) || mp < 1) {
        return res.status(400).json({ error: 'min_participants muss eine ganze Zahl >= 1 sein' });
      }
      // max_participants entweder aus dem Payload (wenn parallel geaendert) oder aus der DB.
      let maxAllowed = ('max_participants' in update) ? update.max_participants : null;
      if (maxAllowed == null) {
        const { data: row, error: fetchErr } = await supabase
          .from('group_classes')
          .select('max_participants')
          .eq('id', id)
          .single();
        if (fetchErr) return res.status(500).json({ error: 'max_participants lookup: ' + fetchErr.message });
        maxAllowed = row?.max_participants ?? null;
      }
      if (maxAllowed != null && mp > maxAllowed) {
        return res.status(400).json({ error: `min_participants (${mp}) darf nicht groesser sein als max_participants (${maxAllowed})` });
      }
    }

    // .select() an UPDATE ist RLS-Pflicht (CLAUDE.md Supabase-Gotchas): ohne
    // .select() koennen RLS-blockierte Writes 0 Zeilen liefern ohne Error-Code,
    // wir wuerden „Gespeichert" zurueckmelden obwohl nichts geschrieben wurde.
    // Hinweis: Die anderen PUT-Endpunkte in dieser Datei haben das alte Pattern
    // noch — Konsolidierung als Folge-Task offen.
    const { data: updated, error } = await supabase
      .from('group_classes').update(update).eq('id', id).select();
    if (error) throw error;
    if (!updated || updated.length === 0) {
      return res.status(403).json({ error: 'Update fehlgeschlagen (Zugriff verweigert oder Datensatz nicht gefunden)' });
    }
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const body = await getBody(req);
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    const { data: group, error: fetchErr } = await supabase.from('group_classes').select('is_active').eq('id', id).single();
    if (fetchErr) throw fetchErr;
    if (group?.is_active) return res.status(400).json({ error: 'Kurs muss zuerst deaktiviert werden' });

    // Teilspec 1: GT-Teilnahmen liegen in bookings (art='gt_teilnahme');
    // Legacy-Tabelle group_participants parallel aufraeumen.
    const { error: partError } = await supabase
      .from('bookings')
      .delete()
      .eq('art', 'gt_teilnahme')
      .eq('group_class_id', id);
    if (partError) {
      // FK-Fehler (z.B. Tagebuch/Rechnung an Teilnahme haengen) als Klartext zurueckgeben,
      // statt stumm weiterzulaufen und am group_classes-DELETE zu scheitern.
      const friendly = translateDeleteError(partError);
      if (friendly) return res.status(409).json({ error: friendly });
      return res.status(500).json({ error: 'Teilnahmen loeschen: ' + partError.message });
    }
    const { error: legacyError } = await supabase
      .from('group_participants')
      .delete()
      .eq('group_class_id', id);
    if (legacyError && legacyError.code !== '42P01') console.error('group_participants legacy DELETE error:', legacyError.message);

    const { error } = await supabase.from('group_classes').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: locations ───────────────────────────────────────────────────────

async function handleLocations(req, res, supabase) {
  if (req.method === 'POST') {
    const body = await getBody(req);
    const { city, is_active } = body;
    if (!city) return res.status(400).json({ error: 'Stadt ist ein Pflichtfeld' });

    const { data, error } = await supabase.from('service_locations').insert({ city, is_active: is_active !== false }).select();
    if (error) throw error;
    return res.json({ success: true, data: data?.[0] });
  }

  if (req.method === 'PUT') {
    const body = await getBody(req);
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    const allowed = ['city', 'is_active'];
    const update = {};
    for (const key of allowed) { if (key in fields) update[key] = fields[key]; }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Keine aktualisierbaren Felder' });

    const { error } = await supabase.from('service_locations').update(update).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const body = await getBody(req);
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    // Erst pruefen ob noch Locations vorhanden
    const { data: locs } = await supabase.from('service_location_details').select('id').eq('city_id', id);
    if (locs && locs.length > 0) {
      return res.status(400).json({ error: `Stadt kann nicht gelöscht werden — noch ${locs.length} Location(s) vorhanden. Bitte zuerst alle Locations löschen.` });
    }

    const { error } = await supabase.from('service_locations').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: license ─────────────────────────────────────────────────────────

async function handleLicense(req, res, supabase) {
  const BUCKET = 'trainer-documents';

  if (req.method === 'GET') {
    const path = req.query.path;
    if (!path) return res.status(400).json({ error: 'path ist erforderlich' });

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error) throw error;
    return res.json({ success: true, url: data.signedUrl });
  }

  if (req.method === 'DELETE') {
    const body = await getBody(req);
    const { trainerId, path } = body;
    if (!trainerId || !path) return res.status(400).json({ error: 'trainerId und path sind erforderlich' });

    const { error: deleteError } = await supabase.storage.from(BUCKET).remove([path]);
    if (deleteError) console.error('Storage DELETE error:', deleteError.message);

    const { data: trainer, error: fetchErr } = await supabase
      .from('trainer_profiles')
      .select('license_files')
      .eq('id', trainerId)
      .single();
    if (fetchErr) throw fetchErr;

    const updatedFiles = (trainer.license_files || []).filter(f => f.path !== path);
    const { error: updateErr } = await supabase.from('trainer_profiles').update({ license_files: updatedFiles }).eq('id', trainerId);
    if (updateErr) throw updateErr;

    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: get-file-url ────────────────────────────────────────────────────

async function handleGetFileUrl(req, res, supabase) {
  const body = await getBody(req);
  const { path, bucket } = body;
  if (!path) return res.status(400).json({ error: 'path ist erforderlich' });

  const bucketName = bucket || 'trainer-documents';
  const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(path, 3600);
  if (error) throw error;
  return res.json({ success: true, url: data.signedUrl });
}

// ─── ACTION: documents ───────────────────────────────────────────────────────

async function handleDocuments(req, res, supabase) {
  const BUCKET = 'admin-documents';
  const MAX_SIZE = 20 * 1024 * 1024;

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('admin_documents')
      .select('*')
      .order('folder')
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return res.json({ data: [] });
      throw error;
    }
    return res.json({ data: data || [] });
  }

  if (req.method === 'POST') {
    const { fields, files } = await parseForm(req);
    const folder = fields.folder?.[0] || fields.folder;
    if (!folder) return res.status(400).json({ error: 'folder ist erforderlich' });

    const validFolders = ['vertraege', 'agb-rechtliches', 'vorlagen', 'sonstiges'];
    if (!validFolders.includes(folder)) return res.status(400).json({ error: `Ungültiger Ordner: ${folder}` });

    const fileList = Array.isArray(files.files) ? files.files : (files.files ? [files.files] : []);
    if (fileList.length === 0) return res.status(400).json({ error: 'Keine Dateien hochgeladen' });

    const uploaded = [];
    for (const file of fileList) {
      if (file.size > MAX_SIZE) return res.status(400).json({ error: `${file.originalFilename} ist zu groß (max 20 MB)` });

      const safeName = file.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${folder}/${Date.now()}_${safeName}`;
      const fileBuffer = readFileSync(file.filepath);

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, fileBuffer, { contentType: file.mimetype, upsert: false });
      if (uploadErr) throw uploadErr;

      const adminEmail = await getAdminEmail(req);
      const { data: doc, error: insertErr } = await supabase.from('admin_documents').insert({
        folder, filename: file.originalFilename, path: storagePath,
        size_bytes: file.size, content_type: file.mimetype, uploaded_by: adminEmail,
      }).select().single();
      if (insertErr) throw insertErr;
      uploaded.push(doc);
    }

    return res.json({ success: true, files: uploaded });
  }

  if (req.method === 'DELETE') {
    const body = await parseJsonBody(req);
    const { id, path } = body;
    if (!id || !path) return res.status(400).json({ error: 'id und path sind erforderlich' });

    const { error: deleteErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (deleteErr) console.error('Storage DELETE error:', deleteErr.message);

    const { error: dbErr } = await supabase.from('admin_documents').delete().eq('id', id);
    if (dbErr) throw dbErr;
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: customers ───────────────────────────────────────────────────────

async function handleCustomers(req, res, supabase) {
  if (req.method === 'POST') {
    const body = await getBody(req);
    const { first_name, last_name, email, phone, street_address, postal_code, city, date_of_birth, notes } = body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind Pflichtfelder' });
    }

    const full_name = (first_name + ' ' + last_name).trim();
    const { data, error } = await supabase.from('customers').insert({
      first_name, last_name, full_name,
      email: email.trim().toLowerCase(),
      phone: phone || null,
      street_address: street_address || null,
      postal_code: postal_code || null,
      city: city || null,
      date_of_birth: date_of_birth || null,
      notes: notes || null,
    }).select();

    if (error) throw error;
    return res.json({ success: true, data: data?.[0] });
  }

  if (req.method === 'PUT') {
    const body = await getBody(req);
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    const allowed = ['first_name', 'last_name', 'email', 'phone', 'street_address', 'postal_code', 'city', 'date_of_birth', 'notes', 'contract_accepted', 'contract_accepted_at', 'terms_accepted', 'terms_accepted_at', 'service_contract_accepted', 'service_contract_accepted_at', 'health_declaration', 'health_declaration_accepted', 'health_declaration_accepted_at', 'document_files'];
    const update = {};
    for (const key of allowed) { if (key in fields) update[key] = fields[key]; }

    if (update.first_name || update.last_name) {
      const { data: existing } = await supabase.from('customers').select('first_name, last_name').eq('id', id).single();
      if (existing) {
        update.full_name = ((update.first_name || existing.first_name) + ' ' + (update.last_name || existing.last_name)).trim();
      }
    }

    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Keine aktualisierbaren Felder' });

    const { error } = await supabase.from('customers').update(update).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const body = await getBody(req);
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    // Pruefe ob aktive Buchungen vorhanden (Teilspec 1: 7-Wert-Kanon)
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('customer_id', id)
      .in('status', ['angefragt', 'reserviert', 'bestaetigt', 'laeuft gerade']);

    if (activeBookings && activeBookings.length > 0) {
      return res.status(400).json({
        error: 'Kunde hat noch aktive Buchungen. Bitte zuerst stornieren.',
      });
    }

    // Dokumente aus Storage löschen
    const { data: customer } = await supabase.from('customers').select('document_files').eq('id', id).single();
    if (customer?.document_files?.length > 0) {
      const paths = customer.document_files.map(f => f.path);
      await supabase.storage.from('trainer-documents').remove(paths);
    }

    // bookings.customer_id auf NULL setzen
    await supabase.from('bookings').update({ customer_id: null }).eq('customer_id', id);

    // Kunde löschen
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: update-participant ──────────────────────────────────────────────

async function handleUpdateParticipant(req, res, supabase) {
  const body = await getBody(req);
  const { id, attended, customer_paid, trainer_paid, trainer_checked_out_at, admin_note } = body;

  if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

  // Teilspec 1: GT-Teilnahmen liegen in bookings (art='gt_teilnahme'). bookings hat
  // weder attended noch customer_paid/trainer_paid als Boolean — wir mappen auf
  // die vorhandenen Spalten: attended -> Status laeuft gerade, customer_paid -> paid,
  // trainer_paid -> trainer_paid_out_at-Zeitstempel.
  const update = {};
  if (attended !== undefined) {
    update.status = attended ? 'laeuft gerade' : 'bestaetigt';
  }
  if (customer_paid !== undefined) update.paid = !!customer_paid;
  if (trainer_paid !== undefined) {
    update.trainer_paid_out_at = trainer_paid ? new Date().toISOString() : null;
  }
  if (trainer_checked_out_at !== undefined) update.trainer_checked_out_at = trainer_checked_out_at;

  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Keine aktualisierbaren Felder' });

  const { data, error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', id)
    .eq('art', 'gt_teilnahme')
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Teilnehmer nicht gefunden oder konnte nicht aktualisiert werden' });
  }

  // B-2026-05-14-15 + B-2026-05-14-16 Fix: Audit-Trail im booking_audit fuer
  // manuelle Admin-Aenderungen an `paid` und `trainer_paid_out_at`. GoBD-pflichtig
  // — sonst keine Nachvollziehbarkeit von Bezahl-/Honorar-Manipulationen ausserhalb
  // von stripe-webhook/process-payout (Anti-Pattern in Root-CLAUDE.md).
  // Best-effort, nie throwen, sonst werfen wir den HTTP 200 weg.
  if (customer_paid !== undefined || trainer_paid !== undefined) {
    try {
      const caller = await getCallerInfo(req);
      if (customer_paid !== undefined) {
        await supabase.from('booking_audit').insert({
          booking_id: id,
          action: 'manual_paid_set',
          actor_type: caller?.actorType || 'admin',
          actor_id: caller?.authUid || null,
          details: {
            source: 'admin-api/update-participant',
            new_value: !!customer_paid,
            admin_note: admin_note || null,
            warning: 'Bezahl-Status manuell gesetzt — kein Stripe-Event, kein Webhook-Audit. Rechnung manuell pruefen.',
          },
        });
      }
      if (trainer_paid !== undefined) {
        await supabase.from('booking_audit').insert({
          booking_id: id,
          action: 'manual_payout_set',
          actor_type: caller?.actorType || 'admin',
          actor_id: caller?.authUid || null,
          details: {
            source: 'admin-api/update-participant',
            trainer_paid_out_at: trainer_paid ? new Date().toISOString() : null,
            admin_note: admin_note || null,
            warning: 'Trainer-Auszahlung manuell gesetzt — kein Stripe-Transfer, keine Gutschrift-PDF. Wenn Transfer geflossen ist, ueber process-payout setzen.',
          },
        });
      }
    } catch (auditErr) {
      console.error('handleUpdateParticipant booking_audit insert fehlgeschlagen (best-effort):', auditErr.message);
    }
  }

  return res.json({ success: true });
}

// ─── ACTION: add-participant ─────────────────────────────────────────────────

async function handleAddParticipant(req, res, supabase) {
  const body = await getBody(req);
  const { group_class_id, customer_id, customer_name, customer_email } = body;

  if (!group_class_id || (!customer_id && !customer_name)) {
    return res.status(400).json({ error: 'group_class_id plus customer_id oder customer_name erforderlich' });
  }

  // Teilspec 1: GT-Anmeldung ueber bookings (art='gt_teilnahme'). Pflichtfelder
  // (scheduled_date/scheduled_time/trainer_id) kommen aus group_classes.
  const { data: gc, error: gcErr } = await supabase
    .from('group_classes')
    .select('id, trainer_id, scheduled_date, scheduled_time, price_per_person_cents, location_name, location_address')
    .eq('id', group_class_id)
    .single();
  if (gcErr || !gc) return res.status(404).json({ error: 'Kurs nicht gefunden' });
  if (!gc.trainer_id) return res.status(400).json({ error: 'Kurs hat keinen Trainer' });
  if (!gc.scheduled_date || !gc.scheduled_time) return res.status(400).json({ error: 'Kurs hat keinen Termin' });

  // Customer ggf. ueber Email auflosen (admin-Seite kennt Kunden ueber Mail).
  // B-2026-05-14-46 Fix: auth_user_id mit ziehen — sonst brechen Push-Pfade und
  // confirm-and-charge findet keinen Karten-Besitzer.
  let resolvedCustomerId = customer_id || null;
  let resolvedAuthUserId = null;
  if (resolvedCustomerId) {
    const { data: c } = await supabase
      .from('customers')
      .select('id, auth_user_id')
      .eq('id', resolvedCustomerId)
      .single();
    if (c) resolvedAuthUserId = c.auth_user_id || null;
  } else if (customer_email) {
    const { data: c } = await supabase
      .from('customers')
      .select('id, auth_user_id')
      .eq('email', customer_email.trim().toLowerCase())
      .single();
    if (c) {
      resolvedCustomerId = c.id;
      resolvedAuthUserId = c.auth_user_id || null;
    }
  }

  if (!resolvedCustomerId) {
    return res.status(400).json({ error: 'Kunde konnte nicht aufgeloest werden (weder customer_id noch customer_email passt zu einem Kunden-Datensatz)' });
  }

  // B-2026-05-14-46 Fix: flag_zahlung_offen=true setzen, weil keine Karten-
  // Bindung (kein SetupIntent) — Admin-Manuell-Add wird als "Zahlung offen"
  // markiert, damit der Schwellen-Cron + die Status-Anzeige korrekt reagieren.
  const insertData = {
    customer_id: resolvedCustomerId,
    auth_user_id: resolvedAuthUserId,
    trainer_id: gc.trainer_id,
    art: 'gt_teilnahme',
    booking_type: 'group',
    group_class_id,
    scheduled_date: gc.scheduled_date,
    scheduled_time: gc.scheduled_time,
    location_name: gc.location_name || null,
    location_address: gc.location_address || null,
    status: 'bestaetigt',
    paid: false,
    flag_zahlung_offen: true,
    price_cents: gc.price_per_person_cents || 0,
    final_price_cents: gc.price_per_person_cents || 0,
  };

  const { data, error } = await supabase.from('bookings').insert(insertData).select();
  if (error) throw error;
  const insertedId = data?.[0]?.id;

  // Audit-Eintrag: dokumentiert dass Admin manuell einen Teilnehmer hinzugefuegt
  // hat (kein Karten-Vormerk-Flow, kein normaler Buchungs-Pfad).
  if (insertedId) {
    try {
      const caller = await getCallerInfo(req);
      await supabase.from('booking_audit').insert({
        booking_id: insertedId,
        action: 'manual_admin_added_participant',
        actor_type: caller?.actorType || 'admin',
        actor_id: caller?.authUid || null,
        details: {
          source: 'admin-api/add-participant',
          group_class_id,
          customer_id: resolvedCustomerId,
          customer_email: customer_email || null,
          has_auth_user_id: !!resolvedAuthUserId,
          warning: 'Admin-manuell hinzugefuegt — keine Karten-Bindung (flag_zahlung_offen=true). Naechster Schritt: Kunde per Mail einen Karten-Eingabe-Link schicken oder Bar-/Ueberweisungs-Zahlung manuell markieren.',
        },
      });
    } catch (auditErr) {
      console.error('handleAddParticipant booking_audit insert fehlgeschlagen (best-effort):', auditErr.message);
    }
  }

  return res.json({ success: true, data: data?.[0] });
}

// ─── ACTION: trainer-availability GET ───────────────────────────────────────

async function handleTrainerAvailabilityGet(req, res, supabase) {
  const { trainerId } = req.query;
  if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });

  const { data, error } = await supabase
    .from('trainer_availability')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('day_of_week', { ascending: true })
    .order('start_hour', { ascending: true });

  if (error) throw error;
  return res.json({ success: true, data: data || [] });
}

// ─── ACTION: trainer-availability POST ──────────────────────────────────────

async function handleTrainerAvailabilityPost(req, res, supabase) {
  const body = await getBody(req);
  const { trainerId, slots } = body;

  if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots muss ein Array sein' });

  // Delete existing entries for this trainer
  const { error: delError } = await supabase
    .from('trainer_availability')
    .delete()
    .eq('trainer_id', trainerId);

  if (delError) throw delError;

  // Insert new entries
  if (slots.length > 0) {
    const rows = slots.map(s => ({
      trainer_id: trainerId,
      day_of_week: s.day_of_week,
      start_hour: s.start_hour,
      end_hour: s.end_hour,
      start_time: s.start_time || null,
      end_time: s.end_time || null,
      specific_date: s.specific_date || null,
      series_id: s.series_id || null,
      is_active: s.is_active !== false,
    }));

    const { error: insError } = await supabase
      .from('trainer_availability')
      .insert(rows);

    if (insError) throw insError;
  }

  return res.json({ success: true, count: slots.length });
}

// ─── ACTION: trainer-avatar ───────────────────────────────────────────────────
// POST  multipart/form-data: { trainerId, file }  → hochladen + URL speichern
// DELETE JSON: { trainerId }                       → Bild aus Storage + DB löschen

async function handleTrainerAvatar(req, res, supabase) {
  const BUCKET = 'trainer-documents';
  // Bilder werden unter avatars/{trainerId}/profile.jpg gespeichert (upsert).
  // Dadurch braucht man keine extra DB-Spalte für den Pfad.

  if (req.method === 'POST') {
    // multipart parsen
    const { fields, files } = await new Promise((resolve, reject) => {
      const form = formidable({ maxFileSize: 2 * 1024 * 1024 });
      form.parse(req, (err, f, fi) => err ? reject(err) : resolve({ fields: f, files: fi }));
    });

    const trainerId = Array.isArray(fields.trainerId) ? fields.trainerId[0] : fields.trainerId;
    if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });

    const fileEntry = files.file ? (Array.isArray(files.file) ? files.file[0] : files.file) : null;
    if (!fileEntry) return res.status(400).json({ error: 'Keine Datei übermittelt' });

    const mime = fileEntry.mimetype || '';
    if (!['image/jpeg', 'image/png'].includes(mime)) {
      return res.status(400).json({ error: 'Nur JPG und PNG erlaubt' });
    }
    if (fileEntry.size > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Maximale Dateigröße: 2 MB' });
    }

    const fs = await import('fs');
    const fileBuffer = await fs.promises.readFile(fileEntry.filepath);
    const storagePath = `avatars/${trainerId}/profile.jpg`;

    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, fileBuffer, {
      contentType: mime,
      upsert: true,
    });
    if (uploadErr) throw uploadErr;

    // Signierte URL mit 10-Jahres-Laufzeit (Bucket ist privat)
    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(storagePath, 315360000);
    if (signErr) throw signErr;

    const avatarUrl = signedData.signedUrl;

    const { error: updateErr } = await supabase.from('trainer_profiles')
      .update({ avatar_url: avatarUrl }).eq('id', trainerId);
    if (updateErr) throw updateErr;

    return res.json({ success: true, url: avatarUrl });
  }

  if (req.method === 'DELETE') {
    const body = await getBody(req);
    const { trainerId } = body;
    if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });

    const storagePath = `avatars/${trainerId}/profile.jpg`;
    await supabase.storage.from(BUCKET).remove([storagePath]); // Fehler ignorieren (evtl. nicht vorhanden)

    const { error: updateErr } = await supabase.from('trainer_profiles')
      .update({ avatar_url: null }).eq('id', trainerId);
    if (updateErr) throw updateErr;

    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: testers (CRUD) ─────────────────────────────────────────────────

async function handleTesters(req, res, supabase) {
  switch (req.method) {
    case 'GET': {
      const { data, error } = await supabase
        .from('test_users')
        .select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ data: data || [] });
    }

    case 'POST': {
      const body = await getBody(req);
      const { email, is_active, premium_override, dev_tools, notes } = body;
      if (!email) return res.status(400).json({ error: 'E-Mail ist erforderlich' });

      const { data, error } = await supabase
        .from('test_users')
        .insert({
          email: email.trim().toLowerCase(),
          is_active: is_active !== undefined ? is_active : true,
          premium_override: premium_override !== undefined ? premium_override : true,
          dev_tools: dev_tools !== undefined ? dev_tools : true,
          notes: notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return res.json({ data });
    }

    case 'PUT': {
      const body = await getBody(req);
      const { id, ...updates } = body;
      if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

      if (updates.email) updates.email = updates.email.trim().toLowerCase();

      const { data, error } = await supabase
        .from('test_users')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.json({ data });
    }

    case 'DELETE': {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'id Query-Parameter ist erforderlich' });

      const { error } = await supabase
        .from('test_users')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// ─── ACTION: reschedule-accept ────────────────────────────────────────────

async function handleRescheduleAccept(req, res, supabase) {
  const body = await getBody(req);
  const bookingId = stripGpPrefix(body.bookingId);

  if (!bookingId) return res.status(400).json({ error: 'bookingId ist erforderlich' });

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, proposed_date, proposed_time, scheduled_date, scheduled_time, notes, flag_neuer_termin_vorgeschlagen')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
  // Teilspec 1: Vorschlag wird ueber Flag markiert; Status bleibt 'bestaetigt'.
  if (!booking.flag_neuer_termin_vorgeschlagen) {
    return res.status(400).json({ error: `Kein offener Termin-Vorschlag fuer diese Buchung (Status: ${booking.status})` });
  }

  // B-2026-05-26-13: Defense-in-Depth zur Welle-2b Client-Pruefung. Annahme
  // blockieren wenn der vorgeschlagene Termin schon vergangen ist — sonst
  // landet die Buchung sofort als "abgelaufen" im Vergangen-Tab und der Trainer
  // verliert die Auszahlung (Bug B-26-04 Symptom-Klasse).
  if (booking.proposed_date && booking.proposed_time) {
    const proposedAt = new Date(`${booking.proposed_date}T${booking.proposed_time}`);
    if (proposedAt <= new Date()) {
      return res.status(400).json({ error: 'Der vorgeschlagene Termin liegt in der Vergangenheit. Bitte direkt mit deinem Trainer einen neuen Termin vereinbaren — diese Buchung muss leider storniert werden.' });
    }
  }

  const oldDate = booking.scheduled_date;
  const oldTime = (booking.scheduled_time || '').slice(0, 5);
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const auditNote = `[Reschedule ${timestamp}] Kunde hat angenommen. Termin geaendert von ${oldDate} ${oldTime} auf ${booking.proposed_date} ${(booking.proposed_time || '').slice(0, 5)}`;

  // B-49: .select('id') + 0-Zeilen-Check Pflicht (RLS-Silent-Fail-Schutz).
  const { data: upd, error } = await supabase
    .from('bookings')
    .update({
      scheduled_date: booking.proposed_date,
      scheduled_time: booking.proposed_time,
      proposed_date: null,
      proposed_time: null,
      reschedule_proposed_at: null,
      flag_neuer_termin_vorgeschlagen: false,
      status: 'bestaetigt',
      notes: booking.notes ? `${booking.notes}\n${auditNote}` : auditNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select('id');

  if (error) throw error;
  if (!upd || upd.length === 0) {
    return res.status(404).json({ error: 'Buchung nicht gefunden (RLS-Block oder geloescht)' });
  }

  // Logbuch Schritt 1: Kunden-Annahme der Termin-Aenderung als Bewegung (best-effort).
  try {
    const caller = await getCallerInfo(req);
    await supabase.from('booking_audit').insert({
      booking_id: bookingId,
      action: 'rescheduled',
      actor_type: caller?.actorType || 'customer',
      actor_id: caller?.authUid || null,
      details: { old_date: oldDate, new_date: booking.proposed_date, old_time: oldTime, new_time: (booking.proposed_time || '').slice(0, 5) },
    });
  } catch (e) { console.error('Audit rescheduled (customer accept, best-effort):', e.message); }

  return res.json({ success: true, newDate: booking.proposed_date, newTime: booking.proposed_time });
}

// ─── ACTION: reschedule-reject ────────────────────────────────────────────

async function handleRescheduleReject(req, res, supabase) {
  const body = await getBody(req);
  const bookingId = stripGpPrefix(body.bookingId);

  if (!bookingId) return res.status(400).json({ error: 'bookingId ist erforderlich' });

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, notes, scheduled_date, scheduled_time, proposed_date, proposed_time, flag_neuer_termin_vorgeschlagen, paid, stripe_payment_intent_id, stripe_setup_intent_id, stripe_payment_method_id')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
  if (!booking.flag_neuer_termin_vorgeschlagen) {
    return res.status(400).json({ error: `Kein offener Termin-Vorschlag fuer diese Buchung (Status: ${booking.status})` });
  }

  // Schritt 4 / B-2026-05-14-13: Storno laeuft ueber cancel-or-refund, nicht
  // direkt per UPDATE — sonst kein Refund, kein Stornobeleg, kein SORRY-Code.
  // Sub-Felder (proposed_date/_time, flag_neuer_termin_vorgeschlagen) muessen
  // wir separat zuruecksetzen, weil cancel-or-refund die nicht kennt.
  const caller = await getCallerInfo(req);
  if (!caller) return res.status(401).json({ error: 'Nicht authentifiziert' });

  const corRes = await callEdgeFunction('cancel-or-refund', caller.token, {
    booking_id: bookingId,
    reason: 'reschedule_rejected',
    actor_type: caller.actorType,
    actor_id: caller.authUid,
    note: 'Kunde lehnt Termin-Vorschlag ab',
  });
  if (!corRes.httpOk) {
    return res.status(502).json({ error: corRes.body?.error || 'Storno fehlgeschlagen', detail: corRes.body });
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const auditNote = `[Reschedule ${timestamp}] Kunde hat abgelehnt. Buchung storniert.`;

  // Reschedule-spezifische Felder zuruecksetzen (cancel-or-refund hat status +
  // storno_* bereits gesetzt; .select() fuer RLS-Silent-Fail-Schutz).
  const { data: upd, error: updErr } = await supabase
    .from('bookings')
    .update({
      proposed_date: null,
      proposed_time: null,
      reschedule_proposed_at: null,
      flag_neuer_termin_vorgeschlagen: false,
      notes: booking.notes ? `${booking.notes}\n${auditNote}` : auditNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select('id');

  if (updErr) {
    console.error('handleRescheduleReject: Reschedule-Felder-Reset fehlgeschlagen', updErr.message);
  } else if (!upd || upd.length === 0) {
    console.error('handleRescheduleReject: Reschedule-Felder-Reset 0 Zeilen (RLS?)');
  }
  return res.json({ success: true });
}

// ─── ACTION: location_details ─────────────────────────────────────────────────

async function handleLocationDetails(req, res, supabase) {
  // GET: All locations (optionally filtered by cityId query param)
  if (req.method === 'GET') {
    const cityId = req.query?.cityId
    let query = supabase.from('service_location_details').select('*').order('sort_order', { ascending: true })
    if (cityId) query = query.eq('city_id', cityId)
    const { data, error } = await query
    if (error) return res.status(500).json({ success: false, error: error.message })
    return res.json({ success: true, data })
  }

  const body = await getBody(req)

  // POST: New location
  if (req.method === 'POST') {
    const { city_id, name, street, zip_code, city_name, latitude, longitude, description, image_url, is_active, sort_order } = body
    if (!city_id || !name || latitude == null || longitude == null) {
      return res.status(400).json({ success: false, error: 'city_id, name, latitude und longitude sind Pflicht' })
    }
    const { data, error } = await supabase.from('service_location_details')
      .insert({ city_id, name, street: street||null, zip_code: zip_code||null, city_name: city_name||null, latitude, longitude, description: description||null, image_url: image_url||null, is_active: is_active !== false, sort_order: sort_order ?? 0 })
      .select()
    if (error) return res.status(500).json({ success: false, error: error.message })
    return res.json({ success: true, data: data?.[0] })
  }

  // PUT: Edit location
  if (req.method === 'PUT') {
    const { id, ...fields } = body
    if (!id) return res.status(400).json({ success: false, error: 'id ist Pflicht' })
    const allowed = ['name', 'street', 'zip_code', 'city_name', 'latitude', 'longitude', 'description', 'image_url', 'is_active', 'sort_order']
    const update = {}
    for (const key of allowed) { if (key in fields) update[key] = fields[key] }
    const { error } = await supabase.from('service_location_details').update(update).eq('id', id)
    if (error) return res.status(500).json({ success: false, error: error.message })
    return res.json({ success: true })
  }

  // DELETE
  if (req.method === 'DELETE') {
    const { id } = body
    if (!id) return res.status(400).json({ success: false, error: 'id ist Pflicht' })
    const { error } = await supabase.from('service_location_details').delete().eq('id', id)
    if (error) return res.status(500).json({ success: false, error: error.message })
    return res.json({ success: true })
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' })
}

// ─── ACTION: upload_location_image ───────────────────────────────────────────

async function handleUploadLocationImage(req, res, supabase) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' })
  const body = await getBody(req)
  const { locationId, imageBase64, fileName } = body
  if (!locationId || !imageBase64 || !fileName) {
    return res.status(400).json({ success: false, error: 'locationId, imageBase64 und fileName sind Pflicht' })
  }
  const buffer = Buffer.from(imageBase64, 'base64')
  const filePath = `locations/${locationId}/${fileName}`
  const { error: uploadError } = await supabase.storage.from('location-images').upload(filePath, buffer, {
    contentType: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg',
    upsert: true,
  })
  if (uploadError) return res.status(500).json({ success: false, error: uploadError.message })
  const { data: urlData } = supabase.storage.from('location-images').getPublicUrl(filePath)
  const { error: updateError } = await supabase.from('service_location_details').update({ image_url: urlData.publicUrl }).eq('id', locationId)
  if (updateError) return res.status(500).json({ success: false, error: updateError.message })
  return res.json({ success: true, imageUrl: urlData.publicUrl })
}

// ─── ACTION: location-accept ──────────────────────────────────────────────────

async function handleLocationAccept(req, res, supabase) {
  const body = await getBody(req)
  const bookingId = stripGpPrefix(body.bookingId)
  if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId ist Pflicht' })

  const { data: booking } = await supabase.from('bookings').select('selected_location_id, location_name, location_address, scheduled_date, scheduled_time, notes').eq('id', bookingId).single()
  if (!booking) return res.status(404).json({ success: false, error: 'Buchung nicht gefunden' })

  // B-2026-05-26-13: Defense-in-Depth zur Welle-2b Client-Pruefung. Standort-
  // Wechsel aendert den Termin nicht — wenn der aktuelle Termin schon vergangen
  // ist, ist der Wechsel sinnlos.
  if (booking.scheduled_date && booking.scheduled_time) {
    const scheduledAt = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
    if (scheduledAt <= new Date()) {
      return res.status(400).json({ success: false, error: 'Der Termin liegt in der Vergangenheit. Standort-Wechsel ist nicht moeglich — diese Buchung muss leider storniert werden.' });
    }
  }

  // Teilspec 1: Status bleibt 'bestaetigt' — der Treffpunkt-Vorschlag wird ueber das Flag markiert,
  // beim Akzeptieren wird das Flag zurueckgesetzt.
  const update = {
    status: 'bestaetigt',
    flag_neuer_ort_vorgeschlagen: false,
    location_proposed_by: null,
    location_proposed_at: null,
    notes: '',
    updated_at: new Date().toISOString(),
  }

  if (booking.selected_location_id) {
    // Location aus booking_locations uebernehmen
    const { data: loc } = await supabase.from('booking_locations').select('*').eq('id', booking.selected_location_id).single()
    if (loc) {
      update.location_name = loc.name
      update.location_address = loc.address
    }
    const auditNote = `[Location ${new Date().toISOString()}] Kunde hat Treffpunkt akzeptiert: ${loc?.name || booking.location_name}`
    update.notes = booking.notes ? `${booking.notes}\n${auditNote}` : auditNote
  } else {
    // Trainer-Vorschlag direkt in bookings (kein booking_location Eintrag)
    const auditNote = `[Location ${new Date().toISOString()}] Kunde hat Trainer-Treffpunkt akzeptiert: ${booking.location_name}`
    update.notes = booking.notes ? `${booking.notes}\n${auditNote}` : auditNote
  }

  // B-49: .select('id') + 0-Zeilen-Check Pflicht (RLS-Silent-Fail-Schutz).
  const { data: upd, error } = await supabase.from('bookings').update(update).eq('id', bookingId).select('id')

  if (error) return res.status(500).json({ success: false, error: error.message })
  if (!upd || upd.length === 0) return res.status(404).json({ success: false, error: 'Buchung nicht gefunden (RLS-Block oder geloescht)' })

  // Logbuch Schritt 1: Kunden-Annahme des Treffpunkts als Bewegung (best-effort).
  try {
    const caller = await getCallerInfo(req);
    await supabase.from('booking_audit').insert({
      booking_id: bookingId,
      action: 'location_changed',
      actor_type: caller?.actorType || 'customer',
      actor_id: caller?.authUid || null,
      details: { old_location: booking.location_name || '—', new_location: update.location_name || booking.location_name || '—', is_trainer_proposal: true },
    });
  } catch (e) { console.error('Audit location_changed (customer accept, best-effort):', e.message); }

  return res.json({ success: true })
}

// ─── ACTION: location-reject ──────────────────────────────────────────────────

async function handleLocationReject(req, res, supabase) {
  const body = await getBody(req)
  const bookingId = stripGpPrefix(body.bookingId)
  if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId ist Pflicht' })

  const { data: booking } = await supabase
    .from('bookings')
    .select('notes, status, scheduled_date, scheduled_time, paid, stripe_payment_intent_id, stripe_setup_intent_id, stripe_payment_method_id')
    .eq('id', bookingId)
    .single()
  if (!booking) return res.status(404).json({ success: false, error: 'Buchung nicht gefunden' })

  // Schritt 4 / W-1: Storno laeuft ueber cancel-or-refund — sonst kein Refund,
  // kein Stornobeleg, kein SORRY-Code. Location-Ablehnung ist eine Kunden-Aktion
  // gegen einen Trainer-Vorschlag. Reason: kunde_rechtzeitig (rechtzeitig =
  // >24h vor Termin) bzw. kunde_spaet wenn knapp.
  const caller = await getCallerInfo(req)
  if (!caller) return res.status(401).json({ success: false, error: 'Nicht authentifiziert' })

  const reason = deriveCancelReason({
    currentStatus: booking.status,
    scheduledDate: booking.scheduled_date,
    scheduledTime: booking.scheduled_time,
    actorType: caller.actorType,
  })

  const corRes = await callEdgeFunction('cancel-or-refund', caller.token, {
    booking_id: bookingId,
    reason,
    actor_type: caller.actorType,
    actor_id: caller.authUid,
    note: 'Kunde lehnt Trainer-Treffpunkt ab',
  })
  if (!corRes.httpOk) {
    return res.status(502).json({ success: false, error: corRes.body?.error || 'Storno fehlgeschlagen', detail: corRes.body })
  }

  // Location-spezifische Felder zuruecksetzen (cancel-or-refund hat status +
  // storno_* bereits gesetzt).
  const auditNote = `[Location ${new Date().toISOString()}] Kunde hat Trainer-Treffpunkt abgelehnt. Buchung storniert.`
  const newNotes = booking.notes ? `${booking.notes}\n${auditNote}` : auditNote
  const { data: upd, error: updErr } = await supabase
    .from('bookings')
    .update({
      flag_neuer_ort_vorgeschlagen: false,
      notes: newNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select('id')

  if (updErr) {
    console.error('handleLocationReject: Location-Felder-Reset fehlgeschlagen', updErr.message)
  } else if (!upd || upd.length === 0) {
    console.error('handleLocationReject: Location-Felder-Reset 0 Zeilen (RLS?)')
  }
  return res.json({ success: true })
}

// ─── ACTION: trainer_vacation ──────────────────────────────────────────────────

async function handleTrainerVacation(req, res, supabase) {
  const body = await getBody(req);

  if (req.method === 'POST') {
    const { trainer_id, start_date, end_date, reason } = body;
    if (!trainer_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'trainer_id, start_date, end_date required' });
    }
    const { data, error } = await supabase.from('trainer_vacations').insert({
      trainer_id,
      start_date,
      end_date,
      reason: reason || 'urlaub'
    }).select().single();
    if (error) throw error;
    return res.json({ success: true, data });
  }

  if (req.method === 'DELETE') {
    const { id } = body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('trainer_vacations').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
