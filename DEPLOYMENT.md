# Matchbook deployment notes — no private sports API key

1. Deploy the folder to Netlify over HTTPS. The included `netlify.toml` maps `/api/football` to `netlify/functions/football.js`; that function aggregates the free/open data sources and applies CDN caching. No API-Football account or `API_FOOTBALL_KEY` is required.
2. The football gateway uses TheSportsDB's documented public v1 free key (`123`), Football-Data.co.uk CSV files, and OpenLigaDB. These are external services with their own coverage and rate/availability limits. TheSportsDB currently documents a 30-requests/minute free limit, so the gateway and browser cache aggressively.
3. The Netlify redirect rate-limits `/api/football` to reduce abuse. Do not remove caching/rate limiting on a public deployment unless you replace it with equivalent protection.
4. Replace every `https://YOUR-DOMAIN.example` value in `sitemap.xml` with the real production origin. Then add `Sitemap: https://YOUR-DOMAIN.example/sitemap.xml` to `robots.txt`.
5. Social/canonical metadata intentionally uses relative URLs because the production hostname was not provided. Once the hostname is known, absolute `og:image`, canonical and `og:url` values are preferable for social crawlers.
6. Analytics is privacy-gated and disabled until `<meta name="matchbook-ga-id" content="">` in `index.html` is filled with a real GA4 Measurement ID. If you do not want analytics, leave it blank.
7. The app has no ad code. If advertising or additional cookie-setting services are added, update the consent logic and Privacy Policy before launch.
8. Player and badge imagery is resolved at runtime through Wikidata/Wikimedia Commons. Matchbook only accepts Commons files whose metadata reports Public Domain, CC0, CC BY or CC BY-SA; if no confident licensed match is found, initials remain instead.
9. Because free sources do not equal a commercial worldwide feed, some league cards may have no current table, TheSportsDB's free roster endpoint may return only part of a squad, and the world-matches page combines a limited TheSportsDB day feed with supported Football-Data leagues. The UI reports these gaps rather than inventing values.

## Netlify quick deploy

- Put the project in GitHub and import that repository into Netlify, or deploy the folder with the Netlify CLI.
- No environment variable is required for football data.
- After deployment, test `/api/football?resource=teams&search=Arsenal`. A successful deployment returns JSON from the free-source gateway.
- Then test a league table, a squad page, a player page and the Matches page in the UI.
