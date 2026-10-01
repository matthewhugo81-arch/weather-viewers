# Delivery validation — 30 September 2026

## Source and archive checks

- Downloaded all 9 configured Nowster PNGs and all 8 configured Icelandic Met Office PNGs over HTTPS. PNG decoding and source dimensions verified.
- Final title-strip OCR re-run against **all 17 saved images**: matched every indexed valid time and lead. No pending entries remain in the supplied snapshot.
- Repeated full polling: all 17 unchanged products skipped; no duplicate records or files added.
- Validated all stored SHA-256 hashes, required timestamps, issue/valid/lead arithmetic, unique IDs, relative image paths and JSON/JS manifest equivalence.
- Header fixtures cover year rollover, month rollover, leap day, UTC analysis, allowed OCR substitutions, wrong weekday, wrong lead, invalid hour and unreadable text.
- Failure-path integration test in a separate scratch archive: an HTML response rejected as non-PNG, process exit 1 returned, all 17 pre-existing chart records retained.
- Manual-review integration test in a separate scratch archive: pending entry moved into charts, UTC run time calculated and both manifest outputs regenerated.
- JavaScript syntax and all static HTML asset/document links pass. Every referenced control ID exists. Source pages, Metbrief's short archive link and the GitHub Pages documentation link were opened successfully.

## Browser checks

Tested over localhost in the Codex browser:

- Initial selection finds three separate runs valid 3 October 2026 12Z.
- Single: one panel; 2-up: two panels; 4-up: three available images and one honest empty slot.
- Per-panel selection swaps the image and metadata while preserving the common valid time.
- Wipe: both full-resolution images load, 0% hides B, 100% exposes all B; keyboard slider operation works.
- Different-source/different-dimension selection displays an alignment warning.
- Source filtering, issue/lead filtering, conflicting-filter empty state, reset, and next-valid-time navigation work.
- Narrow 390px viewport: chart panels stack, valid-time selector has full width and the page has no horizontal overflow. Desktop layout visually inspected.
- No browser console errors observed. Preview saved as `preview.png`.

## Explicit limits

- The test browser blocks `file://` navigation. Direct-file browser launch could not be exercised. Offline loading uses ordinary local CSS, images and a classic `manifest.js` script, with no fetch, modules, server calls or external dependencies; JSON/JS agreement was verified.
- GitHub Pages was not deployed, and no scheduled Windows task was installed. The requested setup/deployment instructions are supplied. Hosting-path portability uses relative links; no server-side functionality is needed.
- Only the supplied live snapshot and parsing fixtures were tested. Future source outages, layout changes, unusual OCR substitutions and missed polling windows remain possible. Unrecognized headers are saved for review instead of assigned guessed dates.

## Usability update

- Embedded styling and viewer code into index.html: replacing that one file keeps existing archive data.
- Verified example selects T+96 and T+72 for the same valid time.
- Verified fitted wipe width (567px at the test viewport), 0% and 100% endpoints.
- Verified 2 October 12Z single-run state disables Chart B and the slider and explains the missing history.
- Duplicate panel selections are disabled. Wipe blocks same-run, mixed-source and differently sized pairs.

## Simplified latest-versus-previous update

- Browser verified: A automatically selects 30 September 12Z / T+72 for 3 October 12Z.
- B defaults to 30 September 00Z / T+84, then lists 29 September 12Z / T+96. Selecting the older B leaves A unchanged.
- Only forecast period and B are exposed as primary selectors; source is collapsed, issue/lead filters removed.
- Single-run period disables B. Compact wipe remains fitted at 567px width in the test viewport. No console errors.
- index.template.html plus source CSS/JS can be bundled using scripts/build-viewer.cjs.

## Combined-source short-term coverage update

- Default forecast-period menu now merges both sources: 13 distinct valid times in the supplied 17-image snapshot.
- Verified Icelandic 00/06/12/18 UTC analysis and T+24 products remain enabled in the archiver.
- Re-polled all 17 endpoints successfully: unchanged images skipped, zero download failures, zero pending reviews.
- Browser verified 30 September 06Z analysis and 1 October 06Z T+24 forecast display from the Icelandic source.
- Long-range latest/previous comparison still selects T+72 in A and T+84 in B for 3 October 12Z.
- Duplicate distributor copies do not become extra forecast runs. Mixed-source wipe is blocked; side-by-side comparison remains available.
- No browser console errors observed.

Online collector: all 31 saved headers matched; fresh collection of all 17 products passed with zero pending/failed downloads. Workflow YAML, locked dependencies and packaged manifest validated locally. GitHub execution and public deployment remain unverified pending user upload.
