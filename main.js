// Gully Scorecard — Main Entry Point
import './style.css';
import { registerRoute, initRouter } from './src/router.js';
import { renderHome } from './src/views/home.js';
import { renderMatchSetup } from './src/views/match-setup.js';
import { renderScoring } from './src/views/scoring.js';
import { renderSummary } from './src/views/summary.js';

// Register routes
registerRoute('#home', renderHome);
registerRoute('#setup', renderMatchSetup);
registerRoute('#scoring', renderScoring);
registerRoute('#summary', renderSummary);

// Logo click → home
document.getElementById('logo-home')?.addEventListener('click', () => {
  window.location.hash = '#home';
});

// Start router
initRouter();
