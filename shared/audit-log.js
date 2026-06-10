// shared/audit-log.js — gemeinsamer Audit-/Logbuch-Renderer.
// Ausgelagert aus admin/bookings.html (04.06.2026), genutzt von bookings/customers/trainers + trainer-portal.
// Voraussetzung: formatDateTime/formatDate/formatEuro (auth-guard.js bzw. auth-check.js) + STATUS_LABELS (shared/constants.js) sind vorher geladen.

  const AUDIT_BOOKING_ACTIONS = {
    created:                            { icon: '🆕', label: 'Buchung erstellt' },
    confirmed:                          { icon: '✅', label: 'Vom Trainer bestaetigt' },
    rescheduled:                        { icon: '📅', label: 'Termin verschoben' },
    location_changed:                   { icon: '📍', label: 'Treffpunkt geaendert' },
    check_in:                           { icon: '🟢', label: 'Check-in beim Trainer' },
    check_out:                          { icon: '🏁', label: 'Check-out beim Trainer' },
    completed:                          { icon: '✔️', label: 'Training abgeschlossen' },
    cancelled:                          { icon: '❌', label: 'Storniert' },
    escalated:                          { icon: '⚠️', label: 'Auf strittig gesetzt' },
    sorry_code_issued:                  { icon: '🎟️', label: 'Entschuldigungs-Code ausgegeben' },
    sorry_code_released:                { icon: '🎟️', label: 'Entschuldigungs-Code freigegeben' },
    replacement_trainer_assigned:       { icon: '🔁', label: 'Ersatz-Trainer zugewiesen' },
    replacement_trainer_search_started: { icon: '🔍', label: 'Suche nach Ersatz-Trainer' },
    storno_invoice_created:             { icon: '📄', label: 'Stornobeleg erstellt' },
    migrated_to_new_status_kanon:       { icon: '🔁', label: 'Status gesetzt' },
    // Teilspec-2 (Bezahl-Mechanik): SetupIntent + Karten-Belastung + Zahlung-offen
    setup_intent_created:               { icon: '💳', label: 'Karte hinterlegt' },
    charge_attempted:                   { icon: '🔄', label: 'Abbuchungs-Versuch gestartet' },
    charge_succeeded:                   { icon: '💳', label: 'Karte erfolgreich belastet' },
    charge_failed_card:                 { icon: '⚠️', label: 'Karte abgelehnt' },
    zahlung_offen_gesetzt:              { icon: '🔔', label: 'Zahlung offen — Markierung gesetzt' },
    zahlung_offen_erinnerung_gesendet:  { icon: '📨', label: 'Erinnerung an Kunde versandt' },
    bar_gemeldet:                       { icon: '💶', label: 'Trainer hat Bar-Eingang gemeldet' },
    bar_verifiziert:                    { icon: '✅', label: 'Admin hat Bar-Eingang verifiziert' },
    offene_forderung_rechnung_gesendet: { icon: '📄', label: 'Rechnung fuer offene Forderung gestellt' },
    // Teilspec-2 (Phase 4 Crons): Checkout-Erinnerung + Auto-Freigabe
    checkout_erinnerung_gesendet:       { icon: '📨', label: 'Checkout-Erinnerung versandt' },
    checkout_auto_freigegeben:          { icon: '🏁', label: 'Checkout automatisch freigegeben' },
    // Logbuch Schritt 1 (Konsolidierung): Admin-Korrekturen/Notiz, Ersatz-Detailschritte, Trainer-Checkout
    admin_note:                         { icon: '📝', label: 'Notiz' },
    admin_field_change:                 { icon: '✏️', label: 'Feld geaendert' },
    manual_paid_set:                    { icon: '✏️', label: 'Bezahlt-Status manuell gesetzt' },
    manual_payout_set:                  { icon: '✏️', label: 'Verguetung manuell gesetzt' },
    manual_admin_added_participant:     { icon: '➕', label: 'Teilnehmer manuell hinzugefuegt' },
    replacement_trainer_accepted:       { icon: '🔁', label: 'Ersatz: Trainer hat zugesagt' },
    replacement_trainer_confirmed:      { icon: '✅', label: 'Ersatz bestaetigt' },
    trainer_checkout:                   { icon: '🏁', label: 'Trainer hat Training abgeschlossen' },
  };
  // Werte stammen aus supabase/functions/_shared/payment-events.ts (PaymentEventAction-Type)
  const AUDIT_PAYMENT_ACTIONS = {
    payment_intent_created:   { icon: '🧾', label: 'Zahlungsauftrag angelegt' },
    payment_succeeded:        { icon: '💳', label: 'Zahlung erfolgreich' },
    payment_failed:           { icon: '⚠️', label: 'Zahlung fehlgeschlagen' },
    payment_captured:         { icon: '💳', label: 'Betrag eingezogen' },
    payment_cancelled:        { icon: '❌', label: 'Zahlungsauftrag abgebrochen' },
    refund_created:           { icon: '↩️', label: 'Rueckerstattung erstellt' },
    refund_failed:            { icon: '⚠️', label: 'Rueckerstattung fehlgeschlagen' },
    transfer_created:         { icon: '💸', label: 'Auszahlung an Trainer angestossen' },
    transfer_reversed:        { icon: '↩️', label: 'Auszahlung zurueckgebucht' },
    transfer_reversal_failed: { icon: '⚠️', label: 'Rueckbuchung Auszahlung fehlgeschlagen' },
    sorry_code_issued:        { icon: '🎟️', label: 'Entschuldigungs-Code ausgegeben' },
    sorry_code_released:      { icon: '🎟️', label: 'Entschuldigungs-Code freigegeben' },
    // Teilspec-2 (Bezahl-Mechanik): SetupIntent + Bar-Geld-Vorgaenge
    setup_intent_created:     { icon: '💳', label: 'Karte hinterlegt' },
    setup_intent_succeeded:   { icon: '💳', label: 'Karte erfolgreich gespeichert' },
    setup_intent_failed:      { icon: '⚠️', label: 'Karte konnte nicht gespeichert werden' },
    cash_payment_reported:    { icon: '💶', label: 'Bar-Meldung vom Trainer' },
    cash_payment_verified:    { icon: '✅', label: 'Bar-Eingang vom Admin verifiziert' },
    cash_payment_settled:     { icon: '🧾', label: 'Bar-Anteil mit Trainer verrechnet' },
  };
  // Werte stammen aus app/supabase/migrations/20260425120000_invoice_audit.sql (CHECK-Constraint)
  const AUDIT_INVOICE_ACTIONS = {
    created:                  { icon: '📄', label: 'Rechnung erstellt' },
    mailed:                   { icon: '📨', label: 'Rechnung per E-Mail versendet' },
    pdf_regenerated:          { icon: '🔄', label: 'PDF neu erzeugt' },
    storno_reference_created: { icon: '🔁', label: 'Stornobeleg verknuepft' },
    admin_viewed:             { icon: '👁️', label: 'Admin hat eingesehen' },
    export_included:          { icon: '📦', label: 'In GoBD-Jahres-Export aufgenommen' },
    anonymized:               { icon: '🔒', label: 'Daten anonymisiert (DSGVO-Loeschung)' },
    admin_override_update:    { icon: '⚠️', label: 'Admin-Override-Update (Immutability umgangen)' },
  };
  // Werte stammen aus cash_payment_audit_action_check (Teilspec-2 Bar-Zahlung)
  const AUDIT_CASH_ACTIONS = {
    gemeldet_durch_trainer:   { icon: '💶', label: 'Trainer hat Bar-Eingang gemeldet' },
    verifiziert_durch_admin:  { icon: '✅', label: 'Admin hat Bar-Eingang verifiziert' },
    verrechnet:               { icon: '🧾', label: 'Bar-Anteil mit Trainer verrechnet' },
    storniert:                { icon: '❌', label: 'Bar-Meldung storniert' },
  };
  // Akteur-Schluessel: Audit-Tabellen schreiben englische Werte (customer/trainer/admin/system),
  // bookings.storno_wer im DB-Schema deutsche Werte (kunde/trainer/admin/system). Beide Welten abdecken.
  const AUDIT_ACTORS = {
    customer: 'Kunde', kunde: 'Kunde',
    trainer: 'Trainer', admin: 'Admin', system: 'System',
  };

  // XSS-sicheres Escapen fuer Details-JSON + Strings aus DB
  function auditEscape(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Status-Code zu Klartext-Label (greift auf shared/constants.js STATUS_LABELS zu)
  function auditStatusLabel(code) {
    if (!code) return '';
    if (typeof STATUS_LABELS !== 'undefined' && STATUS_LABELS[code]) return STATUS_LABELS[code];
    return code;
  }

  // Details-JSON in Klartext-Saetze umformen, je nach Aktion
  function formatAuditDetails(kind, action, details) {
    if (!details || typeof details !== 'object') return '';
    const d = details;
    const parts = [];
    const eur = c => (c == null ? null : formatEuro(c));

    if (kind === 'booking') {
      if (action === 'migrated_to_new_status_kanon') {
        if (d.new_status) parts.push('Neuer Status: <strong>' + auditEscape(auditStatusLabel(d.new_status)) + '</strong>');
        if (d.old_status) parts.push('vorher: ' + auditEscape(auditStatusLabel(d.old_status)));
        // Migrations-Phase nicht mehr anzeigen — interne Info, hilft dem Admin nicht
      } else if (action === 'created') {
        if (d.art === 'pt_einzel') parts.push('Personal Training');
        else if (d.art === 'gt_teilnahme') parts.push('Gruppentraining');
        if (d.scheduled_date) parts.push('Termin: ' + auditEscape(d.scheduled_date) + (d.scheduled_time ? ' ' + auditEscape(d.scheduled_time) : ''));
        if (d.price_cents != null) parts.push('Preis: ' + auditEscape(eur(d.price_cents)));
        if (d.discount_code) parts.push('Rabatt-Code: ' + auditEscape(d.discount_code));
      } else if (action === 'cancelled') {
        if (d.storno_wer) parts.push('Veranlasst durch: ' + auditEscape(AUDIT_ACTORS[d.storno_wer] || d.storno_wer));
        if (d.storno_grund) parts.push('Grund: ' + auditEscape(d.storno_grund));
        if (d.refund_cents != null) parts.push('Rueckerstattung: ' + auditEscape(eur(d.refund_cents)));
      } else if (action === 'escalated') {
        if (d.reason || d.grund) parts.push('Grund: ' + auditEscape(d.reason || d.grund));
      } else if (action === 'rescheduled') {
        if (d.old_date) parts.push('alt: ' + auditEscape(formatDate(d.old_date)) + (d.old_time ? ' ' + auditEscape(d.old_time) : ''));
        if (d.new_date) parts.push('neu: ' + auditEscape(formatDate(d.new_date)) + (d.new_time ? ' ' + auditEscape(d.new_time) : ''));
      } else if (action === 'location_changed') {
        if (d.old_location) parts.push('alt: ' + auditEscape(d.old_location));
        if (d.new_location) parts.push('neu: ' + auditEscape(d.new_location));
      } else if (action === 'storno_invoice_created') {
        const ref = d.invoice_number || d.storno_ref || d.invoice_id;
        if (ref) parts.push('Stornobeleg: <strong>' + auditEscape(ref) + '</strong>');
        if (d.refund_cents != null) parts.push('Betrag: ' + auditEscape(eur(d.refund_cents)));
      } else if (action === 'sorry_code_issued' || action === 'sorry_code_released') {
        if (d.code) parts.push('Code: <strong>' + auditEscape(d.code) + '</strong>');
        if (d.discount_percent != null) parts.push(auditEscape(d.discount_percent) + ' % Rabatt');
      } else if (action === 'replacement_trainer_assigned') {
        // Name bevorzugt (ab Fix B-2026-06-02-09 mitgeschrieben), Fallback UUID-Snippet.
        if (d.new_trainer_name) parts.push('Neuer Trainer: <strong>' + auditEscape(d.new_trainer_name) + '</strong>');
        else if (d.new_trainer_id) parts.push('Neuer Trainer: ' + auditEscape(String(d.new_trainer_id).slice(0, 8)) + '…');
        if (d.old_trainer_id) parts.push('(vorher: ' + auditEscape(String(d.old_trainer_id).slice(0, 8)) + '…)');
      } else if (action === 'check_in' || action === 'check_out') {
        if (d.at) parts.push('Zeitpunkt: ' + auditEscape(formatDateTime(d.at)));
      } else if (action === 'trainer_checkout') {
        if (d.trainer_checked_out_at) parts.push('Zeitpunkt: ' + auditEscape(formatDateTime(d.trainer_checked_out_at)));
      } else if (action === 'admin_note') {
        // No-Show Teil 3: Streitfall-Entscheidung wird als admin_note mit
        // no_show_outcome geschrieben — als klare Entscheidung darstellen.
        if (d.no_show_outcome) {
          const nsLabel = {
            trainer_nicht_da: 'Trainer war nicht da (Kunde erstattet)',
            kunde_nicht_da: 'Kunde war nicht da (Kunde zahlt)',
            training_fand_statt: 'Training fand doch statt (regulär abgeschlossen)',
          }[d.no_show_outcome] || d.no_show_outcome;
          parts.push('Entscheidung: <strong>' + auditEscape(nsLabel) + '</strong>');
        }
        if (d.note) parts.push('Notiz: ' + auditEscape(d.note));
      } else if (action === 'admin_field_change') {
        // Zwei Detail-Formen: Status-only {field,from,to} ODER Geld/Termin {changed_fields,...}
        if (d.field === 'status') {
          if (d.from) parts.push('Status vorher: ' + auditEscape(auditStatusLabel(d.from)));
          if (d.to) parts.push('Status neu: ' + auditEscape(auditStatusLabel(d.to)));
        } else if (Array.isArray(d.changed_fields) && d.changed_fields.length) {
          parts.push('Geaenderte Felder: ' + auditEscape(d.changed_fields.join(', ')));
        }
        if (d.admin_note) parts.push('Notiz: ' + auditEscape(d.admin_note));
      } else if (action === 'manual_paid_set' || action === 'manual_payout_set' || action === 'manual_admin_added_participant') {
        if (d.admin_note) parts.push('Notiz: ' + auditEscape(d.admin_note));
      } else if (action === 'replacement_trainer_accepted') {
        if (d.trainer_id) parts.push('Trainer: ' + auditEscape(String(d.trainer_id).slice(0, 8)) + '…');
      } else if (action === 'replacement_trainer_confirmed') {
        if (d.new_trainer_id) parts.push('Neuer Trainer: ' + auditEscape(String(d.new_trainer_id).slice(0, 8)) + '…');
      }
    } else if (kind === 'payment') {
      if (d.reason) parts.push('Grund: ' + auditEscape(d.reason));
      if (d.failure_message) parts.push('Fehler: ' + auditEscape(d.failure_message));
      if (d.refund_id) parts.push('Refund-ID: <code style="font-size:11px">' + auditEscape(d.refund_id) + '</code>');
      if (d.payment_intent_id) parts.push('PaymentIntent: <code style="font-size:11px">' + auditEscape(d.payment_intent_id) + '</code>');
      if (d.transfer_id) parts.push('Transfer: <code style="font-size:11px">' + auditEscape(d.transfer_id) + '</code>');
    } else if (kind === 'invoice') {
      if (d.invoice_number) parts.push('Rechnungs-Nr: <strong>' + auditEscape(d.invoice_number) + '</strong>');
      if (d.total_cents != null) parts.push('Summe: ' + auditEscape(eur(d.total_cents)));
      if (d.recipient_email) parts.push('an: ' + auditEscape(d.recipient_email));
      if (d.field) parts.push('Geaendertes Feld: ' + auditEscape(d.field));
      if (d.blocked_reason) parts.push('Block-Grund: ' + auditEscape(d.blocked_reason));
    } else if (kind === 'cash') {
      // cash_payment_audit-Detail-Felder (Spalten + details-jsonb)
      if (d.pulsly_anteil_cents != null) parts.push('Pulsly-Anteil: ' + auditEscape(eur(d.pulsly_anteil_cents)));
      if (d.trainer_anteil_cents != null) parts.push('Trainer-Anteil: ' + auditEscape(eur(d.trainer_anteil_cents)));
      if (d.admin_override === true) parts.push('Admin-Override');
      if (d.note) parts.push('Notiz: ' + auditEscape(d.note));
      if (d.reason) parts.push('Grund: ' + auditEscape(d.reason));
    }

    return parts.join(' · ');
  }

  function renderAuditEntry(e) {
    let map = null, kindLabel = '';
    if (e.kind === 'booking') { map = AUDIT_BOOKING_ACTIONS; kindLabel = 'Buchung'; }
    if (e.kind === 'payment') { map = AUDIT_PAYMENT_ACTIONS; kindLabel = 'Zahlung'; }
    if (e.kind === 'invoice') { map = AUDIT_INVOICE_ACTIONS; kindLabel = 'Rechnung'; }
    if (e.kind === 'cash')    { map = AUDIT_CASH_ACTIONS;    kindLabel = 'Bar-Zahlung'; }
    let meta = (map && map[e.action]) || { icon: '•', label: e.action || '(unbekannte Aktion)' };
    // No-Show Teil 3: Streitfall-Entscheidung (admin_note + no_show_outcome) klar betiteln
    // statt generisch "Notiz".
    if (e.kind === 'booking' && e.action === 'admin_note' && e.details && e.details.no_show_outcome) {
      meta = { icon: '⚖️', label: 'Streitfall entschieden' };
    }
    const actor = AUDIT_ACTORS[e.actor_type] || (e.actor_type || 'unbekannt');

    let context = '';
    if (e.kind === 'payment') {
      if (e.amount_cents != null) context += ' · ' + auditEscape(formatEuro(e.amount_cents));
      if (e.stripe_object_id) context += ' · <code style="font-size:11px">' + auditEscape(e.stripe_object_id) + '</code>';
    } else if (e.kind === 'invoice' && e.invoice_label) {
      context += ' · <strong>' + auditEscape(e.invoice_label) + '</strong>';
    } else if (e.kind === 'cash') {
      if (e.amount_cents != null) context += ' · ' + auditEscape(formatEuro(e.amount_cents));
    }

    if (e.booking_ref && e.booking_ref.date) {
      const artLabel = e.booking_ref.art === 'gt_teilnahme' ? 'Gruppe' : 'Einzel';
      context += ' · <span class="text-secondary">Buchung ' + auditEscape(formatDate(e.booking_ref.date)) + ' (' + artLabel + ')</span>';
    }

    // Klartext-Zusammenfassung der Details (immer sichtbar)
    const klartext = formatAuditDetails(e.kind, e.action, e.details);
    const klartextHtml = klartext
      ? '<div class="text-secondary mt-1" style="font-size:12px">' + klartext + '</div>'
      : '';

    // Bei Buchungs-Eintraegen ist der kindLabel ("Buchung") redundant — der Kontext ist klar.
    // Bei Zahlung/Rechnung zeigt der kindLabel, woher der Eintrag stammt, das hilft.
    const actorSuffix = (e.kind === 'booking')
      ? ' <span class="text-secondary" style="font-size:12px">durch ' + auditEscape(actor) + '</span>'
      : ' <span class="text-secondary" style="font-size:12px">(' + auditEscape(kindLabel) + ' · ' + auditEscape(actor) + ')</span>';

    return '<div class="d-flex gap-3 mb-3">'
      + '<div class="text-secondary" style="font-size:12px;min-width:130px">' + auditEscape(formatDateTime(e.at)) + '</div>'
      + '<div style="flex:1">'
      +   '<span style="margin-right:6px">' + meta.icon + '</span>'
      +   '<strong>' + auditEscape(meta.label) + '</strong>'
      +   actorSuffix
      +   context
      +   klartextHtml
      + '</div>'
      + '</div>';
  }
