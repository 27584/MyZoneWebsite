let loginBtn, signupBtn, loginModal, closeModal, loginBackdrop;
let tabLogin, tabSignup, modalTitle, authForm, authEmail, authPassword;
let authConfirmPassword, authUsername, confirmPasswordGroup, usernameGroup;
let authError, authSubmit, userBtn, userMenu, userAvatar, userBtnAvatar;
let userName, userEmailEl, logoutBtn, langSelect, themeToggle, themeIconSun, themeIconMoon;
let githubLoginBtn, wakudemoLoginBtn;

let isLoginMode = true;

function showError(message) {
  if (authError) {
    authError.textContent = message;
    authError.classList.remove('hidden');
  }
}

function hideError() {
  if (authError) {
    authError.classList.add('hidden');
  }
}

function toggleAuthMode(isLogin) {
  isLoginMode = isLogin;
  if (isLogin) {
    tabLogin?.classList.add('active');
    tabSignup?.classList.remove('active');
    if (modalTitle) modalTitle.textContent = i18n.t('auth.login');
    if (authSubmit) authSubmit.textContent = i18n.t('auth.login');
    confirmPasswordGroup?.classList.add('hidden');
    usernameGroup?.classList.add('hidden');
  } else {
    tabSignup?.classList.add('active');
    tabLogin?.classList.remove('active');
    if (modalTitle) modalTitle.textContent = i18n.t('auth.signup');
    if (authSubmit) authSubmit.textContent = i18n.t('auth.signup');
    confirmPasswordGroup?.classList.remove('hidden');
    usernameGroup?.classList.remove('hidden');
  }
  hideError();
}

function openModal(mode = 'login') {
  console.log('[Auth] openModal called with mode:', mode);
  console.log('[Auth] loginModal:', loginModal);
  if (loginModal) {
    loginModal.classList.remove('hidden');
    loginModal.classList.add('active');
  }
  toggleAuthMode(mode === 'login');
  authForm?.reset();
}

function closeModalFunc() {
  console.log('[Auth] closeModalFunc called');
  if (loginModal) {
    loginModal.classList.remove('active');
    setTimeout(() => {
      loginModal.classList.add('hidden');
    }, 200);
  }
  hideError();
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  hideError();

  const email = authEmail?.value.trim() || '';
  const password = authPassword?.value.trim() || '';

  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) {
    showError(i18n.t('common.networkError'));
    return;
  }

  try {
    if (isLoginMode) {
      const { data, error } = await appSupabase.client.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        showError(error.message || i18n.t('common.error'));
        return;
      }

      if (data.user) {
        closeModalFunc();
        updateUserMenu(data.user);
        if (window.location.pathname.includes('/dashboard.html')) {
          if (window.loadDashboard) window.loadDashboard();
        }
      }
    } else {
      const confirmPassword = authConfirmPassword?.value.trim() || '';
      const username = authUsername?.value.trim() || '';

      if (password !== confirmPassword) {
        showError(i18n.t('auth.passwordMismatch'));
        return;
      }

      if (username.length < 3) {
        showError(i18n.t('auth.usernameTooShort'));
        return;
      }

      const { data, error } = await appSupabase.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username
          }
        }
      });

      if (error) {
        showError(error.message || i18n.t('auth.signupFailed'));
        return;
      }

      if (data.user) {
        closeModalFunc();
        updateUserMenu(data.user);
      }
    }
  } catch (error) {
    showError(error.message || i18n.t('common.networkError'));
  }
}

