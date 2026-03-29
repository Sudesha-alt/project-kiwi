// Live Scoring view with Supabase Realtime sync
import { getMatch, getPlayers, getBallLog, logBall, undoLastBall, updateMatch, saveInningsSummary, subscribeToBallLog, subscribeToMatch, unsubscribeChannel, addSinglePlayer, updatePlayer, deletePlayer } from '../supabase.js';
import { getState, setState, recomputeFromBallLog, getBattingTeam, getBowlingTeam } from '../store.js';
import { navigate } from '../router.js';

let ballChannel = null;
let matchChannel = null;

export async function renderScoring(container, matchId) {
  if (!matchId) { navigate('#home'); return; }

  // Cleanup previous subscriptions
  if (ballChannel) { unsubscribeChannel(ballChannel); ballChannel = null; }
  if (matchChannel) { unsubscribeChannel(matchChannel); matchChannel = null; }

  container.innerHTML = `<div class="empty-state"><div class="spinner"></div><p class="text-muted">Match load ho raha hai...</p></div>`;

  try {
    const match = await getMatch(matchId);
    const players = await getPlayers(matchId);
    const innings = match.current_innings;
    const allBalls = await getBallLog(matchId);

    setState({ match, players });
    recomputeFromBallLog(allBalls, innings);

    // Setup realtime sync
    ballChannel = subscribeToBallLog(matchId,
      async (newBall) => {
        // Another device added a ball - re-fetch and re-render
        const freshBalls = await getBallLog(matchId);
        const currentState = getState();
        recomputeFromBallLog(freshBalls, currentState.currentInnings);
        // Re-determine active players from last ball
        const inningsBalls = freshBalls.filter(b => b.innings === currentState.currentInnings);
        if (inningsBalls.length > 0) {
          const last = inningsBalls[inningsBalls.length - 1];
          setState({ strikerId: last.batsman_id, nonStrikerId: last.non_striker_id, bowlerId: last.bowler_id });
        }
        renderScoringUI(container);
      },
      async () => {
        // Ball deleted (undo) - re-fetch
        const freshBalls = await getBallLog(matchId);
        const currentState = getState();
        recomputeFromBallLog(freshBalls, currentState.currentInnings);
        const inningsBalls = freshBalls.filter(b => b.innings === currentState.currentInnings);
        if (inningsBalls.length > 0) {
          const last = inningsBalls[inningsBalls.length - 1];
          setState({ strikerId: last.batsman_id, nonStrikerId: last.non_striker_id, bowlerId: last.bowler_id });
        } else {
          setState({ strikerId: null, nonStrikerId: null, bowlerId: null });
        }
        renderScoringUI(container);
      }
    );

    matchChannel = subscribeToMatch(matchId, async (updatedMatch) => {
      const currentState = getState();
      setState({ match: updatedMatch });
      if (updatedMatch.current_innings !== currentState.currentInnings) {
        // Innings changed from another device
        const freshBalls = await getBallLog(matchId);
        recomputeFromBallLog(freshBalls, updatedMatch.current_innings);
        setState({ strikerId: null, nonStrikerId: null, bowlerId: null, target: updatedMatch.current_innings === 2 ? currentState.totalRuns + 1 : null });
      }
      if (updatedMatch.status === 'completed') {
        navigate(`#summary/${matchId}`);
        return;
      }
      renderScoringUI(container);
    });

    renderScoringUI(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">😵</div><p>Match load nahi hua: ${err.message}</p>
      <button class="btn btn-primary" onclick="location.hash='#home'">Ghar Chalo</button></div>`;
  }
}

function computeStats(ballLog, players) {
  const batsmanStats = {};
  const bowlerStats = {};
  const dismissedIds = new Set();

  for (const ball of ballLog) {
    if (!batsmanStats[ball.batsman_id]) batsmanStats[ball.batsman_id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
    const bRuns = ball.is_extra && (ball.extras_type === 'wide' || ball.extras_type === 'noball') ? 0 : ball.runs;
    batsmanStats[ball.batsman_id].runs += bRuns;
    if (!ball.is_extra || ball.extras_type !== 'wide') batsmanStats[ball.batsman_id].balls++;
    if (bRuns === 4) batsmanStats[ball.batsman_id].fours++;
    if (bRuns === 6) batsmanStats[ball.batsman_id].sixes++;

    if (!bowlerStats[ball.bowler_id]) bowlerStats[ball.bowler_id] = { runs: 0, wickets: 0, balls: 0 };
    bowlerStats[ball.bowler_id].runs += ball.runs + (ball.extras_runs || 0);
    if (ball.is_wicket) bowlerStats[ball.bowler_id].wickets++;
    const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
    if (isLegal) bowlerStats[ball.bowler_id].balls++;

    if (ball.is_wicket && ball.dismissed_player_id) dismissedIds.add(ball.dismissed_player_id);
  }
  Object.values(bowlerStats).forEach(bs => { bs.overs = Math.floor(bs.balls / 6) + '.' + (bs.balls % 6); });
  return { batsmanStats, bowlerStats, dismissedIds };
}

function renderScoringUI(container) {
  const s = getState();
  const match = s.match;
  const innings = s.currentInnings;
  const battingTeamNum = getBattingTeam(match, innings);
  const bowlingTeamNum = getBowlingTeam(match, innings);
  const battingTeamName = battingTeamNum === 1 ? match.team1_name : match.team2_name;
  const battingPlayers = s.players.filter(p => p.team === battingTeamNum);
  const bowlingPlayers = s.players.filter(p => p.team === bowlingTeamNum);

  const { batsmanStats, bowlerStats, dismissedIds } = computeStats(s.ballLog, s.players);

  const striker = s.strikerId ? s.players.find(p => p.id === s.strikerId) : null;
  const nonStriker = s.nonStrikerId ? s.players.find(p => p.id === s.nonStrikerId) : null;
  const bowler = s.bowlerId ? s.players.find(p => p.id === s.bowlerId) : null;
  const sStats = batsmanStats[s.strikerId] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
  const nsStats = batsmanStats[s.nonStrikerId] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
  const bwlSt = bowlerStats[s.bowlerId] || { runs: 0, wickets: 0, overs: '0.0' };

  const oversDisplay = s.currentOver + '.' + s.currentBall;
  const totalBalls = s.currentOver * 6 + s.currentBall;
  const runRate = totalBalls > 0 ? (s.totalRuns / (totalBalls / 6)).toFixed(2) : '0.00';

  const needsStriker = !s.strikerId;
  const lms = match.last_man_standing;
  // In LMS mode, the last batsman can bat alone - so we allow nonStriker to be null/sentinel
  const lmsSoloBatting = lms && s.strikerId && !s.nonStrikerId && (battingPlayers.filter(p => !dismissedIds.has(p.id) && p.id !== s.strikerId).length === 0);
  const needsNonStriker = s.strikerId && !s.nonStrikerId && !lmsSoloBatting;
  const needsBowler = s.strikerId && (s.nonStrikerId || lmsSoloBatting) && !s.bowlerId;
  const ready = s.strikerId && (s.nonStrikerId || lmsSoloBatting) && s.bowlerId;

  const allOut = lms ? s.totalWickets >= battingPlayers.length : s.totalWickets >= battingPlayers.length - 1;
  const oversComplete = s.currentOver >= match.total_overs;
  const inningsOver = allOut || oversComplete;
  const targetChased = innings === 2 && s.target && s.totalRuns >= s.target;

  const thisOverBalls = s.ballLog.filter(b => b.over_num === s.currentOver);

  const recentCommentaryBalls = s.ballLog.slice(-5).reverse().filter(b => b.commentary);

  // Recent partnership
  let partnership = { runs: 0, balls: 0 };
  for (let i = s.ballLog.length - 1; i >= 0; i--) {
    const b = s.ballLog[i];
    if (b.is_wicket) break;
    partnership.runs += b.runs + (b.extras_runs || 0);
    const isLegal = !b.is_extra || b.extras_type === 'bye' || b.extras_type === 'legbye';
    if (isLegal) partnership.balls++;
  }

  container.innerHTML = `
    <!-- Scoreboard -->
    <div class="scoreboard-card card mb-sm">
      <div class="scoreboard-top" style="display:flex; justify-content:space-between; margin-bottom:12px;">
        <div style="display:flex; gap:8px; align-items:center;">
          <div class="innings-badge" style="background:var(--bg-primary); border:1px solid var(--border-glass); padding:2px 8px; border-radius:4px; font-size:0.7rem; font-weight:700; color:var(--text-secondary);">${innings === 1 ? '1ST INNINGS' : '2ND INNINGS'}</div>
          <div class="live-badge" style="background:rgba(239,68,68,0.15); color:var(--accent-red); border:1px solid rgba(239,68,68,0.3); padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:700; animation: livePulse 2s infinite;">🔴 LIVE UMPIRE</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <div class="sync-badge" title="Realtime connected" style="font-size:0.75rem; color:var(--accent-green);">🔄 Synced</div>
          <button class="btn btn-ghost btn-sm" id="btn-share-spectator" style="padding:4px 8px; font-size:0.75rem; border:1px solid var(--border-glass);">🔗 Share</button>
        </div>
      </div>
      
      <div class="scoreboard-main" style="text-align:center;">
        <div class="scoreboard-team-name" style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:1px;">${battingTeamName}</div>
        <div class="scoreboard-score" style="font-family:var(--font-heading); font-size:4rem; font-weight:800; background:var(--gradient-main); -webkit-background-clip:text; -webkit-text-fill-color:transparent; line-height:1.1;">${s.totalRuns}<span class="scoreboard-wickets" style="font-size:2rem; color:var(--text-muted); -webkit-text-fill-color:initial;">/${s.totalWickets}</span></div>
        <div class="scoreboard-overs" style="font-size:1.1rem; color:var(--text-muted); margin-top:4px;">(${oversDisplay} ov) &nbsp;•&nbsp; CRR: ${runRate}</div>
        ${innings === 2 && s.target ? `<div class="scoreboard-need" style="color:var(--accent-gold); font-weight:700; font-size:1rem; margin-top:8px;">Need ${Math.max(0, s.target - s.totalRuns)} from ${Math.max(0, match.total_overs * 6 - totalBalls)} balls | TGT: ${s.target}</div>` : ''}
      </div>

      ${ready ? `
      <div class="batsmen-strip">
        <div class="batsman-row on-strike">
          <div class="batsman-indicator">●</div>
          <div class="batsman-name">${striker?.name || '?'} <span class="change-batsman-btn" data-role="striker" style="cursor:pointer; font-size:0.75rem; margin-left:4px; opacity:0.7;">✏️</span></div>
          <div class="batsman-score">${sStats.runs}<span class="batsman-balls">(${sStats.balls})</span></div>
          <div class="batsman-detail">${sStats.fours}×4 ${sStats.sixes}×6</div>
        </div>
        ${lmsSoloBatting ? `
        <div class="batsman-row" style="opacity:0.4;">
          <div class="batsman-indicator" style="opacity:0.3;">●</div>
          <div class="batsman-name" style="font-style:italic;">Last Man Standing 🧍</div>
          <div class="batsman-score">-</div>
          <div class="batsman-detail">-</div>
        </div>` : `
        <div class="batsman-row">
          <div class="batsman-indicator" style="opacity:0.3;">●</div>
          <div class="batsman-name">${nonStriker?.name || '?'} <span class="change-batsman-btn" data-role="non-striker" style="cursor:pointer; font-size:0.75rem; margin-left:4px; opacity:0.7;">✏️</span></div>
          <div class="batsman-score">${nsStats.runs}<span class="batsman-balls">(${nsStats.balls})</span></div>
          <div class="batsman-detail">${nsStats.fours}×4 ${nsStats.sixes}×6</div>
        </div>`}
        <div class="partnership-row">
          <span>Partnership:</span> <strong>${partnership.runs}</strong> (${partnership.balls})
        </div>
      </div>
      <div class="bowler-strip">
        <span class="bowler-label">🎯</span>
        <span class="bowler-name">${bowler?.name || '?'}</span>
        <span class="bowler-figures">${bwlSt.overs} - ${bwlSt.wickets}/${bwlSt.runs}</span>
      </div>
      ` : ''}
    </div>

    ${(inningsOver || targetChased) ? renderInningsOverUI(innings, battingTeamName, match) : ''}
    ${needsStriker ? renderPlayerSelection('🏏 Striker Choose Karo', battingPlayers, dismissedIds, 'select-striker', s.nonStrikerId) : ''}
    ${needsNonStriker ? renderPlayerSelection('Non-Striker Choose Karo', battingPlayers, dismissedIds, 'select-non-striker', s.strikerId) : ''}
    ${needsBowler ? renderPlayerSelection('🎯 Bowler Choose Karo', bowlingPlayers, new Set(), 'select-bowler') : ''}
    
    ${s.needsStrikeDecision ? `
    <div class="card mb-md text-center" style="border:2px solid var(--accent-gold); background:rgba(250,204,21,0.05);">
      <h3 style="font-family:var(--font-heading); color:var(--accent-gold); margin-bottom:12px;">🔄 Cross Over Check</h3>
      <p class="text-muted mb-md">Run-out ke baad strike par kaun hai?</p>
      <div style="display:flex; gap:12px;">
        <button class="btn btn-primary btn-full set-strike-btn" data-sid="${s.strikerId}">${striker?.name || 'Player 1'}</button>
        <button class="btn btn-primary btn-full set-strike-btn" data-sid="${s.nonStrikerId}">${nonStriker?.name || 'Player 2'}</button>
      </div>
    </div>
    ` : ''}

    ${ready && !inningsOver && !targetChased ? `
    <!-- This Over Timeline -->
    <div class="over-timeline-card card mb-sm">
      <div class="over-timeline-header" style="display:flex; justify-content:space-between; align-items:center;">
        <span class="form-label" style="margin:0;">This Over</span>
        <span class="text-muted" style="font-size:0.75rem;">${thisOverBalls.length} deliveries</span>
      </div>
      <div class="ball-timeline">
        ${thisOverBalls.map(b => renderBallDot(b)).join('')}
        ${thisOverBalls.length === 0 ? '<span class="text-muted" style="font-size:0.8rem;">New over starts...</span>' : ''}
      </div>
    </div>

    <!-- Commentary Feed -->
    ${recentCommentaryBalls.length > 0 ? `
    <div class="commentary-feed mb-sm">
      ${recentCommentaryBalls.map(b => `<div class="commentary-item">
        <span class="commentary-ball-badge">${b.over_num}.${b.ball_num}</span>
        <span class="commentary-text">${b.commentary}</span>
      </div>`).join('')}
    </div>` : ''}

    <!-- Runs -->
    <div class="scoring-section mb-sm">
      <div class="scoring-label">Runs</div>
      <div class="run-grid">
        <button class="run-btn run-btn-dot" data-runs="0">•</button>
        <button class="run-btn run-btn-1" data-runs="1">1</button>
        <button class="run-btn run-btn-2" data-runs="2">2</button>
        <button class="run-btn run-btn-3" data-runs="3">3</button>
      </div>
      <div class="boundary-grid">
        <button class="run-btn run-btn-4" data-runs="4"><span class="boundary-label">FOUR</span><span class="boundary-num">4</span></button>
        <button class="run-btn run-btn-6" data-runs="6"><span class="boundary-label">SIX</span><span class="boundary-num">6</span></button>
      </div>
    </div>

    <!-- Extras -->
    <div class="scoring-section mb-sm">
      <div class="scoring-label">Extras</div>
      <div class="extras-grid">
        <button class="extra-btn" data-extra="wide"><span class="extra-icon">↔</span> Wide</button>
        <button class="extra-btn" data-extra="noball"><span class="extra-icon">⊘</span> No Ball</button>
        <button class="extra-btn" data-extra="bye"><span class="extra-icon">B</span> Bye</button>
        <button class="extra-btn" data-extra="legbye"><span class="extra-icon">LB</span> Leg Bye</button>
      </div>
    </div>

    <!-- Wicket -->
    <div class="scoring-section mb-sm">
      <div class="scoring-label" style="color:var(--accent-red);">Wicket 🔴</div>
      <div class="wicket-grid">
        <button class="wicket-btn" data-wicket="bowled">Bowled</button>
        <button class="wicket-btn" data-wicket="caught">Caught</button>
        <button class="wicket-btn" data-wicket="lbw">LBW</button>
        <button class="wicket-btn" data-wicket="runout">Run Out</button>
        <button class="wicket-btn" data-wicket="stumped">Stumped</button>
        <button class="wicket-btn" data-wicket="hitwicket">Hit Wicket</button>
      </div>
    </div>

    <!-- Commentary -->
    <div class="commentary-input-section mb-sm">
      <div class="scoring-label">💬 Commentary (optional)</div>
      <input type="text" class="form-input commentary-input" id="ball-commentary" placeholder="e.g. Cover drive boundary..." />
    </div>

    <!-- Actions -->
    <div class="actions-bar mb-lg" style="display:flex; flex-wrap:wrap; gap:8px;">
      <button class="btn btn-ghost btn-sm" id="btn-undo" ${s.ballLog.length === 0 ? 'disabled style="opacity:0.4"' : ''}>↩ Undo</button>
      <button class="btn btn-ghost btn-sm" id="btn-change-bowler">🔄 Bowler</button>
      <button class="btn btn-ghost btn-sm" id="btn-swap-strike">⇄ Swap</button>
      <button class="btn btn-ghost btn-sm" id="btn-retire-batsman" title="Retire/Switch Batsman">🏃 Retire</button>
      <button class="btn btn-ghost btn-sm" id="btn-edit-players">✏️ Players</button>
      <button class="btn btn-danger btn-sm" id="btn-end-innings" style="margin-left:auto;">End Innings</button>
    </div>
    ` : ''}
    <div id="wicket-modal" class="modal-overlay" style="display:none;"></div>
    <div id="edit-players-modal" class="modal-overlay" style="display:none;"></div>
  `;

  attachScoringEvents(container, match, battingPlayers, bowlingPlayers, dismissedIds);
}

function renderBallDot(ball) {
  if (ball.is_wicket) return `<div class="ball-dot ball-dot-W" title="${ball.commentary || 'Wicket!'}">W</div>`;
  if (ball.is_extra) {
    const map = { wide: ['ball-dot-wd', 'Wd'], noball: ['ball-dot-nb', 'Nb'], bye: ['ball-dot-b', ball.runs+'b'], legbye: ['ball-dot-lb', ball.runs+'lb'] };
    const [cls, txt] = map[ball.extras_type] || ['ball-dot-0', '?'];
    return `<div class="ball-dot ${cls}" title="${ball.commentary || ball.extras_type}">${txt}</div>`;
  }
  const r = ball.runs;
  if (r === 0) return `<div class="ball-dot ball-dot-0" title="${ball.commentary || 'Dot'}">•</div>`;
  if (r === 4) return `<div class="ball-dot ball-dot-4" title="${ball.commentary || 'FOUR!'}">4</div>`;
  if (r === 6) return `<div class="ball-dot ball-dot-6" title="${ball.commentary || 'SIX!'}">6</div>`;
  return `<div class="ball-dot ball-dot-${r}" title="${ball.commentary || r+' runs'}">${r}</div>`;
}

function renderInningsOverUI(innings, battingTeamName, match) {
  const s = getState();
  if (innings === 1) {
    return `<div class="card mb-md text-center" style="padding:32px;">
      <div style="font-size:2.5rem; margin-bottom:8px;">🏁</div>
      <h3 style="font-family:var(--font-heading);">${battingTeamName} ka innings khatam!</h3>
      <p class="text-muted mt-sm">Score: ${s.totalRuns}/${s.totalWickets} (${s.currentOver}.${s.currentBall} overs)</p>
      <button class="btn btn-primary btn-lg mt-md" id="btn-start-innings2">▶️ 2nd Innings Shuru Karo</button>
    </div>`;
  }
  const battTeamNum = getBattingTeam(match, innings);
  const bowlTeamNum = getBowlingTeam(match, innings);
  let result;
  if (s.totalRuns >= s.target) {
    const name = battTeamNum === 1 ? match.team1_name : match.team2_name;
    const wl = (s.players.filter(p => p.team === battTeamNum).length - 1) - s.totalWickets;
    result = `${name} won by ${wl} wickets!`;
  } else {
    const name = bowlTeamNum === 1 ? match.team1_name : match.team2_name;
    result = `${name} won by ${(s.target - 1) - s.totalRuns} runs!`;
  }
  return `<div class="card mb-md text-center" style="padding:32px;">
    <div style="font-size:2.5rem;">🏆</div>
    <h3 style="font-family:var(--font-heading);">Match Khatam!</h3>
    <p style="font-size:1.2rem; color:var(--accent-green); margin-top:12px; font-weight:700;">${result}</p>
    <button class="btn btn-primary btn-lg mt-md" id="btn-finish-match">📊 Summary Dekho</button>
  </div>`;
}

function renderPlayerSelection(title, players, excludeIds, className, also = null) {
  const available = players.filter(p => !excludeIds.has(p.id) && p.id !== also);
  return `<div class="card mb-md">
    <h3 style="font-family:var(--font-heading); margin-bottom:12px;">${title}</h3>
    <ul class="modal-player-list ${className}">
      ${available.map(p => `<li class="modal-player-item" data-player-id="${p.id}">
        ${p.name} <span class="role-badge ${getRBC(p.role)}" style="margin-left:8px;">${getRL(p.role)}</span>
      </li>`).join('')}
    </ul>
  </div>`;
}

function showWicketModal(container, wicketType, match, battingPlayers, bowlingPlayers, dismissedIds, callback) {
  const s = getState();
  const modal = container.querySelector('#wicket-modal');
  let needsDismissed = wicketType === 'runout';
  let needsFielder = ['caught', 'runout', 'stumped'].includes(wicketType);
  const bowlingTeamNum = getBowlingTeam(match, s.currentInnings);
  const wk = s.players.find(p => p.team === bowlingTeamNum && p.role === 'wk');
  let dismissedId = ['bowled', 'lbw', 'hitwicket', 'caught', 'stumped'].includes(wicketType) ? s.strikerId : null;
  let fielderId = (wicketType === 'stumped' && wk) ? wk.id : null;

  if (!needsDismissed && !needsFielder) { callback({ dismissedId, fielderId }); return; }
  if (['bowled', 'lbw', 'hitwicket'].includes(wicketType)) { callback({ dismissedId, fielderId: null }); return; }

  function render() {
    if (needsDismissed && !dismissedId) {
      const sn = s.players.find(p => p.id === s.strikerId)?.name || 'Striker';
      const nsn = s.players.find(p => p.id === s.nonStrikerId)?.name || 'Non-Striker';
      modal.style.display = 'flex';
      modal.innerHTML = `<div class="modal"><h3>🔴 Run Out — Kaun Out?</h3>
        <ul class="modal-player-list">
          <li class="modal-player-item" data-d="${s.strikerId}">${sn} <span class="role-badge role-bat" style="margin-left:8px;">STRIKER</span></li>
          <li class="modal-player-item" data-d="${s.nonStrikerId}">${nsn} <span class="role-badge role-bowl" style="margin-left:8px;">NON-STRIKER</span></li>
        </ul>
        <button class="btn btn-ghost btn-sm btn-full mt-md" id="modal-cancel">Cancel</button></div>`;
      modal.querySelectorAll('[data-d]').forEach(i => i.addEventListener('click', () => { dismissedId = i.dataset.d; render(); }));
      modal.querySelector('#modal-cancel')?.addEventListener('click', () => { modal.style.display = 'none'; });
      return;
    }
    if (needsFielder && !fielderId) {
      const label = {caught:'Catch Kisne Liya?', runout:'Run Out Kisne Kiya?', stumped:'Stumping Kisne Ki?'}[wicketType] || 'Fielder?';
      modal.style.display = 'flex';
      modal.innerHTML = `<div class="modal"><h3>🧤 ${label}</h3>
        <ul class="modal-player-list">
          ${bowlingPlayers.map(p => `<li class="modal-player-item" data-f="${p.id}">${p.name} <span class="role-badge ${getRBC(p.role)}" style="margin-left:8px;">${getRL(p.role)}</span></li>`).join('')}
        </ul>
        <button class="btn btn-ghost btn-sm btn-full mt-md" id="modal-cancel">Cancel</button></div>`;
      modal.querySelectorAll('[data-f]').forEach(i => i.addEventListener('click', () => { fielderId = i.dataset.f; modal.style.display = 'none'; callback({ dismissedId, fielderId }); }));
      modal.querySelector('#modal-cancel')?.addEventListener('click', () => { modal.style.display = 'none'; });
      return;
    }
    modal.style.display = 'none';
    callback({ dismissedId, fielderId });
  }
  render();
}

function attachScoringEvents(container, match, battingPlayers, bowlingPlayers, dismissedIds) {
  const s = getState();
  container.querySelectorAll('.select-striker .modal-player-item').forEach(i => i.addEventListener('click', () => { setState({ strikerId: i.dataset.playerId }); renderScoringUI(container); }));
  container.querySelectorAll('.select-non-striker .modal-player-item').forEach(i => i.addEventListener('click', () => { setState({ nonStrikerId: i.dataset.playerId }); renderScoringUI(container); }));
  container.querySelectorAll('.select-bowler .modal-player-item').forEach(i => i.addEventListener('click', () => { setState({ bowlerId: i.dataset.playerId }); renderScoringUI(container); }));

  container.querySelectorAll('.run-btn[data-runs]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const commentary = container.querySelector('#ball-commentary')?.value?.trim() || null;
      await recordBall(container, match, { runs: parseInt(btn.dataset.runs), commentary }, battingPlayers, dismissedIds);
    });
  });

  container.querySelectorAll('.extra-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const extra = btn.dataset.extra;
      const commentary = container.querySelector('#ball-commentary')?.value?.trim() || null;
      if (extra === 'wide') await recordBall(container, match, { runs: 0, isExtra: true, extrasType: 'wide', extrasRuns: 1, commentary }, battingPlayers, dismissedIds);
      else if (extra === 'noball') await recordBall(container, match, { runs: 0, isExtra: true, extrasType: 'noball', extrasRuns: 1, commentary }, battingPlayers, dismissedIds);
      else if (extra === 'bye') { const r = prompt('Kitne bye runs?', '1'); if (r !== null) await recordBall(container, match, { runs: parseInt(r)||1, isExtra: true, extrasType: 'bye', extrasRuns: 0, commentary }, battingPlayers, dismissedIds); }
      else if (extra === 'legbye') { const r = prompt('Kitne leg bye runs?', '1'); if (r !== null) await recordBall(container, match, { runs: parseInt(r)||1, isExtra: true, extrasType: 'legbye', extrasRuns: 0, commentary }, battingPlayers, dismissedIds); }
    });
  });

  container.querySelectorAll('.wicket-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showWicketModal(container, btn.dataset.wicket, match, battingPlayers, bowlingPlayers, dismissedIds, async ({ dismissedId, fielderId }) => {
        const commentary = container.querySelector('#ball-commentary')?.value?.trim() || null;
        await recordBall(container, match, { runs: 0, isWicket: true, wicketType: btn.dataset.wicket, dismissedPlayerId: dismissedId, fielderId, commentary }, battingPlayers, dismissedIds);
      });
    });
  });

  container.querySelector('#btn-undo')?.addEventListener('click', async () => {
    const removed = await undoLastBall(match.id, s.currentInnings);
    if (removed) {
      const allBalls = await getBallLog(match.id);
      recomputeFromBallLog(allBalls, s.currentInnings);
      const ib = allBalls.filter(b => b.innings === s.currentInnings);
      if (ib.length > 0) { const l = ib[ib.length-1]; setState({ strikerId: l.batsman_id, nonStrikerId: l.non_striker_id, bowlerId: l.bowler_id }); }
      else setState({ strikerId: null, nonStrikerId: null, bowlerId: null });
      renderScoringUI(container);
    }
  });

  container.querySelector('#btn-change-bowler')?.addEventListener('click', () => { setState({ bowlerId: null }); renderScoringUI(container); });
  container.querySelector('#btn-swap-strike')?.addEventListener('click', () => { setState({ strikerId: s.nonStrikerId, nonStrikerId: s.strikerId }); renderScoringUI(container); });
  container.querySelectorAll('.change-batsman-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const role = e.target.dataset.role;
      if (role === 'striker') setState({ strikerId: null });
      if (role === 'non-striker') setState({ nonStrikerId: null });
      renderScoringUI(container);
    });
  });

  container.querySelector('#btn-retire-batsman')?.addEventListener('click', () => {
    const choice = prompt('Kaun retire hoga? (S = Striker, N = Non-Striker)');
    if (choice?.toUpperCase() === 'S' && s.strikerId) {
      dismissedIds.add(s.strikerId);
      setState({ strikerId: null, totalWickets: s.totalWickets + 1 });
      renderScoringUI(container);
    } else if (choice?.toUpperCase() === 'N' && s.nonStrikerId) {
      dismissedIds.add(s.nonStrikerId);
      setState({ nonStrikerId: null, totalWickets: s.totalWickets + 1 });
      renderScoringUI(container);
    }
  });
  container.querySelector('#btn-edit-players')?.addEventListener('click', () => { showEditPlayersModal(container, match); });
  
  container.querySelector('#btn-share-spectator')?.addEventListener('click', () => {
    const url = window.location.origin + window.location.pathname + '#live/' + match.id;
    navigator.clipboard.writeText(url).then(() => {
      const btn = container.querySelector('#btn-share-spectator');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '🔗 Share Link'; }, 2000);
    });
  });

  container.querySelectorAll('.set-strike-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid;
      const other = sid === s.strikerId ? s.nonStrikerId : s.strikerId;
      setState({ strikerId: sid, nonStrikerId: other, needsStrikeDecision: false });
      renderScoringUI(container);
    });
  });

  container.querySelector('#btn-end-innings')?.addEventListener('click', async () => { if (confirm('Sach mein innings khatam karna hai?')) await handleEndInnings(container, match); });
  container.querySelector('#btn-start-innings2')?.addEventListener('click', async () => { await handleStartInnings2(container, match); });
  container.querySelector('#btn-finish-match')?.addEventListener('click', async () => { await handleFinishMatch(container, match); });
}

async function showEditPlayersModal(container, match) {
  const modal = container.querySelector('#edit-players-modal');
  if (!modal) return;

  async function refreshAndRender() {
    const freshPlayers = await getPlayers(match.id);
    setState({ players: freshPlayers });
    renderModal(freshPlayers);
  }

  function renderModal(playersList) {
    const team1 = playersList.filter(p => p.team === 1);
    const team2 = playersList.filter(p => p.team === 2);

    const renderTeamRows = (teamPlayers, teamNum) => teamPlayers.map(p => `
      <div class="edit-player-row" data-pid="${p.id}">
        <input type="text" class="form-input edit-player-name" value="${p.name}" data-pid="${p.id}" style="flex:1; padding:6px 10px; font-size:0.85rem;" />
        <select class="form-input edit-player-role" data-pid="${p.id}" style="width:auto; min-width:80px; padding:6px; font-size:0.8rem;">
          <option value="batsman" ${p.role==='batsman'?'selected':''}>🏏 BAT</option>
          <option value="bowler" ${p.role==='bowler'?'selected':''}>🎯 BOWL</option>
          <option value="all-rounder" ${p.role==='all-rounder'?'selected':''}>⭐ AR</option>
          <option value="wk" ${p.role==='wk'?'selected':''}>🧤 WK</option>
        </select>
        <button class="btn btn-ghost btn-sm edit-player-save" data-pid="${p.id}" title="Save" style="padding:4px 8px;">✅</button>
        <button class="btn btn-ghost btn-sm edit-player-delete" data-pid="${p.id}" title="Delete" style="padding:4px 8px; color:var(--accent-red);">✕</button>
      </div>
    `).join('');

    const addPlayerRow = (teamNum) => `
      <div class="edit-add-row" style="display:flex; gap:6px; margin-top:8px;">
        <input type="text" class="form-input add-player-name-${teamNum}" placeholder="Naya player" style="flex:1; padding:6px 10px; font-size:0.85rem;" />
        <select class="form-input add-player-role-${teamNum}" style="width:auto; min-width:80px; padding:6px; font-size:0.8rem;">
          <option value="batsman">🏏 BAT</option>
          <option value="bowler">🎯 BOWL</option>
          <option value="all-rounder">⭐ AR</option>
          <option value="wk">🧤 WK</option>
        </select>
        <button class="btn btn-primary btn-sm add-player-btn" data-team="${teamNum}" style="padding:4px 12px;">+</button>
      </div>
    `;

    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal" style="max-width:500px; max-height:85vh; overflow-y:auto;">
        <h3 style="font-family:var(--font-heading); margin-bottom:16px;">✏️ Edit Players</h3>
        <div class="edit-team-section">
          <div class="perf-team-header" style="margin-top:0;">${match.team1_name} (${team1.length})</div>
          ${renderTeamRows(team1, 1)}
          ${addPlayerRow(1)}
        </div>
        <div class="edit-team-section" style="margin-top:20px;">
          <div class="perf-team-header">${match.team2_name} (${team2.length})</div>
          ${renderTeamRows(team2, 2)}
          ${addPlayerRow(2)}
        </div>
        <button class="btn btn-primary btn-full mt-md" id="edit-players-done">✅ Done</button>
      </div>
    `;

    // Save (rename/role change)
    modal.querySelectorAll('.edit-player-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const nameInput = modal.querySelector(`.edit-player-name[data-pid="${pid}"]`);
        const roleSelect = modal.querySelector(`.edit-player-role[data-pid="${pid}"]`);
        const newName = nameInput.value.trim();
        if (!newName) { alert('Naam toh daalo bhai!'); return; }
        btn.textContent = '⏳';
        try {
          await updatePlayer(pid, { name: newName, role: roleSelect.value });
          btn.textContent = '✅';
          await refreshAndRender();
        } catch (err) {
          alert('Update error: ' + err.message);
          btn.textContent = '✅';
        }
      });
    });

    // Delete
    modal.querySelectorAll('.edit-player-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        if (!confirm('Sach mein delete karna hai?')) return;
        btn.textContent = '⏳';
        try {
          await deletePlayer(pid);
          await refreshAndRender();
        } catch (err) {
          alert(err.message);
          btn.textContent = '✕';
        }
      });
    });

    // Add new player
    modal.querySelectorAll('.add-player-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teamNum = parseInt(btn.dataset.team);
        const nameInput = modal.querySelector(`.add-player-name-${teamNum}`);
        const roleSelect = modal.querySelector(`.add-player-role-${teamNum}`);
        const name = nameInput.value.trim();
        if (!name) { alert('Naam toh daalo!'); return; }
        btn.textContent = '⏳';
        try {
          await addSinglePlayer(match.id, teamNum, { name, role: roleSelect.value });
          await refreshAndRender();
        } catch (err) {
          alert('Add error: ' + err.message);
          btn.textContent = '+';
        }
      });
    });

    // Done
    modal.querySelector('#edit-players-done')?.addEventListener('click', async () => {
      modal.style.display = 'none';
      // Re-fetch and re-render scoring UI
      const freshPlayers = await getPlayers(match.id);
      setState({ players: freshPlayers });
      renderScoringUI(container);
    });
  }

  await refreshAndRender();
}

