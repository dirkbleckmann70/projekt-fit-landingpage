/* ============================================================
   Pulsly Navigation & Footer — pulsly.de
   Self-contained: injects own <style> blocks
   Usage:
     renderPulslyNav('home');   // 'home'|'app'|'training'|'trainer'|'blog'
     renderPulslyFooter();
   ============================================================ */

function renderPulslyNav(activePage) {
  var root = document.getElementById('pulsly-nav');
  if (!root) return;

  // -- Styles --
  var style = document.createElement('style');
  style.textContent = `
    /* Nav body offset */
    body { padding-top: 70px; }

    /* --- Navbar --- */
    .pn-nav {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 70px;
      z-index: 1000;
      background: transparent;
      border-bottom: 1px solid transparent;
      transition: background 0.35s ease, border-color 0.35s ease;
    }
    .pn-nav.pn-scrolled {
      background: #0D0D15;
      border-bottom-color: rgba(255,255,255,0.06);
    }
    .pn-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 20px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Logo */
    .pn-logo {
      display: flex;
      align-items: center;
      text-decoration: none;
      flex-shrink: 0;
    }
    .pn-logo img {
      height: 28px;
      width: auto;
    }

    /* Desktop links */
    .pn-links {
      display: flex;
      align-items: center;
      gap: 32px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .pn-links a {
      color: #8888A0;
      font-size: 0.95rem;
      font-weight: 500;
      text-decoration: none;
      transition: color 0.2s ease;
      position: relative;
    }
    .pn-links a:hover {
      color: #F0F0F5;
      text-decoration: none;
    }
    .pn-links a.pn-active {
      color: #40916C;
    }

    /* CTA */
    .pn-cta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 22px;
      background: #40916C;
      color: #fff;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: 10px;
      text-decoration: none;
      transition: background 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
      border: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .pn-cta:hover {
      background: #2D6A4F;
      color: #fff;
      text-decoration: none;
      box-shadow: 0 8px 24px rgba(64,145,108,0.3);
      transform: translateY(-1px);
    }

    /* Hamburger */
    .pn-hamburger {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      z-index: 1002;
    }
    .pn-hamburger span {
      display: block;
      width: 24px;
      height: 2px;
      background: #F0F0F5;
      border-radius: 2px;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .pn-hamburger.pn-open span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    .pn-hamburger.pn-open span:nth-child(2) {
      opacity: 0;
    }
    .pn-hamburger.pn-open span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    /* Mobile overlay */
    .pn-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 1001;
      background: #0D0D15;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 28px;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .pn-overlay.pn-visible {
      display: flex;
      opacity: 1;
    }
    .pn-overlay a {
      color: #8888A0;
      font-size: 1.3rem;
      font-weight: 600;
      text-decoration: none;
      transition: color 0.2s ease;
    }
    .pn-overlay a:hover,
    .pn-overlay a.pn-active {
      color: #40916C;
      text-decoration: none;
    }
    .pn-overlay .pn-cta {
      margin-top: 16px;
      padding: 14px 32px;
      font-size: 1rem;
    }

    /* Mobile close */
    .pn-close {
      position: absolute;
      top: 20px;
      right: 20px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
    }
    .pn-close svg {
      width: 28px;
      height: 28px;
      stroke: #F0F0F5;
      stroke-width: 2;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .pn-links { display: none; }
      .pn-cta-desktop { display: none; }
      .pn-hamburger { display: flex; }
    }
  `;
  document.head.appendChild(style);

  // -- Menu items --
  var items = [
    { label: 'App', href: '/app', key: 'app' },
    { label: 'Training', href: '/training', key: 'training' },
    { label: 'Trainer werden', href: '/trainer', key: 'trainer' },
    { label: 'Blog', href: '/blog', key: 'blog' }
  ];

  // -- Build nav HTML --
  var linksHtml = items.map(function(item) {
    var cls = activePage === item.key ? ' class="pn-active"' : '';
    return '<li><a href="' + item.href + '"' + cls + '>' + item.label + '</a></li>';
  }).join('');

  var overlayLinksHtml = items.map(function(item) {
    var cls = activePage === item.key ? ' class="pn-active"' : '';
    return '<a href="' + item.href + '"' + cls + '>' + item.label + '</a>';
  }).join('');

  root.innerHTML = `
    <nav class="pn-nav" id="pn-nav-bar">
      <div class="pn-inner">
        <a href="/" class="pn-logo">
          <img src="/assets/logo-pulsly.svg" alt="Pulsly" />
        </a>
        <ul class="pn-links">
          ${linksHtml}
        </ul>
        <a href="/beta" class="pn-cta pn-cta-desktop">Beta testen
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
        <button class="pn-hamburger" id="pn-hamburger" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
    <div class="pn-overlay" id="pn-overlay">
      <button class="pn-close" id="pn-close" aria-label="Close menu">
        <svg viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${overlayLinksHtml}
      <a href="/beta" class="pn-cta">Beta testen
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </a>
    </div>
  `;

  // -- Scroll listener --
  var navBar = document.getElementById('pn-nav-bar');
  window.addEventListener('scroll', function() {
    if (window.scrollY > 50) {
      navBar.classList.add('pn-scrolled');
    } else {
      navBar.classList.remove('pn-scrolled');
    }
  }, { passive: true });

  // -- Mobile toggle --
  var hamburger = document.getElementById('pn-hamburger');
  var overlay = document.getElementById('pn-overlay');
  var closeBtn = document.getElementById('pn-close');

  function openMenu() {
    overlay.classList.add('pn-visible');
    hamburger.classList.add('pn-open');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    overlay.classList.remove('pn-visible');
    hamburger.classList.remove('pn-open');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', function() {
    if (overlay.classList.contains('pn-visible')) {
      closeMenu();
    } else {
      openMenu();
    }
  });
  closeBtn.addEventListener('click', closeMenu);

  // Close overlay on link click
  overlay.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', closeMenu);
  });
}


