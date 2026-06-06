# Hike Route Checkpointer

A static, browser-only GPX route and geotagged checkpoint photo mapper for Sussex and the South East of England.

## Run

Serve the directory from any basic static web server:

```sh
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.

## Features

- Imports one or more GPX route files and overlays them on an OpenStreetMap basemap.
- Imports geotagged photos, including iPhone HEIC files, extracts GPS EXIF data in the browser, and adds checkpoint pins.
- Shows the OS grid reference for any point clicked on a route, with an option to add that point as a manual checkpoint.
- Builds a route schedule with automatic Start and End checkpoints, route-ordered photo/manual checkpoints, via points grouped into the next checkpoint, configurable miles/km display, target speed, checkpoint stop duration, and arrival/finish estimates.
- Restores imported GPX routes and checkpoint metadata after reload using browser local storage.
- Shows standard six-figure OS grid references, for example `TQ 302 078`.
- Exports ordered checkpoints as CSV or GeoJSON.
- Does not upload files or require a server component.

## Notes

- OpenStreetMap tiles are loaded from the public OSM tile service and must retain attribution.
- Saved route overlays and checkpoint metadata live in the current browser's local storage. Very large GPX files may exceed browser storage limits.
- Photos without GPS EXIF metadata are reported as warnings.
- HEIC thumbnails are shown on a best-effort basis. Browsers that cannot decode HEIC will still import the GPS metadata and show the checkpoint pin.
- Restored photo checkpoints keep their filename, location, grid reference, timestamp, and checkpoint/via type. Image thumbnails are temporary browser object URLs and are not restored after a reload.
- The British National Grid conversion is suitable for six-figure, 100 m references; it is not intended as a survey-grade OSTN15 transformation.
