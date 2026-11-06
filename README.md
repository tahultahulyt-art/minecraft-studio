# Minecraft Studio

A free, on-device video editor for Android (WebView APK) and web. Made by Rahul_the_og.

- **Home**: Import, New video / Edit photo cards, tool shortcuts (real tools only; the rest are marked "Coming soon"), project list with search, bottom tabs.
- **Editor**: timeline with clips, text overlays, music, filters/effects, templates, transitions, frame stepping, undo/redo, crash recovery.
- **AI (optional)**: cloud captions / remove-background via your own free Gemini key. Works offline without it.
- **Export**: ffmpeg.wasm, fully on-device. No uploads, no watermark, no premium.
- **Backups**: portable `.mcs` project files.

Everything runs on your device. No account, no server, no ads.

## Status
v0.1 — first public build. See STATE.md for the honest feature list.

## Build the APK
GitHub Actions workflow `.github/workflows/apk.yml` builds `minecraft-studio.apk` and publishes it as a rolling release tagged `apk`.
