// Match Setup view — overs, teams, players, toss
import { createMatch, addPlayers, getMatch, getPlayers, getSeries, getSeriesMatches } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderMatchSetup(container) {
  // Parse query params (hash routing issue: #setup?clone=xxx)
  const hashObj = window.location.hash.split('?');
  const params = new URLSearchParams(hashObj[1] || '');
  const cloneId = params.get('clone');
  const seriesId = params.get('series');

  // Local state for setup
  const setup = {
    team1Name: '',
    team2Name: '',
    totalOvers: 20,
    team1Players: [],
    team2Players: [],
    tossWinner: 1,
    tossDecision: 'bat',
    lastManStanding: false,
    activeTab: 1,
    seriesId: seriesId || null,
    seriesName: null
  };

  container.innerHTML = `
    <div class="empty-state" style="padding-top: 40px;">
      <div class="emoji">🏏</div>
      <div class="spinner"></div><p>Setting up...</p>
    </div>
  `;

  // Pre-fill data if clone or series
  try {
    if (seriesId) {
      const s = await getSeries(seriesId);
      setup.seriesName = s.name;
      setup.team1Name = s.team1_name;
      setup.team2Name = s.team2_name;

      // Pre-fill players from last match in this series if exists
      const matches = await getSeriesMatches(seriesId);
      if (matches && matches.length > 0) {
        // Last match is the latest one since ascending: true
        const lastMatch = matches[matches.length - 1]; 
        const p = await getPlayers(lastMatch.id);
        setup.totalOvers = lastMatch.total_overs;
        setup.lastManStanding = lastMatch.last_man_standing;
        setup.team1Players = p.filter(pl => pl.team === 1).map(pl => ({ id: crypto.randomUUID(), name: pl.name, role: pl.role }));
        setup.team2Players = p.filter(pl => pl.team === 2).map(pl => ({ id: crypto.randomUUID(), name: pl.name, role: pl.role }));
      }
    } else if (cloneId) {
      const m = await getMatch(cloneId);
      const p = await getPlayers(cloneId);
      setup.team1Name = m.team1_name;
      setup.team2Name = m.team2_name;
      setup.totalOvers = m.total_overs;
      setup.tossWinner = 1; // RESET TOSS
      setup.tossDecision = 'bat'; // RESET TOSS
      setup.lastManStanding = m.last_man_standing;
      setup.seriesId = m.series_id;
      if (setup.seriesId) {
        const s = await getSeries(setup.seriesId);
        setup.seriesName = s.name;
      }
      setup.team1Players = p.filter(pl => pl.team === 1).map(pl => ({ id: crypto.randomUUID(), name: pl.name, role: pl.role }));
      setup.team2Players = p.filter(pl => pl.team === 2).map(pl => ({ id: crypto.randomUUID(), name: pl.name, role: pl.role }));
    }
  } catch (err) {
    console.warn('Prepoulate error:', err.message);
  }

  function render() {
    const activePlayers = setup.activeTab === 1 ? setup.team1Players : setup.team2Players;
    const teamName = setup.activeTab === 1 ? (setup.team1Name || 'Team 1') : (setup.team2Name || 'Team 2');

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h1 class="section-title" style="margin:0;">👥 Match Setup</h1>
        ${setup.seriesName ? `<div class="live-badge" style="background:rgba(59,130,246,0.1); color:var(--accent-blue);">🏆 ${setup.seriesName}</div>` : ''}
      </div>

      <!-- Overs -->
      <div class="card mb-md">
        <div class="form-group">
          <label class="form-label">Kitne Overs? 🏏</label>
          <div class="overs-presets">
            ${[5, 10, 20, 50].map(o => `
              <button class="overs-preset ${setup.totalOvers === o ? 'active' : ''}" data-overs="${o}">${o}</button>
            `).join('')}
          </div>
          <input type="number" class="form-input" id="overs-input" placeholder="Ya custom daal do..." 
                 value="${![5,10,20,50].includes(setup.totalOvers) ? setup.totalOvers : ''}" min="1" max="100" />
        </div>
      </div>

      <!-- Team Names -->
      <div class="card mb-md">
        <div class="form-group">
          <label class="form-label">Team 1 ka Naam</label>
          <input type="text" class="form-input" id="team1-name" placeholder="e.g. Mumbai Indians" value="${setup.team1Name}" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Team 2 ka Naam</label>
          <input type="text" class="form-input" id="team2-name" placeholder="e.g. Chennai Super Kings" value="${setup.team2Name}" />
        </div>
      </div>

      <!-- Player Entry -->
      <div class="card mb-md">
        <div class="section-subtitle" style="margin-top:0;">Players Daalo</div>
        
        <div class="team-tabs">
          <button class="team-tab ${setup.activeTab === 1 ? 'active' : ''}" data-team="1">
            ${setup.team1Name || 'Team 1'} (${setup.team1Players.length})
          </button>
          <button class="team-tab ${setup.activeTab === 2 ? 'active' : ''}" data-team="2">
            ${setup.team2Name || 'Team 2'} (${setup.team2Players.length})
          </button>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" class="form-input" id="player-name" placeholder="Player ka naam" style="flex:1;" />
          <select class="form-input" id="player-role" style="width:auto; min-width:110px;">
            <option value="batsman">🏏 Batsman</option>
            <option value="bowler">🎯 Bowler</option>
            <option value="all-rounder">⭐ All-Rounder</option>
            <option value="wk">🧤 WK</option>
          </select>
        </div>
        <button class="btn btn-ghost btn-sm btn-full" id="btn-add-player">+ Add Player</button>

        <ul class="player-list mt-md">
          ${activePlayers.length === 0 ? `
            <li class="text-center text-muted" style="padding:16px; font-size:0.85rem;">
              Abhi koi player nahi hai — upar se add karo!
            </li>
          ` : activePlayers.map((p, i) => `
            <li class="player-item">
              <div class="player-info">
                <span>${p.name}</span>
                <span class="role-badge ${getRoleBadgeClass(p.role)}">${getRoleLabel(p.role)}</span>
              </div>
              <button class="delete-btn" data-idx="${i}" data-team="${setup.activeTab}">✕</button>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Toss -->
      <div class="card mb-md">
        <div class="section-subtitle" style="margin-top:0;">Toss 🪙</div>
        <div class="form-group">
          <label class="form-label">Toss kisne jeeta?</label>
          <div class="toss-options">
            <div class="toss-option ${setup.tossWinner === 1 ? 'active' : ''}" data-toss-winner="1">
              ${setup.team1Name || 'Team 1'}
            </div>
            <div class="toss-option ${setup.tossWinner === 2 ? 'active' : ''}" data-toss-winner="2">
              ${setup.team2Name || 'Team 2'}
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Kya choose kiya?</label>
          <div class="toss-options">
            <div class="toss-option ${setup.tossDecision === 'bat' ? 'active' : ''}" data-toss-decision="bat">
              🏏 Batting
            </div>
            <div class="toss-option ${setup.tossDecision === 'bowl' ? 'active' : ''}" data-toss-decision="bowl">
              🎯 Bowling
            </div>
          </div>
        </div>
      </div>

      <!-- Last Man Standing -->
      <div class="card mb-md">
        <div class="form-group" style="margin-bottom:0; display:flex; align-items:center; justify-content:space-between;">
          <div>
            <label class="form-label" style="margin-bottom:2px;">🧍 Last Man Standing</label>
            <div class="text-muted" style="font-size:0.75rem;">Agar ON hai, toh last batsman akela bhi khel sakta hai</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="lms-toggle" ${setup.lastManStanding ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Start -->
      <button class="btn btn-primary btn-lg btn-full" id="btn-start-match">
        🚀 Match Shuru!
      </button>
      <button class="btn btn-ghost btn-sm btn-full mt-sm" id="btn-back-home">← Wapas</button>
    `;

    attachEvents();
  }

  function attachEvents() {
    // Overs presets
    container.querySelectorAll('.overs-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        setup.totalOvers = parseInt(btn.dataset.overs);
        render();
      });
    });

    // Custom overs
    const oversInput = container.querySelector('#overs-input');
    oversInput.addEventListener('change', () => {
      const val = parseInt(oversInput.value);
      if (val > 0 && val <= 100) {
        setup.totalOvers = val;
        render();
      }
    });

    // Team names
    container.querySelector('#team1-name').addEventListener('input', e => {
      setup.team1Name = e.target.value;
    });
    container.querySelector('#team2-name').addEventListener('input', e => {
      setup.team2Name = e.target.value;
    });

    // Team tabs
    container.querySelectorAll('.team-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        // Save current team names before re-render
        setup.team1Name = container.querySelector('#team1-name')?.value || setup.team1Name;
        setup.team2Name = container.querySelector('#team2-name')?.value || setup.team2Name;
        setup.activeTab = parseInt(tab.dataset.team);
        render();
      });
    });

    // Add player
    container.querySelector('#btn-add-player').addEventListener('click', () => {
      const nameInput = container.querySelector('#player-name');
      const roleSelect = container.querySelector('#player-role');
      const name = nameInput.value.trim();
      if (!name) return;

      const player = { name, role: roleSelect.value };
      if (setup.activeTab === 1) {
        setup.team1Players.push(player);
      } else {
        setup.team2Players.push(player);
      }
      // Save team names
      setup.team1Name = container.querySelector('#team1-name')?.value || setup.team1Name;
      setup.team2Name = container.querySelector('#team2-name')?.value || setup.team2Name;
      render();
    });

    // Delete player
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const team = parseInt(btn.dataset.team);
        // Save team names
        setup.team1Name = container.querySelector('#team1-name')?.value || setup.team1Name;
        setup.team2Name = container.querySelector('#team2-name')?.value || setup.team2Name;
        if (team === 1) setup.team1Players.splice(idx, 1);
        else setup.team2Players.splice(idx, 1);
        render();
      });
    });

    // Toss winner
    container.querySelectorAll('[data-toss-winner]').forEach(opt => {
      opt.addEventListener('click', () => {
        setup.team1Name = container.querySelector('#team1-name')?.value || setup.team1Name;
        setup.team2Name = container.querySelector('#team2-name')?.value || setup.team2Name;
        setup.tossWinner = parseInt(opt.dataset.tossWinner);
        render();
      });
    });

    // Toss decision
    container.querySelectorAll('[data-toss-decision]').forEach(opt => {
      opt.addEventListener('click', () => {
        setup.team1Name = container.querySelector('#team1-name')?.value || setup.team1Name;
        setup.team2Name = container.querySelector('#team2-name')?.value || setup.team2Name;
        setup.tossDecision = opt.dataset.tossDecision;
        render();
      });
    });

    // Last Man Standing toggle
    container.querySelector('#lms-toggle')?.addEventListener('change', (e) => {
      setup.lastManStanding = e.target.checked;
    });

    // Start match
    container.querySelector('#btn-start-match').addEventListener('click', async () => {
      // Validate
      setup.team1Name = container.querySelector('#team1-name')?.value || setup.team1Name;
      setup.team2Name = container.querySelector('#team2-name')?.value || setup.team2Name;

      if (!setup.team1Name.trim() || !setup.team2Name.trim()) {
        alert('Bhai dono teams ka naam toh daal do!');
        return;
      }
      if (setup.team1Players.length < 2) {
        alert('Team 1 mein kam se kam 2 players chahiye!');
        return;
      }
      if (setup.team2Players.length < 2) {
        alert('Team 2 mein kam se kam 2 players chahiye!');
        return;
      }

      const btn = container.querySelector('#btn-start-match');
      btn.disabled = true;
      btn.textContent = '⏳ Setting up...';

      try {
        // Create match in Supabase
        const match = await createMatch({
          team1Name: setup.team1Name.trim(),
          team2Name: setup.team2Name.trim(),
          totalOvers: setup.totalOvers,
          tossWinner: setup.tossWinner,
          tossDecision: setup.tossDecision,
          lastManStanding: setup.lastManStanding,
          seriesId: setup.seriesId
        });

        // Add players
        await addPlayers(match.id, 1, setup.team1Players);
        await addPlayers(match.id, 2, setup.team2Players);

        // Navigate to scoring
        navigate(`#scoring/${match.id}`);
      } catch (err) {
        console.error('Match create error:', err);
        alert('Match create mein error aa gaya: ' + err.message);
        btn.disabled = false;
        btn.textContent = '🚀 Match Shuru!';
      }
    });

    // Back home
    container.querySelector('#btn-back-home').addEventListener('click', () => {
      navigate('#home');
    });
  }

  render();
}

function getRoleBadgeClass(role) {
  switch(role) {
    case 'batsman': return 'role-bat';
    case 'bowler': return 'role-bowl';
    case 'all-rounder': return 'role-ar';
    case 'wk': return 'role-wk';
    default: return 'role-bat';
  }
}

function getRoleLabel(role) {
  switch(role) {
    case 'batsman': return 'BAT';
    case 'bowler': return 'BOWL';
    case 'all-rounder': return 'AR';
    case 'wk': return 'WK';
    default: return 'BAT';
  }
}
