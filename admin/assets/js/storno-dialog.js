// landingpage/admin/assets/js/storno-dialog.js
// Wiederverwendbarer Storno-Dialog für bookings.html, groups.html, cards.html.
// Benutzung:
//   openStornoDialog({
//     kind: 'booking' | 'group_participant' | 'gt_card',
//     id: 'uuid',
//     title: 'PT-Buchung 24.04.2026 mit Max Mustermann',
//     grossCents: 7900,
//     usedSessions: 3,      // nur gt_card
//     unitPriceCents: 1500, // nur gt_card
//     onSuccess: (result) => { ... }
//   })

(function (global) {
  const DEFAULTS = {
    kunde_rechtzeitig: { fee: true,  sorry: false },
    admin_kulanz:      { fee: false, sorry: false },
    trainer:           { fee: false, sorry: true  },
    fehler:            { fee: false, sorry: false },
    sonstiges:         { fee: false, sorry: false },
  };

  function ensureModal() {
    if (document.getElementById('pf-storno-modal')) return;
    const html = `
      <div class="modal modal-blur fade" id="pf-storno-modal" tabindex="-1">
        <div class="modal-dialog modal-md">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Stornieren</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p id="pf-storno-subject" class="text-muted"></p>
              <div class="mb-3">
                <label class="form-label">Grund</label>
                <select id="pf-storno-reason" class="form-select">
                  <option value="kunde_rechtzeitig">Kunde-Wunsch (rechtzeitig)</option>
                  <option value="admin_kulanz">Kulanz / Admin-Override</option>
                  <option value="trainer">Trainer kann nicht</option>
                  <option value="fehler">Doppelbuchung / Fehler</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Notiz (optional, wird im Audit-Log gespeichert)</label>
                <textarea id="pf-storno-note" class="form-control" rows="2"></textarea>
              </div>
              <div class="form-check mb-2">
                <input type="checkbox" id="pf-storno-fee" class="form-check-input">
                <label class="form-check-label" for="pf-storno-fee">Bearbeitungsgebühr 3% abziehen</label>
              </div>
              <div class="form-check mb-3">
                <input type="checkbox" id="pf-storno-sorry" class="form-check-input">
                <label class="form-check-label" for="pf-storno-sorry">SORRY-Code für nächste Buchung erstellen</label>
              </div>
              <div id="pf-storno-preview" class="p-3 rounded" style="background: rgba(255,255,255,0.04);"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-ghost-secondary" data-bs-dismiss="modal">Abbrechen</button>
              <button type="button" class="btn btn-danger" id="pf-storno-submit">Stornieren</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function fmtEur(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }

  function updatePreview(ctx) {
    const fee = document.getElementById('pf-storno-fee').checked;
    const sorry = document.getElementById('pf-storno-sorry').checked;
    const preview = document.getElementById('pf-storno-preview');
    let refundGross, feeC, refundNet;
    if (ctx.kind === 'gt_card') {
      const usedValue = (ctx.usedSessions ?? 0) * (ctx.unitPriceCents ?? 0);
      refundGross = Math.max(0, ctx.grossCents - usedValue);
      feeC = fee ? Math.round(refundGross * 0.03) : 0;
      refundNet = Math.max(0, refundGross - feeC);
      preview.innerHTML = `
        <div><strong>Kaufpreis</strong>: ${fmtEur(ctx.grossCents)}</div>
        <div><strong>${ctx.usedSessions} Sessions à ${fmtEur(ctx.unitPriceCents)}</strong>: ${fmtEur(usedValue)}</div>
        <div><strong>Restanspruch</strong>: ${fmtEur(refundGross)}</div>
        ${fee ? `<div><strong>Bearbeitungsgebühr 3%</strong>: ${fmtEur(feeC)}</div>` : ''}
        <hr class="my-2">
        <div class="h4"><strong>Rückzahlung: ${fmtEur(refundNet)}</strong></div>
        ${sorry ? '<div class="text-warning mt-2">+ SORRY-Code wird generiert</div>' : ''}`;
    } else {
      refundGross = ctx.grossCents;
      feeC = fee ? Math.round(refundGross * 0.03) : 0;
      refundNet = Math.max(0, refundGross - feeC);
      preview.innerHTML = `
        <div><strong>Ursprungsbetrag</strong>: ${fmtEur(refundGross)}</div>
        ${fee ? `<div><strong>Bearbeitungsgebühr 3%</strong>: ${fmtEur(feeC)}</div>` : ''}
        <hr class="my-2">
        <div class="h4"><strong>Rückzahlung: ${fmtEur(refundNet)}</strong></div>
        ${sorry ? '<div class="text-warning mt-2">+ SORRY-Code wird generiert</div>' : ''}`;
    }
  }

  async function submit(ctx) {
    const btn = document.getElementById('pf-storno-submit');
    btn.disabled = true;
    try {
      const reason = document.getElementById('pf-storno-reason').value;
      const note = document.getElementById('pf-storno-note').value;
      const applyFee = document.getElementById('pf-storno-fee').checked;
      const createSorry = document.getElementById('pf-storno-sorry').checked;

      const payload = {
        reason, actor_type: 'admin', actor_id: null, note,
        apply_processing_fee: applyFee, create_sorry_code: createSorry,
        [ctx.kind === 'gt_card' ? 'gt_card_id' : ctx.kind === 'group_participant' ? 'group_participant_id' : 'booking_id']: ctx.id,
      };

      const supabase = global.getSupabase();
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Nicht angemeldet');

      const resp = await fetch(`${global.SUPABASE_URL}/functions/v1/cancel-or-refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': global.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });
      // Diagnose-Wrapper: echten Server-Response-Body sichtbar machen,
      // wenn der nicht JSON ist (Gateway/CORS/HTML-Error → der Standard resp.json()
      // wirft dann den nichtssagenden „JSON.parse: unexpected character"-Fehler).
      const rawBody = await resp.text();
      let result;
      try {
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseErr) {
        throw new Error(`HTTP ${resp.status} (kein JSON): ${rawBody.slice(0, 250)}`);
      }
      if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);

      const refundStr = fmtEur(result.refund_amount_cents ?? 0);
      const sorryStr  = result.sorry_code ? ', SORRY-Code: ' + result.sorry_code : '';
      global.showPfToast(
        'Storno erfolgreich',
        `Stornobeleg ${result.storno_invoice_number ?? '(ausstehend)'} — Rückzahlung ${refundStr}${sorryStr}`,
        'success'
      );
      bootstrap.Modal.getInstance(document.getElementById('pf-storno-modal'))?.hide();
      ctx.onSuccess?.(result);
    } catch (e) {
      global.showPfToast('Storno fehlgeschlagen', (e && e.message) ? e.message : String(e), 'danger');
    } finally {
      btn.disabled = false;
    }
  }

  global.openStornoDialog = function (ctx) {
    ensureModal();
    document.getElementById('pf-storno-subject').textContent = ctx.title;
    document.getElementById('pf-storno-reason').value = 'kunde_rechtzeitig';
    document.getElementById('pf-storno-note').value = '';
    const d = DEFAULTS['kunde_rechtzeitig'];
    document.getElementById('pf-storno-fee').checked = d.fee;
    document.getElementById('pf-storno-sorry').checked = d.sorry;
    document.getElementById('pf-storno-reason').onchange = (e) => {
      const nd = DEFAULTS[e.target.value] ?? { fee: false, sorry: false };
      document.getElementById('pf-storno-fee').checked = nd.fee;
      document.getElementById('pf-storno-sorry').checked = nd.sorry;
      updatePreview(ctx);
    };
    document.getElementById('pf-storno-fee').onchange = () => updatePreview(ctx);
    document.getElementById('pf-storno-sorry').onchange = () => updatePreview(ctx);
    document.getElementById('pf-storno-submit').onclick = () => submit(ctx);
    updatePreview(ctx);
    new bootstrap.Modal(document.getElementById('pf-storno-modal')).show();
  };
})(window);
