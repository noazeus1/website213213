const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const SPORTSDB_DOCS = 'https://www.thesportsdb.com/documentation';
const OPENLIGA_BASE = 'https://api.openligadb.de';
const OPENLIGA_DOCS = 'https://api.openligadb.de/index.html';
const FOOTBALL_DATA_BASE = 'https://www.football-data.co.uk/mmz4281';
const FOOTBALL_DATA_DOCS = 'https://www.football-data.co.uk/downloadm.php';

const FOOTBALL_DATA_LEAGUES = {
  epl: { code: 'E0', name: 'Premier League', country: 'England' },
  champ: { code: 'E1', name: 'Championship', country: 'England' },
  laliga: { code: 'SP1', name: 'La Liga', country: 'Spain' },
  seriea: { code: 'I1', name: 'Serie A', country: 'Italy' },
  bundesliga: { code: 'D1', name: 'Bundesliga', country: 'Germany' },
  ligue1: { code: 'F1', name: 'Ligue 1', country: 'France' },
  eredivisie: { code: 'N1', name: 'Eredivisie', country: 'Netherlands' },
  primeira: { code: 'P1', name: 'Primeira Liga', country: 'Portugal' },
  scotland: { code: 'SC0', name: 'Premiership', country: 'Scotland' },
  belgium: { code: 'B1', name: 'Pro League', country: 'Belgium' },
  turkey: { code: 'T1', name: 'Super Lig', country: 'Turkey' },
  greece: { code: 'G1', name: 'Super League', country: 'Greece' },
};

function json(statusCode, body, ttl = 0) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (ttl > 0) {
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    headers['Netlify-CDN-Cache-Control'] = `public, durable, s-maxage=${ttl}, stale-while-revalidate=${Math.min(ttl * 2, 86400)}`;
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  return { statusCode, headers, body: JSON.stringify(body) };
}

function clean(value, max = 160) {
  if (value == null) return '';
  const text = String(value).trim();
  if (text.length > max || /[<>\r\n]/.test(text)) throw new Error('Invalid request parameter.');
  return text;
}

function numeric(value) {
  const text = clean(value, 32);
  return /^\d+$/.test(text) ? text : null;
}

