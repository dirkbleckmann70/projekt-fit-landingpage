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

// Hilfsfunktion: Admin-API Call mit Session-Token (Auto-Refresh)
async function adminApi(endpoint, options = {}) {
  const sb = getSupabase();

  // Immer frischen Token holen (refresht automatisch wenn abgelaufen)
  const { data: { session }, error: sessionErr } = await sb.auth.refreshSession();

  if (sessionErr || !session) {
    // Fallback: getSession versuchen
    const { data: { session: fallback } } = await sb.auth.getSession();
    if (!fallback) {
      window.location.href = '/admin/';
      throw new Error('Nicht eingeloggt');
    }
    var token = fallback.access_token;
  } else {
    var token = session.access_token;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
// Nutzt STATUS_BADGE_CLASS und STATUS_LABELS aus shared/constants.js wenn verfuegbar
function statusBadge(status) {
  // Fallback-Map fuer den Fall, dass constants.js noch nicht geladen ist
  const fallbackMap = {
    pending: 'badge-pending',
    active: 'badge-active',
    pausiert: 'badge-paused',
    paused: 'badge-paused',
    gesperrt: 'badge-blocked',
    blocked: 'badge-blocked',
    confirmed: 'badge-confirmed',
    completed: 'badge-completed',
    cancelled: 'badge-cancelled',
    expired: 'badge-expired',
    location_proposed: 'badge-warning',
    reschedule_proposed: 'badge-pending',
    awaiting_checkout: 'badge-warning',
  };
  // Shared constants bevorzugen (lowercase key)
  const key = (status || '').toLowerCase();
  const cls = (typeof STATUS_BADGE_CLASS !== 'undefined' && STATUS_BADGE_CLASS[key])
    || fallbackMap[key]
    || 'badge-pending';
  const label = (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[key])
    || status
    || '–';
  return `<span class="badge ${cls}">${label}</span>`;
}

// Alert anzeigen
function showAlert(id, message, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}
