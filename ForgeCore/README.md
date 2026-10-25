# ForgeCore

## ForgeCore v1.6.0 – Discover Downloads (nur Deutsch)

Diese Version integriert die Meilensteine v1.5.2–v1.5.5 auf Basis v1.5.1, ohne die StreamForge-Browser-Extension oder StreamRadar Windows-App zu verändern.

**Deutsch ist Pflicht für Downloads und Jellyfin-Import.** Discover sucht nur auf vom Administrator gespeicherten und aktivierten Websites. Filme sowie Serienfolgen benötigen eindeutige direkte HLS-/DASH-/MP4-Quellen; Serienfolgen müssen nach Staffel und Episodennummer sicher übereinstimmen. Die UI zeigt HLS-/DASH-Sprachkennzeichnung als **Deutsch laut Playlist**. MP4 und nicht etikettierte Medien werden als **unbestätigt** dargestellt und benötigen eine zweite ausdrückliche Zustimmung zur Überprüfung. Quellen, deren Playlist explizit nur andere Audiosprachen enthält, werden mit **„Gibt es noch nicht auf Deutsch“** abgewiesen. Vor Veröffentlichung in Jellyfin überprüft ffprobe die tatsächlichen Mediastream-Tags: Ohne deutsche Audiospur bzw. eindeutigen deutschen Playlist-Sprachnachweis **kein Import**. Nicht prüfbare Sprache bleibt gesperrt; die Prüfung analysiert Kennzeichnungen, nicht die gesprochene Sprache und ist daher keine Garantie der Synchronfassung.

**Download:** Discover-Titel auswählen → Staffel / Episode oder Film → „Deutsche Downloadquelle suchen“ → erkannte direkte Quelle prüfen → Download explizit bestätigen → Transferübersicht. Bereits vorhandene, ignorierte und eingeplante Episoden werden nicht erneut geladen. Externe Player bleiben reine Verweise; keine DRM-Umgehung oder geschützte Hosterstream-Extraktion. Fehlende direkte Quellen lösen keinen Download aus.

**Radar:** Release-Daten von TMDB/TVmaze sind *Originalstarts, keine deutschsprachige Veröffentlichungsbestätigung*. Überwachung ist pro Titel freiwillig. Optional „Deutsche Downloads automatisch“ aktivieren: Regelmäßig wird höchstens eine bereits registrierte, fehlende Folge pro überwachter Serie auf eine eindeutig als Deutsch ausgewiesene direkte Quelle geprüft. Nur bestätigte deutsche Playlist-Sprachen werden automatisch in die Queue aufgenommen. Bei einer Wiederherstellung bleibt die Überwachung samt Automatik deaktiviert. Kein automatisches Hinzufügen nicht verifizierter Episoden.

**ZimaOS:** Backup vor Update erstellen. TMDB-Token weiterhin `FORGECORE_TMDB_TOKEN` ausschließlich lokal in .env setzen. ffmpeg und ffprobe sind im Docker-Image vorhanden. Die SQLite-Migration ist vorwärtskompatibel (Schema 12); Downgrade nur nach Datenbank-Restore. Prüfe auf dem eigenen Server Netzwerkzugriff und Jellyfin-/SMB-Schreibrechte.

---


## ForgeCore v1.5.1 – Discover & Radar (StreamRadar-Integration)

ForgeCore v1.5.1 bündelt die ursprünglich geplanten Meilensteine v1.4.0–v1.4.4 in einer vorwärtskompatiblen Version. Die PlayerBridge und Jellyfin-Fixes des bestehenden v1.5.0-Codes bleiben erhalten; StreamRadar v0.5.3 selbst bleibt unverändert.

**Einrichten:** In der lokalen (nicht einzucheckenden) ForgeCore-.env die neue Zeile FORGECORE_TMDB_TOKEN=... mit dem eigenen TMDB API Read Access Token ergänzen. Diese Zeile kann aus .env.example übernommen werden, ohne die bestehende .env zu überschreiben. Anschließend ForgeCore aktualisieren. Ohne Token wird Discover als unkonfiguriert angezeigt. Das Token wird nicht über die API ausgegeben oder im JSON-Backup gespeichert.

**Discover-Bereich:** TMDB-Top-Trends und Suche, detaillierte Filminfos, Anbieter für AT, eindeutige TVmaze-Serienzuordnung, Jellyfin-Bestand je Titel auf Knopfdruck, SQLite-Merkliste, optionale Radar-Überwachung und Staffel-/Episodenplanung. Überwachungschecks laufen bei aktivierter Konfiguration ungefähr alle sechs Stunden; sie informieren über nachgewiesene kommende Termine im 30-Tage-Fenster. Pro Ereignis gibt es höchstens eine neue Nachricht; nach JSON-Restore bleibt die Überwachung zunächst ausgeschaltet.

**Downloads:** Der TMDB-/TVmaze-Katalog liefert keine Mediendateien. Das Hinzufügen oder Vormerken startet keine Downloads. Zum Laden einer Episode muss separat eine tatsächlich unterstützte und rechtmäßig nutzbare, ungeschützte Downloadquelle in ForgeCore vorhanden sein.

**Auf ZimaOS:** Upgrade erst nach vollständigem Backup. Jellyfin-Identitätszuordnung und SMB-Schreibrechte sowie echte TMDB-/TVmaze-Daten müssen auf dem eigenen Server verifiziert werden. Wegen SQLite-Schema 11 keine Rückkehr zur alten Serverversion mit demselben aktualisierten Datenvolume ohne Restore.

---


## Discover aus StreamRadar – v1.4.0-Funktionsmeilenstein

Der Entwicklungsbranch baut auf dem neueren ForgeCore-v1.5.0-Code auf und ergänzt den geplanten Discover-Meilenstein ohne Versions-Downgrade. StreamRadar v0.5.3 bleibt als Windows-App unabhängig.

- Im Reiter **Discover** erscheinen TMDB-Wochentrends und eine Suche nach Filmen/Serien.
- Die Katalog-API läuft über den angemeldeten ForgeCore-Server. TMDB-Zugangsdaten verlassen den Container nicht.
- **Zur Bibliothek hinzufügen** liest TMDB-Details serverseitig und legt ein Medienprojekt pro externer TMDB-ID an; Duplikate werden erkannt.
- Weder Quellen noch Downloads werden automatisch gestartet.

