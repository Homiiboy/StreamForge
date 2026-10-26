# ForgeCore – Changelog

## v1.7.4 – Festhängende HTML5-Wiedergabe korrekt behandeln

- Chromium erkennt auch bei `paused=false` fehlende Videodaten und ausbleibenden Zeitfortschritt.
- Maximal ein Playwright-Klick auf ein sichtbares Video, solange es noch nicht tatsächlich läuft; unsichtbare und bereits laufende Videos werden übersprungen.
- Neue Diagnosezähler: festhängender Start, kein sichtbares Video und HTML5 ohne Quelladresse.
- Regressionstests für den ZimaOS-Fehlerfall sowie tatsächlich laufende Videos.
- Kein Umgehen von CAPTCHA, Werbung, DRM oder externen Hosterschutzmaßnahmen; Echtbetrieb auf ZimaOS nicht verifiziert.


## v1.7.3 – echtes HTML5-Videoanklicken als begrenzter Browser-Fallback

- Höchstens ein Playwright-Klick pro Scan auf ein sichtbares, pausiertes HTML5-Video.
- Keine automatisierten Klicks auf Werbung, Player-Overlays, Captchas oder geschützte Zugriffskontrollen.
- Zusätzliche Diagnosen für Klickversuch, fehlgeschlagenen Klick, pausierte und nicht abspielbereite Videos.
- Unit-Tests für erfolgreiche Einzelinteraktion und nicht sichtbare Videos.
- ZimaOS- und externe Hoster-Praxistests sind nicht Teil der CI und weiterhin offen.


## v1.7.2 – Ehrliche Chromium-Wiedergabediagnose

- Ein `video.play()`-Aufruf wird nicht mehr fälschlich als erfolgreich abgespieltes Video ausgegeben.
- Browser-Agent zählt nachweisbar laufende Videos, Netzwerkantworten, Medienantworten und Medienantworten ohne direkt unterstützte Endung.
- Discover zeigt diese Zähler bei der automatischen Browseranalyse an, ohne signierte Medien-URLs oder Cookies in Diagnosemeldungen auszugeben.
- PlayerBridge filtert offensichtlich irrelevante Social-Media- und IP-Iframes, echte externe Player bleiben erhalten.
- Die Downloadfreigabe und Deutschprüfung bleiben unverändert; die Diagnostik umgeht keine Schutzmechanismen.
- Neue Regressionstests; ZimaOS-Praxistest ausstehend.


## v1.7.1 – Discover navigiert zur exakten Episode

- Staffel- und Episodenlinks aus HTML-Katalogseiten erkennen, statt nach der Serienseite abzubrechen.
- Pro Suche höchstens vier Serienseiten und jeweils eine relevante Staffel folgen; gleiche Domain und Serienkennung erzwingen.
- Keine URL-Vermutungen: nur belegte Episodenlinks werden als exakte Treffer angezeigt und für Browser-Scans zugelassen.
- Regressionstests für genaue Folge, falsche Serien, Cross-Origin-Links, Weiterleitungen und Anfragelimits.
- Keine Änderungen am bestehenden StreamForge-Connector; ZimaOS-/Website-Test steht weiterhin aus.

## v1.7.0 – Autonomer Browser-Agent

- Separater, optionaler Playwright/Chromium-Agent im eigenen Docker-Container mit aktivierter Browser-Sandbox.
- Erkennt zur Laufzeit angeforderte direkte HLS-, DASH- und MP4-Medienadressen durch Netzwerkanalyse.
- Sichere Discover-Verknüpfung nur mit explizit gespeicherten, eindeutig zugeordneten Katalog-Episodenseiten.
- Browser-Agent muss weder durch StreamForge-Connector noch durch Nutzerwiedergabe vorbereitet werden; startet eingebettete HTML5-Videos, soweit zulässig und technisch möglich.
- Erkannten Stream innerhalb von acht Minuten über bestätigte Deutschprüfung an bestehende Warteschlange übergeben.
- Browsersperren gegen private Adressen, unzulässige URLs, Captchas, DRM-Umgehung und aggressive Popup-Klicks.
- CI für Scanner, Web-API und Docker-Sandbox. ZimaOS-Hardwarevalidierung weiterhin offen.

## v1.6.2 – Discover zeigt Katalogtreffer getrennt von Direktlinks

- Diagnose der gespeicherten Webseiten: gefundene Titel-/Episodenseiten werden neben den unterstützten direkten Medienlinks angezeigt.
- Für eindeutig zugeordnete Episodenseiten kann die bestehende PlayerBridge auf Knopfdruck externe Player prüfen; keine Extraktion von Hosterstreams.
- Fehlender Direktlink wird nicht länger als Beweis für eine fehlende deutsche Synchronfassung ausgegeben.
- Einzelne Website-Fehler und fehlende Suchadressen werden in der Discover-Detailansicht sichtbar.
- Regressionstest zur URL-Struktur `staffel-1/episode-49` und zur exakten Episodenzuordnung.


