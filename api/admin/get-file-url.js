// Admin Get File URL – Generiert signierte URL für Storage-Dateien

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const { path, bucket } = req.body;
  if (!path) return res.status(400).json({ error: 'path ist erforderlich' });

  const bucketName = bucket || 'trainer-documents';
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, 3600); // 1 Stunde gültig

    if (error) throw error;
    return res.json({ success: true, url: data.signedUrl });
  } catch (err) {
    console.error('Get File URL Error:', err);
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