function normal(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function currentSeasonStart(date = new Date()) {
  const y = date.getUTCFullYear();
  return date.getUTCMonth() >= 6 ? y : y - 1;
}

function seasonLabel(start = currentSeasonStart()) {
  return `${start}-${start + 1}`;
}

function footballDataSeasonCode(start = currentSeasonStart()) {
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Matchbook/2.0' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}.`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: 'text/csv,text/plain,*/*', 'User-Agent': 'Matchbook/2.0' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}.`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function sportsDbUrl(path, params = {}) {
  const url = new URL(`${SPORTSDB_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) if (value != null && value !== '') url.searchParams.set(key, String(value));
  return url.href;
}

function source(name, url) { return { name, url }; }

function sportsDbCountry(value) {
  const key = normal(value);
  return ({
    usa:'United States', unitedstatescanada:'United States', czechia:'Czech Republic',
    uae:'United Arab Emirates', southkorea:'South Korea', newzealand:'New Zealand',
  })[key] || value;
}

function toTeam(entry) {
  if (!entry?.idTeam) return null;
  return {
    team: {
      id: Number(entry.idTeam),
      name: entry.strTeam || entry.strTeamAlternate || 'Unknown team',
      country: entry.strCountry || null,
      code: entry.strTeamShort || null,
      national: /national/i.test(entry.strKeywords || '') || false,
      logo: entry.strBadge || null,
    },
    venue: { name: entry.strStadium || null },
    provider: {
      leagueId: entry.idLeague || null,
      leagueName: entry.strLeague || null,
      country: entry.strCountry || null,
    },
  };
}

function leagueEnvelope(entry) {
  const start = currentSeasonStart();
  return {
    league: { id: Number(entry.idLeague), name: entry.strLeague || entry.strLeagueAlternate || 'Unknown league', type: 'League' },
    country: { name: entry.strCountry || null },
    seasons: [{ year: start, current: true, coverage: { standings: true, players: true } }],
  };
}

function scoreLeague(entry, name, country) {
  const n = normal(entry?.strLeague), wanted = normal(name), c = normal(entry?.strCountry), wc = normal(country);
  let score = 0;
  if (n === wanted) score += 8;
  else if (n.includes(wanted) || wanted.includes(n)) score += 4;
  if (c && wc && (c === wc || c.includes(wc) || wc.includes(c))) score += 6;
  if (entry?.strSport === 'Soccer') score += 2;
  return score;
}

function csvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function parseFootballDataDate(value) {
  const m = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const iso = `${year}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return Number.isFinite(Date.parse(iso + 'T00:00:00Z')) ? iso : null;
}

async function footballDataRows(localId) {
  const spec = FOOTBALL_DATA_LEAGUES[localId];
  if (!spec) return [];
  const code = footballDataSeasonCode();
  const url = `${FOOTBALL_DATA_BASE}/${code}/${spec.code}.csv`;
  const rows = csvRows(await fetchText(url));
  return rows.map(r => ({ ...r, _sourceUrl: url, _leagueName: spec.name, _country: spec.country }));
}

function standingsFromCsv(rows) {
  const table = new Map();
  const ensure = name => {
    if (!table.has(name)) table.set(name, { name, p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 });
    return table.get(name);
  };
  for (const r of rows) {
    if (!r.HomeTeam || !r.AwayTeam || r.FTHG === '' || r.FTAG === '') continue;
    const hg = Number(r.FTHG), ag = Number(r.FTAG);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const h = ensure(r.HomeTeam), a = ensure(r.AwayTeam);
    h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) { h.w++; a.l++; h.pts += 3; }
    else if (hg < ag) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return [...table.values()].map(x => ({ ...x, gd:x.gf-x.ga })).sort((a,b)=>b.pts-a.pts || b.gd-a.gd || b.gf-a.gf || a.name.localeCompare(b.name));
}

function apiStandingEnvelope(leagueId, leagueName, country, rows, trustedTeamIds = false) {
  return {
    response: [{ league: { id:Number(leagueId)||0, name:leagueName, country, season:currentSeasonStart(), standings:[rows.map((r,i)=>({
      rank:i+1,
      team:{ id:trustedTeamIds ? (Number(r.teamId)||null) : null, name:r.name },
      points:r.pts,
      goalsDiff:r.gd,
      group:null,
      all:{ played:r.p, win:r.w, draw:r.d, lose:r.l, goals:{ for:r.gf, against:r.ga } },
    }))] } }],
  };
}

function sportsDbStandings(table, leagueId, leagueName, country) {
  const rows = (Array.isArray(table) ? table : []).map((r,i)=>({
    name:r.strTeam || 'Unknown team',
    teamId:r.idTeam || null,
    p:Number(r.intPlayed ?? r.intPlayedTotal ?? 0),
    w:Number(r.intWin ?? 0),
    d:Number(r.intDraw ?? 0),
    l:Number(r.intLoss ?? 0),
    gf:Number(r.intGoalsFor ?? 0),
    ga:Number(r.intGoalsAgainst ?? 0),
    gd:Number(r.intGoalDifference ?? (Number(r.intGoalsFor||0)-Number(r.intGoalsAgainst||0))),
    pts:Number(r.intPoints ?? 0),
    rank:Number(r.intRank)||i+1,
  })).sort((a,b)=>a.rank-b.rank);
  return apiStandingEnvelope(leagueId, leagueName, country, rows, true);
}

async function openLigaStandings(name, country) {
  const year = currentSeasonStart();
  let available = [];
  try { available = await fetchJson(`${OPENLIGA_BASE}/getavailableleagues/${year}`); }
  catch { available = await fetchJson(`${OPENLIGA_BASE}/getavailableleagues`); }
  const wanted = normal(name);
  const choices = (Array.isArray(available) ? available : []).map(l => {
    const ln = normal(l.leagueName), shortcut = String(l.leagueShortcut || '');
    let score = ln === wanted ? 8 : (ln.includes(wanted) || wanted.includes(ln) ? 4 : 0);
    if (normal(country) === 'germany' && /^bl/i.test(shortcut)) score += 2;
    return { l, score };
  }).sort((a,b)=>b.score-a.score);
  const hit = choices[0]?.score >= 4 ? choices[0].l : null;
  if (!hit?.leagueShortcut) return null;
  const season = hit.leagueSeason || String(year);
  const rows = await fetchJson(`${OPENLIGA_BASE}/getbltable/${encodeURIComponent(hit.leagueShortcut)}/${encodeURIComponent(season)}`);
  if (!Array.isArray(rows) || !rows.length) return null;
  const table = rows.map(r=>({
    name:r.teamName || 'Unknown team', teamId:r.teamInfoId || null, p:Number(r.matches||0), w:Number(r.won||0), d:Number(r.draw||0), l:Number(r.lost||0),
    gf:Number(r.goals||0), ga:Number(r.opponentGoals||0), gd:Number(r.goalDiff ?? (Number(r.goals||0)-Number(r.opponentGoals||0))), pts:Number(r.points||0),
  }));
  return { data: apiStandingEnvelope(0, name, country, table), source:source('OpenLigaDB', OPENLIGA_DOCS) };
}

function playerFromSportsDb(raw, teamId, leagueId, season) {
  const id = Number(raw.idPlayer);
  return {
    player: {
      id,
      name:raw.strPlayer || raw.strPlayerAlternate || 'Unknown player',
      age:null,
      birth:{ date:raw.dateBorn || null, country:raw.strBirthLocation || null },
      nationality:raw.strNationality || null,
      height:raw.strHeight || null,
    },
    statistics:[{
      team:{ id:Number(teamId) },
      league:{ id:Number(leagueId)||0, season:Number(season)||currentSeasonStart() },
      games:{ position:raw.strPosition || null, number:raw.strNumber || null, appearences:null, minutes:null, rating:null },
      goals:{ total:null, assists:null }, shots:{ total:null }, passes:{ total:null, key:null }, tackles:{ total:null }, cards:{ yellow:null, red:null },
    }],
  };
}

function eventStatus(raw) {
  const status = String(raw.strStatus || '').toLowerCase();
  const hasScore = raw.intHomeScore != null && raw.intAwayScore != null && raw.intHomeScore !== '' && raw.intAwayScore !== '';
  if (/postpon|cancel|suspend/.test(status)) return { short:'PST', long:raw.strStatus || 'Postponed' };
  if (/finish|full|ft/.test(status) || (hasScore && raw.strTimestamp && Date.parse(raw.strTimestamp) < Date.now()-3*60*60*1000)) return { short:'FT', long:raw.strStatus || 'Finished' };
  if (/live|progress|half/.test(status)) return { short:'LIVE', long:raw.strStatus || 'Live' };
  return { short:'NS', long:raw.strStatus || 'Scheduled' };
}

function eventFromSportsDb(raw) {
  const stamp = raw.strTimestamp || (raw.dateEvent ? `${raw.dateEvent}T${raw.strTime || '00:00:00'}Z` : null);
  const status = eventStatus(raw);
  return {
    fixture:{ id:Number(raw.idEvent)||null, date:stamp, status },
    league:{ name:raw.strLeague || null },
    teams:{ home:{name:raw.strHomeTeam||null}, away:{name:raw.strAwayTeam||null} },
    goals:{ home:raw.intHomeScore === '' ? null : Number(raw.intHomeScore), away:raw.intAwayScore === '' ? null : Number(raw.intAwayScore) },
  };
}

function eventFromFootballData(row, id) {
  const date = parseFootballDataDate(row.Date);
  const time = /^\d{1,2}:\d{2}$/.test(row.Time || '') ? row.Time : '12:00';
  const played = row.FTHG !== '' && row.FTAG !== '' && Number.isFinite(Number(row.FTHG)) && Number.isFinite(Number(row.FTAG));
  return {
    fixture:{ id, date:date ? `${date}T${time}:00Z` : null, status:{ short:played?'FT':'NS', long:played?'Finished':'Scheduled' } },
    league:{ name:row._leagueName }, teams:{home:{name:row.HomeTeam||null},away:{name:row.AwayTeam||null}},
    goals:{home:played?Number(row.FTHG):null,away:played?Number(row.FTAG):null},
  };
}

async function handleLeagues(query) {
  const teamId = numeric(query.team);
  if (teamId) {
    const data = await fetchJson(sportsDbUrl('lookupteam.php',{id:teamId}));
    const team = Array.isArray(data.teams) ? data.teams[0] : null;
    if (!team?.idLeague) return { response:[], results:0, source:source('TheSportsDB',SPORTSDB_DOCS) };
    const entry = { idLeague:team.idLeague, strLeague:team.strLeague, strCountry:team.strCountry, strSport:'Soccer' };
    return { response:[leagueEnvelope(entry)], results:1, source:source('TheSportsDB',SPORTSDB_DOCS) };
  }
  const name = clean(query.search || query.name, 100);
  const country = sportsDbCountry(clean(query.country, 80) || 'England');
  const data = await fetchJson(sportsDbUrl('search_all_leagues.php',{c:country,s:'Soccer'}));
  const leagues = Array.isArray(data.countrys) ? data.countrys : Array.isArray(data.leagues) ? data.leagues : [];
  const sorted = leagues.map(x=>({x,score:scoreLeague(x,name,country)})).sort((a,b)=>b.score-a.score).filter(x=>!name || x.score>0).map(x=>leagueEnvelope(x.x));
  return { response:sorted, results:sorted.length, source:source('TheSportsDB',SPORTSDB_DOCS) };
}

async function handleTeams(query) {
  const search = clean(query.search, 100);
  if (search) {
    const data = await fetchJson(sportsDbUrl('searchteams.php',{t:search.replace(/\s+/g,'_')}));
    const teams = (Array.isArray(data.teams) ? data.teams : []).filter(t=>t.strSport === 'Soccer').map(toTeam).filter(Boolean);
    return { response:teams, results:teams.length, source:source('TheSportsDB',SPORTSDB_DOCS) };
  }
  const league = numeric(query.league);
  if (league) {
    const data = await fetchJson(sportsDbUrl('search_all_teams.php',{l:league}));
    const teams = (Array.isArray(data.teams) ? data.teams : []).filter(t=>t.strSport === 'Soccer').map(toTeam).filter(Boolean);
    return { response:teams, results:teams.length, source:source('TheSportsDB',SPORTSDB_DOCS) };
  }
  return { response:[], results:0, source:source('TheSportsDB',SPORTSDB_DOCS) };
}

async function handleStandings(query) {
  const league = numeric(query.league);
  const local = clean(query.local, 40);
  const name = clean(query.name, 100) || 'League';
  const country = clean(query.country, 80);
  if (league) {
    try {
      const data = await fetchJson(sportsDbUrl('lookuptable.php',{l:league,s:seasonLabel()}));
      if (Array.isArray(data.table) && data.table.length) {
        return { ...sportsDbStandings(data.table,league,name,country), source:source('TheSportsDB',SPORTSDB_DOCS) };
      }
    } catch { /* try open-data fallbacks */ }
  }
  if (FOOTBALL_DATA_LEAGUES[local]) {
    try {
      const rows = await footballDataRows(local);
      const table = standingsFromCsv(rows);
      if (table.length) return { ...apiStandingEnvelope(league||0,name,country,table), source:source('Football-Data.co.uk',FOOTBALL_DATA_DOCS) };
    } catch { /* try OpenLigaDB */ }
  }
  try {
    const open = await openLigaStandings(name,country);
    if (open) return { ...open.data, source:open.source };
  } catch { /* no supported standings */ }
  return { response:[], results:0, source:source('Hybrid open-data sources',SPORTSDB_DOCS), warning:'No supported free standings source returned this competition.' };
}

