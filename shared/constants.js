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
 *
 * Teilspec 1 (26.04.2026) — Bruecken-Migration:
 * Der neue 7-Status-Kanon (angefragt, reserviert, bestaetigt, laeuft gerade,
 * abgeschlossen, storniert, strittig) wird ADDITIV ergaenzt. Die alten Status
 * (pending, confirmed, ...) bleiben weiter im Code, bis Tasks 15+16 die
 * Aufrufer-Stellen schrittweise auf den neuen Kanon umgestellt haben.
 */

// ─── Booking Status Werte ──────────────────────────────────────────────────

const BOOKING_STATUS = Object.freeze({
  // Alter Status-Kanon (heute live im Portal-Code, bleibt bis Tasks 15+16)
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
  LOCATION_PROPOSED:    'location_proposed',
  AWAITING_CHECKOUT:    'awaiting_checkout',

  // Teilspec 2: Pseudo-Status aus der Backend-Bridge (kein DB-CHECK-Wert).
  // Wird vom Server geliefert wenn status='bestaetigt' UND flag_zahlung_offen=true.
  // mapStatusForDb erkennt diesen Wert und schreibt bestaetigt + Flag in die DB zurueck.
  PAYMENT_OPEN:         'payment_open',

  // Neuer 7-Status-Kanon (Teilspec 1, ARCHITEKTUR.md Ebene 2)
  ANGEFRAGT:      'angefragt',
  RESERVIERT:     'reserviert',
  BESTAETIGT:     'bestaetigt',
  LAEUFT_GERADE:  'laeuft gerade',
  ABGESCHLOSSEN:  'abgeschlossen',
  STORNIERT:      'storniert',
  STRITTIG:       'strittig',
});

// ─── Buchungsart (Teilspec 1) ─────────────────────────────────────────────

/** Art der Buchung. PT = Personal Training, GT = Gruppentraining. */
const BOOKING_ART = Object.freeze({
  PT_EINZEL:    'pt_einzel',
  GT_TEILNAHME: 'gt_teilnahme',
});

// ─── Buchungs-Flags (Teilspec 1, Zustands-Zusatzmerkmale) ─────────────────

const BOOKING_FLAGS = Object.freeze({
  NEUER_TERMIN_VORGESCHLAGEN:       'flag_neuer_termin_vorgeschlagen',
  NEUER_ORT_VORGESCHLAGEN:          'flag_neuer_ort_vorgeschlagen',
  ERSATZ_TRAINER_GESUCHT:           'flag_ersatz_trainer_gesucht',
  CHECKOUT_BESTAETIGUNG_AUSSTEHEND: 'flag_checkout_bestaetigung_ausstehend',
  ZAHLUNG_OFFEN:                    'flag_zahlung_offen', // Teilspec 2
});

// ─── Storno-Verursacher (Teilspec 1) ──────────────────────────────────────

const STORNO_WER = Object.freeze({
  KUNDE:   'kunde',
  TRAINER: 'trainer',
  SYSTEM:  'system',
  ADMIN:   'admin',
});

// ─── Status Labels (deutsch) fuer Portal-Anzeige ───────────────────────────

