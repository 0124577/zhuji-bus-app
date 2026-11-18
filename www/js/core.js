/* ===== 核心：数据索引 / 数据源（静态 + 预留实时API） / 本地存储 / 工具 ===== */

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function hav(a, b, c, d) {
  if (!a || !b || !c || !d) return 0;
  const R = 6371000, r = Math.PI / 180;
  const p1 = a * r, p2 = c * r;
  const x = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function fuzzyMatch(text, keyword) {
  const t = String(text || '').toLowerCase(), k = String(keyword || '').trim().toLowerCase();
  if (!k) return true;
  if (t.indexOf(k) > -1) return true;
  let p = 0;
  for (let i = 0; i < t.length && p < k.length; i++) if (t[i] === k[p]) p++;
  return p === k.length;
}
function nowMinute() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function minHM(m) {
  m = Math.round(((m % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60), mi = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
}
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

/* ---------- 静态数据索引 ---------- */
const SIDX = (() => {
  const dirs = [], byName = new Map(), byLine = new Map();
  SNAP.lines.forEach(line => {
    (line.d || []).forEach(raw => {
      const stops = raw.s || [];
      if (!stops.length) return;
      const d = {
        rid: dirs.length, line: line.n, key: raw.k, id: raw.id,
        first: raw.f || '', last: raw.l || '', stops, segs: []
      };
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        let meters = hav(a[2] / 1e5, a[3] / 1e5, b[2] / 1e5, b[3] / 1e5);
        if (!meters || meters > 5000) meters = b[1] || 500;
        d.segs.push(Math.round(meters));
      }
      dirs.push(d);
      if (!byLine.has(line.n)) byLine.set(line.n, []);
      byLine.get(line.n).push(d);
      stops.forEach((s, i) => {
        const name = SNAP.names[s[0]] || '';
        if (!name) return;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ dir: d, order: i + 1 });
      });
    });
  });
  return { dirs, byName, byLine };
})();
function stopName(stop) { return SNAP.names[stop[0]] || ''; }
function labelStopName(stop) {
  return Array.isArray(stop) ? (SNAP.names[stop[0]] || '') : String((stop && stop.name) || '');
}
function dirLabel(d) {
  const a = labelStopName(d.stops[0]), b = labelStopName(d.stops[d.stops.length - 1]);
  return a === b ? '环线 · ' + a : '开往 ' + b;
}
function stationId(d, order) { return d.id + String(order).padStart(2, '0'); }

/* 站点坐标（同一站名取首条记录的经纬度，GCJ-02） */
const STATION_GEO = (() => {
  const map = new Map();
  SNAP.lines.forEach(line => (line.d || []).forEach(raw => (raw.s || []).forEach(s => {
    const name = SNAP.names[s[0]];
    const lat = (s[2] || 0) / 1e5, lng = (s[3] || 0) / 1e5;
    if (!name || !lat || !lng || map.has(name)) return;
    map.set(name, { name, lat, lng });
  })));
  return map;
})();

