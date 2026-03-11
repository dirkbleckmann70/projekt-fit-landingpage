import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY nicht konfiguriert');
    return res.status(500).json({ success: false, error: 'Server-Konfigurationsfehler' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    name,
    email,
    phone,
    city,
    qualification,
    message,
    steuernummer,
    kleinunternehmer,
    address,
    postalCode,
  } = req.body;

  // Validate required fields
  if (!name || !email || !city || !qualification) {
    return res.status(400).json({ success: false, error: 'Pflichtfelder fehlen (Name, E-Mail, Stadt, Qualifikation)' });
  }

  const emailTrimmed = email.trim().toLowerCase();

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return res.status(400).json({ success: false, error: 'Ungültige E-Mail-Adresse' });
  }

  // Check for duplicate email
  try {
    const { data: existing } = await supabase
      .from('trainer_profiles')
      .select('id')
      .eq('email', emailTrimmed)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Mit dieser E-Mail existiert bereits eine Bewerbung.' });
    }
  } catch (err) {
    console.error('Duplikat-Check fehlgeschlagen:', err);
  }

  try {
    const { error } = await supabase.from('trainer_profiles').insert({
      full_name: name.trim(),
      email: emailTrimmed,
      phone: phone ? phone.trim() : null,
      city: city.trim(),
      bio: message ? message.trim() : null,
      specializations: qualification ? qualification.trim() : null,
      status: 'pending',
      is_kleinunternehmer: kleinunternehmer === true,
      steuernummer: steuernummer ? steuernummer.trim() : null,
      street_address: address ? address.trim() : null,
      postal_code: postalCode ? postalCode.trim() : null,
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ success: false, error: 'Bewerbung fehlgeschlagen' });
    }

    return res.status(200).json({ success: true, message: 'Bewerbung eingegangen' });
  } catch (error) {
    console.error('Trainer application error:', error);
    return res.status(500).json({ success: false, error: 'Bewerbung fehlgeschlagen' });
  }
}