**Einrichtung:** In der lokalen, nicht eingecheckten .env den Wert FORGECORE_TMDB_TOKEN mit einem persönlichen TMDB API Read Access Token belegen, anschließend den Docker-Compose-Container neu erstellen/starten. Die .env.example enthält absichtlich keinen Schlüssel. Ohne Token wird im Discover-Reiter ein Hinweis gezeigt. Ein lokal in StreamRadar gespeicherter Windows-Token wird aus Sicherheitsgründen nicht automatisch übernommen.

**Geplante Folgeschritte:** TMDB-Detailseiten, TVmaze-Episodentermine, Kalender, Merkliste, Überwachung und Jellyfin-Vergleich auf Discover-Karten. Die Wochentrends sind noch kein Release-Kalender. Downloads aus Discover folgen erst, wenn eine berechtigte, unterstützte Quell-URL vorliegt und der Benutzer sie freigibt.

**Prüfstand:** Unit- und API-Regressionstests liegen im Branch; ein vollständiger Node-Testlauf, CI-Abnahme und ein ZimaOS-/TMDB-Live-Test sind noch offen.

---


## v1.5.0 – PlayerBridge und Downloadaktionen in der Liste

- PlayerBridge erkennt HTML-`iframe`- und Player-Links auf gespeicherten Websites und zeigt die externen Player getrennt von direkt unterstützten MP4-/M4V-/HLS-/DASH-Dateien. Externe Player werden **nicht** automatisch ausgelesen; es gibt keinen DRM-, Login-, Captcha- oder Hoster-Bypass.
- Bei Film- und Episodentreffern steht **Player prüfen** bereit; der Abruf bleibt auf die zuvor gespeicherte Quellwebsite begrenzt.
- Bei nachweislich direkten Mediendateilinks steht **Download auswählen** zur Verfügung. Der Nutzer ordnet den Link einem Medienprojekt und bei Serien einer bestimmten Episode zu, bestätigt die Aktion und fügt den Auftrag über die bereits vorhandene Warteschlange hinzu. Vorhandene als `available`/`ignored` markierte Episoden werden blockiert.
- Lange Episodenlisten werden erst nach dem Öffnen ihrer Staffel dargestellt; Cloudflare-DNS bleibt in der Compose-Datei.
- Kein Download allein aus einer externen Wiedergabeseite. Anbieter müssen eine rechtmäßig nutzbare ungeschützte Medienadresse bereitstellen. ZimaOS-Echtbetrieb muss getestet werden.


## V1.5.0 – Umfangreiche Serienkataloge

- Quellseitige Episodenobergrenze von 200 auf 2.500 erweitert; bis zu 40 explizit verlinkte Staffelseiten (inkl. Staffel 0) können berücksichtigt werden.
- Episodenansicht lädt Staffellisten erst beim Öffnen; große Serien bleiben bedienbar.
- Vergleichs- und Serienübersicht-Antworten erlauben maximal 2.500 übergebene Episoden bei begrenztem Request-Body von 512 KiB.
- Specials werden nur dann als Quellenepisoden ausgewiesen, wenn Staffel 0 und ihre Episoden ausdrücklich aus den Seiten hervorgehen; ansonsten Status „nicht nachgewiesen“. Kein automatisches Erfinden fehlender Folgen.
- Jellyfin-Serieninventar kann bis zu 20 Seiten mit je 200 Einträgen für die identifizierte Serie lesen. DNS-Konfiguration unverändert enthalten.


## V1.5.0 – Jellyfin-Vergleich wiederhergestellt

Die per-Serien-ID abgesicherte Jellyfin-Episodenabfrage hat nun eine begrenzte Ersatzabfrage, wenn Jellyfin `ParentId` nicht unterstützt oder für eine Serie keine Kindfolgen zurückliefert. Der Ersatzweg lässt ausschließlich Episoden mit eindeutig übereinstimmender `SeriesId` zu. Specials bleiben standardmäßig ausgeblendet, und weder Medien noch Status werden verändert. Regressionstests prüfen HTTP 400 und leere Kindfolgen-Antworten.


## v1.5.0 – Seriengenauer Jellyfin-Abgleich

Die Vorschau löst nun die konkrete Jellyfin-Serie anhand ihres Jellyfin-Serienobjekts auf und ruft ausschließlich dessen Episoden ab. Jede Folge muss dieselbe `SeriesId` tragen. Dadurch werden Einträge anderer Serien verworfen und spätere Staffeln nicht durch die 1.000-Element-Grenze der gesamten Bibliothek verdrängt. Staffel 0/Specials ist in der Serienübersicht standardmäßig ausgeblendet und wird beim Projektimport nicht übernommen. Die Vorschau meldet, wie viele Specials der tatsächlich zugeordneten Serie ausgeblendet wurden; vorhandene ForgeCore-Status und Jellyfin-Dateien bleiben unberührt.


## v1.5.0 – Staffel-Navigation

Bei Katalog-Titeln werden bis zu 20 ausdrücklich verlinkte Staffelseiten derselben Website separat gelesen. Die Episoden werden zusammengeführt und doppelte Einträge entfernt. Staffel 0 wird getrennt als Specials angezeigt. Die Oberfläche zeigt die Anzahl der geprüften Seiten und Quellenepisoden pro Staffel. Bei dynamischen Staffelinhalten ohne sichtbare Links ist noch ein weiterer Adapter nötig; keine Downloads oder Jellyfin-Änderungen.


## v1.5.0 – Gemeinsame Serienübersicht und Jellyfin-Import

- Vereinte, nach Staffel sortierte Episodenansicht aus Quelle, Jellyfin und bestehenden ForgeCore-Einträgen. Fortschritt bezieht sich ausdrücklich nur auf den bekannten Ausschnitt und ist **keine Vollständigkeitsgarantie**.
- Manuelle Übernahme der in Jellyfin tatsächlich vorhandenen Episoden in ForgeCore mit expliziter Bestätigung. Vorhandene Projekte und Episodenstatus bleiben erhalten; keine Jellyfin-Dateien werden geändert.
- Keine neue Datenbankmigration und keine automatischen Downloads. Maximal 1.000 Jellyfin-Episoden werden abgefragt.
- Cloudflare DNS bleibt in der Compose-Datei enthalten.