/* ---------- 数据源：静态优先，预留实时 API 切换 ---------- */
const DataSource = {
  get mode() { return (window.APP_CONFIG && APP_CONFIG.dataSource) || 'static'; },

  /* 预留：线上实时 API 请求（切换 APP_CONFIG.dataSource='api' 后启用） */
  async request(endpointKey, b, timeout = 12000) {
    const cfg = APP_CONFIG.realtimeApi;
    const url = cfg.base + cfg.endpoints[endpointKey];
    const body = JSON.stringify({ h: cfg.headers, b });
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body, signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (String(json.code || json.returnFlag) !== '200') throw new Error(json.msg || '接口返回异常');
      return json.data;
    } finally { if (timer) clearTimeout(timer); }
  },

  /* 线路搜索：静态 SEED_LINES；api 模式调用 searchBusLines */
  async searchLines(keyword) {
    const k = String(keyword || '').trim();
    if (this.mode === 'api') {
      if (!k) return [];
      const data = await this.request('searchLines', { lineName: k, needGeometry: 0 });
      return (data && data.list || []).map(x => ({ name: x.lineName, from: x.startStation, to: x.endStation }));
    }
    return SEED_LINES.filter(x => fuzzyMatch(x[0], k)).slice(0, 80)
      .map(x => ({ name: x[0], from: x[1], to: x[2] }));
  },

  /* 线路详情：静态 SNAP；api 模式调用 queryLine 并归一化 */
  async queryLine(name) {
    if (this.mode === 'api') {
      const data = await this.request('queryLine', { lineName: name, needGeometry: 0 });
      if (!data) return null;
      return { name, dirs: ['up', 'down'].filter(k => data[k] && (data[k].stationList || []).length).map(k => ({
        key: k, id: data[k].id, first: (data[k].startFirst || '').slice(0, 5), last: (data[k].startLast || '').slice(0, 5),
        stops: (data[k].stationList || []).map(s => ({
          name: s.stationName, id: s.id, order: s.stationOrder,
          lat: Number(s.poiOriginLat || 0), lng: Number(s.poiOriginLon || 0)
        }))
      })) };
    }
    const line = SNAP.lines.find(l => l.n === name);
    if (!line) return null;
    return { name, dirs: (line.d || []).map(d => ({
      key: d.k, id: d.id, first: d.f || '', last: d.l || '',
      stops: (d.s || []).map(s => ({ name: SNAP.names[s[0]], order: 0, lat: s[2] / 1e5, lng: s[3] / 1e5 }))
    })) };
  },

  /* 站点搜索：静态按站名模糊；api 模式调用 searchStation */
  async searchStations(keyword) {
    const k = String(keyword || '').trim();
    if (!k) return [];
    if (this.mode === 'api') {
      const data = await this.request('searchStation', { stationName: k, page: 1, offset: 30 });
      return (Array.isArray(data) ? data : (data && data.list) || []).map(x => ({
        name: x.stationName || x.station || '', id: x.id || ''
      })).filter(x => x.name);
    }
    const out = [];
    for (let i = 0; i < SNAP.names.length && out.length < 60; i++) {
      if (fuzzyMatch(SNAP.names[i], k)) out.push({ name: SNAP.names[i], id: '' });
    }
    return out;
  },

  /* 附近站点：基于静态坐标；预留 api 模式（未来可用 /station/nearby） */
  async nearby(lat, lng, limit = 20) {
    const list = [];
    STATION_GEO.forEach(v => {
      const d = hav(lat, lng, v.lat, v.lng);
      if (d < 5000) list.push({ name: v.name, lat: v.lat, lng: v.lng, distance: d });
    });
    list.sort((a, b) => a.distance - b.distance);
    return list.slice(0, limit);
  },

  /* 公告：使用已验证的真实接口（非假数据）；失败时抛出异常由 UI 提示 */
  async notices(page = 1, offset = 15) {
    const data = await this.request('noticeList', { page, offset });
    return (data && data.list) || [];
  }
};

/* ---------- 本地存储：收藏 / 历史 / 已读 ---------- */
const Store = {
  read(key, fallback) {
    try { const v = localStorage.getItem('zjbus.' + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem('zjbus.' + key, JSON.stringify(value)); } catch (e) {}
  },
  favStations() { return this.read('favStations', []); },
  toggleFavStation(name) {
    const list = this.favStations(), i = list.indexOf(name);
    if (i > -1) list.splice(i, 1); else list.push(name);
    this.write('favStations', list); return i === -1;
  },
  favLines() { return this.read('favLines', []); },
  toggleFavLine(name) {
    const list = this.favLines(), i = list.indexOf(name);
    if (i > -1) list.splice(i, 1); else list.push(name);
    this.write('favLines', list); return i === -1;
  },
  history() { return this.read('history', []); },
  addHistory(from, to) {
    const list = this.history().filter(h => !(h.from === from && h.to === to));
    list.unshift({ from, to, at: Date.now() });
    this.write('history', list.slice(0, 20));
  },
  removeHistory(at) { this.write('history', this.history().filter(h => h.at !== at)); },
  clearHistory() { this.write('history', []); },
  readNotices() { return this.read('readNotices', []); },
  markNoticeRead(id) {
    const list = this.readNotices();
    if (list.indexOf(id) === -1) { list.push(id); this.write('readNotices', list); }
  },
  markAllNoticesRead(ids) { this.write('readNotices', ids.slice()); }
};
