# schedule-map-maker

Static IMSA schedule map generator. Schedule parsing, room lookup, and path generation run in the browser against static assets.

## Local Static Build

```bash
npm run build
npm run serve
```

Then open `http://localhost:8000`.

## GitHub Pages Deployment

This app is configured to run as a project site at:

```text
https://1337isnot1337.github.io/schedule-map-maker/
```

The included `.github/workflows/pages.yml` workflow builds `dist/` and deploys
it to GitHub Pages on every push to `main`.

```bash
npm test
npm run build
```

On GitHub, open the repository settings, go to **Pages**, set **Source** to
**GitHub Actions**, and push to `main`.

## Tests

```bash
npm test
```

## Legacy Rust Server

The Actix/Rust server is still present for reference, but the app no longer requires dynamic routes for normal use.
