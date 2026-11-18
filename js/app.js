/* ===== 应用主逻辑：四 Tab / 站点选择 / 查询收藏 / 换乘 / 公告 / 我的 ===== */

const App = {
  tab: 'home',
  homeSeg: 'near',
  nearStations: [],
  lineResults: [],
  route: { from: '', to: '', plans: [], idx: 0 },
  notices: [],
  picker: { role: 'from', tab: 'search', allowLine: false, expanded: new Set() },
  detail: { type: '', key: '' },

  init() {
    this.bindEvents();
    this.renderHistory();
    this.renderMine();
    this.renderNoticeTip();
    this.refreshNotices();
    this.prepareHome();
  },

  /* ---------------- 事件绑定（统一委托） ---------------- */
  bindEvents() {
    document.getElementById('tabbar').addEventListener('click', e => {
      const b = e.target.closest('.tab');
      if (b) this.switchTab(b.dataset.tab);
    });
    document.getElementById('homeSeg').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) this.setHomeSeg(b.dataset.seg);
    });
    document.getElementById('quickLocate').addEventListener('click', () => this.locateAndShow());
    document.getElementById('reLocate').addEventListener('click', () => this.locateAndShow());
    document.getElementById('quickLine').addEventListener('click', () => {
      this.switchTab('home'); this.setHomeSeg('lines');
      setTimeout(() => document.getElementById('lineQuery').focus(), 50);
    });
    document.getElementById('quickFav').addEventListener('click', () => this.switchTab('mine'));
    document.getElementById('homeSearchBox').addEventListener('click', () => this.openPicker('search', true));
    document.getElementById('lineQuery').addEventListener('input', e => this.searchLines(e.target.value));

    document.getElementById('swapStations').addEventListener('click', () => this.swapRoute());
    document.querySelectorAll('[data-pick]').forEach(b =>
      b.addEventListener('click', () => this.openPicker(b.dataset.pick, false)));
    document.getElementById('planBtn').addEventListener('click', () => this.doPlan());

    document.getElementById('detailBack').addEventListener('click', () => this.closeDetail());
    document.getElementById('detailFav').addEventListener('click', () => this.toggleDetailFav());
    document.getElementById('pickerClose').addEventListener('click', () => this.closePicker());
    document.getElementById('pickerMask').addEventListener('click', e => {
      if (e.target.id === 'pickerMask') this.closePicker();
    });
    document.querySelectorAll('.picker-tabs button').forEach(b =>
      b.addEventListener('click', () => this.setPickerTab(b.dataset.ptab)));
    document.getElementById('pickerQuery').addEventListener('input', e => this.renderPickerSearch(e.target.value));
    document.getElementById('pickerLineQuery').addEventListener('input', e => this.renderPickerTree(e.target.value));

    document.getElementById('mineSeg').addEventListener('click', e => {
      const b = e.target.closest('.seg-btn');
      if (b) { this.mineSeg = b.dataset.seg; this.renderMine(); }
    });
    document.getElementById('readAllBtn').addEventListener('click', () => this.readAllNotices());
    document.getElementById('detailBody').addEventListener('click', e => this.handleDetailClick(e));

    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'fav-station') { this.toggleFav('station', el.dataset.name); e.stopPropagation(); }
      else if (act === 'fav-line') { this.toggleFav('line', el.dataset.name); e.stopPropagation(); }
      else if (act === 'station-detail') this.showStationDetail(el.dataset.name);
      else if (act === 'line-detail') this.showLineDetail(el.dataset.name);
      else if (act === 'pick-plan') { this.route.idx = Number(el.dataset.i); this.renderPlans(); }
      else if (act === 'pick-history') this.pickHistory(Number(el.dataset.at));
      else if (act === 'del-history') { Store.removeHistory(Number(el.dataset.at)); this.renderHistory(); e.stopPropagation(); }
      else if (act === 'clear-history') { Store.clearHistory(); this.renderHistory(); }
      else if (act === 'del-fav-station') { Store.toggleFavStation(el.dataset.name); this.renderMine(); e.stopPropagation(); }
      else if (act === 'del-fav-line') { Store.toggleFavLine(el.dataset.name); this.renderMine(); e.stopPropagation(); }
      else if (act === 'pick-station') this.onStationPicked(el.dataset.name);
      else if (act === 'toggle-tree') this.toggleTree(el.dataset.line);
      else if (act === 'tree-station') this.onStationPicked(el.dataset.name);
      else if (act === 'open-notice') this.showNoticeDetail(Number(el.dataset.id));
      else if (act === 'plan-leg') this.showLineDetail(el.dataset.line);
    });
  },

  /* ---------------- 通用 UI ---------------- */
  switchTab(tab) {
    this.tab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
    const titles = { home: '诸暨公交', go: '去哪', notice: '公告', mine: '我的' };
    document.getElementById('topTitle').textContent = titles[tab];
    document.getElementById('topActions').innerHTML = '';
    window.scrollTo(0, 0);
    if (tab === 'notice') { this.refreshNotices(); this.renderNoticeTip(); }
    if (tab === 'mine') this.renderMine();
    if (tab === 'go') this.renderRouteFields();
  },
  setHomeSeg(seg) {
    this.homeSeg = seg;
    document.querySelectorAll('#homeSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.seg === seg));
    document.getElementById('homeNearPane').hidden = seg !== 'near';
    document.getElementById('homeLinesPane').hidden = seg !== 'lines';
  },
  setPickerTab(tab) {
    this.picker.tab = tab;
    document.querySelectorAll('.picker-tabs button').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
    document.getElementById('pickerSearchPane').hidden = tab !== 'search';
    document.getElementById('pickerTreePane').hidden = tab !== 'tree';
    if (tab === 'tree') this.renderPickerTree(document.getElementById('pickerLineQuery').value);
  },

  /* ---------------- 首页：定位 + 附近站点 + 地图 ---------------- */
  prepareHome() {
    const c = APP_CONFIG.defaultCenter;
    this.nearStations = [];
    this.renderNear([]);
    this.locateAndShow();
  },
  async locateAndShow() {
    const text = document.getElementById('locText');
    text.textContent = '正在获取定位…';
    const pos = await MapBox.locate();
    if (!pos) {
      text.textContent = '定位失败，展示默认区域站点';
      toast('定位失败，已切换到默认区域');
      await MapBox.init(APP_CONFIG.defaultCenter.lat, APP_CONFIG.defaultCenter.lng);
    } else {
      text.textContent = '已定位到你的位置';
      await MapBox.init(pos.lat, pos.lng);
    }
    const center = pos || APP_CONFIG.defaultCenter;
    try {
      const list = await DataSource.nearby(center.lat, center.lng, 30);
      this.nearStations = list;
      this.renderNear(list);
      MapBox.renderStations(list);
    } catch (e) {
      this.renderNear([], '附近站点加载失败');
    }
  },
  renderNear(list, error) {
    document.getElementById('nearCount').textContent = list.length ? '共 ' + list.length + ' 个' : '';
    const box = document.getElementById('nearList');
    if (error || !list.length) { box.innerHTML = '<div class="empty-tip">' + (error || '附近暂无站点，试试线路查询') + '</div>'; return; }
    const favs = Store.favStations();
    box.innerHTML = list.slice(0, 20).map(s => {
      const d = s.distance < 1000 ? Math.round(s.distance) + ' m' : (s.distance / 1000).toFixed(1) + ' km';
      const on = favs.indexOf(s.name) > -1;
      return '<div class="row" data-act="station-detail" data-name="' + esc(s.name) + '">' +
        '<div class="row-main"><div class="row-title">' + esc(s.name) + '</div>' +
        '<div class="row-sub">途经 ' + ((SIDX.byName.get(s.name) || []).length) + ' 个方向</div></div>' +
        '<div class="row-right"><b>' + d + '</b></div>' +
        '<button class="fav-btn ' + (on ? 'on' : '') + '" data-act="fav-station" data-name="' + esc(s.name) + '" aria-label="收藏">' +
        '<svg viewBox="0 0 24 24"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/></svg></button></div>';
    }).join('');
  },

  /* ---------------- 线路查询 ---------------- */
  async searchLines(kw) {
    const box = document.getElementById('lineResult');
    const k = String(kw || '').trim();
    if (!k) { box.innerHTML = '<div class="empty-tip">输入线路名称开始查询</div>'; return; }
    box.innerHTML = '<div class="loading">正在查询…</div>';
    try {
      const list = await DataSource.searchLines(k);
      this.lineResults = list;
      if (!list.length) { box.innerHTML = '<div class="empty-tip">没有找到相关线路</div>'; return; }
      const favs = Store.favLines();
      box.innerHTML = list.map(l => {
        const on = favs.indexOf(l.name) > -1;
        return '<div class="row" data-act="line-detail" data-name="' + esc(l.name) + '">' +
          '<div class="row-main"><div class="row-title"><span class="badge line">' + esc(l.name) + '</span>' + esc(l.from || '') + ' → ' + esc(l.to || '') + '</div>' +
          '<div class="row-sub">点击查看全部站点</div></div>' +
          '<button class="fav-btn ' + (on ? 'on' : '') + '" data-act="fav-line" data-name="' + esc(l.name) + '" aria-label="收藏">' +
          '<svg viewBox="0 0 24 24"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/></svg></button></div>';
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="empty-tip">网络异常，请稍后重试</div>';
    }
  },

  /* ---------------- 站点选择弹层（线路展开 + 搜索） ---------------- */
  openPicker(role, allowLine) {
    this.picker.role = role;
    this.picker.allowLine = !!allowLine;
    this.picker.expanded.clear();
    document.getElementById('pickerTitle').textContent =
      role === 'from' ? '选择起点站' : role === 'to' ? '选择终点站' : '查线路、站点';
    document.getElementById('pickerQuery').value = '';
    document.getElementById('pickerLineQuery').value = '';
    document.getElementById('pickerMask').classList.add('on');
    this.setPickerTab('search');
    setTimeout(() => document.getElementById('pickerQuery').focus(), 80);
  },
  closePicker() { document.getElementById('pickerMask').classList.remove('on'); },
  async renderPickerSearch(kw) {
    const box = document.getElementById('pickerSearchResult');
    const k = String(kw || '').trim();
    if (!k) { box.innerHTML = '<div class="empty-tip">输入站名关键词，如 火车站、西施</div>'; return; }
    box.innerHTML = '<div class="loading">搜索中…</div>';
    try {
      const stations = await DataSource.searchStations(k);
      let html = '';
      if (this.picker.allowLine) {
        const lines = await DataSource.searchLines(k);
        if (lines.length) {
          html += '<div class="section-title" style="margin:4px 2px">线路</div>' +
            lines.slice(0, 10).map(l => '<button class="pick-row" data-act="line-detail" data-name="' + esc(l.name) + '">' +
              '<span class="badge line">' + esc(l.name) + '</span><span class="row-title">' + esc(l.from || '') + ' → ' + esc(l.to || '') + '</span></button>').join('');
        }
      }
      if (stations.length) {
        html += '<div class="section-title" style="margin:8px 2px 4px">站点</div>' +
          stations.map(s => '<button class="pick-row" data-act="pick-station" data-name="' + esc(s.name) + '">' +
            '<span class="dot dot-start"></span><span class="row-title">' + esc(s.name) + '</span>' +
            '<span class="row-sub">' + ((SIDX.byName.get(s.name) || []).length) + ' 条</span></button>').join('');
      }
      box.innerHTML = html || '<div class="empty-tip">没有找到相关站点</div>';
    } catch (e) {
      box.innerHTML = '<div class="empty-tip">网络异常，请稍后重试</div>';
    }
  },
  renderPickerTree(kw) {
    const box = document.getElementById('pickerTreeResult');
    const k = String(kw || '').trim();
    const lines = SEED_LINES.filter(l => fuzzyMatch(l[0], k)).slice(0, 300);
    if (!lines.length) { box.innerHTML = '<div class="empty-tip">没有找到相关线路</div>'; return; }
    box.innerHTML = lines.map(l => {
      const open = this.picker.expanded.has(l[0]);
      let body = '';
      if (open) {
        const dirs = SIDX.byLine.get(l[0]) || [];
        body = '<div class="tree-body">' + dirs.map(d => {
          const names = d.stops.map(stopName);
          return '<div class="tree-dir"><div class="tree-dir-label">' + esc(dirLabel(d)) + ' · ' + names.length + ' 站</div>' +
            names.map(n => '<button class="tree-station" data-act="tree-station" data-name="' + esc(n) + '"><span>' + esc(n) + '</span><span style="color:#c8cdd6">›</span></button>').join('') +
            '</div>';
        }).join('') + '</div>';
      }
      return '<div class="tree-line"><button class="tree-head ' + (open ? 'open' : '') + '" data-act="toggle-tree" data-line="' + esc(l[0]) + '">' +
        '<span><span class="badge line">' + esc(l[0]) + '</span>' + esc(l[1] || '') + ' → ' + esc(l[2] || '') + '</span>' +
        '<svg class="arrow" style="width:15px;height:15px" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' + body + '</div>';
    }).join('');
  },
  toggleTree(line) {
    if (this.picker.expanded.has(line)) this.picker.expanded.delete(line);
    else this.picker.expanded.add(line);
    this.renderPickerTree(document.getElementById('pickerLineQuery').value);
  },
  onStationPicked(name) {
    if (this.picker.role === 'from') this.route.from = name;
    else if (this.picker.role === 'to') this.route.to = name;
    else { this.closePicker(); this.showStationDetail(name); return; }
    this.closePicker();
    this.renderRouteFields();
  },

  /* ---------------- 去哪：换乘规划 + 历史 ---------------- */
  renderRouteFields() {
    document.getElementById('routeFromName').textContent = this.route.from || '选择起点站';
    document.getElementById('routeToName').textContent = this.route.to || '选择终点站';
    document.getElementById('routeFromName').classList.toggle('empty', !this.route.from);
    document.getElementById('routeToName').classList.toggle('empty', !this.route.to);
  },
  swapRoute() {
    const t = this.route.from; this.route.from = this.route.to; this.route.to = t;
    this.renderRouteFields();
  },
  doPlan() {
    const { from, to } = this.route;
    const box = document.getElementById('goContent');
    if (!from || !to) { toast('请选择起点和终点站'); return; }
    if (from === to) { box.innerHTML = '<div class="empty-tip">起点和终点相同，请重新选择</div>'; return; }
    box.innerHTML = '<div class="loading">正在计算公交方案…</div>';
    setTimeout(() => {
      const plans = planRoute(from, to);
      this.route.plans = plans; this.route.idx = 0;
      if (!plans.length) {
        box.innerHTML = '<div class="empty-tip">暂未找到从「' + esc(from) + '」到「' + esc(to) + '」的公交方案</div>';
        return;
      }
      Store.addHistory(from, to);
      this.renderHistory();
      this.renderPlans();
    }, 40);
  },
  renderPlans() {
    const { plans, idx, from, to } = this.route;
    const box = document.getElementById('goContent');
    const tabs = plans.map((p, i) => '<button class="plan-tab ' + (i === idx ? 'active' : '') + '" data-act="pick-plan" data-i="' + i + '">' +
      '<b>方案 ' + (i + 1) + '</b>' + (p.transfers === 0 ? '直达' : '换乘 ' + p.transfers + ' 次') + ' · ' + p.total + '分钟</button>').join('');
    const p = plans[idx];
    let nodes = '<div class="tnode"><div class="tt">' + esc(from) + '</div><div class="td">起点</div></div>';
    p.legs.forEach((l, i) => {
      const last = i === p.legs.length - 1;
      nodes += '<div class="tnode"><div class="tt"><span class="ride-badge">' + esc(l.line) + '</span>' + esc(l.label) + '</div>' +
        '<div class="td">' + esc(l.from) + ' 上车 · ' + esc(l.stops) + ' 站 / 约 ' + l.minutes + ' 分钟</div>' +
        '<div class="td">' + esc(l.to) + (last ? ' 下车（终点）' : ' 下车换乘') + '</div>' +
        (last ? '' : '<div class="transfer-note">同站换乘，已预留 5 分钟</div>') + '</div>';
    });
    nodes += '<div class="tnode"><div class="tt">' + esc(to) + '</div><div class="td">终点 · 预计 ' + minHM(p.arrive) + ' 到达</div></div>';
    box.innerHTML = '<div class="plan-tabs">' + tabs + '</div>' +
      '<div class="plan-sum">预计用时 <b>' + p.total + ' 分钟</b> · 乘车 ' + p.ride + ' 分钟' +
      (p.transfers ? ' · 换乘预留 ' + (p.transfers * 5) + ' 分钟' : ' · 无需换乘') +
      '<br>预计 ' + minHM(p.arrive) + ' 到达终点</div>' +
      '<div class="timeline">' + nodes + '</div>' +
      '<div class="route-tip">点击线路徽标可查看该线路全部站点</div>';
    box.querySelectorAll('.plan-tab').forEach(b => b.addEventListener('click', () => {
      this.route.idx = Number(b.dataset.i); this.renderPlans();
    }));
    box.querySelectorAll('.ride-badge').forEach(b => b.addEventListener('click', () => this.showLineDetail(b.textContent.trim())));
  },
  renderHistory() {
    const list = Store.history();
    document.getElementById('historyCount').textContent = list.length ? '共 ' + list.length + ' 条' : '';
    const box = document.getElementById('historyList');
    if (!list.length) { box.innerHTML = '<div class="empty-tip">你还没有查询过哦~</div>'; return; }
    box.innerHTML = list.map(h => '<div class="row" data-act="pick-history" data-at="' + h.at + '">' +
      '<div class="row-main"><div class="row-title">' + esc(h.from) + ' → ' + esc(h.to) + '</div>' +
      '<div class="row-sub">' + new Date(h.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div></div>' +
      '<button class="fav-btn" data-act="del-history" data-at="' + h.at + '" aria-label="删除"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg></button></div>').join('') +
      '<button class="empty-tip" data-act="clear-history" style="background:transparent">清空历史</button>';
  },
  pickHistory(at) {
    const h = Store.history().find(x => x.at === at);
    if (!h) return;
    this.route.from = h.from; this.route.to = h.to;
    this.renderRouteFields(); this.doPlan();
  },

  /* ---------------- 收藏 ---------------- */
  toggleFav(type, name) {
    const on = type === 'station' ? Store.toggleFavStation(name) : Store.toggleFavLine(name);
    toast(on ? '已加入收藏' : '已取消收藏');
    if (this.homeSeg === 'near' && this.tab === 'home') this.renderNear(this.nearStations);
    if (this.tab === 'home' && this.homeSeg === 'lines') this.searchLines(document.getElementById('lineQuery').value);
    if (this.tab === 'mine') this.renderMine();
    this.updateDetailFav();
  },
  renderMine() {
    this.mineSeg = this.mineSeg || 'stations';
    document.querySelectorAll('#mineSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.seg === this.mineSeg));
    const box = document.getElementById('mineContent');
    const stations = Store.favStations(), lines = Store.favLines();
    const list = this.mineSeg === 'stations' ? stations : lines;
    if (!list.length) {
      box.innerHTML = '<div class="empty-tip">' + (this.mineSeg === 'stations' ? '还没有收藏站点' : '还没有收藏线路') + '</div>';
      return;
    }
    const act = this.mineSeg === 'stations' ? 'del-fav-station' : 'del-fav-line';
    const detailAct = this.mineSeg === 'stations' ? 'station-detail' : 'line-detail';
    box.innerHTML = list.map(name => '<div class="row" data-act="' + detailAct + '" data-name="' + esc(name) + '">' +
      '<div class="row-main"><div class="row-title">' + (this.mineSeg === 'lines' ? '<span class="badge line">' + esc(name) + '</span>' : '<span class="badge">' + esc(name) + '</span>') + '</div>' +
      '<div class="row-sub">' + (this.mineSeg === 'stations' ? '途经 ' + (SIDX.byName.get(name) || []).length + ' 个方向' : '点击查看站点列表') + '</div></div>' +
      '<button class="fav-btn on" data-act="' + act + '" data-name="' + esc(name) + '" aria-label="取消收藏"><svg viewBox="0 0 24 24" style="fill:currentColor"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/></svg></button></div>').join('');
  },

  /* ---------------- 详情页：站点 / 线路 / 公告 ---------------- */
  showStationDetail(name) {
    this.detail = { type: 'station', key: name };
    document.getElementById('detailTitle').textContent = name;
    const btn = document.getElementById('detailFav');
    btn.hidden = false;
    btn.classList.toggle('on', Store.favStations().indexOf(name) > -1);
    const entries = SIDX.byName.get(name) || [];
    const groups = new Map();
    entries.forEach(e => {
      if (!groups.has(e.dir.line)) groups.set(e.dir.line, []);
      groups.get(e.dir.line).push(e);
    });
    let html = '<div class="detail-card"><h2>' + esc(name) + '</h2><div class="detail-meta">途经 ' + groups.size + ' 条线路 · ' + entries.length + ' 个方向</div></div>';
    if (!groups.size) html += '<div class="empty-tip">该站点暂无线路信息</div>';
    groups.forEach((list, line) => {
      html += '<div class="detail-card"><div class="row-title" style="margin-bottom:6px"><span class="badge line">' + esc(line) + '</span></div>' +
        list.map(e => '<div class="detail-station" data-act="plan-leg" data-line="' + esc(line) + '">' +
          '<span class="station-order">' + e.order + '</span><span class="row-title">' + esc(dirLabel(e.dir)) + '</span>' +
          '<span class="row-sub">第 ' + e.order + ' 站</span></div>').join('') + '</div>';
    });
    document.getElementById('detailBody').innerHTML = html;
    document.getElementById('detailPage').classList.add('on');
  },
  async showLineDetail(name) {
    this.closePicker();
    this.detail = { type: 'line', key: name };
    document.getElementById('detailTitle').textContent = name;
    const btn = document.getElementById('detailFav');
    btn.hidden = false;
    btn.classList.toggle('on', Store.favLines().indexOf(name) > -1);
    document.getElementById('detailBody').innerHTML = '<div class="loading">正在加载线路站点…</div>';
    document.getElementById('detailPage').classList.add('on');
    try {
      const info = await DataSource.queryLine(name);
      if (!info || !info.dirs.length) { document.getElementById('detailBody').innerHTML = '<div class="empty-tip">没有找到该线路</div>'; return; }
      let html = '<div class="detail-card"><h2>' + esc(name) + '</h2><div class="detail-meta">' + info.dirs.length + ' 个方向</div></div>';
      info.dirs.forEach(d => {
        html += '<div class="detail-card"><div class="row-title" style="margin-bottom:8px">' + esc(dirLabel(d)) +
          (d.first || d.last ? '<span class="detail-meta" style="float:right;margin:0">' + esc(d.first) + '-' + esc(d.last) + '</span>' : '') + '</div>' +
          d.stops.map((s, i) => '<div class="detail-station"><span class="station-order">' + (i + 1) + '</span><span class="row-title">' + esc(s.name) + '</span></div>').join('') + '</div>';
      });
      document.getElementById('detailBody').innerHTML = html;
    } catch (e) {
      document.getElementById('detailBody').innerHTML = '<div class="empty-tip">网络异常，请稍后重试</div>';
    }
  },
  closeDetail() { document.getElementById('detailPage').classList.remove('on'); },
  toggleDetailFav() {
    const d = this.detail;
    if (!d.key) return;
    this.toggleFav(d.type, d.key);
  },
  updateDetailFav() {
    const d = this.detail;
    const btn = document.getElementById('detailFav');
    if (!d.key || btn.hidden) return;
    const favs = d.type === 'station' ? Store.favStations() : Store.favLines();
    btn.classList.toggle('on', favs.indexOf(d.key) > -1);
  },
  handleDetailClick(e) {
    const el = e.target.closest('[data-act="plan-leg"]');
    if (el) this.showLineDetail(el.dataset.line);
  },

  /* ---------------- 公告：真实接口 ---------------- */
  renderNoticeTip() {
    const read = Store.readNotices();
    const unread = this.notices.filter(n => read.indexOf(n.id) === -1).length;
    document.getElementById('noticeTip').textContent = unread ? unread + ' 条未读公告 · 公交改道与线路调整' : '公交改道、线路调整通知';
    document.getElementById('noticeDot').classList.toggle('on', unread > 0);
  },
  async refreshNotices() {
    const box = document.getElementById('noticeList');
    box.innerHTML = '<div class="loading">正在加载公告…</div>';
    try {
      const list = await DataSource.notices(1, 30);
      this.notices = list;
      if (!list.length) { box.innerHTML = '<div class="empty-tip">没有公告了哦~</div>'; this.renderNoticeTip(); return; }
      const read = Store.readNotices();
      let html = '', lastDate = '';
      list.forEach(n => {
        const date = (n.publishDate || '').slice(0, 10);
        if (date !== lastDate) { html += '<div class="notice-date">' + esc(date) + '</div>'; lastDate = date; }
        const abstract = n.abstracts || stripHtml(n.publishContent || '').slice(0, 60);
        html += '<div class="notice-card" data-act="open-notice" data-id="' + n.id + '">' +
          (read.indexOf(n.id) === -1 ? '<i class="reddot"></i>' : '') +
          '<h3>' + esc(n.title || '公告') + '</h3><p>' + esc(abstract) + '</p>' +
          '<div class="notice-source">' + esc(n.publishUnit || '') + '</div>' +
          '<div class="detail-link"><span>查看详情</span><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></div></div>';
      });
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = '<div class="empty-tip">公告加载失败，请检查网络后重试<br><button data-act="retry-notice" style="color:#ff6b9d;margin-top:8px">重新加载</button></div>';
      const btn = box.querySelector('[data-act="retry-notice"]');
      if (btn) btn.addEventListener('click', () => this.refreshNotices());
    }
    this.renderNoticeTip();
  },
  readAllNotices() {
    if (!this.notices.length) return;
    Store.markAllNoticesRead(this.notices.map(n => n.id));
    this.refreshNotices();
    toast('已全部标记为已读');
  },
  showNoticeDetail(id) {
    const n = this.notices.find(x => x.id === id);
    if (!n) return;
    Store.markNoticeRead(id);
    this.renderNoticeTip();
    this.detail = { type: 'notice', key: id };
    document.getElementById('detailTitle').textContent = '公告详情';
    document.getElementById('detailFav').hidden = true;
    document.getElementById('detailBody').innerHTML =
      '<div class="detail-card"><h2>' + esc(n.title || '公告') + '</h2>' +
      '<div class="detail-meta">' + esc(n.publishDate || '') + ' · ' + esc(n.publishUnit || '') + '</div>' +
      '<div class="notice-content">' + sanitizeHtml(n.publishContent || '') + '</div></div>';
    document.getElementById('detailPage').classList.add('on');
  }
};

/* 公告正文安全过滤：仅保留常见排版标签与安全属性 */
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function sanitizeHtml(html) {
  const allowTags = new Set(['P', 'BR', 'DIV', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'IMG', 'H1', 'H2', 'H3', 'TABLE', 'TR', 'TD']);
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = String(html || '');
  const walk = node => {
    [...node.children].forEach(el => {
      if (!allowTags.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        const ok = (n === 'src' && el.tagName === 'IMG' && /^https:\/\//i.test(a.value)) || (n === 'style' && !/expression|url\(/i.test(a.value));
        if (!ok) el.removeAttribute(a.name);
      });
      walk(el);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/* 安卓返回键：详情页 / 弹层优先关闭 */
window.androidBack = function () {
  if (document.getElementById('pickerMask').classList.contains('on')) { App.closePicker(); return false; }
  if (document.getElementById('detailPage').classList.contains('on')) { App.closeDetail(); return false; }
  if (App.tab !== 'home') { App.switchTab('home'); return false; }
  return true;
};

document.addEventListener('DOMContentLoaded', () => App.init());
