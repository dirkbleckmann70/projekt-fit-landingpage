-- Fix: group_classes RLS Policy für Admin-Zugriff
-- Problem: INSERT über Service Role Key sollte RLS umgehen,
-- aber falls RLS aktiv ist und keine Policy existiert, kann es blockieren.
-- Lösung: Entweder RLS deaktivieren ODER eine permissive Policy anlegen.

-- Option 1: RLS deaktivieren (Service Role Key umgeht RLS sowieso)
ALTER TABLE group_classes DISABLE ROW LEVEL SECURITY;

-- Option 2: Falls RLS aktiv bleiben soll, permissive Policy anlegen
-- CREATE POLICY "Admin kann Kurse verwalten" ON group_classes FOR ALL USING (true) WITH CHECK (true);

-- Prüfen ob RLS aktiv ist:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'group_classes';
