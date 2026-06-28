// ============================================================================
// Admin Auth Guard – Auf jeder admin/*.html Seite einbinden
// ============================================================================
// <script src="auth-guard.js"></script>
// Prüft Session + role=admin, sonst Redirect zu /admin/

const SUPABASE_URL = 'https://ahsjydgknmysircubjsk.supabase.co';
// Klassisches JWT (eyJ...) — sb_publishable_* wird vom Edge-Function-Gateway abgelehnt
// (Memory: reference_supabase_edge_function_keys.md)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoc2p5ZGdrbm15c2lyY3VianNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjk5NDAsImV4cCI6MjA4ODc0NTk0MH0.nGPKA30cm-EPsyt0Pn5YWxcMjMdNzg_1yN87LdK0rZI';

// Auf window spiegeln, damit IIFE-Module (z.B. assets/js/storno-dialog.js via
// `global.SUPABASE_URL`/`global.SUPABASE_ANON_KEY`) sie erreichen. `const` im
// Skript-Scope ist KEINE window-Eigenschaft → war sonst `undefined` und das
// Storno-fetch baute `undefined/functions/v1/cancel-or-refund` → Vercel-404
// (B-2026-06-04: „Storno fehlgeschlagen — NOT_FOUND").
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

let _sb = null;
let _adminUser = null;

function getSupabase() {
  if (!_sb) {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'sb-admin-auth' }
    });
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
// Nutzt DESIGN.badge() aus design-tokens.js wenn verfuegbar, sonst Fallback
function statusBadge(status) {
  const key = (status || '').toLowerCase();
  // Design-System bevorzugen (design-tokens.js)
  if (typeof window.DESIGN !== 'undefined' && typeof window.DESIGN.badge === 'function') {
    return window.DESIGN.badge(key);
  }
  // Fallback-Map fuer den Fall, dass design-tokens.js noch nicht geladen ist
  const fallbackMap = {
    pending: 'badge-pending',
    active: 'badge-active',
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
  const cls = fallbackMap[key] || 'badge-pending';
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
