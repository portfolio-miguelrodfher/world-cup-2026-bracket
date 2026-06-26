import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildForecast } from "./forecast-model.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "world-cup.json");
const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=2026";
const STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?region=us&lang=en&contentorigin=espn&isqualified=true&type=0&level=0&sort=rank:asc";

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "world-cup-2026-bracket/1.0",
    },
  });
  if (!response.ok) throw new Error(`Data provider returned ${response.status} for ${url}`);
  return response.json();
}

function statValue(entry, name) {
  return entry.stats?.find((stat) => stat.name === name)?.value ?? 0;
}

function normalizeStandingTeam(entry, rank) {
  return {
    id: entry.team?.id ?? null,
    name: entry.team?.displayName || "TBD",
    code: entry.team?.abbreviation || "",
    logo: entry.team?.logos?.[0]?.href || "",
    winner: false,
    rank,
    points: statValue(entry, "points"),
    goalsDiff: statValue(entry, "pointDifferential"),
    played: statValue(entry, "gamesPlayed"),
    won: statValue(entry, "wins"),
    drawn: statValue(entry, "ties"),
    lost: statValue(entry, "losses"),
    goalsFor: statValue(entry, "pointsFor"),
    goalsAgainst: statValue(entry, "pointsAgainst"),
    description: entry.note?.description || "",
  };
}

