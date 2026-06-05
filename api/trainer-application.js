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
    cityIds,
    cityOther,
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
  if (!fullName || !email || !qualification) {
    return res.status(400).json({ success: false, error: 'Pflichtfelder fehlen (Vorname, Nachname, E-Mail, Qualifikation)' });
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

  // Wunsch-Einsatzorte: angehakte Stadt-IDs + freier Text. city (Übergangsfeld) =
  // Name der ERSTEN aktiven angehakten Stadt (per SELECT, nie hardcoded).
  const ids = Array.isArray(cityIds) ? cityIds.filter(Boolean).map(String) : [];
  const otherText = (cityOther || '').trim() || null;
  let cityName = null;
  if (ids.length > 0) {
    const { data: locs } = await supabase
      .from('service_locations').select('id, city, is_active').in('id', ids);
    const firstActive = (locs || []).find(l => l.is_active);
    cityName = firstActive ? firstActive.city : null;
  }
  const bewerbungWunsch = (ids.length > 0 || otherText) ? { city_ids: ids, text: otherText } : null;

  // Build insert payload
  const insertData = {
    full_name: fullName,
    email: emailTrimmed,
    phone: phone ? phone.trim() : null,
    city: cityName,
    bewerbung_wunsch: bewerbungWunsch,
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
      });
    }

    return res.status(200).json({ success: true, message: 'Bewerbung eingegangen', trainerId: data?.[0]?.id });
  } catch (error) {
    console.error('Trainer application Exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Bewerbung fehlgeschlagen',
    });
  }
}
