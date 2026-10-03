# Wetterzentrale viewer

The shared model registry and viewer enforce a T+240 ceiling. UKMO, ICON and ECMWF use cycle-specific lead sequences; EC ENS retains its explicitly labelled same-lead history.

The collector reads the initialisation and valid dates printed on each PNG, checks that both agree with the requested run/lead, and excludes uncertain readings. It stores the exact verified bytes under their SHA-256 filename. The viewer never uses a rotating remote PNG as a date-verified chart.

`availability.json`, `charts/` and OCR language data are generated and ignored by Git. GitHub Actions caches the current snapshots, prunes superseded objects, and publishes them in the Pages artifact alongside all existing viewers and the UKMO FAX archive. No model imagery is added to Git history.

## Publishing

Before merging this update, set **Settings → Pages → Build and deployment → Source → GitHub Actions**. The existing `.github/workflows/ukmo-fax.yml` remains the single site publisher and preserves the UKMO FAX collection and retention rules. Its schedule checks Wetterzentrale approximately every 30 minutes. A source failure retains the previous snapshot; an index over 75 minutes old is withheld by the viewer. GitHub schedules are best effort.

To publish immediately after changing Pages settings, run **Weather charts and UKMO FAX archive** from the Actions tab. The first run downloads and reads all configured charts; subsequent runs use conditional requests and cached verified copies. OCR can conservatively exclude a chart when its printed header cannot be read reliably. The generated index reports those filenames and reasons.

## Local checks

With Node 22 and pnpm 11:

```
pnpm install --frozen-lockfile --ignore-scripts
node --test test.cjs
node check-availability.cjs
```

Serve the repository root to test the viewer; a file URL cannot fetch the date index. `WZ_MODELS=ukmo` limits a diagnostic collection to selected model keys and must not be set in production.
