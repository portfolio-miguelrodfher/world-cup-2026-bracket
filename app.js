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

function enableTeamOutlook(element, team) {
  if (!team?.id || !state.data?.forecast?.teams) return;
  element.classList.add("team-outlook-trigger");
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `Open ${team.name} forecast`);
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    openTeamDialog(team.id);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      openTeamDialog(team.id);
    }
  });
}

function renderMatchForecast(container, match, compact) {
  const forecast = match.forecast;
  const finished = ["FT", "AET", "PEN"].includes(match.status?.short);
  if (!forecast || finished || !match.home?.id || !match.away?.id) {
    container.remove();
    return;
  }

  container.classList.toggle("match-forecast--compact", compact);
  if (match.round === "Group stage") {
    container.innerHTML = `
      <span><b>${match.home.code}</b> ${forecast.home}%</span>
      <span><b>Draw</b> ${forecast.draw}%</span>
      <span><b>${match.away.code}</b> ${forecast.away}%</span>
    `;
  } else {
    container.innerHTML = `
      <span><b>${match.home.code}</b> ${forecast.homeAdvance}%</span>
      <small>chance to advance</small>
      <span><b>${match.away.code}</b> ${forecast.awayAdvance}%</span>
    `;
  }
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
    const name = row.querySelector(".team-name");
    name.textContent = team?.name || "TBD";
    enableTeamOutlook(name, team);
    const hasScore = goals[index] !== null && goals[index] !== undefined;
    const hasPens = penalties[index] !== null && penalties[index] !== undefined;
    row.querySelector(".team-score").textContent = hasScore
      ? `${goals[index]}${hasPens ? ` (${penalties[index]})` : ""}`
      : "–";
    row.classList.toggle("is-winner", team?.winner === true);
  });

  renderMatchForecast(fragment.querySelector(".match-forecast"), match, compact);
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
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${group.name} matches and scores`);

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
    const prompt = document.createElement("span");
    prompt.className = "group-card__prompt";
    prompt.textContent = "View matches →";
    card.append(teamGrid, title, prompt);
    card.addEventListener("click", () => openGroupDialog(group, index));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openGroupDialog(group, index);
      }
    });
    return card;
  });

  document.querySelector("#groups-left").replaceChildren(...cards.slice(0, 6));
  document.querySelector("#groups-right").replaceChildren(...cards.slice(6));
}

function groupMatches(group) {
  const teamIds = new Set((group.teams || []).map((team) => String(team.id)));
  return (state.data?.matches || [])
    .filter(
      (match) =>
        match.round === "Group stage" &&
        teamIds.has(String(match.home?.id)) &&
        teamIds.has(String(match.away?.id)),
    )
    .sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0));
}

function openGroupDialog(group, colorIndex) {
  const dialog = document.querySelector("#group-dialog");
  dialog.style.setProperty("--group-color", GROUP_COLORS[colorIndex]);
  document.querySelector("#group-dialog-title").textContent = `${group.name} matches`;

  const standings = document.querySelector("#group-dialog-standings");
  standings.replaceChildren(
    ...(group.teams || []).map((team, index) => {
      const row = document.createElement("div");
      row.className = "dialog-standing-row";

      const rank = document.createElement("strong");
      rank.textContent = String(team.rank || index + 1);
      const identity = document.createElement("span");
      identity.className = "dialog-standing-team";
      identity.append(teamMark(team), document.createTextNode(team.name));
      const record = document.createElement("span");
      record.textContent = `${team.played ?? 0} PL · ${team.goalsDiff > 0 ? "+" : ""}${team.goalsDiff ?? 0} GD`;
      const points = document.createElement("strong");
      points.textContent = `${team.points ?? 0} PTS`;

      row.append(rank, identity, record, points);
      return row;
    }),
  );

  const matches = groupMatches(group);
  const matchContainer = document.querySelector("#group-dialog-matches");
  if (matches.length) {
    matchContainer.replaceChildren(
      ...matches.map((match) => buildMatchCard(match, { compact: false })),
    );
  } else {
    matchContainer.innerHTML = `<div class="empty-state">The group schedule is not available yet.</div>`;
  }

  dialog.showModal();
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
      enableTeamOutlook(teamCell, team);
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

function openTeamDialog(teamId) {
  const team = state.data?.forecast?.teams?.find((item) => String(item.id) === String(teamId));
  if (!team) return;
  document.querySelector("#team-dialog-title").textContent = team.name;
  document.querySelector("#team-dialog-mark").replaceChildren(teamMark(team));
  document.querySelector("#team-strength").textContent = `${team.strength}/100`;
  document.querySelector("#team-elo").textContent = String(team.effectiveRating);

  const stages = [
    ["Reach Round of 32", "roundOf32"],
    ["Reach Round of 16", "roundOf16"],
    ["Reach quarterfinal", "quarterFinal"],
    ["Reach semifinal", "semiFinal"],
    ["Reach final", "final"],
    ["Win World Cup", "champion"],
  ];
  const bars = document.querySelector("#team-outlook-bars");
  bars.replaceChildren(
    ...stages.map(([label, key]) => {
      const row = document.createElement("div");
      row.className = "outlook-row";
      row.innerHTML = `
        <div><span>${label}</span><strong>${team.outlook[key]}%</strong></div>
        <div class="outlook-track"><span style="width: ${team.outlook[key]}%"></span></div>
      `;
      return row;
    }),
  );

  const reasons = document.querySelector("#team-reasons");
  reasons.replaceChildren(
    ...(team.reasons.length ? team.reasons : ["Results and rating are near the tournament average"]).map(
      (reason) => {
        const item = document.createElement("li");
        item.textContent = reason;
        return item;
      },
    ),
  );
  document.querySelector("#team-dialog").showModal();
}

function renderForecast() {
  const body = document.querySelector("#forecast-table-body");
  const teams = state.data?.forecast?.teams || [];
  body.replaceChildren(
    ...teams.map((team, index) => {
      const row = document.createElement("tr");
      const identity = document.createElement("td");
      const teamButton = document.createElement("button");
      teamButton.type = "button";
      teamButton.className = "forecast-team";
      teamButton.append(teamMark(team), document.createTextNode(team.name));
      teamButton.addEventListener("click", () => openTeamDialog(team.id));
      identity.append(teamButton);

      const values = [
        team.strength,
        team.outlook.roundOf32,
        team.outlook.roundOf16,
        team.outlook.quarterFinal,
        team.outlook.semiFinal,
        team.outlook.final,
        team.outlook.champion,
      ];
      row.append(identity);
      values.forEach((value, valueIndex) => {
        const cell = document.createElement("td");
        cell.textContent = valueIndex === 0 ? `${value}` : `${value}%`;
        if (valueIndex === values.length - 1 && index < 5) cell.className = "champion-contender";
        row.append(cell);
      });
      return row;
    }),
  );
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
  renderForecast();
}

function activateView(viewName, updateHash = true) {
  const tab = document.querySelector(`.tab[data-view="${viewName}"]`);
  const view = document.querySelector(`#${viewName}-view`);
  if (!tab || !view) return;
  document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("is-active"));
  tab.classList.add("is-active");
  view.classList.add("is-active");
  if (updateHash) history.replaceState(null, "", `#${viewName}`);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activateView(tab.dataset.view));
});

window.addEventListener("hashchange", () => {
  activateView(location.hash.slice(1), false);
});

activateView(location.hash.slice(1), false);

document.querySelector("#match-filter").addEventListener("change", (event) => {
  state.filter = event.target.value;
  renderMatches();
});

document.querySelector("#group-dialog-close").addEventListener("click", () => {
  document.querySelector("#group-dialog").close();
});

document.querySelector("#group-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

document.querySelector("#team-dialog-close").addEventListener("click", () => {
  document.querySelector("#team-dialog").close();
});

document.querySelector("#team-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
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
