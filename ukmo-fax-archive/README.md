# UKMO FAX Run Archive & Comparison

**Online operation:** see [ONLINE.md](ONLINE.md) for the hourly GitHub collector, public publishing and archive backups. The local Windows instructions below are optional; they are not required to keep the hosted site current.

A portable, dependency-free HTML/CSS/JavaScript viewer plus a Windows chart collector. Compare forecasts **for exactly the same valid time** across nominal runs and lead hours. Includes Single, 2-up, 4-up and wipe modes, per-panel run selection, a lead-labelled period selector and previous-run selector, an inventory and links to unchanged originals. All times are UTC.

## Start locally

1. Extract the whole project to a permanent folder, for example `C:\Weather\ukmo-fax-archive`.
2. Double-click `index.html`. The included real chart snapshot works immediately, including offline. Keep the `archive` folder beside it.
3. Double-click `archive.bat` to collect the current products. Reload the viewer when it finishes.

For this update, replace only `index.html` in your existing project folder. Its CSS and viewer JavaScript are embedded, so your existing `archive` folder and manifest continue to work. Do not replace your archive with the sample if you have collected more charts. The separate CSS/JS files remain as readable source copies.

No server, Python, Node.js or package installation is required for ordinary use. `manifest.js` is a generated companion to `manifest.json`, allowing the browser to read the archive under `file://`. Nothing is downloaded by the viewer itself. Hosted and local views use the same relative image paths.

Archiving requires Windows 10/11, Windows PowerShell 5.1, the Windows-supplied `curl.exe`, internet access and an English OCR language pack. Use `powershell.exe`, not PowerShell 7, for the Windows Runtime OCR bridge. The BAT file uses a process-only execution-policy bypass; it does not change the machine policy. Organization-enforced policy may still prevent execution.

## Using the comparison

1. Choose **Forecast period**. The menu starts with the actual lead of the newest saved chart for each valid time: T+24, T+36, T+48, etc. The adjacent date/time is the forecast's valid time. Leads are relative to each chart's own run, not the current clock; older products can remain available when no newer chart has been captured. Unsupported T+12/T+18 products are not invented.
2. **Chart A is fixed automatically to the newest saved run** for that source and valid time. It has no dropdown.
3. **Chart B defaults to the immediately previous saved run**, with older runs listed in descending issue-time order. Changing B never changes A or the valid time.
4. Use **2-up** or **Wipe / slider**. Wipe retains its compact screen-fitted size. Single shows A only. 4-up shows A, your selected B, and the next two older runs after B; unavailable slots remain empty.

Only one run saved? B is disabled and the page explains that no previous forecast is archived. Different downloads of the same run are treated as revisions; the newest captured revision represents that run. Changing distributor is under the collapsed **Source** setting, keeping the normal workflow to two dropdowns. The default combined view includes both distributors and all saved valid times, including Icelandic 00/06/12/18 UTC analyses and T+24 charts. For duplicate copies of the same run, Nowster is preferred; within a source, the newest captured revision is used. Copies do not count as additional runs. Source attribution appears on each chart. Mixed-source earlier forecasts can be compared in 2-up; wipe is disabled when sources differ. A can be an analysis (T+0), with earlier forecasts for the same valid time in B.

The supplied snapshot contains three runs valid **3 October 2026 12Z**. A shows the 30 September 12Z run (T+72). B initially shows 30 September 00Z (T+84), then offers 29 September 12Z (T+96). Run archive.bat regularly and reload to grow this history. Merely opening the page does not collect charts.

The full in-page help and archive inventory are collapsed by default. **Open original** opens the unchanged full-resolution image. This update can be installed by replacing only index.html; keep your existing archive folder. To rebuild the bundled HTML after editing source copies, run node scripts/build-viewer.cjs (Node is needed for development only).

## Sources researched and checked on 30 September 2026

### Metbrief / Nowster

