// ============================================================================
// /api/customer-promotion
//
// B-2026-05-14-02 / Vorgang 8 (Abo-Mapping):
// Admin kann eine zeitlich begrenzte Buchungs-Aktion (Goodwill / Promo) fuer
// einen Kunden freischalten oder wieder beenden. Schreibt die vier Steuer-
// Spalten auf `customers`:
//   - bookings_unlocked_until  (timestamptz, NULL = keine Aktion)
//   - bookings_unlock_note     (interne Notiz, optional)
//   - bookings_unlock_set_by   (auth.users.id des Admins, Audit)
//   - bookings_unlock_set_at   (Zeitpunkt des Setzens, Audit)
//
// Methoden:
//   POST   body: { customer_id, until (ISO-Date), note? }
//   DELETE query: ?customer_id=<uuid>
//
// Auth-Pattern bewusst identisch zu `landingpage/api/admin/index.js`
// (Bearer-Token + supabase.auth.getUser + user_metadata.role.includes('admin')).
// Kein admin_users-Tabellen-Lookup — den Pattern nutzt das bestehende Admin-API
// auch nicht (Plan v1.1 Step 2.5 erwaehnt ihn nur als Alternative).
// ============================================================================

import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const ALLOWED_ORIGINS = [
  'https://projektfit.net',
  'https://www.projektfit.net',
  'https://pulsly.de',
  'https://www.pulsly.de',
  'http://localhost:3000',
  'http://localhost:5500',
];

function getCorsOrigin(req) {
  const origin = req.headers?.origin || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Token fehlt' };
  }
  const token = authHeader.split(' ')[1];
  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Ungueltiger Token' };
  if (!user.user_metadata?.role?.includes('admin')) {
    return { error: 'Kein Admin-Zugang' };
  }
  return { adminAuthUserId: user.id };
}

export default async function handler(req, res) {
  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Auth ──
  const auth = await verifyAdmin(req);
  if (auth.error) return res.status(401).json({ error: auth.error });

  const supabase = getServiceClient();

  // ── POST: Aktion setzen ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const { customer_id, until, note } = body;

    if (!customer_id) return res.status(400).json({ error: 'customer_id Pflicht' });
    if (!until) return res.status(400).json({ error: 'until Pflicht' });

    const untilDate = new Date(until);
    if (isNaN(untilDate.getTime())) {
      return res.status(400).json({ error: 'until: ungueltiges Datum' });
    }
    if (untilDate <= new Date()) {
      return res.status(400).json({ error: 'until-Datum muss in der Zukunft liegen' });
    }

    // Note auf 200 Zeichen kappen (Modal-maxlength) — Verteidigung gegen Client-Bypass.
    const safeNote = typeof note === 'string' && note.length > 0
      ? note.slice(0, 200)
      : null;

    const { data, error } = await supabase
      .from('customers')
      .update({
        bookings_unlocked_until: untilDate.toISOString(),
        bookings_unlock_note: safeNote,
        bookings_unlock_set_by: auth.adminAuthUserId,
        bookings_unlock_set_at: new Date().toISOString(),
      })
      .eq('id', customer_id)
      .select('id');

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) {
      // RLS-Silent-Fail oder unbekannte customer_id — beides hier ein 404-Hinweis.
      return res.status(404).json({ error: 'Kunde nicht gefunden oder Schreibrecht fehlt' });
    }
    return res.status(200).json({ ok: true });
  }

  // ── DELETE: Aktion beenden ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const customer_id = req.query?.customer_id;
    if (!customer_id) return res.status(400).json({ error: 'customer_id Pflicht' });

    const { data, error } = await supabase
      .from('customers')
      .update({
        bookings_unlocked_until: null,
        bookings_unlock_note: null,
        bookings_unlock_set_by: auth.adminAuthUserId,
        bookings_unlock_set_at: new Date().toISOString(),
      })
      .eq('id', customer_id)
      .select('id');

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden oder Schreibrecht fehlt' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
