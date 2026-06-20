# World Cup 2026 Live Bracket

An installable, responsive World Cup dashboard with group standings, match scores,
and a full knockout bracket. The site is hosted on GitHub Pages and its data is
updated automatically by GitHub Actions.

## Enable automatic data

1. Create an API-Football account and copy your API key.
2. In this GitHub repository, open **Settings → Secrets and variables → Actions**.
3. Create a repository secret named `API_FOOTBALL_KEY`.
4. Open **Actions → Update World Cup data → Run workflow**.

The key remains encrypted in GitHub Actions and is never included in the public
website.

The scheduled updater checks scores and standings every 30 minutes. This cadence
keeps the two-request refresh within API-Football's typical free daily allowance.

## Enable GitHub Pages

Open **Settings → Pages** and choose **GitHub Actions** as the source. The
`Deploy GitHub Pages` workflow publishes the site whenever `main` changes.

## Local preview

```sh
npm run serve
```

The checked-in preview data intentionally contains no fabricated scores. Once the
API secret is configured, the scheduled workflow replaces it with live tournament
data.
