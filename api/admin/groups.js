// Admin Groups API – POST (erstellen) + PUT (aktualisieren)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === 'POST') {
      const { name, trainer_id, city, location_name, location_address, day_of_week, start_time, duration_minutes, max_participants, price_per_person_cents, is_active } = req.body;

      if (!name || !trainer_id || !city) {
        return res.status(400).json({ error: 'Kursname, Trainer und Stadt sind Pflichtfelder' });
      }

      console.log('Creating group_class:', { name, trainer_id, city, location_name, day_of_week, start_time, price_per_person_cents });

      const { data, error } = await supabase.from('group_classes').insert({
        name,
        trainer_id,
        city,
        location_name: location_name || null,
        location_address: location_address || null,
        day_of_week: day_of_week || null,
        start_time: start_time || null,
        duration_minutes: duration_minutes || 60,
        max_participants: max_participants || 12,
        price_per_person_cents: price_per_person_cents || null,
        is_active: is_active !== false,
      }).select();

      if (error) {
        console.error('group_classes INSERT error:', error.message, error.code, error.details);
        throw error;
      }
      console.log('Group created:', data?.[0]?.id);
      return res.json({ success: true, data: data?.[0] });
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id ist erforderlich' });
      }

      const allowed = [
        'name', 'trainer_id', 'city', 'location_name', 'location_address',
        'day_of_week', 'start_time', 'duration_minutes',
        'max_participants', 'price_per_person_cents', 'is_active',
      ];

      const update = {};
      for (const key of allowed) {
        if (key in fields) update[key] = fields[key];
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'Keine aktualisierbaren Felder angegeben' });
      }

      const { error } = await supabase
        .from('group_classes')
        .update(update)
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id ist erforderlich' });
      }

      // Zuerst Teilnehmer löschen
      const { error: partError } = await supabase
        .from('group_participants')
        .delete()
        .eq('group_class_id', id);

      if (partError && partError.code !== '42P01') {
        console.error('group_participants DELETE error:', partError.message);
      }

      // Dann den Kurs löschen
      const { error } = await supabase
        .from('group_classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin Groups API Error:', err);
    const detail = err.details || err.hint || '';
    return res.status(500).json({ error: `${err.message || 'Interner Fehler'}${detail ? ' – ' + detail : ''}` });
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