async function recordBall(container, match, bd, battingPlayers, dismissedIds) {
  const s = getState();
  const inn = s.currentInnings;
  const isLegal = !bd.isExtra || bd.extrasType === 'bye' || bd.extrasType === 'legbye';

  try {
    await logBall({
      matchId: match.id, innings: inn, overNum: s.currentOver, ballNum: isLegal ? s.currentBall + 1 : s.currentBall,
      batsmanId: s.strikerId, nonStrikerId: s.nonStrikerId, bowlerId: s.bowlerId,
      runs: bd.runs||0, isExtra: bd.isExtra||false, extrasType: bd.extrasType||null, extrasRuns: bd.extrasRuns||0,
      isWicket: bd.isWicket||false, wicketType: bd.wicketType||null, dismissedPlayerId: bd.dismissedPlayerId||null,
      fielderId: bd.fielderId||null, commentary: bd.commentary||null,
    });

    let tr = s.totalRuns + (bd.runs||0) + (bd.extras_runs||bd.extrasRuns||0);
    let no = s.currentOver, nb = s.currentBall, tw = s.totalWickets, ex = s.extras + (bd.extras_runs||bd.extrasRuns||0);
    let si = s.strikerId, nsi = s.nonStrikerId, bwl = s.bowlerId;
    let needsStrikeDecision = false;

    // Over rotation logic (6 balls)
    if (isLegal) { 
      nb++; 
      if (nb >= 6) { 
        no++; nb = 0; 
        [si, nsi] = [nsi, si]; // Standard over-end swap
        bwl = null; 
        s.needsStrikeDecision = false; // Reset if any
      } 
    }

    // Single/Boundaries rotation (Odd runs swap)
    if ((bd.runs||0) % 2 === 1 && !bd.isExtra) [si, nsi] = [nsi, si];

    // Wicket logic
    if (bd.isWicket) { 
      tw++; 
      if (bd.dismissedPlayerId) dismissedIds.add(bd.dismissedPlayerId); 
      if (bd.dismissedPlayerId === si) si = null; 
      else if (bd.dismissedPlayerId === nsi) nsi = null;
      
      if (bd.wicketType === 'runout') needsStrikeDecision = true;
    }

    setState({ 
      totalRuns: tr, 
      currentOver: no, 
      currentBall: nb, 
      totalWickets: tw, 
      extras: ex, 
      strikerId: si, 
      nonStrikerId: nsi, 
      bowlerId: bwl,
      needsStrikeDecision
    });

    const allBalls = await getBallLog(match.id);
    setState({ ballLog: allBalls.filter(b => b.innings === inn) });
    renderScoringUI(container);
  } catch (err) {
    console.error('Ball error:', err);
    alert('Ball save error: ' + err.message);
  }
}

