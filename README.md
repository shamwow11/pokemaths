# Pokemaths

Adaptive 0–12 times-table trainer for an iPad, built to run as a home-screen
web app on hardware Apple no longer supports (iPad Air 2 / iPadOS 15.8.5,
which can take neither TestFlight nor Expo SDK 56's iOS 16.4 minimum).

**Add to Home Screen in Safari** for a fullscreen app with its own icon.
Works offline after the first load; progress is stored on the device.

The adaptive engine in `engine.js` is shared verbatim with the native build —
it is plain ES-module JavaScript with no React Native imports. Regenerate this
folder from the project root with `python3 tools/build-web.py`.
