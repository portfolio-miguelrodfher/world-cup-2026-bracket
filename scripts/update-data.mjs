import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "world-cup.json");
const API_BASE = "https://v3.football.api-sports.io";
const key = process.env.API_FOOTBALL_KEY;

if (!key) {
  throw new Error("API_FOOTBALL_KEY is required. Add it as a GitHub Actions repository secret.");
}

async function apiGet(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "x-apisports-key": key },
  });
  if (!response.ok) throw new Error(`API-Football returned ${response.status} for ${endpoint}`);
  const payload = await response.json();
  if (payload.errors && Object.keys(payload.errors).length) {
    throw new Error(`API-Football error: ${JSON.stringify(payload.errors)}`);
  }
  return payload.response || [];
}

function normalizeTeam(team, winner = false) {
  return {
    id: team?.id ?? null,
    name: team?.name || "TBD",
    code: team?.code || "",
    logo: team?.logo || "",
    winner: winner === true,
  };
}

function normalizeFixture(item, index) {
  return {
    id: item.fixture.id,
    number: index + 1,
    round: item.league.round,
    kickoff: item.fixture.date,
    venue: {
      name: item.fixture.venue?.name || "",
      city: item.fixture.venue?.city || "",
    },
    status: {
      short: item.fixture.status?.short || "NS",
      long: item.fixture.status?.long || "Not started",
      elapsed: item.fixture.status?.elapsed ?? null,
    },
    home: normalizeTeam(item.teams.home, item.teams.home?.winner),
    away: normalizeTeam(item.teams.away, item.teams.away?.winner),
    goals: {
      home: item.goals?.home ?? null,
      away: item.goals?.away ?? null,
    },
    penalties: {
      home: item.score?.penalty?.home ?? null,
      away: item.score?.penalty?.away ?? null,
    },
  };
}

function normalizeRound(round = "") {
  const value = round.toLowerCase();
  if (value.includes("round of 32") || value.includes("1/16")) return "roundOf32";
  if (value.includes("round of 16") || value.includes("1/8")) return "roundOf16";
  if (value.includes("quarter")) return "quarterFinals";
  if (value.includes("semi")) return "semiFinals";
  if (value.includes("third") || value.includes("3rd")) return "thirdPlace";
  if (value.includes("final")) return "final";
  return null;
}

function bracketFromMatches(matches) {
  const bracket = {
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    thirdPlace: [],
    final: [],
  };

  matches.forEach((match) => {
    const key = normalizeRound(match.round);
    if (key) bracket[key].push(match);
  });

  Object.values(bracket).forEach((round) => {
    round.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  });
  return bracket;
}

function normalizeStandings(response) {
  const rawGroups = response[0]?.league?.standings || [];
  return rawGroups
    .map((rows, index) => ({
      name: rows[0]?.group || `Group ${String.fromCharCode(65 + index)}`,
      teams: rows.map((row) => ({
        ...normalizeTeam(row.team),
        rank: row.rank,
        points: row.points,
        goalsDiff: row.goalsDiff,
        form: row.form || "",
        status: row.status || "same",
        description: row.description || "",
        played: row.all?.played ?? 0,
        won: row.all?.win ?? 0,
        drawn: row.all?.draw ?? 0,
        lost: row.all?.lose ?? 0,
        goalsFor: row.all?.goals?.for ?? 0,
        goalsAgainst: row.all?.goals?.against ?? 0,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const [fixtureResponse, standingsResponse] = await Promise.all([
  apiGet("/fixtures?league=1&season=2026"),
  apiGet("/standings?league=1&season=2026"),
]);

const matches = fixtureResponse
  .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
  .map(normalizeFixture);
const groups = normalizeStandings(standingsResponse);

const output = {
  meta: {
    competition: "FIFA World Cup",
    season: 2026,
    mode: "live",
    provider: "API-Football",
    updatedAt: new Date().toISOString(),
  },
  groups,
  matches,
  bracket: bracketFromMatches(matches),
};

await fs.writeFile(dataPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Updated ${matches.length} matches and ${groups.length} groups.`);
