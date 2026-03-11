-- ============================================================================
-- Projekt Fit – RLS Policies für Trainer-Portal
-- ============================================================================
-- Ermöglicht Trainern den Zugriff auf ihre eigenen Daten über auth_user_id.
-- WICHTIG: auth.uid() = auth_user_id (NICHT id, da id ≠ auth.uid())
--
-- Ausführen: Supabase Dashboard → SQL Editor → New Query → Einfügen → Run
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. RLS für trainer_profiles aktivieren (falls noch nicht aktiv)
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trainer_profiles ENABLE ROW LEVEL SECURITY;

-- Alte Policies entfernen (falls vorhanden, um Konflikte zu vermeiden)
DROP POLICY IF EXISTS "Trainer liest eigenes Profil" ON public.trainer_profiles;
DROP POLICY IF EXISTS "Trainer aktualisiert eigenes Profil" ON public.trainer_profiles;
DROP POLICY IF EXISTS "Aktive Trainer öffentlich sichtbar" ON public.trainer_profiles;

-- Trainer kann eigenes Profil lesen (über auth_user_id)
CREATE POLICY "Trainer liest eigenes Profil"
  ON public.trainer_profiles
  FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Trainer kann eigenes Profil aktualisieren
-- NICHT änderbar: hourly_rate_cents, payout_cents, status, is_active, auth_user_id
-- (Das wird durch die Frontend-Logik erzwungen, nicht durch RLS)
CREATE POLICY "Trainer aktualisiert eigenes Profil"
  ON public.trainer_profiles
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Öffentlich: Aktive Trainer für Kunden sichtbar (Anon-Key)
CREATE POLICY "Aktive Trainer öffentlich sichtbar"
  ON public.trainer_profiles
  FOR SELECT
  USING (status = 'active' AND is_active = true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RLS für bookings
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainer sieht eigene Buchungen" ON public.bookings;
DROP POLICY IF EXISTS "Trainer aktualisiert eigene Buchungen" ON public.bookings;
DROP POLICY IF EXISTS "Kunden erstellen Buchungen" ON public.bookings;

-- Trainer kann eigene Buchungen sehen
-- (trainer_id in bookings = id in trainer_profiles, NICHT auth_user_id)
CREATE POLICY "Trainer sieht eigene Buchungen"
  ON public.bookings
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Trainer kann Status eigener Buchungen ändern (bestätigen/ablehnen)
CREATE POLICY "Trainer aktualisiert eigene Buchungen"
  ON public.bookings
  FOR UPDATE
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Kunden (anon oder authenticated) können Buchungen erstellen
CREATE POLICY "Buchungen erstellen"
  ON public.bookings
  FOR INSERT
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS für trainer_availability
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trainer_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainer sieht eigene Verfügbarkeit" ON public.trainer_availability;
DROP POLICY IF EXISTS "Trainer erstellt Verfügbarkeit" ON public.trainer_availability;
DROP POLICY IF EXISTS "Trainer aktualisiert Verfügbarkeit" ON public.trainer_availability;
DROP POLICY IF EXISTS "Trainer löscht Verfügbarkeit" ON public.trainer_availability;
DROP POLICY IF EXISTS "Verfügbarkeit öffentlich lesbar" ON public.trainer_availability;

-- Trainer kann eigene Verfügbarkeit sehen
CREATE POLICY "Trainer sieht eigene Verfügbarkeit"
  ON public.trainer_availability
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Trainer kann Verfügbarkeit erstellen
CREATE POLICY "Trainer erstellt Verfügbarkeit"
  ON public.trainer_availability
  FOR INSERT
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Trainer kann Verfügbarkeit löschen (für Upsert-Pattern: delete + insert)
CREATE POLICY "Trainer löscht Verfügbarkeit"
  ON public.trainer_availability
  FOR DELETE
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Öffentlich: Kunden können Verfügbarkeit aktiver Trainer sehen
CREATE POLICY "Verfügbarkeit öffentlich lesbar"
  ON public.trainer_availability
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles
      WHERE status = 'active' AND is_active = true
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. RLS für trainer_reviews
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trainer_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trainer sieht eigene Reviews" ON public.trainer_reviews;
DROP POLICY IF EXISTS "Reviews öffentlich lesbar" ON public.trainer_reviews;
DROP POLICY IF EXISTS "Reviews erstellen" ON public.trainer_reviews;

-- Trainer kann eigene Reviews sehen
CREATE POLICY "Trainer sieht eigene Reviews"
  ON public.trainer_reviews
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Öffentlich: Reviews aktiver Trainer lesbar
CREATE POLICY "Reviews öffentlich lesbar"
  ON public.trainer_reviews
  FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM public.trainer_profiles
      WHERE status = 'active' AND is_active = true
    )
  );

-- Jeder kann Reviews erstellen
CREATE POLICY "Reviews erstellen"
  ON public.trainer_reviews
  FOR INSERT
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RLS für gutschriften (falls Tabelle existiert)
-- ──────────────────────────────────────────────────────────────────────────────

-- Nur ausführen wenn die Tabelle existiert:
-- ALTER TABLE public.gutschriften ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Trainer sieht eigene Gutschriften"
--   ON public.gutschriften
--   FOR SELECT
--   USING (
--     trainer_id IN (
--       SELECT id FROM public.trainer_profiles WHERE auth_user_id = auth.uid()
--     )
--   );

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Service Role Key bypass (Admin-API)
-- ──────────────────────────────────────────────────────────────────────────────
-- Der Service Role Key umgeht RLS automatisch.
-- Die api/admin/*.js Serverless Functions nutzen diesen Key
-- und sind daher von den obigen Policies nicht betroffen.
