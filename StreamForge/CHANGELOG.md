# StreamForge Browser Connector – Changelog

## v1.8.7 – Integrationskorrekturen nach erneuter Prüfung

- Veraltete Download-Warteschlangen-Funktionen aus UI, Hintergrund und automatischem Restore entfernt; Downloader bleibt auf dem direkten V1.6.5-Pfad.
- Vorhandene alte Warteschlangeneinträge beeinflussen die aktuelle Anzeige nicht mehr.
- Bei direktem Video mit ausgewähltem Ordner wird die fehlende Unterstützung ausdrücklich erklärt statt stillschweigend an einen anderen Speicherort zu schreiben.
- Neuer automatisierter Integrationstest prüft den direkten Downloadstart und die getrennte Ordnerintegration.
- Die HLS/DASH-Segmentlogik und das Muxing bleiben gegenüber V1.8.6 unverändert.


## v1.8.6 – Rückkehr zur StreamForge-1.6.5-Downloadengine

- HLS-/DASH-Datenabruf, Segmentverarbeitung und Muxing aus 1.6.5 wiederhergestellt.
- 1.6.5-Direktstart statt späterer Warteschlange/Offscreen-Bereitschaftsabfrage.
- Bestehende Auswahl von Medienordnern und automatische Jellyfin-Ordnergenerierung erst beim finalen Export ergänzt.
- UI und aktuelle Versionskennung bleiben modern; Online-Feldtest noch erforderlich.


## v1.8.5 – Offscreen-Verbindung abgesichert

- Chrome-Fehler „Receiving end does not exist“: Downloader wartet jetzt auf bestätigte Bereitschaft des Offscreen-Empfängers.
- Begrenzte Bereitschaftsversuche und verständlicher Hinweis statt roher Chrome-Fehlermeldung.
- Regressionstest für verspätet gestartete Offscreen-Module und fehlende Empfänger.
- Downloadpipeline und Jellyfin-Ordnererstellung unverändert.


## v1.8.4 – Branding-Icons wiederhergestellt

- PNG-Icon-Rendering repariert: Farbmotiv und SVG-Maske werden verlustfrei kombiniert statt durch CairoSVG fehlerhaft transparent ausgegeben.
- Chrome-Icons (16/32/48/128) und ForgeCore-Favicon neu generiert.
- Alle Funktionen der v1.8.3 bleiben unverändert.


## v1.8.3 – Aufklappbereiche bleiben geöffnet

- Geöffnete Stream-Details und Tonspuren/Untertitel bleiben während der automatischen Aktualisierung der Videokarten offen.
- Auch „Weitere Serienfunktionen“ und „Mehr“ behalten ihren Zustand bei.
- Zustand wird je Videotreffer und Browser-Tab verwaltet, ohne Download-Pipeline oder automatische Ordnererstellung zu ändern.


## v1.8.2 – Vereinfachter Connector (UX-Update)

- Schritt-für-Schritt-Hinweis, klarere Tabs und Hauptaktion „Jetzt herunterladen“.
- Speicherziel, Leistungsprofil und Filter standardmäßig unter „Weitere Einstellungen“; Zustand bleibt gespeichert.
- Technische Stream-URL, Untertitel und zusätzliche Quellaktionen über optionale Detailbereiche erreichbar.
- Verständliche Downloadstatusmeldungen, insbesondere beim HLS/DASH-Vorbereiten.
- Keine Änderung an Download-Pipeline, Netzwerkzugriff, Muxing oder ForgeCore-Snapshot.


## 1.8.1 – Vorhandene Staffelordner erkennen

- Bei Serien lassen sich die vorhandenen Staffelordner des ausgewählten Medienverzeichnisses anzeigen und mit einem Klick übernehmen.
- Erkennt `Season 01`, `Season 2`, `Staffel 02` und `Specials` (Staffel 0).
- Die Auswahl übernimmt die Staffelnummer und den exakten vorhandenen Ordnernamen (auch bei Schreibweisen wie `Staffel 2`).
- Bestehende Staffelordner werden bei der Speicherung bevorzugt wiederverwendet; neue Ordner werden nur bei fehlender Staffel erstellt.
- Der Suchvorgang liest nur Ordnernamen; die Suche selbst erstellt oder verändert keine Dateien.
- Die Funktion benötigt einen im Browser freigegebenen Medienordner. Im reinen Chrome-Downloads-Modus bleibt die manuelle Staffelnummer maßgeblich.
- Automatisierte Tests für Suche, Auswahl und tatsächliches Zielverzeichnis.

