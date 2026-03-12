// ============================================================================
// Admin Auth Guard – Auf jeder admin/*.html Seite einbinden
// ============================================================================
// <script src="auth-guard.js"></script>
// Prüft Session + role=admin, sonst Redirect zu /admin/

const SUPABASE_URL = 'https://ahsjydgknmysircubjsk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8tZaFMrIrzJXjDbYAF2huw_ygDY9K2Q';

let _sb = null;
let _adminUser = null;

function getSupabase() {
  if (!_sb) {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sb;
}

async function checkAdminAuth() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    window.location.href = '/admin/';
    return null;
  }

  const user = session.user;
  const role = user.user_metadata?.role;

  if (!role || !role.includes('admin')) {
    await sb.auth.signOut();
    window.location.href = '/admin/?error=no_admin';
    return null;
  }

  _adminUser = user;
  return user;
}

async function adminLogout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  window.location.href = '/admin/';
}

// Hilfsfunktion: Admin-API Call mit Session-Token
async function adminApi(endpoint, options = {}) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    window.location.href = '/admin/';
    throw new Error('Nicht eingeloggt');
  }

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Datum formatieren: DD.MM.YYYY
function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Datum + Uhrzeit: DD.MM.YYYY HH:mm
function formatDateTime(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// Euro formatieren
function formatEuro(cents) {
  if (cents == null) return '–';
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// Status Badge HTML
function statusBadge(status) {
  const map = {
    pending: 'badge-pending',
    active: 'badge-active',
    pausiert: 'badge-paused',
    paused: 'badge-paused',
    gesperrt: 'badge-blocked',
    blocked: 'badge-blocked',
    confirmed: 'badge-confirmed',
    completed: 'badge-completed',
    cancelled: 'badge-cancelled',
    PENDING: 'badge-pending',
    CONFIRMED: 'badge-confirmed',
    COMPLETED: 'badge-completed',
    CANCELLED: 'badge-cancelled',
  };
  const cls = map[status] || 'badge-pending';
  return `<span class="badge ${cls}">${status}</span>`;
}

// Alert anzeigen
function showAlert(id, message, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

// Sidebar HTML generieren
function renderSidebar(activePage) {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: '/admin/dashboard.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { id: 'trainers', label: 'Trainer', href: '/admin/trainers.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
    { id: 'bookings', label: 'Buchungen', href: '/admin/bookings.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    { id: 'finances', label: 'Finanzen', href: '/admin/finances.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { id: 'groups', label: 'Gruppentrainings', href: '/admin/groups.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>' },
  ];

  return `
    <div class="sidebar-logo">Projekt <span>Fit</span> Admin</div>
    <nav class="sidebar-nav">
      ${pages.map(p => `
        <a href="${p.href}" class="nav-item ${p.id === activePage ? 'active' : ''}">
          ${p.icon}
          ${p.label}
        </a>
      `).join('')}
    </nav>
    <div class="sidebar-footer">
      <button class="btn btn-ghost btn-sm" onclick="adminLogout()" style="width:100%">Abmelden</button>
    </div>
  `;
}

// Header HTML
function renderHeader(title) {
  const email = _adminUser?.email || '';
  return `
    <div class="header-title">${title}</div>
    <div class="header-right">
      <span class="header-user">${email}</span>
      <button class="btn btn-ghost btn-sm" onclick="adminLogout()">Logout</button>
    </div>
  `;
}