[Metbrief's FAX page](https://www.metbrief.com/EGRRb.html#00) embeds images hosted by Nowster, rather than hosting those charts itself. The underlying page specifies HTTP URLs; the same endpoints were verified successfully using **HTTPS**:

`https://bethyngalw.nowster.me.uk/charts/UKCpf{lead:000}.png`

| Lead | Direct product |
|---:|---|
| 0 | [UKCpf000.png](https://bethyngalw.nowster.me.uk/charts/UKCpf000.png) |
| 24 | [UKCpf024.png](https://bethyngalw.nowster.me.uk/charts/UKCpf024.png) |
| 36 | [UKCpf036.png](https://bethyngalw.nowster.me.uk/charts/UKCpf036.png) |
| 48 | [UKCpf048.png](https://bethyngalw.nowster.me.uk/charts/UKCpf048.png) |
| 60 | [UKCpf060.png](https://bethyngalw.nowster.me.uk/charts/UKCpf060.png) |
| 72 | [UKCpf072.png](https://bethyngalw.nowster.me.uk/charts/UKCpf072.png) |
| 84 | [UKCpf084.png](https://bethyngalw.nowster.me.uk/charts/UKCpf084.png) |
| 96 | [UKCpf096.png](https://bethyngalw.nowster.me.uk/charts/UKCpf096.png) |
| 120 | [UKCpf120.png](https://bethyngalw.nowster.me.uk/charts/UKCpf120.png) |

Metbrief labels analysis and T+24 as six-hourly, and the longer-range products with different publication schedules. Its page also links a [24-hour archive](https://www.metbrief.com/resources/asxxfsxx.html). This is not a reliable long-term history or a machine-readable timing API. The page's own update date is old; the schedule text is descriptive, not a freshness guarantee. Poll the fixed image endpoints rather than parsing HTML or assuming an entire suite updates together.

### Icelandic Met Office

The [flugkort directory](https://brunnur.vedur.is/flugkort/) exposes these UKMO surface products:

| Product | Meaning | Available suffixes |
|---|---|---|
| `PPVA89_EGRR_HHMM.png` | Analysis, T+0 | `0000`, `0600`, `1200`, `1800` |
| `PPVE89_EGRR_HHMM.png` | Forecast, T+24 | `0000`, `0600`, `1200`, `1800` |

For example: [analysis 00](https://brunnur.vedur.is/flugkort/PPVA89_EGRR_0000.png), [forecast 00](https://brunnur.vedur.is/flugkort/PPVE89_EGRR_0000.png). All eight endpoints are enumerated in `sources.json` and were downloaded and decoded successfully. No longer-lead UKMO surface products were present in the inspected directory. Other listed aviation files include stale products; they are deliberately excluded.

Both hosts overwrite stable filenames. The clock suffix is **not a full date**. Neither host exposes a verified full issue/valid-time metadata API in these resources. Last-Modified describes the web file, not the forecast's run. Neither it nor download time is used to derive chart validity.

### Collection strategy

`sources.json` is an explicit product registry. Scheduled runs do no page scraping: they request only these 17 direct HTTPS PNGs. Disable unused products with `enabled: false` to reduce traffic. This is a public-image mirror strategy, not a guaranteed official service/API; if paths change, update the registry after checking the source.

Each download is checked for the PNG signature, hashed with SHA-256, and stored byte-for-byte under its hash. The Windows OCR engine reads a temporary enlarged title strip. It never rewrites a stored image. Date, weekday, synoptic hour and printed lead must agree before indexing. Two narrow OCR glyph substitutions are allowed: `OO UTC` → `00 UTC` after `valid`, and `0+24)` → `T+24)` in the lead token. Unknown layouts, unreadable dates and mismatches go to the review queue. OCR is not infallible: compare header text when investigating an important forecast change.

`issue_time` is the **nominal forecast reference/run time**, calculated as printed valid time minus lead. It is not an assertion about publication time. For analyses, issue equals valid. A publication timestamp is not recoverable from these filenames. Changed images with the same run/valid/lead are kept as separate revisions; identical bytes for the same source/product are skipped. Different-source images are not conflated.

Downloads have timeouts, HTTPS-only redirects and retries. Concurrent writers are prevented by an exclusive file lock. JSON and JS files are replaced individually with backup files retained; an interrupted run can leave them temporarily out of sync, and the next successful poll regenerates both. The viewer reads only the JS snapshot. Download failures return exit code 1 while successful products are still saved. Unreadable headers are successful captures in `pending`, reported by a banner. No retention/deletion policy is applied.

## Archive format

```text
ukmo-fax-archive/
  index.html / style.css / app.js
  sources.json
  archive.bat
  scripts/
    Archive.ps1 / Ocr.ps1 / Review.ps1
    Test-Archive.ps1 / validate.cjs
  archive/
    manifest.json       # canonical metadata, schema_version: 1
    manifest.js         # generated window.FAX_ARCHIVE assignment
    objects/
      metbrief-nowster/<full-sha256>.png
      vedur/<full-sha256>.png
  examples/manifest.example.json
  manifest.schema.json
```

Required indexed-chart fields: `issue_time`, `valid_time`, `lead_hours`, `source`, `filename`, `download_time`. Timestamps use ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ssZ`). Filename is relative to the project root. Additional fields record ID, source URL, product, hash and metadata method. The wrapper contains `schema_version`, `updated_at`, `charts` and `pending`. Pending entries have null issue/valid times and a `review_reason`; they are never offered in the comparison controls. See the example manifest and schema for exact entries. Never move a chart image without updating its filename in both manifest outputs.

## Scheduling on Windows

An hourly poll is a reasonable initial setting. The scheduler is not installed automatically by this delivery.

In **Task Scheduler → Create Task**:

1. Name: `UKMO FAX Archive`. Use your normal Windows account (with its English OCR pack); administrator privileges are unnecessary.
2. Trigger: Daily, repeat every **1 hour**, indefinitely.
3. Action: Start a program. Program: `powershell.exe`.
4. Arguments (adjust the folder):

   ```text
   -NoLogo -NoProfile -ExecutionPolicy Bypass -File "C:\Weather\ukmo-fax-archive\scripts\Archive.ps1"
   ```

5. Start in: `C:\Weather\ukmo-fax-archive`.
6. Settings: Run as soon as possible after a missed start; if already running, **Do not start a new instance**. Choose battery/network conditions appropriate to your machine.
7. Run the task once and verify `archive/manifest.json` changes. Check Last Run Result and Task History for failures. If using “Run whether user is logged on or not”, test that mode explicitly: OCR language availability can depend on the task account. The computer must be awake and online for each poll; missed overwritten products cannot necessarily be recovered.

For a one-off logged run in PowerShell:

```powershell
.\archive.bat *> poll.log
```

## Reviewing unrecognized headers

Open `archive/manifest.json`, look in `pending`, and open the record's `filename`. Read the printed valid UTC date and lead from the actual image. After checking them, use:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Review.ps1 -Id "COPY-EXACT-ID-FROM-PENDING" -ValidTime "2026-10-03T12:00:00Z" -LeadHours 84
```

This moves that entry into `charts`, calculates its nominal run time, labels the method `manual`, and updates both manifest outputs. No image is modified. After improving OCR, `archive.bat -Reprocess` retries pending hashes still available at the current product URLs. For older overwritten pending images, use the review command, which works on the saved record.

If a source changes layout, preserve its pending originals, update the title-strip handling in `Ocr.ps1`, and verify the result against the printed dates before relying on it. Do not replace failed OCR with today's date or a guessed cycle.

## GitHub Pages deployment

1. Create a GitHub repository and put **the contents of this project folder at its root**, including `.nojekyll`, the `archive` directory and both manifests. Do not upload just `index.html`.
2. Commit/push to `main`. In the repository's **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and Save.
3. Open the Pages address GitHub provides after deployment. Relative paths support repository subdirectories; there is no domain-specific configuration.
4. After local polling, commit/push the new PNGs, `archive/manifest.json` and `archive/manifest.js` together. Pages is read-only hosting: it cannot execute the PowerShell collector and does not automatically receive your local files. Arrange your own authenticated publishing workflow if unattended uploads are wanted. No credentials or automatic Git pushes are embedded here.

The current [GitHub Pages branch-publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) describe these settings. Watch repository/Pages storage limits as the image history grows. Keep a separate backup of the archive and manifest; Git history is not a substitute for a storage plan.

## Attribution and publication

Original charts carry Met Office © Crown Copyright and retain their embedded attribution. Metbrief/Nowster and the Icelandic Met Office are image distributors. This project makes no claim that a mirror grants blanket redistribution rights. Check the applicable Met Office and distributor reuse terms for your intended public archive before publishing the images. No external image hotlinks, API keys, tracking or CDN libraries are used by the viewer.

## Validation

Optional checks (Node.js required only for the second):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-Archive.ps1
node .\scripts\validate.cjs
```

These check date rollover, mismatched/unreadable headers, image SHA-256 integrity, PNG signatures, manifest consistency, timestamp arithmetic, local links and control IDs. See `VALIDATION.md` for the delivered snapshot's live-source and browser checks. A source working at delivery is not a guarantee of future availability.
