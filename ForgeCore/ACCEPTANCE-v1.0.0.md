# ForgeCore v1.0.0 – Abnahmeprotokoll für ZimaOS

> **Status:** Die automatisierten Release-Gates werden in GitHub Actions ausgeführt. Die nachfolgenden Prüfungen müssen auf der tatsächlich verwendeten ZimaOS-Installation durchgeführt und dokumentiert werden, bevor ForgeCore als produktionsreif gilt.

## Vorbereitungen

- [ ] Die tatsächlich verwendete `FORGECORE_MEDIA_HOST_PATH`-Freigabe ist bekannt und mit einem separaten Testverzeichnis abgesichert.
- [ ] Jellyfin-Bibliothek und das bisherige ForgeCore-`/data`-Volume sind **außerhalb** des Containers gesichert.
- [ ] Auf dem Datenvolume sind mindestens 1 GiB frei, für große Downloads entsprechend mehr.
- [ ] Die Installation ist standardmäßig nur unter `127.0.0.1:8787` erreichbar (oder absichtlich über abgesicherten HTTPS-Proxy).

## Test 1 – Start und Medienrechte

```bash
cd ForgeCore
bash manage.sh doctor
bash manage.sh status
docker compose logs --tail=100 forgecore
```

- [ ] Docker-Container ist `healthy`; Admin-Login funktioniert.
- [ ] Der Reiter **System** meldet lesbaren und schreibbaren Medienpfad und erfolgreiche SQLite-Prüfung.
- [ ] Tatsächlicher Docker-Benutzer kann im **Testverzeichnis** schreiben, nicht nur der Host-Benutzer.

## Test 2 – Filme und Serien

- [ ] Einen Testfilm und eine Testserie mit Staffel/Folge eintragen.
- [ ] Vorhandene Jellyfin-Episoden werden erkannt; ignorierte Folgen bleiben ignoriert.
- [ ] Ein unterstützter, unverschlüsselter HLS-/DASH-/MP4-Teststream lässt sich in die Queue einreihen.
- [ ] FFmpeg/FFprobe liefern eine gültige, mit Jellyfin abspielbare Datei.
- [ ] Ein zweiter Download überschreibt keine vorhandene Datei.
- [ ] Separate HLS-Audiospuren und SRT-Untertitel funktionieren bei gewählten Testmedien.
- [ ] Jellyfin-API-Test und Bibliotheksaktualisierung funktionieren mit der eingesetzten Jellyfin-Version.

## Test 3 – Abbruch und Neustart

- [ ] Übertragung mitten in einem längeren Download unterbrechen und Container kontrolliert neu starten.
- [ ] Bereits vollständige Segmente werden per SHA-256 geprüft und wiederverwendet.
- [ ] Eine defekte Zwischendatei wird erneut geladen.
- [ ] Fehlschläge und automatische Wiederholungen erscheinen im Ereignisverlauf.
- [ ] Ein Netzlaufwerk-Ausfall lässt keine beschädigte Datei im Jellyfin-Zielverzeichnis zurück.

## Test 4 – Backup und Rollback

```bash
bash manage.sh backup
bash manage.sh update
# Bei Bedarf nach dem Update eine existierende Sicherung auswählen:
bash manage.sh rollback backups/backup-YYYYMMDDTHHMMSSZ-PID
```

- [ ] Sicherung enthält `data.tar.gz`, `data.tar.gz.sha256`, `image-id` und `data-volume`.
- [ ] Ein Backup mit veränderter SHA-256-Prüfsumme wird **vor Datenänderungen** abgewiesen.
- [ ] Ein gesicherter Datenstand lässt sich inklusive Admin-Login und Bibliothek auf dem Testsystem wiederherstellen.
- [ ] Fehlgeschlagene Updates stellen das bisherige Image und den zugehörigen Datenstand wieder her.
- [ ] Jellyfin-Mediendateien werden beim Rollback nicht gelöscht; Datenänderungen nach der Sicherung werden dokumentiert.
- [ ] Stromunterbrechung und freier Speicher während Backup/Restore wurden separat geprüft.

## Test 5 – Betrieb und Sicherheit

- [ ] Mindestens 48 Stunden Testbetrieb mit mehreren Quellenprüfungen/Downloads ohne Datenverlust.
- [ ] Keine unerwarteten Schreibrechte auf fremde Host-Verzeichnisse.
- [ ] Falsches Login, CSRF-Fehler und SSRF-Blockaden verhalten sich wie vorgesehen.
- [ ] Volles Datenvolume, nicht erreichbare Jellyfin-API und fehlerhafte Medienquelle liefern nachvollziehbare Fehler.
- [ ] Die Systemdiagnose enthält **keine** API-Schlüssel oder Passwörter.
- [ ] Die Benutzeroberfläche bleibt mit großer Medienbibliothek und auf Mobilgeräten bedienbar.

## Freigabeentscheidung

| Kriterium | Automatisch geprüft | ZimaOS-Praxistest |
| --- | --- | --- |
| SQLite/HTTP-Regressionen | Ja | Ausstehend |
| Image-Build/Containerstart | Ja | Ausstehend |
| Sicherungsintegrität/Mock-Rollback | Ja | Ausstehend |
| SMB-/externe Datenträgerrechte | Nein | Ausstehend |
| Jellyfin-Medienwiedergabe und API | Teilweise mit Tests/Fakes | Ausstehend |
| 48-h-Dauerbetrieb | Nein | Ausstehend |
| Stromausfall-/Volumefehler | Nein | Ausstehend |

**Veröffentlichungsregel:** ForgeCore v1.0.0 kann als testbare Versionsgrundlage erscheinen. Solange die echten ZimaOS-Freigabepunkte offen sind, muss das GitHub-Release aber als **Prerelease / Hardware-Abnahme ausstehend** gekennzeichnet bleiben; es darf nicht als erfolgreich produktiv abgenommene Stable-Version bezeichnet werden.
