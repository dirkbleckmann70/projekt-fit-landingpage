-- Speichert Referenzen auf hochgeladene Dateien in Supabase Storage Bucket "trainer-documents"
-- Format: [{"filename": "b-lizenz.pdf", "path": "trainer-id/1710234567_b-lizenz.pdf", "uploaded_at": "2026-03-12T...", "size_bytes": 12345, "content_type": "application/pdf"}]

ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS license_files JSONB DEFAULT '[]';

-- Optional: Index fuer schnelleres Filtern nach Trainern ohne Lizenzen
-- CREATE INDEX IF NOT EXISTS idx_trainer_license_files ON trainer_profiles USING gin (license_files);