## v1.5.0 – Staffel- und Episodenvorschau (Prerelease)

Aus Katalogtreffern lassen sich unterstützte Staffel- und Episoden-URLs inspizieren. Nur eindeutige Nummern in URL-Pfaden werden als Episoden erkannt; dies ist **keine vollständige Staffeldatenbank**. Bekannte ForgeCore-Episodenstatus werden lesend angezeigt. Auf ausdrücklichen Klick kann die Anzeige mit höchstens 1.000 Jellyfin-Episoden verglichen werden. Es werden weder Jellyfin-Dateien noch ForgeCore-Status geändert. Eine fehlende Folge in dieser Vorschau beweist nicht, dass die Folge nicht existiert. Cloudflare-DNS bleibt in der Compose-YAML enthalten.


## v1.5.0 – Verbesserte Katalogsuche

- Kommentar-, Forums-, Support- und Hilfeseiten werden nicht mehr als Serientreffer angezeigt.
- HTML-Zeichen werden entschlüsselt; alternative Titel bleiben separat und Ergebnisse werden nach Titelnähe sortiert.
- Treffer derselben Serie werden in der Weboberfläche gruppiert, einzelne Website-Links bleiben erhalten.
- Aufklappbare Detailansicht zeigt verfügbare Katalogdaten (Titel, Alternativtitel, Jahr sofern auslesbar, Quellen). Keine vollständige Staffel- oder Episodenliste.
- Keine neue Datenbankmigration; keine Downloads oder Sicherheitsausnahmen.


## V1.5.0 – Titelsuche und Katalogerkennung

Die Website-Suche meldet jetzt auch Titel- und Detailseiten als **Katalogtreffer**, wenn noch kein direkter Medienlink vorliegt. Auf bis zu fünf passenden Detailseiten werden vorhandene Medienlinks analysiert; die Ergebnisliste kennzeichnet Katalogtreffer getrennt von Medienlinks. Eine pro Website hinterlegte Suchadresse mit `{query}` ist für Seiten mit eigener Suche entscheidend. Keine universelle Volltextsuche, keine Umgehung von Schutzmaßnahmen und keine automatische Warteschlangenaktion. Weitere Website-spezifische Adapter werden später benötigt.



## V1.5.0 – Netzwerkfix für Website-Suche

Korrigiert die DNS-Pinning-Callback-Antwort für Node.js 22, wenn HTTP `lookup` mit `all:true` aufruft. Der Fehler `Invalid IP address: undefined` ist damit behoben, während SSRF-Abwehr, IP-Pinning und Redirect-Neuprüfung erhalten bleiben. Websites können unabhängig davon Such-URLs/Strukturänderungen oder Schutzmaßnahmen haben. Paket bleibt ein Prerelease bis zum Praxistest auf ZimaOS.


## ForgeCore v1.1.0 – Phase 9 Source Automation (Testversion)

Die neue **Website-Suche** unter Bibliothek erlaubt das Speichern unterstützter Websites, das Konfigurieren einer optionalen Suchadresse wie `https://example.org/search?q={query}`, das automatische Durchsuchen von passenden Titelseiten und das Anzeigen der direkt erkannten Mediendateien. Die Suche verwendet ausschließlich unterstützte HTML-Links, fragt keine Logins ab und startet keine Downloads automatisch. Suche und Dateiexport sind weiterhin getrennt.

**Auf ZimaOS testen:** Vor dem Upgrade `sudo bash manage.sh doctor` und `sudo bash manage.sh backup` ausführen, danach die v1.1.0-Paketdateien in dein bestehendes ForgeCore-Verzeichnis übernehmen, die bestehende `.env` und Datenvolumes beibehalten und `sudo bash manage.sh update` ausführen. Kein Rollback auf v1.0.0 ohne Wiederherstellung der vorherigen Datenbanksicherung (Schema 10).


**ForgeCore v1.0.0 – Phase 8 Releasekandidat (Hardware-Abnahme ausstehend).** Eigenständiger Docker-/ZimaOS-Server. Die beigefügte Browser-Erweiterung in `browser-extension/` wurde bewusst auf **StreamForge 1.8.11** aktualisiert.

> **Abnahmestand:** Automatisierte Node-/HTTP-/Docker-Tests und lokaler HLS/FFmpeg-Medientest sind durchgeführt. **Reale Websites, lange Serienläufe, ZimaOS-Mounts und SMB-Speicherpfade sind noch nicht auf deiner Hardware getestet.** Die App unterstützt ausdrücklich nur ausgewählte unverschlüsselte Formate, nicht jede Streaming-Website.

## Phase 8 – v1.0.0: Releasekandidat und Abnahme

Die Version **1.0.0** bündelt die bisher entwickelten Kernfunktionen und zusätzliche Release-Sicherheitsprüfungen. **Auf echtem ZimaOS ist sie noch nicht freigegeben**; GitHub kennzeichnet das Paket bis zur erfolgreich dokumentierten Hardware-Abnahme ausdrücklich als **Prerelease**.

- Sicherer Restore: Beim vollständigen Volume-Backup wird eine SHA-256-Prüfsumme erstellt. Beim Rollback werden die Prüfsumme, das vorherige Docker-Image und die Identität des aktuellen ForgeCore-Datenvolumes geprüft, **bevor** Daten ersetzt werden.
- Automatisierte Tests für v1-Versionierung, Zugangsschutz, geschützte System-API, JSON-Backup/Restore, SQLite-Persistenz, große Testbibliothek, Upgrade- und Fehler-Rollback-Simulation.
- Die Browserkopie wurde als separate, bewusste Integrationsänderung auf **StreamForge 1.8.11** aktualisiert; die ForgeCore-Serverversion bleibt v1.0.0.
- Die vollständige Abnahmeliste steht in [ACCEPTANCE-v1.0.0.md](./ACCEPTANCE-v1.0.0.md). Insbesondere SMB-Schreibrechte, echte Medienwiedergabe, mehrtägiger Dauerbetrieb und Ausfall-/Restore-Szenarien sind noch nicht auf deiner Hardware durchgeführt.

