-- ============================================================================
-- RLS Policies für trainer_availability
-- Trainer darf eigene Verfügbarkeit lesen, erstellen, ändern und löschen
-- ============================================================================

-- RLS aktivieren (falls noch nicht aktiv)
ALTER TABLE trainer_availability ENABLE ROW LEVEL SECURITY;

-- Trainer kann eigene Verfügbarkeit lesen
CREATE POLICY "Trainer kann eigene Verfügbarkeit lesen"
  ON trainer_availability FOR SELECT
  USING (
    trainer_id IN (
      SELECT id FROM trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Trainer kann eigene Verfügbarkeit erstellen
CREATE POLICY "Trainer kann eigene Verfügbarkeit erstellen"
  ON trainer_availability FOR INSERT
  WITH CHECK (
    trainer_id IN (
      SELECT id FROM trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Trainer kann eigene Verfügbarkeit löschen
CREATE POLICY "Trainer kann eigene Verfügbarkeit löschen"
  ON trainer_availability FOR DELETE
  USING (
    trainer_id IN (
      SELECT id FROM trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Trainer kann eigene Verfügbarkeit ändern
CREATE POLICY "Trainer kann eigene Verfügbarkeit ändern"
  ON trainer_availability FOR UPDATE
  USING (
    trainer_id IN (
      SELECT id FROM trainer_profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Service Role hat vollen Zugriff (für Admin-Backend)
CREATE POLICY "Service role full access on trainer_availability"
  ON trainer_availability FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- WICHTIG: Diese Policies müssen im Supabase Dashboard ausgeführt werden:
-- SQL Editor → Neue Query → Obigen Code einfügen → Run
-- ============================================================================