// 第三方登录：GitHub（内建）/ Waku（自定义 provider custom:wakudemo）
// 与桌面端一致，走 Supabase signInWithOAuth；网页端 redirectTo 指回当前页面，
// 回调令牌由 supabase-client.js 的 detectSessionInUrl 捕获并转为本地会话。
// 第三方登录：Waku / Gitee 走统一 Edge Function 服务端回调（与桌面端同链路、绕开 GoTrue custom:* bug）
// GitHub 仍走 Supabase 内建 signInWithOAuth。
async function handleOAuthLogin(provider, failKey) {
  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) {
    showError(i18n.t('common.networkError'));
    return;
  }
  // GitHub 内建 provider 维持原逻辑
  if (provider === 'github') {
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const { data, error } = await appSupabase.client.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo }
      });
      if (error) {
        showError(error.message || i18n.t(failKey));
        return;
      }
      if (data && data.url) window.location.href = data.url;
    } catch (error) {
      showError(error.message || i18n.t(failKey));
    }
    return;
  }

  // Waku / Gitee 经 Edge Function：授权→Edge 服务端回调→重定向回本页携带 token
  const providerKey = provider === 'gitee' ? 'gitee' : 'wakudemo';
  const redirectTo = window.location.origin + window.location.pathname;
  try {
    const fnUrl = appSupabase.client.supabaseUrl.replace(/\/$/, '') + '/functions/v1/oauth-identity-bridge';
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: window.SUPABASE_PUBLISHABLE_KEY || '',
        Authorization: 'Bearer ' + (window.SUPABASE_PUBLISHABLE_KEY || '')
      },
      body: JSON.stringify({ provider: providerKey, action: 'authorize', redirect_to: redirectTo })
    });
    const data = await res.json();
    if (!res.ok || !data.authorize_url) {
      showError((data && data.error) || i18n.t(failKey));
      return;
    }
    window.location.href = data.authorize_url;
  } catch (error) {
    showError(error.message || i18n.t(failKey));
  }
}

async function handleLogout() {
  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) return;

  try {
    await appSupabase.client.auth.signOut();
  } catch (error) {
    console.warn('[Auth] signOut 失败（令牌可能已失效），继续清除本地会话', error);
  }

  // signOut 在令牌失效时会抛错导致本地会话残留，这里强制清除本地持久化会话
  const authKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /^sb-.*-auth-token$/.test(k)) authKeys.push(k);
  }
  authKeys.forEach((k) => localStorage.removeItem(k));

  userMenu?.classList.add('hidden');
  userMenu?.classList.remove('open');
  loginBtn?.classList.remove('hidden');
  signupBtn?.classList.remove('hidden');
  userBtn?.classList.add('hidden');

  // 本地调试环境没有 /MyZoneWebsite，直接刷新当前页回到登录态；正式环境跳回官网
  if (/^https?:\/\/(localhost|127\.0\.0\.1)|^file:/.test(location.origin)) {
    window.location.reload();
  } else {
    window.location.href = '/MyZoneWebsite';
  }
}

// 填充头像元素：有 URL 则渲染图片，否则显示兜底字符
function applyAvatar(el, avatarUrl, fallback) {
  if (!el) return;
  el.textContent = '';
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = fallback || 'U';
  }
}
window.applyAvatar = applyAvatar;

