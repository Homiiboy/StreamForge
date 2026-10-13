# StreamForge Browser Connector 1.6.5 – Test Report

## Regression Suite

`npm test`: **PASS**

Enthalten sind Media-Erkennung, HLS, DASH, TS-Muxing, neuer B-Frame/DTS-Test, Netzwerk/Retry, Request-Profile, Metriken/ETA, HLS-Audio/Video-Timeline, Pipeline-Runtime, Background-Throttling, Naming, Export/Recovery, UI-Fokus, Probe-Timeouts und Direct-HLS-Prefetch.

## Kritischer B-Frame-Realtest

Testmaterial: 12 s H.264 (libx264, 3 B-Frames) + separate AAC-MPEG-TS-Spur.

- Input enthält nachweislich PES mit `PTS != DTS`.
- Mit dem unveränderten 1.6.4-`tsmux.js`: **297 ffmpeg Warn-/Fehlerzeilen**.
- Mit 1.6.5: `ffmpeg -v warning -i muxed.ts -f null -`: **0 Warnungen/Fehler**.
- `ffprobe` erkennt H.264 Video + AAC Audio.

## Mehrsegment-Test

H.264+B-Frame-Video wurde in 4 separate MPEG-TS-Segmente geschnitten; AAC lag separat segmentiert vor. Die Segmente wurden nacheinander mit dem 1.6.5-Muxer verarbeitet.

- Ausgabe: MPEG-TS mit H.264 + AAC
- Gesamtdauer: ca. 8,08 s
- Vollständiges ffmpeg-Decoding: **0 Warnungen/Fehler**

## Discontinuity-/Timestamp-Reset-Test

Zwei unabhängig gestartete TS-Epochen mit zurückgesetzten Zeitstempeln wurden durch `markDiscontinuity()` verbunden. 1.6.5 rebasiert die neue Epoche auf die laufende A/V-Zeitachse und setzt den TS-Discontinuity-Indikator.

- Ausgabe-Dauer: ca. 8,25 s
- Vollständiges ffmpeg-Decoding: **0 Warnungen/Fehler**

## Sicherheitsprüfungen am TS-Parser

- 33-Bit PTS/DTS ohne signed-32-bit-Bitshift: PASS
- MPEG-TS Syncverlust wird abgelehnt: PASS
- gesetztes Transport-Error-Bit wird abgelehnt: PASS
- DTS-Monotonie im B-Frame-Fixture: PASS
- Discontinuity-Indikator in erzeugtem TS: PASS

## Syntax / Version

- `node --check` für alle `.js` / `.mjs`: PASS
- Manifest-Version: `1.6.5`
- Package-Version: `1.6.5`
- Popup: `Browser Connector 1.6.5`

## Hinweis

Die lokalen Medien- und Muxingtests prüfen Struktur und Dekodierbarkeit. Host-/CDN-spezifische Netzwerkbedingungen können nur im echten Browser reproduziert werden. DRM bzw. verschlüsselte Streams werden weiterhin nicht umgangen.

## Chromium Load Smoke Test

Headless Chromium wurde mit 1.6.5 als einziger geladener Extension gestartet. Es wurden keine Manifest-, Syntax- oder Extension-Ladefehler erkannt. Die im Linux-Testcontainer ausgegebenen D-Bus-Warnungen sind umgebungsbedingt und nicht StreamForge-bezogen.
