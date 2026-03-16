// shared/table-utils.js – Excel-Stil Sort + Filter für alle Tabellen
// Verwendung: tableFilter = initSortableTable(tableId, columnConfig);
//             tableFilter.onFilterChange(() => renderMyTable());
//             let data = tableFilter.apply(allData); // in Render-Funktion
(function () {
  'use strict';

  /**
   * @param {string} tableId
   * @param {Array<{key,type,getValue}|null>} columnConfig
   *   type: 'text' | 'select' | 'date' | 'number' | null (keine Filter-Zelle)
   * @returns {{ apply, applyFilters, onFilterChange, clearAll }}
   */
  function initSortableTable(tableId, columnConfig) {
    var table = document.getElementById(tableId);
    if (!table) { console.warn('initSortableTable: Tabelle nicht gefunden:', tableId); return null; }

    var thead = table.querySelector('thead');
    if (!thead) { console.warn('initSortableTable: kein <thead> in', tableId); return null; }

    var headerRow = thead.querySelector('tr');
    if (!headerRow) return null;

    var ths = Array.prototype.slice.call(headerRow.querySelectorAll('th'));
    var sortKey    = null;
    var sortDir    = 0;       // 0=none 1=asc -1=desc
    var onChangeCb = null;
    var filterStates  = {};   // key -> {type, value, from, to, min, max} | null
    var filterVisible = false; // Filterzeile standardmäßig ausgeblendet

    // ── Toolbar (Count-Bar + Toggle + Reset) ─────────────────────────
    var toolbar = document.createElement('div');
    toolbar.className = 'tf-count-bar';
    toolbar.innerHTML =
      '<span class="tf-count-text"></span>' +
      '<div class="tf-toolbar-right">' +
        '<button type="button" class="tf-toggle-btn">\uD83D\uDD3D Filter &amp; Sortierung</button>' +
        '<button type="button" class="tf-reset-btn">Filter zur\u00fccksetzen</button>' +
      '</div>';
    table.parentElement.insertBefore(toolbar, table);

    var countText = toolbar.querySelector('.tf-count-text');
    var toggleBtn = toolbar.querySelector('.tf-toggle-btn');
    var resetBtn  = toolbar.querySelector('.tf-reset-btn');

    // ── Sort-Icons + direkte Click-Handler auf <th> ───────────────────
    columnConfig.forEach(function (col, i) {
      if (!col || i >= ths.length) return;
      var th = ths[i];
      th.classList.add('tf-sortable');
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';

      var icon = document.createElement('span');
      icon.className = 'tf-sort-icon';
      icon.innerHTML = '&#x21C5;'; // ⇅
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
          icon.innerHTML = sortDir === 1 ? '&#x25B2;' : '&#x25BC;';
          icon.classList.add('active');
        } else {
          icon.innerHTML = '&#x21C5;';
          icon.classList.remove('active');
        }
      });
    }

    // ── Filter-Zeile in <thead> einfügen (standardmäßig hidden) ──────
    var filterRow = document.createElement('tr');
    filterRow.className = 'tf-filter-row';
    filterRow.style.display = 'none'; // default: ausgeblendet

    columnConfig.forEach(function (col) {
      var td = document.createElement('th');
      td.className = 'tf-filter-cell';
      if (col) {
        var k = col.key;
        if (col.type === 'text') {
          td.innerHTML = '<input type="text" class="tf-fi tf-fi-text" placeholder="Suchen\u2026" data-key="' + k + '">';
        } else if (col.type === 'select') {
          td.innerHTML = '<select class="tf-fi tf-fi-select" data-key="' + k + '"><option value="">Alle</option></select>';
        } else if (col.type === 'date') {
          td.innerHTML =
            '<div class="tf-date-range">' +
            '<input type="date" class="tf-fi tf-fi-date-from" data-key="' + k + '" title="Von">' +
            '<input type="date" class="tf-fi tf-fi-date-to"   data-key="' + k + '" title="Bis">' +
            '</div>';
        } else if (col.type === 'number') {
          td.innerHTML =
            '<div class="tf-date-range">' +
            '<input type="number" class="tf-fi tf-fi-num-min" placeholder="Min" data-key="' + k + '" step="any">' +
            '<input type="number" class="tf-fi tf-fi-num-max" placeholder="Max" data-key="' + k + '" step="any">' +
            '</div>';
        }
      }
      filterRow.appendChild(td);
    });

    thead.appendChild(filterRow);

    // Klick in Filter-Zeile löst keinen Sort aus
    filterRow.addEventListener('click', function (e) { e.stopPropagation(); });

    // ── Toggle-Button ─────────────────────────────────────────────────
    toggleBtn.addEventListener('click', function () {
      filterVisible = !filterVisible;
      filterRow.style.display = filterVisible ? '' : 'none';
      _updateToolbar();
    });

    function _updateToolbar() {
      var activeFilters = Object.values(filterStates).filter(function (s) { return s; }).length;

      // Filterzeile automatisch einblenden wenn Filter aktiv werden
      if (activeFilters > 0 && !filterVisible) {
        filterVisible = true;
        filterRow.style.display = '';
      }

      // Toggle-Button Text
      var arrow = filterVisible ? '\uD83D\uDD3C' : '\uD83D\uDD3D';
      var label = arrow + ' Filter & Sortierung';
      if (activeFilters > 0) {
        label += ' <span class="tf-filter-badge">' + activeFilters +
                 (activeFilters === 1 ? ' aktiv' : ' aktiv') + '</span>';
      }
      toggleBtn.innerHTML = label;
      toggleBtn.classList.toggle('tf-toggle-active', activeFilters > 0);

      // Reset-Button nur wenn Filter oder Sort aktiv
      var hasActive = activeFilters > 0 || sortDir !== 0;
      resetBtn.style.display = hasActive ? 'inline-block' : 'none';
    }

    // ── Filter-Events ─────────────────────────────────────────────────
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

    // ── Select-Optionen befüllen ──────────────────────────────────────
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

    // ── apply: Filter + Sort anwenden ─────────────────────────────────
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
      countText.textContent = result.length + ' von ' + allData.length + ' Eintr\u00e4gen';

      return result;
    }

    // ── Reset ─────────────────────────────────────────────────────────
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

    return {
      apply:           apply,
      applyFilters:    apply,
      onFilterChange:  function (cb) { onChangeCb = cb; },
      clearAll:        function () { resetBtn.click(); },
    };
  }

  window.initSortableTable = initSortableTable;
})();
