// Admin: Trainer aktivieren + Auth-Account erstellen
//
// POST { trainerId }
// 1. Liest trainer_profiles Zeile
// 2. Erstellt Supabase Auth User (email_confirm: true)
// 3. Setzt status='active', is_active=true, auth_user_id
// 4. Sendet Einladungs-E-Mail (magiclink → set-password Seite)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // TODO: Auth-Check (z.B. Bearer Token oder Admin-Secret)
  // Für den Anfang: einfacher Secret-Header
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret && req.headers['x-admin-secret'] !== adminSecret) {
    return res.status(401).json({ success: false, error: 'Nicht autorisiert' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY nicht konfiguriert');
    return res.status(500).json({ success: false, error: 'Server-Konfigurationsfehler' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { trainerId } = req.body;

  if (!trainerId) {
    return res.status(400).json({ success: false, error: 'trainerId ist erforderlich' });
  }

  try {
    // 1. Trainer-Profil laden
    const { data: trainer, error: fetchError } = await supabase
      .from('trainer_profiles')
      .select('id, email, full_name, status, auth_user_id')
      .eq('id', trainerId)
      .single();

    if (fetchError || !trainer) {
      console.error('Trainer nicht gefunden:', fetchError?.message);
      return res.status(404).json({ success: false, error: 'Trainer nicht gefunden' });
    }

    if (trainer.auth_user_id) {
      return res.status(409).json({
        success: false,
        error: 'Trainer hat bereits einen Auth-Account',
        authUserId: trainer.auth_user_id,
      });
    }

    // 2. Supabase Auth User erstellen
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: trainer.email,
      email_confirm: true, // E-Mail direkt als bestätigt markieren
      user_metadata: {
        full_name: trainer.full_name,
        role: 'trainer',
        trainer_profile_id: trainer.id,
      },
    });

    if (authError) {
      console.error('Auth User erstellen fehlgeschlagen:', authError.message);
      return res.status(500).json({
        success: false,
        error: 'Auth-Account erstellen fehlgeschlagen',
        debug: authError.message,
      });
    }

    const authUserId = authData.user.id;
    console.log(`Auth User erstellt: ${authUserId} für Trainer ${trainerId}`);

    // 3. trainer_profiles aktualisieren
    const { error: updateError } = await supabase
      .from('trainer_profiles')
      .update({
        status: 'active',
        is_active: true,
        auth_user_id: authUserId,
      })
      .eq('id', trainerId);

    if (updateError) {
      console.error('Trainer-Profil Update fehlgeschlagen:', updateError.message);
      // Auth User wurde erstellt, Profil-Update aber fehlgeschlagen
      return res.status(500).json({
        success: false,
        error: 'Profil-Update fehlgeschlagen (Auth-User wurde erstellt)',
        authUserId,
        debug: updateError.message,
      });
    }

    // 4. Einladungs-E-Mail senden (Magic Link → set-password Seite)
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      trainer.email,
      {
        redirectTo: 'https://projektfit.net/trainer-portal/set-password/',
      }
    );

    if (inviteError) {
      console.error('Einladungs-E-Mail fehlgeschlagen:', inviteError.message);
      // Nicht fatal – Trainer ist aktiviert, E-Mail kann nachgesendet werden
      return res.status(200).json({
        success: true,
        warning: 'Trainer aktiviert, aber Einladungs-E-Mail fehlgeschlagen',
        authUserId,
        trainerId,
        debug: inviteError.message,
      });
    }

    console.log(`Einladungs-E-Mail gesendet an ${trainer.email}`);

    return res.status(200).json({
      success: true,
      message: `Trainer ${trainer.full_name} aktiviert und Einladung gesendet`,
      authUserId,
      trainerId,
    });
  } catch (error) {
    console.error('activate-trainer Exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
      debug: error.message || String(error),
    });
  }
}
