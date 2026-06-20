const DATA_URL = "./data/world-cup.json";
const GROUP_COLORS = [
  "#2ce59b", "#ff5470", "#f1ad3d", "#648cff", "#a65cff", "#d5ef46",
  "#f06292", "#58d7c4", "#b76bdd", "#48b9cb", "#ff6a32", "#62c4e8",
];

const state = {
  data: null,
  filter: "all",
};

const roundConfig = {
  roundOf32: { count: 16, label: "Round of 32" },
  roundOf16: { count: 8, label: "Round of 16" },
  quarterFinals: { count: 4, label: "Quarterfinal" },
  semiFinals: { count: 2, label: "Semifinal" },
};

function teamPlaceholder(seed = "TBD") {
  return {
    id: null,
    name: seed,
    code: "",
    logo: "",
    winner: false,
  };
}

function blankMatch(index, round) {
  return {
    id: `placeholder-${round}-${index}`,
    number: null,
    round,
    kickoff: null,
    status: { short: "NS", long: "Not started", elapsed: null },
    home: teamPlaceholder("TBD"),
    away: teamPlaceholder("TBD"),
    goals: { home: null, away: null },
    penalties: { home: null, away: null },
  };
}

function formatUpdated(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.valueOf())) return "";
  return `Updated ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date)}`;
}

function formatKickoff(dateString) {
  if (!dateString) return "Schedule pending";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
}

function statusLabel(match) {
  const short = match.status?.short;
  if (["1H", "HT", "2H", "ET", "P", "LIVE"].includes(short)) {
    return match.status.elapsed ? `${match.status.elapsed}′` : "Live";
  }
  if (["FT", "AET", "PEN"].includes(short)) return short;
  if (short === "PST") return "Postponed";
  return match.kickoff ? formatKickoff(match.kickoff) : "TBD";
}

function teamMark(team) {
  if (team?.logo) {
    const image = document.createElement("img");
    image.src = team.logo;
    image.alt = "";
    image.loading = "lazy";
    return image;
  }
  const placeholder = document.createElement("span");
  placeholder.className = "group-placeholder";
  return placeholder;
}

function buildMatchCard(match, { compact = true } = {}) {
  const fragment = document.querySelector("#match-card-template").content.cloneNode(true);
  const card = fragment.querySelector(".match-card");
  const rows = [fragment.querySelector(".team-row--home"), fragment.querySelector(".team-row--away")];
  const teams = [match.home || teamPlaceholder(), match.away || teamPlaceholder()];
  const goals = [match.goals?.home, match.goals?.away];
  const penalties = [match.penalties?.home, match.penalties?.away];
  const live = ["1H", "HT", "2H", "ET", "P", "LIVE"].includes(match.status?.short);

  fragment.querySelector(".match-number").textContent = match.number
    ? `Match ${match.number}`
    : match.round || "World Cup";
  const stateEl = fragment.querySelector(".match-state");
  stateEl.textContent = statusLabel(match);
  stateEl.classList.toggle("is-live", live);

  rows.forEach((row, index) => {
    const team = teams[index];
    row.querySelector(".team-mark").replaceChildren(teamMark(team));
    row.querySelector(".team-name").textContent = team?.name || "TBD";
    const hasScore = goals[index] !== null && goals[index] !== undefined;
    const hasPens = penalties[index] !== null && penalties[index] !== undefined;
    row.querySelector(".team-score").textContent = hasScore
      ? `${goals[index]}${hasPens ? ` (${penalties[index]})` : ""}`
      : "–";
    row.classList.toggle("is-winner", team?.winner === true);
  });

  card.classList.toggle("is-compact", compact);
  return fragment;
}

function matchesForRound(key) {
  const expected = roundConfig[key].count;
  const matches = [...(state.data?.bracket?.[key] || [])];
  while (matches.length < expected) matches.push(blankMatch(matches.length, roundConfig[key].label));
  return matches.slice(0, expected);
}

function renderBracket() {
  Object.keys(roundConfig).forEach((roundKey) => {
    const allMatches = matchesForRound(roundKey);
    const midpoint = allMatches.length / 2;

    document.querySelectorAll(`[data-round="${roundKey}"]`).forEach((column) => {
      const side = column.dataset.side;
      const matches = side === "left" ? allMatches.slice(0, midpoint) : allMatches.slice(midpoint);
      const container = column.querySelector(".round-matches");
      container.replaceChildren(...matches.map((match) => buildMatchCard(match)));
    });
  });

  const finalMatch = state.data?.bracket?.final?.[0] || blankMatch(0, "Final");
  const thirdPlace = state.data?.bracket?.thirdPlace?.[0] || blankMatch(0, "Third place");
  document.querySelector("#final-match").replaceChildren(buildMatchCard(finalMatch, { compact: false }));
  document.querySelector("#third-place-match").replaceChildren(buildMatchCard(thirdPlace, { compact: false }));
}

