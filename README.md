# Gym Tracker

Trainingstagebuch fürs Handy in Schwarz-Gelb: Übungen nach Muskelgruppe, Gewicht und Wiederholungen pro Tag, automatisch gezählte Gym-Besuche und Diagramme zum Leistungsfortschritt.

Die App ist eine reine Web-App ohne Server und ohne Build-Schritt. Alle Daten bleiben im Browser auf dem eigenen Gerät.

## Funktionen

**Training**
- Für jeden Tag Übungen auswählen und Sätze mit Gewicht (kg) und Wiederholungen eintragen
- Die Felder sind mit dem letzten Satz vorbelegt, darüber stehen die Werte vom letzten Mal
- Sätze antippen zum Ändern, löschen mit „Rückgängig“
- Neue Bestgewichte werden als Rekord markiert
- Tipp auf den Übungsnamen klappt die Übung ein und wieder aus
- Vergangene Tage lassen sich über die Pfeile, das Datum oder den Kalender nachtragen

**Übungen**
- Eigene Übungen anlegen, umbenennen, löschen
- Sortiert nach Gruppe (Brust, Rücken, Schultern, Bizeps, Trizeps, Unterarme, Bauch, Beine, Gesäß, Waden, Cardio, Sonstiges); die Gruppe wird über ein Dropdown-Feld gewählt, in der Liste wie beim Anlegen
- Pro Übung wählbar, was eingetragen wird: Gewicht + Wiederholungen, nur Wiederholungen (z. B. Liegestütze) oder Zeit mit optionaler Geschwindigkeit (Cardio)
- Optional: Startauswahl gängiger Übungen laden

**Fortschritt**
- Gym-Besuche: Ein Tag zählt, sobald der erste Satz eingetragen ist – diese Woche, dieser Monat, gesamt, Wochen in Folge
- Monatskalender mit allen Trainingstagen und Besuche pro Woche als Diagramm
- Leistung pro Übung als Verlauf: höchstes Gewicht, geschätztes 1RM (Epley-Formel), Volumen oder Wiederholungen; Zeitraum 4 Wochen bis alles
- Bei Cardio stattdessen Zeit, Tempo und Strecke, bei reinen Wiederholungsübungen beste und gesamte Wiederholungen
- Sätze pro Muskelgruppe

**Daten & Backup** (Symbol oben rechts)
- Backup als JSON-Datei herunterladen und wieder einspielen, z. B. beim Gerätewechsel

## Benutzen

Die App muss über eine Webadresse erreichbar sein, zum Beispiel mit GitHub Pages:

1. Im Repository unter **Settings → Pages** bei „Build and deployment“ **Deploy from a branch** wählen, den Branch und den Ordner `/ (root)` auswählen und speichern.
2. Nach ein bis zwei Minuten ist die App unter `https://<benutzername>.github.io/<repository>/` erreichbar.
3. Auf dem Handy öffnen und zum Startbildschirm hinzufügen (iPhone: Teilen → „Zum Home-Bildschirm“, Android: Menü → „App installieren“). Danach startet sie wie eine normale App und funktioniert auch ohne Netz.

Gut zu wissen:
- Die Daten gehören zu Browser und Gerät. Wer den Browser wechselt oder die Website-Daten löscht, braucht ein Backup.
- Ein Update wird im Hintergrund vollständig geladen; die App meldet „Neue Version geladen“ und zeigt sie nach dem Neustart.

## Entwicklung

```bash
python3 -m http.server 8000   # danach http://localhost:8000 öffnen
node --test                   # Tests für Datenmodell und Statistik
node tests/sw-version.test.js --write   # nach jeder Änderung: Versionsnummer für den Offline-Speicher setzen
```

| Datei | Inhalt |
|---|---|
| `index.html`, `css/style.css` | Grundgerüst und Design (Akzentfarbe `#ffff40` als `--accent`) |
| `js/store.js` | Datenmodell, Speicherung (`localStorage`), Besuchs- und Leistungsstatistik |
| `js/charts.js` | Linien- und Säulendiagramm als SVG, ohne Bibliothek |
| `js/app.js` | Oberfläche: Training, Übungen, Fortschritt, Backup |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline-Betrieb und Installation als App |
| `tests/` | Unit-Tests (`node --test`) |
