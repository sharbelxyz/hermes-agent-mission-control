const WIN_OUTCOMES = new Set(["done", "win", "pass"]);
const CLOUD_MODEL_RE = /(codex|gpt|claude)/i;

export function computeOversight(rows, now = new Date()) {
  const cleanRows = Array.isArray(rows) ? rows.map(normalizeRow).filter(Boolean) : [];
  const generatedAt = now.toISOString();

  const goals = new Map();
  const winningMinutes = [];
  const modelStats = new Map();
  const weeklyRuns = new Map();
  const failureKinds = new Map();
  const diffStats = new Map();

  for (const row of cleanRows) {
    const won = isWin(row);
    const model = modelPrefix(row.model);
    const stat = modelStats.get(model) || { model, wins: 0, total: 0 };
    stat.total += 1;
    if (won) stat.wins += 1;
    modelStats.set(model, stat);

    const week = weekKey(row.ts);
    const weekStat = weeklyRuns.get(week) || { week, total: 0, localWins: 0, localTotal: 0, cloudRuns: 0 };
    weekStat.total += 1;
    if (isCloudModel(row.model)) {
      weekStat.cloudRuns += 1;
    } else {
      weekStat.localTotal += 1;
      if (won) weekStat.localWins += 1;
    }
    weeklyRuns.set(week, weekStat);

    if (won) {
      const minutes = row.wall_s / 60;
      if (isFiniteNumber(minutes)) {
        winningMinutes.push(minutes);
        const bucket = difficultyBucket(row.diff_files);
        const diff = diffStats.get(bucket) || [];
        diff.push(minutes);
        diffStats.set(bucket, diff);
      }
    } else {
      const kind = row.failure_kind || "unknown";
      failureKinds.set(kind, (failureKinds.get(kind) || 0) + 1);
    }
  }

  const goalRowsAsc = isDescendingByTs(cleanRows) ? [...cleanRows].reverse() : cleanRows;
  for (const row of goalRowsAsc) {
    const goal =
      goals.get(row.goal_id) ||
      {
        goalId: row.goal_id,
        firstWinSeen: false,
        everWon: false,
        winRun: null,
        firstRunSeenTs: row.ts,
        attemptOfWin: -1,
        attemptsSeen: 0,
        prefix: goalPrefix(row.goal_id),
      };
    if (!goal.firstWinSeen) {
      if (isWin(row)) {
        goal.firstWinSeen = true;
        goal.everWon = true;
        goal.winRun = row;
        goal.attemptOfWin = goal.attemptsSeen;
      }
      goal.attemptsSeen += 1;
    }
    goals.set(row.goal_id, goal);
  }

  const successLadder = {
    firstTry: 0,
    secondAttempt: 0,
    thirdPlus: 0,
    cloudAssisted: 0,
    neverWon: 0,
  };
  const goalSummaries = [];

  for (const goal of goals.values()) {
    if (goal.attemptOfWin === 0) successLadder.firstTry += 1;
    else if (goal.attemptOfWin === 1) successLadder.secondAttempt += 1;
    else if (goal.attemptOfWin >= 2) successLadder.thirdPlus += 1;
    else successLadder.neverWon += 1;
    if (goal.winRun && isCloudAssistedWin(goal.winRun)) successLadder.cloudAssisted += 1;
    goalSummaries.push({
      goalId: goal.goalId,
      firstTs: goal.firstRunSeenTs ?? 0,
      firstTry: goal.attemptOfWin === 0,
      prefix: goal.prefix,
    });
  }

  const weeklyGoalStats = new Map();
  for (const goal of goalSummaries) {
    const week = weekKey(goal.firstTs);
    const stat = weeklyGoalStats.get(week) || { goals: 0, firstTry: 0 };
    stat.goals += 1;
    if (goal.firstTry) stat.firstTry += 1;
    weeklyGoalStats.set(week, stat);
  }

  const weekly = Array.from(new Set([...weeklyRuns.keys(), ...weeklyGoalStats.keys()]))
    .sort()
    .slice(-12)
    .map((week) => {
      const goalStat = weeklyGoalStats.get(week) || { goals: 0, firstTry: 0 };
      const runStat = weeklyRuns.get(week) || { total: 0, localWins: 0, localTotal: 0, cloudRuns: 0 };
      return {
        week,
        goals: goalStat.goals,
        firstTryPct: pct(goalStat.firstTry, goalStat.goals),
        localWinPct: pct(runStat.localWins, runStat.localTotal),
        cloudSharePct: pct(runStat.cloudRuns, runStat.total),
      };
    });

  const modelWinRate = Array.from(modelStats.values())
    .map((stat) => ({ ...stat, pct: pct(stat.wins, stat.total) }))
    .sort((a, b) => b.total - a.total || a.model.localeCompare(b.model))
    .slice(0, 20);

  winningMinutes.sort((a, b) => a - b);
  const time = {
    medianMin: round1(percentile(winningMinutes, 0.5)),
    p90Min: round1(percentile(winningMinutes, 0.9)),
    maxMin: round1(winningMinutes.at(-1) ?? 0),
  };

  const difficulty = ["1 file", "2-3", "4-6", "7+"].map((bucket) => {
    const values = (diffStats.get(bucket) || []).filter(isFiniteNumber).sort((a, b) => a - b);
    return { bucket, n: values.length, medianMin: round1(percentile(values, 0.5)) };
  });

  const failureMix = Array.from(failureKinds.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    .slice(0, 20);

  const prefixStats = new Map();
  for (const goal of goalSummaries) {
    const stat = prefixStats.get(goal.prefix) || { prefix: goal.prefix, goals: 0, firstTry: 0 };
    stat.goals += 1;
    if (goal.firstTry) stat.firstTry += 1;
    prefixStats.set(goal.prefix, stat);
  }
  const strengths = Array.from(prefixStats.values())
    .map((stat) => ({ prefix: stat.prefix, goals: stat.goals, firstTryPct: pct(stat.firstTry, stat.goals) }))
    .sort((a, b) => b.firstTryPct - a.firstTryPct || b.goals - a.goals || a.prefix.localeCompare(b.prefix));
  const cappedStrengths = strengths.length > 10 ? strengths.slice(0, 5).concat(strengths.slice(-5)) : strengths;

  return {
    generatedAt,
    totals: { goals: goals.size, runs: cleanRows.length, wins: winningMinutes.length },
    successLadder,
    weekly,
    modelWinRate,
    time,
    difficulty,
    failureMix,
    strengths: cappedStrengths,
  };
}

function normalizeRow(value) {
  if (!value || typeof value !== "object") return null;
  const goalId = safeText(value.goal_id);
  const ts = Number(value.ts);
  if (!goalId || !Number.isFinite(ts)) return null;
  return {
    ts,
    goal_id: goalId,
    rung: safeNumber(value.rung),
    attempt: safeNumber(value.attempt),
    model: safeText(value.model) || "unknown",
    failure_kind: safeText(value.failure_kind) || "",
    outcome: safeText(value.outcome) || "",
    wall_s: Math.max(0, safeNumber(value.wall_s)),
    diff_files: Math.max(0, Math.trunc(safeNumber(value.diff_files))),
    notes: safeText(value.notes) || "",
  };
}

function isWin(row) {
  return WIN_OUTCOMES.has(String(row.outcome || "").toLowerCase());
}

function isCloudModel(model) {
  return CLOUD_MODEL_RE.test(String(model || ""));
}

function isCloudAssistedWin(row) {
  return row.rung >= 1 || isCloudModel(row.model);
}

function isDescendingByTs(rows) {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].ts > rows[index - 1].ts) return false;
  }
  return true;
}

function modelPrefix(model) {
  return String(model || "unknown").split("/")[0].trim() || "unknown";
}

function goalPrefix(goalId) {
  const text = String(goalId || "");
  const match = /^g_\d{6}_([^_]+)/.exec(text);
  if (match) return match[1] || "unknown";
  const fallback = text.replace(/^g[_-]?/, "").split("_")[0];
  return fallback || "unknown";
}

function difficultyBucket(files) {
  if (files <= 1) return "1 file";
  if (files <= 3) return "2-3";
  if (files <= 6) return "4-6";
  return "7+";
}

function weekKey(ts) {
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "1970-W01";
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const index = (values.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return values[low];
  return values[low] + (values[high] - values[low]) * (index - low);
}

function pct(numerator, denominator) {
  return denominator > 0 ? round1((numerator / denominator) * 100) : 0;
}

function round1(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}
