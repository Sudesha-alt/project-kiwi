// Series Summary View — Man of the Series and aggregate stats
import { getSeries, getSeriesPlayerStats } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderSeriesSummary(container, seriesId) {
  if (!seriesId) { navigate('#home'); return; }

  container.innerHTML = `
    <div class="empty-state" style="padding-top:40px;">
      <div class="spinner"></div><p>Aggregating stats...</p>
    </div>
  `;

  try {
    const series = await getSeries(seriesId);
    const { players, rankings } = await getSeriesPlayerStats(seriesId);

    if (rankings.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="emoji">🤷</div>
          <p>Is series mein abhi tak koi match complete nahi hua.</p>
          <button class="btn btn-primary mt-md" onclick="window.location.hash='#series/${seriesId}'">Back to Series</button>
        </div>
      `;
      return;
    }

    const mos = rankings[0]; // Man of the Series (highest impact)

    // Helper functions for formatting
    const getBatSR = (bat) => bat.balls > 0 ? ((bat.runs / bat.balls) * 100).toFixed(1) : '0.0';
    const getBowlEcon = (bowl) => bowl.balls > 0 ? (bowl.runs / (bowl.balls / 6)).toFixed(1) : '0.0';
    const formatOvers = (balls) => Math.floor(balls / 6) + '.' + (balls % 6);

    // Top performers limits
    const topBatsmen = [...rankings].sort((a, b) => b.bat.runs - a.bat.runs).slice(0, 5);
    const topBowlers = [...rankings].sort((a, b) => {
      if (b.bowl.wickets !== a.bowl.wickets) return b.bowl.wickets - a.bowl.wickets;
      return getBowlEcon(a.bowl) - getBowlEcon(b.bowl); // tie breaker econ
    }).slice(0, 5);

    container.innerHTML = `
      <div class="home-hero" style="padding:var(--space-md);">
        <h1 class="home-hero-title" style="font-size:1.8rem;">${series.name}</h1>
        <div class="text-muted" style="margin-top:4px;">Series Summary & Stats</div>
      </div>

      <!-- Man of the Series Card -->
      <div class="motm-card mb-lg">
        <div class="motm-badge">🏆 MAN OF THE SERIES</div>
        <div class="motm-name">${mos.name}</div>
        <div class="motm-stats">
          <div class="motm-stat-box">
            <div class="motm-stat-val">${mos.bat.runs}</div>
            <div class="motm-stat-lbl">Runs</div>
          </div>
          <div class="motm-stat-box">
            <div class="motm-stat-val">${mos.bowl.wickets}</div>
            <div class="motm-stat-lbl">Wickets</div>
          </div>
          <div class="motm-stat-box">
            <div class="motm-stat-val">${mos.impact}</div>
            <div class="motm-stat-lbl">Impact Score</div>
          </div>
        </div>
      </div>

      <!-- Top Batsmen -->
      <div class="card mb-lg pb-0">
        <h3 class="section-subtitle" style="margin-top:0; padding:16px 16px 0;">🏏 Top Run Scorers</h3>
        <div style="overflow-x:auto;">
          <table class="scorecard-table mt-sm">
            <thead>
              <tr>
                <th>Player</th>
                <th style="text-align:right;">M</th>
                <th style="text-align:right; color:var(--text-primary);">Runs</th>
                <th style="text-align:right;">SR</th>
                <th style="text-align:right;">4s/6s</th>
              </tr>
            </thead>
            <tbody>
              ${topBatsmen.filter(p => p.bat.runs > 0).map(p => `
                <tr>
                  <td class="player-name-cell">${p.name}</td>
                  <td style="text-align:right;">${p.matchesPlayed.size}</td>
                  <td class="runs-cell" style="text-align:right; font-weight:700;">${p.bat.runs}</td>
                  <td style="text-align:right;">${getBatSR(p.bat)}</td>
                  <td style="text-align:right;">${p.bat.fours}/${p.bat.sixes}</td>
                </tr>
              `).join('') || `<tr><td colspan="5" class="text-center text-muted">No runs scored yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Top Bowlers -->
      <div class="card mb-lg pb-0">
        <h3 class="section-subtitle" style="margin-top:0; padding:16px 16px 0;">🎯 Top Wicket Takers</h3>
        <div style="overflow-x:auto;">
          <table class="scorecard-table mt-sm">
            <thead>
              <tr>
                <th>Player</th>
                <th style="text-align:right;">M</th>
                <th style="text-align:right; color:var(--text-primary);">W</th>
                <th style="text-align:right;">Econ</th>
                <th style="text-align:right;">Overs</th>
              </tr>
            </thead>
            <tbody>
              ${topBowlers.filter(p => p.bowl.wickets > 0 || p.bowl.balls > 0).map(p => `
                <tr>
                  <td class="player-name-cell">${p.name}</td>
                  <td style="text-align:right;">${p.matchesPlayed.size}</td>
                  <td class="runs-cell" style="text-align:right; font-weight:700;">${p.bowl.wickets}</td>
                  <td style="text-align:right;">${getBowlEcon(p.bowl)}</td>
                  <td style="text-align:right;">${formatOvers(p.bowl.balls)}</td>
                </tr>
              `).join('') || `<tr><td colspan="5" class="text-center text-muted">No overs bowled yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- MVP Leaderboard (Impact Points) -->
      <div class="card mb-lg pb-0">
        <h3 class="section-subtitle" style="margin-top:0; padding:16px 16px 0;">⭐ Series MVP Leaderboard</h3>
        <div style="overflow-x:auto;">
          <table class="scorecard-table mt-sm">
            <thead>
              <tr>
                <th>Player</th>
                <th style="text-align:right;">M</th>
                <th style="text-align:right;">Impact Points</th>
              </tr>
            </thead>
            <tbody>
              ${rankings.slice(0, 10).map((p, i) => `
                <tr>
                  <td class="player-name-cell">
                    <span style="display:inline-block; width:20px; color:var(--text-secondary);">${i+1}.</span>
                    ${p.name} ${i === 0 ? '👑' : ''}
                  </td>
                  <td style="text-align:right;">${p.matchesPlayed.size}</td>
                  <td class="runs-cell" style="text-align:right; color:var(--accent-yellow);">${p.impact} pts</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="text-center mt-lg mb-lg" style="display:flex; gap:12px; justify-content:center;">
        <button class="btn btn-primary" onclick="window.location.hash='#series/${seriesId}'">Back to Series</button>
        <button class="btn btn-ghost" onclick="window.location.hash='#home'">Ghar Chalo</button>
      </div>
    `;

  } catch (err) {
    container.innerHTML = `<div class="empty-state">Error: ${err.message}<br><button class="btn btn-primary mt-md" onclick="window.location.hash='#series/${seriesId}'">Back to Series</button></div>`;
  }
}
