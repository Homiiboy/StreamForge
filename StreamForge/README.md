# StreamForge Browser Connector 1.7.2

## Neu in 1.7.2: Medienauswahl

- DASH-Videoqualität und Audiospur nach Representation-ID auswählen.
- HLS-Untertitelspuren mit Name, Sprache und Standardauswahl erkennen; Untertitel-URL kopieren.
- Direkte `.vtt`-Untertitel getrennt mit passender Jellyfin-Dateibenennung speichern.
- Segmentierte HLS-Untertitelplaylist bleibt als Link verfügbar; keine unzuverlässige automatische SRT-/MP4-Konvertierung.
- Vorhandene Download-Warteschlange und Performance-Profile aus 1.7.0 sowie die Stabilitätsverbesserungen aus 1.7.1 bleiben erhalten.



Chrome-/Edge-Erweiterung zum Erkennen und lokalen Herunterladen unterstützter, nicht DRM-geschützter Medienstreams, für die du eine Downloadberechtigung hast.

## Neu in 1.6.5: Muxing-Stability / B-Frame-Fix

1.6.5 behebt einen reproduzierbaren MPEG-TS-Muxingfehler bei H.264/H.265 mit B-Frames. 1.6.4 konnte Video-PES nach PTS (Präsentationszeit) statt DTS (Dekodierzeit) sortieren. Dadurch konnte bereits korrekt komprimiertes Video in falscher Dekodierreihenfolge ausgegeben werden.

- PTS und DTS werden getrennt aus PES-Headern gelesen.
- 33-Bit-Zeitstempel werden ohne JavaScript-32-Bit-Shift-Überlauf dekodiert.
- Video-PES werden nach DTS in Dekodierreihenfolge gemuxt; PTS bleibt die Präsentationszeit.
- PCR wird bei Video aus DTS statt PTS erzeugt.
- Raw-AAC/ADTS-PES erhalten konsistente PTS/DTS-Werte.
- `#EXT-X-DISCONTINUITY` und `#EXT-X-DISCONTINUITY-SEQUENCE` werden geparst.
- Bei HLS-Discontinuities wird die neue Zeitstempel-Epoche auf eine monotone A/V-Zeitachse rebasiert und in den PES-Headern neu geschrieben.
- Der MPEG-TS-`discontinuity_indicator` wird für die neuen Audio-/Video-PIDs gesetzt.
- MPEG-TS-Syncverlust und gesetzte Transport-Error-Bits werden nicht mehr still ignoriert.
- Alle Performance-, Prefetch-, Export- und Benennungsverbesserungen aus 1.6.4 bleiben erhalten.

### Reproduzierter Fehler / Gegenprobe

Ein real erzeugter H.264-Teststream mit B-Frames plus separatem AAC erzeugte mit dem 1.6.4-Muxer **297 ffmpeg Warn-/Fehlerzeilen**, darunter `co located POCs unavailable`, `illegal short term buffer state detected` und Timestamp-Discontinuities. Derselbe Stream läuft mit 1.6.5 vollständig durch `ffmpeg -v warning ... -f null -` mit **0 Warnungen/Fehlern**.

Zusätzlich wurde ein mehrsegmentiger HLS-ähnlicher B-Frame-Test (4 Video-TS-Segmente + separate Audiosegmente) vollständig ohne ffmpeg-Warnungen dekodiert. Ein künstlicher Timestamp-Reset an einer Discontinuity ergibt nach Rebase ebenfalls 0 Warnungen/Fehler und eine fortlaufende Gesamtdauer.

## Neu in 1.6.4: sicherer Container-/Dateiexport

Der finale Export wurde gegen den `.txt`-Regression-Bug und gegen falsche Ausgabedaten abgesichert. Die OPFS-Datei selbst besitzt in Chromium häufig keinen MIME-Type. 1.6.4 erzeugt deshalb für den Chrome-Download immer eine explizit typisierte Blob-Quelle.

- MPEG-TS: `video/mp2t` + `.ts`
- MP4/fMP4: `video/mp4` + `.mp4`
- falsche Endungen wie `.txt`, `.m3u8`, `.html` oder eine falsche Media-Endung werden ersetzt, nicht angehängt
- Retained-Export-Recovery normalisiert auch ältere gespeicherte Dateinamen/MIME-Werte
- vor dem Speicherdialog werden die ersten bis zu 64 KiB der fertigen OPFS-Datei geprüft
- `#EXTM3U` wird als Playlist erkannt und niemals still als Film gespeichert
- HTML-Fehlerseiten werden abgefangen
- `.ts` benötigt eine plausible MPEG-TS-Syncstruktur
- `.mp4` benötigt eine plausible ISO-BMFF/MP4-Boxstruktur
- ungültige Ausgaben werden mit Diagnose gestoppt und temporär bereinigt