**Upgrade:** Vor der Verwendung immer zusätzlich eine Sicherung außerhalb von ForgeCore anlegen. `bash manage.sh doctor`, `bash manage.sh backup` und anschließend `bash manage.sh update` verwenden. Die Restore-Funktion rollt die interne Datenbank auf den Backup-Zeitpunkt zurück; bereits nach außen geschriebene Jellyfin-Dateien bleiben bestehen.

## Phase 7 – v0.9.9 (automatisiert getestete Beta-Vorschau)

Diese Version bündelt die geplanten Stabilisierungsarbeiten aus **v0.6.x–v0.9.x** in einem Entwicklungsstand. Sie ist **kein** Versprechen, dass alle ZimaOS-spezifischen Anforderungen oder der Dauerbetrieb schon abgenommen wurden.

### Funktionen

- **Host-Verwaltung:** `manage.sh` unterstützt `doctor`, `install`, `backup`, `update`, `rollback BACKUP` und `status`. Vor der Installation werden Docker, Compose, der konfigurierte Jellyfin-Medienpfad und Basis-Schreibrechte geprüft.
- **Konsistente Sicherungen:** Für eine Volume-Sicherung wird der ForgeCore-Container gestoppt; das komplette `/data`-Volume wird als `data.tar.gz` in `ForgeCore/backups/` abgelegt. Enthält SQLite (inklusive Accounts und Jellyfin-Schlüssel), Downloads und Transfercache; Backupverzeichnis erhält restriktive Dateirechte.
- **Update mit Healthcheck:** Das neue Docker-Image wird zunächst gebaut. Der laufende Dienst wird anschließend angehalten, das Datenvolume gesichert und der neue Container gestartet. Falls er nicht gesund wird, versucht `manage.sh` das vorherige Image und dessen Daten automatisch wiederherzustellen.
- **Expliziter Rollback:** Mit `manage.sh rollback backups/backup-...` kann bei vorhandenem alten Docker-Image zur vorherigen Datenversion zurückgekehrt werden. **Ein Rollback setzt Daten und Queue-Zustände zurück, die nach der Sicherung entstanden sind. Jellyfin-Mediendateien werden nicht rückgängig gemacht** – vor einem Rollback laufende Exporte unbedingt prüfen.
- **Betriebsdiagnose:** Neue authentifizierte Endpunkte `GET /api/operations` und `GET /api/operations/errors`: DB-`quick_check`, Dateisystem-/Speicherplatzstatus, RSS/RAM, Uptime, Medienbibliothek, Queue-Größen und gekürzte Fehlerübersicht. In der Weboberfläche erscheint dafür ein eigener Reiter **System**.
- **Bedienung & Zugänglichkeit:** Responsive Systemübersicht mit besserer Fokusanzeige, verständlichen Hinweisen zu Volume-Problemen und schreibgeschützten Systemwerten.
- **Tests:** Simulierte Docker-Befehle für den Sicherungs-/Rollback-Pfad, Datenbankpersistenz mit 1.200 Testprojekten, Syntax-/Unit-/Integrationsprüfungen und Docker-CI.

### Ausführung auf ZimaOS

```bash
cd ForgeCore
# Erstinstallation:
cp .env.example .env  # nur wenn noch keine .env besteht!
# FORGECORE_MEDIA_HOST_PATH in .env auf den tatsächlichen Pfad setzen
bash manage.sh doctor
bash manage.sh install

# Späteres Upgrade, zuvor zusätzlich extern sichern:
bash manage.sh update

# Manuelle Sicherung:
bash manage.sh backup

# Manuelles Zurückrollen nach einem Update:
bash manage.sh rollback backups/backup-YYYYMMDDTHHMMSSZ-PID
```

**Wichtige Sicherheitsgrenzen:**

- Verwende die App standardmäßig nur über `127.0.0.1:8787`. Für Fernzugriff benötigt sie einen HTTPS-Reverse-Proxy, sichere Cookies und zusätzliche Zugriffskontrollen; den Port nicht einfach ins Internet freigeben.
- Die Host-Prüfung kann nicht garantieren, dass der **Containerbenutzer** auf ZimaOS/SMB tatsächlich schreiben darf. Das wird erst im Hardwaretest geprüft.
- Sicherungen enthalten **vollständige Zugangsdaten und API-Schlüssel**. Niemals veröffentlichen oder in Git einchecken. `.gitignore` ignoriert `.env`, Datenbanken und Backup-Verzeichnis.
- Der automatische Rollback wurde mit einem **simulierten** Docker-Befehlsablauf geprüft; reale ZimaOS-Docker-Volumes, unterbrochene Upgrades, Netzwerklaufwerke und Restore von großen Dateien müssen vor dem stabilen Release getestet werden.
- Bei einem fatalen Fehler während der Erstellung des Backups wird versucht, den alten Container wieder zu starten. Wenn Docker selbst unbrauchbar ist, ist manuelle Intervention nötig. Vor kritischen Updates zusätzlich externe Sicherung anlegen.
- Das Paket bleibt **Beta**; ein finales `v1.0.0` setzt echte Abnahme inklusive Langzeitbetrieb, Update/Restore, API-/Streaming-Kompatibilität und Sicherheit voraus.

## Phase 6 – v0.5.9 (automatisiert getestete Alpha)