## 1.8.0 – Automatische Jellyfin-Ordnerverwaltung

- Filme: Ordner `Movies/Titel (Jahr)` erzeugen oder vorhandenen Ordner wiederverwenden.
- Serien: `Shows/Serienname/Season NN` anlegen und Episoden darin ablegen.
- Einstellbarer Speicher-Modus: bisheriger Speicherdialog, automatisch innerhalb Downloads oder ein vom Benutzer gewählter beschreibbarer Medienordner.
- Auswahl eines vorhandenen Serien- oder Staffelordners; nur die noch fehlenden Unterordner werden erstellt.
- Finale HLS-/DASH-Datei wird bei vorhandener Schreibberechtigung stückweise und speicherschonend aus der validierten temporären Datei in den ausgewählten Ordner geschrieben.
- Bereits vorhandene Dateien werden beim direkten Ordnerexport nicht überschrieben; Chrome-Downloads nutzen eine eindeutige Namensvariante.
- Bei Berechtigungs-/Schreibfehlern bleibt die fertige OPFS-Mediendatei erhalten und ein regulärer Speicherdialog wird geöffnet.
- Die Auswahl eines vorhandenen Medienordners wird als File-System-Handle im lokalen IndexedDB der Erweiterung gespeichert.
- Direkte Mediendateien nutzen im Modus „Ausgewählter Ordner“ weiterhin den Browser-Speicherdialog.
- **Einschränkungen:** Netzlaufwerk muss vom Browser aus les-/beschreibbar sein; kein erzwungener SMB-Zugriff. Reale ZimaOS- und Browser-Abnahme steht aus.

## 1.7.9 – Warteschlangen-Priorisierung und Abschluss der 1.7-Reihe

- Im Download-Center können wartende HLS-/DASH-Aufträge mit ↑ Höher und ↓ Tiefer priorisiert werden.
- Neue Reihenfolge wird dauerhaft in der Queue gespeichert und bei Neustart wiederhergestellt.
- Laufende Aufträge werden nicht nachträglich verschoben.
- Regressionstests für Reihenfolge, Grenzen und ungültige Richtung.
- Limitierungen der 1.7-Reihe: kein bytegenaues HLS-/DASH-Resume und keine automatische Schreibberechtigung auf ZimaOS-Netzfreigaben.

## 1.7.8 – TS-Medienprüfung

- MPEG-TS-Kopf- und Endbereich werden vor dem Export stichprobenartig auf TS-Synchronisation und Transport-Fehlerbits geprüft.
- Erkannte beschädigte Container-Stichproben werden zurückgehalten und mit verständlichem Fehlercode gemeldet.
- Regressionstests für Transportfehler und ungültige TS-Pakete.
- **Grenze:** Die Stichproben sind keine vollständige Codec-Dekodierung oder Prüfung aller Segmente.

## 1.7.7 – Performance Engine 2.0

- Netzwerkparallelität wird bei stark gefülltem Segmentpuffer dynamisch begrenzt, um Speicherpeaks zu reduzieren.
- Zusatzdiagnose unterscheidet Netzwerkwartezeiten von Muxing-/Speicherengpässen.
- Regressionstests prüfen abgestufte Drosselung und minimale Parallelität.
- Keine unbelegte Geschwindigkeitserhöhung versprochen; Wirksamkeit hängt vom Stream und System ab.

## 1.7.6 – Jellyfin-Dateistruktur

- Überprüfte relative Jellyfin-Ordner-/Dateivorschläge für Filme und Episoden.
- Neuer „Jellyfin-Pfad kopieren“-Button neben der Dateibenennung.
- Verhindert ungültige Namen und unerwünschte absolute Pfade.
- Der Browser schreibt **nicht** ohne explizite Benutzerfreigabe direkt auf ZimaOS-Netzfreigaben. Der kopierte Pfad dient der Organisation beim Speichern.

## 1.7.5 – Untertitel-Center