/* ============================================================
   Footer
   ============================================================ */

function renderPulslyFooter() {
  var root = document.getElementById('pulsly-footer');
  if (!root) return;

  // -- Styles --
  var style = document.createElement('style');
  style.textContent = `
    .pf-footer {
      background: #0D0D15;
      border-top: 1px solid rgba(255,255,255,0.06);
      padding: 60px 0 30px;
      font-family: 'Outfit', sans-serif;
    }
    .pf-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .pf-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 48px;
      margin-bottom: 48px;
    }

    /* Col 1: Brand */
    .pf-brand img {
      height: 26px;
      width: auto;
      margin-bottom: 16px;
    }
    .pf-tagline {
      color: #8888A0;
      font-size: 0.95rem;
      line-height: 1.6;
      margin: 0;
    }

    /* Col 2: Links */
    .pf-col-title {
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #55556A;
      margin-bottom: 20px;
    }
    .pf-link-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pf-link-list a {
      color: #8888A0;
      font-size: 0.92rem;
      text-decoration: none;
      transition: color 0.2s ease;
    }
    .pf-link-list a:hover {
      color: #F0F0F5;
      text-decoration: none;
    }

    /* Col 3: Social */
    .pf-social-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #8888A0;
      font-size: 0.92rem;
      text-decoration: none;
      transition: color 0.2s ease;
    }
    .pf-social-link:hover {
      color: #F0F0F5;
      text-decoration: none;
    }
    .pf-social-link svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* Bottom bar */
    .pf-bottom {
      border-top: 1px solid rgba(255,255,255,0.06);
      padding-top: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pf-copy {
      color: #55556A;
      font-size: 0.82rem;
      margin: 0;
    }
    .pf-note {
      color: #55556A;
      font-size: 0.78rem;
      font-style: italic;
      margin: 0;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .pf-grid {
        grid-template-columns: 1fr;
        gap: 36px;
        margin-bottom: 36px;
      }
      .pf-bottom {
        flex-direction: column;
        gap: 8px;
        text-align: center;
      }
    }
  `;
  document.head.appendChild(style);

  root.innerHTML = `
    <footer class="pf-footer">
      <div class="pf-inner">
        <div class="pf-grid">

          <!-- Brand -->
          <div class="pf-brand">
            <a href="/"><img src="/assets/logo-pulsly.svg" alt="Pulsly" /></a>
            <p class="pf-tagline">Dein Pocket Coach. &Uuml;berall.</p>
          </div>

          <!-- Links -->
          <div>
            <div class="pf-col-title">Navigation</div>
            <ul class="pf-link-list">
              <li><a href="/app">App</a></li>
              <li><a href="/training">Training</a></li>
              <li><a href="/trainer">Trainer werden</a></li>
              <li><a href="/blog">Blog</a></li>
              <li><a href="/impressum">Impressum</a></li>
              <li><a href="/datenschutz">Datenschutz</a></li>
              <li><a href="/agb">AGB</a></li>
            </ul>
          </div>

          <!-- Social -->
          <div>
            <div class="pf-col-title">Social</div>
            <a href="https://instagram.com/pulsly.coach" target="_blank" rel="noopener noreferrer" class="pf-social-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5"/>
                <circle cx="12" cy="12" r="5"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>
              </svg>
              @pulsly.coach
            </a>
          </div>

        </div>

        <!-- Bottom -->
        <div class="pf-bottom">
          <p class="pf-copy">&copy; 2026 Pulsly</p>
          <p class="pf-note">Projekt Fit wird Pulsly</p>
        </div>
      </div>
    </footer>
  `;
}
