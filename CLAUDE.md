# Projekt Fit Landingpage – Technische Referenz

**Projektweite Regeln, Geschaeftslogik und PROGRESS.md: siehe `../CLAUDE.md` und `../PROGRESS.md`**

---

## Deploy

- **URL:** projektfit.net
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

---

## Verzeichnisstruktur

```
index.html              # Hauptseite (Dark Theme, Geraete-Erkennung)
beta.html               # Smart-Link /beta (iOS TestFlight / Android Warteliste)
datenschutz.html        # Datenschutzerklaerung (DSGVO)
impressum.html          # Impressum (§5 TMG)
agb.html                # AGB (noch Platzhalter)
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
```

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