- Direkte WebVTT-Dateien und unverschlüsselte HLS-WebVTT-Playlisten können separat als SRT exportiert werden.
- Zeitstempel und Segmentstartzeiten werden berücksichtigt; doppelte identische Cues herausgefiltert.
- Schutz gegen zu große / verschlüsselte Untertitel, zu viele Segmente und nicht unterstützte MPEGTS-Zeitbasen.
- Bekannte Grenze: kein MP4-Untertitel-Muxing und keine garantierte Verarbeitung sämtlicher WebVTT-Varianten.

## 1.7.4 – Download-Validierung

- Leere Segmentantworten und offensichtliche HTML-/XML-Fehlerseiten werden vor dem Muxing erkannt.
- Leere oder unvollständige Ausgaben werden als Fehler gemeldet statt exportiert.
- Regressionstests für ungültige Download-Inhalte.
- Keine bytegenaue Wiederaufnahme teilweise heruntergeladener HLS-/DASH-Streams.

## 1.7.3 – Download-Center

- Neue eigene Download-Center-Ansicht mit aktuellen Aufträgen, Fortschrittsleisten, Geschwindigkeit und Restzeit.
- Begrenzter lokaler Verlauf der letzten 60 abgeschlossenen, fehlgeschlagenen oder abgebrochenen Vorgänge.
- Verlauf speichert keine Stream-URLs, Cookies oder Zugriffstokens; Verlauf lässt sich löschen.
- Bessere Tastaturfokus-Anzeige und reduzierte Animation bei entsprechender Systemeinstellung.
- Bisherige Warteschlangensteuerung und Medienauswahl bleiben erhalten.
- Zusätzliche Regressionstests für lokale Verlaufsspeicherung und gleichzeitige Updates.

## 1.7.2 (Medienauswahl)

- HLS-Master-Playlists: Untertitelgruppen (SUBTITLES) mit Sprache, Name, Default und URL erkennen.
- Auswahl verfügbarer Untertitel im Popup und Kopieren der Spur-URL. Direkte `.vtt`-WebVTT-Spuren können mit Jellyfin-Dateinamen separat gespeichert werden; eine HLS-Untertitelplaylist wird **nicht** als fertige VTT-Datei ausgegeben.
- DASH: auswählbare Video- und Audio-Representations nach ID inklusive Audio-Sprachanzeige.
- Die gewählten DASH-Representations werden beim eigentlichen MP4-Muxing verwendet.
- Bestehende Jellyfin-konforme Film-/Serienbenennung bleibt erhalten.
- **Nicht enthalten:** DRM-Umgehung, automatisches Untertitel-Remuxing oder Konvertieren segmentierter HLS-Untertitel in SRT.

## 1.7.1 (veröffentlicht)

- Gespeicherte HLS-/DASH-Aufträge werden beim Wiederherstellen dedupliziert.
- Ungültige/stale Einträge werden aus dem persistenten Warteschlangen-Snapshot entfernt.
- Regressionstest für doppelte und beschädigte Warteschlangeneinträge.
- Race Condition zwischen parallelem Einreihen und dem Start des nächsten Jobs verhindert: Der Dispatcher synchronisiert ausstehende Speicheroperationen vor der Übernahme eines Auftrags.
- Regressionstest für paralleles Einreihen, FIFO-Reihenfolge und finalen persistenten Status.
- Bestehende Export-, Muxing- und Netzwerk-Regressionstests bleiben erhalten.
- Browser-/ZimaOS-Abnahme bleibt als separate manuelle Prüfung dokumentiert.

## 1.7.0 (veröffentlicht auf main; Browserabnahme empfohlen)

