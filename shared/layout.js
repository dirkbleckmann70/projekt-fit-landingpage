// ============================================================================
// Shared Layout Module – Sidebar, Header, Bottom Nav fuer Admin + Trainer
// ============================================================================
// Nutzt Tabler Icons (CDN: ti ti-* Klassen) statt inline SVGs.
// Einbinden: <script src="/shared/layout.js"></script>

const MOON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

// ─── Admin Sidebar ──────────────────────────────────────────────────────────

window.renderAdminSidebar = function renderAdminSidebar(activePage) {
  const items = [
    { id: 'dashboard',        label: 'Dashboard',         icon: 'layout-dashboard', href: '/admin/dashboard.html' },
    { id: 'calendar',         label: 'Kalender',          icon: 'calendar',         href: '/admin/calendar.html' },
    { id: 'trainers',         label: 'Trainer',           icon: 'users',            href: '/admin/trainers.html' },
    { id: 'bookings',         label: 'Buchungen',         icon: 'clipboard-list',   href: '/admin/bookings.html' },
    { id: 'open-payments',    label: 'Offene Zahlungen',  icon: 'credit-card-off',  href: '/admin/open-payments.html' },
    { id: 'trainer-debts',    label: 'Trainer-Schulden',  icon: 'wallet-off',       href: '/admin/trainer-debts.html' },
    { id: 'customers',        label: 'Kunden',            icon: 'user',             href: '/admin/customers.html' },
    { id: 'finances',         label: 'Finanzen',          icon: 'currency-euro',    href: '/admin/finances.html' },
    { id: 'groups',           label: 'Gruppentrainings',  icon: 'users-group',      href: '/admin/groups.html' },
    { id: 'cards',            label: '10er-Karten',       icon: 'ticket',           href: '/admin/cards.html' },
    { id: 'documents',        label: 'Dokumente',         icon: 'file-text',        href: '/admin/documents.html' },
    { id: 'locations',        label: 'Einsatzorte',       icon: 'map-pin',          href: '/admin/locations.html' },
    { id: 'testers',          label: 'Tester & Admins',   icon: 'settings',         href: '/admin/testers.html' },
    { id: 'invoices',         label: 'Belege',            icon: 'file-invoice',     href: '/admin/invoices.html' },
    { id: 'company-settings', label: 'Firmendaten',       icon: 'building',         href: '/admin/company-settings.html' },
  ];

  const navItems = items.map(p => `
        <li class="nav-item">
          <a class="nav-link${p.id === activePage ? ' active' : ''}" href="${p.href}">
            <span class="nav-link-icon"><i class="ti ti-${p.icon}"></i></span>
            <span class="nav-link-title">${p.label}</span>
          </a>
        </li>`).join('');

  return `<aside class="navbar navbar-vertical navbar-expand-lg" data-bs-theme="dark">
  <div class="container-fluid">
    <h1 class="navbar-brand navbar-brand-autodark">
      <a href="/admin/dashboard.html" style="text-decoration:none;color:inherit">
        Projekt <span>Fit</span> Admin
      </a>
    </h1>
    <div class="collapse navbar-collapse" id="sidebar-menu">
      <ul class="navbar-nav pt-lg-3">${navItems}
      </ul>
    </div>
  </div>
</aside>`;
};

// ─── Admin Header ───────────────────────────────────────────────────────────

