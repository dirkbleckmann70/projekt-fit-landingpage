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
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: 'sb-trainer-auth' }
    });
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
    await sb.auth.signOut();
    window.location.href = '/trainer-portal/?error=no_profile';
    return null;
  }

  // Gesperrte/deaktivierte Trainer aussperren
  if (profile.status === 'gesperrt' || profile.status === 'pending') {
    await sb.auth.signOut();
    window.location.href = '/trainer-portal/?error=deactivated';
    return null;
  }

  window.currentTrainer = profile;
  return profile;
}

async function adminApi(endpoint, options = {}) {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    window.location.href = '/trainer-portal/';
    throw new Error('Nicht eingeloggt');
  }

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      ...(options.headers || {}),
    },
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
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

// statusBadge wird zentral aus shared/constants.js bereitgestellt.
// Bei verfügbarem DESIGN (design-tokens.js) nutzt sie DESIGN.badge().

function showAlert(id, message, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 5000);
}

