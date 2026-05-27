// shared/table-utils.js – Tabler-styled Sort + Filter fuer alle Tabellen
// Verwendung: tableFilter = initSortableTable(tableId, columnConfig, options);
//             tableFilter.onFilterChange(() => renderMyTable());
//             let data = tableFilter.apply(allData); // in Render-Funktion
//
// options (optional):
//   extraButtons: [{label, icon, className, onClick}]  – seitenspezifische Buttons
//   countLabel: 'Trainern' | 'Kunden' | ...           – Default: 'Eintraegen'
//   onRowClick: function(rowData, trElement) {}        – Klick auf Tabellenzeile (nicht auf .pf-btn)
(function () {
  'use strict';

  /**
   * @param {string} tableId
   * @param {Array<{key,type,getValue}|null>} columnConfig
   * @param {Object} [options]
   * @returns {{ apply, applyFilters, onFilterChange, clearAll }}
   */
  function initSortableTable(tableId, columnConfig, options) {
    options = options || {};
    var extraButtons = options.extraButtons || [];
    var countLabel = options.countLabel || 'Eintraegen';
    var onRowClick = options.onRowClick || null;

    var table = document.getElementById(tableId);
    if (!table) { console.warn('initSortableTable: Tabelle nicht gefunden:', tableId); return null; }

    // Erzwingt einzeilige Darstellung der Zeilen (CSS-Klasse aus table-utils.css)
    table.classList.add('pf-table-fixed');

    var thead = table.querySelector('thead');
    if (!thead) { console.warn('initSortableTable: kein <thead> in', tableId); return null; }

    var headerRow = Array.prototype.find.call(
      thead.querySelectorAll('tr'),
      function (r) { return r.querySelectorAll('th').length > 0; }
    );
    if (!headerRow) return null;

    var ths = Array.prototype.slice.call(headerRow.querySelectorAll('th'));
    var sortKey    = null;
    var sortDir    = 0;       // 0=none 1=asc -1=desc
    var onChangeCb = null;
    var filterStates  = {};
    var filterVisible = false;
    var _lastResult   = [];   // letztes apply()-Ergebnis fuer Zeilen-Klick-Lookup

    // ── Toolbar (Count-Bar) mit Tabler-Design ────────────────────────
    var toolbar = document.createElement('div');
    toolbar.className = 'count-bar';
    toolbar.style.cssText = 'font-size:12px;color:var(--tblr-secondary-color);padding:8px 16px;display:flex;justify-content:space-between;align-items:center';

    var countText = document.createElement('span');
    countText.className = 'tf-count-text';
    toolbar.appendChild(countText);

    var btnGroup = document.createElement('div');
    btnGroup.className = 'd-flex gap-2';

    // Filter-Toggle Button
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-sm btn-ghost-secondary';
    toggleBtn.innerHTML = '<i class="ti ti-filter"></i> Filter &amp; Sortierung';
    btnGroup.appendChild(toggleBtn);

    // Reset Button (initial hidden)
    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn btn-sm btn-ghost-secondary';
    resetBtn.innerHTML = '<i class="ti ti-x"></i> Zuruecksetzen';
    resetBtn.style.display = 'none';
    btnGroup.appendChild(resetBtn);

    // Extra-Buttons (seitenspezifisch)
    extraButtons.forEach(function (btn) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = btn.className || 'btn btn-sm btn-ghost-secondary';
      el.innerHTML = (btn.icon ? '<i class="ti ' + btn.icon + '"></i> ' : '') + btn.label;
      if (btn.onClick) {
        el.setAttribute('onclick', btn.onClick);
      }
      btnGroup.appendChild(el);
    });

    toolbar.appendChild(btnGroup);

    // Einfuegen: Innerhalb der .card als erstes Element
    var card = table.closest('.card');
    if (card) {
      // Bestehende manuelle count-bar entfernen falls vorhanden
      var existingBar = card.querySelector('.count-bar');
      if (existingBar) existingBar.remove();
      card.insertBefore(toolbar, card.firstChild);
    } else {
      table.parentElement.insertBefore(toolbar, table);
    }

    // ── Sort-Icons (Tabler Icons) auf <th> ───────────────────────────
    columnConfig.forEach(function (col, i) {
      if (!col || i >= ths.length) return;
      var th = ths[i];
      th.classList.add('tf-sortable');

      var icon = document.createElement('i');
      icon.className = 'ti ti-arrows-sort tf-sort-icon';
      icon.style.cssText = 'font-size:12px;opacity:0.5;margin-left:4px;vertical-align:middle';
      th.appendChild(icon);

      th.addEventListener('click', function () {
        if (sortKey === col.key) {
          if      (sortDir === 0)  { sortDir =  1; }
          else if (sortDir === 1)  { sortDir = -1; }
          else                     { sortDir =  0; sortKey = null; }
        } else {
          sortKey = col.key;
          sortDir = 1;
        }
        _updateSortIcons();
        _updateToolbar();
        if (onChangeCb) onChangeCb();
      });
    });

    function _updateSortIcons() {
      columnConfig.forEach(function (col, i) {
        if (!col || i >= ths.length) return;
        var icon = ths[i].querySelector('.tf-sort-icon');
        if (!icon) return;
        if (sortKey === col.key && sortDir !== 0) {
          icon.className = sortDir === 1
            ? 'ti ti-sort-ascending tf-sort-icon'
            : 'ti ti-sort-descending tf-sort-icon';
          icon.style.cssText = 'font-size:12px;margin-left:4px;vertical-align:middle;color:var(--tblr-warning);opacity:1';
        } else {
          icon.className = 'ti ti-arrows-sort tf-sort-icon';
          icon.style.cssText = 'font-size:12px;opacity:0.5;margin-left:4px;vertical-align:middle';
        }
      });
    }

    // ── Filter-Zeile in <thead> (default: hidden) ────────────────────
    var filterRow = document.createElement('tr');
    filterRow.className = 'tf-filter-row';
    filterRow.style.display = 'none';

    columnConfig.forEach(function (col) {
      var td = document.createElement('th');
      td.className = 'tf-filter-cell';
      if (col) {
        var k = col.key;
        if (col.type === 'text') {
          td.innerHTML = '<input type="text" class="form-control form-control-sm tf-fi tf-fi-text" placeholder="Suchen\u2026" data-key="' + k + '">';
        } else if (col.type === 'select') {
          td.innerHTML = '<select class="form-select form-select-sm tf-fi tf-fi-select" data-key="' + k + '"><option value="">Alle</option></select>';
        } else if (col.type === 'date') {
          td.innerHTML =
            '<div class="tf-date-range">' +
            '<input type="date" class="form-control form-control-sm tf-fi tf-fi-date-from" data-key="' + k + '" title="Von">' +
            '<input type="date" class="form-control form-control-sm tf-fi tf-fi-date-to"   data-key="' + k + '" title="Bis">' +
            '</div>';
        } else if (col.type === 'number') {
          td.innerHTML =
            '<div class="tf-date-range">' +
            '<input type="number" class="form-control form-control-sm tf-fi tf-fi-num-min" placeholder="Min" data-key="' + k + '" step="any">' +
            '<input type="number" class="form-control form-control-sm tf-fi tf-fi-num-max" placeholder="Max" data-key="' + k + '" step="any">' +
            '</div>';
        }
      }
      filterRow.appendChild(td);
    });

    thead.appendChild(filterRow);
    filterRow.addEventListener('click', function (e) { e.stopPropagation(); });

    // ── Toggle-Button Handler ────────────────────────────────────────
    toggleBtn.addEventListener('click', function () {
      filterVisible = !filterVisible;
      filterRow.style.display = filterVisible ? '' : 'none';
      _updateToolbar();
    });

    function _updateToolbar() {
      var activeFilters = Object.values(filterStates).filter(function (s) { return s; }).length;

      if (activeFilters > 0 && !filterVisible) {
        filterVisible = true;
        filterRow.style.display = '';
      }

      // Toggle-Button: Icon + Text + optionaler Badge
      var label = '<i class="ti ti-filter"></i> Filter &amp; Sortierung';
      if (activeFilters > 0) {
        label += ' <span class="badge bg-warning-lt ms-1">' + activeFilters + ' aktiv</span>';
      }
      toggleBtn.innerHTML = label;

      // Reset-Button nur wenn Filter oder Sort aktiv
      var hasActive = activeFilters > 0 || sortDir !== 0;
      resetBtn.style.display = hasActive ? '' : 'none';
    }

    // ── Filter-Events ────────────────────────────────────────────────
    filterRow.addEventListener('input', function (e) {
      var el = e.target, key = el.dataset.key;
      if (!key) return;

      if (el.classList.contains('tf-fi-text')) {
        filterStates[key] = el.value ? { type: 'text', value: el.value } : null;

      } else if (el.classList.contains('tf-fi-date-from')) {
        if (!filterStates[key] || filterStates[key].type !== 'date')
          filterStates[key] = { type: 'date', from: '', to: '' };
        filterStates[key].from = el.value;
        if (!filterStates[key].from && !filterStates[key].to) filterStates[key] = null;

      } else if (el.classList.contains('tf-fi-date-to')) {
        if (!filterStates[key] || filterStates[key].type !== 'date')
          filterStates[key] = { type: 'date', from: '', to: '' };
        filterStates[key].to = el.value;
        if (!filterStates[key].from && !filterStates[key].to) filterStates[key] = null;

      } else if (el.classList.contains('tf-fi-num-min')) {
        if (!filterStates[key] || filterStates[key].type !== 'number')
          filterStates[key] = { type: 'number', min: null, max: null };
        filterStates[key].min = el.value !== '' ? parseFloat(el.value) : null;
        if (filterStates[key].min == null && filterStates[key].max == null) filterStates[key] = null;

      } else if (el.classList.contains('tf-fi-num-max')) {
        if (!filterStates[key] || filterStates[key].type !== 'number')
          filterStates[key] = { type: 'number', min: null, max: null };
        filterStates[key].max = el.value !== '' ? parseFloat(el.value) : null;
        if (filterStates[key].min == null && filterStates[key].max == null) filterStates[key] = null;
      }
      _updateToolbar();
      if (onChangeCb) onChangeCb();
    });

    filterRow.addEventListener('change', function (e) {
      var el = e.target, key = el.dataset.key;
      if (!key) return;
      if (el.classList.contains('tf-fi-select')) {
        filterStates[key] = el.value ? { type: 'select', value: el.value } : null;
        _updateToolbar();
        if (onChangeCb) onChangeCb();
      }
    });

    // ── Select-Optionen befuellen ────────────────────────────────────
    function _populateSelects(allData) {
      filterRow.querySelectorAll('.tf-fi-select').forEach(function (select) {
        var key = select.dataset.key;
        var col = columnConfig.find(function (c) { return c && c.key === key; });
        if (!col) return;
        var getVal = col.getValue || function (item) { return item[key]; };
        var current = select.value;

        var rawValues = allData.map(function (item) {
          var v = getVal(item);
          return (v != null && v !== '') ? String(v) : '\u2013';
        });
        var values = Array.from(new Set(rawValues)).sort(function (a, b) {
          if (a === '\u2013') return 1;
          if (b === '\u2013') return -1;
          return a.localeCompare(b, 'de');
        });

        var existing = Array.from(select.options).slice(1).map(function (o) { return o.value; });
        var same = existing.length === values.length && values.every(function (v, i) { return v === existing[i]; });
        if (same) return;

        select.innerHTML = '<option value="">Alle</option>';
        values.forEach(function (v) {
          var opt = document.createElement('option');
          opt.value = v; opt.textContent = v;
          if (v === current) opt.selected = true;
          select.appendChild(opt);
        });
      });
    }

    // ── apply: Filter + Sort anwenden ────────────────────────────────
    function apply(allData) {
      _populateSelects(allData);

      // 1. Filtern
      var result = allData.filter(function (item) {
        var entries = Object.entries(filterStates);
        for (var ei = 0; ei < entries.length; ei++) {
          var key   = entries[ei][0];
          var state = entries[ei][1];
          if (!state) continue;
          var col = columnConfig.find(function (c) { return c && c.key === key; });
          if (!col) continue;
          var getVal = col.getValue || function (it) { return it[key]; };
          var raw = getVal(item);

          if (state.type === 'text') {
            var sv = raw != null ? String(raw).toLowerCase() : '';
            if (!sv.includes(state.value.toLowerCase())) return false;

          } else if (state.type === 'select') {
            var sv2 = (raw != null && raw !== '') ? String(raw) : '\u2013';
            if (sv2 !== state.value) return false;

          } else if (state.type === 'date') {
            var dv = raw || '';
            if (state.from && dv < state.from) return false;
            if (state.to   && dv > state.to)   return false;

          } else if (state.type === 'number') {
            var nv = parseFloat(raw) || 0;
            if (state.min != null && nv < state.min) return false;
            if (state.max != null && nv > state.max) return false;
          }
        }
        return true;
      });

      // 2. Sortieren
      if (sortKey && sortDir !== 0) {
        var sc = columnConfig.find(function (c) { return c && c.key === sortKey; });
        if (sc) {
          var gsv = sc.getValue || function (item) { return item[sortKey]; };
          var d   = sortDir;
          result  = result.slice().sort(function (a, b) {
            var va = gsv(a), vb = gsv(b), cmp;
            if (typeof va === 'number' && typeof vb === 'number') {
              cmp = va - vb;
            } else {
              cmp = String(va != null ? va : '').localeCompare(
                String(vb != null ? vb : ''), 'de', { numeric: true, sensitivity: 'base' }
              );
            }
            return d === 1 ? cmp : -cmp;
          });
        }
      }

      // 3. Count-Text aktualisieren
      if (result.length === allData.length) {
        countText.textContent = allData.length + ' ' + countLabel;
      } else {
        countText.textContent = result.length + ' von ' + allData.length + ' ' + countLabel;
      }

      // Aktuelles Ergebnis fuer Zeilen-Klick-Lookup merken
      _lastResult = result;

      return result;
    }

    // ── Reset ────────────────────────────────────────────────────────
    resetBtn.addEventListener('click', function () {
      Object.keys(filterStates).forEach(function (k) { filterStates[k] = null; });
      sortKey = null; sortDir = 0;
      _updateSortIcons();
      filterRow.querySelectorAll('input').forEach(function (i) { i.value = ''; });
      filterRow.querySelectorAll('select').forEach(function (s) { s.value = ''; });
      _updateToolbar();
      if (onChangeCb) onChangeCb();
    });

    // Initiale Toolbar-Anzeige
    _updateToolbar();

    // ── Zeilen-Klick via Event-Delegation ───────────────────────────
    // Gilt auch nach Re-Render (Filter/Sort), da am tbody statt an einzelnen <tr> haengend.
    // .pf-btn-Klicks stoppen die Weiterleitung, damit Aktions-Buttons den Zeilen-Klick nicht ausloesen.
    if (onRowClick) {
      var tbody = table.querySelector('tbody');
      if (tbody) {
        tbody.addEventListener('click', function (e) {
          // Aktions-Button: nicht weiterleiten
          if (e.target.closest('.pf-btn')) {
            e.stopPropagation();
            return;
          }
          var tr = e.target.closest('tr');
          if (!tr) return;
          var idx = tr.dataset.rowIndex;
          if (idx === undefined) return;
          var rowData = _lastResult[parseInt(idx, 10)];
          if (rowData !== undefined) {
            onRowClick(rowData, tr);
          }
        });
      }
    }

    return {
      apply:           apply,
      applyFilters:    apply,
      onFilterChange:  function (cb) { onChangeCb = cb; },
      clearAll:        function () { resetBtn.click(); },
    };
  }

  window.initSortableTable = initSortableTable;
})();