## v1.6.1 – Dauerhafter Schutz lokaler Zugangsdaten

- ZIP-Upgrader verweigert Archive mit `.env`, unsicheren Pfaden und Symlinks; vorherige Konfiguration bleibt erhalten.
- Die `.env` wird vor dem Update sicher unter `backups/` gesichert und danach überprüft.
- `manage.sh` verweigert Updates ohne vorhandene, reguläre `.env`, anstatt Token versehentlich zu verlieren.
- Neue Regressionstests für gültige und manipulierte Updatepakete. Keine Datenbankmigration.

## v1.6.0 – Deutschpflicht, Discover Downloads und neue Benutzeroberfläche

- **v1.5.2:** Quellen in Discover aus bereits gespeicherten Websites finden, Staffel-/Folgenzuordnung ohne Raten, vorhandene TransferQueue und PlayerBridge weiterverwenden.
- **v1.5.3:** Neue responsive Oberfläche mit Poster-Cards, Detailseiten, separaten Downloads- und Radar-Ansichten und deutschbezogenem Quellendialog.
- **v1.5.4:** Opt-in-Überwachung und optional automatische Einplanung von nur als Deutsch bestätigten Direktquellen für bereits verwaltete fehlende Medien.
- **v1.5.5:** Download-Dashboard mit Fortschritt, Fehlerstatus, Abbruch, Retry und Ereignissen.
- **v1.6.0:** Alle produktiven Übertragungen verlangen Audiosprachennachweis vor Jellyfin-Publikation. HLS/DASH priorisiert Deutsch; fehlende oder gegenteilige Sprachinformationen melden „Gibt es noch nicht auf Deutsch“. SQLite-Migration 12 und Sicherheitstests.
- **Einschränkungen:** Externe Player werden nicht entschlüsselt/heruntergeladen; die Sprache wird anhand von Tonspur-Metadaten und Manifestangaben bewertet, nicht durch automatische Spracherkennung. Für MP4 ohne Sprach-Tags wird ein Download zwar nur nach Bestätigung versucht, aber die Datei wird nicht in Jellyfin veröffentlicht.
- ZimaOS-Prerelease bis zur echten Hardware-/Quellenabnahme.


## v1.5.1 – StreamRadar Discover & Radar (zusammengefasste v1.4.x-Meilensteine)

- Discover-Tab inklusive TMDB-Suche, Wochen-Trends, Poster und Details.
- Österreichische Watch-Provider (Abo/Kauf/Leihe); verifizierte TMDB-IMDb-TVmaze-Verknüpfung für Serientermine.
- Manuell ausgelöster Jellyfin-Bestandsabgleich mit strikter SeriesId-Filterung; keine Vermischung von Specials.
- Serverseitige Merkliste, freiwillige Überwachung, alle sechs Stunden wiederkehrender Radar-Check, deduplizierte Benachrichtigungen.
- Staffel-/Episodenliste mit vorausgewählten Ausschlüssen für bereits vorhandene, ignorierte oder bereits laufende Folgen. Explizite Registrierung fehlender Einträge, **keine automatische Downloadplanung**.
- SQLite-Migration 11, JSON-Backup/Restore (Überwachung bei Restore deaktiviert), neue Unit-/HTTP-Regressionstests.
- StreamForge-Browser-Connector, ForgeCore-v1.5.0-PlayerBridge und StreamRadar-Windows-App unverändert.
- Prerelease bis zur echten ZimaOS-/Jellyfin-/TMDB-Live-Abnahme.


## Discover-Meilensteine v1.4.1–v1.4.4 (im Entwicklungsbranch, nachträglich auf v1.5.0-Code)

- **v1.4.1:** TMDB-Detailseiten (Genre, Inhalt, Laufzeit soweit geliefert), österreichische Abo-/Kauf-/Leihanbieter sowie explizite TMDB-Staffelansicht und TVmaze-Zuordnung ausschließlich mit bestätigter IMDb-ID.
- **v1.4.2:** Read-only Jellyfin-Vergleich pro Titel, bei Serien strikt über deren Jellyfin-SeriesId; bei Filmen über TMDB-Provider-ID oder eindeutige Kombination aus Name/Jahr. Verwechslungsrisiken werden nicht als Verfügbarkeit ausgegeben.
- **v1.4.3:** SQLite-Merkliste und separat aktivierbare Titelüberwachung, alle 6 Stunden im Server bzw. manuell. Hinweise zu bestätigten Terminen im 30-Tage-Fenster werden pro Event dedupliziert. Schema 11; JSON-Backup enthält Merkliste und deaktiviert Überwachung beim Restore.
- **v1.4.4:** Staffel- und Folgenübersicht, registrierbare Episodenauswahl, Berücksichtigung von Jellyfin-/ForgeCore-/Queue-Status. Bereits nachgewiesene oder ignorierte Folgen werden nicht neu angelegt. Kein automatischer Download von Streams.
- Alle Änderungen sind abwärtskompatibel zur aktuellen v1.5.0-PlayerBridge; StreamRadar v0.5.3 bleibt unverändert.
- **Abnahme offen:** GitHub CI, ZimaOS-/SMB-Praxistest, realer TMDB-/TVmaze-/Jellyfin-Abgleich. Diese Meilensteine sind noch kein veröffentlichtes Release.

