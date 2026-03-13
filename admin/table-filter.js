// table-filter.js – Wiederverwendbare Excel-Stil Spaltenfilter für Admin-Tabellen
// Dropdowns werden an document.body gehängt (position:fixed) um overflow:hidden-Clipping zu vermeiden
(function () {
  if (!document.getElementById('tf-styles')) {
    const s = document.createElement('style');
    s.id = 'tf-styles';
    s.textContent = `
      th.tf-th { position:relative; cursor:pointer; user-select:none; white-space:nowrap; }
      .tf-icon { display:inline-block; margin-left:5px; font-size:9px; color:#55556A; transition:color 0.15s; vertical-align:middle; }
      .tf-icon.active { color:#E07A3A; }
      .tf-dropdown {
        position:fixed; z-index:10000;
        background:#1A1A2E; border:1px solid rgba(255,255,255,0.12); border-radius:10px;
        min-width:230px; box-shadow:0 8px 32px rgba(0,0,0,0.5);
        padding:12px; display:none; text-align:left; font-weight:400;
        font-family:'Plus Jakarta Sans',sans-serif; font-size:13px; color:#F0F0F5;
      }
      .tf-dropdown.open { display:block; }
      .tf-dropdown input[type="text"],
      .tf-dropdown input[type="date"],
      .tf-dropdown input[type="number"] {
        width:100%; padding:7px 10px; font-size:12px; border-radius:6px;
        background:#0D0D15; border:1px solid rgba(255,255,255,0.1); color:#F0F0F5;
        margin-bottom:8px; box-sizing:border-box; font-family:inherit;
      }
      .tf-dropdown input:focus { outline:none; border-color:#E07A3A; }
      .tf-actions { display:flex; gap:8px; margin-bottom:8px; }
      .tf-actions button {
        font-size:11px; padding:3px 10px; border-radius:4px; border:none; cursor:pointer;
        background:rgba(255,255,255,0.06); color:#8888A0; font-family:inherit;
      }
      .tf-actions button:hover { background:rgba(255,255,255,0.1); color:#F0F0F5; }
      .tf-checks { max-height:200px; overflow-y:auto; margin-bottom:4px; }
      .tf-checks::-webkit-scrollbar { width:5px; }
      .tf-checks::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15); border-radius:3px; }
      .tf-check-item {
        display:flex; align-items:center; gap:8px; padding:4px 2px; font-size:12px; color:#F0F0F5;
        cursor:pointer; border-radius:4px;
      }
      .tf-check-item:hover { background:rgba(255,255,255,0.04); }
      .tf-check-item input[type="checkbox"] { accent-color:#E07A3A; flex-shrink:0; }
      .tf-date-row { display:flex; gap:8px; align-items:center; margin-bottom:6px; }
      .tf-date-row label { font-size:11px; color:#8888A0; min-width:28px; }
      .tf-btn-apply {
        width:100%; margin-top:8px; padding:7px; border-radius:6px; border:none;
        background:#E07A3A; color:#fff; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;
      }
      .tf-btn-apply:hover { background:#c96a2f; }
      .tf-btn-clear {
        width:100%; margin-top:4px; padding:5px; border-radius:6px; border:none;
        background:transparent; color:#8888A0; font-size:11px; cursor:pointer; font-family:inherit;
      }
      .tf-btn-clear:hover { color:#F0F0F5; }
    `;
    document.head.appendChild(s);
  }

  class TableFilter {
    constructor({ tableId, columns, getData, onFilter }) {
      this.tableEl = document.getElementById(tableId);
      if (!this.tableEl) { console.warn('TableFilter: table not found:', tableId); return; }
      this.columns = columns || [];
      this.getData = getData;
      this.onFilter = onFilter;
      this.filters = {};
      this.dropdowns = {};
      this.icons = {};
      this.ths = {};
      this._boundClose = (e) => this._closeAll(e);
      this._boundScroll = () => this._repositionOpen();
      this.init();
    }

    init() {
      const ths = this.tableEl.querySelectorAll('thead th');
      this.columns.forEach((col, i) => {
        if (!col || i >= ths.length) return;
        const th = ths[i];
        th.classList.add('tf-th');
        this.ths[i] = th;

        // Add ▼ icon
        const icon = document.createElement('span');
        icon.className = 'tf-icon';
        icon.textContent = '\u25BC';
        th.appendChild(icon);
        this.icons[i] = icon;

        // Create dropdown on document.body (avoids overflow clipping)
        const dd = document.createElement('div');
        dd.className = 'tf-dropdown';
        document.body.appendChild(dd);
        this.dropdowns[i] = dd;

        // Click on th toggles dropdown
        th.addEventListener('click', (e) => {
          e.stopPropagation();
          this._toggle(i);
        });
        // Prevent clicks inside dropdown from closing it
        dd.addEventListener('click', (e) => e.stopPropagation());
      });
      document.addEventListener('click', this._boundClose);
      window.addEventListener('scroll', this._boundScroll, true);
      window.addEventListener('resize', this._boundScroll);
    }

    _positionDropdown(index) {
      const th = this.ths[index];
      const dd = this.dropdowns[index];
      if (!th || !dd) return;
      const rect = th.getBoundingClientRect();
      dd.style.top = (rect.bottom + 4) + 'px';
      // Align right edge of dropdown with right edge of th
      const ddWidth = dd.offsetWidth || 230;
      let left = rect.right - ddWidth;
      if (left < 8) left = 8;
      dd.style.left = left + 'px';
    }

    _repositionOpen() {
      Object.keys(this.dropdowns).forEach(i => {
        const dd = this.dropdowns[i];
        if (dd.classList.contains('open')) {
          this._positionDropdown(i);
        }
      });
    }

    _toggle(index) {
      const dd = this.dropdowns[index];
      const wasOpen = dd.classList.contains('open');
      // Close all
      Object.values(this.dropdowns).forEach(d => d.classList.remove('open'));
      if (!wasOpen) {
        this._renderDropdown(index);
        dd.classList.add('open');
        this._positionDropdown(index);
      }
    }

    _renderDropdown(index) {
      const col = this.columns[index];
      const dd = this.dropdowns[index];
      const data = this.getData();
      const getVal = col.getValue || ((item) => item[col.key]);
      let html = '';

      if (col.type === 'select') {
        const values = [...new Set(data.map(item => {
          const v = getVal(item);
          return v != null && v !== '' ? String(v) : '\u2013';
        }))].sort((a, b) => a === '\u2013' ? 1 : b === '\u2013' ? -1 : a.localeCompare(b, 'de'));

        const current = this.filters[col.key];
        const selected = current ? current.values : null;

        html += '<input type="text" placeholder="Suchen..." class="tf-dd-search">';
        html += '<div class="tf-actions"><button data-action="all">Alle</button><button data-action="none">Keine</button></div>';
        html += '<div class="tf-checks">';
        values.forEach(v => {
          const checked = (!selected || selected.has(v)) ? 'checked' : '';
          const escaped = v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
          html += `<label class="tf-check-item"><input type="checkbox" value="${escaped}" ${checked}><span>${escaped}</span></label>`;
        });
        html += '</div>';

      } else if (col.type === 'date') {
        const f = this.filters[col.key] || {};
        html += `<div class="tf-date-row"><label>Von</label><input type="date" class="tf-from" value="${f.from || ''}"></div>`;
        html += `<div class="tf-date-row"><label>Bis</label><input type="date" class="tf-to" value="${f.to || ''}"></div>`;

      } else if (col.type === 'number') {
        const f = this.filters[col.key] || {};
        html += `<div class="tf-date-row"><label>Min</label><input type="number" class="tf-min" value="${f.min != null ? f.min : ''}" step="any"></div>`;
        html += `<div class="tf-date-row"><label>Max</label><input type="number" class="tf-max" value="${f.max != null ? f.max : ''}" step="any"></div>`;
      }

      html += '<button class="tf-btn-apply">Anwenden</button>';
      html += '<button class="tf-btn-clear">Filter zur\u00fccksetzen</button>';
      dd.innerHTML = html;

      // Events inside dropdown
      const searchInput = dd.querySelector('.tf-dd-search');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const q = searchInput.value.toLowerCase();
          dd.querySelectorAll('.tf-check-item').forEach(item => {
            const text = item.querySelector('span').textContent.toLowerCase();
            item.style.display = text.includes(q) ? '' : 'none';
          });
        });
        setTimeout(() => searchInput.focus(), 50);
      }

      // Select all / none buttons
      dd.querySelectorAll('.tf-actions button').forEach(btn => {
        btn.addEventListener('click', () => {
          const checked = btn.dataset.action === 'all';
          dd.querySelectorAll('.tf-checks input[type="checkbox"]').forEach(cb => {
            if (cb.closest('.tf-check-item').style.display !== 'none') cb.checked = checked;
          });
        });
      });

      // Apply / Clear buttons
      dd.querySelector('.tf-btn-apply').addEventListener('click', () => this._apply(index));
      dd.querySelector('.tf-btn-clear').addEventListener('click', () => this._clear(index));
    }

    _apply(index) {
      const col = this.columns[index];
      const dd = this.dropdowns[index];
      const icon = this.icons[index];

      if (col.type === 'select') {
        const allCbs = [...dd.querySelectorAll('.tf-checks input[type="checkbox"]')];
        const checkedCbs = allCbs.filter(cb => cb.checked);
        if (checkedCbs.length === allCbs.length || checkedCbs.length === 0) {
          delete this.filters[col.key];
          icon.classList.remove('active');
        } else {
          this.filters[col.key] = { type: 'select', values: new Set(checkedCbs.map(cb => cb.value)) };
          icon.classList.add('active');
        }
      } else if (col.type === 'date') {
        const from = dd.querySelector('.tf-from').value;
        const to = dd.querySelector('.tf-to').value;
        if (!from && !to) {
          delete this.filters[col.key];
          icon.classList.remove('active');
        } else {
          this.filters[col.key] = { type: 'date', from, to };
          icon.classList.add('active');
        }
      } else if (col.type === 'number') {
        const min = dd.querySelector('.tf-min').value;
        const max = dd.querySelector('.tf-max').value;
        if (!min && !max) {
          delete this.filters[col.key];
          icon.classList.remove('active');
        } else {
          this.filters[col.key] = { type: 'number', min: min ? parseFloat(min) : null, max: max ? parseFloat(max) : null };
          icon.classList.add('active');
        }
      }

      dd.classList.remove('open');
      this.onFilter();
    }

    _clear(index) {
      const col = this.columns[index];
      delete this.filters[col.key];
      this.icons[index].classList.remove('active');
      this.dropdowns[index].classList.remove('open');
      this.onFilter();
    }

    _closeAll(e) {
      Object.values(this.dropdowns).forEach(d => d.classList.remove('open'));
    }

    // Apply all active filters to data array
    applyFilters(data) {
      const filterEntries = Object.entries(this.filters);
      if (filterEntries.length === 0) return data;

      return data.filter(item => {
        for (const [key, filter] of filterEntries) {
          const col = this.columns.find(c => c && c.key === key);
          if (!col) continue;
          const getVal = col.getValue || ((it) => it[col.key]);
          const raw = getVal(item);

          if (filter.type === 'select') {
            const strVal = raw != null && raw !== '' ? String(raw) : '\u2013';
            if (!filter.values.has(strVal)) return false;
          } else if (filter.type === 'date') {
            const dateVal = raw || '';
            if (filter.from && dateVal < filter.from) return false;
            if (filter.to && dateVal > filter.to) return false;
          } else if (filter.type === 'number') {
            const numVal = parseFloat(raw) || 0;
            if (filter.min != null && numVal < filter.min) return false;
            if (filter.max != null && numVal > filter.max) return false;
          }
        }
        return true;
      });
    }

    hasActiveFilters() {
      return Object.keys(this.filters).length > 0;
    }
  }

  window.TableFilter = TableFilter;
})();
