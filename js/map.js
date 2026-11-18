/* ===== 地图模块：腾讯位置服务 GL JS（默认走 WorkBuddy 代理，前端零 Key） =====
   合规说明：仅使用腾讯地图；坐标 GCJ-02；不写 mapStyleId；不引用官方 demo 图片。
   定位失败或 SDK 不可用时自动降级为站点列表，页面功能不受影响。 */

const MapBox = {
  ready: false, failed: false, map: null, markers: null, infoWin: null, sdkLoaded: false,
  center: { lat: APP_CONFIG.defaultCenter.lat, lng: APP_CONFIG.defaultCenter.lng },

  /* 动态加载 SDK：默认场景 URL 不带 key（代理配置已在 head 中设置） */
  loadSdk() {
    if (this.sdkLoaded || window.TMap) { this.sdkLoaded = true; return Promise.resolve(!!window.TMap); }
    const cfg = APP_CONFIG.map;
    let src = 'https://map.qq.com/api/gljs?v=1.exp';
    if (cfg.mode === 'key') {
      if (!cfg.key || cfg.key.indexOf('请到') === 0) return Promise.resolve(false);
      src += '&key=' + encodeURIComponent(cfg.key);
    } else {
      // proxy 模式：WorkBuddy 运行时会替换占位符；独立部署未替换时跳过 SDK，降级为站点列表
      const host = (window._TMapSecurityConfig || {}).serviceHost || '';
      if (host.indexOf('__WB_HTTP_PORT__') > -1) return Promise.resolve(false);
    }
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { this.sdkLoaded = true; resolve(!!window.TMap); };
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
      setTimeout(() => resolve(!!window.TMap), 8000);
    });
  },

  async init(lat, lng) {
    if (lat && lng) this.center = { lat, lng };
    const ok = await this.loadSdk();
    const el = document.getElementById('map');
    if (!ok || !el) { this.showFallback(); return false; }
    try {
      if (!this.map) {
        this.map = new TMap.Map(el, {
          center: new TMap.LatLng(this.center.lat, this.center.lng),
          zoom: 14, pitch: 0, rotation: 0
        });
        this.markers = new TMap.MultiMarker({
          map: this.map,
          styles: {
            station: new TMap.MarkerStyle({
              width: 22, height: 30, anchor: { x: 11, y: 30 },
              src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">' +
                '<path d="M11 0C5 0 0 5 0 11c0 8 11 19 11 19s11-11 11-19C22 5 17 0 11 0z" fill="#ff6b9d" stroke="#fff" stroke-width="2"/>' +
                '<circle cx="11" cy="11" r="4" fill="#fff"/></svg>')
            })
          },
          geometries: []
        });
        this.infoWin = new TMap.InfoWindow({ map: this.map, position: new TMap.LatLng(0, 0), offset: { x: 0, y: -34 }, enableCustom: false });
        this.infoWin.close();
      } else {
        this.map.setCenter(new TMap.LatLng(this.center.lat, this.center.lng));
      }
      this.ready = true;
      document.getElementById('mapFallback').hidden = true;
      el.style.display = '';
      return true;
    } catch (e) {
      this.showFallback();
      return false;
    }
  },

  showFallback() {
    this.failed = true;
    const el = document.getElementById('map');
    const fb = document.getElementById('mapFallback');
    if (el) el.style.display = 'none';
    if (fb) {
      fb.hidden = false;
      const t = document.getElementById('mapFallbackText');
      if (t) t.textContent = '地图暂不可用，已切换为附近站点列表';
    }
  },

  /* 在地图上标注附近站点 */
  renderStations(list) {
    if (!this.ready || !this.markers || !window.TMap) return;
    const geos = list.filter(s => s.lat && s.lng).map((s, i) => ({
      id: 's' + i, styleId: 'station',
      position: new TMap.LatLng(s.lat, s.lng),
      properties: { name: s.name, distance: s.distance }
    }));
    this.markers.setGeometries(geos);
    this.markers.on('click', evt => {
      const p = (evt.geometry || {}).properties || {};
      if (!p.name) return;
      const dist = p.distance < 1000 ? Math.round(p.distance) + ' m' : (p.distance / 1000).toFixed(1) + ' km';
      this.infoWin.setContent('<div style="padding:6px 10px;font-size:13px;color:#2f3542"><b>' + esc(p.name) + '</b><br><span style="color:#98a0ae">距你 ' + dist + '</span></div>');
      this.infoWin.setPosition(evt.geometry.position);
      this.infoWin.open();
    });
  },

  /* 定位：浏览器 Geolocation，失败返回 null（由调用方提示） */
  locate(timeout = 9000) {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout, maximumAge: 60000 }
      );
    });
  }
};
