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

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;
  if (!action) {
    return res.status(400).json({ error: 'action Parameter fehlt. Beispiel: /api/admin?action=data&type=all_trainers' });
  }

  // ── Auth Check (einmal für alle Actions) ──
  // activate-trainer hat eigene Legacy-Auth (x-admin-secret), rest nutzt Bearer
  let adminAuthError = null;
  if (action !== 'activate-trainer') {
    adminAuthError = await verifyAdmin(req);
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
        // Legacy auth: x-admin-secret OR Bearer token
        const adminSecret = process.env.ADMIN_SECRET;
        if (adminSecret && req.headers['x-admin-secret'] !== adminSecret) {
          const bearerErr = await verifyAdmin(req);
          if (bearerErr) return res.status(401).json({ error: bearerErr });
        }
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
        if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
        return await handleBookingsPut(req, res, supabase);
      }

      // ═══════════════════════════════════════════════════════════════════
      // CUSTOMERS – GET (alle) + POST (erstellen) + PUT (aktualisieren)
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
      // LOCATIONS – POST + PUT
      // ═══════════════════════════════════════════════════════════════════
      case 'locations': {
        return await handleLocations(req, res, supabase);
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
    return res.status(500).json({ error: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.' });
  }
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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
  const trainerIds = [...new Set(bookings.map(b => b.trainer_id).filter(Boolean))];
  let trainerMap = {};
  if (trainerIds.length > 0) {
    const { data: trainers } = await supabase
      .from('trainer_profiles')
      .select('id, full_name, payout_cents')
      .in('id', trainerIds);
    if (trainers) trainers.forEach(t => { trainerMap[t.id] = t; });
  }
  return bookings.map(b => ({
    ...b,
    trainer_name: trainerMap[b.trainer_id]?.full_name || null,
    payout_cents: trainerMap[b.trainer_id]?.payout_cents || null,
  }));
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
        .in('status', ['CONFIRMED', 'COMPLETED']);
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
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      const enriched = await enrichBookings(supabase, data || []);
      return res.json({ data: enriched });
    }

    case 'recent_bookings': {
      const n = parseInt(limit) || 5;
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(n);
      if (error) throw error;
      const enriched = await enrichBookings(supabase, data || []);
      return res.json({ data: enriched });
    }

    case 'finances': {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      const enriched = await enrichBookings(supabase, data || []);
      return res.json({ data: enriched });
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
      const { data, error } = await supabase
        .from('group_participants')
        .select('*')
        .eq('group_class_id', group_id)
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }
      return res.json({ data: data || [] });
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
    'steuernummer', 'is_kleinunternehmer', 'street_address', 'postal_code', 'wohnort',
    'status', 'is_active', 'hourly_rate_cents', 'payout_cents', 'contract_files',
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

  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    trainer.email,
    { redirectTo: 'https://projektfit.net/trainer-portal/set-password/' }
  );

  if (inviteError) {
    return res.json({ success: true, warning: 'Trainer aktiviert, aber Einladungs-E-Mail fehlgeschlagen', authUserId, trainerId });
  }

  return res.json({ success: true, message: `Trainer ${trainer.full_name} aktiviert und Einladung gesendet`, authUserId, trainerId });
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
    // 1. Alle group_participants löschen, deren Kurs diesem Trainer gehört
    const { data: trainerGroups } = await supabase
      .from('group_classes')
      .select('id')
      .eq('trainer_id', trainerId);
    if (trainerGroups && trainerGroups.length > 0) {
      const groupIds = trainerGroups.map(g => g.id);
      const { error: partErr } = await supabase
        .from('group_participants')
        .delete()
        .in('group_class_id', groupIds);
      if (partErr && partErr.code !== '42P01') console.error('group_participants DELETE:', partErr.message);
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
  const { bookingId, status, paid } = body;

  if (!bookingId) return res.status(400).json({ error: 'bookingId ist erforderlich' });

  const update = {};

  if (status !== undefined) {
    const validStatuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Ungültiger Status. Erlaubt: ${validStatuses.join(', ')}` });
    }
    update.status = status;
  }

  if (paid !== undefined) {
    update.paid = !!paid;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
  }

  const { error } = await supabase.from('bookings').update(update).eq('id', bookingId);
  if (error) throw error;
  return res.json({ success: true });
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
      computedDayOfWeek = new Date(scheduled_date + 'T00:00:00').getDay();
    }

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
    }).select();

    if (error) throw error;
    return res.json({ success: true, data: data?.[0] });
  }

  if (req.method === 'PUT') {
    const body = await getBody(req);
    const { id, ...fields } = body;
    if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

    const allowed = ['name', 'trainer_id', 'city', 'location_name', 'location_address', 'day_of_week', 'start_time', 'duration_minutes', 'max_participants', 'price_per_person_cents', 'is_active', 'scheduled_date', 'scheduled_time'];
    const update = {};
    for (const key of allowed) { if (key in fields) update[key] = fields[key]; }

    // Recalculate day_of_week if scheduled_date changed
    if (update.scheduled_date) {
      update.day_of_week = new Date(update.scheduled_date + 'T00:00:00').getDay();
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

    const { error: partError } = await supabase.from('group_participants').delete().eq('group_class_id', id);
    if (partError && partError.code !== '42P01') console.error('group_participants DELETE error:', partError.message);

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

  return res.status(405).json({ error: 'Method not allowed' });
}

// ─── ACTION: update-participant ──────────────────────────────────────────────

async function handleUpdateParticipant(req, res, supabase) {
  const body = await getBody(req);
  const { id, attended, customer_paid, trainer_paid } = body;

  if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

  const update = {};
  if (attended !== undefined) update.attended = !!attended;
  if (customer_paid !== undefined) update.customer_paid = !!customer_paid;
  if (trainer_paid !== undefined) update.trainer_paid = !!trainer_paid;

  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Keine aktualisierbaren Felder' });

  const { error } = await supabase.from('group_participants').update(update).eq('id', id);
  if (error) throw error;
  return res.json({ success: true });
}

// ─── ACTION: add-participant ─────────────────────────────────────────────────

async function handleAddParticipant(req, res, supabase) {
  const body = await getBody(req);
  const { group_class_id, customer_name, customer_email } = body;

  if (!group_class_id || !customer_name) {
    return res.status(400).json({ error: 'group_class_id und customer_name sind erforderlich' });
  }

  const { data, error } = await supabase.from('group_participants').insert({
    group_class_id,
    customer_name,
    customer_email: customer_email || null,
    attended: false,
    customer_paid: false,
    trainer_paid: false,
  }).select();

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
      is_active: s.is_active !== false,
    }));

    const { error: insError } = await supabase
      .from('trainer_availability')
      .insert(rows);

    if (insError) throw insError;
  }

  return res.json({ success: true, count: slots.length });
}
