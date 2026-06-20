const ELO_URL = "https://www.eloratings.net/World.tsv";

const CODE_TO_ISO2 = {
  ALG: "DZ", ARG: "AR", AUS: "AU", AUT: "AT", BEL: "BE", BIH: "BA",
  BRA: "BR", CAN: "CA", CIV: "CI", COL: "CO", CPV: "CV", COD: "CD",
  CRO: "HR", CUW: "CW", CZE: "CZ", ECU: "EC", EGY: "EG", ENG: "EN",
  ESP: "ES", FRA: "FR", GER: "DE", GHA: "GH", HAI: "HT", IRN: "IR",
  IRQ: "IQ", JOR: "JO", JPN: "JP", KOR: "KR", KSA: "SA", MAR: "MA",
  MEX: "MX", NED: "NL", NOR: "NO", NZL: "NZ", PAN: "PA", PAR: "PY",
  POR: "PT", QAT: "QA", RSA: "ZA", SCO: "SC", SEN: "SN", SUI: "CH",
  SWE: "SE", TUN: "TN", TUR: "TR", URU: "UY", USA: "US", UZB: "UZ",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function fetchEloRatings() {
  const response = await fetch(ELO_URL, {
    headers: { "User-Agent": "world-cup-2026-bracket/1.0" },
  });
  if (!response.ok) throw new Error(`Elo provider returned ${response.status}.`);
  const text = await response.text();
  return new Map(
    text
      .trim()
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((columns) => columns.length >= 4)
      .map((columns) => [columns[2], Number(columns[3])]),
  );
}

function factorial(value) {
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function poissonProbability(goals, lambda) {
  return (Math.exp(-lambda) * lambda ** goals) / factorial(goals);
}

function expectedGoals(homeRating, awayRating) {
  const share = 1 / (1 + 10 ** ((awayRating - homeRating) / 400));
  const total = 2.58;
  return {
    home: clamp(total * (0.32 + 0.68 * share), 0.45, 2.65),
    away: clamp(total * (0.32 + 0.68 * (1 - share)), 0.45, 2.65),
  };
}

function outcomeProbabilities(homeRating, awayRating) {
  const lambda = expectedGoals(homeRating, awayRating);
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let homeGoals = 0; homeGoals <= 8; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 8; awayGoals += 1) {
      const probability =
        poissonProbability(homeGoals, lambda.home) *
        poissonProbability(awayGoals, lambda.away);
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals < awayGoals) away += probability;
      else draw += probability;
    }
  }
  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total, lambda };
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function poissonSample(lambda, random) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= random();
  } while (product > limit && count < 12);
  return count - 1;
}

function simulateScore(homeRating, awayRating, random, knockout = false) {
  const lambda = expectedGoals(homeRating, awayRating);
  let home = poissonSample(lambda.home, random);
  let away = poissonSample(lambda.away, random);
  if (knockout && home === away) {
    const advance = 1 / (1 + 10 ** ((awayRating - homeRating) / 400));
    if (random() < advance) home += 1;
    else away += 1;
  }
  return { home, away };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function rankTeams(teams, random) {
  return [...teams].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsDiff - a.goalsDiff ||
      b.goalsFor - a.goalsFor ||
      b.rating - a.rating ||
      random() - 0.5,
  );
}

function playKnockoutRound(teams, ratings, random, counters, counterKey) {
  const next = [];
  for (let index = 0; index < teams.length; index += 2) {
    const home = teams[index];
    const away = teams[index + 1];
    const score = simulateScore(ratings.get(home), ratings.get(away), random, true);
    const winner = score.home > score.away ? home : away;
    next.push(winner);
    counters.get(winner)[counterKey] += 1;
  }
  return next;
}

function buildRoundOf32(winners, runners, thirds, random) {
  const shuffledWinners = shuffle(winners, random);
  const shuffledRunners = shuffle(runners, random);
  const shuffledThirds = shuffle(thirds, random);
  const teams = [];
  for (let index = 0; index < 8; index += 1) {
    teams.push(shuffledWinners[index], shuffledThirds[index]);
  }
  for (let index = 8; index < 12; index += 1) {
    teams.push(shuffledWinners[index], shuffledRunners[index - 8]);
  }
  for (let index = 4; index < 12; index += 2) {
    teams.push(shuffledRunners[index], shuffledRunners[index + 1]);
  }
  return teams;
}