const STATUS_LABELS = Object.freeze({
  // Alter Kanon
  [BOOKING_STATUS.PENDING]:              'Anfrage',
  [BOOKING_STATUS.CONFIRMED]:            'Bestätigt',
  [BOOKING_STATUS.CHECKED_IN]:           'Eingecheckt',
  [BOOKING_STATUS.CHECKED_IN_TRAINER]:   'Trainer eingecheckt',
  [BOOKING_STATUS.PENDING_CUSTOMER]:     'Warte auf Kunde',
  [BOOKING_STATUS.REVIEWING]:            'Wird bewertet',
  [BOOKING_STATUS.COMPLETED]:            'Abgeschlossen',
  [BOOKING_STATUS.PAID]:                 'Bezahlt',
  [BOOKING_STATUS.CANCELLED]:            'Storniert',
  [BOOKING_STATUS.CANCELLED_BY_TRAINER]: '⚠ Trainer abgesagt',
  [BOOKING_STATUS.REFUNDED]:             'Erstattet',
  [BOOKING_STATUS.REJECTED]:             'Abgelehnt',
  [BOOKING_STATUS.EXPIRED]:              'Abgelaufen',
  [BOOKING_STATUS.DISPUTED]:             '⚠ Streitfall',
  [BOOKING_STATUS.ESCALATED]:            '⚠ Eskaliert',
  [BOOKING_STATUS.MANUALLY_APPROVED]:    'Manuell genehmigt',
  [BOOKING_STATUS.FULLY_CANCELLED]:      'Vollständig storniert',
  [BOOKING_STATUS.FINDING_REPLACEMENT]:  'Suche Ersatztrainer',
  [BOOKING_STATUS.REPLACEMENT_FOUND]:    'Ersatztrainer gefunden',
  [BOOKING_STATUS.REPLACEMENT_PENDING]:  'Warte auf Ersatztrainer',
  [BOOKING_STATUS.BOOKED]:               'Gebucht',
  [BOOKING_STATUS.RESCHEDULE_PROPOSED]:  'Terminänderung vorgeschlagen',
  [BOOKING_STATUS.LOCATION_PROPOSED]:    'Treffpunkt vorgeschlagen',
  [BOOKING_STATUS.AWAITING_CHECKOUT]:    'Warte auf Abschluss',
  [BOOKING_STATUS.PAYMENT_OPEN]:         'Karte abgelehnt — offen', // Teilspec 2

  // Neuer Kanon
  [BOOKING_STATUS.ANGEFRAGT]:     'Angefragt',
  [BOOKING_STATUS.RESERVIERT]:    'Reserviert',
  [BOOKING_STATUS.BESTAETIGT]:    'Bestätigt',
  [BOOKING_STATUS.LAEUFT_GERADE]: 'Läuft gerade',
  [BOOKING_STATUS.ABGESCHLOSSEN]: 'Abgeschlossen',
  [BOOKING_STATUS.STORNIERT]:     'Storniert',
  [BOOKING_STATUS.STRITTIG]:      '⚠ Strittig',
});

// ─── Status Badge CSS-Klassen ──────────────────────────────────────────────

const STATUS_BADGE_CLASS = Object.freeze({
  // Alter Kanon
  [BOOKING_STATUS.PENDING]:              'badge-pending',
  [BOOKING_STATUS.CONFIRMED]:            'badge-confirmed',
  [BOOKING_STATUS.CHECKED_IN]:           'badge-confirmed',
  [BOOKING_STATUS.CHECKED_IN_TRAINER]:   'badge-confirmed',
  [BOOKING_STATUS.PENDING_CUSTOMER]:     'badge-pending',
  [BOOKING_STATUS.REVIEWING]:            'badge-pending',
  [BOOKING_STATUS.COMPLETED]:            'badge-completed',
  [BOOKING_STATUS.PAID]:                 'badge-completed',
  [BOOKING_STATUS.CANCELLED]:            'badge-cancelled',
  [BOOKING_STATUS.CANCELLED_BY_TRAINER]: 'badge-action-needed',
  [BOOKING_STATUS.REFUNDED]:             'badge-cancelled',
  [BOOKING_STATUS.REJECTED]:             'badge-cancelled',
  [BOOKING_STATUS.EXPIRED]:              'badge-expired',
  [BOOKING_STATUS.DISPUTED]:             'badge-action-needed',
  [BOOKING_STATUS.ESCALATED]:            'badge-action-needed',
  [BOOKING_STATUS.MANUALLY_APPROVED]:    'badge-confirmed',
  [BOOKING_STATUS.FULLY_CANCELLED]:      'badge-cancelled-done',
  [BOOKING_STATUS.FINDING_REPLACEMENT]:  'badge-pending',
  [BOOKING_STATUS.REPLACEMENT_FOUND]:    'badge-confirmed',
  [BOOKING_STATUS.REPLACEMENT_PENDING]:  'badge-pending',
  [BOOKING_STATUS.BOOKED]:               'badge-pending',
  [BOOKING_STATUS.RESCHEDULE_PROPOSED]:  'badge-pending',
  [BOOKING_STATUS.LOCATION_PROPOSED]:    'badge-warning',
  [BOOKING_STATUS.AWAITING_CHECKOUT]:    'badge-warning',
  // Teilspec 2 — gleiche Semantik wie CANCELLED_BY_TRAINER/DISPUTED/ESCALATED:
  // Admin muss eingreifen. 'badge-action-needed' ist in shared/tabler-custom.css definiert.
  [BOOKING_STATUS.PAYMENT_OPEN]:         'badge-action-needed',

  // Neuer Kanon
  [BOOKING_STATUS.ANGEFRAGT]:     'badge-pending',
  [BOOKING_STATUS.RESERVIERT]:    'badge-pending',
  [BOOKING_STATUS.BESTAETIGT]:    'badge-confirmed',
  [BOOKING_STATUS.LAEUFT_GERADE]: 'badge-confirmed',
  [BOOKING_STATUS.ABGESCHLOSSEN]: 'badge-completed',
  [BOOKING_STATUS.STORNIERT]:     'badge-cancelled',
  [BOOKING_STATUS.STRITTIG]:      'badge-action-needed',
});

