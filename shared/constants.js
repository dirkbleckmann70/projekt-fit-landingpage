/**
 * Shared Booking Status Constants
 *
 * Zentrale Status-Definitionen fuer Admin-Portal und Trainer-Portal.
 * Wird als <script src="../shared/constants.js"> VOR den Portal-Scripts geladen.
 *
 * WICHTIG: Die App (E:\Projekte\ProjektFit\app\) nutzt TypeScript mit eigenen
 * Typ-Definitionen in data/bookingTypes.ts (BookingStatus Type + BOOKING_STATUS_CONFIG).
 * Bei Aenderungen hier MUESSEN die App-Typen synchron gehalten werden!
 *
 * Supabase speichert Status-Werte in lowercase. Die App verwendet intern UPPERCASE.
 * Die Portale arbeiten mit lowercase (wie in Supabase).
 */

// ─── Booking Status Werte ──────────────────────────────────────────────────

const BOOKING_STATUS = Object.freeze({
  PENDING:              'pending',
  CONFIRMED:            'confirmed',
  CHECKED_IN:           'checked_in',
  CHECKED_IN_TRAINER:   'checked_in_trainer',
  PENDING_CUSTOMER:     'pending_customer',
  REVIEWING:            'reviewing',
  COMPLETED:            'completed',
  PAID:                 'paid',
  CANCELLED:            'cancelled',
  CANCELLED_BY_TRAINER: 'cancelled_by_trainer',
  REFUNDED:             'refunded',
  REJECTED:             'rejected',
  EXPIRED:              'expired',
  DISPUTED:             'disputed',
  ESCALATED:            'escalated',
  MANUALLY_APPROVED:    'manually_approved',
  FULLY_CANCELLED:      'fully_cancelled',
  FINDING_REPLACEMENT:  'finding_replacement',
  REPLACEMENT_FOUND:    'replacement_found',
  REPLACEMENT_PENDING:  'replacement_pending',
  BOOKED:               'booked',
  RESCHEDULE_PROPOSED:  'reschedule_proposed',
});

// ─── Status Labels (deutsch) fuer Portal-Anzeige ───────────────────────────

const STATUS_LABELS = Object.freeze({
  [BOOKING_STATUS.PENDING]:              'Anfrage',
  [BOOKING_STATUS.CONFIRMED]:            'Bestätigt',
  [BOOKING_STATUS.CHECKED_IN]:           'Eingecheckt',
  [BOOKING_STATUS.CHECKED_IN_TRAINER]:   'Trainer eingecheckt',
  [BOOKING_STATUS.PENDING_CUSTOMER]:     'Warte auf Kunde',
  [BOOKING_STATUS.REVIEWING]:            'Wird bewertet',
  [BOOKING_STATUS.COMPLETED]:            'Abgeschlossen',
  [BOOKING_STATUS.PAID]:                 'Bezahlt',
  [BOOKING_STATUS.CANCELLED]:            'Storniert',
  [BOOKING_STATUS.CANCELLED_BY_TRAINER]: 'Vom Trainer abgesagt',
  [BOOKING_STATUS.REFUNDED]:             'Erstattet',
  [BOOKING_STATUS.REJECTED]:             'Abgelehnt',
  [BOOKING_STATUS.EXPIRED]:              'Abgelaufen',
  [BOOKING_STATUS.DISPUTED]:             'Streitfall',
  [BOOKING_STATUS.ESCALATED]:            'Eskaliert',
  [BOOKING_STATUS.MANUALLY_APPROVED]:    'Manuell genehmigt',
  [BOOKING_STATUS.FULLY_CANCELLED]:      'Vollständig storniert',
  [BOOKING_STATUS.FINDING_REPLACEMENT]:  'Suche Ersatztrainer',
  [BOOKING_STATUS.REPLACEMENT_FOUND]:    'Ersatztrainer gefunden',
  [BOOKING_STATUS.REPLACEMENT_PENDING]:  'Warte auf Ersatztrainer',
  [BOOKING_STATUS.BOOKED]:               'Gebucht',
  [BOOKING_STATUS.RESCHEDULE_PROPOSED]:  'Terminänderung vorgeschlagen',
});

// ─── Status Badge CSS-Klassen ──────────────────────────────────────────────