window.renderAdminHeader = function renderAdminHeader(title, userEmail) {
  return `<div class="container-xl">
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
          <button id="theme-toggle" class="btn btn-icon btn-ghost-secondary" onclick="toggleTheme()" title="Theme wechseln">
            ${MOON_SVG}
          </button>
          <div id="toast-trigger" class="position-relative">
            <button class="btn btn-icon btn-ghost-secondary" title="Benachrichtigungen">
              <i class="ti ti-bell"></i>
              <span class="badge bg-red badge-notification badge-blink d-none" id="notif-badge"></span>
            </button>
          </div>
          <span class="text-secondary d-none d-md-inline">${userEmail}</span>
          <button class="btn btn-ghost-secondary btn-sm" onclick="adminLogout()">Logout</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
};

// ─── Trainer Sidebar (Desktop) ──────────────────────────────────────────────

window.renderTrainerSidebar = function renderTrainerSidebar(activePage) {
  const items = [
    { id: 'dashboard',    label: 'Dashboard',    icon: 'layout-dashboard', href: '/trainer-portal/dashboard.html' },
    { id: 'bookings',     label: 'Buchungen',    icon: 'clipboard-list',   href: '/trainer-portal/bookings.html' },
    { id: 'availability', label: 'Kalender',     icon: 'calendar',         href: '/trainer-portal/availability.html' },
    { id: 'finances',     label: 'Finanzen',     icon: 'currency-euro',    href: '/trainer-portal/finances.html' },
    { id: 'invoices',     label: 'Gutschriften', icon: 'file-invoice',     href: '/trainer-portal/invoices.html' },
    { id: 'profile',      label: 'Profil',       icon: 'user',             href: '/trainer-portal/profile.html' },
  ];

  const navItems = items.map(p => `
        <li class="nav-item">
          <a class="nav-link${p.id === activePage ? ' active' : ''}" href="${p.href}">
            <span class="nav-link-icon"><i class="ti ti-${p.icon}"></i></span>
            <span class="nav-link-title">${p.label}</span>
          </a>
        </li>`).join('');

  return `<aside class="navbar navbar-vertical navbar-expand-lg d-none d-lg-flex" data-bs-theme="dark">
  <div class="container-fluid">
    <h1 class="navbar-brand navbar-brand-autodark">
      <a href="/trainer-portal/dashboard.html" style="text-decoration:none;color:inherit">
        Projekt <span>Fit</span>
      </a>
    </h1>
    <div class="collapse navbar-collapse" id="sidebar-menu">
      <ul class="navbar-nav pt-lg-3">${navItems}
      </ul>
    </div>
  </div>
</aside>`;
};

// ─── Trainer Bottom Nav (Mobile) ────────────────────────────────────────────

window.renderTrainerBottomNav = function renderTrainerBottomNav(activePage) {
  const items = [
    { id: 'dashboard',    label: 'Home',      icon: 'home',           href: '/trainer-portal/dashboard.html' },
    { id: 'bookings',     label: 'Buchungen', icon: 'clipboard-list', href: '/trainer-portal/bookings.html' },
    { id: 'availability', label: 'Kalender',  icon: 'calendar',       href: '/trainer-portal/availability.html' },
    { id: 'finances',     label: 'Finanzen',  icon: 'currency-euro',  href: '/trainer-portal/finances.html' },
    { id: 'profile',      label: 'Profil',    icon: 'user',           href: '/trainer-portal/profile.html' },
  ];

  const navLinks = items.map(p => {
    const color = p.id === activePage ? 'var(--tblr-primary)' : 'var(--tblr-secondary-color)';
    return `<a href="${p.href}" style="display:flex;flex-direction:column;align-items:center;text-decoration:none;font-size:11px;gap:2px;color:${color}">
      <i class="ti ti-${p.icon}" style="font-size:22px"></i>
      ${p.label}
    </a>`;
  }).join('\n  ');

  return `<nav class="d-lg-none" style="position:fixed;bottom:0;left:0;right:0;z-index:1030;background:var(--tblr-card-bg);border-top:1px solid var(--tblr-border-color);display:flex;justify-content:space-around;padding:8px 0">
  ${navLinks}
</nav>`;
};

// ─── Trainer Header ─────────────────────────────────────────────────────────

window.renderTrainerHeader = function renderTrainerHeader(title, trainerEmail) {
  return `<div class="container-xl">
  <div class="page-header d-print-none">
    <div class="row align-items-center">
      <div class="col">
        <h2 class="page-title">${title}</h2>
      </div>
      <div class="col-auto ms-auto d-print-none">
        <div class="d-flex align-items-center gap-2">
          <button id="theme-toggle" class="btn btn-icon btn-ghost-secondary" onclick="toggleTheme()" title="Theme wechseln">
            ${MOON_SVG}
          </button>
          <span class="text-secondary d-none d-md-inline">${trainerEmail || ''}</span>
          <button class="btn btn-ghost-secondary btn-sm" onclick="trainerLogout()">Logout</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
};