function simulationSeed(matches) {
  const source = matches
    .filter((match) => ["FT", "AET", "PEN"].includes(match.status.short))
    .map((match) => `${match.id}:${match.goals.home}:${match.goals.away}`)
    .join("|");
  let seed = 2166136261;
  for (const character of source) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function teamReasons(team, averageRating) {
  const reasons = [];
  if (team.effectiveRating >= averageRating + 150) reasons.push("Elite international rating");
  else if (team.effectiveRating >= averageRating + 60) reasons.push("Above-average international rating");
  else if (team.effectiveRating <= averageRating - 130) reasons.push("Rating trails the tournament field");
  if (team.played > 0 && team.points / team.played >= 2) reasons.push("Strong tournament form");
  if (team.played > 0 && team.goalsDiff / team.played >= 1) reasons.push("Positive scoring margin");
  if (team.played > 0 && team.points / team.played < 1) reasons.push("Current results are a drag");
  return reasons.slice(0, 3);
}

export async function buildForecast(groups, matches, simulations = 5000) {
  const eloRatings = await fetchEloRatings();
  const allTeams = groups.flatMap((group) => group.teams);
  const teamsById = new Map();
  const ratings = new Map();

  allTeams.forEach((team) => {
    const baseRating = eloRatings.get(CODE_TO_ISO2[team.code]) || 1500;
    const played = Math.max(1, team.played);
    const formAdjustment = clamp(
      12 * (team.goalsDiff / played) + 9 * (team.points / played - 1.25),
      -45,
      45,
    );
    const enriched = {
      ...team,
      elo: baseRating,
      effectiveRating: Math.round(baseRating + formAdjustment),
      strength: Math.round(clamp(50 + (baseRating + formAdjustment - 1550) / 11, 20, 98)),
    };
    teamsById.set(String(team.id), enriched);
    ratings.set(String(team.id), enriched.effectiveRating);
  });

  matches.forEach((match) => {
    const homeRating = ratings.get(String(match.home.id));
    const awayRating = ratings.get(String(match.away.id));
    if (!homeRating || !awayRating) return;
    const probabilities = outcomeProbabilities(homeRating, awayRating);
    const decisiveTotal = probabilities.home + probabilities.away;
    match.forecast = {
      home: Math.round(probabilities.home * 1000) / 10,
      draw: Math.round(probabilities.draw * 1000) / 10,
      away: Math.round(probabilities.away * 1000) / 10,
      homeAdvance: Math.round((probabilities.home / decisiveTotal) * 1000) / 10,
      awayAdvance: Math.round((probabilities.away / decisiveTotal) * 1000) / 10,
    };
  });

  const counters = new Map(
    allTeams.map((team) => [
      String(team.id),
      { roundOf32: 0, roundOf16: 0, quarterFinal: 0, semiFinal: 0, final: 0, champion: 0 },
    ]),
  );
  const random = mulberry32(simulationSeed(matches));
  const groupMatches = matches.filter((match) => match.round === "Group stage");

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    const simulatedGroups = groups.map((group) => ({
      name: group.name,
      teams: group.teams.map((team) => ({
        id: String(team.id),
        points: team.points,
        goalsFor: team.goalsFor,
        goalsAgainst: team.goalsAgainst,
        goalsDiff: team.goalsDiff,
        rating: ratings.get(String(team.id)),
      })),
    }));

    const simulatedById = new Map(
      simulatedGroups.flatMap((group) => group.teams.map((team) => [team.id, team])),
    );
    groupMatches
      .filter((match) => match.status.short === "NS")
      .forEach((match) => {
        const home = simulatedById.get(String(match.home.id));
        const away = simulatedById.get(String(match.away.id));
        if (!home || !away) return;
        const score = simulateScore(home.rating, away.rating, random);
        home.goalsFor += score.home;
        home.goalsAgainst += score.away;
        away.goalsFor += score.away;
        away.goalsAgainst += score.home;
        home.goalsDiff = home.goalsFor - home.goalsAgainst;
        away.goalsDiff = away.goalsFor - away.goalsAgainst;
        if (score.home > score.away) home.points += 3;
        else if (score.home < score.away) away.points += 3;
        else {
          home.points += 1;
          away.points += 1;
        }
      });

    const rankedGroups = simulatedGroups.map((group) => rankTeams(group.teams, random));
    const winners = rankedGroups.map((group) => group[0].id);
    const runners = rankedGroups.map((group) => group[1].id);
    const thirds = rankTeams(
      rankedGroups.map((group) => group[2]),
      random,
    )
      .slice(0, 8)
      .map((team) => team.id);
    const qualifiers = [...winners, ...runners, ...thirds];
    qualifiers.forEach((id) => {
      counters.get(id).roundOf32 += 1;
    });

    let round = buildRoundOf32(winners, runners, thirds, random);
    round = playKnockoutRound(round, ratings, random, counters, "roundOf16");
    round = shuffle(round, random);
    round = playKnockoutRound(round, ratings, random, counters, "quarterFinal");
    round = shuffle(round, random);
    round = playKnockoutRound(round, ratings, random, counters, "semiFinal");
    round = shuffle(round, random);
    round = playKnockoutRound(round, ratings, random, counters, "final");
    round = playKnockoutRound(round, ratings, random, counters, "champion");
  }

  const averageRating =
    [...teamsById.values()].reduce((sum, team) => sum + team.effectiveRating, 0) /
    teamsById.size;
  const teams = [...teamsById.values()]
    .map((team) => {
      const counts = counters.get(String(team.id));
      const probability = (key) => Math.round((counts[key] / simulations) * 1000) / 10;
      return {
        id: team.id,
        name: team.name,
        code: team.code,
        logo: team.logo,
        elo: team.elo,
        effectiveRating: team.effectiveRating,
        strength: team.strength,
        reasons: teamReasons(team, averageRating),
        outlook: {
          roundOf32: probability("roundOf32"),
          roundOf16: probability("roundOf16"),
          quarterFinal: probability("quarterFinal"),
          semiFinal: probability("semiFinal"),
          final: probability("final"),
          champion: probability("champion"),
        },
      };
    })
    .sort((a, b) => b.outlook.champion - a.outlook.champion);

  return {
    meta: {
      model: "Elo + tournament form + Poisson goals",
      simulations,
      ratingSource: "World Football Elo Ratings",
      generatedAt: new Date().toISOString(),
      disclaimer: "Statistical model estimate — not betting odds.",
    },
    teams,
  };
}
