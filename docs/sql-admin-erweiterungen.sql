-- ============================================================================
-- SQL-Erweiterungen für Admin-Backend (März 2026)
-- Alle nötigen Schema-Änderungen für die 5 Admin-Erweiterungen
-- ============================================================================

-- ─── 1. Vertragsdateien für Trainer ─────────────────────────────────────────
-- Neues JSONB-Feld für Vertragsdateien (analog zu license_files)
ALTER TABLE trainer_profiles ADD COLUMN IF NOT EXISTS contract_files JSONB DEFAULT '[]';

-- ─── 2. Bezahlt-Status für Buchungen ────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;

-- ─── 3. Gruppentrainings: Konkretes Datum + Uhrzeit ────────────────────────
-- Falls noch nicht vorhanden (ggf. schon angelegt):
ALTER TABLE group_classes ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE group_classes ADD COLUMN IF NOT EXISTS scheduled_time TIME;

-- ─── 4. Teilnehmer-Tracking Felder ─────────────────────────────────────────
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS attended BOOLEAN DEFAULT false;
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS customer_paid BOOLEAN DEFAULT false;
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS trainer_paid BOOLEAN DEFAULT false;
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE group_participants ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- ─── 5. Customers Tabelle (falls noch nicht vorhanden) ──────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  street_address TEXT,
  postal_code TEXT,
  city TEXT,
  contract_accepted BOOLEAN DEFAULT false,
  contract_accepted_at TIMESTAMPTZ,
  terms_accepted BOOLEAN DEFAULT false,
  terms_accepted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index für schnelle E-Mail-Suche
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- RLS für customers (nur via Service Role Key / Admin)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Service role full access on customers"
  ON customers FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── 6. Buchungen: customer_email Feld für JOIN ─────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'personal';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_name TEXT;

-- ─── 7. Kunden-Dokumente ──────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS document_files JSONB DEFAULT '[]';