- Erste Download-Warteschlange für HLS-/DASH-Aufträge im Offscreen-Dokument: Aufträge werden nacheinander ausgeführt, um paralleles speicherintensives Muxing zu vermeiden.
- Popup zeigt wartende Aufträge mit ihrer Queue-Position und verhindert doppeltes Starten während des Wartens.
- Ein fehlgeschlagener Auftrag blockiert nachfolgende Aufträge nicht.
- Wartende (noch nicht gestartete) Aufträge können jetzt über das Popup aus der Warteschlange entfernt werden, ohne aktive Muxing-Prozesse anzutasten.
- Zusätzliche Queue-Tests prüfen Abbruch, bereits laufende Aufträge und Fehlerbehandlung.
- Neuer automatisierter Queue-Regressionstest und Versionsprüfung für GitHub Actions.
- Wartende HLS-/DASH-Aufträge werden in `chrome.storage.local` gespeichert und beim nächsten Start des Offscreen-Dokuments wieder in die Queue geladen.
- Zuvor laufende Aufträge werden bei einer Wiederherstellung aus Sicherheitsgründen als unterbrochen gemeldet und **nicht** automatisch nochmals ausgeführt.
- Regressionstest für Neustart, Wiederherstellung, Duplikate und Stornierung ergänzt.
- Die Warteschlange wird beim Browserstart automatisch über das Offscreen-Dokument wiederhergestellt, sofern gespeicherte Aufträge vorhanden sind. Laufende Medienübertragungen werden weiterhin nicht bytegenau fortgesetzt.
- Drei adaptive Leistungsprofile für Segmentdownloads: Schonend (max. 4), Ausgewogen (max. 8) und Schnell (max. 12 parallele Requests), mit bestehendem RAM-Budget und automatischer Drosselung bei Netzwerkfehlern.
- Persistente Wahl des Leistungsprofils und eine Warteschlangen-Zusammenfassung im Popup.
- GitHub Actions validiert Manifest-Assets und JavaScript-Syntax und erstellt ein installierbares Extension-ZIP-Artefakt.
- Wartende Aufträge lassen sich pausieren und fortsetzen, einschließlich Speicherung des Pause-Zustands über Neustarts. Ein laufender Transfer wird nicht mitten im Muxing gestoppt.
- Queue-Wiederherstellung zeigt wartende Aufträge erneut an; Benachrichtigungsfehler blockieren die Wiederherstellung nicht.
- **Nicht Teil dieses Release-Kandidaten:** Bytegenaues Fortsetzen bereits laufender HLS-/DASH-Transfers, Pause innerhalb eines Segments, automatische Untertitel-Muxing-Unterstützung. Diese Funktionen benötigen separate Pipeline- und Formatentwicklung.
- **Freigabe-Blocker:** echte Browser-End-to-End-Tests mit HLS/DASH, Abbruch/Neustart, längeren Streams sowie Speicherung auf dem ZimaOS-Netzlaufwerk.

## 1.6.5

- Kritischer MPEG-TS-Muxingfix für H.264/H.265 mit B-Frames: Video wird nach DTS statt PTS in Dekodierreihenfolge ausgegeben.
- PES-Parser liest PTS und DTS getrennt; Streams ohne separates DTS verwenden PTS als Decode-Clock.
- 33-Bit-PTS/DTS werden arithmetisch dekodiert, ohne signed-32-bit-Bitshift-Überlauf.
- PCR wird aus Video-DTS statt Video-PTS erzeugt.
- `#EXT-X-DISCONTINUITY` und `#EXT-X-DISCONTINUITY-SEQUENCE` werden in Media-Playlists erfasst.
- Neue Discontinuity-Epochen werden mit einem gemeinsamen A/V-Offset auf eine monotone Zeitachse rebasiert; PES-Zeitstempel werden entsprechend neu geschrieben.
- MPEG-TS `discontinuity_indicator` wird an der neuen Epoche gesetzt.
- TS-Syncverlust und Transport-Error-Bits führen zu einer klaren Fehlermeldung statt still beschädigte Daten weiterzumuxen.
- Neuer permanenter B-Frame-/DTS-/Discontinuity-Regressionstest.
- Reeller ffmpeg-Gegencheck: 1.6.4 erzeugte beim B-Frame-Fixture 297 Warn-/Fehlerzeilen; 1.6.5: 0.
- Mehrsegmentiger H.264+B-Frame/AAC-Test und Timestamp-Reset-Test vollständig ohne ffmpeg-Decoding-Warnungen.

## 1.6.4