## Discover-Meilenstein v1.4.0 – auf dem v1.5.0-Code entwickelt

- Neuer Discover-Tab mit TMDB-Wochentrends, Suche und Poster-Karten im Stil der ForgeCore-Oberfläche, angelehnt an StreamRadar v0.5.3.
- Serverseitiger TMDB-Adapter und optionales FORGECORE_TMDB_TOKEN-Secret aus der lokalen Umgebung.
- TMDB-Bild-CSP und getrennte Behandlung von Katalog- und Downloadquellen.
- Expliziter, duplikatgeschützter Import von TMDB-Titeln in die bestehende Medienbibliothek.
- Unit-/HTTP-Regressionstests sowie Docker-/Umgebungsanpassung.
- Keine automatische Downloadplanung, noch keine Merkliste, TVmaze-Kalender oder Jellyfin-Anzeige auf Discover-Karten.
- Versionshinweis: Meilenstein v1.4.0 ist kein Release-Downgrade; der bestehende v1.5.0-Stand auf main bleibt erhalten.


## v1.5.0 – PlayerBridge und Listen-Download

- Read-only-PlayerBridge: externe Player und direkte Medienlinks differenziert; begrenzte Same-Origin-Inspektion.
- Buttons für Playerprüfung an Episoden- und Filmtreffern, Downloadplanung bei unterstützten direkten Medien-URLs.
- Projekt-/Episodenzuordnung und explizite Bestätigung nutzen vorhandene Transfer-Queue; bereits verfügbare oder ignorierte Folgen werden nicht eingeplant.
- Regressionstests zu Linkklassifizierung und Domain-Grenzen; keine Hoster-Stream-Extraktion und keine Änderung an Jellyfin.


## v1.5.0 – Lange Serien und Specials

- 2.500 statt 200 Quellenepisoden, bis zu 40 Staffel-URLs.
- Explicit Staffel-0-Navigation und ehrliche Specials-Erkennungsanzeige.
- Skalierbare, erst beim Öffnen befüllte Staffellisten.
- Größere Jellyfin-Vergleichs- und Serienübersicht-Requests, begrenzt auf 512 KiB.
- DNS und Jellyfin-Serien-ID-Schutz bleiben erhalten.


## v1.5.0 – Jellyfin-Abgleich: API-Fallback

- Unterstützt Jellyfin-Server, die `ParentId`-Episodenabfragen ablehnen oder leer zurückliefern.
- Strikte `SeriesId`-Prüfung auch beim begrenzten Fallback über globale Episodenseiten.
- Specials ausgeblendet; keine fremden Folgen und keine Änderungen an Medien.
- Zwei neue Regressionstests für den Fehlerpfad.


## v1.5.0 – Jellyfin-Serienidentität und Specials

- Zuerst Jellyfin-Serie auflösen, dann nur deren Episoden anhand `SeriesId` übernehmen.
- Serieneigene Episoden über `ParentId` seitenweise abrufen; keine globale 1.000-Einträge-Verdrängung.
- Staffel 0 und Specials in Standardübersicht und Projektimport ausgeblendet.
- Gleichnamige, aber mehrdeutige Jellyfin-Serien werden nicht automatisch vermischt.
- Jellyfin-Medien bleiben unverändert; DNS weiterhin im Compose-Paket.


## v1.5.0 – Staffel-Navigation

- Begrenzte Same-Origin-Auswertung verlinkter Staffelseiten und Zusammenführung der Episoden.
- Staffelweise Quellenzählung, getrennte Specials und individuelle Fehlerhinweise.
- Keine destruktiven Aktionen oder automatischen Downloads.


## v1.5.0 – Gemeinsame Staffelübersicht und kontrollierter Import

- Quelle/Jellyfin/ForgeCore-Episoden vereinigt, pro Staffel gruppiert und vorsichtig klassifiziert.
- Fortschrittsanzeige für den bekannten Ausschnitt.
- Opt-in-Import bestehender Jellyfin-Folgen mit Transaktion und INSERT OR IGNORE; keine Überschreibungen oder Downloads.
- DNS-Konfiguration unverändert enthalten.