async function updateUserMenu(user) {
  const initial = user.email ? user.email.charAt(0).toUpperCase() : 'U';
  let username = user.email || i18n.t('common.error');
  let avatarUrl = '';

  // 从用户资料读取实际保存的用户名与头像，用于导航展示
  try {
    const { data: profile, error } = await appSupabase.client
      .from('user_profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && profile) {
      if (profile.username) username = profile.username;
      avatarUrl = profile.avatar_url || '';
    }
  } catch (e) {
    console.error('Load profile for nav error:', e);
  }

  applyAvatar(userBtnAvatar, avatarUrl, initial);
  applyAvatar(userAvatar, avatarUrl, initial);
  if (userName) userName.textContent = username;
  if (userEmailEl) userEmailEl.textContent = user.email || '';

  loginBtn?.classList.add('hidden');
  signupBtn?.classList.add('hidden');
  userBtn?.classList.remove('hidden');

  const adminLink = document.getElementById('adminLink');
  if (adminLink) {
    adminLink.classList.add('hidden');
  }

  try {
    const { data: isAdmin } = await appSupabase.client.rpc('check_admin_status');
    if (isAdmin && adminLink) {
      adminLink.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Check admin status error:', error);
  }
}

async function checkAuthSession() {
  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) return;

  try {
    const { data, error } = await appSupabase.client.auth.getSession();

    if (error) {
      console.error('Get session error:', error);
      return;
    }

    if (data.session?.user) {
      updateUserMenu(data.session.user);
    }
  } catch (error) {
    console.error('Check auth error:', error);
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('myzone-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcons(theme);
}

function updateThemeIcons(theme) {
  if (themeIconSun && themeIconMoon) {
    if (theme === 'dark') {
      themeIconSun.classList.add('hidden');
      themeIconMoon.classList.remove('hidden');
    } else {
      themeIconSun.classList.remove('hidden');
      themeIconMoon.classList.add('hidden');
    }
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('myzone-theme', newTheme);
  updateThemeIcons(newTheme);
}

function initLangSelect() {
  if (langSelect) {
    langSelect.value = i18n.currentLang();
    langSelect.addEventListener('change', (e) => {
      i18n.setLang(e.target.value);
    });
  }
}

function initElements() {
  loginBtn = document.getElementById('loginBtn');
  signupBtn = document.getElementById('signupBtn');
  loginModal = document.getElementById('loginModal');
  closeModal = document.getElementById('closeModal');
  loginBackdrop = document.getElementById('loginBackdrop');
  tabLogin = document.getElementById('tabLogin');
  tabSignup = document.getElementById('tabSignup');
  modalTitle = document.getElementById('modalTitle');
  authForm = document.getElementById('authForm');
  authEmail = document.getElementById('authEmail');
  authPassword = document.getElementById('authPassword');
  authConfirmPassword = document.getElementById('authConfirmPassword');
  authUsername = document.getElementById('authUsername');
  confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
  usernameGroup = document.getElementById('usernameGroup');
  authError = document.getElementById('authError');
  authSubmit = document.getElementById('authSubmit');
  githubLoginBtn = document.getElementById('githubLoginBtn');
  wakudemoLoginBtn = document.getElementById('wakudemoLoginBtn');
  giteeLoginBtn = document.getElementById('giteeLoginBtn');

  userBtn = document.getElementById('userBtn');
  userMenu = document.getElementById('userMenu');
  userAvatar = document.getElementById('userAvatar');
  userBtnAvatar = document.getElementById('userBtnAvatar');
  userName = document.getElementById('userName');
  userEmailEl = document.getElementById('userEmail');
  logoutBtn = document.getElementById('logoutBtn');

  langSelect = document.getElementById('langSelect');
  themeToggle = document.getElementById('themeToggle');
  themeIconSun = document.querySelector('.theme-icon-sun');
  themeIconMoon = document.querySelector('.theme-icon-moon');
}

function initEventListeners() {
  if (loginBtn) loginBtn.addEventListener('click', () => openModal('login'));
  if (signupBtn) signupBtn.addEventListener('click', () => openModal('signup'));
  if (closeModal) closeModal.addEventListener('click', closeModalFunc);
  if (loginBackdrop) loginBackdrop.addEventListener('click', closeModalFunc);
  if (tabLogin) tabLogin.addEventListener('click', () => toggleAuthMode(true));
  if (tabSignup) tabSignup.addEventListener('click', () => toggleAuthMode(false));
  if (authForm) authForm.addEventListener('submit', handleAuthSubmit);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  if (githubLoginBtn) githubLoginBtn.addEventListener('click', () => handleOAuthLogin('github', 'auth.githubLoginFailed'));
  if (wakudemoLoginBtn) wakudemoLoginBtn.addEventListener('click', () => handleOAuthLogin('wakudemo', 'auth.wakudemoLoginFailed'));
  if (giteeLoginBtn) giteeLoginBtn.addEventListener('click', () => handleOAuthLogin('gitee', 'auth.giteeLoginFailed'));

  if (userBtn) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu?.classList.toggle('hidden');
      userMenu?.classList.toggle('open');
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTheme();
    });
  }

  if (langSelect) {
    langSelect.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', (e) => {
    if (userBtn && userMenu && !userBtn.contains(e.target) && !userMenu.contains(e.target)) {
      userMenu.classList.add('hidden');
      userMenu.classList.remove('open');
    }
  });
}

console.log('[Auth] auth.js loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Auth] DOMContentLoaded triggered');
  
  initElements();
  console.log('[Auth] initElements completed');
  
  if (window.i18n) {
    i18n.init();
    initLangSelect();
    console.log('[Auth] i18n initialized');
  } else {
    console.error('[Auth] i18n not found');
  }
  
  initTheme();
  console.log('[Auth] initTheme completed');
  
  initEventListeners();
  console.log('[Auth] initEventListeners completed');
  
  console.log('[Auth] loginBtn:', loginBtn);
  console.log('[Auth] signupBtn:', signupBtn);
  console.log('[Auth] loginModal:', loginModal);
  
  checkAuthSession();
  console.log('[Auth] checkAuthSession triggered');

  // 统一 Edge Function 回调登录回跳后刷新登录态
  window.addEventListener('myzone-oauth-settled', async () => {
    await checkAuthSession();
    closeModalFunc();
    if (typeof window.loadDashboard === 'function' && window.location.pathname.includes('dashboard')) {
      window.loadDashboard();
    }
  });
});