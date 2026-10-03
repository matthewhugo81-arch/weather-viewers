# Online operation

The public viewer remains at https://matthewhugo81-arch.github.io/weather-viewers/ukmo-fax-archive/.

## Independent collection

Since 3 October 2026, the existing Supabase project runs `fax-source-check-every-five-minutes` via pg_cron/pg_net. Every five minutes it invokes the authenticated `fax-collector` Edge Function once for each of the 17 fixed products in `hosted/products.json`. This runs with the browser and user's computer closed and does not depend on GitHub scheduling or the Wetterzentrale scan.

Each source is checked independently. New originals are hashed, their printed date and forecast lead are read using pinned Tesseract WASM, and weekday/date/hour/lead consistency is validated before publishing. No run date is inferred from the download time. Unknown layouts or unreadable dates produce a product error while prior charts remain available. A database claim prevents overlapping source checks within two minutes. Failed products retry on the next five-minute cycle.

Original PNG bytes are stored unchanged in the `fax-archive` storage bucket. Verified metadata is in `fax_chart_archive`; individual check results are in `fax_source_status`. Both tables are inaccessible to anonymous/authenticated database clients; only the authenticated Edge Function's service role writes them. The viewer's existing public anon key authorizes the function API, not database writes. Collection accepts only registry product IDs and never accepts image URLs or chart metadata from the caller.

The viewer reads the live manifest directly. It checks every minute and on return to the tab, applying new charts in place while preserving the selected forecast lead (or archive valid time) and comparison mode. It defers changes during unsaved drawing work. The header reports the oldest successful source check across all 17 products; errors and overdue checks remain visible. An unavailable live service falls back on initial load to the saved GitHub manifest; an already open live session retains its verified charts while retrying.

Shared drawings continue using the existing content-hash filenames, so they remain attached to the correct original chart in either archive.

## Backup and fallback

The existing GitHub job remains a backup: `scripts/import-hosted.cjs` copies independently collected originals into repository history, verifying SHA-256 before saving, and the regular collector also checks source images. GitHub scheduling is best effort. It is no longer the primary clock or publication route for chart arrivals.

The normal view shows the latest available Analysis, T+24, T+36, T+48, T+60, T+72, T+84, T+96 and T+120 independently. Each stays in Chart A until that lead has a newer replacement. Earlier forecasts for exactly the selected valid time appear in Chart B. Historical navigation is explicitly selected using Browse: Archive by valid time. The archive retains seven days of past valid times, up to four runs per valid time, and pins every current source product regardless of age or how many newer forecasts share its valid time. Historical charts seeded from the previous GitHub archive remain available through their existing filenames. Current sources are additionally copied to hosted storage on their next successful check. Existing repository history and weekly workflow backup artifacts are retained.

## Verification and maintenance

- `node scripts/validate.cjs`: original hashes, date consistency, companion manifest, controls and local links.
- `node scripts/test-loading.cjs`: image request deduplication, caching and retries.
- `node scripts/test-refresh.cjs`: delayed status, in-place refresh, drawing protection and failure retention.
- `node scripts/test-online.cjs`: broad OCR reread of saved charts; a historical analysis header can require review even when previously indexed correctly.
- Inspect `cron.job_run_details` AND `fax_source_status`: a successful cron dispatch alone does not prove every HTTP request succeeded.
- `hosted/` contains the deployed function source and fixed product registry. `shared/automatic-edge.js` contains the drawing service.

Source publication delays remain outside this system's control. The practical target is a new source chart appearing within one five-minute collection interval plus the viewer's one-minute check; this is not an uptime guarantee.
A daily cleanup removes historical hosted originals and metadata older than eight days by valid time (one day beyond the seven-day visible window). The latest available chart for each source product is exempt until its replacement arrives. GitHub history remains a separate backup. The cleanup uses the storage API and never rewrites Git history.