- Fix für den wieder aufgetretenen `.txt`-Export: OPFS-Dateien werden beim finalen Chrome-Export jetzt immer in einen Blob mit explizitem Container-MIME (`video/mp2t` bzw. `video/mp4`) eingebettet.
- Dateiendungen werden vor jedem Export kanonisiert. Falsche Suffixe wie `.txt`, `.m3u8`, `.html`, `.bin` oder eine falsche Media-Endung werden ersetzt statt als `Film.txt.ts` angehängt.
- Retained-Export-Metadaten aus älteren Versionen werden beim Retry ebenfalls auf MIME und Endung normalisiert.
- Neue finale Inhaltsprüfung vor dem Speicherdialog: MPEG-TS wird über mehrere 188-Byte-Sync-Pakete validiert; MP4/fMP4 über plausible ISO-BMFF-Boxen.
- Schutz gegen versehentlichen Export von `#EXTM3U`-Playlists oder HTML-Fehlerseiten als Filmdatei. Solche Dateien werden nicht an Chrome übergeben und als klare Diagnose gemeldet.
- Ungültige, nicht retrybare temporäre Medienausgaben werden sauber entfernt, damit kein OPFS-Speicherleck entsteht.
- Export-State-Race behoben: der letzte gepufferte Downloadstatus wird jetzt vollständig geschrieben, bevor `saving` gesetzt wird; alte 900-ms-Fortschrittsupdates können den Speichern-Status nicht mehr zurück auf `downloading` setzen.
- Nach erfolgreichem `chrome.downloads.download()` führt ein Fehler beim Persistieren der Recovery-Metadaten nicht mehr zum vorzeitigen Revoke der bereits verwendeten Blob-URL.
- Segment- und Manifest-Bodies besitzen zusätzlich einen Inaktivitäts-Timeout. Ein CDN, das nur HTTP-Header sendet und danach mitten im Body hängen bleibt, kann keinen Worker mehr unbegrenzt blockieren.
- Manifest-Body-Stalls erhalten bis zu drei gezielte Neuöffnungsversuche; Segment-Body-Stalls laufen durch die bestehende vollständige Segment-Retry-/Parallelitätslogik.
- Neue Regressionstests für MIME/Dateiendung, Playlist-/HTML-Abwehr, TS/MP4-Signaturprüfung, Body-Stall-Cancel und Export-Persistenz-Race.

## 1.6.3

- Fix: erfolgreiche HLS-Media-Playlist-Analyse blieb im Popup fälschlich dauerhaft auf **„Analysiere …“** stehen.
- HLS-Probes unterscheiden jetzt Master-, Media- und unbekannte Playlists und liefern immer einen eindeutigen Abschlussstatus.
- Manifest-Timeout gilt jetzt bis zum vollständig gelesenen Response-Body; ein Server kann die Analyse nicht mehr nach den HTTP-Headern unbegrenzt hängen lassen.
- Popup-Schnellanalyse nutzt zwei kurze Versuche (7 s / 10 s) statt die lange Download-Retry-Strategie.
- Bis zu drei sichtbare Treffer werden parallel analysiert statt streng nacheinander.
- In-Flight-Deduplizierung verhindert doppelte gleichzeitige Probes desselben Manifests.
- Nach einem Analysefehler gilt 30 s Cooldown; **Aktualisieren** erzwingt bei Bedarf sofort einen neuen Versuch.
- Während eines laufenden Downloads werden unnötige Hintergrundanalysen pausiert, damit sie nicht mit Segmentrequests konkurrieren.
- Der eigentliche HLS-/DASH-Download behält die robuste 5-Versuche-Probe/Retry-Strategie.
- Performance-Fix für normale HLS-Streams: fester `Promise.all`-Batch-Barrier entfernt. Ein rollendes, RAM-begrenztes Prefetch-Fenster startet sofort neue Requests, sobald Slots frei werden.
- Normale HLS-Ausgabe bleibt strikt in Segmentreihenfolge; Prefetch, adaptive Parallelität und OPFS-Schreiben bleiben voneinander getrennt.
- Fortschrittsmeldungen des normalen HLS-Pfads laufen auf einem 500-ms-Ticker statt im kritischen Schreibpfad.

## 1.6.2

- Fix für Fokusverlust in Titel-, Jahr-, Staffel- und Episodenfeldern.
- Periodische 1,2-s-Statusupdates bauen Stream-Karten während aktiver Benennungseingabe nicht mehr neu auf.
- Mehrere während des Tippens eintreffende Refreshes werden zu genau einem nachgelagerten Render zusammengefasst.
- Fokuswechsel zwischen Benennungsfeldern lösen keinen Zwischen-Render aus.
- Manuelle Eingaben bleiben erhalten und werden weiterhin debounced gespeichert.

## 1.6.1 Stable

