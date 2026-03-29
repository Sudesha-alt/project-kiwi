// Home view — new match + saved matches list + delete
import { getMatches, deleteMatch, isConfigured, getSeriesList, createSeries } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderHome(container) {
  container.innerHTML = `
    <div class="empty-state" style="padding-top: 40px;">
      <div class="emoji">🏏</div>
      <div class="spinner"></div>
    </div>
  `;

  let matches = [];
  let seriesList = [];
  try {
    matches = await getMatches();
    seriesList = await getSeriesList();
  } catch (e) {
    console.warn('Could not fetch data:', e.message);
  }

  const singleMatches = matches.filter(m => !m.series_id);

  const configWarning = !isConfigured ? `
    <div class="card mb-lg" style="border-color: var(--accent-yellow); background: rgba(234,179,8,0.08); padding: 16px;">
      <p style="color: var(--accent-yellow); font-weight: 600; font-size: 0.9rem;">⚠️ Supabase Not Configured</p>
      <p class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
        <code>src/supabase.js</code> mein apna Supabase URL aur Anon Key daalo.
      </p>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="home-hero" style="text-align: center; padding: 40px 20px; position: relative;">
      <div style="font-size: 3rem; margin-bottom: 10px; text-shadow: var(--shadow-glow-gold);">🏆</div>
      <h1 class="home-hero-title" style="font-family: var(--font-heading); font-size: 2.5rem; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; line-height: 1.1;">
        Gully <span style="color: var(--accent-gold);">Premier</span>
      </h1>
      <p class="home-hero-sub" style="color: var(--text-secondary); font-size: 1rem; max-width: 300px; margin: 0 auto;">Premium ball-by-ball match simulator.</p>
    </div>

    ${configWarning}

    <button class="btn btn-primary btn-lg btn-full mb-lg" id="btn-new-match">
      ⚡ Naya Match Shuru Karo
    </button>
    <button class="btn btn-ghost btn-lg btn-full mb-lg" id="btn-new-series">
      🏆 Nayi Series Banao
    </button>

    <!-- Series List -->
    ${seriesList.length > 0 ? `
    <div class="mb-lg">
      <div class="section-header-row">
        <h2 class="section-subtitle" style="margin:0;">🏆 Top Series</h2>
        <span class="match-count-badge">${seriesList.length}</span>
      </div>
      <div class="mt-md" style="display:flex; flex-direction:col; gap:8px;">
        ${seriesList.map(s => `
          <div class="series-card card" data-id="${s.id}" style="padding:16px; cursor:pointer;">
            <div style="font-family:var(--font-heading); font-size: 1.3rem; font-weight:700; color:var(--accent-gold); margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; text-align:center; display:flex; gap:8px; align-items:center; justify-content:center;">
              <span style="font-size:1.5rem;">🏆</span> ${s.name}
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <span style="font-size:1.1rem; flex:1; text-align:right; font-weight:600;">${s.team1_name}</span>
              <span style="background:rgba(250,204,21,0.1); border:1px solid var(--accent-gold); color:var(--accent-gold); padding:2px 6px; border-radius:var(--radius-sm); font-size:0.75rem; font-weight:700; margin:0 12px; letter-spacing:1px;">VS</span>
              <span style="font-size:1.1rem; flex:1; text-align:left; font-weight:600;">${s.team2_name}</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-muted); text-align:center; border-top:1px solid var(--border-glass); padding-top:8px; margin-top:8px;">
              ${s.total_matches} Match Series
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Matches List -->
    <div>
      <div class="section-header-row">
        <h2 class="section-subtitle" style="margin:0;">📋 Single Matches</h2>
        <span class="match-count-badge">${singleMatches.length}</span>
      </div>
      <div id="matches-list" class="mt-md">
        ${singleMatches.length === 0 ? `
          <div class="empty-match-card">
            <div style="font-size:2rem; margin-bottom:8px;">🏟️</div>
            <p class="text-muted">Koi single match nahi mila abhi tak</p>
            <p class="text-muted" style="font-size:0.8rem;">Naya match create karo!</p>
          </div>
        ` : singleMatches.map(m => `
          <div class="match-card-v2" data-id="${m.id}">
            <div class="match-card-left">
              <div class="match-card-status ${m.status === 'live' ? 'status-live' : 'status-done'}">
                ${m.status === 'live' ? '🔴 LIVE' : '✅ Done'}
              </div>
              <div class="match-card-teams" style="display: flex; align-items: center; justify-content: space-between; margin: 12px 0;">
                <span class="match-team-name" style="font-size: 1.2rem; flex: 1; text-align: right;">${m.team1_name}</span>
                <span class="match-vs" style="background: rgba(250, 204, 21, 0.1); border: 1px solid var(--accent-gold); color: var(--accent-gold); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 0.75rem; font-weight: 700; margin: 0 12px; letter-spacing: 1px;">VS</span>
                <span class="match-team-name" style="font-size: 1.2rem; flex: 1; text-align: left;">${m.team2_name}</span>
              </div>
              <div class="match-card-meta">
                ${new Date(m.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • ${m.total_overs} overs
              </div>
              ${m.status === 'completed' && m.winner ? `
                <div class="match-card-result">🏆 ${m.winner} won ${m.margin || ''}</div>
              ` : ''}
            </div>
            <div class="match-card-actions">
              ${m.status === 'live' ? `
                <button class="match-umpire-btn" data-id="${m.id}" title="Umpire (Edit)" style="font-size:1.1rem; filter:grayscale(100%);">⚡</button>
                <button class="match-spectator-btn" data-id="${m.id}" title="Spectator (View)" style="font-size:1.1rem; filter:grayscale(100%);">📺</button>
              ` : `
                <button class="match-clone-btn" data-clone="${m.id}" title="Rematch (Clone with same players)" style="font-size:1.1rem; filter:grayscale(100%);">🔄</button>
                <button class="match-view-btn" data-view="${m.id}" title="View Result">→</button>
              `}
              <button class="match-delete-btn" data-delete="${m.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // New match
  container.querySelector('#btn-new-match')?.addEventListener('click', () => navigate('#setup'));

  // New series
  container.querySelector('#btn-new-series')?.addEventListener('click', () => {
    navigate('#series-setup');
  });

  // Series click
  container.querySelectorAll('.series-card').forEach(card => {
    card.addEventListener('click', () => {
      navigate(`#series/${card.dataset.id}`);
    });
  });

  // Live Umpire
  container.querySelectorAll('.match-umpire-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#scoring/${btn.dataset.id}`);
    });
  });

  // Live Spectator
  container.querySelectorAll('.match-spectator-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#live/${btn.dataset.id}`);
    });
  });

  // Clone match
  container.querySelectorAll('.match-clone-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      navigate(`#setup?clone=${btn.dataset.clone}`);
    });
  });

  // View match (Completed)
  container.querySelectorAll('.match-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`#summary/${btn.dataset.view}`);
    });
  });

  // Click on match card
  container.querySelectorAll('.match-card-v2').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const match = matches.find(m => m.id === id);
      navigate(match?.status === 'live' ? `#scoring/${id}` : `#summary/${id}`);
    });
  });

  // Delete match
  container.querySelectorAll('.match-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      const match = matches.find(m => m.id === id);
      if (!confirm(`Sach mein "${match?.team1_name} vs ${match?.team2_name}" match delete karna hai? Ye wapas nahi aayega!`)) return;
      try {
        await deleteMatch(id);
        renderHome(container); // re-render
      } catch (err) {
        alert('Delete mein error: ' + err.message);
      }
    });
  });
}
