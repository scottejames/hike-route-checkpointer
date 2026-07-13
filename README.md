# Hike Route Checkpointer

A GPX route and geotagged checkpoint photo mapper for Sussex and the South East of
England, built with React 19 + TypeScript + Vite and an AWS Amplify Gen2 backend.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Leaflet (map rendering), `@tmcw/togeojson`
  (GPX parsing), `exifr` (EXIF extraction).
- **Backend:** AWS Amplify Gen2 — Cognito auth (email/password, opt-in) and
  owner-scoped DynamoDB models (`Route`, `Checkpoint`, `UserSettings`) via
  `amplify/data`.
- **Verification:** Vitest + React Testing Library, oxlint.
- See `CODING_GUIDELINES.md` for the conventions this codebase follows.

## Run

```sh
npm install
npx ampx sandbox   # first run only: provisions a personal dev backend and writes
                   # amplify_outputs.json (gitignored — every developer/environment
                   # generates their own)
npm run dev
```

Then open the URL Vite prints (typically `http://localhost:5173/`).

Signing in is optional — routes, checkpoints, and settings work entirely from
`localStorage` when signed out, and sync to the backend (so they follow you across
devices) once you sign in via the account button.

## Verify

```sh
npm run verify   # lint + typecheck the Amplify backend + build + test
```

## Deploy

This app deploys via **AWS Amplify Hosting**, git-based: connect this repository to
an Amplify Hosting app in the AWS Console (one-time setup), and pushes to the
connected branch trigger `amplify.yml`'s backend deploy (`ampx pipeline-deploy`) and
frontend build automatically.

## Features

- Imports one or more GPX route files and overlays them on an OpenStreetMap basemap.
- Imports geotagged photos, including iPhone HEIC files, extracts GPS EXIF data in the browser, and adds checkpoint pins.
- Shows the OS grid reference for any point clicked on a route, with an option to add that point as a manual checkpoint.
- Builds a route schedule with automatic Start and End checkpoints, route-ordered photo/manual checkpoints, via points grouped with the next stop as separate editable rows, configurable miles/km display, target speed, checkpoint stop duration, and arrival/finish estimates.
- Restores imported GPX routes and checkpoint metadata after reload using browser local storage, or from the backend across devices when signed in.
- Shows standard six-figure OS grid references, for example `TQ 302 078`.
- Exports ordered checkpoints as CSV or GeoJSON.
- Files are never uploaded anywhere — GPX/photo parsing happens entirely in the browser; only the resulting route/checkpoint/settings data syncs to the backend, and only when signed in.

## Notes

- OpenStreetMap tiles are loaded from the public OSM tile service and must retain attribution.
- When signed out, route overlays and checkpoint metadata live only in the current browser's local storage. Very large GPX files may exceed browser storage limits.
- Photos without GPS EXIF metadata are reported as warnings.
- HEIC thumbnails are shown on a best-effort basis. Browsers that cannot decode HEIC will still import the GPS metadata and show the checkpoint pin.
- Restored photo checkpoints keep their filename, location, grid reference, timestamp, and checkpoint/via type. Image thumbnails are temporary browser object URLs and are not restored after a reload or a sync.
- The British National Grid conversion is suitable for six-figure, 100 m references; it is not intended as a survey-grade OSTN15 transformation.
- The PWA icons in `public/` are solid-color placeholders — swap them for real branding whenever that's ready.
