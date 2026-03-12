// Admin Trainers API – POST (neuen Trainer anlegen) + PUT (Trainer aktualisieren)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth Check
  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === 'POST') {
      // ── Neuen Trainer anlegen ──
      const { full_name, email, phone, city, street_address, postal_code, wohnort, specializations, bio, steuernummer, is_kleinunternehmer, hourly_rate_cents, payout_cents, status } = req.body;

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

    if (req.method === 'PUT') {
      // ── Trainer aktualisieren ──
      const { trainerId, ...fields } = req.body;

      if (!trainerId) {
        return res.status(400).json({ error: 'trainerId ist erforderlich' });
      }

      // Filter nur erlaubte Felder
      const allowed = [
        'full_name', 'email', 'phone', 'city', 'specializations', 'bio',
        'steuernummer', 'is_kleinunternehmer', 'street_address', 'postal_code', 'wohnort',
        'status', 'is_active', 'hourly_rate_cents', 'payout_cents',
      ];

      const update = {};
      for (const key of allowed) {
        if (key in fields) update[key] = fields[key];
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
      }

      const { error } = await supabase
        .from('trainer_profiles')
        .update(update)
        .eq('id', trainerId);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin Trainers API Error:', err);
    return res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
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