- **Jellyfin direkt verbinden:** Unter Einstellungen → Jellyfin eine Jellyfin-Serverbasis (z. B. `http://192.168.1.10:8096/`) und einen vom Jellyfin-Administrator erstellten API-Schlüssel eintragen.
- **Verbindungstest:** Der Test liest `/System/Info` und zeigt Jellyfin-Servername und Version. Ohne hinterlegte Zugangsdaten bleibt die Integration deaktiviert.
- **Bibliotheksaktualisierung:** Ein Button fordert Jellyfin über `POST /Library/Refresh` zur Bibliotheksaktualisierung auf. Optional lässt sich dies nach erfolgreich abgelegten Medien automatisch auslösen; Fehler beim Refresh lassen erfolgreiche Downloads nicht scheitern.
- **Nicht-destruktiver Episodenabgleich:** Ein manuell angestoßener Inventarvergleich liest höchstens 1.000 Jellyfin-Episoden (paginierte API). Titel und Staffel-/Episodennummer werden konservativ mit ForgeCore-Projekten abgeglichen. Zunächst nur Vorschau; erst nach ausdrücklicher Bestätigung werden passende ForgeCore-Episoden von `missing` auf `available` gesetzt. Keine Dateien werden gelöscht, `ignored` wird nicht verändert und nicht gefundene Episoden bleiben unverändert.
- **Quellenadapter:** Für jede hinzugefügte Quelle steht die Wahl zwischen `auto`, den eingebauten HLS-/DASH-/HTML-Link-Adaptern und dem neuen **HTML-data-season/data-episode-Adapter** zur Verfügung. Ein Adapter wird manuell ausgewählt; periodische Quellenprüfungen berücksichtigen die Auswahl. Externen ausführbaren Plugin-Code laden wir bewusst nicht automatisch.
- **Schutz sensibler Daten:** Der Jellyfin-API-Schlüssel wird nur für authentifizierte Serveraufrufe gespeichert. Er erscheint weder in `/api/jellyfin` noch im Konfigurationsabruf oder JSON-Backup. Das vollständige SQLite-Backup **enthält** den Schlüssel und ist vertraulich aufzubewahren.
- **Schema-Migration:** SQLite-Version 8 ergänzt Quellenadapter-Einstellungen und Jellyfin-Synchronisierungshistorie. Ein Downgrade auf v0.4.9 mit aktualisiertem Datenvolume wird nicht unterstützt.

### Phase-6-API-Endpunkte

| Endpoint | Funktion |
| --- | --- |
| `GET/PUT /api/jellyfin` | Status (ohne Schlüssel) bzw. API-Verbindung konfigurieren |
| `POST /api/jellyfin/test` | Verbindung prüfen |
| `POST /api/jellyfin/refresh` | Jellyfin-Bibliothek aktualisieren |
| `POST /api/jellyfin/sync/preview` | Fehlende/vorhandene Episoden ohne Änderung vergleichen |
| `POST /api/jellyfin/sync/apply` | Mit `{"confirm":"MARK_AVAILABLE"}` konservative Statusänderungen übernehmen |
| `GET /api/jellyfin/sync/history` | Die letzten 20 Abgleiche |
| `GET /api/source-adapters` | Verfügbare vertrauenswürdige integrierte Adapter |
| `PATCH /api/sources/:id` | Mit `{"adapterId":"html-episode-data"}` Quelladapter festlegen |

**Abnahmegrenzen:** Die direkte API muss später an deiner konkreten Jellyfin-Version und Bibliothek praktisch getestet werden. Der Abgleich verwendet verfügbare `SeriesName`-, `ParentIndexNumber`- und `IndexNumber`-Felder und kann bei abweichenden Jellyfin-Metadaten Treffer übersehen. Eine automatische bidirektionale Jellyfin-Synchronisierung oder dynamisch gerenderte Webseiten werden nicht behauptet. Nur eigene rechtmäßig zugängliche, ungeschützte Medienquellen verwenden.

## Phase 5 – v0.4.9 (automatisiert getestete Alpha)

- **Opt-in-Quellenüberwachung pro Serie:** In der Medienbibliothek bei einer Quelle den Bereich „Automatische Quellenprüfung“ öffnen. Standardmäßig ist jede Automatisierung **deaktiviert**.
- **Prüfintervalle:** 30–10080 Minuten (bis 7 Tage). Prüfungen laufen im ForgeCore-Docker-Server ohne dauerhaft geöffneten Browser. Die nächste Prüfung und Fehler werden in SQLite gespeichert und überleben Neustarts.
- **Neue Episoden:** Der bestehende HTML-Link-Adapter liest Links zu unterstützten HLS-/DASH-/MP4-Medien mit erkennbarer Staffel-/Episodennummer. Neue Episoden werden auf Wunsch in die Film-/Serien-Datenbank übernommen.
- **Automatische Downloads als separate Zustimmung:** `autoQueue` kann pro Quelle aktiviert werden. Dann werden nur noch fehlende Episoden in einer begrenzten Zahl je Prüfung (1–50) in die bestehende Download-Queue übernommen. Vorhandene oder ignorierte Episoden werden nicht automatisch geladen.
- **Sicherheit und Kontrolle:** Quellen müssen ausdrücklich angelegt und aktiviert sein. Keine DRM- oder Zugangsbeschränkungsumgehung, kein Login- oder Javascript-Crawler. Die Website-Abfrage nutzt die bestehenden URL-/SSRF-Schutzmechanismen.
- **Fehlerverhalten:** Änderungen an einer Quellseite oder eine leere Episode-Liste führen zu einem dokumentierten Fehler, **ohne** bereits gefundene Episoden zu löschen. Rückfallintervall mit begrenztem Backoff, Prüfverlauf und Benachrichtigungen.
- **Backup:** Quellenautomatisierungsregeln werden im JSON-Export mitgesichert. Bei einem JSON-Restore werden sie absichtlich **deaktiviert** wiederhergestellt, damit keine unbeabsichtigten Downloads beginnen. Ein vollständiger SQLite-Datenbanksnapshot bewahrt den exakten Zustand und muss vertraulich behandelt werden.

### Neue API-Endpunkte

| Endpunkt | Aufgabe |
| --- | --- |
| `GET /api/automation/sources` | Alle konfigurierten Quellenprüfungen |
| `GET /api/sources/:id/automation` | Quelle und ihre Prüfregeln |
| `PUT /api/sources/:id/automation` | Prüfregeln anpassen; CSRF und Login erforderlich |
| `POST /api/sources/:id/automation/check` | Einmalige manuelle Prüfung |
| `GET /api/sources/:id/automation/history` | Letzte 60 Prüfungen / Fehler anzeigen |

