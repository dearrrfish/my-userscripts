# Legacy migration

The seven existing script and style files were moved unchanged into
`legacy-static/`. The stylesheet retains its relative path at
`legacy-static/styles/spotify-side-mode.css`.

There are no compatibility copies at the former root paths. This migration only
moves files; it does not change or convert the legacy scripts.

Local raw logs, source caches, and evolution proposal drafts belong under `.fm/`.
Conversion artifacts belong under `artifacts/`. Both directories are ignored;
approved evolution documentation under `docs/evolution/` remains trackable.
