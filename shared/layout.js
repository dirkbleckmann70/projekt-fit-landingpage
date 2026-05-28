// ============================================================================
// Shared Layout Module – Sidebar, Header, Bottom Nav fuer Admin + Trainer
// ============================================================================
// Nutzt Tabler Icons (CDN: ti ti-* Klassen) statt inline SVGs.
// Einbinden: <script src="/shared/layout.js"></script>

// Pulsly-Wortmarke K2 (Brainstorm 28.05.2026 — locked):
//   Archivo Black lowercase, monochrom (currentColor) + Inline-Puls-Signatur + oranger Dot.
//   Wortmarke faerbt sich automatisch nach Theme (currentColor erbt vom Eltern-Element).
//   Akzent: App-Orange #FB923C (Puls + Dot).
if (typeof document !== 'undefined' && !document.querySelector('link[href*="Archivo+Black"]')) {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap';
  document.head.appendChild(fontLink);
}
const PULSLY_BRAND = '<svg viewBox="0 0 200 80" style="height:1.4em;vertical-align:-0.42em" xmlns="http://www.w3.org/2000/svg" aria-label="pulsly"><text x="20" y="50" font-family="\'Archivo Black\', sans-serif" font-size="36" letter-spacing="-1.6" fill="currentColor">pulsly</text><path d="M138,45 L143,45 L146,42 L149,48 L152,45 L156,45 L159,30 L162,60 L165,38 L168,52 L171,45 L175,45" stroke="#FB923C" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="179" cy="45" r="4" fill="#FB923C"/></svg>';

// ─── Admin Sidebar ──────────────────────────────────────────────────────────

window.renderAdminSidebar = function renderAdminSidebar(activePage) {
  const items = [
    { id: 'dashboard',        label: 'Dashboard',        emoji: '📊', href: '/admin/dashboard.html' },
    { id: 'bookings',         label: 'Buchungen',        emoji: '📋', href: '/admin/bookings.html' },
    { id: 'customers',        label: 'Kunden',           emoji: '👥', href: '/admin/customers.html' },
    { id: 'trainers',         label: 'Trainer',          emoji: '🏋️', href: '/admin/trainers.html' },
    { id: 'calendar',         label: 'Kalender',         emoji: '📅', href: '/admin/calendar.html' },
    { id: 'cards',            label: '10er-Karten',      emoji: '🎫', href: '/admin/cards.html' },
    { id: 'groups',           label: 'Gruppentrainings', emoji: '👥', href: '/admin/groups.html' },
    { id: 'open-payments',    label: 'Offene Zahlungen', emoji: '⏳', href: '/admin/open-payments.html' },
    { id: 'locations',        label: 'Einsatzorte',      emoji: '📍', href: '/admin/locations.html' },
    { id: 'finances',         label: 'Finanzen',         emoji: '💰', href: '/admin/finances.html' },
    { id: 'invoices',         label: 'Belege',           emoji: '📄', href: '/admin/invoices.html' },
    { id: 'documents',        label: 'Dokumente',        emoji: '📁', href: '/admin/documents.html' },
    { id: 'testers',          label: 'Tester',           emoji: '🧪', href: '/admin/testers.html' },
    { id: 'trainer-debts',    label: 'Trainer-Schulden',  emoji: '📊', href: '/admin/trainer-debts.html' },
    { id: 'company-settings', label: 'Einstellungen',    emoji: '⚙️', href: '/admin/company-settings.html' },
  ];

  const navItems = items.map(p => `
        <div class="pf-sidebar-item${p.id === activePage ? ' active' : ''}">
          <a href="${p.href}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:10px">
            <span class="pf-sidebar-icon">${p.emoji}</span>
            <span>${p.label}</span>
          </a>
        </div>`).join('');

  return `<aside class="navbar navbar-vertical navbar-expand-lg" data-bs-theme="light">
  <div class="container-fluid">
    <h1 class="navbar-brand navbar-brand-autodark">
      <a href="/admin/dashboard.html" style="text-decoration:none;color:inherit">
        ${PULSLY_BRAND} <span style="color:var(--tblr-secondary-color);font-weight:500">Admin</span>
      </a>
    </h1>
    <div class="collapse navbar-collapse" id="sidebar-menu">
      <div class="pt-lg-3">${navItems}
      </div>
    </div>
  </div>
</aside>`;
};

// ─── Admin Header ───────────────────────────────────────────────────────────

window.renderAdminHeader = function renderAdminHeader(title, userEmail) {
  return `<div class="container-fluid">
  <div class="page-header d-print-none">
    <div class="row align-items-center">
      <div class="col-auto">
        <button class="navbar-toggler d-lg-none" type="button" data-bs-toggle="collapse"
                data-bs-target="#sidebar-menu" aria-label="Menue">
          <span class="navbar-toggler-icon"></span>
        </button>
      </div>
      <div class="col">
        <h2 class="page-title">${title}</h2>
      </div>
      <div class="col-auto ms-auto d-print-none">
        <div class="d-flex align-items-center gap-2">
          <div id="toast-trigger" class="position-relative">
            <button class="btn btn-icon btn-ghost-secondary" title="Benachrichtigungen">
              <i class="ti ti-bell"></i>
              <span class="badge bg-red badge-notification badge-blink d-none" id="notif-badge"></span>
            </button>
          </div>
          <span class="text-secondary d-none d-md-inline">${userEmail}</span>
          <button class="pf-btn pf-btn-neutral" onclick="adminLogout()" title="Abmelden">
            <i class="ti ti-logout"></i> Logout
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`;
};

// ─── Trainer Sidebar (Desktop) ──────────────────────────────────────────────

