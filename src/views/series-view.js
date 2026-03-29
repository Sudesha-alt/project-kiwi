// Series View — shows series details and all matches in the series
import { getSeries, getSeriesMatches } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderSeriesView(container, seriesId) {
  if (!seriesId) { navigate('#home'); return; }

  container.innerHTML = `
    <div class="empty-state" style="padding-top:40px;">
      <div class="spinner"></div><p>Series history load ho rahi hai...</p>
    </div>
  `;

  try {
    const series = await getSeries(seriesId);
    const matches = await getSeriesMatches(seriesId);

    // Calculate series score
    let t1Wins = 0;
    let t2Wins = 0;
    let t1Name = series.team1_name;
    let t2Name = series.team2_name;

    matches.forEach(m => {
      if (m.status === 'completed' && m.winner) {
        if (m.winner === t1Name) t1Wins++;
        else if (m.winner === t2Name) t2Wins++;
      }
    });

    container.innerHTML = `
      <div class="home-hero" style="padding:var(--space-lg) var(--space-md); margin-bottom:var(--space-md);">
        <div class="live-badge" style="background:rgba(255,255,255,0.2); color:#fff; display:inline-block; margin-bottom:8px;">🏆 TROPHY</div>
        <h1 class="home-hero-title" style="font-size:2rem;">${series.name}</h1>
        <div style="font-size:1.2rem; font-weight:700; margin-top:12px; color:var(--accent-yellow);">
          ${t1Name} <span style="color:#fff; padding:0 8px;">${t1Wins} - ${t2Wins}</span> ${t2Name}
        </div>
        <div class="text-muted" style="font-size:0.85rem; margin-top:4px;">Best of ${series.total_matches}</div>
      </div>

      <button class="btn btn-primary btn-lg btn-full mb-md" id="btn-add-series-match">
        ⚡ Naya Match Khelo (Match ${matches.length + 1})
      </button>

      ${matches.some(m => m.status === 'completed') ? `
        <button class="btn btn-ghost btn-lg btn-full mb-md" id="btn-series-summary" style="border:1px solid var(--accent-yellow); color:var(--accent-yellow);">
          ⭐ View Series Summary & Stats
        </button>
      ` : ''}

      <!-- Matches List -->
      <div class="section-header-row">
        <h2 class="section-subtitle" style="margin:0;">Series Matches</h2>
        <span class="match-count-badge">${matches.length} / ${series.total_matches}</span>
      </div>
      
      <div class="mt-sm" style="display:flex; flex-direction:column; gap:12px;">
        ${matches.length === 0 ? `
          <div class="empty-match-card">Koi match nahi khela abhi tak</div>
        ` : matches.map((m, i) => `
          <div class="match-card-v2" style="padding:16px;" data-id="${m.id}">
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">Match ${i + 1}</div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-family:var(--font-heading); font-size:1.1rem;">
                ${m.team1_name} vs ${m.team2_name}
              </div>
              <div class="live-badge" style="${m.status==='completed'?'background:rgba(255,255,255,0.1); color:var(--text-secondary);':''}">${m.status==='live'?'🔴 LIVE':'✅ DONE'}</div>
            </div>
            ${m.status === 'completed' && m.winner ? `
              <div style="margin-top:8px; font-weight:700; color:var(--accent-green); font-size:0.9rem;">
                🏆 ${m.winner} won ${m.margin || ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>

      <div class="text-center mt-lg mb-lg">
        <button class="btn btn-ghost" onclick="window.location.hash='#home'">Back to Home</button>
      </div>
    `;

    container.querySelector('#btn-add-series-match')?.addEventListener('click', () => {
      navigate(`#setup?series=${series.id}`);
    });

    container.querySelector('#btn-series-summary')?.addEventListener('click', () => {
      navigate(`#series-summary/${series.id}`);
    });

    container.querySelectorAll('.match-card-v2').forEach(card => {
      card.addEventListener('click', () => {
        const match = matches.find(m => m.id === card.dataset.id);
        if (match) navigate(match.status === 'live' ? `#scoring/${match.id}` : `#summary/${match.id}`);
      });
    });

  } catch (err) {
    container.innerHTML = `<div class="empty-state">Error: ${err.message}<br><button class="btn btn-primary mt-md" onclick="window.location.hash='#home'">Go Home</button></div>`;
  }
}