async function handleTeamPlayers(query) {
  const team = numeric(query.team);
  if (!team) throw new Error('team is required.');
  const season = numeric(query.season) || String(currentSeasonStart());
  const league = numeric(query.league) || '0';
  const data = await fetchJson(sportsDbUrl('lookup_all_players.php',{id:team}));
  const players = (Array.isArray(data.player) ? data.player : []).filter(p=>p.strSport === 'Soccer').map(p=>playerFromSportsDb(p,team,league,season));
  return { response:players, results:players.length, paging:{current:1,total:1}, source:source('TheSportsDB',SPORTSDB_DOCS), limited:true };
}

async function handleSquads(query) {
  const team = numeric(query.team);
  if (!team) throw new Error('team is required.');
  const data = await fetchJson(sportsDbUrl('lookup_all_players.php',{id:team}));
  const players = (Array.isArray(data.player) ? data.player : []).filter(p=>p.strSport === 'Soccer').map(p=>({
    id:Number(p.idPlayer), name:p.strPlayer || 'Unknown player', age:null, number:p.strNumber || null, position:p.strPosition || null,
  }));
  return { response:[{team:{id:Number(team)},players}], results:players.length, source:source('TheSportsDB',SPORTSDB_DOCS), limited:true };
}

async function handleHistory(query) {
  const player = numeric(query.player);
  if (!player) throw new Error('player is required.');
  const data = await fetchJson(sportsDbUrl('lookupformerteams.php',{id:player}));
  const rows = (Array.isArray(data.formerteams) ? data.formerteams : []).filter(r=>String(r.idPlayer||'')===player || !r.idPlayer).map(r=>({
    team:r.strFormerTeam || null, joined:r.strJoined || null, departed:r.strDeparted || null, moveType:r.strMoveType || null,
  }));
  return { response:rows, results:rows.length, source:source('TheSportsDB',SPORTSDB_DOCS) };
}

