// Series Setup view — series name, team names, total matches
import { createSeries } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderSeriesSetup(container) {
  const setup = {
    seriesName: '',
    team1Name: '',
    team2Name: '',
    totalMatches: 3
  };

  container.innerHTML = `
    <h1 class="section-title">🏆 Nayi Series Banao</h1>

    <!-- Series Name -->
    <div class="card mb-md">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Series ka Naam</label>
        <input type="text" class="form-input" id="series-name" placeholder="e.g. Gully Premier League" value="${setup.seriesName}" />
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

    <!-- Total Matches -->
    <div class="card mb-md">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Total Matches (Kitne matches ki series?) 🏏</label>
        <div class="overs-presets">
          ${[3, 5, 7].map(m => `
            <button class="overs-preset series-match-preset ${setup.totalMatches === m ? 'active' : ''}" data-matches="${m}">${m}</button>
          `).join('')}
        </div>
        <input type="number" class="form-input mt-sm" id="matches-input" placeholder="Ya custom daal do..." 
               value="${![3,5,7].includes(setup.totalMatches) ? setup.totalMatches : ''}" min="1" max="20" />
      </div>
    </div>

    <button class="btn btn-primary btn-lg btn-full" id="btn-create-series">🚀 Create Series</button>
    <button class="btn btn-ghost btn-sm btn-full mt-md" id="btn-back-home">Cancel</button>
  `;

  // Matches Presets
  container.querySelectorAll('.series-match-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.series-match-preset').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      setup.totalMatches = parseInt(e.target.dataset.matches);
      container.querySelector('#matches-input').value = '';
    });
  });

  // Matches Input
  container.querySelector('#matches-input')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (val > 0) {
      setup.totalMatches = val;
      container.querySelectorAll('.series-match-preset').forEach(b => b.classList.remove('active'));
    }
  });

  // Create Series
  container.querySelector('#btn-create-series').addEventListener('click', async () => {
    setup.seriesName = container.querySelector('#series-name').value.trim();
    setup.team1Name = container.querySelector('#team1-name').value.trim();
    setup.team2Name = container.querySelector('#team2-name').value.trim();

    if (!setup.seriesName) { alert('Series ka naam daalo bhai!'); return; }
    if (!setup.team1Name || !setup.team2Name) { alert('Dono teams ka naam daalo!'); return; }
    if (setup.totalMatches < 1) { alert('Kam se kam 1 match toh rakho!'); return; }

    const btn = container.querySelector('#btn-create-series');
    btn.disabled = true;
    btn.textContent = '⏳ Creating...';

    try {
      const s = await createSeries(setup.seriesName, setup.team1Name, setup.team2Name, setup.totalMatches);
      navigate(`#setup?series=${s.id}`);
    } catch (err) {
      console.error('Series create error:', err);
      alert('Error aa gaya: ' + err.message);
      btn.disabled = false;
      btn.textContent = '🚀 Create Series';
    }
  });

  // Back home
  container.querySelector('#btn-back-home').addEventListener('click', () => {
    navigate('#home');
  });
}