- Finalen Chrome-Dateiexport von HLS/DASH als eigene Recovery-Phase modelliert.
- Fertig gemuxte OPFS-Datei wird bei fehlgeschlagenem `chrome.downloads`-Export nicht mehr gelöscht.
- Neuer Popup-Zustand `export_error` mit **Speichern erneut versuchen**; erneuter Versuch verwendet die vorhandene fertige Datei statt HLS/DASH neu zu laden.
- Retained-Export-Metadaten werden lokal gespeichert, sodass ein neu erzeugtes Offscreen-Dokument die Blob-URL aus der OPFS-Datei wiederherstellen kann.
- Temporäre Datei wird erst nach bestätigtem Chrome-Downloadstatus `complete` entfernt.
- Bei fehlgeschlagenem Export wird nur die Blob-URL freigegeben; die OPFS-Datei bleibt erhalten.
- Verständliche Diagnose für Chrome-Fehler wie `FILE_NO_SPACE`, `FILE_ACCESS_DENIED`, `FILE_TOO_LARGE`, `USER_CANCELED`, `NETWORK_FAILED`, `NETWORK_TIMEOUT`, `CRASH` und weitere.
- Sicherheitsblockaden (`FILE_BLOCKED`, `FILE_VIRUS_INFECTED`, `FILE_SECURITY_CHECK_FAILED`) werden nicht umgangen und nicht als automatischer Retry angeboten.
- Popup zeigt die Größe der fertig vorbereiteten Datei während Speichern/Exportfehler an.
- fMP4-/DASH-Zwischenspuren werden nach erfolgreichem Muxing vor dem finalen Export entfernt; Retry muss nur die fertige Ausgabedatei behalten.
- Entfernen/Leeren eines Treffers verwirft zugehörige Retained-Exportdateien.
- Neue Unit- und Background-Integrationstests für Exportfehler → Retention → Retry → `complete` → Cleanup.

## 1.6.0

- Neuer Medientyp-Wähler **Film / Serie** direkt pro erkanntem Stream.
- Film-Dateinamen folgen `Filmname (Erscheinungsjahr)`.
- Serien-Dateinamen folgen `Name SXXEXX`.
- Titel, Jahr, Staffel und Episode sind vor dem Download editierbar.
- Automatische Metadaten-Vorbelegung aus JSON-LD (`Movie`, `TVEpisode`, `TVSeries`), OpenGraph/Seitentitel und typischen Episodenmustern.
- Metadaten des Top-Level-Tabs werden bevorzugt, damit generische iframe-/Player-Titel nicht den eigentlichen Film-/Seriennamen verdrängen.
- Manuell geänderte Benennung wird pro Treffer in der Browser-Sitzung gespeichert und von späteren Auto-Metadaten nicht überschrieben.
- Validierung blockiert unvollständige Film-/Seriennamen vor dem Download.
- Staffel/Episode werden mindestens zweistellig (`S01E03`) formatiert; größere Werte bleiben erhalten.
- Bereits vorhandene `(Jahr)`- bzw. `SXXEXX`-Suffixe werden nicht doppelt erzeugt.
- Qualität/Audio-Sprache werden nicht mehr als automatische Suffixe an den fertigen Dateinamen angehängt.
- Benennung gilt einheitlich für direkte Medien, HLS, TS/AAC-HLS, fMP4-HLS und DASH.
- Alle Performance-, Retry-, Browser-Kontext- und Muxing-Verbesserungen aus 1.5.1 bleiben unverändert erhalten.
- Neue `naming.js`-Unit-Tests; komplette Regression-Suite weiterhin erfolgreich.

## 1.5.1 Stable

