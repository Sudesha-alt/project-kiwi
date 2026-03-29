// Gully Scorecard — Main Entry Point
import './style.css';
import { registerRoute, initRouter } from './src/router.js';
import { renderHome } from './src/views/home.js';
import { renderMatchSetup } from './src/views/match-setup.js';
import { renderScoring } from './src/views/scoring.js';
import { renderSummary } from './src/views/summary.js';
import { renderLiveView } from './src/views/live-view.js';
import { renderSeriesView } from './src/views/series-view.js';
import { renderSeriesSummary } from './src/views/series-summary.js';
import { renderSeriesSetup } from './src/views/series-setup.js';

// Register routes
registerRoute('#home', renderHome);
registerRoute('#setup', renderMatchSetup);
registerRoute('#scoring', renderScoring);
registerRoute('#summary', renderSummary);
registerRoute('#live', renderLiveView);
registerRoute('#series', renderSeriesView);
registerRoute('#series-summary', renderSeriesSummary);
registerRoute('#series-setup', renderSeriesSetup);

// Logo click → home
document.getElementById('logo-home')?.addEventListener('click', () => {
  window.location.hash = '#home';
});

// Start router
initRouter();
