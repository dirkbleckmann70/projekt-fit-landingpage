// TEMPORÄR – Einmalig Admin-User in Supabase Auth anlegen
// Nach Nutzung wieder löschen!

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: 'dbl70@web.de',
      password: 'ProjektFit2026!',
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        full_name: 'Dirk Bleckmann',
      },
    });

    if (error) {
      console.error('Admin-User erstellen fehlgeschlagen:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log('Admin-User erstellt:', data.user.id);
    return res.status(200).json({
      success: true,
      message: 'Admin-User erstellt',
      userId: data.user.id,
      email: data.user.email,
    });
  } catch (err) {
    console.error('Exception:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}
