# 诸暨公交 · 四Tab移动版

> 基于开源项目 [byazlle/zhuji-bus-live](https://github.com/byazlle/zhuji-bus-live) 二次开发：保留基础公交数据能力，重构为「首页 / 去哪 / 公告 / 我的」四Tab简约浅色（粉色主题）移动应用。网页与安卓APP同源，纯前端、无需后端。

**在线体验：<https://0124577.github.io/zhuji-bus-app/>**

**安卓APK：[GitHub Releases 下载](https://github.com/0124577/zhuji-bus-app/releases/latest)**

---

## 功能清单

### Tab1 首页
- **定位获取附近站点**：调用浏览器/APP定位，地图展示当前位置与附近站点（腾讯位置服务 SDK，GCJ-02 坐标）；定位失败自动降级为默认区域站点列表并提示。
- **线路查询**：输入线路名（如 `1路`、`105`）模糊搜索，点击线路查看上行/下行全部站点与首末班时间。
- **收藏站点 / 收藏线路**：站内一键收藏，数据保存在浏览器 localStorage。
- 首页仅保留以上模块，无其他无关入口。

### Tab2 去哪
- **公交换乘规划**：选择起点、终点站点，自动计算方案——优先直达，无直达则给出 1 次 / 2 次换乘方案；展示每段线路、上下车站点、换乘点（预留 5 分钟）、预估总耗时与到达时间；多方案可切换。
- **查询历史**：方案生成后自动保存历史，点击历史可再次查询，支持单条删除与清空。
- **统一站点选择组件**：支持两种方式——①「线路展开」按线路→方向→站点树形选择；②「站点搜索」中文名称模糊匹配（子串 + 子序列）。

### Tab3 公告
- 使用**真实线上接口** `getNoticeList` 加载公交改道、线路调整等公告（非假数据），按日期分组展示。
- 点击列表项进入公告详情页，正文安全过滤后渲染；支持红点未读、全部已读。
- 网络异常时显示错误提示与重试按钮。

### Tab4 我的
- 仅保留「收藏站点」「收藏线路」两个列表，可查看、取消收藏、点击查看详情。无其他功能。

### 严格剔除的需求外功能
乘车码、消息推送、到站订阅、意见反馈等入口与代码均未编写。

---

## 数据说明（静态数据 + 预留实时接口）

- **首期静态数据**：`www/js/data.js` 内联 395 条线路、779 个方向、3061 个站点（来自原项目 `queryLine` 接口快照，约 678 KB），由 `scripts/generate-data.js` 生成。线路查询、站点搜索、附近站点、换乘规划全部基于静态数据完成，离线可用。
- **预留实时 API**：`www/js/config.js` 中 `APP_CONFIG.realtimeApi` 定义了线上接口地址（线路搜索、线路详情、站点搜索、公告、实时车辆），`DataSource` 对每个查询模块提供 `static` / `api` 双模式实现。将 `APP_CONFIG.dataSource` 改为 `'api'` 即可切换到线上实时数据源，无需改动页面代码。
- **公告**使用已验证的真实接口：`https://zjcx.zhuji.gov.cn:9443/gzcx-spaceServer/index/information/getNoticeList`（POST + JSON，接口文档见原仓库 `docs/API-接口文档.md`）。

### 更新静态数据
```bash
node scripts/generate-data.js <原项目 web/index.html 路径>
```

---

## 地图与定位

- 使用**腾讯位置服务 GL JS**（合规地图源），坐标 GCJ-02。`www/index.html` 中通过 `_TMapSecurityConfig` 走 WorkBuddy 内置代理，前端不暴露任何 Key。
- 如需独立部署到自有域名，请到 [腾讯位置服务开放平台](https://lbs.qq.com/dev/console/key/manage) 申请自己的 Key，然后把 `APP_CONFIG.map.mode` 改为 `'key'`、填入 `APP_CONFIG.map.key`，并在开放平台配置 Referer 白名单。
- 定位失败、SDK 不可用或 Key 未配置时，地图区域自动降级为提示 + 附近站点列表，核心功能不受影响。

---

## 网页部署

### 方式一：静态托管（GitHub Pages / Nginx / 任意静态服务器）
直接部署 `www/` 目录即可，入口为 `index.html`：
```bash
python -m http.server 8081 --directory www
# 浏览器访问 http://127.0.0.1:8081/
```
GitHub Pages：仓库 Settings → Pages → Source 选择 `main` 分支根目录（或把 `www/` 内容放到仓库根）。

### 方式二：任意静态云托管
把 `www/` 整个目录上传到 CDN / OSS 静态网站托管即可，无构建步骤、无服务端依赖。

---

## 安卓打包教程（Capacitor）

环境依赖：Node.js 18+、JDK 17、Android SDK（platform 34 + build-tools 34.0.0）。

```bash
npm install
npx cap add android          # 首次
npx cap sync android         # 每次修改 www/ 后
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

- 修改网页代码后只需 `npx cap sync android` 再重新构建。
- `android/local.properties` 中 `sdk.dir` 指向你的 Android SDK 路径。
- 需要的权限：网络（INTERNET）、网络状态、定位（ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION），Capacitor 已自动配置。
- 首次构建会下载 Gradle 8.2.1 与 Android Gradle Plugin，请保持网络畅通。

---

## 自测

```bash
cd tests/e2e
npm install
BASE_URL=http://127.0.0.1:8081/ node app-test.mjs
```
覆盖：基础数据回归、四Tab切换、定位与地图/降级、线路查询与收藏、站点搜索与线路树、换乘规划与历史、公告列表与详情、边界场景（搜索无结果 / 无直达 / 网络异常）、移动端适配。共 29 项断言全通过。

---

## 项目结构

```
zhuji-bus-app/
├── www/                     # 前端源码（Capacitor webDir）
│   ├── index.html           # 页面骨架：四Tab + 详情 + 选择弹层
│   ├── css/app.css          # 浅色粉色主题
│   └── js/
│       ├── config.js        # 数据源 / API / 地图配置
│       ├── data.js          # 静态公交数据快照（生成）
│       ├── core.js          # 数据索引 / DataSource / 本地存储
│       ├── route.js         # 换乘算法
│       ├── map.js           # 腾讯地图 + 定位
│       └── app.js           # UI 渲染与交互
├── scripts/generate-data.js # 静态数据生成器
├── tests/e2e/               # Puppeteer 自测
├── capacitor.config.json
├── package.json
└── android/                 # Capacitor 生成的安卓工程
```

---

## 致谢与许可

静态公交数据来自 [byazlle/zhuji-bus-live](https://github.com/byazlle/zhuji-bus-live) 及其引用的诸暨公交官方接口。本项目遵循原仓库 LICENSE。
