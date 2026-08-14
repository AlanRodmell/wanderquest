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

## Structure

- `index.html` — page structure and GitHub Pages entry point
- `styles.css` — visual design and responsive styles
- `app.js` — quest, map, location and persistence behavior
