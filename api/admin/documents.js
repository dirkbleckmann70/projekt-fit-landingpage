// Admin Documents API – GET (Liste), POST (Upload), DELETE (Löschen)
//
// Storage Bucket: "admin-documents" (muss manuell in Supabase angelegt werden)
// DB Tabelle: admin_documents

import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import { readFileSync } from 'fs';

export const config = { api: { bodyParser: false } };

const BUCKET = 'admin-documents';
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth für alle Methoden
  const authError = await verifyAdmin(req);
  if (authError) return res.status(401).json({ error: authError });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ─── GET: Alle Dokumente laden ────────────────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('admin_documents')
        .select('*')
        .order('folder')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') return res.json({ data: [] });
        throw error;
      }

      return res.json({ data: data || [] });
    }

    // ─── POST: Datei hochladen ────────────────────────────────────
    if (req.method === 'POST') {
      const { fields, files } = await parseForm(req);

      const folder = fields.folder?.[0] || fields.folder;
      if (!folder) return res.status(400).json({ error: 'folder ist erforderlich' });

      const validFolders = ['vertraege', 'agb-rechtliches', 'vorlagen', 'sonstiges'];
      if (!validFolders.includes(folder)) {
        return res.status(400).json({ error: `Ungültiger Ordner: ${folder}` });
      }

      const uploaded = [];
      const fileList = Array.isArray(files.files) ? files.files : (files.files ? [files.files] : []);

      if (fileList.length === 0) {
        return res.status(400).json({ error: 'Keine Dateien hochgeladen' });
      }

      for (const file of fileList) {
        if (file.size > MAX_SIZE) {
          return res.status(400).json({ error: `${file.originalFilename} ist zu groß (max 20 MB)` });
        }

        const safeName = file.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${folder}/${Date.now()}_${safeName}`;
        const fileBuffer = readFileSync(file.filepath);

        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, fileBuffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadErr) throw uploadErr;

        // DB-Eintrag
        const adminEmail = await getAdminEmail(req);
        const { data: doc, error: insertErr } = await supabase
          .from('admin_documents')
          .insert({
            folder,
            filename: file.originalFilename,
            path: storagePath,
            size_bytes: file.size,
            content_type: file.mimetype,
            uploaded_by: adminEmail,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        uploaded.push(doc);
      }

      return res.json({ success: true, files: uploaded });
    }

    // ─── DELETE: Datei löschen ────────────────────────────────────
    if (req.method === 'DELETE') {
      // DELETE braucht body parsing – Content-Type ist JSON
      const body = await parseJsonBody(req);
      const { id, path } = body;

      if (!id || !path) {
        return res.status(400).json({ error: 'id und path sind erforderlich' });
      }

      // Aus Storage löschen
      const { error: deleteErr } = await supabase.storage
        .from(BUCKET)
        .remove([path]);

      if (deleteErr) {
        console.error('Storage DELETE error:', deleteErr.message);
      }

      // Aus DB löschen
      const { error: dbErr } = await supabase
        .from('admin_documents')
        .delete()
        .eq('id', id);

      if (dbErr) throw dbErr;

      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin Documents API Error:', err);
    return res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ maxFileSize: MAX_SIZE, multiples: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Ungültiges JSON')); }
    });
  });
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

async function getAdminEmail(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.email || null;
}
