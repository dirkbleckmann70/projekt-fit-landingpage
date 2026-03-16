/* form-dirty.js – Dirty-State Tracking für Formulare
 * API: window.initFormDirty({ form, saveBtnId, onSave })
 * Returns: { isDirty(), reset(), confirmDiscard(onProceed), destroy() }
 */

(function () {
  // Custom-Dialog einmalig ins DOM einfügen
  function ensureOverlay() {
    if (document.getElementById('fd-overlay')) return;
    var div = document.createElement('div');
    div.innerHTML =
      '<div id="fd-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:none;align-items:center;justify-content:center">' +
        '<div style="background:#161625;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:28px 32px;max-width:380px;width:90%">' +
          '<h3 style="font-size:15px;font-weight:700;color:#F0F0F5;margin:0 0 8px">Ungespeicherte \u00C4nderungen</h3>' +
          '<p style="font-size:13px;color:#8888A0;margin:0 0 20px">Du hast ungespeicherte \u00C4nderungen. Was m\u00F6chtest du tun?</p>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end">' +
            '<button id="fd-btn-cancel"  class="btn btn-ghost btn-sm">Abbrechen</button>' +
            '<button id="fd-btn-discard" class="btn btn-secondary btn-sm">Verwerfen</button>' +
            '<button id="fd-btn-save"    class="btn btn-primary btn-sm">Speichern</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div.firstChild);
  }

  function getFields(form) {
    if (!form) return [];
    return Array.from(form.querySelectorAll('input, select, textarea')).filter(function (el) {
      return !el.disabled;
    });
  }

  function getFieldValue(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
    return el.value;
  }

  function snapshotFields(fields) {
    var snap = {};
    fields.forEach(function (el) {
      var key = el.id || el.name || el.type + '_' + Array.from(el.form ? el.form.elements : [el.closest('form') ? el.closest('form').elements : []]).indexOf(el);
      snap[key] = getFieldValue(el);
    });
    return snap;
  }

  window.initFormDirty = function (opts) {
    var form = opts.form;
    var saveBtnId = opts.saveBtnId;
    var onSave = opts.onSave;

    ensureOverlay();

    var fields = getFields(form);
    var original = snapshotFields(fields);
    var _dirty = false;
    var _beforeunloadBound = null;
    var _inputListeners = [];

    var saveBtn = saveBtnId ? document.getElementById(saveBtnId) : null;

    function checkDirty() {
      var nowDirty = false;
      fields.forEach(function (el) {
        var key = el.id || el.name || el.type + '_idx';
        if (getFieldValue(el) !== original[key]) nowDirty = true;
      });
      _dirty = nowDirty;

      fields.forEach(function (el) {
        var key = el.id || el.name || el.type + '_idx';
        if (getFieldValue(el) !== original[key]) {
          el.classList.add('field-dirty');
        } else {
          el.classList.remove('field-dirty');
        }
      });

      if (saveBtn) {
        if (_dirty) {
          saveBtn.classList.add('btn-dirty');
        } else {
          saveBtn.classList.remove('btn-dirty');
        }
      }
    }

    // Attach input listeners
    fields.forEach(function (el) {
      var handler = function () { checkDirty(); };
      var evt = (el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evt, handler);
      _inputListeners.push({ el: el, evt: evt, handler: handler });
    });

    // beforeunload
    _beforeunloadBound = function (e) {
      if (_dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', _beforeunloadBound);

    function isDirty() {
      return _dirty;
    }

    function reset() {
      fields = getFields(form);
      original = snapshotFields(fields);
      _dirty = false;

      fields.forEach(function (el) { el.classList.remove('field-dirty'); });
      if (saveBtn) saveBtn.classList.remove('btn-dirty');

      // Re-attach listeners to any new fields
      _inputListeners.forEach(function (item) {
        item.el.removeEventListener(item.evt, item.handler);
      });
      _inputListeners = [];
      fields.forEach(function (el) {
        var handler = function () { checkDirty(); };
        var evt = (el.tagName === 'SELECT') ? 'change' : 'input';
        el.addEventListener(evt, handler);
        _inputListeners.push({ el: el, evt: evt, handler: handler });
      });
    }

    function destroy() {
      _inputListeners.forEach(function (item) {
        item.el.removeEventListener(item.evt, item.handler);
      });
      _inputListeners = [];
      if (_beforeunloadBound) {
        window.removeEventListener('beforeunload', _beforeunloadBound);
        _beforeunloadBound = null;
      }
      if (saveBtn) saveBtn.classList.remove('btn-dirty');
      fields.forEach(function (el) { el.classList.remove('field-dirty'); });
      _dirty = false;
    }

    function confirmDiscard(onProceed) {
      var overlay = document.getElementById('fd-overlay');
      overlay.style.display = 'flex';

      var btnCancel  = document.getElementById('fd-btn-cancel');
      var btnDiscard = document.getElementById('fd-btn-discard');
      var btnSave    = document.getElementById('fd-btn-save');

      function hide() {
        overlay.style.display = 'none';
        btnCancel.onclick  = null;
        btnDiscard.onclick = null;
        btnSave.onclick    = null;
      }

      btnCancel.onclick = function () {
        hide();
      };

      btnDiscard.onclick = function () {
        hide();
        destroy();
        if (onProceed) onProceed();
      };

      btnSave.onclick = function () {
        hide();
        if (onSave) onSave();
      };
    }

    return {
      isDirty: isDirty,
      reset: reset,
      confirmDiscard: confirmDiscard,
      destroy: destroy,
    };
  };
})();