function normalizeGroups(payload) {
  return (payload.children || [])
    .map((group) => ({
      name: group.name,
      teams: (group.standings?.entries || []).map((entry, index) =>
        normalizeStandingTeam(entry, index + 1),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function hasScore(match) {
  return Number.isFinite(match.goals?.home) && Number.isFinite(match.goals?.away);
}

function descriptionForRank(rank) {
  if (rank <= 2) return "Advance to Round of 32";
  if (rank === 3) return "Best 8 advance";
  return "Eliminated";
}

function applyMatchDerivedGroupRecords(groups, matches) {
  const groupMatches = matches.filter((match) => match.round === "Group stage" && hasScore(match));

  return groups.map((group) => {
    const teamIds = new Set(group.teams.map((team) => String(team.id)));
    const records = new Map(
      group.teams.map((team) => [
        String(team.id),
        {
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalsDiff: 0,
          points: 0,
        },
      ]),
    );

    groupMatches
      .filter(
        (match) =>
          teamIds.has(String(match.home?.id)) &&
          teamIds.has(String(match.away?.id)),
      )
      .forEach((match) => {
        const home = records.get(String(match.home.id));
        const away = records.get(String(match.away.id));
        if (!home || !away) return;

        home.played += 1;
        away.played += 1;
        home.goalsFor += match.goals.home;
        home.goalsAgainst += match.goals.away;
        away.goalsFor += match.goals.away;
        away.goalsAgainst += match.goals.home;

        if (match.goals.home > match.goals.away) {
          home.won += 1;
          home.points += 3;
          away.lost += 1;
        } else if (match.goals.home < match.goals.away) {
          away.won += 1;
          away.points += 3;
          home.lost += 1;
        } else {
          home.drawn += 1;
          away.drawn += 1;
          home.points += 1;
          away.points += 1;
        }
      });

    const teams = group.teams
      .map((team) => {
        const record = records.get(String(team.id));
        return {
          ...team,
          ...record,
          goalsDiff: record.goalsFor - record.goalsAgainst,
        };
      })
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.goalsDiff - a.goalsDiff ||
          b.goalsFor - a.goalsFor ||
          a.name.localeCompare(b.name),
      )
      .map((team, index) => ({
        ...team,
        rank: index + 1,
        description: descriptionForRank(index + 1),
      }));

    return { ...group, teams };
  });
}

function statusShort(event) {
  const type = event.status?.type;
  if (type?.completed) return type.name?.includes("PENALT") ? "PEN" : "FT";
  if (type?.state === "pre") return "NS";
  if (event.status?.period === 1) return "1H";
  if (event.status?.period === 2) return "2H";
  if (event.status?.period > 2) return "ET";
  return "LIVE";
}

function normalizeCompetitor(competitor) {
  const hasStarted = competitor.score !== undefined && competitor.score !== null;
  return {
    id: competitor.team?.id ?? null,
    name: competitor.team?.displayName || "TBD",
    code: competitor.team?.abbreviation || "",
    logo: competitor.team?.logo || "",
    winner: competitor.winner === true,
    score: hasStarted ? Number(competitor.score) : null,
  };
}

function roundLabel(slug = "") {
  const labels = {
    "group-stage": "Group stage",
    "round-of-32": "Round of 32",
    "round-of-16": "Round of 16",
    quarterfinals: "Quarterfinal",
    semifinals: "Semifinal",
    "3rd-place-match": "Third place",
    final: "Final",
  };
  return labels[slug] || slug;
}

function normalizeMatch(event, index) {
  const competition = event.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = normalizeCompetitor(
    competitors.find((team) => team.homeAway === "home") || competitors[0] || {},
  );
  const away = normalizeCompetitor(
    competitors.find((team) => team.homeAway === "away") || competitors[1] || {},
  );
  const started = event.status?.type?.state !== "pre";

  return {
    id: event.id,
    number: index + 1,
    round: roundLabel(event.season?.slug),
    kickoff: event.date,
    venue: {
      name: competition.venue?.fullName || "",
      city: competition.venue?.address?.city || "",
    },
    status: {
      short: statusShort(event),
      long: event.status?.type?.description || "Scheduled",
      elapsed:
        event.status?.type?.state === "in"
          ? Number.parseInt(event.status?.displayClock, 10) || null
          : null,
    },
    home: {
      id: home.id,
      name: home.name,
      code: home.code,
      logo: home.logo,
      winner: home.winner,
    },
    away: {
      id: away.id,
      name: away.name,
      code: away.code,
      logo: away.logo,
      winner: away.winner,
    },
    goals: {
      home: started ? home.score : null,
      away: started ? away.score : null,
    },
    penalties: {
      home: null,
      away: null,
    },
  };
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
  const keys = {
    "Round of 32": "roundOf32",
    "Round of 16": "roundOf16",
    Quarterfinal: "quarterFinals",
    Semifinal: "semiFinals",
    "Third place": "thirdPlace",
    Final: "final",
  };

  matches.forEach((match) => {
    const key = keys[match.round];
    if (key) bracket[key].push(match);
  });
  return bracket;
}

function isRecoverableProviderError(error) {
  return (
    error instanceof TypeError ||
    error.message?.startsWith("Data provider returned") ||
    error.message?.startsWith("Expected 104 World Cup matches") ||
    error.message === "Standings response did not contain twelve complete groups."
  );
}

async function hasExistingData() {
  try {
    await fs.access(dataPath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

try {
  const [scoreboard, standings] = await Promise.all([
    fetchJson(SCOREBOARD_URL),
    fetchJson(STANDINGS_URL),
  ]);

  const matches = (scoreboard.events || [])
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(normalizeMatch);
  const groups = applyMatchDerivedGroupRecords(normalizeGroups(standings), matches);

  if (matches.length !== 104) {
    throw new Error(`Expected 104 World Cup matches, received ${matches.length}.`);
  }
  if (groups.length !== 12 || groups.some((group) => group.teams.length !== 4)) {
    throw new Error("Standings response did not contain twelve complete groups.");
  }

  const forecast = await buildForecast(groups, matches);

  const output = {
    meta: {
      competition: "FIFA World Cup",
      season: 2026,
      mode: "live",
      provider: "ESPN",
      updatedAt: new Date().toISOString(),
    },
    groups,
    matches,
    bracket: bracketFromMatches(matches),
    forecast,
  };

  try {
    const previous = JSON.parse(await fs.readFile(dataPath, "utf8"));
    const comparable = (value) => ({
      ...value,
      meta: { ...value.meta, updatedAt: null },
      forecast: {
        ...value.forecast,
        meta: { ...value.forecast?.meta, generatedAt: null },
      },
    });
    const previousComparable = comparable(previous);
    const nextComparable = comparable(output);
    if (JSON.stringify(previousComparable) === JSON.stringify(nextComparable)) {
      console.log("Tournament data is unchanged; refreshing timestamp.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.writeFile(dataPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Updated ${matches.length} matches and ${groups.length} groups.`);
} catch (error) {
  if (isRecoverableProviderError(error) && (await hasExistingData())) {
    console.warn(`Skipping update because ESPN data is unavailable or incomplete: ${error.message}`);
    process.exit(0);
  }
  throw error;
}
