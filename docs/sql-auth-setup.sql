-- ============================================================================
-- Projekt Fit – Auth-Spalte für Trainer-Profiles
-- ============================================================================
-- Fügt auth_user_id Spalte hinzu, die den Supabase Auth User mit dem
-- Trainer-Profil verknüpft. KEIN Foreign Key auf auth.users (bewusste
-- Entscheidung: trainer_profiles ist standalone).
--
-- Ausführen: Supabase Dashboard → SQL Editor → New Query → Einfügen → Run
-- ============================================================================

-- 1. Spalte hinzufügen (UUID, nullable)
ALTER TABLE public.trainer_profiles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- 2. Index für schnelle Lookups
CREATE INDEX IF NOT EXISTS idx_trainer_profiles_auth_user_id
  ON public.trainer_profiles (auth_user_id);

-- 3. Unique Constraint (ein Auth-User = ein Trainer-Profil)
ALTER TABLE public.trainer_profiles
  ADD CONSTRAINT uq_trainer_profiles_auth_user_id
  UNIQUE (auth_user_id);

-- ============================================================================
-- Optional: RLS Policy damit Trainer nur ihr eigenes Profil lesen/ändern
-- ============================================================================

-- Trainer kann eigenes Profil lesen
CREATE POLICY IF NOT EXISTS "Trainer liest eigenes Profil"
  ON public.trainer_profiles
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Trainer kann eigenes Profil aktualisieren (nur bestimmte Felder via App)
CREATE POLICY IF NOT EXISTS "Trainer aktualisiert eigenes Profil"
  ON public.trainer_profiles
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Öffentlich: Aktive Trainer für Kunden sichtbar (Anon-Key)
CREATE POLICY IF NOT EXISTS "Aktive Trainer öffentlich sichtbar"
  ON public.trainer_profiles
  FOR SELECT
  USING (status = 'active' AND is_active = true);