- Persistenter ~2-MiB-TS-Ausgabepuffer über Segment- und PAT/PMT-Grenzen hinweg.
- PAT/PMT erzwingen keine kleinen OPFS-Flushing-Vorgänge mehr.
- `await` pro 188-Byte-TS-Paket aus dem Hot-Path entfernt; gewartet wird nur bei echten Block-Writes.
- Benchmark-Regressionsfall: ~4,62 MiB Output von 174 Writer-Aufrufen in 1.5.0 auf 3 in 1.5.1 reduziert.
- TS/AAC-Fortschrittsmeldungen vollständig aus dem segmentweisen Mux-Hot-Path entkoppelt.
- Offscreen-Snapshots ~500 ms; Background coalesced laufende Statusupdates und persistiert sie ungefähr alle 900 ms.
- Downloadstatus-Updates lösen keine unnötigen Badge-Updates mehr aus.
- Prefetch-Fenster auf 12–32 Paare erweitert und gleichzeitig auf 160 MiB gepufferte Daten begrenzt.
- Effektive Prefetch-Tiefe passt sich anhand der durchschnittlichen realen Segmentpaargröße an.
- Adaptive Parallelität mit Hysterese: 429 stark, Timeout/5xx moderat, Body-Abbruch leicht; gleichzeitige Fehler desselben Batches werden entprellt.
- Achtsekündige Wachstums-Cooldown-Phase nach Backpressure verhindert schnelles Hoch-/Runterflattern.
- Exakte `Content-Length`-Downloads vermeiden eine vollständige zusätzliche Segmentkopie.
- MPEG-TS-Payloads und ADTS-Frames verwenden beim Parsen `subarray`-Views statt vieler kleiner Kopien.
- ADTS-Pfad verwendet die bereits extrahierte Video-PES-Struktur erneut und scannt das Video nicht doppelt.
- Popup zeigt Pufferbytes zusammen mit dem maximalen RAM-Puffer an.
- Komplette bestehende Test-Suite erfolgreich.
- Neuer Buffer-/Hysterese-/Writer-Regressionstest erfolgreich.
- Reeller ffmpeg-End-to-End-HLS-Test mit unterschiedlich geschnittenen Video-/Audiosegmenten fehlerfrei.
- Chromium-Load-Test ohne Extension-/Manifest-Ladefehler.

## 1.5.0 Stable

- Netzwerk, Puffer und MPEG-TS-Muxing im getrennten TS/AAC-Pfad entkoppelt.
- Neue bounded Producer/Consumer-Pipeline mit dynamischem Request-Limiter.
- Prefetch-Fenster auf 6–16 Segmentpaare begrenzt; kein kompletter Film im RAM.
- Echte Netzwerkbytes werden während `response.body` gezählt, nicht erst nach vollständigen Segmenten.
- Neue Live-Werte für aktive/wartende Requests, Download- und Mux-Segmente, Pufferbelegung und Puffergröße.
- ETA-Warm-up verhindert unrealistische Stundenwerte aus den ersten Segmenten.
- Engpass-Erkennung basiert im Streaming-Mux-Pfad auf Pipeline-Zustand statt auf aufsummierter paralleler Fetch-Zeit.
- Segment-Body-Abbrüche nach bereits empfangenen HTTP-Headern erhalten eigene vollständige Segment-Retries.
- TS-Muxer bündelt TS-Pakete in größere Write-Blöcke statt 188-Byte-Einzelwrites.
- Alle Audio-/Video-Timeline-Fixes aus 1.4.4 bleiben erhalten.

## 1.4.4

- Fix für getrennte HLS-Spuren mit unterschiedlich geschnittenen Video- und Audiosegmenten.
- Audiosegmente dürfen jetzt zeitlich mehrere Videosegmente abdecken, ohne erneut geladen oder doppelt in die Ausgabe geschrieben zu werden.
- Der Segment-Matcher unterscheidet zwischen neu zu ladender Audiodatei und bereits durch ein vorheriges Audiosegment abgedeckter Videozeit.
- Kleine Rundungsabweichungen am Ende einer HLS-VOD-Playlist werden toleriert; echte Audiolücken in der Mitte bleiben weiterhin ein Fehler.
- `TsMuxer` kann nach bereits geschriebenem Audio weitere Video-only-Abschnitte anhängen, ohne die Audiospur zu duplizieren.
- Die Prefetch-/Parallelitätsoptimierungen aus 1.4.3 bleiben vollständig erhalten.
- Neue Regressionstests für lange Audiosegmente, Video-only-Folgeabschnitte, Enddrift und echte Audiolücken.
- Realtest mit 2-Sekunden-Videosegmenten und 4-Sekunden-Audiosegmenten erzeugt eine fehlerfrei dekodierbare MPEG-TS-Datei mit H.264 + AAC.

## 1.4.3

