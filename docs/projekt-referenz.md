# Projekt Fit – Referenz-Dokument

**WICHTIG: Claude Code muss dieses Dokument VOR jeder Aufgabe lesen.**
Letzte Aktualisierung: 13.03.2026

## 1. Repositories

| Repo | Pfad lokal | GitHub | Hosting |
|------|-----------|--------|---------|
| App (React Native) | /c/Users/dbl70/projekt-fit | github.com/dirkbleckmann70/projekt-fit (privat) | Expo / App Store |
| Landingpage | /c/Users/dbl70/landingpage | github.com/DirkBleckmann70/projekt-fit-landingpage | Vercel (projektfit.net) |

- App arbeitet auf Branch **develop** (NICHT master!)
- Landingpage deployed automatisch über Vercel bei Push

## 2. Vercel-Limits

- Max 12 Serverless Functions (Hobby Plan)
- Aktuell genutzt: 4 von 12 (api/admin/index.js, api/subscribe.js, api/trainer-application.js, api/upload-license.js)
- KEINE neuen .js Dateien in api/ erstellen! Neue Aktionen in api/admin/index.js einfügen.

## 3. API-Struktur (api/admin/index.js)

Routing über /api/admin?action=ACTION_NAME

Actions: data, trainers, activate-trainer, deactivate-trainer, delete-trainer, bookings, groups, locations, documents, get-file-url, delete-storage-file, customers, all_customers, customer_bookings, add-participant, update-participant

## 4. Supabase-Schema

### trainer_profiles
id (UUID PK), email (TEXT NOT NULL), full_name, city, bio, specializations (TEXT), rating (NUMERIC 0.0), review_count (INT 0), stripe_account_id, push_token, is_active (BOOL true), created_at, is_kleinunternehmer (BOOL), steuernummer, street_address, postal_code, phone, hourly_rate_cents (INT 7900), payout_cents (INT 2900), status (TEXT 'pending'), auth_user_id (UUID), license_files (JSONB []), contract_files (JSONB [])

### bookings
id (UUID PK), customer_id (UUID), trainer_id (UUID FK), booking_type (TEXT 'personal'), status (TEXT 'pending'), **scheduled_date** (DATE), **scheduled_time** (TIME), duration_minutes (INT 60), location_name, location_address, location_lat, location_lng, price_cents (INT 7900), discount_code, discount_amount_cents (INT 0), final_price_cents (INT 7900), stripe_payment_intent_id, trainer_payout_cents, notes, paid (BOOL false), created_at, updated_at

### customers
id (UUID PK), auth_user_id (UUID), first_name, last_name, full_name, email (TEXT NOT NULL), phone, street_address, postal_code, city, date_of_birth (DATE), health_declaration (JSONB {}), health_declaration_accepted (BOOL false), health_declaration_accepted_at, contract_accepted (BOOL false), contract_accepted_at, terms_accepted (BOOL false), terms_accepted_at, service_contract_accepted (BOOL false), service_contract_accepted_at, document_files (JSONB []), notes, created_at

### trainer_availability
id (UUID PK), trainer_id (UUID FK), day_of_week (INT 0-6, 0=Sonntag), start_time (TIME), end_time (TIME), is_active (BOOL)

### trainer_reviews
id (UUID PK), booking_id, customer_id, trainer_id (UUID FK), rating (INT 1-5), comment, created_at

### group_classes
id (UUID PK), name (TEXT NOT NULL), trainer_id (UUID FK), city (TEXT NOT NULL), location_name, location_address, day_of_week (INT 0-6), start_time (TIME), scheduled_date (DATE), scheduled_time (TIME), duration_minutes (INT 60), max_participants (INT 12), price_per_person_cents (INT 1500), is_active (BOOL true), created_at

### group_participants
id (UUID PK), group_class_id (UUID FK), customer_id, customer_name, customer_email, status (TEXT 'registered'), paid (BOOL false), attended (BOOL false), customer_paid (BOOL false), trainer_paid (BOOL false), created_at

### gutschriften
id, gs_nummer, typ, storno_von, trainer_id, trainer_name, trainer_adresse, trainer_steuernummer, trainer_ist_kleinunternehmer, leistungsdatum, leistungsbeschreibung, buchungs_id, nettobetrag_cent, mwst_satz, mwst_betrag_cent, bruttobetrag_cent, **ausgestellt_am** (NICHT created_at!), pdf_url, lexoffice_id, status

### service_locations
id (UUID PK), city (TEXT NOT NULL), is_active (BOOL true), created_at

### admin_documents
id (UUID PK), folder (TEXT NOT NULL), filename (TEXT NOT NULL), path (TEXT NOT NULL), size_bytes, content_type, uploaded_by, created_at

## 5. Storage Buckets

- trainer-documents (privat): {trainerId}/datei, {trainerId}/contracts/datei, customers/{customerId}/datei
- admin-documents (privat): {ordner}/datei

## 6. Konventionen

- Preise in Supabase IMMER in Cent (INT). Anzeige in EUR mit Komma (79,00 EUR)
- Rollen: role.includes('admin') bzw role.includes('trainer') – NIE role === 'admin'
- Admin-Accounts werden beim Trainer-Loeschen NIE mitgeloescht
- Dark Theme: #0a0a0a, Cards #1a1a1a, Border #2a2a2a, Akzent #e8930a
- Font: Plus Jakarta Sans
- Deutsche Texte, deutsche Fehlermeldungen
- App Tech: React Native Expo SDK 54, TypeScript, Expo Router, Branch develop

## 7. Haeufige Fehler (NICHT WIEDERHOLEN)

| Falsch | Richtig | Tabelle |
|--------|---------|---------|
| session_date | scheduled_date | bookings |
| session_time | scheduled_time | bookings |
| created_at (bei Gutschriften) | ausgestellt_am | gutschriften |
| region | existiert NICHT | service_locations |
| role === 'admin' | role.includes('admin') | auth |
| group_training | group_classes | Tabellenname |

## 8. Token-Regeln

1. Keine unnoetige Web-Suchen
2. Airtable-Eintraege kurz (2-3 Saetze)
3. Vor Supabase-Queries Spaltennamen hier pruefen
4. Bei grossen Aktionen: User vorher informieren
