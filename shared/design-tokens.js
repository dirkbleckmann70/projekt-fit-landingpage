/**
 * ProjektFit / Pulsly — Zentrale Design-Tokens
 * Eingebunden in alle Portal-Seiten via <script src="../shared/design-tokens.js"></script>
 *
 * window.DESIGN ist die einzige Quelle für Farben, Status-Badges, Knopf-Klassen und Modal-Größen.
 * Nirgendwo sonst dürfen diese Werte hardcodiert werden.
 */

(function () {
  'use strict';

  // ─── Hintergrundfarben ────────────────────────────────────────────────────
  const BG = {
    BG_PAGE:   '#f8fafc',
    BG_CARD:   '#ffffff',
    BG_ACTIVE: '#f0fdf4',
  };

  // ─── Akzentfarben ─────────────────────────────────────────────────────────
  const ACCENT = {
    ACCENT_GREEN:  '#4ADE80',
    ACCENT_ORANGE: '#FB923C',
  };

  // ─── Status-Definitionen ──────────────────────────────────────────────────
  const STATUS = {
    pending:              { bg: '#fff7ed', text: '#ea580c', label: 'Offen' },
    confirmed:            { bg: '#f0fdf4', text: '#16a34a', label: 'Bestätigt' },
    completed:            { bg: '#eff6ff', text: '#0369a1', label: 'Erledigt' },
    cancelled:            { bg: '#fef2f2', text: '#dc2626', label: 'Storniert' },
    expired:              { bg: '#f1f5f9', text: '#64748b', label: 'Abgelaufen' },
    reschedule_proposed:  { bg: '#faf5ff', text: '#7c3aed', label: 'Umbuchen' },
    location_proposed:    { bg: '#faf5ff', text: '#7c3aed', label: 'Neuer Ort' },
    disputed:             { bg: '#fef2f2', text: '#dc2626', label: 'Strittig' },
    checked_in:           { bg: '#f0fdf4', text: '#16a34a', label: 'Eingecheckt' },
    awaiting_checkout:    { bg: '#fff7ed', text: '#ea580c', label: 'Checkout offen' },
    rejected:             { bg: '#fef2f2', text: '#dc2626', label: 'Abgelehnt' },
    cancelled_by_trainer: { bg: '#fef2f2', text: '#dc2626', label: 'Trainer-Absage' },
    finding_replacement:  { bg: '#fffbeb', text: '#b45309', label: 'Ersatz gesucht' },
  };

  /**
   * badge(status) → HTML-String mit passendem Status-Kennzeichen.
   * Unbekannte Status erhalten ein neutrales graues Kennzeichen.
   * @param {string} status
   * @returns {string}
   */
  function badge(status) {
    const def = STATUS[status] || { bg: '#f1f5f9', text: '#64748b', label: status || '–' };
    return `<span class="pf-badge" style="background:${def.bg};color:${def.text}">${def.label}</span>`;
  }

  // ─── Knopf-Klassen ────────────────────────────────────────────────────────
  const BTN = {
    primary: 'pf-btn pf-btn-primary',
    danger:  'pf-btn pf-btn-danger',
    neutral: 'pf-btn pf-btn-neutral',
    edit:    'pf-btn pf-btn-edit',
  };

  // ─── Fenster-Größen ───────────────────────────────────────────────────────
  const MODAL = {
    sm: '600px',
    md: '720px',
    lg: '920px',
  };

  // ─── Nur-lesen-Klasse für Eingabefelder ───────────────────────────────────
  const FIELD_READONLY_CLASS = 'pf-field-readonly';

  // ─── Alles exportieren ────────────────────────────────────────────────────
  window.DESIGN = Object.assign(
    {},
    BG,
    ACCENT,
    {
      STATUS,
      badge,
      BTN,
      MODAL,
      FIELD_READONLY_CLASS,
    }
  );
})();
