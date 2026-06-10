// ============================================================================
// Realtime Toast Notifications — Supabase Realtime → Tabler Toasts
// ============================================================================

(function() {
  // Toast-Container erstellen
  function ensureContainer() {
    var c = document.getElementById('pf-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'pf-toast-container';
      c.className = 'toast-container-pf';
      document.body.appendChild(c);
    }
    return c;
  }

  // Toast anzeigen
  window.showPfToast = function(title, message, type) {
    type = type || 'info';
    var colorMap = { success: '#40916C', warning: '#e8930a', danger: '#e74c3c', info: '#206bc4' };
    var iconMap = { success: 'check', warning: 'alert-triangle', danger: 'x', info: 'bell' };

    var container = ensureContainer();
    var toast = document.createElement('div');
    toast.className = 'toast show';
    toast.setAttribute('role', 'alert');
    toast.style.cssText = 'min-width:300px;background:var(--tblr-card-bg);border:1px solid var(--tblr-border-color);border-left:4px solid ' + colorMap[type] + ';border-radius:8px;padding:12px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:flex-start;gap:12px;animation:slideIn 0.3s ease';

    toast.innerHTML =
      '<i class="ti ti-' + iconMap[type] + '" style="color:' + colorMap[type] + ';font-size:20px;margin-top:2px"></i>' +
      '<div style="flex:1">' +
        '<div style="font-weight:600;font-size:13px;margin-bottom:2px">' + title + '</div>' +
        '<div style="font-size:12px;color:var(--tblr-secondary-color)">' + message + '</div>' +
      '</div>' +
      '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--tblr-secondary-color);cursor:pointer;font-size:18px;line-height:1">&times;</button>';

    container.appendChild(toast);

    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(function() { toast.remove(); }, 300);
    }, 6000);
  };

  // Slide-In Animation
  if (!document.getElementById('pf-toast-anim')) {
    var style = document.createElement('style');
    style.id = 'pf-toast-anim';
    style.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(style);
  }

  // Supabase Realtime Listener
  window.initRealtimeToasts = function(sb, role) {
    sb.channel('bookings-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, function(payload) {
        var b = payload.new;
        showPfToast('Neue Buchung', (b.customer_name || 'Kunde') + ' — ' + (b.training_type || 'Training'), 'info');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, function(payload) {
        var b = payload.new;
        var old = payload.old;
        // old.status ist nur gesetzt wenn bookings REPLICA IDENTITY FULL hat (Migration
        // 20260610140000). Fehlt es (DEFAULT -> nur PK in old), NICHT feuern statt bei
        // jedem UPDATE einen falschen "Status geaendert"-Toast zu zeigen.
        if (old.status !== undefined && b.status !== old.status) {
          var statusText = (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[b.status]) || b.status;
          showPfToast('Status geaendert', 'Buchung #' + (b.id || '').slice(0,8) + ' → ' + statusText, 'warning');
        }
      })
      .subscribe();

    if (role === 'admin') {
      sb.channel('trainers-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trainers' }, function(payload) {
          var t = payload.new;
          showPfToast('Neue Bewerbung', (t.full_name || 'Trainer') + ' aus ' + (t.city || '–'), 'success');
        })
        .subscribe();
    }
  };
})();
