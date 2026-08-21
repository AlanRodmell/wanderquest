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

Run the dependency-free unit suite with:

```sh
npm test
```

The app requires a tester-provided Geoapify key, which is stored locally in the
browser. This is an intentional testing-stage constraint; a future public
release should route API calls through a rate-limited server-side function.

The settings screen validates a key against Geoapify before saving it. Active
walks and the discovery journal are also stored only in the current browser.

## Features

- time-aware mystery walks that reserve an estimated return journey
- adjustable destination categories for Mystery Walks
- Serendipity Dial that shifts suggestions from nearby and familiar to unusual and bold
- focused three-step mobile setup wizard for route, filters and duration
- five-step How Far route builder with loop, there-and-back and point-to-point options
- miles/kilometres targets, nearby-place waypoints, mapped previews and route regeneration
- checkpoint-verified loop, there-and-back and point-to-point completion
- one-tap Endless Walks with no initial setup requirement
- Endless Discovery browser with activity, creative, food, culture, nature and history filters
- on-device discovery journal and interrupted-walk resume
- live location updates, walking routes and destination arrival checks
- optional Guided Walk Mode with route cues, progress, off-route alerts, haptics and screen wake lock
- manual re-routing from the user's latest GPS position
- installable PWA shell with offline access to the home screen and journal
- journal memories with favourites, ratings, personal notes and on-device photos
- custom UI accent and contrasting map-route colours saved per device

Map tiles, place searches, routing and Wikipedia enrichment still require a
network connection.

## Structure

- `index.html` — page structure and GitHub Pages entry point
- `styles.css` — visual design and responsive styles
- `discovery-config.js` — place categories and discovery grouping
- `route-progress.js` — distance-route checkpoints and GPS completion rules
- `app.js` — quest, map, location and persistence behavior
- `manifest.webmanifest` — install metadata and icons
- `service-worker.js` — cached application shell
- `icons/` — browser and installed-app artwork
