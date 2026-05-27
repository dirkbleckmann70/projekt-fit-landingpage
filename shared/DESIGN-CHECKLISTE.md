# Portal Design-Checkliste

Bei JEDER Aenderung an Admin- oder Trainer-Portal-Dateien diese Punkte pruefen:

- [ ] Status-Farben kommen aus `DESIGN.badge()` — keine eigenen CSS-Klassen
- [ ] Knoepfe nutzen `pf-btn pf-btn-*` — kein `btn-ghost-*`, kein `btn-outline-*`, kein Inline-Style
- [ ] Tabelle: `pf-table-fixed`, einzeilig, volle Breite, `table-utils.js`
- [ ] Eingabefenster: richtige Groesse (600/720/920px), zweispaltig, Felder nebeneinander
- [ ] Feld-Hintergruende: bearbeitbar = weiss (`pf-field`), nur-lese = hellgrau (`pf-field-readonly`) — einheitlich
- [ ] Navigation: gleicher Aufbau, alle Punkte im mobilen Menue erreichbar
- [ ] Keine neuen lokalen CSS-Klassen fuer Badges, Buttons oder Tabellen
- [ ] Keine Browser-`prompt()` oder `alert()` — nur Eingabefenster bzw. `showPfToast()`
- [ ] Gefaehrliche Aktionen links im Fussbereich, Speichern/Abbrechen rechts
- [ ] Zeilen-Klick: `onRowClick` gesetzt, Aktions-Knoepfe mit `stopPropagation`
- [ ] `design-tokens.js` ist als ERSTES Portal-Script eingebunden (vor constants.js)
- [ ] Knoepfe haben TEXT-Labels, nicht nur Symbole
