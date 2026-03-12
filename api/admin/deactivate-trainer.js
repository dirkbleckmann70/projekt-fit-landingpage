// Admin: Trainer deaktivieren
//
// POST { trainerId }
// Setzt status='gesperrt', is_active=false

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { trainerId } = req.body;

  if (!trainerId) {
    return res.status(400).json({ error: 'trainerId ist erforderlich' });
  }

  try {
    const { data: trainer, error: fetchError } = await supabase
      .from('trainer_profiles')
      .select('id, full_name, status')
      .eq('id', trainerId)
      .single();

    if (fetchError || !trainer) {
      return res.status(404).json({ error: 'Trainer nicht gefunden' });
    }

    const { error: updateError } = await supabase
      .from('trainer_profiles')
      .update({ status: 'gesperrt', is_active: false })
      .eq('id', trainerId);

    if (updateError) throw updateError;

    return res.json({
      success: true,
      message: `Trainer ${trainer.full_name} deaktiviert`,
    });
  } catch (err) {
    console.error('Deactivate Trainer Error:', err);
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
