// dashboard-charts.js — Trainer-Dashboard-Diagramme (ApexCharts).
// Aufruf: window.renderDashboardCharts({ ptBookings, gtClasses, gtPartsByClass })
// Alle Daten sind bereits trainer-scoped geladen — KEIN DB-Zugriff hier.
(function () {
  const PT = '#22C55E', GT = '#FB923C', KUNDEN = '#38BDF8', TOTAL = '#6366F1', GELD = '#16A34A';

  // 12 Monats-Buckets (rollierend, inkl. aktueller Monat), aeltester zuerst.
  function buildMonths() {
    const months = [];
    const base = new Date(); base.setDate(1);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0');
      months.push({ key, label: m.toLocaleDateString('de-DE', { month: 'short' }) });
    }
    return months;
  }
  const monthKey = d => (d || '').slice(0, 7);            // 'YYYY-MM'
  const isActive = s => ['bestaetigt', 'laeuft gerade', 'abgeschlossen'].includes(s);

  window.renderDashboardCharts = function (data) {
    if (typeof ApexCharts === 'undefined') return;
    const ptBookings = (data && data.ptBookings) || [];
    const gtClasses = (data && data.gtClasses) || [];
    const gtPartsByClass = (data && data.gtPartsByClass) || {};

    const months = buildMonths();
    const idx = {}; months.forEach((m, i) => { idx[m.key] = i; });
    const labels = months.map(m => m.label);
    const zero = () => months.map(() => 0);

    const classDate = {};
    gtClasses.forEach(c => { classDate[c.id] = c.scheduled_date; });

    const ptCount = zero(), gtCount = zero(), verdienst = zero();
    const kundenSets = months.map(() => new Set());

    // PT-Buchungen
    ptBookings.forEach(b => {
      const i = idx[monthKey(b.scheduled_date)];
      if (i == null) return;
      if (isActive(b.status)) {
        ptCount[i] += 1;
        if (b.customer_id) kundenSets[i].add(b.customer_id);
      }
      if (b.status === 'abgeschlossen') verdienst[i] += (b.trainer_payout_cents || 0);
    });

    // GT-Kurse (aktive) = Buchung im Kurs-Monat
    gtClasses.forEach(c => {
      if (!c.is_active) return;
      const i = idx[monthKey(c.scheduled_date)];
      if (i == null) return;
      gtCount[i] += 1;
    });

    // GT-Teilnahmen: Kunden + Verdienst, Monat = Kurs-Datum
    Object.keys(gtPartsByClass).forEach(cid => {
      const i = idx[monthKey(classDate[cid])];
      if (i == null) return;
      (gtPartsByClass[cid] || []).forEach(p => {
        if (p.status !== 'storniert' && p.customer_id) kundenSets[i].add(p.customer_id);
        if (p.status === 'abgeschlossen') verdienst[i] += (p.trainer_payout_cents || 0);
      });
    });

    const kunden = kundenSets.map(s => s.size);
    const total = months.map((m, i) => ptCount[i] + gtCount[i]);
    const lastI = months.length - 1;

    const baseBar = {
      chart: { type: 'bar', height: 230, fontFamily: 'inherit', toolbar: { show: false } },
      plotOptions: { bar: { columnWidth: '58%', borderRadius: 3 } },
      dataLabels: { enabled: false }, legend: { show: false },
      xaxis: { categories: labels, labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
      yaxis: { labels: { style: { colors: '#94a3b8' } } },
      grid: { borderColor: '#f1f5f9' },
    };
    const mk = (sel, opts) => { const el = document.querySelector(sel); if (el) new ApexCharts(el, opts).render(); };

    // Kreisdiagramm: dieser Monat (letzter Bucket)
    mk('#chart-donut', {
      chart: { type: 'donut', height: 250, fontFamily: 'inherit' },
      series: [ptCount[lastI], gtCount[lastI]],
      labels: ['Einzeltraining', 'Gruppenkurs'], colors: [PT, GT], legend: { show: false },
      dataLabels: { enabled: true, formatter: (v, o) => o.w.config.series[o.seriesIndex] },
      plotOptions: { pie: { donut: { size: '68%', labels: { show: true,
        total: { show: true, label: 'Gesamt', fontSize: '13px', color: '#64748b', formatter: w => w.globals.seriesTotals.reduce((a, b) => a + b, 0) },
        value: { fontSize: '26px', fontWeight: 800, color: '#1e293b' } } } } },
      stroke: { width: 2, colors: ['#fff'] }, tooltip: { y: { formatter: v => v + ' Trainings' } },
      noData: { text: 'Keine Trainings diesen Monat', style: { color: '#94a3b8' } },
    });
    // Buchungen gesamt
    mk('#chart-total', Object.assign({}, baseBar, {
      series: [{ name: 'Buchungen', data: total }], colors: [TOTAL],
      tooltip: { y: { formatter: v => v + ' Buchungen' } },
    }));
    // PT / GT (gestapelt)
    mk('#chart-ptgt', Object.assign({}, baseBar, {
      chart: { type: 'bar', height: 230, fontFamily: 'inherit', stacked: true, toolbar: { show: false } },
      series: [{ name: 'PT', data: ptCount }, { name: 'GT', data: gtCount }],
      colors: [PT, GT], tooltip: { shared: true, intersect: false },
    }));
    // Kunden
    mk('#chart-kunden', Object.assign({}, baseBar, {
      series: [{ name: 'Kunden', data: kunden }], colors: [KUNDEN],
      tooltip: { y: { formatter: v => v + ' Kunden' } },
    }));
    // Verdienst (cents -> €)
    mk('#chart-verdienst', Object.assign({}, baseBar, {
      chart: { type: 'bar', height: 210, fontFamily: 'inherit', toolbar: { show: false } },
      series: [{ name: 'Verdienst', data: verdienst.map(c => Math.round(c / 100)) }], colors: [GELD],
      yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: v => v + ' €' } },
      tooltip: { y: { formatter: v => v.toLocaleString('de-DE') + ' €' } },
    }));
  };
})();