async function handleEndInnings(container, match) {
  const s = getState();
  await saveInningsSummary({ matchId: match.id, innings: s.currentInnings, battingTeam: getBattingTeam(match, s.currentInnings), totalRuns: s.totalRuns, totalWickets: s.totalWickets, totalOversBowled: parseFloat(s.currentOver+'.'+s.currentBall), extras: s.extras });
  if (s.currentInnings === 1) await handleStartInnings2(container, match);
  else await handleFinishMatch(container, match);
}

async function handleStartInnings2(container, match) {
  const s = getState();
  await saveInningsSummary({ matchId: match.id, innings: 1, battingTeam: getBattingTeam(match, 1), totalRuns: s.totalRuns, totalWickets: s.totalWickets, totalOversBowled: parseFloat(s.currentOver+'.'+s.currentBall), extras: s.extras });
  const target = s.totalRuns + 1;
  await updateMatch(match.id, { current_innings: 2 });
  setState({ currentInnings: 2, totalRuns: 0, totalWickets: 0, currentOver: 0, currentBall: 0, extras: 0, strikerId: null, nonStrikerId: null, bowlerId: null, target, ballLog: [], match: { ...match, current_innings: 2 } });
  renderScoringUI(container);
}

async function handleFinishMatch(container, match) {
  const s = getState();
  await saveInningsSummary({ matchId: match.id, innings: 2, battingTeam: getBattingTeam(match, 2), totalRuns: s.totalRuns, totalWickets: s.totalWickets, totalOversBowled: parseFloat(s.currentOver+'.'+s.currentBall), extras: s.extras });
  let winner = '', margin = '';
  if (s.target && s.totalRuns >= s.target) {
    const bt = getBattingTeam(match, 2); winner = bt === 1 ? match.team1_name : match.team2_name;
    margin = `by ${(s.players.filter(p => p.team === bt).length - 1) - s.totalWickets} wickets`;
  } else if (s.target) {
    const bwt = getBowlingTeam(match, 2); winner = bwt === 1 ? match.team1_name : match.team2_name;
    margin = `by ${(s.target - 1) - s.totalRuns} runs`;
  }
  await updateMatch(match.id, { status: 'completed', winner, margin });
  navigate(`#summary/${match.id}`);
}

function getRBC(r) { return { batsman:'role-bat', bowler:'role-bowl', 'all-rounder':'role-ar', wk:'role-wk' }[r] || 'role-bat'; }
function getRL(r) { return { batsman:'BAT', bowler:'BOWL', 'all-rounder':'AR', wk:'WK' }[r] || 'BAT'; }
