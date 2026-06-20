# World Cup 2026 Live Bracket

An installable, responsive World Cup dashboard with group standings, match scores,
and a full knockout bracket. The site is hosted on GitHub Pages and its data is
updated automatically by GitHub Actions.

## Automatic data

The site uses ESPN's public World Cup feeds for the group tables, schedule, match
status, scores, and knockout participants. No API key is required.

GitHub Actions refreshes the checked-in data every 15 minutes. You can also run
**Actions → Update World Cup data → Run workflow** whenever you want an immediate
refresh.

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
