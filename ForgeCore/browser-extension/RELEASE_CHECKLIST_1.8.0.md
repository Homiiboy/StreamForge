# StreamForge 1.8.0 – Freigabe- und ZimaOS-Testmatrix

## Bedienung

1. Erweiterung öffnen, Film oder Serie erkennen lassen, Typ/Titel/Jahr bzw. Staffel/Episode prüfen.
2. Unter „Speicherziel“ zwischen „Speicherort jedes Mal auswählen“, „Automatisch in Downloads“ und „Ausgewählten Medienordner verwenden“ wechseln.
3. Bei **Downloads automatisch** legt Chrome relative Unterordner im Standard-Downloadverzeichnis an: `Movies/Titel (Jahr)/...` oder `Shows/Serie/Season NN/...`.
4. Bei **ausgewähltem Ordner** auf „Medienordner auswählen“ klicken und einen beschreibbaren lokalen oder gemounteten Speicher wählen. Dieser Modus schreibt gemuxte HLS-/DASH-Dateien direkt in den freigegebenen Ordner.
5. Festlegen, was der ausgewählte Ordner darstellt:
   - **Bibliothekswurzel:** enthält oder erstellt `Movies` und `Shows`.
   - **Movies-/Shows-Verzeichnis:** darunter Filmordner bzw. Serien-/Staffelordner erstellen.
   - **Serienordner:** vorhandene Serie wählen; passende `Season NN` erstellen/wiederverwenden.
   - **Staffelordner:** vorhandene Staffel wählen; Datei direkt darin speichern.
6. Beispiel: Vorhandene `Slugterra/Season 02` auswählen, „Staffelordner“ wählen, `Slugterra S02E08` starten. Bei Filmen `Interstellar (2014)` als Film und `2014` als Erscheinungsjahr verwenden.

## Automatisierte Tests

- [x] Film-/Serien-Dateipfade mit Jahr, Staffel und Episode
- [x] Bereits vorhandene Verzeichnisse wiederverwenden
- [x] Kollision mit bestehender Datei blockieren
- [x] Kopieren einer validierten Datei in die Zielordner
- [x] Per-Job-Snapshot eines ausgewählten Verzeichnisses
- [x] Popup-, Background- und Offscreen-Verknüpfungen
- [x] Bestehende Download-, Export-, HLS-/DASH- und Muxing-Tests

## Manuelle Tests (ausstehend)

- [ ] Chrome/Edge: `showDirectoryPicker` im Extension-Popup öffnen, Schreibberechtigung erteilen
- [ ] Film: Zielordner `Movies/Titel (Jahr)` automatisch erzeugen
- [ ] Serie: neue Staffel in vorhandener Serie anlegen, weitere Episode in bestehender Staffel ablegen
- [ ] Vorhandene Mediendatei: keine unbemerkte Überschreibung, Fallback-/Fehlermeldung prüfen
- [ ] Mehrere HLS-/DASH-Jobs nacheinander in verschiedene **gewählte** Medienordner einreihen (Snapshot)
- [ ] Browser-Neustart und Queue-Wiederherstellung
- [ ] Downloads-Unterordner für direkt erkannte MP4/MKV/MOV-Dateien
- [ ] ZimaOS-SMB-Freigabe unter Windows im Explorer einbinden und Berechtigungen prüfen
- [ ] Gemountetes ZimaOS-Jellyfin-Netzlaufwerk: tatsächlichen Schreibzugriff und Wiedergabe in Jellyfin prüfen
- [ ] Schreibzugriff verweigern: Fallback auf den regulären Speicherdialog, keine verlorene OPFS-Datei
- [ ] Große Datei (>4 GiB), lange Segmentliste und Test mit instabiler Netzwerkverbindung
- [ ] Dateien mit Umlauten und langem Namen

## Einschränkungen

- Der Browser kann keine System-/SMB-Zugriffsrechte vergeben oder umgehen.
- Bei **direkt erkannten** nativen Medien-URLs ist der ausgewählte freie Zielordner derzeit über den üblichen Browser-Speicherdialog anzusteuern. Die automatische Downloads-Unterordnerfunktion gilt auch für diese Medien.
- Ungültige bzw. bereits verwendete Ziel-Dateinamen werden beim direkten FS-Access-Export nicht ohne Weiteres überschrieben.
- Eine bereits laufende HLS-/DASH-Übertragung wird nicht bytegenau wiederaufgenommen.
