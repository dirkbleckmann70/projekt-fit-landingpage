// ============================================================================
// Trainer-Portal Auth Check – Auf jeder trainer-portal/*.html Seite einbinden
// ============================================================================
// <script src="auth-check.js"></script>
// Prüft Session + role=trainer, lädt Trainer-Profil, stellt Globals bereit.

const SUPABASE_URL = 'https://ahsjydgknmysircubjsk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8tZaFMrIrzJXjDbYAF2huw_ygDY9K2Q';

let _sb = null;

// Das aktuelle Trainer-Profil (nach checkTrainerAuth verfügbar)
window.currentTrainer = null;

function getSupabase() {
  if (!_sb) {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sb;
}

// ─── Auth prüfen + Profil laden ─────────────────────────────────────────────

async function checkTrainerAuth() {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    window.location.href = '/trainer-portal/';
    return null;
  }

  const user = session.user;
  const role = user.user_metadata?.role;

  if (!role || !role.includes('trainer')) {
    await sb.auth.signOut();
    window.location.href = '/trainer-portal/?error=no_trainer';
    return null;
  }

  // Trainer-Profil laden (über auth_user_id)
  const { data: profile, error } = await sb
    .from('trainer_profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !profile) {
    console.error('Trainer-Profil nicht gefunden:', error?.message);
    // Profil nicht gefunden – trotzdem eingeloggt lassen, aber warnen
    window.currentTrainer = {
      id: null,
      auth_user_id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email,
      _noProfile: true,
    };
    return window.currentTrainer;
  }

  window.currentTrainer = profile;
  return profile;
}

async function trainerLogout() {
  const sb = getSupabase();
  await sb.auth.signOut();
  window.location.href = '/trainer-portal/';
}

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatTime(timeStr) {
  if (!timeStr) return '–';
  return timeStr.substring(0, 5); // HH:MM
}

function formatEuro(cents) {
  if (cents == null) return '–';
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function statusBadge(status) {
  const map = {
    PENDING: 'badge-pending',
    CONFIRMED: 'badge-confirmed',
    COMPLETED: 'badge-completed',
    CANCELLED: 'badge-cancelled',
    pending: 'badge-pending',
    confirmed: 'badge-confirmed',
    completed: 'badge-completed',
    cancelled: 'badge-cancelled',
    cancelled_by_trainer: 'badge-cancelled',
    expired: 'badge-expired',
    EXPIRED: 'badge-expired',
    paid: 'badge-completed',
  };
  const cls = map[status] || 'badge-pending';
  const labels = {
    PENDING: 'Anfrage',
    CONFIRMED: 'Bestätigt',
    COMPLETED: 'Abgeschlossen',
    CANCELLED: 'Storniert',
    EXPIRED: 'Abgelaufen',
    pending: 'Anfrage',
    confirmed: 'Bestätigt',
    completed: 'Abgeschlossen',
    cancelled: 'Storniert',
    expired: 'Abgelaufen',
    cancelled_by_trainer: 'Abgelehnt',
    paid: 'Bezahlt',
  };
  return `<span class="badge ${cls}">${labels[status] || status}</span>`;
}

function showAlert(id, message, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

// ─── Bottom Nav / Sidebar rendern ───────────────────────────────────────────

function renderNav(activePage) {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', href: '/trainer-portal/dashboard.html',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { id: 'bookings', label: 'Buchungen', href: '/trainer-portal/bookings.html',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    { id: 'availability', label: 'Verfügbarkeit', href: '/trainer-portal/availability.html',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
    { id: 'finances', label: 'Finanzen', href: '/trainer-portal/finances.html',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
    { id: 'invoices', label: 'Gutschriften', href: '/trainer-portal/invoices.html',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
    { id: 'profile', label: 'Profil', href: '/trainer-portal/profile.html',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' },
  ];

  return pages.map(p => `
    <a href="${p.href}" class="tab-item ${p.id === activePage ? 'active' : ''}">
      ${p.icon}
      ${p.label}
    </a>
  `).join('');
}

function renderTopHeader() {
  const name = window.currentTrainer?.full_name || 'Trainer';
  return `
    <div class="top-header-left">
      <div class="top-logo">Projekt <span>Fit</span></div>
      <div class="top-title">${name}</div>
    </div>
    <div class="top-header-right">
      <button class="btn btn-ghost btn-sm" onclick="trainerLogout()">Logout</button>
    </div>
  `;
}
