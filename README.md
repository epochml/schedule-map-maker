# schedule-map-maker

Static IMSA schedule map generator. Schedule parsing, room lookup, and path generation run in the browser against static assets.

## Local Static Build

```bash
npm run build
npm run serve
```

Then open `http://localhost:8000`.

## Tests

```bash
npm test
```

## Legacy Rust Server

The Actix/Rust server is still present for reference, but the app no longer requires dynamic routes for normal use.
