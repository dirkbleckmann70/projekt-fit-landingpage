// No-Show Teil 3 — reine Hilfsfunktionen fuer den Klaerungsfall-Tab.
// UMD: im Browser als window.fmtFristRest / window.geldStaende, im Node-Test via require().
(function (global) {
  'use strict';

  // Restzeit bis zur Frist als "X Std Y Min" bzw. "abgelaufen".
  // deadline + now sind Date-Objekte (oder ISO-Strings).
  function fmtFristRest(deadline, now) {
    if (!deadline) return '–';   // keine Frist gesetzt -> NICHT "abgelaufen"
    var d = deadline instanceof Date ? deadline : new Date(deadline);
    var n = now instanceof Date ? now : new Date(now);
    var ms = d.getTime() - n.getTime();
    if (isNaN(ms)) return '–';
    if (ms <= 0) return 'abgelaufen';
    var totalMin = Math.floor(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return h + ' Std ' + m + ' Min';
  }

  // Leitet die getrennten Geld-Staende aus dem Buchungsobjekt ab.
  // kundeBezahlt: bool | trainerAuszahlung: 'ausgezahlt' | 'gesperrt' | 'faellig' | 'entfaellt' | 'offen'
  //   entfaellt  = storniert/abgebrochen -> kein Honorar (Training fand nicht statt)
  //   ausgezahlt = trainer_paid_out_at gesetzt
  //   gesperrt   = Streitfall offen (strittig/disputed/escalated)
  //   faellig    = abgeschlossen + bezahlt, aber noch nicht ausgezahlt -> laeuft ueber die
  //                regulaere Frist (default 48h ab completed_at). auszahlungFaelligAt = wann.
  //   offen      = alles andere (noch nicht abgeschlossen)
  // graceHours: Frist-Stunden (company_settings.trainer_payout_grace_hours, Default 48).
  function geldStaende(b, graceHours) {
    b = b || {};
    var stunden = (graceHours == null) ? 48 : graceHours;
    var strittig = ['strittig', 'disputed', 'escalated'].indexOf(b.status) !== -1;
    var abgeschlossen = ['abgeschlossen', 'completed'].indexOf(b.status) !== -1;
    // B-2026-06-18-05: storniert/abgebrochen (No-Show Kunde, Storno, abgelehnt,
    // abgelaufen) -> Trainer-Auszahlung ENTFAELLT (das Training fand nicht statt,
    // ARCHITEKTUR.md "Trainer bekommt nie Honorar fuer ein nicht stattgefundenes
    // Training"). NICHT 'offen' (das suggeriert eine ausstehende Zahlung, die nie
    // kommt -> "Offen 45 EUR"). Deckt DB-Rohwert ('storniert') UND den von
    // api/admin gemappten Frontend-Wert ('cancelled' etc.) ab.
    var storniert = ['storniert', 'cancelled', 'cancelled_by_trainer',
      'fully_cancelled', 'expired', 'rejected'].indexOf(b.status) !== -1;
    var trainerAuszahlung;
    var auszahlungFaelligAt = null;
    if (b.trainer_paid_out_at) {
      trainerAuszahlung = 'ausgezahlt';
    } else if (strittig) {
      trainerAuszahlung = 'gesperrt';
    } else if (abgeschlossen && b.paid) {
      trainerAuszahlung = 'faellig';
      if (b.completed_at) {
        auszahlungFaelligAt = new Date(new Date(b.completed_at).getTime() + stunden * 3600000).toISOString();
      }
    } else if (storniert) {
      trainerAuszahlung = 'entfaellt';
    } else {
      trainerAuszahlung = 'offen';
    }
    return {
      kundeBezahlt: !!b.paid,
      kundeBetragCents: b.final_price_cents != null ? b.final_price_cents : (b.price_cents || 0),
      trainerAuszahlung: trainerAuszahlung,
      // Bei 'entfaellt' 0 EUR ausweisen (kein Honorar) statt des Honorarsatzes.
      trainerBetragCents: trainerAuszahlung === 'entfaellt' ? 0 : (b.trainer_payout_cents || 0),
      auszahlungFaelligAt: auszahlungFaelligAt
    };
  }

  var api = { fmtFristRest: fmtFristRest, geldStaende: geldStaende };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.fmtFristRest = fmtFristRest;
    global.geldStaende = geldStaende;
  }
})(typeof window !== 'undefined' ? window : globalThis);