## v1.5.0 – Katalog-Inspektion und Jellyfin-Vorschau

- Authentifizierte, lesende Kataloginspektion für gespeicherte und aktive Websites; Same-Origin-Validierung.
- Staffel-/Episodenerkennung nur aus expliziten URL-Mustern, maximal 200 Episoden.
- Anzeige bekannter ForgeCore-Episodenstatus, keine Statusänderungen.
- Optionaler manueller Jellyfin-Vergleich der erkannten Folgen; bis zu 1.000 Jellyfin-Inventareinträge.
- Kein automatischer Download, kein Crawling externer Seiten, keine Behauptung vollständiger Staffeln.
- DNS-Konfiguration (1.1.1.1 und 1.0.0.1) dauerhaft im Compose-Paket.


## v1.5.0 – Titelqualität und Treffergruppierung

- Diskussionen und Kommentare als falsche Serien- und Episodentreffer herausgefiltert.
- HTML-Entities dekodiert, alternative Titel separiert, Suchtreffer nach Titelnähe sortiert.
- UI gruppiert identische Titel mit einzeln zugänglichen Quellen und aufklappbaren Metadaten.
- Bestehende API-/Queue-Verträge und Sicherheitsgrenzen erhalten; Tests ergänzt.


## v1.5.0 – Katalogsuche und Titelerkennung (Prerelease)

- Titel- und Detailseiten aus HTML-Suchergebnissen erscheinen als eigene Katalogtreffer, auch ohne direkte Mediendateien.
- Begrenzte Analyse von bis zu fünf passenden, gleichursprünglichen Detailseiten; Medienlinks werden separat gekennzeichnet.
- Warnhinweise bei leerer Suche ohne Suchvorlage mit `{query}`; keine beliebige universelle Seitensuche.
- UI mit Trefferart und vorsichtiger Serien-/Film-/Episoden-Einordnung; Regressionstests ergänzt.



## v1.5.0 – DNS-Pinning-Korrektur

- Node.js HTTP-`lookup` unterstützt `options.all=true` korrekt und bekommt geprüfte Adresse/Familie als Array statt als Einzeladresse.
- IP-Pinning, URL-Validierung und SSRF-Schutz unverändert; neue Tests für IPv4 und IPv6 mit beiden Callback-Signaturen.
- Behebt die bei der praktischen Website-Suche beobachtete Fehlermeldung `Invalid IP address: undefined`.



## v1.1.0 – Testversion: Website-Suche / Phase 9

- Globale Websiteverwaltung mit aktiviert/deaktiviert, Adapterwahl und optionaler URL-Suchvorlage mit `{query}`.
- Treffererkennung auf Katalogseiten und maximal fünf passenden Detailseiten je Website; gleiche Origin und SSRF-geschützte HTTP-Abfragen.
- Authentifizierte Such-API, neue UI, SQLite-Migrationen 9/10, JSON-Backup-Unterstützung und Tests.
- Noch keine automatische Überwachung aller Website-Titel, kein universeller Browser-Crawler, keine ungefragten Downloads und keine Hardware-Abnahme.



## Source Automation: erweiterte Website-Suche (Entwicklungsstand)

- Konfigurierbare Such-URL mit `{query}` für jede Website, streng auf dieselbe Herkunft beschränkt.
- Titelsuche lädt zunächst Suchergebnisse und folgt höchstens fünf passenden internen Detailseiten pro Quelle.
- Kein Login-Automatismus, keine Browser-Ausführung und keine automatische Downloadfreigabe; eigene unterstützte direkte Medienlinks bleiben erforderlich.
- Schema-Migration 10, sichere Speicherung und Regressionstests.


## Phase 9 – globale Website-Suche (Entwicklungsstand nach v1.0.0)

- Globale Liste autorisierter Websites unabhängig von Medienprojekten, aktivierbar/deaktivierbar und mit vorhandenen vertrauenswürdigen Adaptern.
- Authentifizierte, schreibgeschützte Suche nach passenden Medienlinks auf bis zu 20 aktivierten Seiten; pro Website Fehlerisolierung und Trefferbegrenzung.
- Neue Website-Verwaltung in der Weboberfläche; Links können manuell geöffnet werden, keine automatischen Downloads.
- SQLite-Migration und JSON-Backup-Unterstützung; wiederhergestellte Websites sind aus Sicherheitsgründen zunächst deaktiviert.
- Einschränkungen: keine Suchformular-Steuerung auf Drittseiten, keine JS-Website-Ausführung, keine beliebige Online-Volltextsuche. ZimaOS-Hardwaretest steht aus.


## Connector v1.8.11

- Sechs Jellyfin-Zielkategorien mit Vorschlag und manueller Auswahl, bestehende Bibliotheksordner bleiben erhalten.


## Browser-Connector v1.8.10

