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
  // kundeBezahlt: bool | trainerAuszahlung: 'ausgezahlt' | 'gesperrt' | 'offen'
  function geldStaende(b) {
    b = b || {};
    var strittig = ['strittig', 'disputed', 'escalated'].indexOf(b.status) !== -1;
    var trainerAuszahlung;
    if (b.trainer_paid_out_at) trainerAuszahlung = 'ausgezahlt';
    else if (strittig) trainerAuszahlung = 'gesperrt';
    else trainerAuszahlung = 'offen';
    return {
      kundeBezahlt: !!b.paid,
      kundeBetragCents: b.final_price_cents != null ? b.final_price_cents : (b.price_cents || 0),
      trainerAuszahlung: trainerAuszahlung,
      trainerBetragCents: b.trainer_payout_cents || 0
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
