# StreamForge 1.7.0 – Release-Abnahme

Dieser Testplan gilt für den Release-Kandidaten aus Pull Request #1. **CI allein reicht nicht für eine Produktionsfreigabe.**

## Automatische Prüfung (GitHub Actions)

- [x] Node.js-Modultests einschließlich Queue, Pause, Wiederherstellung, Export und Muxing
- [x] Manifest-/Package-Versionsgleichheit
- [x] JavaScript-Syntax und referenzierte Assets
- [x] Erweiterungs-ZIP als Actions-Artefakt

## Manuelle Browser-Prüfung (noch offen)

- [ ] ZIP entpacken; in Chrome/Edge (Chrome 119+) über `chrome://extensions` laden; keine Fehler im Erweiterungsmanager
- [ ] Reale unverschlüsselte HLS-Media-Playlist herunterladen und Ausgabe mit `ffprobe`/vollständiger Wiedergabe prüfen
- [ ] HLS-Master mit separater Audiospur und B-Frames verarbeiten; Ton/Bild-Synchronität kontrollieren
- [ ] DASH-MPD mit getrennten MP4-Spuren herunterladen und abspielen
- [ ] Mehrere Aufträge einreihen; FIFO-Reihenfolge und sichtbaren Wartestatus bestätigen
- [ ] Wartenden Auftrag abbrechen; restliche Queue muss anschließend weiterlaufen
- [ ] Warteschlange pausieren; laufenden Auftrag fertigstellen lassen; weitere Aufträge dürfen nicht starten; fortsetzen
- [ ] Browser neu starten: wartende Aufträge wiederherstellen, ein zuvor laufender Job darf **nicht** doppelt gestartet werden
- [ ] Leistungsprofile Schonend/Ausgewogen/Schnell an einer erlaubten Testquelle vergleichen
- [ ] Dateinamen für Film und Serie mit Umlauten, Jahr, Staffel und Episode prüfen
- [ ] Speichern auf lokalem Laufwerk und ZimaOS-Jellyfin-Netzlaufwerk testen; Browser-Schreibfehler protokollieren
- [ ] Große Datei (>4 GiB) und lange Segmentliste testen; Speicherverbrauch und Ergebnis prüfen
- [ ] Export unterbrechen und vorhandenen Export-Wiederholungsweg testen
- [ ] Sicherstellen, dass keine Playlist, HTML-Fehlerseite oder `.txt` als vermeintlicher Film exportiert wird

## Bekannte Grenzen

- StreamForge verarbeitet keine DRM-geschützten Inhalte.
- Die Warteschlange lässt sich pausieren, nicht der laufende segmentweise Muxing-Transfer.
- Eine bytegenaue Resume-Funktion für teilweise geladene HLS-/DASH-Medien ist **nicht implementiert**.
- Untertitel werden nicht automatisch in die fertige Videodatei eingemuxt.
- Ein erfolgreicher Browser-Speicherdialog garantiert keine Schreibberechtigung auf jedem Netzwerk-Laufwerk.

## Release-Entscheidung

1. Alle oben genannten manuellen Testfälle ausführen und Fehlermeldungen inklusive Browser-Version dokumentieren.
2. Kritische Ausfälle im Entwicklungsbranch beheben, CI erneut ausführen.
3. Erst danach Pull Request #1 in `main` übernehmen und `v1.7.0` taggen.
