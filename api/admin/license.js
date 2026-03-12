// Admin License API – GET (Signed URL) + DELETE (Datei löschen)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const BUCKET = 'trainer-documents';

  try {
    if (req.method === 'GET') {
      // Signed URL generieren
      const path = req.query.path;
      if (!path) return res.status(400).json({ error: 'path ist erforderlich' });

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 300); // 5 Minuten gültig

      if (error) throw error;
      return res.json({ success: true, url: data.signedUrl });
    }

    if (req.method === 'DELETE') {
      const { trainerId, path } = req.body;
      if (!trainerId || !path) {
        return res.status(400).json({ error: 'trainerId und path sind erforderlich' });
      }

      // Datei aus Storage löschen
      const { error: deleteError } = await supabase.storage
        .from(BUCKET)
        .remove([path]);

      if (deleteError) {
        console.error('Storage DELETE error:', deleteError.message);
      }

      // Referenz aus license_files entfernen
      const { data: trainer, error: fetchErr } = await supabase
        .from('trainer_profiles')
        .select('license_files')
        .eq('id', trainerId)
        .single();

      if (fetchErr) throw fetchErr;

      const updatedFiles = (trainer.license_files || []).filter(f => f.path !== path);
      const { error: updateErr } = await supabase
        .from('trainer_profiles')
        .update({ license_files: updatedFiles })
        .eq('id', trainerId);

      if (updateErr) throw updateErr;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin License API Error:', err);
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
