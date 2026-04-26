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
  const trainerAllowedTypes = ['customer_names', 'booking_locations'];
  const isTrainerAllowedRead = action === 'data' && req.method === 'GET' && trainerAllowedTypes.includes(req.query.type);
  const isTrainerAllowedWrite = (action === 'bookings' && req.method === 'PUT') ||
                               (action === 'update-participant' && req.method === 'PUT');
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
          day_of_week: new Date(d + 'T12:00:00Z').getDay() || 7,
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
      // COMPANY-SETTINGS – GET (laden) + PUT (speichern)
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
          const body = await getBody(req);
          const updateData = { ...body, updated_at: new Date().toISOString() };
          // Prüfen ob bereits ein Eintrag existiert
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
            mwst_satz: 19,
          }).select().single();

          if (cardErr) return res.status(500).json({ error: cardErr.message });

          // Rechnung generieren
          try {
            await supabase.functions.invoke('generate-invoice', {
              body: { type: 'rechnung_gt_card', gt_card_id: card.id, customer_id }
            });
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

async function verifyAuthenticated(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return 'Token fehlt';
  const token = authHeader.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return 'Ungültiger Token';
  return null;
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return 'Token fehlt';

  const token = authHeader.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return 'Ungültiger Token';
  if (!user.user_metadata?.role?.includes('admin')) return 'Kein Admin-Zugang';
  return null;
}

// ─── Teilspec 1 Status-Bridge ───────────────────────────────────────────────
// Frontend (Trainer-Portal-HTMLs + Admin-Portal-HTMLs) arbeitet noch mit dem
// Legacy-Wortschatz (pending/confirmed/reschedule_proposed/...). Die DB
// akzeptiert nur den neuen 7-Wert-Kanon. Diese zwei Helper bilden die Bruecke,
// damit das Frontend unangetastet bleibt — die UX-Vereinheitlichung (eigener
// Auftrag nach Teilspec 1) raeumt das spaeter zentral auf.

function mapStatusForFrontend(row) {
  const status = row.status;
  // Status 'bestaetigt' + Flag → virtueller Sub-Status
  if (status === 'bestaetigt') {
    if (row.flag_neuer_termin_vorgeschlagen) return 'reschedule_proposed';
    if (row.flag_neuer_ort_vorgeschlagen) return 'location_proposed';
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
      return { status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: false, flag_neuer_ort_vorgeschlagen: false };
    case 'reschedule_proposed':
      return { status: 'bestaetigt', flag_neuer_termin_vorgeschlagen: true };
    case 'location_proposed':
      return { status: 'bestaetigt', flag_neuer_ort_vorgeschlagen: true };
    case 'awaiting_checkout':
      return { status: 'laeuft gerade', flag_checkout_bestaetigung_ausstehend: true };
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

  // Aktive Teilnehmer pro Kurs zaehlen (fuer anteilige Trainer-Kosten)
  const activeCountByClass = {};
  participants.forEach(p => {
    const st = (p.status || '').toLowerCase();
    if (st !== 'storniert') {
      activeCountByClass[p.group_class_id] = (activeCountByClass[p.group_class_id] || 0) + 1;
    }
  });

  return participants.map(p => {
    const gc       = classMap[p.group_class_id] || {};
    const trainer  = trainerMap[gc.trainer_id]  || {};
    const customer = customerMap[p.customer_id] || {};
    const isCancelled = (p.status || '').toLowerCase() === 'storniert';

    const priceFromParticipant      = p.price_cents;
    const finalPriceFromParticipant = p.final_price_cents;
    const payoutFromParticipant     = p.trainer_payout_cents;

    // Fallback (alte GT-Buchungen ohne Payment-Spalten): anteiliger Payout
    const count = activeCountByClass[p.group_class_id] || 1;
    const payoutShare = trainer.payout_cents ? Math.round(trainer.payout_cents / count) : 0;

    const priceCents      = priceFromParticipant     ?? (gc.price_per_person_cents || 0);
    const finalPriceCents = finalPriceFromParticipant ?? priceCents;
    const payoutCents     = payoutFromParticipant    ?? payoutShare;
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
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('bookings')
        .select('price_cents')
        .gte('created_at', monthStart.toISOString())
        .in('status', ['bestaetigt', 'laeuft gerade', 'abgeschlossen']);
      if (error) throw error;
      const total = (data || []).reduce((sum, b) => sum + (b.price_cents || 0), 0);
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
      return res.json({ data: data || [] });
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
      const mapped = (data || []).map(withFrontendStatus);
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

    // ─── Calendar: Trainer mit Stadt (für Filter) ───────────────────────
    case 'calendar_trainers': {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('id, full_name, city, status')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
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
        .select('id, trainer_id, customer_id, scheduled_date, scheduled_time, status, price_cents, trainer_payout_cents, booking_type, art, flag_neuer_termin_vorgeschlagen, flag_neuer_ort_vorgeschlagen, flag_checkout_bestaetigung_ausstehend, storno_wer, storno_grund')
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

    // ─── Dashboard KPIs (exakte Berechnungen) ─────────────────────────
    case 'dashboard_kpis': {
      const mondayISO = req.query.monday;
      const monthISO = req.query.month_start;

      const [trainersRes, pendingRes, weekBookingsRes, monthRevenueRes] = await Promise.all([
        supabase.from('trainer_profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('trainer_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('scheduled_date', mondayISO).in('status', ['bestaetigt', 'laeuft gerade', 'abgeschlossen']),
        supabase.from('bookings').select('price_cents').eq('status', 'abgeschlossen').gte('scheduled_date', monthISO),
      ]);

      return res.json({
        active_trainers: trainersRes.count ?? 0,
        pending_trainers: pendingRes.count ?? 0,
        week_bookings: weekBookingsRes.count ?? 0,
        month_revenue_cents: (monthRevenueRes.data || []).reduce((sum, b) => sum + (b.price_cents || 0), 0),
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
      const bookingId = req.query?.bookingId
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

async function handleTrainersPost(req, res, supabase) {
  const body = await getBody(req);
  const { full_name, email, phone, city, street_address, postal_code, wohnort, specializations, bio, steuernummer, is_kleinunternehmer, hourly_rate_cents, payout_cents, status } = body;

  if (!full_name || !email || !city) {
    return res.status(400).json({ error: 'Name, E-Mail und Einsatzort sind Pflichtfelder' });
  }

  const { data, error } = await supabase.from('trainer_profiles').insert({
    full_name,
    email: email.trim().toLowerCase(),
    phone: phone || null,
    city,
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
  return res.json({ success: true, data: data?.[0] });
}

async function handleTrainersPut(req, res, supabase) {
  const body = await getBody(req);
  const { trainerId, ...fields } = body;

  if (!trainerId) return res.status(400).json({ error: 'trainerId ist erforderlich' });

  const allowed = [
    'full_name', 'email', 'phone', 'city', 'specializations', 'bio',
    'steuernummer', 'is_kleinunternehmer', 'mwst_satz', 'street_address', 'postal_code', 'wohnort',
    'status', 'is_active', 'hourly_rate_cents', 'payout_cents', 'contract_files', 'avatar_url',
  ];

  const update = {};
  for (const key of allowed) {
    if (key in fields) update[key] = fields[key];
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
  }

  const { error } = await supabase.from('trainer_profiles').update(update).eq('id', trainerId);
  if (error) throw error;
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
  const isReactivation = !!trainer.auth_user_id && ['active', 'pausiert', 'gesperrt'].includes(trainer.status);

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
  const { bookingId, status, paid, scheduled_date, scheduled_time, price_cents, final_price_cents, trainer_payout_cents, trainer_id, location_name, location_address, admin_note } = body;

  if (!bookingId) return res.status(400).json({ error: 'bookingId ist erforderlich' });

  const update = {};

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

    if (!['angefragt', 'reserviert', 'bestaetigt'].includes(current.status)) {
      return res.status(400).json({ error: `Reschedule nur bei angefragt/reserviert/bestaetigt moeglich, aktuell: ${current.status}` });
    }

    if (current.status === 'bestaetigt') {
      const bookingDateTime = new Date(`${current.scheduled_date}T${current.scheduled_time}`);
      const now = new Date();
      const diffHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        return res.status(400).json({ error: 'Terminaenderung nur >= 24h vor dem Termin moeglich' });
      }
    }

    const proposedDateTime = new Date(`${proposed_date}T${proposed_time}`);
    if (proposedDateTime <= new Date()) {
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

    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const oldDate = current.scheduled_date;
    const oldTime = (current.scheduled_time || '').slice(0, 5);
    const auditNote = `[Reschedule ${timestamp}] Trainer schlaegt vor: ${proposed_date} ${proposed_time} (vorher: ${oldDate} ${oldTime})`;
    const { data: existingNotes } = await supabase.from('bookings').select('notes').eq('id', bookingId).single();
    update.notes = existingNotes?.notes ? `${existingNotes.notes}\n${auditNote}` : auditNote;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
  }

  update.updated_at = new Date().toISOString();

  const { error } = await supabase.from('bookings').update(update).eq('id', bookingId);
  if (error) throw error;
  return res.json({ success: true });
}

// ─── ACTION: bookings DELETE ────────────────────────────────────────────────

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
      if (error) return res.status(500).json({ error: 'Buchungen loeschen: ' + error.message });
      deletedCount += count || realIds.length;
    }

    // 2. GT-Teilnahmen loeschen.
    // Teilspec 1: GT-Teilnahmen liegen in bookings (art='gt_teilnahme'); IDs sind 1:1
    // gleich mit der Legacy-Tabelle group_participants — beide werden aufgeraeumt.
    if (gpIds.length > 0) {
      const { error: bErr, count: bCount } = await supabase
        .from('bookings')
        .delete({ count: 'exact' })
        .eq('art', 'gt_teilnahme')
        .in('id', gpIds);
      if (bErr) return res.status(500).json({ error: 'GT-Teilnahmen (bookings) loeschen: ' + bErr.message });
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
      computedDayOfWeek = new Date(scheduled_date + 'T12:00:00Z').getDay() || 7;
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

    const allowed = ['name', 'trainer_id', 'city', 'location_name', 'location_address', 'day_of_week', 'start_time', 'duration_minutes', 'max_participants', 'price_per_person_cents', 'is_active', 'scheduled_date', 'scheduled_time', 'equipment'];
    const update = {};
    for (const key of allowed) { if (key in fields) update[key] = fields[key]; }

    // Recalculate day_of_week if scheduled_date changed
    if (update.scheduled_date) {
      update.day_of_week = new Date(update.scheduled_date + 'T12:00:00Z').getDay() || 7;
    }

    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Keine aktualisierbaren Felder' });

    const { error } = await supabase.from('group_classes').update(update).eq('id', id);
    if (error) throw error;
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
    if (partError) console.error('bookings (gt_teilnahme) DELETE error:', partError.message);
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
  const { id, attended, customer_paid, trainer_paid, trainer_checked_out_at } = body;

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

  const { error } = await supabase
    .from('bookings')
    .update(update)
    .eq('id', id)
    .eq('art', 'gt_teilnahme');
  if (error) throw error;
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

  // Customer ggf. ueber Email auflosen (admin-Seite kennt Kunden ueber Mail)
  let resolvedCustomerId = customer_id || null;
  if (!resolvedCustomerId && customer_email) {
    const { data: c } = await supabase
      .from('customers')
      .select('id')
      .eq('email', customer_email.trim().toLowerCase())
      .single();
    if (c) resolvedCustomerId = c.id;
  }

  const insertData = {
    customer_id: resolvedCustomerId,
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
    price_cents: gc.price_per_person_cents || 0,
    final_price_cents: gc.price_per_person_cents || 0,
  };

  const { data, error } = await supabase.from('bookings').insert(insertData).select();
  if (error) throw error;
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
  const { bookingId } = body;

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

  const oldDate = booking.scheduled_date;
  const oldTime = (booking.scheduled_time || '').slice(0, 5);
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const auditNote = `[Reschedule ${timestamp}] Kunde hat angenommen. Termin geaendert von ${oldDate} ${oldTime} auf ${booking.proposed_date} ${(booking.proposed_time || '').slice(0, 5)}`;

  const { error } = await supabase
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
    .eq('id', bookingId);

  if (error) throw error;
  return res.json({ success: true, newDate: booking.proposed_date, newTime: booking.proposed_time });
}

// ─── ACTION: reschedule-reject ────────────────────────────────────────────

async function handleRescheduleReject(req, res, supabase) {
  const body = await getBody(req);
  const { bookingId } = body;

  if (!bookingId) return res.status(400).json({ error: 'bookingId ist erforderlich' });

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, notes, scheduled_date, scheduled_time, proposed_date, proposed_time, flag_neuer_termin_vorgeschlagen')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return res.status(404).json({ error: 'Buchung nicht gefunden' });
  if (!booking.flag_neuer_termin_vorgeschlagen) {
    return res.status(400).json({ error: `Kein offener Termin-Vorschlag fuer diese Buchung (Status: ${booking.status})` });
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const auditNote = `[Reschedule ${timestamp}] Kunde hat abgelehnt. Buchung storniert.`;

  // Teilspec 1: Storno auf neuen Kanon — status='storniert' + storno_wer + storno_grund.
  const { error } = await supabase
    .from('bookings')
    .update({
      proposed_date: null,
      proposed_time: null,
      reschedule_proposed_at: null,
      flag_neuer_termin_vorgeschlagen: false,
      status: 'storniert',
      storno_wer: 'trainer',
      storno_grund: 'reschedule_rejected',
      cancellation_reason: 'Terminaenderung abgelehnt',
      notes: booking.notes ? `${booking.notes}\n${auditNote}` : auditNote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (error) throw error;
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
  const { bookingId } = body
  if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId ist Pflicht' })

  const { data: booking } = await supabase.from('bookings').select('selected_location_id, location_name, location_address, notes').eq('id', bookingId).single()
  if (!booking) return res.status(404).json({ success: false, error: 'Buchung nicht gefunden' })

  // Teilspec 1: Status bleibt 'bestaetigt' — der Treffpunkt-Vorschlag wird ueber das Flag markiert,
  // beim Akzeptieren wird das Flag zurueckgesetzt.
  const update = {
    status: 'bestaetigt',
    flag_neuer_ort_vorgeschlagen: false,
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

  const { error } = await supabase.from('bookings').update(update).eq('id', bookingId)

  if (error) return res.status(500).json({ success: false, error: error.message })
  return res.json({ success: true })
}

// ─── ACTION: location-reject ──────────────────────────────────────────────────

async function handleLocationReject(req, res, supabase) {
  const body = await getBody(req)
  const { bookingId } = body
  if (!bookingId) return res.status(400).json({ success: false, error: 'bookingId ist Pflicht' })

  const { data: booking } = await supabase.from('bookings').select('notes').eq('id', bookingId).single()
  const auditNote = `[Location ${new Date().toISOString()}] Kunde hat Trainer-Treffpunkt abgelehnt. Buchung storniert.`
  const newNotes = booking?.notes ? `${booking.notes}\n${auditNote}` : auditNote

  // Teilspec 1: Storno auf neuen Kanon — status='storniert' + storno_wer + storno_grund.
  const { error } = await supabase.from('bookings').update({
    status: 'storniert',
    storno_wer: 'kunde',
    storno_grund: 'location_rejected',
    flag_neuer_ort_vorgeschlagen: false,
    notes: newNotes,
    updated_at: new Date().toISOString(),
  }).eq('id', bookingId)

  if (error) return res.status(500).json({ success: false, error: error.message })
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
