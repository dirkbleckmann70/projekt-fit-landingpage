# Projekt Fit Landingpage – Technische Referenz

**Projektweite Regeln, Geschaeftslogik und PROGRESS.md: siehe `../CLAUDE.md` und `../PROGRESS.md`**

---

## Deploy

- **URL:** projektfit.net
- **Hosting:** Vercel (Auto-Deploy via GitHub Push)
- **Repo:** github.com/dirkbleckmann70/projekt-fit-landingpage
- **Config:** `vercel.json` (cleanUrls: true)

Jede Aenderung MUSS committed + gepusht werden → Vercel deployed automatisch.

---

## Tech-Stack

- Statisches HTML/CSS/JavaScript (kein Framework)
- Supabase JS SDK (Trainer-Bewerbung)
- Puppeteer (Dev-Dependency, Screenshots)

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
shared/                 # Gemeinsame CSS/JS
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