Die Einstellungen `enabled`, `autoQueue`, `autoAddEpisodes`, `intervalMinutes` und `maxPerCheck` sind voneinander getrennt; `autoQueue` benötigt `autoAddEpisodes`. Quelle und zugelassene Episoden bleiben an die eigene Medienbibliothek gebunden.

**Grenzen:** Es werden derzeit **nur HTML-Seiten mit direkt auffindbaren, benannten Medienlinks** für automatische Episodenerkennung unterstützt. JavaScript-basierte Player, wechselnde Seitenlayouts, komplexe Anbieteradapter, nur innerhalb von Skripten vorhandene Links oder nicht passende Dateinamen können nicht zuverlässig erkannt werden. Die Anwendung erkennt keine Episoden aus einem bloßen Staffelverzeichnis ohne passende URLs. Echte Websites und ZimaOS/SMB-Mounts sind vor Freigabe für den Dauerbetrieb noch praktisch zu testen. Ein fehlgeschlagener Check darf die Bibliothek nicht beschädigen, ersetzt aber keine geprüfte Medienquelle.

## Phase 4 – v0.3.9 (automatisiert getestete Alpha)

- **Segment-Recovery:** HLS-/DASH-Abschnitte werden auf dem persistenten `/data`-Volume als vollständige, SHA-256-geprüfte Segmente gespeichert. Bei Wiederholung derselben Quelle/Segmentliste werden geprüfte vollständige Segmente wiederverwendet; defekte oder halbfertige Segmente werden neu geladen. Die Datei wird vor der Medienablage neu zusammengesetzt.
- **Begrenzte automatische Retries:** Vorübergehende Netzwerkfehler bekommen exponentielle Wartezeiten und höchstens die in den Zeitplaneinstellungen festgelegte Anzahl Wiederholungen (Standard 3). Berechtigungs-, Format- und Codecfehler werden nicht blind wiederholt.
- **Muxing- und Ausgabeprüfung:** FFmpeg remuxt unterstützte Videospuren und FFprobe validiert bei realen Downloads anschließend mindestens eine nutzbare Videospur und eine Laufzeit vor dem endgültigen Export. Defekte Dateien werden nicht in die Jellyfin-Bibliothek übernommen.
- **HLS-Audiosprache:** Master-Playlists mit `EXT-X-MEDIA:TYPE=AUDIO` werden für die bevorzugte Sprache ausgewertet; eine separate, unverschlüsselte Audio-Playlist kann als zweite Eingabe in FFmpeg eingemuxt werden. Keine Garantie für alle Codecs, Gruppierungen oder komplexen Streams.
- **Vollständiges SQLite-Backup:** `GET /api/backup/database` erstellt einen konsistenten Datenbanksnapshot samt Admin-Accounts, Quellen, Episoden, Transferstatus und Ereignisverlauf. In der Weboberfläche gibt es einen eigenen Downloadknopf. **Die Sicherung enthält Passwort-Hashes und ist vertraulich.**
- **Transfer-Ereignisse:** Status, automatische Wartezeiten, Retries und Abschlüsse sind über `GET /api/transfers/:id/events` und im Dashboard einsehbar.
- **Cache-Lebenszyklus:** Erfolgreiche Downloads räumen den Cache auf. Verwaiste, abgeschlossene/fehlgeschlagene Caches können nach sieben Tagen beim Start entfernt werden; ausstehende Jobs behalten ihre Dateien.

**Wichtig:** Dies ist die Phase-4-Alpha, nicht die vollständige Abnahme aller Stabilitätsziele. Eine unterbrochene laufende Segmentübertragung wird erneut von Beginn des Segments geladen (keine HTTP-Range-/Byte-Resume-Funktion). Nicht unterstützte HLS/DASH-Typen, DRM und komplexe Mehrspur-Container bleiben eingeschränkt. Echte ZimaOS-/SMB-Schreibtests, Langzeitdownloads, Medien-Wiedergabeprüfungen mit verschiedenen Codecs und Recovery unter Stromausfall müssen noch stattfinden.

### Datensicherheit beim Upgrade von v0.2.9

Vor dem ersten Start von v0.3.9 ein vollständiges SQLite-Backup erstellen und die `forgecore-data`-Volume sichern. Die Migration erweitert die Datenbank auf Schema 6; ein **Downgrade auf v0.2.9 mit der aktualisierten SQLite-Datei wird nicht unterstützt**. Für Rollback den vorherigen Code **und** die zugehörige Datenvolume-Sicherung wiederherstellen.

Nach einem Fehler kann der Segmentcache erheblichen Speicherplatz benötigen (bis zur konfigurierten Medienobergrenze). Die Datenvolume braucht daher ausreichend freien Platz. Ein SQLite-Backup kann nur bei gestopptem ForgeCore-Container sicher direkt als `/data/forgecore.sqlite` eingespielt werden; dabei unbedingt auch die zugehörigen WAL-/SHM-Dateien beziehungsweise eine vollständige Volume-Sicherung berücksichtigen.

## Neu in Phase 3 (v0.2.0–v0.2.9)

- **Film-/Serienassistent:** Titel, Typ und Quelle in einem Ablauf eingeben; unterstützte Quell-Links analysieren, Episoden übernehmen und fehlende Folgen vor dem Start anzeigen.
- **Quellenbewertung:** vorhandene Quellen nach technischen Merkmalen und Episodenabdeckung sortieren. Das ist **keine** garantierte Qualitäts-, Geschwindigkeits- oder Verfügbarkeitsmessung.
- **Zeitplan & Geschwindigkeitsbegrenzung:** Downloads starten nur innerhalb der konfigurierten Wochentage/Stunden; optionale Transfer-Obergrenze in KiB/s. Die Container-Zeitzone wird über `FORGECORE_TIMEZONE` gesetzt. Bestehende Transfers laufen nach Ablauf eines Zeitfensters weiter.
- **Externe WebVTT-Untertitel:** WebVTT zu `.de.srt` oder anderen Sprachcodes für **bereits existierende** Filme und Episoden speichern. Bestehende Untertitel nicht überschreiben.
- **Benachrichtigungen & Diagnose:** Status zu erfolgreichen/fehlgeschlagenen Downloads sowie Untertitelimporten; persistente, als gelesen markierbare Einträge und eine einfache Systemübersicht.
- **ZimaOS-Installer:** `./install.sh` für vorgeprüftes Docker-Compose-Deployment mit Medienpfad-Kontrolle. Keine native ZimaOS-App-Store-Paketierung.
- **Datenhaltung:** SQLite-Migration von v0.1.9 auf v0.2.9; Zeitplan-Einstellungen werden im JSON-Backup berücksichtigt.
- **Alpha-/Beta-Tests:** Unit- und Integrationstests für Planer, Zeitfenster, Quellenvorschau, VTT-Konvertierung, Sessions und HTTP-API sowie Container-Smoke-Tests.

