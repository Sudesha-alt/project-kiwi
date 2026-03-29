// Simple hash-based SPA router

const routes = {};
let currentView = null;

export function registerRoute(hash, renderFn) {
  routes[hash] = renderFn;
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

async function handleRoute() {
  const fullHash = window.location.hash || '#home';
  // Strip query params for routing: #setup?clone=xxx -> #setup
  const [hash] = fullHash.split('?');
  
  const [path, ...paramParts] = hash.split('/');
  const param = paramParts.join('/');

  const container = document.getElementById('app-view');
  if (!container) return;

  const renderFn = routes[path];
  if (renderFn) {
    container.innerHTML = '';
    try {
      await renderFn(container, param);
    } catch (err) {
      console.error('Route render error:', err);
      container.innerHTML = `
        <div class="empty-state">
          <div class="emoji">😵</div>
          <p>Kuch toh gadbad ho gayi bhai... <br><small>${err.message}</small></p>
          <button class="btn btn-primary" onclick="location.hash='#home'">Ghar Chalo</button>
        </div>
      `;
    }
  } else {
    navigate('#home');
  }
}