// ─── Status-Gruppen ────────────────────────────────────────────────────────

/** Stornierte Status-Werte (Umsatz = 0) */
const CANCELLED_STATUSES = Object.freeze([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.CANCELLED_BY_TRAINER,
  BOOKING_STATUS.REFUNDED,
  BOOKING_STATUS.FULLY_CANCELLED,
  BOOKING_STATUS.STORNIERT, // neuer Kanon
]);

/** Aktive Status-Werte (Termin steht noch bevor) */
const ACTIVE_STATUSES = Object.freeze([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.CHECKED_IN,
  BOOKING_STATUS.CHECKED_IN_TRAINER,
  BOOKING_STATUS.PENDING_CUSTOMER,
  BOOKING_STATUS.RESCHEDULE_PROPOSED,
  BOOKING_STATUS.LOCATION_PROPOSED,
  BOOKING_STATUS.AWAITING_CHECKOUT,
  BOOKING_STATUS.PAYMENT_OPEN,  // Teilspec 2: Karte abgelehnt = Buchung steht noch bevor, nur Zahlung offen
  BOOKING_STATUS.ANGEFRAGT,     // neuer Kanon
  BOOKING_STATUS.RESERVIERT,    // neuer Kanon
  BOOKING_STATUS.BESTAETIGT,    // neuer Kanon
  BOOKING_STATUS.LAEUFT_GERADE, // neuer Kanon
]);

/** Abgeschlossene Status-Werte */
const COMPLETED_STATUSES = Object.freeze([
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.PAID,
  BOOKING_STATUS.REVIEWING,
  BOOKING_STATUS.ABGESCHLOSSEN, // neuer Kanon
]);

/** Eskalierte / strittige Status-Werte (Admin-Entscheidung erforderlich) */
const ESCALATED_STATUSES = Object.freeze([
  BOOKING_STATUS.DISPUTED,
  BOOKING_STATUS.ESCALATED,
  BOOKING_STATUS.STRITTIG, // neuer Kanon
]);

// ─── Booking Flow Definitionen ─────────────────────────────────────────────

/** Normaler Buchungsablauf (alter Kanon) */
const BOOKING_FLOW_NORMAL = Object.freeze([
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.CHECKED_IN_TRAINER,
  BOOKING_STATUS.PENDING_CUSTOMER,
  BOOKING_STATUS.REVIEWING,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.AWAITING_CHECKOUT,
  BOOKING_STATUS.PAID,
]);

/** Normaler Buchungsablauf (neuer Kanon) */
const BOOKING_FLOW_NORMAL_NEU = Object.freeze([
  BOOKING_STATUS.ANGEFRAGT,
  BOOKING_STATUS.BESTAETIGT,
  BOOKING_STATUS.LAEUFT_GERADE,
  BOOKING_STATUS.ABGESCHLOSSEN,
]);