Damit gilt vor der Übergabe an Chrome:

`fertige OPFS-Datei → Inhalt prüfen → MIME + Endung erzwingen → typisierte Blob-URL → Chrome-Download`

## Neu in 1.6.4: zusätzliche Stall-/Race-Fixes

Neben dem `.txt`-Problem wurden weitere Fehler im Hot-Path behoben:

- Segment-Body kann nach HTTP-Headern nicht mehr unbegrenzt hängen; ein Inaktivitäts-Timeout cancelt den Reader und startet den bestehenden Retry-Pfad.
- Auch Manifest-Bodies im eigentlichen Offscreen-Downloader bekommen einen Body-Stall-Timeout mit gezielten Neuöffnungsversuchen.
- Der letzte gepufferte Fortschrittsstatus wird vor dem Export synchronisiert, damit ein verspäteter Status nicht `saving` wieder mit `downloading` überschreibt.
- Sobald Chrome eine Download-ID zurückgegeben hat, wird die Blob-URL nicht mehr nur deshalb freigegeben, weil das Speichern der internen Recovery-Metadaten fehlschlägt.

## Aus 1.6.3: schnellere und zuverlässigere Analyse

Eine normale HLS-Media-Playlist wird nach erfolgreicher Analyse als **HLS · bereit** angezeigt. Die Schnellanalyse nutzt kurze Timeouts, In-Flight-Deduplizierung, bis zu drei parallele Probes und einen Cooldown nach Fehlern. Während eines aktiven Downloads werden unnötige Hintergrundanalysen pausiert.

## Aus 1.6.3: rollender Prefetch für normale HLS-Streams

Der einfache HLS-Pfad verwendet ein rollendes, RAM-begrenztes Prefetch-Fenster statt fester `Promise.all`-Batches:

`Netzwerk (dynamische Parallelität) → begrenzter RAM-Puffer → geordnetes OPFS-Schreiben`

Sobald ein Request fertig ist, kann der nächste starten; die Datei wird trotzdem strikt in Segmentreihenfolge geschrieben.

## Aus 1.6.2: stabile Benennungseingabe

Titel, Jahr, Staffel und Episode behalten beim Tippen Fokus und Cursorposition. Periodische Statusupdates werden während aktiver Eingabe zurückgestellt und danach einmalig gerendert.

## Neu in 1.6.1: robuster finaler Dateiexport

Bei HLS/DASH ist der eigentliche Film bereits lokal fertig, bevor Chrome den Speicherdialog übernimmt. 1.6.1 trennt diese beiden Schritte jetzt ausdrücklich:

`Stream laden/muxen → fertige OPFS-Datei → Chrome-Export`

Wenn nur der **Chrome-Export** scheitert, wird die fertig gemuxte Datei **nicht gelöscht**. Im Popup erscheint stattdessen **„Speichern erneut versuchen“**. Dabei wird ausschließlich der letzte Speicherschritt wiederholt – HLS/DASH muss nicht erneut geladen oder gemuxt werden.

- konkrete Chrome-Fehlercodes und verständliche Hinweise (`FILE_NO_SPACE`, `FILE_ACCESS_DENIED`, `USER_CANCELED`, `NETWORK_FAILED`, `CRASH` usw.)
- fertige Dateigröße im Status
- temporäre OPFS-Datei bleibt nach einem Exportfehler erhalten
- Blob-URL kann nach einem Offscreen-Neustart aus der OPFS-Datei neu erzeugt werden
- erst nach bestätigtem Chrome-Status `complete` wird die temporäre Datei gelöscht
- fehlgeschlagene Export-Blob-URLs werden freigegeben, ohne die OPFS-Datei zu löschen
- bei fMP4/DASH werden Video-/Audio-Zwischenspuren nach erfolgreichem Muxing schon vor dem finalen Export entfernt; nur die fertige Ausgabedatei muss für einen Retry erhalten bleiben
- Entfernen eines StreamForge-Treffers bzw. „Leeren“ verwirft zugehörige zurückgehaltene Exportdateien sauber

Sicherheitsblockaden von Chrome werden nicht umgangen. Bei `FILE_BLOCKED`, `FILE_VIRUS_INFECTED` oder `FILE_SECURITY_CHECK_FAILED` wird kein automatischer Retry als Umgehung angeboten.

## Neu in 1.6.0: Film-/Serien-Benennung