- Lokale Chrome-Downloads ohne erzwungene Unterordner sind wieder als eigenständiger Modus verfügbar.
- Movies-/Shows-Automatik bleibt separat; HLS-Downloadkern unverändert.


## Browser-Connector-Snapshot: StreamForge v1.8.9

- Ordnerschreibtest vor dem Download, klare Hinweise bei fehlenden Berechtigungen und zur Staffelordner-Suche.
- HLS-/DASH-Engine aus V1.6.5 bleibt unverändert.


## Browser-Connector v1.8.8

- Ausgewählter Jellyfin-Ordner wird nun auch für direkte MP4/TS/WebM-Dateien unterstützt.
- 1.6.5-basierter HLS/DASH-Downloadkern bleibt unverändert.


## Browser-Connector V1.8.7

- Veraltete Warteschlangenbedienung entfernt; weiterhin Downloadengine aus V1.6.5 plus Medienordner-Export.
- Fehlende direkte Ordnerablage für einfache Mediendateien im UI explizit benannt.


## Browser-Connector-Snapshot StreamForge v1.8.6

- HLS/DASH-Engine und Direktstart auf den funktionierenden Stand V1.6.5 zurückgesetzt.
- Neuer Medienordner-Export ist separat angebunden; ForgeCore-Server bleibt v1.0.0.


## Browser-Connector-Snapshot: StreamForge v1.8.5

- Verbindungsbereitschaft zwischen Background-Service-Worker und Offscreen-Downloader wird vor dem Start geprüft.
- Chrome-Fehler bei noch nicht registriertem Empfänger abgefangen, neuer Regressionstest.


## Browser-Connector-Snapshot: StreamForge v1.8.4 (ForgeCore-Server bleibt v1.0.0)

- Korrigierte PNG-Erweiterungsicons und Favicon aus dem gemeinsamen Branding übernommen.
- Browser-Connector-Versionsangaben synchronisiert; Medienfunktionen bleiben unverändert.


## Browser-Connector-Snapshot: StreamForge v1.8.3 (ForgeCore-Server bleibt v1.0.0)

- Popup-Detailbereiche (Streamdetails, Tonspuren/Untertitel sowie weitere Optionen) bleiben bei regelmäßigen Aktualisierungen geöffnet.
- Beide Connector-Kopien synchronisiert; automatische Medienordner und Download-Pipeline bleiben unverändert.


## Browser-Connector-Snapshot: StreamForge v1.8.2 (ForgeCore-Server bleibt v1.0.0)

- Bewusste Synchronisierung von `ForgeCore/browser-extension/` mit StreamForge Connector v1.8.2.
- Vereinfachte Popup-Oberfläche und verständlichere Downloadstatusmeldungen übernommen.
- Automatische Jellyfin-kompatible Ordnerstruktur sowie die vorhandene HLS-/DASH-Pipeline unverändert belassen.
- Frühere Versionsangaben in den historischen ForgeCore-Releaseeinträgen bleiben zur Nachvollziehbarkeit bestehen.


## v1.0.0 – Phase 8: Releasekandidat (Hardware-Abnahme ausstehend)

- Die Funktionen der bisherigen Phasen 1–7 wurden in einem gemeinsam versionierten Releasekandidaten zusammengeführt.
- **Rollback-Härtung:** Vollständige Datenvolume-Archive enthalten SHA-256-Prüfsummen. Vor einem Restore wird geprüft, dass die Sicherung unverändert ist und ihr Volume zum laufenden ForgeCore-Datenvolume gehört.
- **Release-Regressionsprüfungen:** Authentifizierungsgrenzen, Systemdiagnose, Backup/Restore, SQLite-Persistenz, unveränderter StreamForge-v1.8.1-Snapshot, Docker-Build und Container-HTTP-Start.
- **Abnahmedokument:** `ACCEPTANCE-v1.0.0.md` dokumentiert die erforderlichen Praxistests und deren aktuellen Status.
- **Veröffentlichung:** GitHub-Tag und ZIP heißen v1.0.0. Der Release wird als **Prerelease** markiert, bis die echte ZimaOS-/SMB-/Jellyfin-Abnahme bestanden wurde.

**Nicht als produktionsreif bestätigt:** Große Downloads auf echten SMB-Datenträgern, unterschiedliche Streaming-Websites/Codecs, mehrtägiger Betrieb, Stromausfall- und Wiederherstellungstests. Kein universeller Web-Downloader, keine DRM-Umgehung.

## v0.9.9 – Phase 7: ZimaOS Lifecycle & Operations (Beta-Vorschau)

Alle Meilensteine aus v0.6.x–v0.9.x wurden in einem gemeinsamen Entwicklungsstand gebündelt; keine separaten Releases.