**Noch ausstehend bzw. eingeschränkt:** automatische periodische Website-Prüfung, erweiterte Audio-Track-Umschaltung, universelle Adapter für dynamische Websites, native ZimaOS-Store-Installation, bedienbarer Rollback-Assistent und echte Lasttests großer Bibliotheken. Der Versionstitel **v0.2.9** bezeichnet den gemeinsamen Entwicklungsstand, nicht die abgeschlossene Abnahme aller ursprünglichen Phase-3-Ziele.

### Installer und Backup vor dem Upgrade

```bash
cd ForgeCore
cp .env.example .env  # nur beim ersten Mal; bei Updates die bestehende .env behalten
# In .env: FORGECORE_MEDIA_HOST_PATH auf dein echtes schreibbares Jellyfin-Volume setzen
chmod +x install.sh
./install.sh
```

Vor einem Upgrade **`GET /api/backup/export`** in der Weboberfläche verwenden und das Docker-Datenvolume separat sichern. SQLite-Datenmigrationen werden beim Start automatisch ausgeführt; ein Downgrade auf v0.1.9 mit demselben aktualisierten Datenvolume ist **nicht unterstützt**. Für ein Rollback wird ein zu v0.1.9 passendes Volume-Backup benötigt. Keinesfalls `docker compose down -v` verwenden.

## Neu in Phase 2 (v0.1.0–v0.1.9)

- Quellen-URLs für Filme/Serien im Dashboard speichern, entfernen und analysieren.
- Sicherheitsgeprüfte HTTP(S)-Abrufe mit Prüfung öffentlicher Ziel-IP-Adressen, DNS-Pinning, Redirect-Überprüfung, Zeit-/Größenlimits und ohne Browser-Cookies.
- Eingebaute Adapter für statische HTML-Links zu Manifesten/MP4, unverschlüsselte **HLS-VOD-Playlists** und **DASH-VOD mit expliziter SegmentList**.
- Episoden anhand von `S02E08` oder vergleichbaren Namensmustern entdecken und kontrolliert importieren; neue Serienaufträge einzeln oder als Batch planen.
- SQLite-persistente Download-Warteschlange mit Fortschrittsstatus, sequentieller Verarbeitung, Abbruch und Retry sowie Neustart-Wiederherstellung.
- Segmentweiser Streaming-Transfer auf das persistente Datenvolume; lokale **FFmpeg-Remux-Verarbeitung ohne Codec-Neukodierung**.
- Jellyfin-konformer MP4-Export in `Movies/Titel (Jahr)` oder `Shows/Serie/Season NN`, einschließlich existierender `Staffel N`-Ordner. Ziel-Dateien werden nicht automatisch überschrieben.
- Sicherheitsprüfung der MP4-Signatur, temporäre Übertragungsdateien und Dateiabschluss ohne Überschreiben; Quellen und entdeckte Episoden im JSON-Backup.
- **Keine** DRM-Umgehung, kein automatisches Login/Captcha-Bypass, keine unbeaufsichtigte Websuche jenseits explizit eingetragener Quellen.

**Formatgrenzen:** HLS mit separaten Audio-Playlists, AES-/DRM-geschützte oder Live-Playlists, HLS-Discontinuities und alle DASH-Manifestvarianten außer expliziten `SegmentList`-Profilen werden nicht verarbeitet. Automatische Quellenadapter je beliebiger Streaming-Website sind noch nicht realisiert. Manche Container/Codecs können von FFmpeg nicht verlustfrei in MP4 remuxt werden; der Auftrag schlägt dann nachvollziehbar fehl.

**Sicherheitsrelevant für ZimaOS:** Die Medienfreigabe wird in Phase 2 erstmals **schreibbar** als `/media` gemountet. Verwende einen bewusst freigegebenen Medienpfad und sichere deine Jellyfin-Bibliothek vorher. ForgeCore läuft standardmäßig nur auf `127.0.0.1:8787` und benötigt eine Administratoranmeldung.

## Umfang Phase 1 (v0.0.1–v0.0.9)

- Docker-Dienst mit **dauerhaftem SQLite-Speicher**, versionierten Migrationen und Neustartwiederherstellung wartender Jobs.
- Einrichtung mit **Adminpasswort**, scrypt-basiertem Passwort-Hash, HttpOnly-Sessioncookie, SameSite=Strict, CSRF-Schutz, origin-geprüften Mutationen und Login-Rate-Limits.
- Responsive, deutschsprachige Weboberfläche für Filme, Serien, Staffeln und Episoden, mit Statuspflege, Metadatenfeldern und Metadatenprüfung (lokal, keine Provider-Abfrage).
- **Jellyfin-konforme Vorschau und Read-only-Bibliotheksscan** für `Movies/Titel (Jahr)` und `Shows/Serie/Season NN/Serie SNNENN`. Auch vorhandene `Staffel 2`-Ordner werden erkannt.
- Persistente Hintergrundaufgaben, Retry, Abbruch wartender Jobs und übersichtliche Jobhistorie.
- Sicherung und Wiederherstellung der Film-/Serienprojekte, Episoden und Einstellungen als JSON. **Passwörter und Sessions werden ausdrücklich nicht exportiert.** Wiederherstellung überschreibt bestehende Projekte erst nach expliziter Bestätigung.
- Docker Compose mit **für die Medienablage schreibbarem Medienvolume**, begrenzten Ressourcen, lokalem Port und persistentem Datenvolume.