function renderGroupRails() {
  const groups = state.data?.groups || [];
  const padded = Array.from({ length: 12 }, (_, index) => groups[index] || {
    name: `Group ${String.fromCharCode(65 + index)}`,
    teams: [],
  });

  const cards = padded.map((group, index) => {
    const card = document.createElement("article");
    card.className = "group-card";
    card.style.setProperty("--group-color", GROUP_COLORS[index]);

    const teamGrid = document.createElement("div");
    teamGrid.className = "group-flags";
    const teams = [...(group.teams || [])];
    while (teams.length < 4) teams.push(teamPlaceholder("Awaiting draw"));

    teams.slice(0, 4).forEach((team) => {
      const item = document.createElement("div");
      item.className = "group-team";
      item.append(teamMark(team));
      const code = document.createElement("span");
      code.textContent = team.code || team.name?.slice(0, 3).toUpperCase() || "TBD";
      item.append(code);
      teamGrid.append(item);
    });

    const title = document.createElement("strong");
    title.textContent = group.name || `Group ${String.fromCharCode(65 + index)}`;
    card.append(teamGrid, title);
    return card;
  });

  document.querySelector("#groups-left").replaceChildren(...cards.slice(0, 6));
  document.querySelector("#groups-right").replaceChildren(...cards.slice(6));
}

function renderStandings() {
  const grid = document.querySelector("#standings-grid");
  const groups = state.data?.groups || [];

  if (!groups.some((group) => group.teams?.length)) {
    grid.innerHTML = `<div class="empty-state">Live group standings will appear after the data connection is enabled.</div>`;
    return;
  }

  grid.replaceChildren(...groups.map((group) => {
    const card = document.createElement("article");
    card.className = "standings-card";
    const title = document.createElement("h3");
    title.textContent = group.name;
    card.append(title);

    const labels = document.createElement("div");
    labels.className = "standings-row table-labels";
    labels.innerHTML = "<span>#</span><span>Team</span><span>PL</span><span>GD</span><span>PTS</span>";
    card.append(labels);

    group.teams.forEach((team, index) => {
      const row = document.createElement("div");
      row.className = "standings-row";
      row.classList.toggle("is-qualified", index < 2);
      row.classList.toggle("is-third", index === 2);
      const teamCell = document.createElement("span");
      teamCell.className = "standings-team";
      teamCell.append(teamMark(team), document.createTextNode(team.name));
      row.append(
        document.createTextNode(String(team.rank || index + 1)),
        teamCell,
        document.createTextNode(String(team.played ?? 0)),
        document.createTextNode(String(team.goalsDiff ?? 0)),
        document.createTextNode(String(team.points ?? 0)),
      );
      card.append(row);
    });
    return card;
  }));
}

function matchCategory(match) {
  const status = match.status?.short;
  if (["1H", "HT", "2H", "ET", "P", "LIVE"].includes(status)) return "live";
  if (["FT", "AET", "PEN"].includes(status)) return "finished";
  return "upcoming";
}

function renderMatches() {
  const list = document.querySelector("#match-list");
  const matches = (state.data?.matches || [])
    .filter((match) => state.filter === "all" || matchCategory(match) === state.filter)
    .sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));

  if (!matches.length) {
    list.innerHTML = `<div class="empty-state">No matches found for this view.</div>`;
    return;
  }
  list.replaceChildren(...matches.map((match) => buildMatchCard(match, { compact: false })));
}

function renderStatus() {
  const status = document.querySelector("#data-status");
  const updated = document.querySelector("#last-updated");
  const isLive = state.data?.meta?.mode === "live";
  status.textContent = isLive ? "Automatic updates active" : "Preview data — connection required";
  updated.textContent = formatUpdated(state.data?.meta?.updatedAt);
  document.querySelector(".live-dot").style.background = isLive ? "var(--green)" : "var(--gold)";
}

async function loadData({ cache = true } = {}) {
  const suffix = cache ? "" : `?refresh=${Date.now()}`;
  const response = await fetch(`${DATA_URL}${suffix}`);
  if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
  state.data = await response.json();
  renderStatus();
  renderGroupRails();
  renderBracket();
  renderStandings();
  renderMatches();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`#${tab.dataset.view}-view`).classList.add("is-active");
  });
});

document.querySelector("#match-filter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  renderMatches();
});

document.querySelector("#refresh-button").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  event.currentTarget.textContent = "Refreshing…";
  try {
    await loadData({ cache: false });
  } finally {
    event.currentTarget.disabled = false;
    event.currentTarget.textContent = "Refresh data";
  }
});

loadData().catch((error) => {
  console.error(error);
  document.querySelector("#data-status").textContent = "Unable to load tournament data";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