- **v0.6.x:** Sichere ZimaOS-Host-Vorabprüfung, Docker-Compose-Verwaltung und Installer.
- **v0.7.x:** Vollständige Datensicherung bei gestopptem ForgeCore-Container, Docker-Healthcheck-gesteuertes Update und automatischer/manueller Rollback auf Image und Datenvolume.
- **v0.8.x:** Authentifizierte Systemdiagnose mit SQLite-`quick_check`, Speicherplatz, Medienvolumes, RAM, Queue-Status, Fehlerübersicht und responsivem Systemreiter.
- **v0.9.x:** Tests zur SQLite-Bibliothek mit 1.200 Einträgen, simulierter Docker-Backup/Update/Rollback-Prozedur, CI-/Docker-Smoke-Tests und Git-Ausschluss privater Daten.

**Ausstehend:** Native ZimaOS-App-Store-Bereitstellung, reale Upgrade-/Rollback-/SMB-Abnahme, mehrtägiger Langzeittest, Stromausfalltests, Wiedergabe-/Codec-Prüfungen und belastbare Sicherheitsevaluation. Diese Beta ist nicht v1.0.0.

## v0.5.9 – Phase 6: Quellenadapter & Jellyfin API (Alpha)

Alle Meilensteine v0.5.0–v0.5.9 sind im gemeinsamen 0.5.9-Entwicklungsstand gebündelt; keine separaten Zwischenreleases.

- **v0.5.0–v0.5.2:** Explizite integrierte Adapterauswahl je Quelle, neues HTML-`data-season`/`data-episode`-Profil und Übernahme dieser Auswahl in geplante Quellenchecks.
- **v0.5.3:** Jellyfin-API-Einstellungen und Verbindungstest über `/System/Info`.
- **v0.5.4:** Manueller Bibliotheks-Refresh mit optionalem, separat aktivierbarem Refresh nach erfolgreichen Transfers.
- **v0.5.5–v0.5.6:** Nicht-destruktive Vorschau und bestätigter Episodenabgleich auf Grundlage von Seriennamen und Staffel-/Folgenummern; historische Abgleiche.
- **v0.5.7:** Geschützter API-Schlüssel: keine Ausgabe im JSON-Backup, allgemeinen Konfigurationsabruf oder Jellyfin-Status.
- **v0.5.8–v0.5.9:** SQLite-Schema 8, deutschsprachige Einstellungen, API- und Adaptertests, Docker-CI und Release.
  
**Grenzen:** Kein Third-Party-Code-Loader, keine dynamischen JavaScript-Player, keine automatische beidseitige Synchronisierung oder zuverlässige Metadatenzuordnung bei abweichenden Jellyfin-Titeln. Echtes ZimaOS-/SMB-/Jellyfin-Testing bleibt offen.

## v0.4.9 – Phase 5: Automatische Serien- und Quellenprüfungen (Alpha)

Die Meilensteine v0.4.0–v0.4.9 werden im gemeinsamen 0.4.9-Stand gebündelt und nicht als einzelne Releases ausgeliefert.

- **v0.4.0–v0.4.1:** Opt-in-Regeln pro Serienquelle und migrierbare SQLite-Datenhaltung, konservative Standardwerte.
- **v0.4.2:** Wiederkehrende Quellenprüfungen im Docker-Dienst, ohne offenen Browser.
- **v0.4.3:** Episoden aus unterstützten HTML-Medienlinks erkennen, registrieren und vor Duplikaten schützen.
- **v0.4.4:** Optionales, separat freizugebendes Einreihen fehlender Folgen, maximal 1–50 Aufträge je Prüfung.
- **v0.4.5:** Prüfverlauf, Fehlerprotokoll und Benachrichtigungen über neue Episoden oder Fehler.
- **v0.4.6:** Fehler-Backoff und Schutz vor destruktiven Updates bei leeren/quellenbedingt fehlerhaften Antworten.
- **v0.4.7:** Deutsche Weboberfläche für Konfiguration, manuelle Prüfungen und Verlauf.
- **v0.4.8:** JSON-Backup von Regeln, beim Import bewusst deaktivierte Automatisierung.
- **v0.4.9:** Integrationstests, Docker-CI, Dokumentation und eigenständiges Release.

**Noch offen:** JavaScript-gerenderte Webseiten, Anbieter-spezifische Adapter, stabile Serienüberwachung über verschiedene Websites, echte ZimaOS-/SMB-Abnahme, Netzwerk-Langzeittests und native Jellyfin-API-Benachrichtigungen. Keine DRM-/Zugriffskontrollumgehung.

## v0.3.9 – Phase-4-Alpha: Recovery und Medienintegrität

Die Meilensteine v0.3.0–v0.3.9 sind in einem gemeinsamen 0.3.9-Entwicklungsstand zusammengefasst, nicht als zehn separate Releases veröffentlicht.

