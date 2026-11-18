/* 应用配置：数据源与地图 */
window.APP_CONFIG = {
  // 数据源模式：static=首期静态数据；api=切换为线上实时数据源
  dataSource: 'static',

  // 线上实时 API（预留，切换 dataSource='api' 后启用）
  realtimeApi: {
    base: 'https://zjcx.zhuji.gov.cn:9443',
    headers: {
      deviceId: 'zjbus_web_app', userToken: 'userToken', codeValue: '330681',
      appCode: '330681', sourceCodeValue: '330681', appVersion: '1.0.0', deviceTypeName: 'weixin'
    },
    endpoints: {
      searchLines: '/gzcx-busServer/client/busLine/searchBusLines',
      queryLine: '/gzcx-busServer/client/busLine/queryLine',
      searchStation: '/gzcx-busServer/client/station/searchStation',
      noticeList: '/gzcx-spaceServer/index/information/getNoticeList',
      vehicles: '/gzcx-busServer/client/bus/vehicle/dynamic/line/details'
    }
  },

  // 地图：proxy=WorkBuddy 内置代理（无需 Key）；key=使用自己申请的腾讯位置服务 Key
  map: {
    mode: 'proxy',
    key: ''
  },

  // 诸暨市中心（定位失败时的默认位置，GCJ-02）
  defaultCenter: { lat: 29.697174, lng: 120.236828 }
};