window.renderTrainerSidebar = function renderTrainerSidebar(activePage) {
  const items = [
    { id: 'dashboard',    label: 'Dashboard',    emoji: '📊', href: '/trainer-portal/dashboard.html' },
    { id: 'bookings',     label: 'Buchungen',    emoji: '📋', href: '/trainer-portal/bookings.html' },
    { id: 'calendar',     label: 'Kalender',     emoji: '📅', href: '/trainer-portal/availability.html' },
    { id: 'finances',     label: 'Finanzen',     emoji: '💰', href: '/trainer-portal/finances.html' },
    { id: 'invoices',     label: 'Gutschriften', emoji: '📄', href: '/trainer-portal/invoices.html' },
    { id: 'profile',      label: 'Profil',       emoji: '👤', href: '/trainer-portal/profile.html' },
  ];

  const navItems = items.map(p => `
        <div class="pf-sidebar-item${p.id === activePage ? ' active' : ''}">
          <a href="${p.href}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:10px">
            <span class="pf-sidebar-icon">${p.emoji}</span>
            <span>${p.label}</span>
          </a>
        </div>`).join('');

  return `<aside class="navbar navbar-vertical navbar-expand-lg d-none d-lg-flex" data-bs-theme="light">
  <div class="container-fluid">
    <h1 class="navbar-brand navbar-brand-autodark">
      <a href="/trainer-portal/dashboard.html" style="text-decoration:none;color:inherit">
        ${PULSLY_BRAND}
      </a>
    </h1>
    <div class="collapse navbar-collapse" id="sidebar-menu">
      <div class="pt-lg-3">${navItems}
      </div>
    </div>
  </div>
</aside>`;
};

// ─── Trainer Bottom Nav (Mobile) ────────────────────────────────────────────

window.renderTrainerBottomNav = function renderTrainerBottomNav(activePage) {
  const mainItems = [
    { id: 'dashboard',    label: 'Home',      icon: 'home',           href: '/trainer-portal/dashboard.html' },
    { id: 'bookings',     label: 'Buchungen', icon: 'clipboard-list', href: '/trainer-portal/bookings.html' },
    { id: 'calendar',     label: 'Kalender',  icon: 'calendar',       href: '/trainer-portal/availability.html' },
    { id: 'finances',     label: 'Finanzen',  icon: 'currency-euro',  href: '/trainer-portal/finances.html' },
    { id: 'profile',      label: 'Profil',    icon: 'user',           href: '/trainer-portal/profile.html' },
  ];

  const moreItems = [
    { id: 'availability', label: 'Verfügbarkeit', icon: 'clock',        href: '/trainer-portal/availability.html' },
    { id: 'invoices',     label: 'Gutschriften',  icon: 'file-invoice', href: '/trainer-portal/invoices.html' },
  ];

  const isMoreActive = moreItems.some(p => p.id === activePage);

  const navLinks = mainItems.map(p => {
    const color = p.id === activePage ? 'var(--tblr-primary)' : 'var(--tblr-secondary-color)';
    return `<a href="${p.href}" style="display:flex;flex-direction:column;align-items:center;text-decoration:none;font-size:11px;gap:2px;color:${color}">
      <i class="ti ti-${p.icon}" style="font-size:22px"></i>
      ${p.label}
    </a>`;
  }).join('\n  ');

  const moreColor = isMoreActive ? 'var(--tblr-primary)' : 'var(--tblr-secondary-color)';
  const moreDropdownItems = moreItems.map(p => {
    const itemColor = p.id === activePage ? 'var(--tblr-primary)' : 'inherit';
    return `<a href="${p.href}" style="display:flex;align-items:center;gap:8px;padding:10px 16px;text-decoration:none;color:${itemColor};font-size:14px">
        <i class="ti ti-${p.icon}" style="font-size:18px"></i>
        ${p.label}
      </a>`;
  }).join('\n      ');

  return `<nav class="d-lg-none" style="position:fixed;bottom:0;left:0;right:0;z-index:1030;background:var(--tblr-card-bg);border-top:1px solid var(--tblr-border-color);display:flex;justify-content:space-around;padding:8px 0">
  ${navLinks}
  <div style="position:relative;display:flex;flex-direction:column;align-items:center">
    <button onclick="document.getElementById('pf-more-menu').classList.toggle('d-none')" style="display:flex;flex-direction:column;align-items:center;background:none;border:none;font-size:11px;gap:2px;color:${moreColor};cursor:pointer;padding:0">
      <i class="ti ti-dots" style="font-size:22px"></i>
      Mehr
    </button>
    <div id="pf-more-menu" class="d-none" style="position:absolute;bottom:48px;right:0;background:var(--tblr-card-bg);border:1px solid var(--tblr-border-color);border-radius:8px;min-width:170px;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:1040">
      ${moreDropdownItems}
    </div>
  </div>
</nav>
<script>
  document.addEventListener('click', function(e) {
    var menu = document.getElementById('pf-more-menu');
    if (menu && !menu.contains(e.target) && !e.target.closest('[onclick*="pf-more-menu"]')) {
      menu.classList.add('d-none');
    }
  });
</script>`;
};

// ─── Trainer Header ─────────────────────────────────────────────────────────

window.renderTrainerHeader = function renderTrainerHeader(title, trainerEmail) {
  return `<div class="container-fluid">
  <div class="page-header d-print-none">
    <div class="row align-items-center">
      <div class="col">
        <h2 class="page-title">${title}</h2>
      </div>
      <div class="col-auto ms-auto d-print-none">
        <div class="d-flex align-items-center gap-2">
          <span class="text-secondary d-none d-md-inline">${trainerEmail || ''}</span>
          <button class="pf-btn pf-btn-neutral" onclick="trainerLogout()" title="Abmelden">
            <i class="ti ti-logout"></i> Logout
          </button>
        </div>
      </div>
    </div>
  </div>
</div>`;
};