- **v0.3.0–v0.3.2:** SHA-256-verifizierter Segmentcache, Neustart- und Retry-Recovery auf persistentem Datenvolume; beschädigte Segmente werden neu geladen.
- **v0.3.3:** Exponentielles Retry-/Backoff-Verhalten für vorübergehende Netzwerkfehler, ereignisbasierter Jobverlauf.
- **v0.3.4:** FFprobe-Prüfung auf gültigen Videostream und Laufzeit vor Jellyfin-Publish; FFmpeg-Muxing bleibt ohne Re-Encoding.
- **v0.3.5:** Unterstützung ausgewählter alternativer HLS-Audio-Playlists mit bevorzugter Sprache (nicht universell).
- **v0.3.6:** Vollständiger SQLite-Online-Backup-Download, Ereignisprotokoll in der Benutzeroberfläche.
- **v0.3.7:** Bereinigung alter verwaister Download-Zwischenstände und kontrollierter Cache-Lebenszyklus.
- **v0.3.8–v0.3.9:** Regressionstests für Recovery, Prüfsummen, Audio, Datenbankmigration, SQLite-Backup und Container; Dokumentation und CI-Release.

**Noch offen:** HTTP-Range-/Byte-Resume innerhalb eines Segments, echte ZimaOS-/SMB-Netzlaufwerkstests, vollständige Codec-Wiedergabeprüfung auf Jellyfin, alle Audiotrack-/Untertitelformate, Langzeittests und automatischer Rollback. Nicht als vollständig produktionsreif betrachten.

## v0.2.9 – Phase-3-Beta-Vorschau

Die Entwicklungsmeilensteine v0.2.0–v0.2.9 sind im gemeinsamen v0.2.9-Stand gebündelt. Es handelt sich **nicht** um zehn einzelne Releases oder um eine auf ZimaOS abgenommene Produktionsversion.

- **v0.2.0:** Film-/Serienassistent mit Titel- und Quelleneingabe sowie Planungsübersicht.
- **v0.2.1:** Heuristische technische Quellenbewertung nach Adaptertyp und Episodenabdeckung. Keine Qualitätsermittlung.
- **v0.2.2:** Download-Zeitfenster, Wochentage und optionale Bandbreitenbegrenzung je Transfer.
- **v0.2.3:** Unterstützter externer WebVTT-zu-SRT-Export mit Sprachcode für vorhandene Medien. Keine automatische Untertitel- oder Audiospurwahl.
- **v0.2.4:** Persistente Download-/Untertitelbenachrichtigungen, Lesestatus und Diagnose.
- **v0.2.5:** `install.sh` als Docker-/ZimaOS-Installationshilfe, Vorabprüfung des Medienpfades. Kein natives ZimaOS-App-Store-Paket.
- **v0.2.6:** Ressourcenbewusste streamingbasierte Download-Drosselung ohne vollständiges Laden großer Dateien in RAM.
- **v0.2.7:** Sicherheitsprüfung von Untertitelpfaden und URL-Validierung; Dokumentation von Plattformgrenzen.
- **v0.2.8:** Serverseitige Episodenplan-Vorschau und kompaktere Übersicht im Assistenten; für große Bibliotheken weiterhin Praxistests nötig.
- **v0.2.9:** SQLite-Migration, Testabdeckung, Docker-Release-Build und Beta-Dokumentation.

**Offen:** automatische Webseiten-Intervalle, volle Audio-Track-Auswahl, native ZimaOS-App-Store-Bereitstellung, grafischer Rollback und echte SMB-/Langzeit-/Lasttests. Diese Punkte dürfen erst nach separater Implementierung und Praxistests als abgeschlossen gelten.

Die Phase-2-Meilensteine v0.1.0–v0.1.9 sind im gemeinsamen **v0.1.9 Alpha-Stand** umgesetzt, nicht einzeln veröffentlicht. Reale ZimaOS-/SMB-Tests und unterschiedliche Quellseiten sind noch ausstehend.

## v0.1.9 – Phase-2-Alpha-Härtung
- Sicherheits- und Regressionstests für Quellen, SSRF, HTML-Discovery, HLS-/DASH-Parsing, Transfers, SQLite-Migration und Backup/Restore.
- Docker mit FFmpeg und eigenständiger Release-/CI-Prüfung. Lokaler HLS-TS→MP4-Remuxtest erfolgreich.
- Die Formate sind bewusst begrenzt; v0.1.9 ist **keine universelle Website-Download-Engine**.

## v0.1.8 – Medienbibliotheksabgleich
- Vorhandene Filme/Episoden über Dateinamen und vorhandene Staffelordner prüfen, vorhandene Episoden im Serienbatch auslassen.
- Keine automatische Jellyfin-API-Aktualisierung.

