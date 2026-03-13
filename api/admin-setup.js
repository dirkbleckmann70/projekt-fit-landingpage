import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.auth.admin.createUser({
    email: 'dbl70@web.de',
    password: 'ProjektFit2026!',
    email_confirm: true,
    user_metadata: { role: 'admin+trainer', full_name: 'Dirk Bleckmann', trainer_profile_id: 'fb6f4b98-18ea-4ac5-b7df-3afbb35f4167' }
  });

  if (error) return res.status(500).json({ error: error.message });

  // Update trainer_profiles mit neuer auth_user_id
  await supabase.from('trainer_profiles').update({ auth_user_id: data.user.id }).eq('id', 'fb6f4b98-18ea-4ac5-b7df-3afbb35f4167');

  // Auch den gesperrten Toller Trainer updaten
  await supabase.from('trainer_profiles').update({ auth_user_id: data.user.id }).eq('id', '2829215e-158f-47f6-be3c-f5c5941220ac');

  return res.status(200).json({ success: true, userId: data.user.id });
}
