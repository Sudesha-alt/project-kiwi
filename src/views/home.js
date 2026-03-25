// Home view — new match + saved matches list + delete
import { getMatches, deleteMatch, isConfigured } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderHome(container) {
  container.innerHTML = `
    <div class="empty-state" style="padding-top: 40px;">
      <div class="emoji">🏏</div>
      <div class="spinner"></div>
    </div>
  `;

  let matches = [];
  try {
    matches = await getMatches();
  } catch (e) {
    console.warn('Could not fetch matches:', e.message);
  }

  const configWarning = !isConfigured ? `
    <div class="card mb-lg" style="border-color: var(--accent-yellow); background: rgba(234,179,8,0.08); padding: 16px;">
      <p style="color: var(--accent-yellow); font-weight: 600; font-size: 0.9rem;">⚠️ Supabase Not Configured</p>
      <p class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">
        <code>src/supabase.js</code> mein apna Supabase URL aur Anon Key daalo.
      </p>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="home-hero">
      <div class="home-hero-icon">🏏</div>
      <h1 class="home-hero-title">Gully Scorecard</h1>
      <p class="home-hero-sub">Ball-by-ball cricket scoring, desi style!</p>
    </div>

    ${configWarning}

    <button class="btn btn-primary btn-lg btn-full mb-lg" id="btn-new-match">
      ⚡ Naya Match Shuru Karo
    </button>

    <div>
      <div class="section-header-row">
        <h2 class="section-subtitle" style="margin:0;">📋 Saved Matches</h2>
        <span class="match-count-badge">${matches.length}</span>
      </div>
      <div id="matches-list" class="mt-md">
        ${matches.length === 0 ? `
          <div class="empty-match-card">
            <div style="font-size:2rem; margin-bottom:8px;">🏟️</div>
            <p class="text-muted">Koi match nahi mila abhi tak</p>
            <p class="text-muted" style="font-size:0.8rem;">Naya match create karo!</p>
          </div>
        ` : matches.map(m => `
          <div class="match-card-v2" data-id="${m.id}">
            <div class="match-card-left">
              <div class="match-card-status ${m.status === 'live' ? 'status-live' : 'status-done'}">
                ${m.status === 'live' ? '🔴 LIVE' : '✅ Done'}
              </div>
              <div class="match-card-teams">
                <span class="match-team-name">${m.team1_name}</span>
                <span class="match-vs">vs</span>
                <span class="match-team-name">${m.team2_name}</span>
              </div>
              <div class="match-card-meta">
                ${new Date(m.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • ${m.total_overs} overs
              </div>
              ${m.status === 'completed' && m.winner ? `
                <div class="match-card-result">🏆 ${m.winner} won ${m.margin || ''}</div>
              ` : ''}
            </div>
            <div class="match-card-actions">
              <button class="match-view-btn" data-view="${m.id}" title="View">→</button>
              <button class="match-delete-btn" data-delete="${m.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // New match
  container.querySelector('#btn-new-match').addEventListener('click', () => navigate('#setup'));

  // View match
  container.querySelectorAll('.match-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.view;
      const match = matches.find(m => m.id === id);
      navigate(match?.status === 'live' ? `#scoring/${id}` : `#summary/${id}`);
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
