/* =========================================================
 * site-chrome.js —— 全站公共头部 / 底部（单源、同步注入）
 * 所有页面统一使用同一份头部与底部，避免重复维护。
 * 说明：
 *  - 同步注入（不依赖 fetch），auth.js 在 DOMContentLoaded 取元素时导航已就位。
 *  - 图标使用内联 SVG，不依赖 lucide，避免受页面脚本加载顺序影响。
 *  - 配色读取 DaisyUI 令牌(--b1/--bc/--p...)与 style.css 变量双回退，
 *    使首页(DaisyUI)与内页(style.css)都能跟随明暗主题。
 *  - iframe 嵌入时自动隐藏头部，避免 dev-extensions 被 dashboard 内嵌时头部重复。
 * ========================================================= */

(function () {
  // 被 iframe 嵌入（window.self !== window.top）时不注入共享头部/底部
  if (window.self !== window.top) {
    var b = document.body;
    if (b) {
      var hs = document.getElementById('site-header');
      var fs = document.getElementById('site-footer');
      if (hs) hs.remove();
      if (fs) fs.remove();
    }
    return;
  }

  var ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="5.4"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path><path d="M7 6.2h1.2v3.6"></path><path d="m16.6 14 .8.8-2.9 2.9"></path></svg>'
  };

  var HEADER_HTML = [
    '<header id="siteHeader" class="app-header">',
    '  <div class="app-header__inner">',
    '    <a class="app-header__brand" href="index.html">',
    '      <img src="images/icon.png" alt="MyZone" class="app-header__icon">',
    '      <span class="app-header__name">MyZone</span>',
    '    </a>',
    '    <button id="appBurger" class="app-header__burger" type="button" aria-label="Menu">',
    '      <span class="burger-icon">' + ICONS.menu + '</span>',
    '    </button>',
    '    <nav id="appNav" class="app-header__nav"></nav>',
    '    <div class="app-header__tools">',
    '      <select id="langSelect" class="app-lang" title="Language">',
    '        <option value="zh" data-i18n="lang.zh">中文</option>',
    '        <option value="en" data-i18n="lang.en">English</option>',
    '      </select>',
    '      <button id="themeToggle" class="app-theme" title="切换主题">',
    '        <span class="theme-icon-sun">' + ICONS.sun + '</span>',
    '        <span class="theme-icon-moon hidden">' + ICONS.moon + '</span>',
    '      </button>',
    '      <div id="authGuest" class="app-auth-guest">',
    '        <button id="loginBtn" class="app-btn app-btn--ghost" data-i18n="nav.login">登录</button>',
    '        <button id="signupBtn" class="app-btn app-btn--primary" data-i18n="nav.signup">注册</button>',
    '      </div>',
    '      <div id="userBtn" class="app-user hidden">',
    '        <button id="userBtnAvatar" role="button" type="button" class="app-user__avatar" aria-haspopup="menu">U</button>',
    '        <div id="userMenu" class="app-user__menu hidden">',
    '          <div class="app-user__head">',
    '            <span id="userName">用户</span>',
    '            <span id="userEmail" class="app-user__email">user@example.com</span>',
    '          </div>',
    '          <a href="dashboard.html" class="app-user__item">',
    '            <span class="app-user__icon">' + ICONS.grid + '</span>',
    '            <span data-i18n="nav.dashboard">个人中心</span>',
    '          </a>',
    '          <a href="admin.html" id="adminLink" class="app-user__item hidden">',
    '            <span class="app-user__icon">' + ICONS.shield + '</span>',
    '            <span data-i18n="nav.admin">管理后台</span>',
    '          </a>',
    '          <a href="dev-extensions.html" class="app-user__item">',
    '            <span class="app-user__icon">' + ICONS.code + '</span>',
    '            <span data-i18n="nav.developerCenter">开发者中心</span>',
    '          </a>',
    '          <a href="ai-plan.html" class="app-user__item">',
    '            <span class="app-user__icon">' + ICONS.sparkles + '</span>',
    '            <span data-i18n="cloudAuth.aiPlan">AI PLAN</span>',
    '          </a>',
    '          <button id="logoutBtn" type="button" class="app-user__item app-user__item--danger">',
    '            <span class="app-user__icon">' + ICONS.logout + '</span>',
    '            <span data-i18n="nav.logout">退出登录</span>',
    '          </button>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</header>'
  ].join('\n');

  var FOOTER_HTML = [
    '<footer id="siteFooter" class="app-footer">',
    '  <img src="images/icon.png" alt="" class="app-footer__icon">',
    '  <span class="app-footer__name">MyZone</span>',
    '  <p class="app-footer__copy" data-i18n="footer.copyright">&copy; 2026 MyZone. All rights reserved.</p>',
    '</footer>'
  ].join('\n');

  // 移动端右侧滑入导航抽屉（含导航链接 / 语言切换）
  var DRAWER_HTML = [
    '<div id="appDrawerBackdrop" class="app-drawer-backdrop"></div>',
    '<aside id="appDrawer" class="app-drawer">',
    '  <div class="app-drawer__head">',
    '    <span class="app-drawer__title">MyZone</span>',
    '    <button id="appDrawerClose" class="app-drawer__close" type="button" aria-label="Close">' + ICONS.x + '</button>',
    '  </div>',
    '  <nav id="appDrawerNav" class="app-drawer__nav"></nav>',
    '  <div class="app-drawer__lang">',
    '    <span class="app-drawer__lang-label" title="Language" aria-label="Language">' + ICONS.globe + '</span>',
    '    <div class="app-drawer__lang-btns">',
    '      <button type="button" data-lang="zh" data-i18n="lang.zh">中文</button>',
    '      <button type="button" data-lang="en" data-i18n="lang.en">English</button>',
    '    </div>',
    '  </div>',
    '</aside>'
  ].join('\n');

  // 导航配置：页面可通过 window.siteNav 覆盖；缺省时与首页保持一致（全站头部统一）
  var DEFAULT_NAV = [
    { href: 'index.html#features', label: '功能', i18n: 'nav.features', active: false },
    { href: 'index.html#security', label: '关于', i18n: 'nav.about', active: false },
    { href: 'download.html', label: '下载', i18n: 'nav.download', active: false },
    { href: 'sponsor.html', label: '赞助', i18n: 'nav.sponsor', active: false },
    { href: 'zonemind.html', label: 'ZoneMind', active: false }
  ];
  var config = (window.siteNav && Array.isArray(window.siteNav) && window.siteNav.length) ? window.siteNav : DEFAULT_NAV;

  // 渲染一份导航到两个容器（桌面 .app-header__nav 与移动端抽屉），同一数据源避免重复维护
  function renderNav(id, baseClass) {
    var nav = document.getElementById(id);
    if (!nav || !config.length) return;
    nav.innerHTML = config.map(function (item) {
      var active = item.active ? ' ' + baseClass + '--active' : '';
      return '<a class="' + baseClass + active + '" href="' + item.href + '"' +
        (item.i18n ? ' data-i18n="' + item.i18n + '"' : '') + '>' +
        (item.label || '') + '</a>';
    }).join('');
  }

  var DRAWER = ['appDrawer', 'appDrawerBackdrop'];

  function openDrawer() {
    DRAWER.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('open');
    });
    document.body.classList.add('drawer-open');
  }

  function closeDrawer() {
    DRAWER.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('open');
    });
    document.body.classList.remove('drawer-open');
  }

  function bindDrawer() {
    var burger = document.getElementById('appBurger');
    var drawer = document.getElementById('appDrawer');
    var backdrop = document.getElementById('appDrawerBackdrop');
    var closeBtn = document.getElementById('appDrawerClose');
    if (!burger || !drawer) return;

    burger.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a') || e.target.closest('[data-lang]')) closeDrawer();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
    window.addEventListener('hashchange', closeDrawer);

    // 抽屉内语言切换：与 auth.js 共用全局 i18n 单例，互不冲突
    var btns = [].slice.call(drawer.querySelectorAll('[data-lang]'));
    function syncLang() {
      var cur = (window.i18n && i18n.currentLang) ? i18n.currentLang() : 'zh';
      btns.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-lang') === cur);
      });
      // 同步桌面 langSelect 选中状态（如果存在）
      var desktopSelect = document.getElementById('langSelect');
      if (desktopSelect) {
        desktopSelect.value = cur;
      }
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var lang = b.getAttribute('data-lang');
        if (window.i18n && i18n.setLang) i18n.setLang(lang);
        syncLang();
      });
    });
    syncLang();
  }

  function inject() {
    var headerHost = document.getElementById('site-header');
    var footerHost = document.getElementById('site-footer');
    if (headerHost) headerHost.innerHTML = HEADER_HTML;
    if (footerHost) footerHost.innerHTML = FOOTER_HTML;

    // 先插入抽屉到 DOM，再渲染导航链接
    document.body.insertAdjacentHTML('beforeend', DRAWER_HTML);
    renderNav('appNav', 'app-header__link');
    renderNav('appDrawerNav', 'app-drawer__link');
    bindDrawer();
  }

  inject();
})();