- Performance-Patch für getrennte MPEG-TS/AAC-HLS-Spuren.
- Segmentpaare werden anhand der HLS-Zeitleiste vorab stabil zugeordnet.
- Request-budgetiertes Prefetch: bei Parallelität 8 typischerweise vier Video+Audio-Paare bzw. acht HTTP-Requests gleichzeitig.
- Netzwerkabruf des nächsten Batches überlappt mit dem lokalen Muxing des aktuellen Batches.
- Adaptive Parallelität aus 1.3.x/1.4.x bleibt aktiv; nach Retries verkleinert der nächste Batch automatisch sein Fenster.
- Ausgabe bleibt strikt geordnet; kein Re-Encoding und keine Änderung an der Medienqualität.
- Neuer Unit-Test für Segment-Zuordnung und Prefetch-Budgetierung.

## 1.4.2

- Download- und Muxing-Fortschritt im Popup klar getrennt.
- Live-Downloadrate in B/KB/MB/GB pro Sekunde.
- ETA-Anzeige auf Basis des realen Jobfortschritts.
- Segmentzähler und aktuelle Parallelität direkt im Downloadstatus.
- Retries werden im Live-Status mitgezählt.
- Bei getrennten MPEG-TS/AAC-HLS-Spuren bleibt der Job während des Netzwerkabrufs im Zustand **Download**; StreamForge zeigt separat **Muxing läuft parallel** statt irreführend nur `Muxxt X %`.
- Neuer Flaschenhals-Indikator `Netzwerk`, `Muxing` oder `Gemischt`, basierend auf gemessener Fetch- vs. Mux-Zeit.
- Bei fMP4/DASH wird nach Abschluss des Downloads ein eigener Muxing-Fortschritt inklusive ETA angezeigt.
- Fortschrittsmeldungen überschreiben vorhandene Telemetriedaten nicht mehr versehentlich mit Nullwerten.

## 1.4.1

- HLS-Deduplizierung verbessert: Master-Playlists und daraus geladene Varianten werden nach der Manifest-Analyse zu einem Treffer zusammengeführt.
- Neuer Qualitätswähler für HLS-Master-Playlists (z. B. 1080p / 720p / 480p).
- Gewählte Qualitätsvariante wird bis in den Offscreen-Downloader weitergereicht und tatsächlich geladen.
- Audiospuren werden passend zur ausgewählten Qualitätsvariante gefiltert.
- Qualitätsbadge folgt der aktuellen Auswahl.
- Alle Browser-Kontext-, Retry-, Diagnose- und Muxing-Funktionen aus 1.4.0 bleiben erhalten.

## 1.4.0

Minor-Release: Downloadrequests laufen jetzt deutlich näher am regulären Browser-/Player-Kontext.

## Neu

- Request-Profil pro erkanntem Netzwerkstream (Referer, Origin, Accept-Language und unkritische Accept-Metadaten).
- Session-Request-Bridge über temporäre `declarativeNetRequest`-Regeln.
- Session-Cookies des aktuellen Browserprofils werden bei unterstützten Downloads lokal wiederverwendet.
- Unterstützung für partitionierte Cookies eingebetteter Player, soweit der Browser den Partition-Key für den Frame bereitstellt.
- temporäre Regeln sind auf Requests der StreamForge-Erweiterung und den jeweiligen CDN-Host begrenzt.
- Regeln werden nach Download/Fehler bereinigt; verwaiste StreamForge-Sitzungsregeln werden beim Start entfernt.
- Segmentdownloads verwenden best-effort Cache-Reuse (`force-cache`), danach normalen/frischen Abruf; wegen Chromes Cache-Partitionierung ist die Wiederverwendung des Player-Caches nicht garantiert.
- Manifestrequests verwenden normalen Cache und bei Retries einen frischen Reload.
- direkte Mediendownloads erhalten ebenfalls den temporären Browser-Kontext.
- Popup zeigt **Browser-Kontext ✓**, wenn ein Kontext erfolgreich vorbereitet wurde.
- DOM-Treffer überschreiben nicht mehr versehentlich das reichere Request-Profil eines bereits erkannten Netzwerk-Treffers.

## Datenschutz / Grenzen

- Cookie- und Authorization-Werte werden nicht in Treffer-Storage oder UI gespeichert.
- Authorization-Header werden nicht kopiert.
- kein DRM-/Verschlüsselungs-Bypass.
- keine Erzwingung dauerhaft abgelehnter 401/403-Requests.
