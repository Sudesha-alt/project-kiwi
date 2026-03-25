// In-memory state for active match, synced from/to Supabase

const state = {
  match: null,
  players: [],   // all players for this match
  ballLog: [],   // all deliveries for current innings

  // Live scoring state (derived, not stored in DB)
  currentInnings: 1,
  totalRuns: 0,
  totalWickets: 0,
  currentOver: 0,
  currentBall: 0,  // legal balls in this over
  extras: 0,
  strikerId: null,
  nonStrikerId: null,
  bowlerId: null,

  // First innings target (for 2nd innings)
  target: null,
};

const listeners = [];

export function getState() {
  return state;
}

export function setState(updates) {
  Object.assign(state, updates);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

export function resetState() {
  Object.assign(state, {
    match: null,
    players: [],
    ballLog: [],
    currentInnings: 1,
    totalRuns: 0,
    totalWickets: 0,
    currentOver: 0,
    currentBall: 0,
    extras: 0,
    strikerId: null,
    nonStrikerId: null,
    bowlerId: null,
    target: null,
  });
}

// Recompute derived state from ball log
export function recomputeFromBallLog(ballLog, innings) {
  const inningsBalls = ballLog.filter(b => b.innings === innings);
  let totalRuns = 0;
  let totalWickets = 0;
  let extras = 0;
  let currentOver = 0;
  let currentBall = 0;

  for (const ball of inningsBalls) {
    totalRuns += ball.runs + (ball.extras_runs || 0);
    if (ball.extras_runs) extras += ball.extras_runs;
    if (ball.is_wicket) totalWickets++;

    // Legal ball?
    const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
    if (isLegal) {
      currentBall++;
      if (currentBall >= 6) {
        currentOver++;
        currentBall = 0;
      }
    }
  }

  setState({
    ballLog: inningsBalls,
    totalRuns,
    totalWickets,
    currentOver,
    currentBall,
    extras,
    currentInnings: innings,
  });

  return { totalRuns, totalWickets, currentOver, currentBall, extras };
}

// Get batting team number for given innings
export function getBattingTeam(match, innings) {
  if (!match) return 1;
  const tossWinner = match.toss_winner;
  const tossDecision = match.toss_decision;

  if (innings === 1) {
    return tossDecision === 'bat' ? tossWinner : (tossWinner === 1 ? 2 : 1);
  } else {
    return tossDecision === 'bat' ? (tossWinner === 1 ? 2 : 1) : tossWinner;
  }
}

export function getBowlingTeam(match, innings) {
  const batting = getBattingTeam(match, innings);
  return batting === 1 ? 2 : 1;
}

// Get players for a specific team
export function getTeamPlayers(team) {
  return state.players.filter(p => p.team === team);
}