const STATUS_BADGE_CLASS = Object.freeze({
  [BOOKING_STATUS.PENDING]:              'badge-pending',
  [BOOKING_STATUS.CONFIRMED]:            'badge-confirmed',
  [BOOKING_STATUS.CHECKED_IN]:           'badge-confirmed',
  [BOOKING_STATUS.CHECKED_IN_TRAINER]:   'badge-confirmed',
  [BOOKING_STATUS.PENDING_CUSTOMER]:     'badge-pending',
  [BOOKING_STATUS.REVIEWING]:            'badge-pending',
  [BOOKING_STATUS.COMPLETED]:            'badge-completed',
  [BOOKING_STATUS.PAID]:                 'badge-completed',
  [BOOKING_STATUS.CANCELLED]:            'badge-cancelled',
  [BOOKING_STATUS.CANCELLED_BY_TRAINER]: 'badge-cancelled',
  [BOOKING_STATUS.REFUNDED]:             'badge-cancelled',
  [BOOKING_STATUS.REJECTED]:             'badge-cancelled',
  [BOOKING_STATUS.EXPIRED]:              'badge-expired',
  [BOOKING_STATUS.DISPUTED]:             'badge-cancelled',
  [BOOKING_STATUS.ESCALATED]:            'badge-cancelled',
  [BOOKING_STATUS.MANUALLY_APPROVED]:    'badge-confirmed',
  [BOOKING_STATUS.FULLY_CANCELLED]:      'badge-cancelled',
  [BOOKING_STATUS.FINDING_REPLACEMENT]:  'badge-pending',
  [BOOKING_STATUS.REPLACEMENT_FOUND]:    'badge-confirmed',
  [BOOKING_STATUS.REPLACEMENT_PENDING]:  'badge-pending',
  [BOOKING_STATUS.BOOKED]:               'badge-pending',
  [BOOKING_STATUS.RESCHEDULE_PROPOSED]:  'badge-pending',
});

// ─── Status-Gruppen ────────────────────────────────────────────────────────

/** Stornierte Status-Werte (Umsatz = 0) */
const CANCELLED_STATUSES = Object.freeze([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.CANCELLED_BY_TRAINER,
  BOOKING_STATUS.REFUNDED,
  BOOKING_STATUS.FULLY_CANCELLED,
]);

/** Aktive Status-Werte (Termin steht noch bevor) */
const ACTIVE_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.CHECKED_IN_TRAINER,
  BOOKING_STATUS.PENDING_CUSTOMER,
  BOOKING_STATUS.RESCHEDULE_PROPOSED,
]);

/** Abgeschlossene Status-Werte */
const COMPLETED_STATUSES = Object.freeze([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.PAID,
  BOOKING_STATUS.REVIEWING,
]);

// ─── Booking Flow Definitionen ─────────────────────────────────────────────

/** Normaler Buchungsablauf */
const BOOKING_FLOW_NORMAL = Object.freeze([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.CHECKED_IN_TRAINER,
  BOOKING_STATUS.PENDING_CUSTOMER,
  BOOKING_STATUS.REVIEWING,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.PAID,
]);

/** Abbruch-Flow (von jedem aktiven Status moeglich) */
const BOOKING_FLOW_CANCEL = Object.freeze([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.CANCELLED_BY_TRAINER,
  BOOKING_STATUS.REJECTED,
  BOOKING_STATUS.FULLY_CANCELLED,
]);

/** Eskalations-Flow */
const BOOKING_FLOW_ESCALATION = Object.freeze([
  BOOKING_STATUS.DISPUTED,
  BOOKING_STATUS.ESCALATED,
  BOOKING_STATUS.MANUALLY_APPROVED,
]);

const BOOKING_FLOW = Object.freeze({
  normal:     BOOKING_FLOW_NORMAL,
  cancel:     BOOKING_FLOW_CANCEL,
  escalation: BOOKING_FLOW_ESCALATION,
});

// ─── Admin Status-Dropdown Optionen ────────────────────────────────────────

/** Status-Werte die im Admin-Detail-Modal als Dropdown erscheinen */
const ADMIN_EDITABLE_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.PAID,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.CANCELLED_BY_TRAINER,
  BOOKING_STATUS.EXPIRED,
  BOOKING_STATUS.REJECTED,
  BOOKING_STATUS.DISPUTED,
  BOOKING_STATUS.RESCHEDULE_PROPOSED,
]);