## Docker / ZimaOS starten

Benötigt Docker Compose v2. Öffne auf dem ZimaOS-Host das Verzeichnis `ForgeCore/` und führe aus:

```bash
cp .env.example .env
# .env bearbeiten und FORGECORE_MEDIA_HOST_PATH auf dein echtes Medienverzeichnis setzen.
docker compose up -d --build
curl http://127.0.0.1:8787/api/health
```

Standardmäßig ist das Web-Dashboard **nur auf dem ZimaOS-Host unter `127.0.0.1:8787`** erreichbar. Für einen sicheren Remote-Zugriff in deinem Heimnetz verwende vorzugsweise einen authentifizierten HTTPS-Reverse-Proxy oder ein VPN; Portfreigabe ins Internet ist nicht vorgesehen. Erstpasswort bei der Einrichtung setzen, **bevor** du die Oberfläche im Netzwerk verfügbar machst. Das Container-Medienvolume ist ab Phase 2 **schreibbar**. Bestehende Mediendateien werden nicht absichtlich überschrieben. Bitte vorher Backup und tatsächlich verfügbare ZimaOS-Schreibrechte prüfen.

In `compose.yaml` lässt sich die Bind-Adresse nur bewusst über `FORGECORE_BIND_ADDRESS` verändern. Bei einem HTTPS-Reverse-Proxy kann `FORGECORE_SECURE_COOKIE=1` für Secure-Cookies gesetzt werden, **nur** wenn dein Proxy auch wirklich HTTPS bereitstellt.

Zum Stoppen: `docker compose down`. Die SQLite-Daten bleiben im benannten Volume `forgecore-data` erhalten. **Nicht** `docker compose down -v` verwenden, wenn du Daten behalten möchtest.

### Lokale Entwicklung

```bash
cd ForgeCore/server
npm test
npm run check
npm start
```

Node.js 22.13+ wird benötigt (`node:sqlite` ist in Node 22 noch experimentell). Die Tests nutzen eine temporäre SQLite-Datenbank und lokale HTTP-Requests.

### API (Auswahl)

| Endpoint | Zweck |
| --- | --- |
| `GET /api/health` | Gesundheitsprüfung |
| `GET /api/status` | Version / tatsächliche Fähigkeiten |
| `POST /api/setup` | Einmalige Administrator-Einrichtung |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` | Anmeldung / Sitzung |
| `GET/POST /api/media`, `GET/PATCH/DELETE /api/media/:id` | Medienprojekte |
| `GET/POST /api/media/:id/episodes`, `PATCH/DELETE /api/episodes/:id` | Episoden |
| `GET /api/media/:id/preview` | Jellyfin-Dateien nur lesend erkennen |
| `GET/POST /api/media/:id/sources` | Film-/Serienquellen verwalten |
| `POST /api/sources/:id/analyze`, `GET /api/sources/:id/items` | Quelle analysieren, entdeckte URLs anzeigen |
| `POST /api/sources/:id/import-episodes` | Erkannte Episoden kontrolliert importieren |
| `GET/POST /api/transfers`, `POST /api/transfers/batch` | Medien-Downloads einzeln oder als Serien-Batch planen |
| `POST /api/transfers/:id/cancel`, `POST /api/transfers/:id/retry` | Downloads abbrechen / erneut versuchen |
| `GET/PUT /api/config` | App-Einstellungen, Jellyfin-Adresse als Konfiguration |
| `GET/POST /api/jobs`, `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry` | Persistente Aufgaben |
| `GET /api/backup/export`, `POST /api/backup/import` | JSON-Backup und bestätigtes Restore |

Geschützte APIs benötigen einen Sessioncookie. Schreibaufrufe zusätzlich `X-ForgeCore-CSRF`, wie bei der Anmeldung bzw. `GET /api/me` erhalten; Einrichtung und Anmeldung verwenden `X-ForgeCore-Request: 1`.

## Versions- und Releasepolitik

- **ForgeCore:** eigene Versionsnummer ab `v0.0.1`. Der aktuelle Phase-7-Beta-Vorschau-Stand ist `v0.9.9`.
- **Browser-Snapshot:** `ForgeCore/browser-extension/` steht jetzt auf **StreamForge v1.8.11**; Änderungen erfolgen ausschließlich bewusst und separat.
- Release-Tags für ForgeCore tragen den Präfix `forgecore-vX.Y.Z`, um mit der bestehenden Browser-Erweiterung keine Tags zu kollidieren.
- Die detaillierten Meilensteine stehen in [ROADMAP.md](./ROADMAP.md), die konkreten Änderungen in [CHANGELOG.md](./CHANGELOG.md).

## Grenzen und Sicherheitskonzept

- Nur explizit vom Benutzer eingetragene, berechtigt zugängliche Quellen. Keine DRM-/Zugangsbeschränkungsumgehung, kein automatisches Account-Login.
- Downloads verwenden öffentliche HTTP(S)-Ziele ohne mitgesendete Browser-Cookies. Schutz gegen private IPs, Redirects und gefährliche Port-Adressen.
- Jellyfin-Adresse bleibt zunächst eine gespeicherte Konfiguration; es erfolgt **kein** automatischer Jellyfin-API-Refresh. Die Ablage neuer Dateien und lokaler Bibliotheks-Scan sind vorhanden.
- DASH unterstützt explizite SegmentList sowie begrenzte SegmentTemplate-Profile mit Nummern- oder Timeline-Fragmenten. Eine separate HLS-Audio-Playlist führt zu einer verständlichen Fehlermeldung.
- Eine ZimaOS-/SMB-Dateifreigabe muss für den ForgeCore-Docker-Benutzer schreibbar sein. Reale Heimnetz-Abnahme steht aus.
- SQLite und temporäre Medienfiles liegen auf dem persistenten `forgecore-data`-Volume. Ausreichend freien Speicher einplanen.
- Internetzugriff auf die App ist nicht vorgesehen; vor bewusster LAN-Freigabe sichere HTTPS-/Login-Konfiguration einrichten.
