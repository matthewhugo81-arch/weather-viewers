# Online operation

This project is hosted in `matthewhugo81-arch/weather-viewers`, under `ukmo-fax-archive/`.

The repository-level `.github/workflows/ukmo-fax.yml` checks both sources hourly, at 17 minutes past the hour (UTC). GitHub schedules may run late. The task uses a cross-platform Node.js collector with Tesseract OCR, rather than the Windows-only local script. Your computer does not need to be running.

## What is saved

- Every new original PNG is saved unchanged under its SHA-256 hash.
- Images and both manifest files are committed to the GitHub repository, so they survive between runs and are recoverable from repository history.
- No automatic deletion of old charts is configured. Four-up is a viewing mode, not a retention limit.
- Each Sunday at approximately 03:17 UTC, and on manual workflow runs, a separate archive snapshot is uploaded to the workflow's Artifacts area. These extra snapshots expire after 90 days; the committed archive remains.
- Repository history and workflow artifacts are both on GitHub; this is not an off-provider disaster-recovery copy. Download a periodic snapshot if you want an independent backup.

## Publishing

The workflow preserves the repository's current publishing mode. For branch-based Pages it explicitly requests a Pages rebuild after committing the archive (a bot commit alone does not start a Pages build). For Actions-based Pages it publishes all existing viewers plus this new subdirectory together. It verifies that the public manifest reaches the new timestamp.

Existing branch-based publishing must use `main` and `/ (root)`. The job checks that setting and fails visibly if different, instead of changing settings silently.

## Checking operation

Open the repository's **Actions → UKMO FAX online archive**. A green run means collection, validation, archive commit and public-manifest verification succeeded. **Run workflow** performs an immediate collection and also saves an additional backup snapshot. If collection partially fails, successfully downloaded images are still committed and published, then the workflow is marked failed for attention. Unreadable headers stay saved in the review queue.

The viewer loads the current JSON snapshot on each hosted page load and shows the last check time. A warning appears if it has not been checked for more than three hours. Refreshing the website retrieves the published archive; it does not itself run collection.

GitHub may delay scheduled runs. Public-repository schedules can be disabled after 60 days without repository activity; check the Actions page if updates stop. The collector's regular archive commits normally provide ongoing activity, but this is not a service-level guarantee. Monitor archive size against GitHub's repository and Pages limits as history grows.

## Maintenance

The Node dependencies are pinned in package.json and pnpm-lock.yaml. Run `pnpm install --frozen-lockfile --ignore-scripts`, then `node scripts/test-online.cjs` to test OCR against saved charts. The test never changes chart originals. `node scripts/collect-online.cjs` polls sources. The original archive.bat remains available for optional local collection, but does not upload local changes.

The hourly workflow, rather than Windows Task Scheduler, is the normal online collection mechanism. Keep the whole `archive` directory and manifest when moving or restoring this site.

References: [GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build).

## Active archive retention
Each online collection retains the newest four distinct issue times per valid time, preferring Metbrief/Nowster for duplicate source copies, then the latest revision from that source. Valid times older than seven days (UTC, rolling 168 hours) are removed. Future valid times remain. Pending OCR reviews are preserved. Unreferenced PNG files are removed from the active archive. Git commit history and existing backup artifacts retain earlier files: this policy does not rewrite history or cap total Git repository storage. Local PowerShell collection does not apply this online retention step automatically; with Node installed, run node scripts/retain-archive.cjs after local collection.

