# Projekt Fit Landingpage – Technische Referenz (`landingpage/`)

> **📚 Hierarchie:** Diese Sub-CLAUDE.md gilt im Bereich `landingpage/` (Vercel-Deploy, Admin/Trainer-Portal). Zusaetzlich gelten:
> - **Globale CLAUDE.md** (`C:\Users\dbl70\.claude\CLAUDE.md`) — Sprache, Modell-Wahl, Schreib-/Lese-Regel, Drift-Kontrolle
> - **Root-CLAUDE.md** (`../CLAUDE.md`) — projekt-spezifische Regeln, Geschaeftslogik, Bezahlflow-Pflichten, Trigger-Tabelle „Fachbereich-Doku"
> - **PROGRESS.md / STATUS.md / BUGS.md** (`../`) — Stand, Blocker, offene Bugs

---

## Deploy

- **URL:** pulsly.de (ehemals projektfit.net, Redirect aktiv)
- **Domain:** DNS bei Strato, A-Record 216.198.79.1
- **Hosting:** Vercel (Auto-Deploy via GitHub Push)
- **Repo:** github.com/dirkbleckmann70/projekt-fit-landingpage
- **Config:** `vercel.json` (cleanUrls: true, Redirects fuer `/admin` → `/admin/` und `/trainer-portal` → `/trainer-portal/`)

Jede Aenderung MUSS committed + gepusht werden → Vercel deployed automatisch.

---

## Tech-Stack

- Tabler 1.0.0-beta21 (Bootstrap 5, CDN) — CSS-Framework fuer Admin + Trainer Portal
- FullCalendar 6.1.x (CDN) — Kalender-Ansichten (Admin + Trainer)
- Tabler Icons (CDN) — `ti ti-*` Icon-Klassen
- Supabase JS SDK (Auth, DB, Realtime)
- Vanilla JS (kein Build-Prozess, kein React/Vue)
- Puppeteer (Dev-Dependency, Screenshots)

## Modell-Wahl

- **Sonnet** fuer einfache Aufgaben (kleine Fixes, einzelne Datei-Aenderungen, Recherche)
- **Opus 4.6** fuer komplexe Aufgaben (Multi-Datei-Features, Debugging, Architektur-Entscheidungen)

## Wichtige Konventionen

- **table-utils.js:** Generiert Toolbar automatisch. KEINE manuellen count-bar HTML-Elemente. Extras ueber `initSortableTable(id, config, { extraButtons, countLabel })`.
- **Action-Buttons:** Icon-only Ghost-Buttons (`btn btn-sm btn-ghost-secondary` + Tabler Icon). Keine Text-Buttons in Tabellen.
- **cleanUrls Gotcha:** `/admin` ohne Slash loest relative Pfade falsch auf. Redirects in `vercel.json` sind Pflicht fuer Index-Seiten.
- **Inline-JS-Syntax pruefen (kein Build/tsc im Portal):** `node --check api/admin/index.js` fuer die Serverless-Function; fuer `<script>`-Bloecke in HTML: `node -e` mit `new Function(code)` ueber jeden Nicht-`src`-Script-Block (faengt Template-Literal-/Klammer-Fehler vor dem Vercel-Deploy).
- **`form-dirty.js` schluesselt Felder ueber `el.id`** — bei Checkbox-/Mehrfach-Listen MUSS jede Checkbox eine eindeutige `id` haben, sonst meldet das „Ungespeicherte Aenderungen"-Tracking das Formular dauerhaft als geaendert.

---

## Verzeichnisstruktur

```
index.html              # Hauptseite (Dark Theme, Geraete-Erkennung)
beta.html               # Smart-Link /beta (iOS TestFlight / Android Warteliste)
datenschutz.html        # Datenschutzerklaerung (DSGVO)
impressum.html          # Impressum (§5 TMG)
agb.html                # AGB (17 Paragraphen, vollstaendig)
confirm.html            # E-Mail Bestaetigung
dienstleistungsvertrag.html  # Trainer-Vertrag
admin/                  # Admin-Portal (projektfit.net/admin)
trainer/                # Trainer-Bewerbungsseiten
trainer-portal/         # Trainer-Portal (projektfit.net/trainer-portal)
challenge/              # Challenge-Invite Landing
api/                    # Vercel Serverless Functions
shared/                 # Gemeinsame CSS/JS (Tabler-Overrides, Layout, Theme, Toasts, Constants, Table-Utils)
scripts/                # Build-/Screenshot-Hilfsskripte
screenshots/            # App Store Screenshots
assets/                 # Logo SVGs, Favicon, QR-Code, PT/GT Bilder
blog/                   # Blog (Uebersicht + Artikel)
```

---

## Pulsly Branding

- Logo: "pulsly" — "puls" #40916C + "ly" #E07A3A, Outfit Bold 800
- Favicon: "p." (gruen + orangener Punkt), assets/favicon.svg
- Startseite: Self-contained (inline Styles + Nav, NICHT pulsly-nav.js)
- Unterseiten (/app, /training, /blog etc.): Nutzen shared/pulsly-nav.js + shared/pulsly-styles.css
- Portale (admin/, trainer-portal/): Nutzen weiterhin shared/layout.js + shared/tabler-custom.css

---

## Wichtige Seiten

| Route | Datei | Zweck |
|-------|-------|-------|
| / | index.html | Hauptseite mit App Store Links |
| /beta | beta.html | Smart-Link: iOS → TestFlight, Android → Warteliste |
| /datenschutz | datenschutz.html | DSGVO Datenschutzerklaerung |
| /impressum | impressum.html | §5 TMG Impressum |
| /admin | admin/ | Admin-Portal |
| /trainer-portal | trainer-portal/ | Trainer-Portal |

---

## Portal-Entwicklungsregeln

- **Alle Buchungs-Updates ueber Admin-API** — Kein direktes `sb.from('bookings').update()` im Trainer-Portal (RLS). Immer `/api/admin?action=bookings` PUT.
- **adminApi() Funktion** — Definiert in `auth-guard.js` (Admin) und `auth-check.js` (Trainer). Sendet Bearer Token automatisch.
- **Modals nach Aktion schliessen** — `document.querySelectorAll('.modal.show').forEach(m => bootstrap.Modal.getInstance(m)?.hide())` vor/nach jeder Aktion.
- **Variablen-Scope** — Funktionen wie `renderBookingCard()` muessen auf Script-Ebene definierte Variablen zugreifen koennen. Nicht in innere Bloecke packen.
- **isTerminVorbei()** — Lokales Datum-Parsing: `new Date(y, mo-1, da, h+1, m)`. Nicht `new Date(dateString)` (UTC-Bug).
- **Trainer-erlaubte API-Endpoints** — `customer_names`, `booking_locations` (GET) + `bookings` (PUT) + `location-accept/reject`, `reschedule-accept/reject` (PUT).
- **Status-Mapping vollständig halten** — `mapStatusForDb`/`mapStatusForFrontend` (`api/admin/index.js`): jeder Sub-Status braucht expliziten Case; `default:` reicht 1:1 durch → DB-CHECK-Verletzung (nur 7 Kanon-Werte). Bei neuem Sub-Status BEIDE Richtungen + App (`bookingService.ts`) ergänzen. Sub-Status = `bestaetigt` + Flag (reschedule/location/ersatz_trainer). Beleg B-2026-05-30-03.