## v0.1.7 – Jellyfin-Export
- Jellyfin-konformer MP4-Zielpfad, vorhandene `Season NN`-/`Staffel N`-Ordner erkennen, vorhandene Dateien nicht überschreiben.
- Sichere Pfadgrenzen und atomarer finaler Dateieintrag auf Dateisystemen mit Hardlink-Unterstützung.

## v0.1.6 – Serien-Warteschlange
- Einzelne oder bis zu 200 gefundene Episoden als fehlende Folgen einreihen.
- Persistente SQLite-Transfers, sequentielle Verarbeitung, manuelle Cancel-/Retry-Aktionen und Recovery nach Neustart.
- **Keine** manuelle Priorisierungssteuerung, Zeitplanung oder bytegenaue Segment-Resume-Funktion.

## v0.1.5 – FFmpeg-Muxing und Validierung
- Lokaler Remux von unterstützten HLS-TS und DASH-SegmentList-/SegmentTemplate-Tracks in MP4.
- MP4-Signatur- und Dateigrößenprüfung, verworfene fehlerhafte Dateien.

## v0.1.4 – Download-Engine
- Segmentweiser, größenbegrenzter Netzwerkdownload von ungeschützten HLS-/DASH-Medien und direkten MP4-Dateien.
- Temporäre Daten auf der persistenten Festplatte statt im RAM-/tmpfs-Speicher.

## v0.1.3 – HLS-/DASH-Analyse
- HLS-VOD mit Master-/Mediaplaylists, unverschlüsselt, ohne separate Audio-Playlists.
- DASH explizite SegmentList und einfache SegmentTemplate-VOD-Manifestvarianten; DRM/Live/unsupported-Profile abweisen.

## v0.1.2 – Episoden-Discovery
- HTML-Links zu HLS/DASH/MP4 erkennen und SxxExx-Namen staffel- und episodenweise importieren.
- Kein allgemeines JavaScript-Rendering, Captcha-Bypass oder automatischer Website-Crawler.

## v0.1.1 – Quellenadapter-Grundlage
- Eingebaute Adaptertypen (HTML-Links, HLS, DASH) und URL-Sicherheitsgrenzen mit DNS-Pinning, Redirect-, Netzwerk- und Größenbeschränkungen.
- Ein dynamisches Drittanbieter-Plugin-SDK ist noch nicht implementiert.

## v0.1.0 – Quellenverwaltung
- Quellen pro Film/Serie speichern, analysieren, entfernen und in der UI zu Downloadjobs zuordnen.
- Datenbankmigration, Sources und SourceItems werden im Backup berücksichtigt.

## v0.0.9 – Alpha-Härtung
- API-, Datenbank-, Authentifizierungs-, Neustart- und Volume-Integrationstests.
- Request-Begrenzungen, geschützter JSON-Import, Pfadvalidierung, Docker-Ressourcenbegrenzungen und Fehlerbehandlung.
- Dokumentation, Deploy-Checks und CI für Docker und Node.

## v0.0.8 – Offline-Metadaten
- Film-/Serien-Titel, Jahr, externe ID und Notizen; Episodentitel, Staffeln und Episodennummern.
- Persistente lokale Metadatenprüfung als Jobtyp; **noch keine externen Anbieter**.

## v0.0.7 – Hintergrundaufgaben
- SQLite-basierte Queue mit Status, Retry, Abbruch wartender Aufgaben und Recovery laufender Aufgaben nach Neustart.
- Read-only Scan und Metadaten-Validierung als erste unterstützte Jobtypen.

## v0.0.6 – ZimaOS-/Jellyfin-Volume
- Optionales, schreibgeschütztes Docker-Medienvolume.
- Pfadvorschau und read-only Dateiabgleich mit Jellyfin-konformen Filmen, Serien, Staffeln und alternativen `Staffel N`-Ordnernamen.
- Root-Berechtigungsprüfung und Pfadgrenzen ohne Medienänderungen.

## v0.0.5 – Medienbibliothek
- Film-, Serien- und Episodenmodelle samt REST CRUD, Duplikatschutz und einfacher UI.

## v0.0.4 – Weboberfläche
- Responsive deutschsprachige Oberfläche: Übersicht, Medienbibliothek, Aufgaben und Einstellungen.

## v0.0.3 – Zugangsschutz
- Einmalige Admin-Einrichtung, scrypt-Passwort-Hash, persistente Sessionverwaltung, HttpOnly-Cookies, CSRF-Prüfung, Login-Limit.

## v0.0.2 – Persistente Datenhaltung
- SQLite-Datenbank mit Migrationen, Indizes, Transaktionen, persistenter Datenvolume und JSON-Backup/Restore.

## v0.0.1 – Grundgerüst
- Eigenständiger Node.js-/Docker-Dienst und eingefrorene Browserkopie von StreamForge v1.8.1.
- Read-only Basisendpunkte `/api/health` und `/api/status`.
