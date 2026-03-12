// Admin Locations API – POST (erstellen) + PUT (aktualisieren)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === 'POST') {
      const { city, region, is_active } = req.body;

      if (!city) {
        return res.status(400).json({ error: 'Stadt ist ein Pflichtfeld' });
      }

      const { data, error } = await supabase.from('service_locations').insert({
        city,
        region: region || null,
        is_active: is_active !== false,
      }).select();

      if (error) throw error;
      return res.json({ success: true, data: data?.[0] });
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id ist erforderlich' });
      }

      const allowed = ['city', 'region', 'is_active'];
      const update = {};
      for (const key of allowed) {
        if (key in fields) update[key] = fields[key];
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
      }

      const { error } = await supabase
        .from('service_locations')
        .update(update)
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin Locations API Error:', err);
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
