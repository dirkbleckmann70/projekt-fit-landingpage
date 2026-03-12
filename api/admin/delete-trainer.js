// Admin Delete Trainer API – Trainer und alle zugehörigen Daten löschen
//
// Lösch-Reihenfolge:
// 1. Dateien aus Supabase Storage (trainer-documents/{trainerId}/*)
// 2. trainer_availability WHERE trainer_id
// 3. trainer_reviews WHERE trainer_id
// 4. bookings: trainer_id = null (Buchungen bleiben erhalten)
// 5. trainer_profiles Eintrag löschen
// 6. Auth-User löschen (falls vorhanden)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const { trainerId } = req.body;
  if (!trainerId) return res.status(400).json({ error: 'trainerId fehlt' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Trainer laden (Status-Check + auth_user_id)
    const { data: trainer, error: fetchErr } = await supabase
      .from('trainer_profiles')
      .select('id, status, auth_user_id, license_files')
      .eq('id', trainerId)
      .single();

    if (fetchErr || !trainer) {
      return res.status(404).json({ error: 'Trainer nicht gefunden' });
    }

    if (trainer.status === 'active') {
      return res.status(400).json({ error: 'Aktive Trainer können nicht gelöscht werden. Bitte zuerst deaktivieren.' });
    }

    // 1. Dateien aus Storage löschen
    const BUCKET = 'trainer-documents';
    const { data: storageFiles } = await supabase.storage
      .from(BUCKET)
      .list(trainerId);

    if (storageFiles && storageFiles.length > 0) {
      const paths = storageFiles.map(f => `${trainerId}/${f.name}`);
      await supabase.storage.from(BUCKET).remove(paths);
    }

    // 2. trainer_availability löschen
    await supabase
      .from('trainer_availability')
      .delete()
      .eq('trainer_id', trainerId);

    // 3. trainer_reviews löschen
    await supabase
      .from('trainer_reviews')
      .delete()
      .eq('trainer_id', trainerId);

    // 4. bookings: trainer_id auf null setzen
    await supabase
      .from('bookings')
      .update({ trainer_id: null })
      .eq('trainer_id', trainerId);

    // 5. trainer_profiles löschen
    const { error: deleteErr } = await supabase
      .from('trainer_profiles')
      .delete()
      .eq('id', trainerId);

    if (deleteErr) throw deleteErr;

    // 6. Auth-User löschen (falls vorhanden)
    if (trainer.auth_user_id) {
      const { error: authErr } = await supabase.auth.admin.deleteUser(trainer.auth_user_id);
      if (authErr) {
        console.error('Auth-User löschen fehlgeschlagen:', authErr.message);
        // Nicht blockierend – Profil ist bereits gelöscht
      }
    }

    return res.json({ success: true, message: 'Trainer und alle zugehörigen Daten gelöscht.' });
  } catch (err) {
    console.error('Delete Trainer Error:', err);
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
