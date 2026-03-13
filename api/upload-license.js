// Upload-License API – Dateien in Supabase Storage hochladen
// POST: multipart/form-data mit trainerId + files[]

import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';

export const config = {
  api: { bodyParser: false },
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const BUCKET = 'trainer-documents';

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      maxFiles: MAX_FILES,
      filter: ({ mimetype }) => ALLOWED_TYPES.includes(mimetype),
    });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ success: false, error: 'Server-Konfigurationsfehler' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let fields, files;
  try {
    ({ fields, files } = await parseForm(req));
  } catch (err) {
    console.error('Form parse error:', err.message);
    if (err.code === 1009) {
      return res.status(400).json({ success: false, error: 'Datei zu groß (max. 10 MB)' });
    }
    return res.status(400).json({ success: false, error: 'Fehler beim Lesen der Dateien: ' + err.message });
  }

  // trainerId oder customerId aus fields extrahieren (formidable v3 gibt Arrays zurück)
  const trainerId = Array.isArray(fields.trainerId) ? fields.trainerId[0] : fields.trainerId;
  const customerId = Array.isArray(fields.customerId) ? fields.customerId[0] : fields.customerId;
  const subfolder = Array.isArray(fields.subfolder) ? fields.subfolder[0] : fields.subfolder;
  const isContract = subfolder === 'contracts';
  const isCustomer = !!customerId && !trainerId;

  if (!trainerId && !customerId) {
    return res.status(400).json({ success: false, error: 'trainerId oder customerId ist erforderlich' });
  }

  let existingFiles;
  let targetId;
  let targetTable;
  let targetField;

  if (isCustomer) {
    targetId = customerId;
    targetTable = 'customers';
    targetField = 'document_files';
    // Try selecting with document_files; if column doesn't exist, fall back to id-only
    let customer;
    const { data: custData, error: customerErr } = await supabase
      .from('customers')
      .select('id, document_files')
      .eq('id', customerId)
      .single();
    if (customerErr) {
      // Column might not exist yet – try without it
      const { data: custFallback, error: fallbackErr } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customerId)
        .single();
      if (fallbackErr || !custFallback) {
        console.error('Customer lookup error:', customerErr.message, fallbackErr?.message);
        return res.status(404).json({ success: false, error: 'Kunde nicht gefunden: ' + (customerErr.message || fallbackErr?.message || 'Unbekannt') });
      }
      customer = custFallback;
      existingFiles = [];
    } else {
      customer = custData;
      existingFiles = customer.document_files || [];
    }
  } else {
    targetId = trainerId;
    targetTable = 'trainer_profiles';
    targetField = isContract ? 'contract_files' : 'license_files';
    const { data: trainer, error: trainerErr } = await supabase
      .from('trainer_profiles')
      .select('id, license_files, contract_files')
      .eq('id', trainerId)
      .single();
    if (trainerErr || !trainer) {
      return res.status(404).json({ success: false, error: 'Trainer nicht gefunden' });
    }
    existingFiles = isContract ? (trainer.contract_files || []) : (trainer.license_files || []);
  }
  const fileList = files.files || files.file || [];
  const fileArray = Array.isArray(fileList) ? fileList : [fileList];

  if (fileArray.length === 0) {
    return res.status(400).json({ success: false, error: 'Keine Dateien hochgeladen' });
  }

  if (existingFiles.length + fileArray.length > MAX_FILES) {
    return res.status(400).json({
      success: false,
      error: `Maximal ${MAX_FILES} Dateien erlaubt. Aktuell: ${existingFiles.length}, Neu: ${fileArray.length}`,
    });
  }

  const uploadedRefs = [];
  const errors = [];

  for (const file of fileArray) {
    const originalName = file.originalFilename || file.newFilename || 'datei';
    const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`${originalName}: Dateityp nicht erlaubt`);
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${originalName}: Datei zu groß (max. 10 MB)`);
      continue;
    }

    // Datei-Inhalt lesen
    const fs = await import('fs');
    const fileBuffer = await fs.promises.readFile(file.filepath);

    const timestamp = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = isCustomer
      ? `customers/${customerId}/${timestamp}_${safeName}`
      : isContract
        ? `${trainerId}/contracts/${timestamp}_${safeName}`
        : `${trainerId}/${timestamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error(`Upload error for ${originalName}:`, uploadError.message);
      errors.push(`${originalName}: Upload fehlgeschlagen`);
      continue;
    }

    uploadedRefs.push({
      filename: originalName,
      path: storagePath,
      uploaded_at: new Date().toISOString(),
      size_bytes: file.size,
      content_type: file.mimetype,
    });
  }

  if (uploadedRefs.length === 0) {
    return res.status(400).json({
      success: false,
      error: errors.length > 0 ? errors.join('; ') : 'Keine Dateien konnten hochgeladen werden',
    });
  }

  // Dateien-Referenzen aktualisieren
  const updatedFiles = [...existingFiles, ...uploadedRefs];
  const { error: updateError } = await supabase
    .from(targetTable)
    .update({ [targetField]: updatedFiles })
    .eq('id', targetId);

  if (updateError) {
    console.error('DB UPDATE error:', updateError.message, '| table:', targetTable, '| field:', targetField);
    return res.status(500).json({
      success: false,
      error: `Dateien hochgeladen, aber Referenz-Speicherung fehlgeschlagen: ${updateError.message}`,
    });
  }

  return res.status(200).json({
    success: true,
    files: uploadedRefs,
    errors: errors.length > 0 ? errors : undefined,
  });
}
