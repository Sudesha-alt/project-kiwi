// Summary view — scorecard + Hinglish + PDF download + Player Performances + MOTM
import { getMatch, getPlayers, getBallLog, getInningsSummaries, deleteMatch } from '../supabase.js';
import { getBattingTeam } from '../store.js';
import { generateHinglishSummary } from '../hinglish.js';
import { navigate } from '../router.js';

export async function renderSummary(container, matchId) {
  if (!matchId) { navigate('#home'); return; }
  container.innerHTML = `<div class="empty-state"><div class="spinner"></div><p class="text-muted">Summary load ho raha hai...</p></div>`;

  try {
    const match = await getMatch(matchId);
    const players = await getPlayers(matchId);
    const ballLog = await getBallLog(matchId);
    const inningsSummaries = await getInningsSummaries(matchId);
    renderSummaryUI(container, match, players, ballLog, inningsSummaries);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">😵</div><p>Summary load nahi hua: ${err.message}</p>
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

// ==================== MOTM & Performance ====================

function computeAllPlayerStats(players, ballLog) {
  const stats = {};

  // Initialize all players
  for (const p of players) {
    stats[p.id] = {
      player: p,
      batting: { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, didBat: false },
      bowling: { runs: 0, wickets: 0, balls: 0, didBowl: false },
      fielding: { catches: 0, runouts: 0, stumpings: 0 },
    };
  }

  for (const ball of ballLog) {
    // Batting
    if (stats[ball.batsman_id]) {
      const b = stats[ball.batsman_id].batting;
      b.didBat = true;
      const bRuns = ball.is_extra && ball.extras_type === 'wide' ? 0 : ball.runs;
      if (!ball.is_extra || ball.extras_type !== 'wide') b.balls++;
      if (!ball.is_extra) b.runs += bRuns;
      if (bRuns === 4 && !ball.is_extra) b.fours++;
      if (bRuns === 6 && !ball.is_extra) b.sixes++;
    }
    // Non-striker tracking
    if (ball.non_striker_id && stats[ball.non_striker_id]) {
      stats[ball.non_striker_id].batting.didBat = true;
    }

    // Bowling
    if (stats[ball.bowler_id]) {
      const bw = stats[ball.bowler_id].bowling;
      bw.didBowl = true;
      bw.runs += ball.runs + (ball.extras_runs || 0);
      if (ball.is_wicket) bw.wickets++;
      const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
      if (isLegal) bw.balls++;
    }

    // Wicket/dismissal
    if (ball.is_wicket && ball.dismissed_player_id && stats[ball.dismissed_player_id]) {
      stats[ball.dismissed_player_id].batting.isOut = true;
    }

    // Fielding
    if (ball.is_wicket && ball.fielder_id && stats[ball.fielder_id]) {
      if (ball.wicket_type === 'caught') stats[ball.fielder_id].fielding.catches++;
      else if (ball.wicket_type === 'runout') stats[ball.fielder_id].fielding.runouts++;
      else if (ball.wicket_type === 'stumped') stats[ball.fielder_id].fielding.stumpings++;
    }
  }

  return stats;
}

function calculateImpactScore(stat) {
  const bat = stat.batting;
  const bowl = stat.bowling;
  const field = stat.fielding;

  let score = 0;

  // Batting impact
  score += bat.runs * 1;            // 1 point per run
  score += bat.fours * 1;           // bonus per four
  score += bat.sixes * 2;           // bonus per six
  if (bat.balls > 0 && bat.runs >= 30) {
    const sr = (bat.runs / bat.balls) * 100;
    if (sr > 150) score += 10;       // fast scoring bonus
    else if (sr > 120) score += 5;
  }
  if (bat.runs >= 50) score += 15;   // fifty bonus
  if (bat.runs >= 100) score += 30;  // century bonus

  // Bowling impact
  score += bowl.wickets * 20;        // 20 per wicket
  if (bowl.balls >= 12) {            // at least 2 overs bowled
    const econ = bowl.runs / (bowl.balls / 6);
    if (econ < 5) score += 10;       // economical bonus
    else if (econ < 7) score += 5;
  }
  if (bowl.wickets >= 3) score += 10;  // 3+ wickets bonus
  if (bowl.wickets >= 5) score += 20;  // fifer bonus

  // Fielding impact
  score += field.catches * 5;
  score += field.runouts * 5;
  score += field.stumpings * 5;

  return score;
}

function getPlayerPerformanceLine(stat) {
  const bat = stat.batting;
  const bowl = stat.bowling;
  const field = stat.fielding;
  const parts = [];

  if (bat.didBat) {
    const sr = bat.balls > 0 ? ((bat.runs / bat.balls) * 100).toFixed(0) : '0';
    let batStr = `${bat.runs}${bat.isOut ? '' : '*'}(${bat.balls})`;
    const extras = [];
    if (bat.fours > 0) extras.push(`${bat.fours}×4`);
    if (bat.sixes > 0) extras.push(`${bat.sixes}×6`);
    if (extras.length) batStr += ` [${extras.join(', ')}]`;
    if (bat.runs >= 50) batStr += ' 🔥';
    else if (bat.runs === 0 && bat.isOut) batStr = '🦆 Duck';
    parts.push(batStr);
  }

  if (bowl.didBowl) {
    const overs = Math.floor(bowl.balls / 6) + '.' + (bowl.balls % 6);
    const econ = bowl.balls > 0 ? (bowl.runs / (bowl.balls / 6)).toFixed(1) : '0.0';
    parts.push(`${bowl.wickets}/${bowl.runs} (${overs} ov, econ ${econ})`);
  }

  const fieldParts = [];
  if (field.catches > 0) fieldParts.push(`${field.catches} catch${field.catches > 1 ? 'es' : ''}`);
  if (field.runouts > 0) fieldParts.push(`${field.runouts} run out${field.runouts > 1 ? 's' : ''}`);
  if (field.stumpings > 0) fieldParts.push(`${field.stumpings} stumping${field.stumpings > 1 ? 's' : ''}`);
  if (fieldParts.length) parts.push(fieldParts.join(', '));

  if (parts.length === 0) return 'Did not bat or bowl';
  return parts.join(' • ');
}

function selectMOTM(allStats) {
  let best = null;
  let bestScore = -1;
  for (const [id, stat] of Object.entries(allStats)) {
    const score = calculateImpactScore(stat);
    if (score > bestScore) {
      bestScore = score;
      best = { ...stat, impactScore: score };
    }
  }
  return best;
}

// ==================== Rendering ====================

function renderSummaryUI(container, match, players, ballLog, inningsSummaries) {
  let scorecardHTML = '';

  for (let inn = 1; inn <= 2; inn++) {
    const inningsBalls = ballLog.filter(b => b.innings === inn);
    if (inningsBalls.length === 0) continue;

    const battingTeamNum = getBattingTeam(match, inn);
    const battingTeamName = battingTeamNum === 1 ? match.team1_name : match.team2_name;
    const bowlingTeamName = battingTeamNum === 1 ? match.team2_name : match.team1_name;

    const batsmanStats = {};
    const dismissals = {};

    for (const ball of inningsBalls) {
      if (!batsmanStats[ball.batsman_id]) batsmanStats[ball.batsman_id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
      const bRuns = ball.is_extra && ball.extras_type === 'wide' ? 0 : ball.runs;
      if (!ball.is_extra || ball.extras_type !== 'wide') batsmanStats[ball.batsman_id].balls++;
      if (!ball.is_extra) batsmanStats[ball.batsman_id].runs += bRuns;
      if (bRuns === 4 && !ball.is_extra) batsmanStats[ball.batsman_id].fours++;
      if (bRuns === 6 && !ball.is_extra) batsmanStats[ball.batsman_id].sixes++;
      if (ball.is_wicket && ball.dismissed_player_id) {
        dismissals[ball.dismissed_player_id] = getDismissalString(ball, players);
      }
      if (ball.non_striker_id && !batsmanStats[ball.non_striker_id]) {
        batsmanStats[ball.non_striker_id] = { runs: 0, balls: 0, fours: 0, sixes: 0 };
      }
    }

    const bowlerStats = {};
    for (const ball of inningsBalls) {
      if (!bowlerStats[ball.bowler_id]) bowlerStats[ball.bowler_id] = { runs: 0, wickets: 0, balls: 0 };
      bowlerStats[ball.bowler_id].runs += ball.runs + (ball.extras_runs || 0);
      if (ball.is_wicket) bowlerStats[ball.bowler_id].wickets++;
      const isLegal = !ball.is_extra || ball.extras_type === 'bye' || ball.extras_type === 'legbye';
      if (isLegal) bowlerStats[ball.bowler_id].balls++;
    }

    const innSummary = inningsSummaries.find(s => s.innings === inn);
    const totalRuns = innSummary ? innSummary.total_runs : Object.values(batsmanStats).reduce((s, b) => s + b.runs, 0);
    const totalWickets = innSummary ? innSummary.total_wickets : Object.keys(dismissals).length;
    const totalOvers = innSummary ? innSummary.total_overs_bowled : '?';
    const totalExtras = innSummary ? innSummary.extras : 0;

    scorecardHTML += `
      <div class="mb-lg">
        <div class="innings-header-card">
          <div class="innings-header-team">${battingTeamName}</div>
          <div class="innings-header-score">${totalRuns}/${totalWickets} <span class="innings-header-overs">(${totalOvers} ov)</span></div>
        </div>
        <div class="card-flat mb-sm" style="overflow-x:auto;">
          <table class="scorecard-table">
            <thead><tr><th>Batsman</th><th style="text-align:right;">R</th><th style="text-align:right;">B</th><th style="text-align:right;">4s</th><th style="text-align:right;">6s</th><th style="text-align:right;">SR</th></tr></thead>
            <tbody>
              ${Object.entries(batsmanStats).map(([id, s]) => {
                const player = players.find(p => p.id === id);
                const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
                const d = dismissals[id] || 'not out';
                const isNotOut = !dismissals[id];
                return `<tr>
                  <td class="player-name-cell">
                    ${player?.name || '?'} ${isNotOut ? '<span style="color:var(--accent-green);">*</span>' : ''}
                    <div class="dismissal">${d}</div>
                  </td>
                  <td class="runs-cell" style="text-align:right;">${s.runs}</td>
                  <td style="text-align:right;">${s.balls}</td>
                  <td style="text-align:right;">${s.fours}</td>
                  <td style="text-align:right;">${s.sixes}</td>
                  <td style="text-align:right;">${sr}</td>
                </tr>`;
              }).join('')}
              <tr class="total-row">
                <td>Extras <span class="text-muted">(${totalExtras})</span></td>
                <td class="runs-cell" style="text-align:right;" colspan="5">${totalExtras}</td>
              </tr>
              <tr class="total-row" style="font-size:1rem;">
                <td><strong>TOTAL</strong></td>
                <td class="runs-cell" style="text-align:right;"><strong>${totalRuns}/${totalWickets}</strong></td>
                <td colspan="4" style="text-align:right;">(${totalOvers} overs)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card-flat mb-md" style="overflow-x:auto;">
          <table class="scorecard-table">
            <thead><tr><th>${bowlingTeamName} Bowling</th><th style="text-align:right;">O</th><th style="text-align:right;">R</th><th style="text-align:right;">W</th><th style="text-align:right;">Econ</th></tr></thead>
            <tbody>
              ${Object.entries(bowlerStats).map(([id, s]) => {
                const player = players.find(p => p.id === id);
                const overs = Math.floor(s.balls / 6) + '.' + (s.balls % 6);
                const econ = s.balls > 0 ? (s.runs / (s.balls / 6)).toFixed(1) : '0.0';
                return `<tr>
                  <td class="player-name-cell">${player?.name || '?'}</td>
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
    `;
  }

  // Compute all player stats & MOTM
  const allStats = computeAllPlayerStats(players, ballLog);
  const motm = selectMOTM(allStats);

  const hinglish = generateHinglishSummary(match, players, ballLog, inningsSummaries);

  // Build player performance cards
  const team1Players = players.filter(p => p.team === 1);
  const team2Players = players.filter(p => p.team === 2);

  const renderPlayerPerfs = (teamPlayers, teamName) => {
    return teamPlayers.map(p => {
      const stat = allStats[p.id];
      if (!stat) return '';
      const line = getPlayerPerformanceLine(stat);
      const impact = calculateImpactScore(stat);
      const isMotm = motm && motm.player.id === p.id;
      return `
        <div class="perf-player-card ${isMotm ? 'perf-motm' : ''}">
          <div class="perf-player-name">
            ${p.name}
            ${isMotm ? '<span class="motm-badge">🏅 MOTM</span>' : ''}
          </div>
          <div class="perf-player-line">${line}</div>
          <div class="perf-impact-bar">
            <div class="perf-impact-fill" style="width: ${Math.min(100, impact)}%"></div>
          </div>
        </div>`;
    }).join('');
  };

  container.innerHTML = `
    <div id="scorecard-pdf-content">
      ${match.winner ? `
        <div class="result-hero-card mb-lg">
          <div class="result-trophy">🏆</div>
          <h2 class="result-winner">${match.winner} WINS!</h2>
          <p class="result-margin">${match.margin || ''}</p>
          <p class="result-meta">${match.team1_name} vs ${match.team2_name} • ${match.total_overs} overs</p>
        </div>
      ` : `
        <div class="result-hero-card mb-lg">
          <h2 class="result-winner">${match.team1_name} vs ${match.team2_name}</h2>
          <p class="result-meta">${match.total_overs} overs • ${match.status === 'live' ? '🔴 Live' : 'Completed'}</p>
        </div>
      `}

      ${motm ? `
        <div class="motm-hero-card mb-lg">
          <div class="motm-hero-icon">🏅</div>
          <div class="motm-hero-label">Man of the Match</div>
          <div class="motm-hero-name">${motm.player.name}</div>
          <div class="motm-hero-stats">${getPlayerPerformanceLine(motm)}</div>
          <div class="motm-hero-score">Impact Score: ${motm.impactScore}</div>
        </div>
      ` : ''}

      ${scorecardHTML}

      <!-- Player Performances -->
      <div class="mb-lg">
        <h3 class="section-subtitle" style="margin-top:0;">📊 Player Performances</h3>
        <div class="perf-team-header">${match.team1_name}</div>
        <div class="perf-list">${renderPlayerPerfs(team1Players, match.team1_name)}</div>
        <div class="perf-team-header" style="margin-top:16px;">${match.team2_name}</div>
        <div class="perf-list">${renderPlayerPerfs(team2Players, match.team2_name)}</div>
      </div>
    </div>

    <!-- Hinglish Summary -->
    <div class="hinglish-card mb-lg">
      <h3>🎤 Desi Commentary</h3>
      <div class="hinglish-text" id="hinglish-content">
        ${hinglish.split('\n').map(line => {
          if (line.startsWith('---')) return '<hr style="border-color:rgba(255,255,255,0.1); margin: 12px 0;">';
          if (!line.trim()) return '';
          return `<p>${line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')}</p>`;
        }).join('')}
      </div>
      <button class="btn btn-ghost btn-sm mt-md" id="btn-copy-summary">📋 Copy Summary</button>
    </div>

    <!-- Actions -->
    <div class="summary-actions mb-lg">
      <button class="btn btn-primary btn-full" id="btn-download-pdf">📄 Download Scorecard PDF</button>
      <button class="btn btn-ghost btn-full mt-sm" id="btn-new-match">⚡ Naya Match</button>
      <button class="btn btn-ghost btn-full mt-sm" id="btn-go-home">🏠 Home</button>
      <button class="btn btn-danger btn-full mt-sm" id="btn-delete-match">🗑️ Delete Match</button>
    </div>
  `;

  // Copy
  container.querySelector('#btn-copy-summary')?.addEventListener('click', () => {
    const text = hinglish.replace(/\*\*/g, '').replace(/\*/g, '');
    navigator.clipboard.writeText(text).then(() => {
      const btn = container.querySelector('#btn-copy-summary');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Summary'; }, 2000);
    });
  });

  // PDF Download
  container.querySelector('#btn-download-pdf')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-download-pdf');
    btn.textContent = '⏳ Generating PDF...';
    btn.disabled = true;

    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const el = container.querySelector('#scorecard-pdf-content');
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `${match.team1_name}_vs_${match.team2_name}_scorecard.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: '#0a0e17', useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await html2pdf().set(opt).from(el).save();
    } catch (err) {
      console.error('PDF error:', err);
      alert('PDF generate nahi hua: ' + err.message);
    }

    btn.textContent = '📄 Download Scorecard PDF';
    btn.disabled = false;
  });

  // Delete
  container.querySelector('#btn-delete-match')?.addEventListener('click', async () => {
    if (!confirm(`Sach mein match delete karna hai? Ye wapas nahi aayega!`)) return;
    try {
      await deleteMatch(match.id);
      navigate('#home');
    } catch (err) {
      alert('Delete error: ' + err.message);
    }
  });

  container.querySelector('#btn-new-match')?.addEventListener('click', () => navigate('#setup'));
  container.querySelector('#btn-go-home')?.addEventListener('click', () => navigate('#home'));
}
