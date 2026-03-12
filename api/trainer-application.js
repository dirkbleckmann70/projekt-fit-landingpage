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
    return res.status(500).json({
      success: false,
      error: 'Server-Konfigurationsfehler',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    firstName,
    lastName,
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
    wohnort,
  } = req.body;

  // Support both old (name) and new (firstName + lastName) format
  const fullName = (firstName && lastName)
    ? (firstName.trim() + ' ' + lastName.trim())
    : (name ? name.trim() : '');

  // Validate required fields
  if (!fullName || !email || !city || !qualification) {
    return res.status(400).json({ success: false, error: 'Pflichtfelder fehlen (Vorname, Nachname, E-Mail, Einsatzort, Qualifikation)' });
  }

  const emailTrimmed = email.trim().toLowerCase();

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return res.status(400).json({ success: false, error: 'Ungültige E-Mail-Adresse' });
  }

  // Check for duplicate email
  try {
    const { data: existing, error: selectError } = await supabase
      .from('trainer_profiles')
      .select('id')
      .eq('email', emailTrimmed)
      .limit(1);

    if (selectError) {
      console.error('Duplikat-Check SELECT error:', JSON.stringify(selectError));
      console.error('  message:', selectError.message);
      console.error('  details:', selectError.details);
      console.error('  hint:', selectError.hint);
      console.error('  code:', selectError.code);
      // Don't block – continue with insert attempt
    }

    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Mit dieser E-Mail existiert bereits eine Bewerbung.' });
    }
  } catch (err) {
    console.error('Duplikat-Check Exception:', err);
  }

  // Build insert payload
  const insertData = {
    full_name: fullName,
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
    wohnort: wohnort ? wohnort.trim() : null,
  };

  console.log('INSERT payload:', JSON.stringify(insertData));
  console.log('INSERT fields:', Object.keys(insertData).join(', '));

  try {
    const { data, error } = await supabase.from('trainer_profiles').insert(insertData).select();

    if (error) {
      console.error('Supabase INSERT error:', JSON.stringify(error));
      console.error('  message:', error.message);
      console.error('  details:', error.details);
      console.error('  hint:', error.hint);
      console.error('  code:', error.code);
      return res.status(500).json({
        success: false,
        error: 'Bewerbung fehlgeschlagen',
        debug: {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
      });
    }

    console.log('INSERT success:', JSON.stringify(data));
    return res.status(200).json({ success: true, message: 'Bewerbung eingegangen', trainerId: data?.[0]?.id });
  } catch (error) {
    console.error('Trainer application Exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Bewerbung fehlgeschlagen',
      debug: { exception: error.message || String(error) },
    });
  }
}
