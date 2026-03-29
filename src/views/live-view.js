// Live Spectator View — read-only live scorecard with realtime sync
import { getMatch, getPlayers, getBallLog, getInningsSummaries, subscribeToBallLog, subscribeToMatch, unsubscribeChannel } from '../supabase.js';
import { getBattingTeam, getBowlingTeam } from '../store.js';
import { navigate } from '../router.js';

let ballChannel = null;
let matchChannel = null;
let syncInterval = null;

export async function renderLiveView(container, matchId) {
  if (!matchId) { navigate('#home'); return; }

  if (ballChannel) { unsubscribeChannel(ballChannel); ballChannel = null; }
  if (matchChannel) { unsubscribeChannel(matchChannel); matchChannel = null; }
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }

  container.innerHTML = `<div class="empty-state"><div class="spinner"></div><p class="text-muted">Live scorecard load ho raha hai...</p></div>`;

  try {
    const match = await getMatch(matchId);
    const players = await getPlayers(matchId);
    const ballLog = await getBallLog(matchId);

    const state = { match, players, ballLog };
    renderLiveUI(container, state);

    if (match.status !== 'completed') {
      syncInterval = setInterval(async () => {
        const [m, p, b] = await Promise.all([getMatch(matchId), getPlayers(matchId), getBallLog(matchId)]);
        renderLiveUI(container, { match: m, players: p, ballLog: b });
        if (m.status === 'completed') clearInterval(syncInterval);
      }, 5000);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">😵</div><p>Load nahi hua: ${err.message}</p>
      <button class="btn btn-primary" onclick="location.hash='#home'">Ghar Chalo</button></div>`;
  }
}

function getDismissalString(ball, players) {
  const bowler = players.find(p => p.id === ball.bowler_id);
  const fielder = ball.fielder_id ? players.find(p => p.id === ball.fielder_id) : null;
  switch (ball.wicket_type) {
    case 'caught': return fielder ? `c ${fielder.name} b ${bowler?.name||'?'}` : `c & b ${bowler?.name||'?'}`;
    case 'bowled': return `b ${bowler?.name||'?'}`;
    case 'lbw': return `lbw b ${bowler?.name||'?'}`;
    case 'runout': return fielder ? `run out (${fielder.name})` : `run out`;
    case 'stumped': return fielder ? `st ${fielder.name} b ${bowler?.name||'?'}` : `st b ${bowler?.name||'?'}`;
    case 'hitwicket': return `hit wicket b ${bowler?.name||'?'}`;
    default: return ball.wicket_type + (bowler ? ` (${bowler.name})` : '');
  }
}

function computeInningsStats(balls, players) {
  const batsmanStats = {};
  const bowlerStats = {};
  const dismissals = {};
  let totalRuns = 0, totalWickets = 0, currentOver = 0, currentBall = 0, extras = 0;

  for (const ball of balls) {
    // Batting
    if (!batsmanStats[ball.batsman_id]) batsmanStats[ball.batsman_id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
    const bRuns = ball.is_extra && ball.extras_type === 'wide' ? 0 : ball.runs;
    if (!ball.is_extra || ball.extras_type !== 'wide') batsmanStats[ball.batsman_id].balls++;
    if (!ball.is_extra) batsmanStats[ball.batsman_id].runs += bRuns;
    if (bRuns === 4 && !ball.is_extra) batsmanStats[ball.batsman_id].fours++;
    if (bRuns === 6 && !ball.is_extra) batsmanStats[ball.batsman_id].sixes++;
    if (ball.non_striker_id && !batsmanStats[ball.non_striker_id]) {
      batsmanStats[ball.non_striker_id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
    }

    // Bowling
    if (!bowlerStats[ball.bowler_id]) bowlerStats[ball.bowler_id] = { runs: 0, wickets: 0, balls: 0 };
    bowlerStats[ball.bowler_id].runs += ball.runs + (ball.extras_runs || 0);
    if (ball.is_wicket) bowlerStats[ball.bowler_id].wickets++;
    const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
    if (isLegal) bowlerStats[ball.bowler_id].balls++;

    // Totals
    totalRuns += ball.runs + (ball.extras_runs || 0);
    if (ball.extras_runs) extras += ball.extras_runs;
    if (ball.is_wicket) { 
      totalWickets++; 
      if (ball.dismissed_player_id) {
        dismissals[ball.dismissed_player_id] = getDismissalString(ball, players);
      } 
    }
    if (isLegal) { currentBall++; if (currentBall >= 6) { currentOver++; currentBall = 0; } }
  }

  // Current batsmen & bowler from last ball
  const lastBall = balls[balls.length - 1];
  const strikerId = lastBall?.batsman_id;
  const nonStrikerId = lastBall?.non_striker_id;
  const bowlerId = lastBall?.bowler_id;

  return { batsmanStats, bowlerStats, dismissals, totalRuns, totalWickets, currentOver, currentBall, extras, strikerId, nonStrikerId, bowlerId };
}

function renderLiveUI(container, state) {
  const { match, players, ballLog } = state;
  const innings = match.current_innings;
  const battingTeamNum = getBattingTeam(match, innings);
  const bowlingTeamNum = getBowlingTeam(match, innings);
  const battingTeamName = battingTeamNum === 1 ? match.team1_name : match.team2_name;
  const bowlingTeamName = bowlingTeamNum === 1 ? match.team1_name : match.team2_name;
  const battingPlayers = players.filter(p => p.team === battingTeamNum);
  const bowlingPlayers = players.filter(p => p.team === bowlingTeamNum);

  const inningsBalls = ballLog.filter(b => b.innings === innings);
  const stats = computeInningsStats(inningsBalls, players);

  // First innings stats if we're in 2nd innings
  let firstInningsHTML = '';
  let target = null;
  if (innings === 2) {
    const inn1Balls = ballLog.filter(b => b.innings === 1);
    const inn1 = computeInningsStats(inn1Balls, players);
    const inn1TeamNum = getBattingTeam(match, 1);
    const inn1TeamName = inn1TeamNum === 1 ? match.team1_name : match.team2_name;
    target = inn1.totalRuns + 1;
    firstInningsHTML = `
      <div class="card-flat mb-sm" style="padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="text-muted" style="font-size:0.8rem;">${inn1TeamName} (1st Innings)</span>
          <span style="font-family:var(--font-heading); font-weight:700;">${inn1.totalRuns}/${inn1.totalWickets} <span class="text-muted" style="font-weight:400;">(${inn1.currentOver}.${inn1.currentBall} ov)</span></span>
        </div>
      </div>
    `;
  }

  const oversDisplay = stats.currentOver + '.' + stats.currentBall;
  const totalBalls = stats.currentOver * 6 + stats.currentBall;
  const runRate = totalBalls > 0 ? (stats.totalRuns / (totalBalls / 6)).toFixed(2) : '0.00';

  const striker = stats.strikerId ? players.find(p => p.id === stats.strikerId) : null;
  const nonStriker = stats.nonStrikerId ? players.find(p => p.id === stats.nonStrikerId) : null;
  const bowler = stats.bowlerId ? players.find(p => p.id === stats.bowlerId) : null;
  const sStats = stats.batsmanStats[stats.strikerId] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
  const nsStats = stats.batsmanStats[stats.nonStrikerId] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
  const bwlSt = stats.bowlerStats[stats.bowlerId] || { runs: 0, wickets: 0, balls: 0 };
  const bwlOvers = bwlSt.balls ? Math.floor(bwlSt.balls / 6) + '.' + (bwlSt.balls % 6) : '0.0';

  // This Over balls
  const thisOverBalls = inningsBalls.filter(b => b.over_num === stats.currentOver);

  // Get dismissal string helper
  const getDismissal = (pid) => stats.dismissals[pid] ? 'out' : 'not out';

  container.innerHTML = `
    <div class="live-view-header">
      <div class="live-badge">📺 SPECTATOR VIEW</div>
      <div class="sync-badge" title="Realtime connected">🔄 Live</div>
    </div>

    ${match.status === 'completed' ? `
    <div class="card mb-sm" style="text-align:center; padding:16px; background:linear-gradient(135deg, rgba(250,204,21,0.1), rgba(250,204,21,0.05)); border-color:var(--accent-gold);">
      <h3 style="color:var(--accent-gold); font-family:var(--font-heading); font-size:1.5rem; letter-spacing:1px;">🏆 MATCH COMPLETED</h3>
      <p style="font-size:1.2rem; font-weight:700; margin-top:8px; color:var(--text-primary);">${match.winner} won ${match.margin}</p>
      <button class="btn btn-primary mt-md" onclick="location.hash='#summary/${match.id}'">📊 View Full Summary Report</button>
    </div>
    ` : ''}

    <!-- Scoreboard -->
    <div class="scoreboard-card mb-sm">
      <div class="scoreboard-top">
        <div class="innings-badge">${innings === 1 ? '1ST INNINGS' : '2ND INNINGS'}</div>
        ${target ? `<div class="target-badge">TGT: ${target}</div>` : ''}
      </div>
      <div class="scoreboard-main">
        <div class="scoreboard-team-name">${battingTeamName}</div>
        <div class="scoreboard-score">${stats.totalRuns}<span class="scoreboard-wickets">/${stats.totalWickets}</span></div>
        <div class="scoreboard-overs">(${oversDisplay} ov) &nbsp;•&nbsp; CRR: ${runRate}</div>
        ${target ? `<div class="scoreboard-need">Need ${Math.max(0, target - stats.totalRuns)} from ${Math.max(0, match.total_overs * 6 - totalBalls)} balls</div>` : ''}
      </div>

      ${striker ? `
      <div class="batsmen-strip">
        <div class="batsman-row on-strike">
          <div class="batsman-indicator">●</div>
          <div class="batsman-name">${striker.name}</div>
          <div class="batsman-score">${sStats.runs}<span class="batsman-balls">(${sStats.balls})</span></div>
          <div class="batsman-detail">${sStats.fours}×4 ${sStats.sixes}×6</div>
        </div>
        ${nonStriker ? `
        <div class="batsman-row">
          <div class="batsman-indicator" style="opacity:0.3;">●</div>
          <div class="batsman-name">${nonStriker.name}</div>
          <div class="batsman-score">${nsStats.runs}<span class="batsman-balls">(${nsStats.balls})</span></div>
          <div class="batsman-detail">${nsStats.fours}×4 ${nsStats.sixes}×6</div>
        </div>` : ''}
      </div>
      <div class="bowler-strip">
        <span class="bowler-label">🎯</span>
        <span class="bowler-name">${bowler?.name || '?'}</span>
        <span class="bowler-figures">${bwlOvers} - ${bwlSt.wickets}/${bwlSt.runs}</span>
      </div>
      ` : '<div style="padding:16px; text-align:center;" class="text-muted">Waiting for players to be selected...</div>'}
    </div>

    ${firstInningsHTML}

    <!-- This Over -->
    <div class="over-timeline-card mb-sm">
      <div class="over-timeline-header">
        <span class="form-label" style="margin:0;">This Over</span>
      </div>
      <div class="ball-timeline">
        ${thisOverBalls.map(b => renderBallDotLive(b)).join('')}
        ${thisOverBalls.length === 0 ? '<span class="text-muted" style="font-size:0.8rem;">New over starts...</span>' : ''}
      </div>
    </div>

    <!-- Full Batting Card -->
    <div class="card mb-sm" style="padding:var(--space-md);">
      <div class="form-label" style="margin-bottom:8px;">🏏 ${battingTeamName} — Batting</div>
      <div style="overflow-x:auto;">
        <table class="scorecard-table">
          <thead><tr><th>Batsman</th><th style="text-align:right;">R</th><th style="text-align:right;">B</th><th style="text-align:right;">4s</th><th style="text-align:right;">6s</th><th style="text-align:right;">SR</th></tr></thead>
          <tbody>
            ${Object.entries(stats.batsmanStats).map(([id, s]) => {
              const p = players.find(pl => pl.id === id);
              const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
              const isOut = stats.dismissals[id];
              const isOnStrike = id === stats.strikerId;
              return `<tr style="${isOnStrike ? 'background:rgba(34,197,94,0.06);' : ''}">
                <td class="player-name-cell">
                  <div style="font-weight:600; font-size:0.95rem;">${p?.name || '?'} ${!isOut ? '<span style="color:var(--accent-green);">*</span>' : ''}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted); font-weight:400; font-family:var(--font-body); margin-top:2px;">${isOut || 'not out'}</div>
                </td>
                <td class="runs-cell" style="text-align:right;">${s.runs}</td>
                <td style="text-align:right;">${s.balls}</td>
                <td style="text-align:right;">${s.fours}</td>
                <td style="text-align:right;">${s.sixes}</td>
                <td style="text-align:right;">${sr}</td>
              </tr>`;
            }).join('')}
            <tr class="total-row">
              <td>Extras</td>
              <td class="runs-cell" style="text-align:right;" colspan="5">${stats.extras}</td>
            </tr>
            <tr class="total-row" style="font-size:1rem;">
              <td><strong>TOTAL</strong></td>
              <td style="text-align:right;"><strong>${stats.totalRuns}/${stats.totalWickets}</strong></td>
              <td colspan="4" style="text-align:right;">(${oversDisplay} ov)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Bowling Card -->
    <div class="card mb-sm" style="padding:var(--space-md);">
      <div class="form-label" style="margin-bottom:8px;">🎯 ${bowlingTeamName} — Bowling</div>
      <div style="overflow-x:auto;">
        <table class="scorecard-table">
          <thead><tr><th>Bowler</th><th style="text-align:right;">O</th><th style="text-align:right;">R</th><th style="text-align:right;">W</th><th style="text-align:right;">Econ</th></tr></thead>
          <tbody>
            ${Object.entries(stats.bowlerStats).map(([id, s]) => {
              const p = players.find(pl => pl.id === id);
              const overs = Math.floor(s.balls / 6) + '.' + (s.balls % 6);
              const econ = s.balls > 0 ? (s.runs / (s.balls / 6)).toFixed(1) : '0.0';
              const isBowling = id === stats.bowlerId;
              return `<tr style="${isBowling ? 'background:rgba(239,68,68,0.06);' : ''}">
                <td class="player-name-cell">${p?.name || '?'} ${isBowling ? '<span style="color:var(--accent-red);">●</span>' : ''}</td>
                <td style="text-align:right;">${overs}</td>
                <td style="text-align:right;">${s.runs}</td>
                <td class="runs-cell" style="text-align:right; ${s.wickets >= 3 ? 'color:var(--accent-green);' : ''}">${s.wickets}</td>
                <td style="text-align:right;">${econ}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Yet to bat -->
    <div class="card mb-lg" style="padding:var(--space-md);">
      <div class="form-label" style="margin-bottom:8px;">🪑 Yet to Bat</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${battingPlayers.filter(p => !stats.batsmanStats[p.id] && !stats.dismissals[p.id]).map(p => `
          <span class="role-badge role-bat" style="font-size:0.75rem; padding:4px 10px;">${p.name}</span>
        `).join('') || '<span class="text-muted" style="font-size:0.8rem;">Sab khel chuke hain</span>'}
      </div>
    </div>

    <div class="text-center mb-lg">
      <button class="btn btn-ghost btn-sm" id="btn-live-home">🏠 Home</button>
    </div>
  `;

  container.querySelector('#btn-live-home')?.addEventListener('click', () => navigate('#home'));
}

function renderBallDotLive(ball) {
  if (ball.is_wicket) return `<div class="ball-dot ball-dot-W">W</div>`;
  if (ball.is_extra) {
    const map = { wide: ['ball-dot-wd', 'Wd'], noball: ['ball-dot-nb', 'Nb'], bye: ['ball-dot-b', ball.runs+'b'], legbye: ['ball-dot-lb', ball.runs+'lb'] };
    const [cls, txt] = map[ball.extras_type] || ['ball-dot-0', '?'];
    return `<div class="ball-dot ${cls}">${txt}</div>`;
  }
  const r = ball.runs;
  if (r === 0) return `<div class="ball-dot ball-dot-0">•</div>`;
  if (r === 4) return `<div class="ball-dot ball-dot-4">4</div>`;
  if (r === 6) return `<div class="ball-dot ball-dot-6">6</div>`;
  return `<div class="ball-dot ball-dot-${r}">${r}</div>`;
}