/** Abbruch-Flow (alter Kanon) */
const BOOKING_FLOW_CANCEL = Object.freeze([
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.CANCELLED_BY_TRAINER,
  BOOKING_STATUS.REJECTED,
  BOOKING_STATUS.FULLY_CANCELLED,
]);

/** Eskalations-Flow (alter Kanon) */
const BOOKING_FLOW_ESCALATION = Object.freeze([
  BOOKING_STATUS.DISPUTED,
  BOOKING_STATUS.ESCALATED,
  BOOKING_STATUS.MANUALLY_APPROVED,
]);

const BOOKING_FLOW = Object.freeze({
  normal:     BOOKING_FLOW_NORMAL,
  normalNeu:  BOOKING_FLOW_NORMAL_NEU,
  cancel:     BOOKING_FLOW_CANCEL,
  escalation: BOOKING_FLOW_ESCALATION,
});

// ─── Admin Status-Dropdown Optionen ────────────────────────────────────────

/** Status-Werte die im Admin-Detail-Modal als Dropdown erscheinen.
 *  Teilspec 2: PAYMENT_OPEN ist bewusst NICHT enthalten — der Pseudo-Status
 *  wird aus dem Flag berechnet (mapStatusForFrontend) und gehoert nicht ins
 *  Admin-Dropdown. Die spezialisierte Admin-Seite fuer offene Zahlungen
 *  (Task 27) liefert das Bedien-UI. */
const ADMIN_EDITABLE_STATUSES = Object.freeze([
  // Alter Kanon
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
  BOOKING_STATUS.LOCATION_PROPOSED,
  BOOKING_STATUS.AWAITING_CHECKOUT,
  BOOKING_STATUS.FINDING_REPLACEMENT,
  BOOKING_STATUS.REPLACEMENT_PENDING,
  BOOKING_STATUS.REPLACEMENT_FOUND,
  // Neuer Kanon
  BOOKING_STATUS.ANGEFRAGT,
  BOOKING_STATUS.RESERVIERT,
  BOOKING_STATUS.BESTAETIGT,
  BOOKING_STATUS.LAEUFT_GERADE,
  BOOKING_STATUS.ABGESCHLOSSEN,
  BOOKING_STATUS.STORNIERT,
  BOOKING_STATUS.STRITTIG,
]);

// ─── Überfällig-Erkennung ─────────────────────────────────────────────────

function isOverdue(booking) {
  if (!booking.scheduled_date) return false;
  const ACTIVE = [
    'pending', 'confirmed', 'checked_in_trainer', 'checked_in',
    'angefragt', 'reserviert', 'bestaetigt', 'laeuft gerade',
  ];
  if (!ACTIVE.includes(booking.status)) return false;
  const scheduled = new Date(booking.scheduled_date + 'T23:59:59');
  return scheduled < new Date();
}

function overdueDays(booking) {
  if (!booking.scheduled_date) return 0;
  const scheduled = new Date(booking.scheduled_date);
  const now = new Date();
  return Math.floor((now - scheduled) / (1000 * 60 * 60 * 24));
}

// ─── Optional: Node/Test-Export (Browser ignoriert das) ───────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOOKING_STATUS,
    BOOKING_ART,
    BOOKING_FLAGS,
    STORNO_WER,
    STATUS_LABELS,
    STATUS_BADGE_CLASS,
    CANCELLED_STATUSES,
    ACTIVE_STATUSES,
    COMPLETED_STATUSES,
    ESCALATED_STATUSES,
    BOOKING_FLOW_NORMAL,
    BOOKING_FLOW_NORMAL_NEU,
    BOOKING_FLOW_CANCEL,
    BOOKING_FLOW_ESCALATION,
    BOOKING_FLOW,
    ADMIN_EDITABLE_STATUSES,
    isOverdue,
    overdueDays,
  };
}