async function handleFixtures(query) {
  const date = clean(query.date, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A YYYY-MM-DD date is required.');
  const events = [], specs = Object.keys(FOOTBALL_DATA_LEAGUES);
  const [sportsDbResult, settled] = await Promise.all([
    fetchJson(sportsDbUrl('eventsday.php',{d:date,s:'Soccer'}),8000).then(data=>({ok:true,data})).catch(()=>({ok:false,data:null})),
    Promise.allSettled(specs.map(async local => ({local, rows:await footballDataRows(local)}))),
  ]);
  if (sportsDbResult.ok) for (const e of Array.isArray(sportsDbResult.data?.events) ? sportsDbResult.data.events : []) events.push(eventFromSportsDb(e));
  let syntheticId = -1;
  for (const item of settled) {
    if (item.status !== 'fulfilled') continue;
    for (const row of item.value.rows) if (parseFootballDataDate(row.Date) === date) events.push(eventFromFootballData(row, syntheticId--));
  }
  const unique = new Map();
  for (const event of events) {
    const key = [normal(event.league?.name),normal(event.teams?.home?.name),normal(event.teams?.away?.name),String(event.fixture?.date||'').slice(0,10)].join('|');
    if (!unique.has(key)) unique.set(key,event);
  }
  return { response:[...unique.values()], results:unique.size, source:source('TheSportsDB + Football-Data.co.uk',SPORTSDB_DOCS), sources:[source('TheSportsDB',SPORTSDB_DOCS),source('Football-Data.co.uk',FOOTBALL_DATA_DOCS)] };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405,{error:'Method not allowed.'});
  const query = event.queryStringParameters || {};
  const resource = clean(query.resource,40);
  try {
    let data, ttl = 900;
    if (resource === 'leagues') { data = await handleLeagues(query); ttl = 43200; }
    else if (resource === 'teams') { data = await handleTeams(query); ttl = query.search ? 1800 : 21600; }
    else if (resource === 'standings') { data = await handleStandings(query); ttl = 1800; }
    else if (resource === 'team-players') { data = await handleTeamPlayers(query); ttl = 21600; }
    else if (resource === 'squads') { data = await handleSquads(query); ttl = 21600; }
    else if (resource === 'history') { data = await handleHistory(query); ttl = 86400; }
    else if (resource === 'fixtures') { data = await handleFixtures(query); ttl = 300; }
    else return json(400,{error:'Unsupported football resource.'});
    return json(200,data,ttl);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'A free upstream source timed out.' : (error?.message || 'The free football source failed.');
    return json(502,{error:message});
  }
};
