export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email fehlt' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email: email,
        listIds: [2],
        updateEnabled: true
      })
    });

    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true });
    } else {
      const data = await response.json();
      if (data.code === 'duplicate_parameter') {
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Anmeldung fehlgeschlagen' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Server-Fehler' });
  }
}
