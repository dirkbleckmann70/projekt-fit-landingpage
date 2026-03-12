-- Admin Dokumente Tabelle
-- Ausführen in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS admin_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder TEXT NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL,
  size_bytes INTEGER,
  content_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS deaktivieren (API nutzt Service Role Key)
ALTER TABLE admin_documents DISABLE ROW LEVEL SECURITY;

-- Hinweis: Supabase Storage Bucket "admin-documents" muss manuell angelegt werden!
-- Supabase Dashboard → Storage → New Bucket → Name: "admin-documents" → Private (nicht public)
