# Matchbook open-data implementation notes

## Football data
- Removed API-Football and its private-key requirement completely.
- `/api/football` is now a no-secret-key Netlify gateway combining TheSportsDB v1, Football-Data.co.uk CSV datasets and OpenLigaDB.
- Team search, team identity, squad/player biography, club-history and contract enrichment use TheSportsDB where the free v1 methods support them.
- League tables try TheSportsDB first. For supported European leagues, Matchbook can calculate the table from current-season Football-Data results; OpenLigaDB is the final documented/open fallback where it carries the competition.
- Football-Data/OpenLigaDB team IDs are never treated as TheSportsDB IDs. Their table rows are registered as virtual teams and are resolved by name/country against TheSportsDB only when a visitor opens the squad.
- Today's Matches view combines TheSportsDB's free schedule-day results with current-season Football-Data fixtures/results for supported leagues. Coverage is deliberately labelled partial.
- Detailed per-player season statistics are no longer fabricated or implied when the free source does not supply them. The interface shows `Not available` instead.
- TheSportsDB's free `lookup_all_players` method can return only a limited number of squad members; the team page warns that the roster may be partial.

## Images
- Club/player media still comes only from free-license Wikimedia Commons files.
- Commons search is tried first. If it cannot confidently identify an image, Wikidata entity search is used as an identity-aware fallback to locate the entity's Commons image (P18).
- Public Domain, CC0, CC BY and CC BY-SA are accepted; visible author/licence attribution links to the Commons file page.

## Frontend / design
- The original Oswald + Inter font design remains restored.
- Existing privacy, SEO, HTTPS, responsive/mobile, accessibility, 404, form-validation, spam-throttling and optional-consent analytics work remains in place.
- No football API secret or sports-service environment variable is needed to deploy this version.

## Known limitations
- There is no single free source with ESPN-like global breadth and depth. Matchbook therefore prefers correct partial data over invented completeness.
- TheSportsDB free API documents rate limits and result limits; Football-Data covers selected leagues; OpenLigaDB coverage is community-driven.
- Contract/history records can be incomplete. Missing values are not evidence that a player has no contract, previous club or statistic.
- Live match statistics such as possession and shots are not available consistently from this free-source combination and remain blank when unsupported.
