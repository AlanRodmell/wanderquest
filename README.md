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
- optional multi-select vibes for Mystery Walks with individually adjustable destination categories
- focused four-step mobile setup wizard for route, vibes, filters and duration
- five-step How Far route builder with loop, there-and-back and point-to-point options
- miles/kilometres targets, nearby-place waypoints, mapped previews and route regeneration
- one-tap Endless Walks with no initial vibe requirement
- Endless Discovery browser with activity, creative, food, culture, nature and history filters
- on-device discovery journal and interrupted-walk resume
- live location updates, walking routes and destination arrival checks
- manual re-routing from the user's latest GPS position
- installable PWA shell with offline access to the home screen and journal
- custom UI accent and contrasting map-route colours saved per device

Map tiles, place searches, routing and Wikipedia enrichment still require a
network connection.

## Structure

- `index.html` — page structure and GitHub Pages entry point
- `styles.css` — visual design and responsive styles
- `discovery-config.js` — place categories, vibe defaults and discovery grouping
- `app.js` — quest, map, location and persistence behavior
- `manifest.webmanifest` — install metadata and icons
- `service-worker.js` — cached application shell
- `icons/` — browser and installed-app artwork
