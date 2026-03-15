-- ============================================================================
-- RLS Policy: Trainer können ihre zugewiesenen Buchungen sehen
--
-- PROBLEM: Trainer-Portal zeigt keine Buchungen an, obwohl sie in
-- Supabase existieren. Die RLS Policy fehlt oder wurde nicht ausgeführt.
--
-- AUSFÜHREN: Im Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- Prüfe ob RLS aktiv ist
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'bookings';

-- Prüfe bestehende Policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'bookings';

-- ============================================================================
-- Falls die Trainer-SELECT-Policy FEHLT, diese ausführen:
-- ============================================================================

-- Bestehende Policy löschen (falls vorhanden, um Duplikate zu vermeiden)
DROP POLICY IF EXISTS "Trainer sieht eigene Buchungen" ON bookings;

-- Trainer darf Buchungen sehen wo trainer_id = sein trainer_profiles.id
CREATE POLICY "Trainer sieht eigene Buchungen"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    trainer_id IN (
      SELECT id FROM trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- SCHNELLTEST: Als Trainer einloggen und prüfen
-- ============================================================================

-- Dieser Query simuliert was der Trainer sieht:
-- (Muss im Supabase Dashboard unter SQL Editor ausgeführt werden,
--  NICHT als Service Role, sondern als authentifizierter User)
--
-- SELECT id, status, scheduled_date, trainer_id
-- FROM bookings
-- WHERE trainer_id = 'fb6f4b98-18ea-4ac5-b7df-3afbb35f4167';

-- ============================================================================
-- ALTERNATIVE: Falls die obigen Policies nicht funktionieren,
-- eine einfache Policy die allen authentifizierten Usern SELECT erlaubt:
-- ============================================================================

-- DROP POLICY IF EXISTS "Authenticated can read bookings" ON bookings;
-- CREATE POLICY "Authenticated can read bookings"
--   ON bookings FOR SELECT
--   TO authenticated
--   USING (true);
