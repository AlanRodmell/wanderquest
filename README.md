# WanderQuest

A mobile-first mystery walking app hosted directly by GitHub Pages.

The public entry point remains `index.html`. It loads the presentation and
application logic from separate static files, so no build step or backend is
required during the testing phase.

## Local development

Serve the repository with any static HTTP server, then open the displayed URL.
For example:

```sh
python3 -m http.server 8000
```

The app requires a tester-provided Geoapify key, which is stored locally in the
browser. This is an intentional testing-stage constraint; a future public
release should route API calls through a rate-limited server-side function.

The settings screen validates a key against Geoapify before saving it. Active
walks and the discovery journal are also stored only in the current browser.

## Features

- time-aware mystery walks that reserve an estimated return journey
- multi-select vibes with individually adjustable destination categories
- Endless Discovery browser with category, range and sorting controls
- on-device discovery journal and interrupted-walk resume
- live location updates, walking routes and destination arrival checks
- installable PWA shell with offline access to the home screen and journal
- custom UI accent and contrasting map-route colours saved per device

Map tiles, place searches, routing and Wikipedia enrichment still require a
network connection.

## Structure

- `index.html` — page structure and GitHub Pages entry point
- `styles.css` — visual design and responsive styles
- `app.js` — quest, map, location and persistence behavior
- `manifest.webmanifest` — install metadata and icons
- `service-worker.js` — cached application shell
- `icons/` — browser and installed-app artwork