Jeder erkannte Stream besitzt jetzt im Popup einen Bereich **Dateiname**. Dort kann der Medientyp ausdrücklich als **Film** oder **Serie** gewählt werden.

- Film: `Filmname (Erscheinungsjahr)`
- Serie: `Serienname SXXEXX`

Beispiele:

- `Obsession (2023).ts`
- `Avengers Endgame (2019).ts`
- `Lazarus S01E03.ts`
- `Dark S03E08.mp4`

Die Container-Endung (`.ts`, `.mp4` usw.) wird weiterhin automatisch vom Downloader ergänzt. Qualität und Audiosprache werden **nicht** mehr automatisch an den Namen angehängt.

### Automatische Vorbelegung

StreamForge versucht Titel, Erscheinungsjahr, Staffel und Episode aus der geöffneten Seite vorzubelegen. Dafür werden lokal verfügbare Seiteninformationen ausgewertet, insbesondere:

- JSON-LD/Schema.org (`Movie`, `TVEpisode`, `TVSeries`)
- OpenGraph-/Seitentitel
- typische Muster wie `S02E07`, `2x07` oder `Staffel 2 Folge 7`

Alle Felder bleiben editierbar. Eine manuelle Änderung wird für den jeweiligen Treffer in der aktuellen Browser-Sitzung beibehalten und nicht wieder von einer später eintreffenden Auto-Erkennung überschrieben.

### Validierung

Vor dem Download prüft StreamForge die Benennung:

- Film benötigt Titel + vierstelliges Erscheinungsjahr.
- Serie benötigt Titel + Staffel + Episode.
- Staffel/Episode werden mindestens zweistellig formatiert (`S01E03`); größere Nummern bleiben erhalten (`S12E104`).
- Windows-ungültige Zeichen im Dateinamen werden entfernt.
- Bereits im Titel vorhandene `(Jahr)`- oder `SXXEXX`-Suffixe werden nicht doppelt angehängt.

## Download-Pipeline

Alle Stabilitäts- und Performance-Verbesserungen aus 1.5.1 bleiben erhalten:

`Netzwerk → RAM-begrenzter Prefetch-Puffer → geordneter TS-Muxer → gepufferte lokale Datei`

Dazu gehören echte Netzwerkmetriken, adaptive Parallelität mit Hysterese, robuste Retries, Browser-Session-Kontext, persistenter TS-Ausgabepuffer und entkoppelte Fortschrittsanzeige.

## Unterstützt

- direkte MP4/WebM-Medien
- HLS / m3u8 inklusive verschachtelter Master-Playlists
- HLS-Qualitätsauswahl
- Audio-/Sprachauswahl bei HLS
- klassische MPEG-TS-HLS-Streams
- fMP4-HLS
- getrennte MPEG-TS/AAC-HLS-Spuren mit tolerantem Timeline-Matching
- fMP4/MP4-DASH mit getrenntem Audio und Video
- Master-/Variant-Deduplizierung
- Browser-Kontext mit Referer/Origin und lokalem Session-Kontext
- Cache-Reuse best-effort
- detaillierte Fetch-/HTTP-Diagnose und Retries
- Film-/Serien-Benennung mit Auto-Vorbelegung und manueller Korrektur

DRM, verschlüsselte HLS-/DASH-Inhalte und technische Zugriffssperren werden nicht umgangen.

## Installation / Update

1. ZIP entpacken.
2. `chrome://extensions` bzw. `edge://extensions` öffnen.
3. Entwicklermodus aktivieren.
4. Alte lokale StreamForge-Version entfernen oder deaktivieren.
5. **Entpackte Erweiterung laden** anklicken.
6. Den Ordner `StreamForge-Browser-Extension-v1.6.5` auswählen, in dem direkt `manifest.json` liegt.
7. Bereits geöffnete Film-/Player-Tabs schließen und neu öffnen, damit das neue Content-Script die Seitenmetadaten einliest.

## Teststatus 1.6.5

Erfolgreich ausgeführt wurden die vollständige bestehende Regression-Suite sowie neue Tests für MIME-/Endungsnormalisierung, typisierte Blobs, echte TS-Syncbytes, MP4-Boxerkennung, Playlist-/HTML-Abwehr, Body-Inaktivitäts-Timeouts und das Export-Persistenz-Race. Die vorhandenen HLS-/DASH-/Mux-/Prefetch-/Naming-/Recovery-Tests bleiben grün. Zusätzlich werden Syntax, Versionsdaten, ZIP und Chromium-Extension-Load geprüft.

Details stehen in `TEST_REPORT.md`.
