const usersList = document.getElementById('usersList');
const codesList = document.getElementById('codesList');
const addCodeBtn = document.getElementById('addCodeBtn');
const batchDeleteCodesBtn = document.getElementById('batchDeleteCodesBtn');
const addCodesForm = document.getElementById('addCodesForm');
const codeCount = document.getElementById('codeCount');
const codeType = document.getElementById('codeType');
const codeDays = document.getElementById('codeDays');
const creditsAmount = document.getElementById('creditsAmount');
const creditsValidDays = document.getElementById('creditsValidDays');
const codeDaysGroup = document.getElementById('codeDaysGroup');
const codeDaysLabel = document.querySelector('#codeDaysGroup label');
const creditsGroup = document.getElementById('creditsGroup');
const creditsValidGroup = document.getElementById('creditsValidGroup');
const codeExpireDays = document.getElementById('codeExpireDays');
const codeMaxUses = document.getElementById('codeMaxUses');
const codesError = document.getElementById('codesError');
const codePlanGroup = document.getElementById('codePlanGroup');
const codePlanId = document.getElementById('codePlanId');
const plansList = document.getElementById('plansList');
const planForm = document.getElementById('planForm');
const planError = document.getElementById('planError');
let selectedCodeIds = [];

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showLoading(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path class="animate-spin" d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
      </div>
      <p>${i18n.t('common.loading')}</p>
    </div>
  `;
}

function showErrorState(container, message) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <p>${message}</p>
      <button class="btn btn-secondary" onclick="loadAdminPage()">${i18n.t('common.error')}</button>
    </div>
  `;
}

async function getCurrentUser() {
  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) return null;
  
  const { data } = await appSupabase.client.auth.getSession();
  return data.session?.user || null;
}

async function checkAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;

  try {
    const { data: profile, error } = await appSupabase.client
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (error || !profile?.is_admin) {
      return false;
    }
    return true;
  } catch (error) {
    console.error('Check admin error:', error);
    return false;
  }
}

async function loadUsers() {
  showLoading(usersList);

  try {
    const { data: users, error } = await appSupabase.client.rpc('admin_list_users');

    if (error) {
      console.error('Load users error:', error);
      showErrorState(usersList, i18n.t('common.error'));
      return;
    }

    if (!users || users.length === 0) {
    usersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </div>
        <p>${i18n.t('users.empty')}</p>
      </div>
    `;
    return;
  }

    usersList.innerHTML = users.map(user => `
      <div class="user-card">
        <div class="user-info">
          <div class="user-icon">${user.email ? user.email.charAt(0).toUpperCase() : 'U'}</div>
          <div class="user-details">
            <h4>${user.username || user.email}</h4>
            <p>${user.email} · ${new Date(user.created_at).toLocaleDateString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</p>
            <p>${user.is_admin ? `<span style="color:#6366f1">${i18n.t('profile.proStatus')}</span>` : `<span style="color:#a1a1aa">${i18n.t('profile.normalStatus')}</span>`}</p>
          </div>
        </div>
        <div class="user-actions">
          <button class="action-btn edit" onclick="viewUserDetail('${user.user_id}')">${i18n.t('admin.userDetail')}</button>
          <button class="action-btn ${user.is_admin ? 'delete' : 'primary'}" onclick="${user.is_admin ? `removeAdmin('${user.user_id}')` : `makeAdmin('${user.user_id}')`}">
            ${user.is_admin ? i18n.t('admin.removeAdmin') : i18n.t('admin.makeAdmin')}
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load users error:', error);
    showErrorState(usersList, i18n.t('common.networkError'));
  }
}

async function viewUserDetail(userId) {
  try {
    const { data: user, error } = await appSupabase.client.rpc('admin_get_user_detail', { target_user_id: userId });

    if (error) {
      console.error('Get user detail error:', error);
      alert(i18n.t('common.error'));
      return;
    }

    const modal = document.getElementById('userDetailModal');
    const content = document.getElementById('userDetailContent');

    const providerNames = {
      aliyun: i18n.t('cloud.providers.aliyun'),
      tencent: i18n.t('cloud.providers.tencent'),
      baidu: i18n.t('cloud.providers.baidu'),
      dropbox: 'Dropbox',
      onedrive: 'OneDrive',
      google: 'Google Drive'
    };

    content.innerHTML = `
      <div class="detail-section">
        <h3>${i18n.t('users.detail.basicInfo')}</h3>
        <div class="detail-grid">
          <div>
            <span class="detail-label">${i18n.t('users.detail.username')}</span>
            <span>${user.username || '-'}</span>
          </div>
          <div>
            <span class="detail-label">${i18n.t('users.detail.email')}</span>
            <span>${user.email || '-'}</span>
          </div>
          <div>
            <span class="detail-label">${i18n.t('users.detail.createdAt')}</span>
            <span>${new Date(user.created_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</span>
          </div>
          <div>
            <span class="detail-label">${i18n.t('users.detail.isAdmin')}</span>
            <span>${user.is_admin ? i18n.t('users.detail.yes') : i18n.t('users.detail.no')}</span>
          </div>
        </div>
      </div>
      <div class="detail-section">
        <h3>${i18n.t('users.detail.devices')} (${user.devices?.length || 0})</h3>
        ${user.devices && user.devices.length > 0 ? `
          <table class="detail-table">
            <thead>
              <tr><th>${i18n.t('users.detail.deviceName')}</th><th>${i18n.t('users.detail.os')}</th><th>${i18n.t('users.detail.created')}</th></tr>
            </thead>
            <tbody>
              ${user.devices.map(d => `
                <tr>
                  <td>${d.device_name}</td>
                  <td>${d.os_type || '-'}</td>
                  <td>${new Date(d.created_at).toLocaleDateString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p style="color:#a1a1aa">${i18n.t('users.detail.noDevices')}</p>`}
      </div>
      <div class="detail-section">
        <h3>${i18n.t('users.detail.cloudSpaces')} (${user.cloud_spaces?.length || 0})</h3>
        ${user.cloud_spaces && user.cloud_spaces.length > 0 ? `
          <table class="detail-table">
            <thead>
              <tr><th>${i18n.t('users.detail.name')}</th><th>${i18n.t('users.detail.provider')}</th><th>${i18n.t('users.detail.syncStatus')}</th></tr>
            </thead>
            <tbody>
              ${user.cloud_spaces.map(s => `
                <tr>
                  <td>${s.name}</td>
                  <td>${providerNames[s.provider] || s.provider}</td>
                  <td>${s.sync_enabled ? i18n.t('users.detail.enabled') : i18n.t('users.detail.disabled')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p style="color:#a1a1aa">${i18n.t('users.detail.noSpaces')}</p>`}
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('active');
  } catch (error) {
    console.error('View user detail error:', error);
  }
}

function closeUserDetailModal() {
  const modal = document.getElementById('userDetailModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

async function makeAdmin(userId) {
  if (!confirm(i18n.t('admin.makeAdminConfirm'))) return;

  try {
    const { error } = await appSupabase.client.rpc('admin_make_admin', { user_id: userId });

    if (error) {
      console.error('Make admin error:', error);
      alert(i18n.t('common.error'));
      return;
    }

    alert(i18n.t('common.success'));
    loadUsers();
  } catch (error) {
    console.error('Make admin error:', error);
  }
}

async function removeAdmin(userId) {
  if (!confirm(i18n.t('admin.removeAdminConfirm'))) return;

  try {
    const { error } = await appSupabase.client.rpc('admin_remove_admin', { user_id: userId });

    if (error) {
      console.error('Remove admin error:', error);
      alert(i18n.t('common.error'));
      return;
    }

    alert(i18n.t('common.success'));
    loadUsers();
  } catch (error) {
    console.error('Remove admin error:', error);
  }
}

async function loadCodes() {
  showLoading(codesList);

  try {
    const { data: codes, error } = await appSupabase.client.rpc('admin_list_codes');

    if (error) {
      console.error('Load codes error:', error);
      showErrorState(codesList, i18n.t('common.error'));
      return;
    }

    if (!codes || codes.length === 0) {
      codesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <p>${i18n.t('codes.empty')}</p>
        </div>
      `;
      return;
    }

    // 按「除激活码值以外的属性」分组合并，展开后可查看/复制组内各激活码
    const groupsMap = new Map();
    for (const code of codes) {
      const key = groupCodeKey(code);
      if (!groupsMap.has(key)) groupsMap.set(key, { meta: code, items: [] });
      groupsMap.get(key).items.push(code);
    }
    codesList.innerHTML = Array.from(groupsMap.values()).map(renderCodeGroup).join('');
    updateBatchDeleteBtn();
  } catch (error) {
    console.error('Load codes error:', error);
    showErrorState(codesList, i18n.t('common.networkError'));
  }
}

function codeTypeLabel(type) {
  if (type === 'credits') return i18n.t('codes.creditsCode');
  if (type === 'plan') return i18n.t('codes.planCode');
  return i18n.t('codes.proCode');
}

// 生成分组键：除激活码值本身外的所有属性一致即为同一组
function groupCodeKey(code) {
  return [
    code.code_type,
    code.duration_days,
    code.credits_amount ?? '',
    code.credits_valid_days ?? '',
    code.plan_id ?? '',
    code.max_uses,
    code.is_active ? '1' : '0',
    code.expires_at ?? ''
  ].join('|');
}

function locale() {
  return i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US';
}

// 公共属性描述（该组各激活码一致）
function codeAttrHtml(code) {
  if (code.code_type === 'credits') {
    return `${i18n.t('codes.creditsAmount')}: ${code.credits_amount} · ${i18n.t('codes.creditsValidDays')}: ${code.credits_valid_days > 0 ? code.credits_valid_days + i18n.t('admin.days') : i18n.t('admin.permanent')}`;
  }
  if (code.code_type === 'plan') {
    let s = `${i18n.t('codes.plan')}: ${code.plan_name ? escapeHtml(code.plan_name) : '--'}`;
    if (code.duration_days > 0) s += ` · ${i18n.t('codes.planDuration')}: ${code.duration_days}${i18n.t('admin.days')}`;
    return s;
  }
  return `${i18n.t('codes.duration')}: ${code.duration_days}${i18n.t('admin.days')}`;
}

// 有效期限 + 激活状态
function codeValidHtml(code) {
  const expire = code.expires_at
    ? new Date(code.expires_at).toLocaleDateString(locale())
    : i18n.t('admin.permanent');
  const disabled = !code.is_active ? `<span class="code-group-disabled">${i18n.t('admin.disabled')}</span>` : '';
  return `${i18n.t('codes.expireAt')}: ${expire} ${disabled}`;
}

function renderCodeGroup(group) {
  const meta = group.meta;
  const items = group.items;
  const used = items.filter(i => i.used_count >= i.max_uses).length;
  const disabled = items.filter(i => !i.is_active).length;
  const available = items.filter(i => i.used_count < i.max_uses && i.is_active).length;

  const itemRows = items.map(code => {
    const usedUp = code.used_count >= code.max_uses;
    const inactive = !code.is_active;
    let statusCls = 'unused';
    let statusText = i18n.t('admin.unused');
    if (inactive) { statusCls = 'disabled'; statusText = i18n.t('admin.disabled'); }
    else if (usedUp) { statusCls = 'used'; statusText = i18n.t('admin.used'); }
    const redeemedBy = code.redeemed_by || [];
    const redeemedHtml = redeemedBy.length > 0
      ? `<span class="code-group-redeemed">${redeemedBy.map(r =>
            `${i18n.t('codes.redeemedBy')}: ${escapeHtml(r.username)} (${escapeHtml(r.email)}) · ${new Date(r.redeemed_at).toLocaleString(locale())}`
          ).join('；')}</span>`
      : '';
    return `
      <div class="code-group-item" data-code-id="${code.code_id}" data-used="${usedUp ? '1' : '0'}" data-inactive="${inactive ? '1' : '0'}">
        <input type="checkbox" class="code-checkbox" value="${code.code_id}" onchange="toggleCodeSelection(this)">
        <span class="code-group-item-code">${escapeHtml(code.code)}</span>
        <span class="code-group-item-status ${statusCls}">${statusText}</span>
        <span class="code-group-item-used">${i18n.t('codes.usage')}: ${code.used_count}/${code.max_uses}</span>
        ${redeemedHtml}
        <div class="code-group-item-actions">
          <button class="action-btn" onclick="copySingleCode(this)" data-code="${escapeHtml(code.code)}">${i18n.t('admin.copy')}</button>
          <button class="action-btn delete" onclick="deleteCode('${code.code_id}')">${i18n.t('admin.deleteCode')}</button>
        </div>
      </div>
    `;
  }).join('');

  const toolbar = `
    <div class="code-group-toolbar">
      <span class="code-group-toolbar-label">${i18n.t('admin.selectAll')}:</span>
      <button class="action-btn" onclick="selectGroupStatus(this, 'all')">${i18n.t('admin.selectAll')}</button>
      <button class="action-btn" onclick="selectGroupStatus(this, 'unused')">${i18n.t('admin.unused')}</button>
      <button class="action-btn" onclick="selectGroupStatus(this, 'used')">${i18n.t('admin.used')}</button>
      <button class="action-btn" onclick="selectGroupStatus(this, 'disabled')">${i18n.t('admin.disabled')}</button>
      <button class="action-btn" onclick="selectGroupStatus(this, 'none')">${i18n.t('admin.selectNone')}</button>
    </div>
  `;

  const headerActions = `
    <button class="action-btn" onclick="copyGroupCodes(event)">${i18n.t('admin.copyAll')}</button>
    <button class="action-btn" onclick="copyUnusedCodes(event)">${i18n.t('admin.copyUnused')}</button>
  `;

  return `
    <div class="code-group-card">
      <div class="code-group-header" onclick="toggleCodeGroup(this)">
        <div class="code-group-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path class="code-group-arrow" d="M9 6l6 6-6 6"></path>
          </svg>
        </div>
        <div class="code-group-main">
          <div class="code-group-title">${codeTypeLabel(meta.code_type)} <span class="code-group-count">× ${items.length}</span></div>
          <div class="code-group-attr">${codeAttrHtml(meta)}</div>
          <div class="code-group-valid">${codeValidHtml(meta)}</div>
        </div>
        <div class="code-group-stats">
          <span class="code-group-badge unused">${i18n.t('admin.unused')} ${available}</span>
          <span class="code-group-badge used">${i18n.t('admin.used')} ${used}</span>
          ${disabled > 0 ? `<span class="code-group-badge disabled">${i18n.t('admin.disabled')} ${disabled}</span>` : ''}
        </div>
        ${headerActions}
      </div>
      <div class="code-group-body">
        ${toolbar}
        ${itemRows}
      </div>
    </div>
  `;
}

function toggleCodeGroup(header) {
  const card = header.closest('.code-group-card');
  card.classList.toggle('open');
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => alert(i18n.t('admin.copySuccess')),
    () => alert(i18n.t('admin.copyFailed'))
  );
}

function copyGroupCodes(event) {
  event.stopPropagation();
  const card = event.currentTarget.closest('.code-group-card');
  const codes = Array.from(card.querySelectorAll('.code-group-item-code'))
    .map(el => el.textContent.trim())
    .filter(Boolean);
  copyToClipboard(codes.join('\n'));
}

// 复制该组内所有未使用且未禁用的激活码
function copyUnusedCodes(event) {
  event.stopPropagation();
  const card = event.currentTarget.closest('.code-group-card');
  const codes = Array.from(card.querySelectorAll('.code-group-item'))
    .filter(el => el.dataset.used === '0' && el.dataset.inactive === '0')
    .map(el => el.querySelector('.code-group-item-code').textContent.trim())
    .filter(Boolean);
  copyToClipboard(codes.join('\n'));
}

// 按状态勾选（或取消勾选）当前组内的激活码：all=全部 / unused=未使用 / used=已使用 / disabled=禁用 / none=取消
function selectGroupStatus(btn, status) {
  const card = btn.closest('.code-group-card');
  const checkboxes = card.querySelectorAll('.code-group-item .code-checkbox');
  checkboxes.forEach(cb => {
    const item = cb.closest('.code-group-item');
    const usedUp = item.dataset.used === '1';
    const inactive = item.dataset.inactive === '1';
    let match = false;
    if (status === 'all') match = true;
    else if (status === 'unused') match = !usedUp && !inactive;
    else if (status === 'used') match = usedUp;
    else if (status === 'disabled') match = inactive;
    cb.checked = match;
    toggleCodeSelection(cb);
  });
}

function copySingleCode(btn) {
  copyToClipboard(btn.dataset.code || '');
}

function onCodeTypeChange() {
  const type = codeType.value;
  const isCredits = type === 'credits';
  const isPlan = type === 'plan';
  // 时长字段：pro 与 plan 均可设置（plan 时表示开通/续订的延长时间，默认 30 天）
  codeDaysGroup.classList.toggle('hidden', isCredits);
  creditsGroup.classList.toggle('hidden', !isCredits);
  creditsValidGroup.classList.toggle('hidden', !isCredits);
  codePlanGroup.classList.toggle('hidden', !isPlan);
  codeDays.required = !isCredits;
  creditsAmount.required = isCredits;
  creditsValidDays.required = isCredits;
  codePlanId.required = isPlan;
  if (isPlan) {
    loadPlanOptions();
    codeDaysLabel.textContent = i18n.t('admin.planExtendDays');
    codeDaysLabel.dataset.i18n = 'admin.planExtendDays';
  } else {
    codeDaysLabel.textContent = i18n.t('admin.codeDays');
    codeDaysLabel.dataset.i18n = 'admin.codeDays';
  }
}

async function addCodes(e) {
  e.preventDefault();

  const selectedType = codeType.value;

  try {
    const { error } = await appSupabase.client.rpc('admin_create_codes', {
      count: parseInt(codeCount.value),
      duration_days: selectedType === 'credits' ? 0 : parseInt(codeDays.value),
      expire_days: parseInt(codeExpireDays.value),
      max_uses: parseInt(codeMaxUses.value),
      code_type: selectedType,
      credits_amount: selectedType === 'credits' ? parseFloat(creditsAmount.value) : 0,
      credits_valid_days: selectedType === 'credits' ? parseInt(creditsValidDays.value) : 0,
      plan_id: selectedType === 'plan' ? codePlanId.value || null : null
    });

    if (error) {
      codesError.textContent = error.message;
      codesError.classList.remove('hidden');
      return;
    }

    closeAddCodesModal();
    addCodesForm.reset();
    loadCodes();
    alert(i18n.t('admin.generateSuccess'));
  } catch (error) {
    codesError.textContent = error.message;
    codesError.classList.remove('hidden');
  }
}

async function deleteCode(codeId) {
  if (!confirm(i18n.t('admin.deleteConfirm'))) return;

  try {
    const { error } = await appSupabase.client.rpc('admin_delete_code', { code_id: codeId });

    if (error) {
      console.error('Delete code error:', error);
      alert(i18n.t('admin.deleteFailed'));
      return;
    }

    loadCodes();
  } catch (error) {
    console.error('Delete code error:', error);
  }
}

function toggleCodeSelection(checkbox) {
  const codeId = checkbox.value;
  
  if (checkbox.checked) {
    if (!selectedCodeIds.includes(codeId)) selectedCodeIds.push(codeId);
  } else {
    selectedCodeIds = selectedCodeIds.filter(id => id !== codeId);
  }
  
  updateBatchDeleteBtn();
}

function updateBatchDeleteBtn() {
  if (batchDeleteCodesBtn) {
    if (selectedCodeIds.length > 0) {
      batchDeleteCodesBtn.classList.remove('hidden');
      batchDeleteCodesBtn.textContent = `${i18n.t('admin.batchDelete')} (${selectedCodeIds.length})`;
    } else {
      batchDeleteCodesBtn.classList.add('hidden');
    }
  }
}

async function batchDeleteCodes() {
  if (selectedCodeIds.length === 0) return;
  
  if (!confirm(i18n.t('admin.batchDeleteConfirm').replace('{count}', selectedCodeIds.length))) return;
  
  try {
    const { data: deletedCount, error } = await appSupabase.client.rpc('admin_delete_codes', { code_ids: selectedCodeIds });
    
    if (error) {
      console.error('Batch delete codes error:', error);
      alert(i18n.t('admin.deleteFailed'));
      return;
    }
    
    selectedCodeIds = [];
    updateBatchDeleteBtn();
    loadCodes();
    alert(i18n.t('admin.batchDeleteSuccess').replace('{count}', deletedCount));
  } catch (error) {
    console.error('Batch delete codes error:', error);
  }
}

function openAddCodesModal() {
  const modal = document.getElementById('addCodesModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
  loadPlanOptions();
}

function closeAddCodesModal() {
  const modal = document.getElementById('addCodesModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
  codesError.classList.add('hidden');
}

// ========== AI Plan 管理 ==========

let plansCache = [];

async function loadPlans() {
  showLoading(plansList);

  try {
    const { data, error } = await appSupabase.client.rpc('admin_list_ai_plans');
    if (error) {
      console.error('Load plans error:', error);
      showErrorState(plansList, i18n.t('common.error'));
      return;
    }

    const plans = Array.isArray(data) ? data : [];
    plansCache = plans;

    if (plans.length === 0) {
      plansList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="8" cy="8" r="5.4"></circle>
              <path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path>
              <path d="M7 6.2h1.2v3.6"></path>
              <path d="m16.6 14 .8.8-2.9 2.9"></path>
            </svg>
          </div>
          <p>${i18n.t('admin.planEmpty')}</p>
        </div>
      `;
      return;
    }

    plansList.innerHTML = plans.map(plan => `
      <div class="user-card">
        <div class="user-info">
          <div class="user-details" style="flex: 1;">
            <h4 style="display: flex; align-items: center; gap: 8px;">
              ${escapeHtml(plan.name)}
              ${!plan.is_active ? `<span style="color:#f59e0b;font-size:12px;">${i18n.t('admin.disabled')}</span>` : ''}
            </h4>
            <p>${i18n.t('admin.planCreditsPerMonth')}: ${plan.credits_per_month} · ${i18n.t('admin.planCreditsValidDays')}: ${plan.credits_valid_days}${i18n.t('admin.days')}</p>
            <p>${i18n.t('admin.planDurationDays')}: ${plan.duration_days}${i18n.t('admin.days')} · ${i18n.t('admin.planPrice')}: ¥${plan.price}</p>
          </div>
        </div>
        <div class="code-actions">
          <button class="action-btn" onclick="openPlanModal('${plan.id}')">${i18n.t('admin.edit')}</button>
          <button class="action-btn delete" onclick="deletePlan('${plan.id}')">${i18n.t('admin.delete')}</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load plans error:', error);
    showErrorState(plansList, i18n.t('common.networkError'));
  }
}

async function loadPlanOptions() {
  if (!codePlanId) return;
  try {
    const { data, error } = await appSupabase.client.rpc('admin_list_ai_plans');
    if (error || !Array.isArray(data)) return;
    const current = codePlanId.value;
    codePlanId.innerHTML = data.map(plan =>
      `<option value="${plan.id}">${escapeHtml(plan.name)}${plan.is_active ? '' : ' (' + i18n.t('admin.disabled') + ')'}</option>`
    ).join('');
    if (current && data.some(p => p.id === current)) codePlanId.value = current;
  } catch (error) {
    console.error('Load plan options error:', error);
  }
}

function openPlanModal(planId) {
  const form = document.getElementById('planForm');
  form.reset();
  document.getElementById('planId').value = '';
  document.getElementById('planPrice').value = '0';
  document.getElementById('planCreditsValidDays').value = '30';
  document.getElementById('planDurationDays').value = '30';
  document.getElementById('planSortOrder').value = '0';
  document.getElementById('planIsActive').checked = true;
  document.getElementById('planModalTitle').textContent = i18n.t('admin.planAdd');

  if (planId) {
    const plan = plansCache.find(p => p.id === planId);
    if (plan) {
      document.getElementById('planModalTitle').textContent = i18n.t('admin.planEdit');
      document.getElementById('planId').value = plan.id;
      document.getElementById('planName').value = plan.name || '';
      document.getElementById('planPrice').value = plan.price ?? 0;
      document.getElementById('planCreditsPerMonth').value = plan.credits_per_month ?? 0;
      document.getElementById('planCreditsValidDays').value = plan.credits_valid_days ?? 30;
      document.getElementById('planDurationDays').value = plan.duration_days ?? 30;
      document.getElementById('planSortOrder').value = plan.sort_order ?? 0;
      document.getElementById('planIsActive').checked = !!plan.is_active;
    }
  }

  planError.classList.add('hidden');
  const modal = document.getElementById('planModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closePlanModal() {
  const modal = document.getElementById('planModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function savePlan(e) {
  e.preventDefault();
  planError.classList.add('hidden');

  try {
    const { data, error } = await appSupabase.client.rpc('admin_save_ai_plan', {
      p_name: document.getElementById('planName').value.trim(),
      p_price: parseFloat(document.getElementById('planPrice').value) || 0,
      p_credits_per_month: parseFloat(document.getElementById('planCreditsPerMonth').value),
      p_credits_valid_days: parseInt(document.getElementById('planCreditsValidDays').value) || 30,
      p_duration_days: parseInt(document.getElementById('planDurationDays').value) || 30,
      p_sort_order: parseInt(document.getElementById('planSortOrder').value) || 0,
      p_is_active: document.getElementById('planIsActive').checked,
      p_plan_id: document.getElementById('planId').value || null
    });

    if (error) {
      planError.textContent = error.message;
      planError.classList.remove('hidden');
      return;
    }

    if (data && data.success === false) {
      planError.textContent = data.message || i18n.t('common.error');
      planError.classList.remove('hidden');
      return;
    }

    closePlanModal();
    loadPlans();
    alert(i18n.t('common.success'));
  } catch (error) {
    planError.textContent = error.message;
    planError.classList.remove('hidden');
  }
}

async function deletePlan(planId) {
  if (!confirm(i18n.t('admin.planDeleteConfirm'))) return;

  try {
    const { data, error } = await appSupabase.client.rpc('admin_delete_ai_plan', { p_plan_id: planId });
    if (error) {
      console.error('Delete plan error:', error);
      alert(i18n.t('admin.deleteFailed'));
      return;
    }
    if (data && data.success === false) {
      alert(data.message || i18n.t('admin.deleteFailed'));
      return;
    }
    loadPlans();
    alert(i18n.t('common.success'));
  } catch (error) {
    console.error('Delete plan error:', error);
    alert(i18n.t('admin.deleteFailed'));
  }
}

// ========== 扩展云数据（合并到扩展详情） ==========
let currentCloudDataSlug = null; // 当前查看云数据的扩展 slug

function toggleCloudDataOwnerGroup() {
  const scope = document.getElementById('cloudDataScope').value;
  const ownerGroup = document.getElementById('cloudDataOwnerGroup');
  if (ownerGroup) ownerGroup.style.display = scope === 'user' ? '' : 'none';
}

async function openCloudDataModal(rowId) {
  const form = document.getElementById('cloudDataForm');
  form.reset();
  document.getElementById('cloudDataRowId').value = '';
  document.getElementById('cloudDataError').classList.add('hidden');
  document.getElementById('cloudDataModalTitle').textContent = i18n.t('admin.cloudDataAdd');
  document.getElementById('cloudDataScope').value = 'global';
  toggleCloudDataOwnerGroup();

  if (rowId) {
    const slug = currentCloudDataSlug;
    const { data: rows, error } = await appSupabase.client.rpc('admin_list_extension_cloud_data', { p_slug: slug });
    const row = (rows || []).find(r => r.row_id === rowId);
    if (!error && row) {
      document.getElementById('cloudDataModalTitle').textContent = i18n.t('admin.cloudDataEdit');
      document.getElementById('cloudDataRowId').value = row.row_id;
      document.getElementById('cloudDataScope').value = row.scope;
      document.getElementById('cloudDataKey').value = row.key_name;
      const valStr = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
      document.getElementById('cloudDataValue').value = valStr;
      document.getElementById('cloudDataOwner').value = row.data_user_id || '';
      toggleCloudDataOwnerGroup();
    }
  }

  const modal = document.getElementById('cloudDataModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeCloudDataModal() {
  const modal = document.getElementById('cloudDataModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function saveCloudData(e) {
  e.preventDefault();
  const slug = currentCloudDataSlug;
  if (!slug) return;

  const errorEl = document.getElementById('cloudDataError');
  errorEl.classList.add('hidden');

  const scope = document.getElementById('cloudDataScope').value;
  const key = document.getElementById('cloudDataKey').value.trim();
  const owner = document.getElementById('cloudDataOwner').value.trim();
  const rawValue = document.getElementById('cloudDataValue').value;

  if (!key) {
    errorEl.textContent = i18n.t('admin.cloudDataMissingKey');
    errorEl.classList.remove('hidden');
    return;
  }

  let parsedValue;
  try {
    parsedValue = JSON.parse(rawValue);
  } catch (err) {
    errorEl.textContent = i18n.t('admin.cloudDataInvalidJson');
    errorEl.classList.remove('hidden');
    return;
  }

  if (scope === 'user' && !owner) {
    errorEl.textContent = i18n.t('admin.cloudDataMissingOwner');
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const { error } = await appSupabase.client.rpc('admin_upsert_extension_cloud_data', {
      p_extension_slug: slug,
      p_scope: scope,
      p_key: key,
      p_value: parsedValue,
      p_user_id: scope === 'user' ? owner : null
    });

    if (error) {
      console.error('Save cloud data error:', error);
      errorEl.textContent = error.message || i18n.t('admin.cloudDataSaveFailed');
      errorEl.classList.remove('hidden');
      return;
    }

    closeCloudDataModal();
    loadDetailCloudData(currentCloudDataSlug);
    alert(i18n.t('admin.cloudDataSaveSuccess'));
  } catch (error) {
    console.error('Save cloud data error:', error);
    errorEl.textContent = error.message || i18n.t('admin.cloudDataSaveFailed');
    errorEl.classList.remove('hidden');
  }
}

async function deleteCloudData(rowId) {
  if (!confirm(i18n.t('admin.cloudDataDeleteConfirm'))) return;

  try {
    const { error } = await appSupabase.client.rpc('admin_delete_extension_cloud_data', { p_row_id: rowId });

    if (error) {
      console.error('Delete cloud data error:', error);
      alert(i18n.t('admin.cloudDataDeleteFailed'));
      return;
    }

    loadDetailCloudData(currentCloudDataSlug);
    alert(i18n.t('admin.cloudDataDeleteSuccess'));
  } catch (error) {
    console.error('Delete cloud data error:', error);
  }
}

// 在扩展详情中渲染该扩展的云数据
async function loadDetailCloudData(slug) {
  const container = document.getElementById('adminDetailCloudData');
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><p>${i18n.t('common.loading')}</p></div>`;
  try {
    const { data: rows, error } = await appSupabase.client.rpc('admin_list_extension_cloud_data', { p_slug: slug });
    if (error) {
      container.innerHTML = `<p style="color:#dc2626">${escapeHtml(error.message || i18n.t('common.error'))}</p>`;
      return;
    }
    if (!rows || rows.length === 0) {
      container.innerHTML = `<p style="color:#a1a1aa">${i18n.t('admin.cloudDataEmpty')}</p>`;
      return;
    }
    container.innerHTML = rows.map(row => {
      const scopeBadge = row.scope === 'global'
        ? `<span class="cloud-data-badge global">${i18n.t('admin.cloudDataScopeGlobal')}</span>`
        : `<span class="cloud-data-badge user">${i18n.t('admin.cloudDataScopeUser')}</span>`;
      const ownerText = row.scope === 'global'
        ? i18n.t('admin.cloudDataAllUsers')
        : (row.user_email || row.data_user_id || i18n.t('admin.unknown'));
      const valStr = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
      return `
        <div class="code-card" style="margin-bottom:8px;">
          <div class="code-info">
            <div class="code-code">${scopeBadge} <span style="font-family:monospace;">${escapeHtml(row.key_name)}</span></div>
            <div class="code-details">
              <p>${i18n.t('admin.cloudDataOwner')}: ${escapeHtml(ownerText)}</p>
              <p style="font-family:monospace;font-size:12px;color:var(--text-secondary);white-space:pre-wrap;word-break:break-all;">${escapeHtml(valStr)}</p>
              <p>${i18n.t('admin.cloudDataUpdatedAt')}: ${row.updated_at ? new Date(row.updated_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US') : ''}</p>
            </div>
          </div>
          <div class="code-actions">
            <button class="action-btn edit" onclick="openCloudDataModal('${row.row_id}')">${i18n.t('admin.cloudDataEdit')}</button>
            <button class="action-btn delete" onclick="deleteCloudData('${row.row_id}')">${i18n.t('admin.cloudDataDelete')}</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load detail cloud data error:', error);
    container.innerHTML = `<p style="color:#dc2626">${escapeHtml(error.message || i18n.t('common.error'))}</p>`;
  }
}

function addCloudDataForDetail() {
  openCloudDataModal(null);
}

// ========== 扩展审核（管理员） ==========

let currentReviewId = null;
let currentReviews = []; // 当前审核列表缓存，供审核弹窗展示变更说明

async function loadReviews() {
  const list = document.getElementById('reviewsList');
  if (!list) return;
  showLoading(list);

  try {
    const status = document.getElementById('reviewStatusFilter').value;
    const { data: reviews, error } = await appSupabase.client.rpc('admin_list_reviews', { p_status: status || null });

    if (error) {
      console.error('Load reviews error:', error);
      showErrorState(list, error.message || i18n.t('common.error'));
      return;
    }

    currentReviews = reviews || [];
    const rows = currentReviews;
    if (rows.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4"></path>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
            </svg>
          </div>
          <p>${i18n.t('admin.noReviews')}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = rows.map(r => {
      const typeBadge = `<span class="tag-chip">${reviewTypeLabel(r.review_type)}</span>`;
      const statusBadge = `<span class="review-badge ${r.status}">${reviewStatusLabel(r.status)}</span>`;
      const actionsHtml = r.status === 'pending'
        ? `<button class="action-btn edit" onclick="openReviewModal('${r.id}')">${i18n.t('admin.reviewApproveTitle') || '审核'}</button>`
        : `<span style="color:#a1a1aa;font-size:12px;">${r.review_comment ? escapeHtml(r.review_comment) : (i18n.t('admin.reviewDone') || '已处理')}</span>`;
      return `
        <div class="code-card">
          <div class="code-info">
            <div class="code-code">${typeBadge} ${escapeHtml(r.extension_name || r.extension_slug)} ${statusBadge} ${r.version_number ? '<span style="color:#6b7280">v' + escapeHtml(r.version_number) + '</span>' : ''}</div>
            <div class="code-details">
              <p>${i18n.t('admin.reviewExtension') || '扩展'}: ${escapeHtml(r.extension_slug)} · ${i18n.t('admin.reviewDeveloper') || '开发者'}: ${escapeHtml(r.developer_name || r.developer_email || '-')}</p>
              <p>${i18n.t('admin.reviewSummary') || '变更说明'}: ${escapeHtml(r.summary || '-')}</p>
              <p style="color:#a1a1aa;font-size:12px;">${new Date(r.created_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')} ${r.reviewed_at ? '· ' + i18n.t('admin.reviewedAt') + ': ' + new Date(r.reviewed_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US') : ''}</p>
            </div>
          </div>
          <div class="code-actions">${actionsHtml}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load reviews error:', error);
    showErrorState(list, error.message || i18n.t('common.networkError'));
  }
}

function reviewTypeLabel(type) {
  if (type === 'create') return i18n.t('admin.reviewTypeCreate') || '创建扩展';
  if (type === 'version') return i18n.t('admin.reviewTypeVersion') || '上传版本';
  return i18n.t('admin.reviewTypeUpdate') || '修改信息';
}

function reviewStatusLabel(status) {
  if (status === 'approved') return i18n.t('admin.reviewStatusApproved') || '已通过';
  if (status === 'rejected') return i18n.t('admin.reviewStatusRejected') || '已拒绝';
  return i18n.t('admin.reviewStatusPending') || '待审核';
}

function openReviewModal(reviewId) {
  currentReviewId = reviewId;

  // 按钮文案
  const approveBtn = document.querySelector('#reviewModal .btn-primary');
  const rejectBtn = document.querySelector('#reviewModal .btn-secondary');
  if (approveBtn) approveBtn.textContent = i18n.t('admin.reviewApprove') || '通过';
  if (rejectBtn) rejectBtn.textContent = i18n.t('admin.reviewReject') || '拒绝';

  const review = currentReviews.find(r => r.id === reviewId) || {};
  document.getElementById('reviewModalSummary').innerHTML =
    `${i18n.t('admin.reviewExtension') || '扩展'}: ${escapeHtml(review.extension_name || review.extension_slug || '-')} · ` +
    `${i18n.t('admin.reviewType') || '变更类型'}: ${escapeHtml(reviewTypeLabel(review.review_type))} · ` +
    `${i18n.t('admin.reviewVersion') || '版本'}: ${escapeHtml(review.version_number || '-')}` +
    (review.summary ? `<br>${i18n.t('admin.reviewSummary') || '变更说明'}: ${escapeHtml(review.summary)}` : '');

  // 信息修改审核：展示待审核的新值快照，便于管理员核对
  const pendingPayloadEl = document.getElementById('reviewPayload');
  if (pendingPayloadEl) {
    if (review.review_type === 'update' && review.payload && typeof review.payload === 'object') {
      const p = review.payload;
      const fields = [
        ['name', i18n.t('admin.extensionName') || '名称'],
        ['description', i18n.t('admin.extensionDesc') || '描述'],
        ['name_en', i18n.t('admin.extensionNameEn') || '名称(EN)'],
        ['description_en', i18n.t('admin.extensionDescEn') || '描述(EN)'],
        ['author', i18n.t('admin.extensionAuthor') || '作者'],
        ['icon_url', i18n.t('admin.extensionIcon') || '图标'],
        ['website', i18n.t('admin.extensionWebsite') || '官网'],
        ['tags', i18n.t('admin.extensionTags') || '标签']
      ].filter(([k]) => p[k] != null && (p[k] === '' ? false : true));
      pendingPayloadEl.innerHTML = fields.map(([k, label]) =>
        `<div class="review-payload-row"><span class="review-payload-label">${escapeHtml(label)}</span><span class="review-payload-value">${escapeHtml(Array.isArray(p[k]) ? p[k].join(', ') : p[k])}</span></div>`
      ).join('') || `<p style="color:#a1a1aa;font-size:12px;">${i18n.t('admin.reviewNoChange') || '无变更内容'}</p>`;
    } else {
      pendingPayloadEl.innerHTML = '';
    }
  }

  document.getElementById('reviewComment').value = '';
  document.getElementById('reviewError').classList.add('hidden');
  const modal = document.getElementById('reviewModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

async function handleReview(approved) {
  if (!currentReviewId) return;
  const comment = document.getElementById('reviewComment').value.trim();
  const errorEl = document.getElementById('reviewError');
  errorEl.classList.add('hidden');

  if (!approved && !comment) {
    errorEl.textContent = i18n.t('admin.reviewNeedComment') || '拒绝时请填写审核意见';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const { data, error } = await appSupabase.client.rpc('admin_review_extension', {
      p_review_id: currentReviewId,
      p_approved: approved,
      p_comment: comment || null
    });
    if (error) {
      errorEl.textContent = error.message || i18n.t('common.error');
      errorEl.classList.remove('hidden');
      return;
    }
    if (data && data.success === false) {
      errorEl.textContent = data.message || i18n.t('admin.reviewProcessed') || '该审核已处理';
      errorEl.classList.remove('hidden');
      return;
    }

    closeReviewModal();
    loadReviews();
    alert(data && data.message ? data.message : i18n.t('admin.reviewDone'));
  } catch (error) {
    console.error('Review extension error:', error);
    errorEl.textContent = error.message || i18n.t('common.error');
    errorEl.classList.remove('hidden');
  }
}

function closeReviewModal() {
  const modal = document.getElementById('reviewModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function loadAdminPage() {
  const isAdmin = await checkAdmin();
  if (!isAdmin) {
    document.querySelector('.dashboard-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <p>${i18n.t('admin.noPermission')}</p>
        <a href="dashboard.html" class="btn btn-secondary">${i18n.t('admin.backToDashboard')}</a>
      </div>
    `;
    return;
  }

  loadUsers();
}

document.addEventListener('DOMContentLoaded', () => {
  if (addCodeBtn) addCodeBtn.addEventListener('click', openAddCodesModal);
  if (batchDeleteCodesBtn) batchDeleteCodesBtn.addEventListener('click', batchDeleteCodes);
  if (addCodesForm) addCodesForm.addEventListener('submit', addCodes);

  // 扩展管理按钮事件
  const addExtensionBtn = document.getElementById('addExtensionBtn');
  if (addExtensionBtn) addExtensionBtn.addEventListener('click', openAddExtensionModal);
  
  const editExtensionForm = document.getElementById('editExtensionForm');
  if (editExtensionForm) editExtensionForm.addEventListener('submit', saveExtension);
  
  const addVersionForm = document.getElementById('addVersionForm');
  if (addVersionForm) addVersionForm.addEventListener('submit', addVersion);

  // 监听 ZIP 文件选择，自动解析 manifest.json 并填入表单
  const versionFileInput = document.getElementById('versionFile');
  if (versionFileInput) versionFileInput.addEventListener('change', handleVersionFileChange);

  // 快捷创建扩展按钮事件
  const quickCreateBtn = document.getElementById('quickCreateExtensionBtn');
  if (quickCreateBtn) quickCreateBtn.addEventListener('click', openQuickCreateModal);

  // 扩展审核状态筛选
  const reviewStatusFilter = document.getElementById('reviewStatusFilter');
  if (reviewStatusFilter) reviewStatusFilter.addEventListener('change', loadReviews);

  const quickCreateFileInput = document.getElementById('quickCreateFile');
  if (quickCreateFileInput) quickCreateFileInput.addEventListener('change', handleQuickCreateFileChange);

  const quickCreateForm = document.getElementById('quickCreateForm');
  if (quickCreateForm) quickCreateForm.addEventListener('submit', quickCreateSubmit);

  // 编辑扩展表单图标预览
  const editExtIconInput = document.getElementById('editExtIcon');
  if (editExtIconInput) {
    editExtIconInput.addEventListener('input', async () => {
      const val = editExtIconInput.value.trim();
      const preview = document.getElementById('editExtIconPreview');
      if (!preview) return;
      if (!val) {
        preview.style.display = 'none';
        preview.removeAttribute('src');
        return;
      }
      const resolved = await resolveAdminIconUrl(val);
      if (resolved) {
        preview.src = resolved;
        preview.style.display = '';
      } else {
        preview.style.display = 'none';
      }
    });
  }

  const sidebarItems = document.querySelectorAll('.sidebar-item');
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      document.querySelectorAll('.subpage').forEach(page => page.classList.add('hidden'));
      const targetPage = document.getElementById(item.dataset.page + 'Page');
      if (targetPage) targetPage.classList.remove('hidden');

      if (item.dataset.page === 'users') {
        loadUsers();
      } else if (item.dataset.page === 'codes') {
        loadCodes();
      } else if (item.dataset.page === 'extensions') {
        loadExtensions();
      } else if (item.dataset.page === 'reviews') {
        loadReviews();
      } else if (item.dataset.page === 'crashReports') {
        loadCrashReports();
      } else if (item.dataset.page === 'appVersions') {
        loadAppVersions();
      } else if (item.dataset.page === 'ai') {
        loadAIPage();
      } else if (item.dataset.page === 'plans') {
        loadPlans();
      }
    });
  });

  const refreshAppVersionsBtn = document.getElementById('refreshAppVersionsBtn');
  if (refreshAppVersionsBtn) refreshAppVersionsBtn.addEventListener('click', loadAppVersions);

  const refreshCrashReportsBtn = document.getElementById('refreshCrashReportsBtn');
  if (refreshCrashReportsBtn) refreshCrashReportsBtn.addEventListener('click', loadCrashReports);

  const cloudDataForm = document.getElementById('cloudDataForm');
  if (cloudDataForm) cloudDataForm.addEventListener('submit', saveCloudData);

  const cloudDataScope = document.getElementById('cloudDataScope');
  if (cloudDataScope) cloudDataScope.addEventListener('change', toggleCloudDataOwnerGroup);

  // 内置 AI 事件
  const aiAddModelBtn = document.getElementById('aiAddModelBtn');
  if (aiAddModelBtn) aiAddModelBtn.addEventListener('click', () => openAIModelModal());

  const aiModelForm = document.getElementById('aiModelForm');
  if (aiModelForm) aiModelForm.addEventListener('submit', saveAIModel);

  const aiKeyForm = document.getElementById('aiKeyForm');
  if (aiKeyForm) aiKeyForm.addEventListener('submit', saveAIKey);

  const aiRechargeForm = document.getElementById('aiRechargeForm');
  if (aiRechargeForm) aiRechargeForm.addEventListener('submit', saveAIRecharge);

  const aiCreditsSearchBtn = document.getElementById('aiCreditsSearchBtn');
  if (aiCreditsSearchBtn) aiCreditsSearchBtn.addEventListener('click', () => {
    loadAICredits(document.getElementById('aiCreditsSearch').value.trim());
  });

  const aiCreditsSearch = document.getElementById('aiCreditsSearch');
  if (aiCreditsSearch) aiCreditsSearch.addEventListener('keydown', e => {
    if (e.key === 'Enter') loadAICredits(aiCreditsSearch.value.trim());
  });

  // AI Plan 事件
  const addPlanBtn = document.getElementById('addPlanBtn');
  if (addPlanBtn) addPlanBtn.addEventListener('click', () => openPlanModal());
  if (planForm) planForm.addEventListener('submit', savePlan);

  loadAdminPage();
});

// 语言切换时重新渲染当前活动页面的动态内容
document.addEventListener('languageChanged', () => {
  const activeItem = document.querySelector('.sidebar-item.active');
  if (!activeItem) return;
  const page = activeItem.dataset.page;
  if (page === 'users') {
    loadUsers();
  } else if (page === 'codes') {
    loadCodes();
  } else if (page === 'extensions') {
        loadExtensions();
      } else if (page === 'reviews') {
        loadReviews();
      } else if (page === 'crashReports') {
        loadCrashReports();
      } else if (page === 'appVersions') {
        loadAppVersions();
  } else if (page === 'ai') {
    loadAIPage();
  } else if (page === 'plans') {
    loadPlans();
  }
});

// ========== 扩展管理功能 ==========

let currentExtensionId = null;
let currentDetailExtensionId = null;

async function loadExtensions() {
  const extensionsList = document.getElementById('extensionsList');
  showLoading(extensionsList);

  try {
    const { data: extensions, error } = await appSupabase.client.rpc('admin_list_extensions');

    if (error) {
      console.error('Load extensions error:', error);
      showErrorState(extensionsList, i18n.t('common.error'));
      return;
    }

    if (!extensions || extensions.length === 0) {
      extensionsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 7h-9"></path>
              <path d="M14 17H5"></path>
              <circle cx="17" cy="17" r="3"></circle>
              <circle cx="7" cy="7" r="3"></circle>
            </svg>
          </div>
          <p>${i18n.t('admin.noExtensions') || '暂无扩展'}</p>
        </div>
      `;
      return;
    }

    // 并行解析所有图标的存储路径为可访问的 URL
    const resolvedIcons = await Promise.all(
      extensions.map(ext => resolveAdminIconUrl(ext.icon_url))
    );

    extensionsList.innerHTML = extensions.map((ext, idx) => {
      const resolvedIcon = resolvedIcons[idx];
      const iconHtml = resolvedIcon
        ? `<img class="ext-card-icon" src="${resolvedIcon}" alt="" onerror="this.style.display='none'">`
        : '';
      return `
      <div class="code-card">
        <div class="code-info">
          <div class="code-code">${iconHtml}${escapeHtml(ext.name)}${ext.name_en ? ' / ' + escapeHtml(ext.name_en) : ''}${ext.requires_pro ? '<span class="pro-badge">PRO</span>' : ''}</div>
          <div class="code-details">
            <p>${i18n.t('admin.identifier') || '标识'}: ${escapeHtml(ext.slug)} ${ext.is_published ? '<span style="color:#22c55e">● ' + (i18n.t('admin.published') || '已发布') + '</span>' : '<span style="color:#a1a1aa">● ' + (i18n.t('admin.unpublished') || '未发布') + '</span>'}</p>
            <p>${escapeHtml(ext.description || i18n.t('admin.noDescription') || '无描述')}</p>
            <p>${i18n.t('admin.latestVersion') || '最新版本'}: ${ext.latest_version || (i18n.t('admin.noVersion') || '无版本')} · ${i18n.t('admin.downloads') || '下载'}: ${ext.download_count || 0}</p>
            <p>${i18n.t('admin.authorLabel') || '作者'}: ${escapeHtml(ext.author || (i18n.t('admin.unknown') || '未知'))}</p>
          </div>
        </div>
        <div class="code-actions">
          <button class="action-btn" onclick="viewExtensionDetail('${ext.extension_id}')">${i18n.t('admin.viewDetail') || '详情'}</button>
          <button class="action-btn edit" onclick="editExtension('${ext.extension_id}')">${i18n.t('admin.edit') || '编辑'}</button>
          <button class="action-btn ${ext.is_published ? 'delete' : 'primary'}" onclick="publishExtension('${ext.extension_id}', ${ext.is_published ? 'false' : 'true'})">
            ${ext.is_published ? (i18n.t('admin.unpublish') || '取消发布') : (i18n.t('admin.publish') || '发布')}
          </button>
          <button class="action-btn delete" onclick="deleteExtension('${ext.extension_id}')">${i18n.t('admin.delete') || '删除'}</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (error) {
    console.error('Load extensions error:', error);
    showErrorState(extensionsList, error.message || i18n.t('common.networkError'));
  }
}

function openAddExtensionModal() {
  currentExtensionId = null;
  document.getElementById('editExtensionTitle').textContent = i18n.t('admin.addExtension') || '添加扩展';
  document.getElementById('editExtensionForm').reset();
  document.getElementById('editExtensionId').value = '';
  document.getElementById('editExtensionError').classList.add('hidden');
  const iconPreview = document.getElementById('editExtIconPreview');
  if (iconPreview) {
    iconPreview.style.display = 'none';
    iconPreview.removeAttribute('src');
  }
  const modal = document.getElementById('editExtensionModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeEditExtensionModal() {
  const modal = document.getElementById('editExtensionModal');
  modal.classList.remove('active');
  const iconPreview = document.getElementById('editExtIconPreview');
  if (iconPreview) {
    iconPreview.style.display = 'none';
    iconPreview.removeAttribute('src');
  }
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function editExtension(extId) {
  try {
    const { data, error } = await appSupabase.client.rpc('get_extension_details', { p_extension_id: extId });

    if (error) {
      alert(i18n.t('common.error'));
      return;
    }

    if (data && !data.error) {
      currentExtensionId = extId;
      document.getElementById('editExtensionTitle').textContent = i18n.t('admin.editExtension') || '编辑扩展';
      document.getElementById('editExtensionId').value = extId;
      document.getElementById('editExtSlug').value = data.slug || '';
      document.getElementById('editExtName').value = data.name || '';
      document.getElementById('editExtDesc').value = data.description || '';
      document.getElementById('editExtNameEn').value = data.name_en || '';
      document.getElementById('editExtDescEn').value = data.description_en || '';
      document.getElementById('editExtAuthor').value = data.author || '';
      document.getElementById('editExtIcon').value = data.icon_url || '';
      document.getElementById('editExtWebsite').value = data.website || '';
      document.getElementById('editExtTags').value = (data.tags || []).join(', ');
      document.getElementById('editExtRequiresPro').checked = !!data.requires_pro;
      document.getElementById('editExtensionError').classList.add('hidden');
      
      // 更新图标预览
      const iconPreview = document.getElementById('editExtIconPreview');
      if (iconPreview) {
        const iconVal = data.icon_url || '';
        if (iconVal) {
          const resolved = await resolveAdminIconUrl(iconVal);
          if (resolved) {
            iconPreview.src = resolved;
            iconPreview.style.display = '';
          } else {
            iconPreview.style.display = 'none';
          }
        } else {
          iconPreview.style.display = 'none';
        }
      }
      
      const modal = document.getElementById('editExtensionModal');
      modal.classList.remove('hidden');
      modal.classList.add('active');
    }
  } catch (error) {
    console.error('Edit extension error:', error);
  }
}

async function saveExtension(e) {
  e.preventDefault();
  
  const slug = document.getElementById('editExtSlug').value.trim();
  const name = document.getElementById('editExtName').value.trim();
  const description = document.getElementById('editExtDesc').value.trim();
  const nameEn = document.getElementById('editExtNameEn').value.trim();
  const descriptionEn = document.getElementById('editExtDescEn').value.trim();
  const author = document.getElementById('editExtAuthor').value.trim();
  const iconUrl = document.getElementById('editExtIcon').value.trim();
  const website = document.getElementById('editExtWebsite').value.trim();
  const tagsStr = document.getElementById('editExtTags').value.trim();
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
  const requiresPro = document.getElementById('editExtRequiresPro').checked;
  
  const errorEl = document.getElementById('editExtensionError');
  errorEl.classList.add('hidden');

  try {
    let result;
    if (currentExtensionId) {
      result = await appSupabase.client.rpc('admin_update_extension', {
        p_extension_id: currentExtensionId,
        p_slug: slug,
        p_name: name,
        p_description: description,
        p_name_en: nameEn || null,
        p_description_en: descriptionEn || null,
        p_author: author,
        p_icon_url: iconUrl,
        p_website: website,
        p_tags: tags,
        p_requires_pro: requiresPro
      });
    } else {
      result = await appSupabase.client.rpc('admin_create_extension', {
        p_slug: slug,
        p_name: name,
        p_description: description,
        p_name_en: nameEn || null,
        p_description_en: descriptionEn || null,
        p_author: author,
        p_icon_url: iconUrl,
        p_website: website,
        p_tags: tags,
        p_requires_pro: requiresPro
      });
    }

    if (result.error) {
      errorEl.textContent = result.error.message;
      errorEl.classList.remove('hidden');
      return;
    }

    const data = result.data;
    if (data && data.success === false) {
      errorEl.textContent = data.message;
      errorEl.classList.remove('hidden');
      return;
    }

    closeEditExtensionModal();
    loadExtensions();
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  }
}

async function deleteExtension(extId) {
  if (!confirm(i18n.t('admin.deleteConfirm') || '确定要删除此扩展吗？此操作不可恢复。')) return;

  try {
    const { data, error } = await appSupabase.client.rpc('admin_delete_extension', {
      p_extension_id: extId
    });

    if (error) {
      alert(i18n.t('common.error'));
      return;
    }

    if (data && data.success) {
      loadExtensions();
    }
  } catch (error) {
    console.error('Delete extension error:', error);
  }
}

async function publishExtension(extId, isPublished) {
  try {
    const { data, error } = await appSupabase.client.rpc('admin_publish_extension', {
      p_extension_id: extId,
      p_is_published: Boolean(isPublished)
    });

    if (error) {
      alert(error.message || i18n.t('common.error'));
      return;
    }

    if (data && data.success) {
      loadExtensions();
    } else if (data && data.message) {
      alert(data.message);
    }
  } catch (error) {
    console.error('Publish extension error:', error);
    alert(error.message || i18n.t('common.error'));
  }
}

async function viewExtensionDetail(extId) {
  currentDetailExtensionId = extId;
  try {
    const { data, error } = await appSupabase.client.rpc('get_extension_details', { p_extension_id: extId });

    if (error || !data) {
      alert(i18n.t('common.error'));
      return;
    }

    const content = document.getElementById('extensionDetailContent');
    const ext = data;

    let versionsHtml = '';
    if (ext.versions && ext.versions.length > 0) {
      versionsHtml = `
        <table class="detail-table">
          <thead>
            <tr>
              <th>${i18n.t('admin.versionNumber') || '版本号'}</th>
              <th>${i18n.t('admin.changelog') || '更新日志'}</th>
              <th>${i18n.t('admin.fileSize') || '文件大小'}</th>
              <th>${i18n.t('admin.minAppVersion') || '最低版本'}</th>
              <th>${i18n.t('admin.minAppVersionCode') || '最低绝对版本'}</th>
              <th>${i18n.t('admin.isLatest') || '最新'}</th>
              <th>${i18n.t('admin.createdAt') || '创建时间'}</th>
              <th>${i18n.t('common.actions') || '操作'}</th>
            </tr>
          </thead>
          <tbody>
            ${ext.versions.map(v => `
              <tr>
                <td>${escapeHtml(v.version_number)}</td>
                <td>${escapeHtml(v.changelog || '-')}</td>
                <td>${v.file_size ? (v.file_size / 1024).toFixed(1) + 'KB' : '-'}</td>
                <td>${escapeHtml(v.min_app_version || '-')}</td>
                <td>${v.min_app_version_code != null ? escapeHtml(String(v.min_app_version_code)) : '-'}</td>
                <td>${v.is_latest ? '<span style="color:#22c55e">✓</span>' : '-'}</td>
                <td>${new Date(v.created_at).toLocaleDateString()}</td>
                <td>
                  ${v.file_path ? `<button class="action-btn" onclick="downloadVersion('${v.file_path.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')">${i18n.t('admin.download') || '下载'}</button>` : '-'}
                  ${!v.is_latest ? `<button class="action-btn delete" onclick="deleteVersion('${v.id}')">${i18n.t('admin.delete') || '删除'}</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      versionsHtml = `<p style="color:#a1a1aa">${i18n.t('admin.noVersions') || '暂无版本'}</p>`;
    }

    content.innerHTML = `
      <div class="detail-section">
        <h3>${i18n.t('admin.basicInfo') || '基本信息'}</h3>
        <div class="detail-grid">
          <div><span class="detail-label">${i18n.t('admin.name') || '名称'}</span><span>${escapeHtml(ext.name)}</span></div>
          <div><span class="detail-label">${i18n.t('admin.slug') || '标识'}</span><span>${escapeHtml(ext.slug)}</span></div>
          <div><span class="detail-label">${i18n.t('admin.author') || '作者'}</span><span>${escapeHtml(ext.author || '-')}</span></div>
          <div><span class="detail-label">${i18n.t('admin.downloadCount') || '下载数'}</span><span>${ext.download_count || 0}</span></div>
          <div><span class="detail-label">${i18n.t('admin.website') || '网站'}</span><span>${ext.website ? '<a href="' + ext.website + '" target="_blank">' + ext.website + '</a>' : '-'}</span></div>
          <div><span class="detail-label">${i18n.t('admin.tags') || '标签'}</span><span>${(ext.tags || []).map(t => '<span class="tag-chip">' + escapeHtml(t) + '</span>').join('') || '-'}</span></div>
        </div>
        <p style="margin-top:10px;"><strong>${i18n.t('admin.description') || '描述'}：</strong>${escapeHtml(ext.description || '-')}</p>
        ${ext.name_en ? `<div><span class="detail-label">${i18n.t('admin.nameEn') || '名称（En）'}</span><span>${escapeHtml(ext.name_en)}</span></div>` : ''}
        ${ext.description_en ? `<p style="margin-top:5px;"><strong>${i18n.t('admin.descriptionEn') || '描述（En）'}：</strong>${escapeHtml(ext.description_en)}</p>` : ''}
      </div>
      <div class="detail-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3>${i18n.t('admin.versions') || '版本列表'} (${ext.versions?.length || 0})</h3>
          <button class="btn btn-primary" onclick="openAddVersionModal()">${i18n.t('admin.addVersion') || '添加版本'}</button>
        </div>
        ${versionsHtml}
      </div>
      <div class="detail-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3>${i18n.t('dev.devCloudData') || '扩展云数据'}</h3>
          <button class="btn btn-secondary" onclick="addCloudDataForDetail()">${i18n.t('dev.devAddCloudData') || '新建云数据'}</button>
        </div>
        <p style="margin-bottom:10px;font-size:13px;color:var(--text-muted,#6b7280);">${i18n.t('dev.devCloudDataHint') || ''}</p>
        <div id="adminDetailCloudData"></div>
      </div>
    `;

    document.getElementById('extensionDetailTitle').textContent = ext.name;
    currentCloudDataSlug = ext.slug;
    loadDetailCloudData(ext.slug);
    const modal = document.getElementById('extensionDetailModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
  } catch (error) {
    console.error('View extension detail error:', error);
  }
}

function closeExtensionDetailModal() {
  const modal = document.getElementById('extensionDetailModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function openAddVersionModal() {
  if (!currentDetailExtensionId) return;
  document.getElementById('versionExtensionId').value = currentDetailExtensionId;
  resetAddVersionForm();
  const modal = document.getElementById('addVersionModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeAddVersionModal() {
  const modal = document.getElementById('addVersionModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// ========== 根据 Manifest 自动更新扩展信息 ==========

let pendingManifestUpdate = null; // 当前待确认的扩展信息

// 弹出确认框，展示从 manifest 解析出的扩展信息
function openManifestUpdateModal(extInfo) {
  pendingManifestUpdate = extInfo;
  const summary = document.getElementById('manifestUpdateSummary');
  const errorEl = document.getElementById('manifestUpdateError');
  const confirmBtn = document.getElementById('confirmManifestUpdateBtn');
  if (errorEl) errorEl.classList.add('hidden');

  const rows = [];
  const addRow = (label, value, opts = {}) => {
    // allowEmpty：图标提取失败时仍保留一行，用于展示错误提示
    if (!opts.allowEmpty && (value === undefined || value === null || value === '')) return;
    rows.push({ label, value, ...opts });
  };

  addRow(i18n.t('admin.name') || '名称', extInfo.name);
  addRow(i18n.t('admin.nameEn') || '名称（En）', extInfo.nameEn);
  addRow(i18n.t('admin.description') || '描述', extInfo.description, { multi: true });
  addRow(i18n.t('admin.descriptionEn') || '描述（En）', extInfo.descriptionEn, { multi: true });
  addRow(i18n.t('admin.author') || '作者', extInfo.author);
  addRow(i18n.t('admin.slug') || '标识', extInfo.slug);
  addRow(i18n.t('admin.website') || '网站', extInfo.website);
  if (extInfo.tags && extInfo.tags.length > 0) {
    addRow(i18n.t('admin.tags') || '标签', extInfo.tags.join(', '));
  }
  addRow(i18n.t('admin.extIcon') || '图标URL', extInfo.iconPreviewUrl || extInfo.iconUrl, {
    icon: true, iconError: extInfo.iconError, allowEmpty: !!extInfo.iconError
  });

  if (rows.length === 0) {
    summary.innerHTML = `<p class="manifest-update-empty">${i18n.t('admin.manifestUpdateNoFields') || '未在 manifest 中检测到可更新的扩展信息'}</p>`;
    if (confirmBtn) confirmBtn.disabled = true;
    const modal = document.getElementById('manifestUpdateModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
    return;
  }

  summary.innerHTML = rows.map(row => {
    if (row.icon) {
      const iconErr = row.iconError
        ? `<span class="manifest-update-icon-err">⚠ ${escapeHtml(row.iconError)}</span>`
        : '';
      const urlText = row.value && row.value.length > 80 ? row.value.slice(0, 80) + '…' : (row.value || '');
      return `
        <div class="manifest-update-row">
          <span class="detail-label">${escapeHtml(row.label)}</span>
          <span class="manifest-update-value icon-cell">
            ${row.value ? `<img class="manifest-update-icon" src="${row.value}" alt="icon" onerror="this.classList.add('broken')">` : ''}
            ${row.value ? `<code class="manifest-update-url">${escapeHtml(urlText)}</code>` : ''}
            ${iconErr}
          </span>
        </div>`;
    }
    return `
      <div class="manifest-update-row">
        <span class="detail-label">${escapeHtml(row.label)}</span>
        <span class="manifest-update-value${row.multi ? ' multi' : ''}">${escapeHtml(row.value)}</span>
      </div>`;
  }).join('');

  if (confirmBtn) confirmBtn.disabled = false;
  const modal = document.getElementById('manifestUpdateModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeManifestUpdateModal() {
  pendingManifestUpdate = null;
  const modal = document.getElementById('manifestUpdateModal');
  if (!modal) return;
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// 确认更新：调用 admin_update_extension 自动写入扩展信息
async function confirmManifestUpdate() {
  const info = pendingManifestUpdate;
  if (!info) return;

  const extensionId = document.getElementById('versionExtensionId').value;
  const confirmBtn = document.getElementById('confirmManifestUpdateBtn');
  const errorEl = document.getElementById('manifestUpdateError');
  if (errorEl) errorEl.classList.add('hidden');
  if (confirmBtn) confirmBtn.disabled = true;
  const originalText = confirmBtn ? confirmBtn.textContent : '';

  try {
    // 处理图标：ZIP 内图标上传到 Storage，URL 图标直接使用
    let iconStoragePath = null;
    if (info.iconData) {
      try {
        iconStoragePath = await uploadIconToStorage(info.iconData, extensionId);
      } catch (iconErr) {
        console.warn('[Admin] Icon upload failed, skipping icon update:', iconErr);
      }
    } else if (info.iconUrl) {
      // URL 图标：直接使用 URL
      iconStoragePath = info.iconUrl;
    }

    const { data, error } = await appSupabase.client.rpc('admin_update_extension', {
      p_extension_id: extensionId,
      p_slug: info.slug || null,
      p_name: info.name || null,
      p_description: info.description || null,
      p_name_en: info.nameEn || null,
      p_description_en: info.descriptionEn || null,
      p_author: info.author || null,
      p_icon_url: iconStoragePath || null,
      p_website: info.website || null,
      p_tags: (info.tags && info.tags.length > 0) ? info.tags : null
    });

    if (error) throw error;
    if (data && data.success === false) throw new Error(data.message || 'update failed');

    closeManifestUpdateModal();
    loadExtensions();
    alert(i18n.t('admin.manifestUpdateSuccess') || '扩展信息已自动更新');
  } catch (err) {
    console.error('Update extension info from manifest error:', err);
    if (errorEl) {
      errorEl.textContent = (i18n.t('admin.manifestUpdateFailed') || '更新扩展信息失败') + ': ' + err.message;
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
  }
}

// ========== ZIP 内 manifest.json 解析（纯前端，无需第三方库）==========
// 浏览器原生支持 DecompressionStream('deflate-raw')，用于解压 ZIP 中的本地文件条目

// 读取 ZIP 中某个本地文件条目的数据（返回 Uint8Array），支持存储和 Deflate 两种压缩
async function readZipEntryData(bytes, dataOffset, compressionMethod, compressedSize, uncompressedSize) {
  if (compressionMethod === 0) {
    // 存储（无压缩）
    return bytes.subarray(dataOffset, dataOffset + uncompressedSize);
  } else if (compressionMethod === 8) {
    // Deflate 压缩
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    // 浏览器原生解压：deflate-raw（无 zlib 头）
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks = [];
    let totalLen = 0;
    let readResult;
    while (!(readResult = await reader.read()).done) {
      chunks.push(readResult.value);
      totalLen += readResult.value.length;
    }
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }
  throw new Error(`Unsupported compression method: ${compressionMethod}`);
}

// ========== Manifest 字段本地化（与客户端 extension-manager.js 对齐）==========
// Chrome 规范：manifest 的 name/description 等字段可使用 __MSG_key__ 占位符，
// 解析时从 _locales/{default_locale}/messages.json 替换为最终字符串。

const ADMIN_MSG_PLACEHOLDER_REGEX = /__MSG_([\w.]+)__/g;

// 在 locale 表中按嵌套 key 查找值（支持 "button.save" 形式）
function resolveLocaleKey(table, key) {
  const parts = key.split('.');
  let current = table;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  // Chrome 格式：{ "message": "xxx" }
  if (current && typeof current === 'object' && 'message' in current) {
    return current.message;
  }
  return typeof current === 'string' ? current : undefined;
}

// 解析字符串中的 __MSG_key__ 占位符
// locales: { zh: {...}, en: {...} }
// langList: 优先级顺序，如 ['zh', 'en']
function resolveMsgPlaceholders(value, locales, langList) {
  if (typeof value !== 'string' || !value.includes('__MSG_')) return value;
  return value.replace(ADMIN_MSG_PLACEHOLDER_REGEX, (match, key) => {
    for (const lang of langList) {
      const table = locales[lang];
      if (!table) continue;
      const val = resolveLocaleKey(table, key);
      if (val !== undefined) return val;
    }
    return match; // 未找到翻译，保留原占位符
  });
}

// 根据 default_locale 和当前后台语言，解析 manifest 中需要本地化的字段
// 返回 { name, description, langUsed }
function resolveManifestI18n(manifest, locales) {
  const defaultLang = manifest.default_locale || null;
  // 优先级：后台当前语言 -> default_locale -> zh -> en -> 第一个可用语言
  const adminLang = (typeof i18n !== 'undefined' && i18n.currentLang) ? i18n.currentLang() : 'zh';
  const langList = [];
  if (adminLang && !langList.includes(adminLang)) langList.push(adminLang);
  if (defaultLang && !langList.includes(defaultLang)) langList.push(defaultLang);
  if (!langList.includes('zh')) langList.push('zh');
  if (!langList.includes('en')) langList.push('en');
  for (const l of Object.keys(locales)) {
    if (!langList.includes(l)) langList.push(l);
  }
  return {
    name: resolveMsgPlaceholders(manifest.name, locales, langList),
    description: resolveMsgPlaceholders(manifest.description, locales, langList),
  };
}

/**
 * 从 ZIP 文件 ArrayBuffer 中查找并解析 manifest.json 及 _locales/<lang>/messages.json
 * ZIP 格式参考：APPNOTE.TXT
 * 实现：扫描本地文件头（签名 0x04034b50），逐条解析
 * 返回：{ manifest, locales, fileName, readEntry } 或 null
 *   - manifest: 解析后的 manifest 对象（name/description 保留原始占位符）
 *   - locales: { zh: {...}, en: {...} }
 *   - fileName: manifest.json 在 ZIP 中的路径
 *   - readEntry: async (path) => Uint8Array | null，按 ZIP 内路径读取任意文件内容
 */
async function parseManifestFromZip(zipBuffer) {
  const view = new DataView(zipBuffer);
  const bytes = new Uint8Array(zipBuffer);
  let offset = 0;
  const LOCAL_FILE_HEADER_SIG = 0x04034b50;
  const UTF8_DEC = new TextDecoder('utf-8');

  let manifest = null;
  let manifestFileName = null;
  const locales = {}; // { zh: {...}, en: {...} }
  const entries = new Map(); // 规范化路径 -> 条目元数据，用于后续读取图标等文件

  while (offset < zipBuffer.byteLength - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== LOCAL_FILE_HEADER_SIG) break; // 遇到非本地文件头（中央目录等）则停止

    // 本地文件头结构
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);
    const fileName = UTF8_DEC.decode(bytes.subarray(offset + 30, offset + 30 + fileNameLength));
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    // 跳过目录条目
    const isDirectory = fileName.endsWith('/');
    offset = dataOffset + compressedSize;

    if (isDirectory) continue;

    const normalized = fileName.replace(/\\/g, '/');
    const segments = normalized.split('/');
    const baseName = segments.pop();
    const depth = segments.length; // 0 = 根目录，1 = 一级子目录

    // 记录所有文件条目（供后续按路径读取，如图标）
    entries.set(normalized, { dataOffset, compressionMethod, compressedSize, uncompressedSize });

    // 匹配 manifest.json：允许根目录或一级子目录下
    if (manifest === null && baseName.toLowerCase() === 'manifest.json' && depth <= 1) {
      const fileBytes = await readZipEntryData(bytes, dataOffset, compressionMethod, compressedSize, uncompressedSize);
      manifest = JSON.parse(UTF8_DEC.decode(fileBytes));
      manifestFileName = normalized;
      continue;
    }

    // 匹配 _locales/<lang>/messages.json（允许在一级或二级子目录下，以兼容 ZIP 含/不含顶层目录的情况）
    if (baseName.toLowerCase() === 'messages.json') {
      // 期望路径形如：[_locales, <lang>, messages.json] 或 [<topDir>, _locales, <lang>, messages.json]
      const localesIdx = segments.findIndex(s => s === '_locales');
      if (localesIdx >= 0 && segments.length >= localesIdx + 2) {
        const lang = segments[localesIdx + 1];
        try {
          const fileBytes = await readZipEntryData(bytes, dataOffset, compressionMethod, compressedSize, uncompressedSize);
          locales[lang] = JSON.parse(UTF8_DEC.decode(fileBytes));
        } catch (e) {
          console.warn('[Admin] Failed to parse locale', lang, e);
        }
      }
    }
  }

  if (!manifest) return null;

  // 按 ZIP 内规范化路径读取文件内容
  const readEntry = async (path) => {
    const key = String(path).replace(/\\/g, '/');
    const entry = entries.get(key);
    if (!entry) return null;
    return readZipEntryData(bytes, entry.dataOffset, entry.compressionMethod, entry.compressedSize, entry.uncompressedSize);
  };

  return { manifest, locales, fileName: manifestFileName, readEntry };
}

// ========== 从 manifest 提取扩展信息与图标 ==========

// 选择 manifest 中要使用的图标路径
// 优先级：icons（最大尺寸） > action.default_icon > browser_action.default_icon > page_action.default_icon
function getManifestIconPath(manifest) {
  // 候选字段列表，按优先级排序
  const candidates = [
    manifest.icons,
    manifest.action && manifest.action.default_icon,
    manifest.browser_action && manifest.browser_action.default_icon,
    manifest.page_action && manifest.page_action.default_icon,
  ];

  for (const icons of candidates) {
    if (!icons) continue;
    if (typeof icons === 'string') return icons;  // 直接路径如 "icons/icon128.png"
    if (typeof icons === 'object') {
      // 对象形式如 { "16": "...", "128": "..." }，选择最大尺寸
      const sizes = Object.keys(icons)
        .map(Number).filter(n => !isNaN(n))
        .sort((a, b) => b - a);
      if (sizes.length > 0) return icons[String(sizes[0])];
      const keys = Object.keys(icons);
      if (keys.length > 0) return icons[keys[0]];
    }
  }
  return null;
}

// 根据文件扩展名推断 MIME 类型
function getMimeType(fileName) {
  const ext = String(fileName).split('.').pop().toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
    bmp: 'image/bmp', avif: 'image/avif'
  };
  return map[ext] || 'application/octet-stream';
}

// Uint8Array -> base64（分批拼接，避免栈溢出）
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// 解析 manifest 中图标相对路径与 manifest.json 所在目录拼接为 ZIP 内完整路径
function resolveEntryPath(baseDir, relPath) {
  const parts = String(relPath).replace(/\\/g, '/').split('/').filter(Boolean);
  if (baseDir) {
    return baseDir.split('/').filter(Boolean).concat(parts).join('/');
  }
  return parts.join('/');
}

// 尝试从 ZIP 中读取 manifest 声明的图标，返回原始字节数据
// 限制图标大小，避免过大文件（对于 URL 类型的图标则直接返回 URL，不读取 ZIP）
const MAX_ICON_BYTES = 1 * 1024 * 1024; // 1MB

// 判断图标路径是否为外部 URL
function isUrlIcon(path) {
  return /^https?:\/\//i.test(String(path || ''));
}

async function extractManifestIcon(manifest, result) {
  if (!result || typeof result.readEntry !== 'function') return { iconData: null, error: null };
  const iconPath = getManifestIconPath(manifest);
  if (!iconPath) return { iconData: null, error: null };

  // 如果图标是外部 URL，直接返回（不尝试从 ZIP 读取）
  if (isUrlIcon(iconPath)) {
    return { iconData: null, error: null, isUrl: true, iconUrl: iconPath };
  }

  const baseDir = result.fileName ? result.fileName.split('/').slice(0, -1).join('/') : '';
  const fullPath = resolveEntryPath(baseDir, iconPath);
  const bytes = await result.readEntry(fullPath);
  if (!bytes || bytes.length === 0) {
    return { iconData: null, error: `未在 ZIP 中找到图标文件：${iconPath}` };
  }
  if (bytes.length > MAX_ICON_BYTES) {
    return { iconData: null, error: `图标文件过大：${iconPath} (${(bytes.length / 1024).toFixed(0)}KB，上限 ${(MAX_ICON_BYTES / 1024).toFixed(0)}KB)` };
  }
  const mime = getMimeType(iconPath);
  const filename = iconPath.split('/').pop();
  return { iconData: { bytes, mime, filename }, error: null, isUrl: false };
}

// 将图标上传到 Supabase Storage，返回存储路径
async function uploadIconToStorage(iconData, extensionId) {
  if (!iconData || !iconData.bytes || !iconData.mime || !iconData.filename) return null;

  const filePath = `extensions/${extensionId}/icons/${iconData.filename}`;
  const uploadUrl = `${appSupabase.client.supabaseUrl}/storage/v1/object/extension-files/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
  const { data: sessionData } = await appSupabase.client.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    console.warn('[Admin] No access token, cannot upload icon');
    return null;
  }

  // 可靠地拷贝字节数据到新的 ArrayBuffer（避免 subarray 视图的 buffer 偏移问题）
  const bytesCopy = new Uint8Array(iconData.bytes);
  const buffer = bytesCopy.buffer;

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
    xhr.setRequestHeader('Content-Type', iconData.mime);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || ''}`));
    };
    xhr.onerror = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
    xhr.onabort = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
    xhr.send(buffer);
  });

  return filePath;
}

// 将数据库中的 icon_url（可能是存储路径）转为可访问的 URL
async function resolveAdminIconUrl(iconUrl) {
  if (!iconUrl) return null;
  // 已经是完整 URL 或 data URI，直接返回
  if (/^(https?:|data:|file:)/.test(iconUrl)) return iconUrl;
  // 视为 Supabase Storage 路径，生成签名 URL
  try {
    const { data, error } = await appSupabase.client.storage
      .from('extension-files')
      .createSignedUrl(iconUrl, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (e) {
    console.warn('[Admin] Failed to resolve icon URL:', iconUrl, e);
    return null;
  }
}

// 从已解析的 manifest/locales 中汇总可用于自动更新扩展的字段
async function buildManifestExtInfo(manifest, locales, result) {
  const i18nResolved = resolveManifestI18n(manifest, locales);
  const enName = resolveMsgPlaceholders(manifest.name, locales, ['en']);
  const enDesc = resolveMsgPlaceholders(manifest.description, locales, ['en']);

  let iconData = null;
  let iconError = null;
  let iconPreviewUrl = null;
  let iconUrl = null;  // 存储最终的 icon URL（可能是外部 URL 或 Storage 路径）
  try {
    const iconResult = await extractManifestIcon(manifest, result);
    iconData = iconResult.iconData;
    iconError = iconResult.error;
    if (iconResult.isUrl && iconResult.iconUrl) {
      // URL 图标：直接使用 URL 作为预览和存储值
      iconUrl = iconResult.iconUrl;
      iconPreviewUrl = iconResult.iconUrl;
    } else if (iconData) {
      // ZIP 内图标：生成 data URL 用于预览
      const base64 = bytesToBase64(iconData.bytes);
      iconPreviewUrl = `data:${iconData.mime};base64,${base64}`;
    }
  } catch (e) {
    console.warn('[Admin] Extract icon failed:', e);
    iconError = e.message;
  }

  return {
    name: i18nResolved.name || manifest.name || '',
    nameEn: (enName && enName !== i18nResolved.name) ? enName : '',
    description: i18nResolved.description || '',
    descriptionEn: (enDesc && enDesc !== i18nResolved.description) ? enDesc : '',
    author: manifest.author || '',
    slug: manifest.slug || '',
    website: manifest.homepage_url || '',
    tags: manifest.tags || [],
    iconData,
    iconPreviewUrl,
    iconUrl,
    iconError,
  };
}

// ZIP 文件选择变化时：解析 manifest 并填入表单
async function handleVersionFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('manifestParseStatus');
  const previewEl = document.getElementById('manifestPreview');
  const errorEl = document.getElementById('addVersionError');
  errorEl.classList.add('hidden');

  // 显示解析中状态
  statusEl.classList.remove('hidden', 'success', 'error');
  statusEl.classList.add('parsing');
  statusEl.textContent = i18n.t('admin.manifestParsing') || '正在解析 manifest.json...';
  if (previewEl) previewEl.value = '';

  try {
    const buffer = await file.arrayBuffer();
    const result = await parseManifestFromZip(buffer);

    if (!result) {
      statusEl.classList.remove('parsing', 'success');
      statusEl.classList.add('error');
      statusEl.textContent = i18n.t('admin.manifestNotFound') || '未在 ZIP 中找到 manifest.json';
      return;
    }

    const manifest = result.manifest;
    const locales = result.locales || {};

    // 解析 manifest 中 name/description 的 __MSG_key__ 占位符（本地化）
    const i18nResolved = resolveManifestI18n(manifest, locales);
    const hasLocales = Object.keys(locales).length > 0;

    // 自动填入版本相关字段（仅在字段为空时填入，避免覆盖用户已输入内容）
    const fillField = (id, value) => {
      const el = document.getElementById(id);
      if (el && value != null && value !== '') {
        el.value = value;
      }
    };
    fillField('versionNumber', manifest.version);
    fillField('versionMinApp', manifest.min_app_version);
    fillField('versionMinAppCode', manifest.min_app_version_code);

    // 展示 manifest 预览：原始 manifest（保留 __MSG_ 占位符，便于核对）
    if (previewEl) {
      const parts = [];
      parts.push('===== ' + (i18n.t('admin.manifestRaw') || '原始 Manifest') + ' =====');
      parts.push(JSON.stringify(manifest, null, 2));
      // 若解析到了本地化翻译，附加展示本地化后的 name/description 及可用语言
      if (hasLocales) {
        parts.push('');
        parts.push('===== ' + (i18n.t('admin.manifestLocalized') || '本地化字段（按当前后台语言解析）') + ' =====');
        parts.push((i18n.t('admin.name') || '名称') + ': ' + (i18nResolved.name || '-'));
        parts.push((i18n.t('admin.description') || '描述') + ': ' + (i18nResolved.description || '-'));
        parts.push((i18n.t('admin.availableLanguages') || '可用语言') + ': ' + Object.keys(locales).join(', '));
      }
      previewEl.value = parts.join('\n');
    }

    // 显示解析成功状态（使用本地化后的名称，更直观）
    statusEl.classList.remove('parsing', 'error');
    statusEl.classList.add('success');
    const displayName = i18nResolved.name || manifest.name || '';
    const namePart = displayName ? `${displayName} ` : '';
    const verPart = manifest.version ? `v${manifest.version} ` : '';
    const localeHint = hasLocales ? ` · ${Object.keys(locales).length} ${(i18n.t('admin.languages') || '语言')}` : '';
    statusEl.textContent = `${i18n.t('admin.manifestParsed') || '已解析 manifest'}：${namePart}${verPart}(${result.fileName})${localeHint}`;

    // 汇总可自动更新的扩展信息（中英文名称/简介、作者、slug、网站、图标 data URL），
    // 弹出确认框，点击确认后自动更新扩展信息
    const extInfo = await buildManifestExtInfo(manifest, locales, result);
    openManifestUpdateModal(extInfo);
  } catch (err) {
    console.error('Parse manifest from zip error:', err);
    statusEl.classList.remove('parsing', 'success');
    statusEl.classList.add('error');
    statusEl.textContent = (i18n.t('admin.manifestParseFailed') || '解析 manifest 失败') + ': ' + err.message;
  }
}

// 打开添加版本弹窗时清空表单和解析状态
function resetAddVersionForm() {
  closeManifestUpdateModal(); // 清空待确认的扩展信息
  document.getElementById('versionNumber').value = '';
  document.getElementById('versionChangelog').value = '';
  document.getElementById('versionFile').value = '';
  document.getElementById('versionMinApp').value = '';
  document.getElementById('versionMinAppCode').value = '';
  const statusEl = document.getElementById('manifestParseStatus');
  if (statusEl) {
    statusEl.classList.add('hidden');
    statusEl.classList.remove('parsing', 'success', 'error');
    statusEl.textContent = '';
  }
  const previewEl = document.getElementById('manifestPreview');
  if (previewEl) previewEl.value = '';
  const errorEl = document.getElementById('addVersionError');
  if (errorEl) errorEl.classList.add('hidden');
}

async function addVersion(e) {
  e.preventDefault();

  const extensionId = document.getElementById('versionExtensionId').value;
  const versionNumber = document.getElementById('versionNumber').value.trim();
  const changelog = document.getElementById('versionChangelog').value.trim();
  const versionFile = document.getElementById('versionFile').files[0];
  const minAppVersion = document.getElementById('versionMinApp').value.trim();
  const minAppVersionCodeRaw = document.getElementById('versionMinAppCode').value.trim();
  const minAppVersionCode = minAppVersionCodeRaw ? parseInt(minAppVersionCodeRaw, 10) : null;
  const errorEl = document.getElementById('addVersionError');
  const submitBtn = document.getElementById('uploadVersionBtn');
  const progressWrap = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressPercent = document.getElementById('uploadProgressPercent');
  const progressStage = document.getElementById('uploadProgressStage');
  errorEl.classList.add('hidden');

  if (!versionFile) {
    errorEl.textContent = i18n.t('admin.selectZip') || '请选择ZIP文件';
    errorEl.classList.remove('hidden');
    return;
  }

  // 进度更新辅助函数
  const setProgress = (percent, stageKey, fallback) => {
    const clamped = Math.max(0, Math.min(100, percent));
    progressFill.style.width = clamped + '%';
    progressPercent.textContent = Math.round(clamped) + '%';
    if (stageKey) {
      progressStage.textContent = i18n.t(stageKey) || fallback;
    }
  };

  // 重置并显示进度条
  progressWrap.classList.remove('hidden');
  setProgress(0, 'admin.stagePreparing', '准备中...');
  submitBtn.disabled = true;
  submitBtn.classList.add('disabled');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = i18n.t('admin.uploading') || '上传中...';

  try {
    // 阶段 1：读取文件并计算校验和（0% - 10%）
    setProgress(2, 'admin.stageReadingFile', '正在读取文件...');
    const fileBuffer = await versionFile.arrayBuffer();
    const fileSize = versionFile.size;
    setProgress(6, 'admin.stageChecksum', '正在计算校验和...');
    const fileChecksum = await calculateChecksum(fileBuffer);
    setProgress(10, 'admin.stageUploading', '正在上传文件...');
    const filePath = `extensions/${extensionId}/${versionNumber}/${versionFile.name}`;

    // 阶段 2：使用 XHR 上传文件以监听真实进度（10% - 90%）
    const uploadUrl = `${appSupabase.client.supabaseUrl}/storage/v1/object/extension-files/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
    const { data: sessionData } = await appSupabase.client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.setRequestHeader('x-upsert', 'true');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          // 上传阶段映射到 10% - 90%
          const uploadRatio = ev.loaded / ev.total;
          const overall = 10 + uploadRatio * 80;
          setProgress(overall, 'admin.stageUploading', '正在上传文件...');
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(90, 'admin.stageCreatingVersion', '正在创建版本记录...');
          resolve();
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.message) msg = resp.message;
            else if (resp.error) msg = resp.error;
          } catch (_) {}
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
      xhr.onabort = () => reject(new Error('Upload aborted'));

      xhr.send(fileBuffer);
    });

    // 阶段 3：创建版本记录（90% - 100%）
    const { data: result, error } = await appSupabase.client.rpc('admin_create_extension_version', {
      p_extension_id: extensionId,
      p_version_number: versionNumber,
      p_changelog: changelog,
      p_file_path: filePath,
      p_file_size: fileSize,
      p_checksum: fileChecksum,
      p_min_app_version: minAppVersion,
      p_min_app_version_code: minAppVersionCode
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
      return;
    }

    if (result && result.success === false) {
      errorEl.textContent = result.message;
      errorEl.classList.remove('hidden');
      return;
    }

    setProgress(100, 'admin.stageDone', '完成');
    closeAddVersionModal();
    closeExtensionDetailModal();
    loadExtensions();
  } catch (error) {
    console.error('Add version error:', error);
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } finally {
    // 恢复按钮状态
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
    submitBtn.textContent = originalBtnText;
    // 延迟隐藏进度条，让用户看到最终状态
    setTimeout(() => {
      progressWrap.classList.add('hidden');
      setProgress(0, '', '');
    }, 800);
  }
}

async function deleteVersion(versionId) {
  if (!confirm(i18n.t('admin.deleteConfirm') || '确定要删除此版本吗？')) return;

  try {
    const { data, error } = await appSupabase.client.rpc('admin_delete_extension_version', {
      p_version_id: versionId
    });

    if (error) {
      alert(i18n.t('common.error'));
      return;
    }

    if (data && data.success) {
      viewExtensionDetail(currentDetailExtensionId);
    }
  } catch (error) {
    console.error('Delete version error:', error);
  }
}

// 下载指定版本的扩展源文件（通过签名 URL）
async function downloadVersion(filePath) {
  try {
    const fileName = filePath.split('/').pop() || 'extension.zip';
    const { data, error } = await appSupabase.client.storage
      .from('extension-files')
      .createSignedUrl(filePath, 3600);
    if (error || !data?.signedUrl) throw error || new Error('签名失败');
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error('Download version error:', err);
    alert(err?.message || (i18n.t('admin.downloadFailed') || '下载失败'));
  }
}

// ========== 快捷创建扩展 ==========

let quickCreateExtInfo = null;

function openQuickCreateModal() {
  quickCreateExtInfo = null;
  document.getElementById('quickCreateForm').reset();
  document.getElementById('quickCreateSummary').classList.add('hidden');
  document.getElementById('quickCreateError').classList.add('hidden');
  document.getElementById('quickCreateSubmitBtn').disabled = true;
  const statusEl = document.getElementById('quickCreateParseStatus');
  statusEl.classList.add('hidden');
  statusEl.classList.remove('parsing', 'success', 'error');
  statusEl.textContent = '';
  const progressWrap = document.getElementById('quickCreateProgress');
  progressWrap.classList.add('hidden');
  document.getElementById('quickCreateIconGroup').style.display = 'none';
  document.getElementById('quickCreateIconPreview').removeAttribute('src');
  const modal = document.getElementById('quickCreateModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeQuickCreateModal() {
  const modal = document.getElementById('quickCreateModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function handleQuickCreateFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('quickCreateParseStatus');
  const errorEl = document.getElementById('quickCreateError');
  errorEl.classList.add('hidden');

  statusEl.classList.remove('hidden', 'success', 'error');
  statusEl.classList.add('parsing');
  statusEl.textContent = i18n.t('admin.manifestParsing') || '正在解析 manifest.json...';

  try {
    const buffer = await file.arrayBuffer();
    const result = await parseManifestFromZip(buffer);

    if (!result) {
      statusEl.classList.remove('parsing', 'success');
      statusEl.classList.add('error');
      statusEl.textContent = i18n.t('admin.manifestNotFound') || '未在 ZIP 中找到 manifest.json';
      return;
    }

    const manifest = result.manifest;
    const locales = result.locales || {};
    const i18nResolved = resolveManifestI18n(manifest, locales);
    const enName = resolveMsgPlaceholders(manifest.name, locales, ['en']);
    const enDesc = resolveMsgPlaceholders(manifest.description, locales, ['en']);

    const extInfo = await buildManifestExtInfo(manifest, locales, result);
    quickCreateExtInfo = extInfo;

    // 填入表单
    document.getElementById('quickCreateSlug').value = extInfo.slug || '';
    document.getElementById('quickCreateName').value = extInfo.name || '';
    document.getElementById('quickCreateDesc').value = extInfo.description || '';
    document.getElementById('quickCreateNameEn').value = extInfo.nameEn || '';
    document.getElementById('quickCreateDescEn').value = extInfo.descriptionEn || '';
    document.getElementById('quickCreateAuthor').value = extInfo.author || '';
    document.getElementById('quickCreateWebsite').value = extInfo.website || '';
    document.getElementById('quickCreateTags').value = (extInfo.tags || []).join(', ');
    document.getElementById('quickCreateVersion').value = manifest.version || '';
    document.getElementById('quickCreateMinApp').value = manifest.min_app_version || '';
    document.getElementById('quickCreateMinAppCode').value = manifest.min_app_version_code || '';

    // 显示图标预览
    const iconGroup = document.getElementById('quickCreateIconGroup');
    const iconPreview = document.getElementById('quickCreateIconPreview');
    const iconFallback = document.getElementById('quickCreateIconFallback');
    if (extInfo.iconPreviewUrl) {
      iconGroup.style.display = '';
      iconPreview.style.display = '';
      iconPreview.src = extInfo.iconPreviewUrl;
      iconFallback.style.display = 'none';
    } else if (extInfo.iconError) {
      iconGroup.style.display = '';
      iconPreview.style.display = 'none';
      iconFallback.style.display = '';
      iconFallback.textContent = i18n.t('admin.extIcon') + ' ⚠ ' + extInfo.iconError;
    } else {
      iconGroup.style.display = 'none';
    }

    // 显示解析成功
    statusEl.classList.remove('parsing', 'error');
    statusEl.classList.add('success');
    const displayName = extInfo.name || manifest.name || '';
    const namePart = displayName ? `${displayName} ` : '';
    const verPart = manifest.version ? `v${manifest.version} ` : '';
    statusEl.textContent = `${i18n.t('admin.manifestParsed') || '已解析 manifest'}：${namePart}${verPart}(${result.fileName})`;

    document.getElementById('quickCreateSummary').classList.remove('hidden');
    document.getElementById('quickCreateSubmitBtn').disabled = false;
  } catch (err) {
    console.error('Quick create parse error:', err);
    statusEl.classList.remove('parsing', 'success');
    statusEl.classList.add('error');
    statusEl.textContent = (i18n.t('admin.manifestParseFailed') || '解析 manifest 失败') + ': ' + err.message;
    document.getElementById('quickCreateSummary').classList.add('hidden');
    document.getElementById('quickCreateSubmitBtn').disabled = true;
  }
}

async function quickCreateSubmit(e) {
  e.preventDefault();

  const fileInput = document.getElementById('quickCreateFile');
  const versionFile = fileInput.files[0];
  if (!versionFile) return;

  const slug = document.getElementById('quickCreateSlug').value.trim();
  const name = document.getElementById('quickCreateName').value.trim();
  const description = document.getElementById('quickCreateDesc').value.trim();
  const nameEn = document.getElementById('quickCreateNameEn').value.trim();
  const descriptionEn = document.getElementById('quickCreateDescEn').value.trim();
  const author = document.getElementById('quickCreateAuthor').value.trim();
  const website = document.getElementById('quickCreateWebsite').value.trim();
  const tagsStr = document.getElementById('quickCreateTags').value.trim();
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
  const iconData = quickCreateExtInfo?.iconData || null;

  const versionNumber = document.getElementById('quickCreateVersion').value.trim();
  const changelog = document.getElementById('quickCreateChangelog').value.trim();
  const minAppVersion = document.getElementById('quickCreateMinApp').value.trim();
  const minAppCodeRaw = document.getElementById('quickCreateMinAppCode').value.trim();
  const minAppVersionCode = minAppCodeRaw ? parseInt(minAppCodeRaw, 10) : null;

  const errorEl = document.getElementById('quickCreateError');
  const submitBtn = document.getElementById('quickCreateSubmitBtn');
  const progressWrap = document.getElementById('quickCreateProgress');
  const progressFill = document.getElementById('quickCreateProgressFill');
  const progressPercent = document.getElementById('quickCreateProgressPercent');
  const progressStage = document.getElementById('quickCreateProgressStage');
  errorEl.classList.add('hidden');

  const setProgress = (percent, stageKey, fallback) => {
    const clamped = Math.max(0, Math.min(100, percent));
    progressFill.style.width = clamped + '%';
    progressPercent.textContent = Math.round(clamped) + '%';
    if (stageKey) progressStage.textContent = i18n.t(stageKey) || fallback;
  };

  progressWrap.classList.remove('hidden');
  setProgress(0, 'admin.stagePreparing', '准备中...');
  submitBtn.disabled = true;
  submitBtn.classList.add('disabled');
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = i18n.t('admin.uploading') || '上传中...';

  try {
    // 阶段 1：创建扩展（0% - 12%）
    setProgress(5, 'admin.stageCreatingExtension', '正在创建扩展...');
    const createResult = await appSupabase.client.rpc('admin_create_extension', {
      p_slug: slug,
      p_name: name,
      p_description: description,
      p_name_en: nameEn || null,
      p_description_en: descriptionEn || null,
      p_author: author,
      p_icon_url: null,
      p_website: website,
      p_tags: tags
    });

    if (createResult.error) {
      throw new Error(createResult.error.message || (i18n.t('admin.createFailed') || '创建扩展失败'));
    }
    const createData = createResult.data;
    if (createData && createData.success === false) {
      throw new Error(createData.message || (i18n.t('admin.createFailed') || '创建扩展失败'));
    }

    const extensionId = createData?.extension_id;
    if (!extensionId) {
      throw new Error(i18n.t('admin.createFailed') || '创建扩展失败：未获取到扩展ID');
    }

    // 阶段 1.5：处理图标（上传到 Storage 或直接使用 URL）（12% - 18%）
    let iconStoragePath = null;
    if (iconData) {
      // ZIP 内图标：上传到 Storage
      setProgress(13, '', '正在上传图标...');
      try {
        iconStoragePath = await uploadIconToStorage(iconData, extensionId);
        if (iconStoragePath) {
          const { data: updateData, error: updateError } = await appSupabase.client.rpc('admin_update_extension', {
            p_extension_id: extensionId,
            p_slug: null,
            p_name: null,
            p_description: null,
            p_name_en: null,
            p_description_en: null,
            p_author: null,
            p_icon_url: iconStoragePath,
            p_website: null,
            p_tags: null
          });
          if (updateError) {
            console.warn('[Admin] Failed to update icon_url in DB:', updateError.message);
          } else if (updateData && updateData.success === false) {
            console.warn('[Admin] Icon URL update returned failure:', updateData.message);
          }
        }
      } catch (iconErr) {
        console.warn('[Admin] Icon upload failed, continuing without icon:', iconErr);
      }
    } else if (quickCreateExtInfo?.iconUrl) {
      // URL 图标：直接使用 URL 作为 icon_url
      setProgress(13, '', '正在保存图标地址...');
      try {
        const { data: updateData, error: updateError } = await appSupabase.client.rpc('admin_update_extension', {
          p_extension_id: extensionId,
          p_slug: null,
          p_name: null,
          p_description: null,
          p_name_en: null,
          p_description_en: null,
          p_author: null,
          p_icon_url: quickCreateExtInfo.iconUrl,
          p_website: null,
          p_tags: null
        });
        if (updateError) {
          console.warn('[Admin] Failed to save icon URL in DB:', updateError.message);
        } else if (updateData && updateData.success === false) {
          console.warn('[Admin] Icon URL save returned failure:', updateData.message);
        }
      } catch (iconErr) {
        console.warn('[Admin] Icon URL save failed:', iconErr);
      }
    }
    setProgress(18, 'admin.stageReadingFile', '正在读取文件...');

    // 阶段 2：上传文件（15% - 85%）
    const fileBuffer = await versionFile.arrayBuffer();
    const fileSize = versionFile.size;
    setProgress(18, 'admin.stageChecksum', '正在计算校验和...');
    const fileChecksum = await calculateChecksum(fileBuffer);
    setProgress(22, 'admin.stageUploading', '正在上传文件...');
    const filePath = `extensions/${extensionId}/${versionNumber}/${versionFile.name}`;

    const uploadUrl = `${appSupabase.client.supabaseUrl}/storage/v1/object/extension-files/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
    const { data: sessionData } = await appSupabase.client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.setRequestHeader('x-upsert', 'true');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const uploadRatio = ev.loaded / ev.total;
          const overall = 22 + uploadRatio * 63;
          setProgress(overall, 'admin.stageUploading', '正在上传文件...');
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(85, 'admin.stageCreatingVersion', '正在创建版本记录...');
          resolve();
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.message) msg = resp.message;
            else if (resp.error) msg = resp.error;
          } catch (_) {}
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error(i18n.t('admin.uploadFailed') || '文件上传失败'));
      xhr.onabort = () => reject(new Error('Upload aborted'));
      xhr.send(fileBuffer);
    });

    // 阶段 3：创建版本记录（85% - 100%）
    const { data: versionResult, error: versionError } = await appSupabase.client.rpc('admin_create_extension_version', {
      p_extension_id: extensionId,
      p_version_number: versionNumber,
      p_changelog: changelog,
      p_file_path: filePath,
      p_file_size: fileSize,
      p_checksum: fileChecksum,
      p_min_app_version: minAppVersion,
      p_min_app_version_code: minAppVersionCode
    });

    if (versionError) throw versionError;
    if (versionResult && versionResult.success === false) {
      throw new Error(versionResult.message);
    }

    setProgress(100, 'admin.stageDone', '完成');
    closeQuickCreateModal();
    loadExtensions();
  } catch (error) {
    console.error('Quick create error:', error);
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('disabled');
    submitBtn.textContent = originalBtnText;
    setTimeout(() => {
      progressWrap.classList.add('hidden');
      setProgress(0, '', '');
    }, 800);
  }
}

async function calculateChecksum(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 事件绑定 ==========

document.addEventListener('click', (e) => {
  const userDetailModal = document.getElementById('userDetailModal');
  const addCodesModal = document.getElementById('addCodesModal');
  const editExtensionModal = document.getElementById('editExtensionModal');
  const extensionDetailModal = document.getElementById('extensionDetailModal');
  const addVersionModal = document.getElementById('addVersionModal');
  const manifestUpdateModal = document.getElementById('manifestUpdateModal');
  const quickCreateModal = document.getElementById('quickCreateModal');
  
  if (e.target.classList.contains('modal-backdrop')) {
    if (userDetailModal && !userDetailModal.classList.contains('hidden')) closeUserDetailModal();
    if (addCodesModal && !addCodesModal.classList.contains('hidden')) closeAddCodesModal();
    if (editExtensionModal && !editExtensionModal.classList.contains('hidden')) closeEditExtensionModal();
    if (extensionDetailModal && !extensionDetailModal.classList.contains('hidden')) closeExtensionDetailModal();
    if (addVersionModal && !addVersionModal.classList.contains('hidden')) closeAddVersionModal();
    if (manifestUpdateModal && !manifestUpdateModal.classList.contains('hidden')) closeManifestUpdateModal();
    if (quickCreateModal && !quickCreateModal.classList.contains('hidden')) closeQuickCreateModal();
    const crashReportModal = document.getElementById('crashReportModal');
    if (crashReportModal && !crashReportModal.classList.contains('hidden')) closeCrashReportModal();
    const appVersionDetailModal = document.getElementById('appVersionDetailModal');
    if (appVersionDetailModal && !appVersionDetailModal.classList.contains('hidden')) closeAppVersionDetailModal();
  }
});

// ========== 崩溃报告管理功能 ==========

let currentCrashReportId = null;
let currentCrashLogFilePath = null;

function crashLocale() {
  return i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US';
}

function formatCrashTime(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString(crashLocale());
  } catch (e) {
    return String(value);
  }
}

function crashTypeLabel(type) {
  switch (type) {
    case 'main_process': return i18n.t('admin.crashTypeMain') || '主进程崩溃';
    case 'renderer': return i18n.t('admin.crashTypeRenderer') || '渲染进程错误';
    case 'render_process_gone': return i18n.t('admin.crashTypeGone') || '渲染进程崩溃';
    case 'unhandled_rejection': return i18n.t('admin.crashTypeRejection') || '异步异常';
    case 'warning': return i18n.t('admin.crashTypeWarning') || '警告';
    default: return i18n.t('admin.crashTypeUnknown') || '未知类型';
  }
}

function crashStatusLabel(status) {
  switch (status) {
    case 'reviewed': return i18n.t('admin.crashStatusReviewed') || '已查看';
    case 'resolved': return i18n.t('admin.crashStatusResolved') || '已解决';
    default: return i18n.t('admin.crashStatusPending') || '待处理';
  }
}

function crashStatusColor(status) {
  switch (status) {
    case 'reviewed': return '#f59e0b';
    case 'resolved': return '#22c55e';
    default: return '#ef4444';
  }
}

async function loadCrashReports() {
  const list = document.getElementById('crashReportsList');
  if (!list) return;
  showLoading(list);

  try {
    const { data: reports, error } = await appSupabase.client.rpc('admin_list_crash_reports');

    if (error) {
      console.error('Load crash reports error:', error);
      showErrorState(list, i18n.t('common.error'));
      return;
    }

    if (!reports || reports.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <p>${i18n.t('admin.noCrashReports') || '暂无崩溃报告'}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = reports.map(r => {
      const reporter = r.username || r.email || (i18n.t('admin.crashReporterAnonymous') || '匿名用户');
      const msg = (r.message || '').replace(/\s+/g, ' ').trim();
      const shortMsg = msg.length > 90 ? msg.substring(0, 90) + '…' : msg;
      return `
      <div class="code-card">
        <div class="code-info">
          <div class="code-code">${escapeHtml(shortMsg) || (i18n.t('admin.crashMessage') || '错误信息')}</div>
          <div class="code-details">
            <p>${crashTypeLabel(r.error_type)} · <span style="color:${crashStatusColor(r.status)}">● ${crashStatusLabel(r.status)}</span></p>
            <p>${i18n.t('admin.crashAppVersion') || '应用版本'}: ${escapeHtml(r.app_version || '-')} · ${i18n.t('admin.crashPlatform') || '平台'}: ${escapeHtml(r.platform || '-')}</p>
            <p>${i18n.t('admin.crashReporter') || '上报用户'}: ${escapeHtml(reporter)} · ${i18n.t('admin.crashTime') || '上报时间'}: ${formatCrashTime(r.reported_at)}</p>
          </div>
        </div>
        <div class="code-actions">
          <button class="action-btn" onclick="viewCrashReport('${r.report_id}')">${i18n.t('admin.viewDetail') || '详情'}</button>
          <button class="action-btn delete" onclick="deleteCrashReport('${r.report_id}')">${i18n.t('admin.delete') || '删除'}</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (error) {
    console.error('Load crash reports error:', error);
    showErrorState(list, error.message || i18n.t('common.networkError'));
  }
}

async function viewCrashReport(reportId) {
  try {
    const { data, error } = await appSupabase.client.rpc('admin_get_crash_report', { p_report_id: reportId });

    if (error || !data || data.error) {
      alert(i18n.t('common.error'));
      return;
    }

    currentCrashReportId = reportId;
    const d = data;
    currentCrashLogFilePath = d.log_file_path || null;
    const reporter = d.username || d.email || (i18n.t('admin.crashReporterAnonymous') || '匿名用户');

    const content = document.getElementById('crashReportDetailContent');
    content.innerHTML = `
      <div class="detail-section">
        <h3>${i18n.t('admin.crashMessage') || '错误信息'}</h3>
        <p style="white-space: pre-wrap; word-break: break-all;">${escapeHtml(d.message || '-')}</p>
      </div>

      <div class="detail-section">
        <h3>${i18n.t('admin.crashStack') || '调用堆栈'}</h3>
        <pre style="white-space: pre-wrap; word-break: break-all; background: var(--surface-light); padding: 12px; border-radius: 8px; font-size: 12px; margin: 0; max-height: 240px; overflow: auto;">${escapeHtml(d.stack || (i18n.t('admin.crashStackEmpty') || '无堆栈信息'))}</pre>
      </div>

      <div class="detail-section">
        <h3>${i18n.t('admin.crashLog') || '应用日志'}</h3>
        <pre id="crashLogContent" style="white-space: pre-wrap; word-break: break-all; background: var(--surface-light); padding: 12px; border-radius: 8px; font-size: 12px; margin: 0; max-height: 260px; overflow: auto;">${escapeHtml(d.log_content || (i18n.t('admin.crashLogEmpty') || '无日志内容'))}</pre>
        ${d.log_file_path ? `
        <p style="margin: 8px 0 0;">
          <button class="btn btn-secondary" onclick="loadFullCrashLog(this)">${i18n.t('admin.crashLoadFullLog') || '加载完整日志'}</button>
          <button class="btn btn-secondary" onclick="openFullCrashLog()">${i18n.t('admin.crashOpenFullLog') || '在新标签打开'}</button>
        </p>` : `
        <p style="margin: 8px 0 0;">${i18n.t('admin.crashFullLogEmpty') || '无完整日志文件'}</p>`}
      </div>

      <div class="detail-section">
        <h3>${i18n.t('admin.basicInfo') || '基本信息'}</h3>
        <div class="detail-grid">
          <div><span class="detail-label">${i18n.t('admin.crashStatus') || '状态'}</span><p style="color:${crashStatusColor(d.status)}">${crashStatusLabel(d.status)}</p></div>
          <div><span class="detail-label">${i18n.t('admin.crashAppVersion') || '应用版本'}</span><p>${escapeHtml(d.app_version || '-')}</p></div>
          <div><span class="detail-label">${i18n.t('admin.crashPlatform') || '平台'}</span><p>${escapeHtml(d.platform || '-')}</p></div>
          <div><span class="detail-label">${i18n.t('admin.crashOsInfo') || '系统信息'}</span><p>${escapeHtml(d.os_info || '-')}</p></div>
          <div><span class="detail-label">${i18n.t('admin.crashReporter') || '上报用户'}</span><p>${escapeHtml(reporter)}</p></div>
          <div><span class="detail-label">${i18n.t('admin.crashDevice') || '设备'}</span><p>${escapeHtml(d.device_id || '-')}</p></div>
          <div><span class="detail-label">${i18n.t('admin.crashTime') || '上报时间'}</span><p>${formatCrashTime(d.reported_at)}</p></div>
        </div>
      </div>

      <div class="detail-section">
        <h3>${i18n.t('admin.crashNote') || '处理备注'}</h3>
        <textarea id="crashAdminNote" rows="3" style="width: 100%; box-sizing: border-box;" placeholder="${escapeHtml(i18n.t('admin.crashNotePlaceholder') || '填写处理备注...')}">${escapeHtml(d.admin_note || '')}</textarea>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="updateCrashReport('reviewed')">${i18n.t('admin.crashMarkReviewed') || '标记已查看'}</button>
        <button class="btn btn-secondary" onclick="updateCrashReport('resolved')">${i18n.t('admin.crashMarkResolved') || '标记已解决'}</button>
        <button class="btn btn-secondary" onclick="updateCrashReport('pending')">${i18n.t('admin.crashResetPending') || '重置为待处理'}</button>
        <button class="btn btn-danger" onclick="deleteCrashReport('${reportId}', true)">${i18n.t('admin.crashDelete') || '删除报告'}</button>
      </div>
    `;

    const modal = document.getElementById('crashReportModal');
    modal.classList.remove('hidden');
    modal.classList.add('active');
  } catch (error) {
    console.error('View crash report error:', error);
    alert(i18n.t('common.error'));
  }
}

function closeCrashReportModal() {
  const modal = document.getElementById('crashReportModal');
  modal.classList.remove('active');
  currentCrashReportId = null;
  currentCrashLogFilePath = null;
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// 生成完整日志文件的签名 URL
async function getCrashLogSignedUrl() {
  if (!currentCrashLogFilePath) return null;
  const fileName = currentCrashLogFilePath.split('/').pop();
  const { data: signed, error } = await appSupabase.client.storage
    .from('crash-logs')
    .createSignedUrl(fileName, 3600);
  if (error || !signed || !signed.signedUrl) return null;
  return signed.signedUrl;
}

// 在详情弹窗内加载并显示完整日志内容（实际 log 文件是完整的）
async function loadFullCrashLog(btn) {
  const pre = document.getElementById('crashLogContent');
  if (!pre) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = i18n.t('admin.crashLoadingFullLog') || '正在加载完整日志…';
  }
  try {
    const url = await getCrashLogSignedUrl();
    if (!url) throw new Error('no signed url');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('http ' + resp.status);
    const text = await resp.text();
    pre.textContent = text;
    if (btn) {
      btn.textContent = `${i18n.t('admin.crashLoadFullLogDone') || '已显示完整日志'}（${text.length.toLocaleString(crashLocale())} ${i18n.t('admin.crashChars') || '字符'}）`;
    }
  } catch (e) {
    console.error('Load full crash log error:', e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = i18n.t('admin.crashLoadFullLogFailed') || '加载失败，重试';
    }
  }
}

// 在新标签页打开完整日志文件（强制 UTF-8 编码显示中文）
async function openFullCrashLog() {
  try {
    const url = await getCrashLogSignedUrl();
    if (!url) {
      alert(i18n.t('admin.crashViewFullLogFailed') || '获取日志文件失败');
      return;
    }
    // 读取内容后以 UTF-8 Blob 重新打开，避免浏览器按本地编码乱码
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('http ' + resp.status);
    const text = await resp.text();
    const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
    const objUrl = URL.createObjectURL(blob);
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
  } catch (e) {
    console.error('Open full crash log error:', e);
    alert(i18n.t('admin.crashViewFullLogFailed') || '获取日志文件失败');
  }
}

async function updateCrashReport(status) {
  if (!currentCrashReportId) return;

  const noteEl = document.getElementById('crashAdminNote');
  const note = noteEl ? noteEl.value.trim() : '';

  try {
    const { data, error } = await appSupabase.client.rpc('admin_update_crash_report', {
      p_report_id: currentCrashReportId,
      p_status: status,
      p_admin_note: note || null
    });

    if (error || (data && data.success === false)) {
      alert(i18n.t('admin.crashUpdateFailed') || '更新失败');
      return;
    }

    alert(i18n.t('admin.crashUpdated') || '已更新');
    closeCrashReportModal();
    loadCrashReports();
  } catch (error) {
    console.error('Update crash report error:', error);
    alert(i18n.t('admin.crashUpdateFailed') || '更新失败');
  }
}

async function deleteCrashReport(reportId, fromDetail) {
  if (!confirm(i18n.t('admin.crashDeleteConfirm') || '确定要删除这条崩溃报告吗？')) return;

  try {
    const { data, error } = await appSupabase.client.rpc('admin_delete_crash_report', { p_report_id: reportId });

    if (error || (data && data.success === false)) {
      alert(i18n.t('admin.crashDeleteFailed') || '删除失败');
      return;
    }

    alert(i18n.t('admin.crashDeleteSuccess') || '删除成功');
    if (fromDetail) closeCrashReportModal();
    loadCrashReports();
  } catch (error) {
    console.error('Delete crash report error:', error);
    alert(i18n.t('admin.crashDeleteFailed') || '删除失败');
  }
}

// ========== 应用（MyZone）版本管理 ==========
// 应用版本元数据在 Supabase Storage bucket "updates"：
//   updates/latest.json                当前最新版本
//   updates/{version}/manifest.json    某版本的清单（含 files 映射 + RSA 签名）
//   updates/{version}/meta.json        维护备注（非签名，仅管理用，客户端不读取）
//   files/{prefix2}/{hash}             文件对象（全局去重）；大文件分片 files/{prefix2}/{hash}/part-N
const APP_VERSION_BUCKET = 'updates';

let currentAppVersion = null;   // 当前查看详情的版本号
let currentAppManifest = null;
let appVersionManifestsCache = new Map();
let appVersionOrder = [];       // 升序版本号列表，用于计算相对上一版本的增量/变更

function appVersionPublicUrl(storagePath) {
  return `${appSupabase.client.supabaseUrl}/storage/v1/object/public/${APP_VERSION_BUCKET}/${storagePath}`;
}

async function fetchAppVersionJson(storagePath) {
  // latest.json 是易变指针文件，公共对象 URL 会被 Supabase CDN 长期缓存，
  // 不加时间戳绕过缓存时，刚上传的新版本号不会立刻反映到页面
  const bust = /(^|\/)latest\.json$/.test(storagePath) ? `?t=${Date.now()}` : '';
  const resp = await fetch(appVersionPublicUrl(storagePath) + bust);
  if (!resp.ok) throw new Error('http ' + resp.status);
  return resp.json();
}

function formatBytes(bytes) {
  if (bytes == null) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// 内容稳定标识：优先混淆前源码哈希（源码未变则跨构建稳定，忽略混淆随机性），否则用文件哈希
function stableFileKey(info) {
  return info ? (info.sourceHash || info.hash) : undefined;
}

// 对照上一版本清单，计算当前版本的增量体积与变更文件状态。
// status: added=新增 / modified=修改 / unchanged=不变 / deleted=删除
function computeAppVersionDelta(currentFiles, prevFiles) {
  const changed = [];
  const statusByPath = {};
  let deltaSize = 0;
  for (const [relPath, info] of Object.entries(currentFiles || {})) {
    const prev = prevFiles ? prevFiles[relPath] : null;
    if (!prev) {
      statusByPath[relPath] = 'added';
      changed.push({ relPath, size: info.size || 0, deleted: false, status: 'added' });
      deltaSize += (info.size || 0);
    } else if (stableFileKey(prev) !== stableFileKey(info)) {
      statusByPath[relPath] = 'modified';
      changed.push({ relPath, size: info.size || 0, deleted: false, status: 'modified' });
      deltaSize += (info.size || 0);
    } else {
      statusByPath[relPath] = 'unchanged';
    }
  }
  if (prevFiles) {
    for (const relPath of Object.keys(prevFiles)) {
      if (!currentFiles || !currentFiles[relPath]) {
        statusByPath[relPath] = 'deleted';
        changed.push({ relPath, size: 0, deleted: true, status: 'deleted' });
      }
    }
  }
  return { changed, deltaSize, count: changed.length, statusByPath };
}

async function loadAppVersions() {
  const listEl = document.getElementById('appVersionsList');
  if (!listEl) return;
  showLoading(listEl);

  try {
    let latest = null;
    try { latest = await fetchAppVersionJson('updates/latest.json'); } catch (e) { latest = null; }

    const { data: items, error } = await appSupabase.client.storage
      .from(APP_VERSION_BUCKET)
      .list('updates', { limit: 1000 });
    if (error) throw error;

    // 版本目录名遵循 semver（如 1.2.3）；latest.json / files 等非版本项会被正则排除
    // 不依赖 storage 返回的 id===null 文件夹标记（不同 supabase-js 版本行为不一致）
    const dirs = (items || []).filter(it => it && it.name && /^\d+(\.\d+){1,}[0-9A-Za-z.\-]*$/.test(it.name));

    // 并行拉取所有版本的 manifest，避免逐个串行导致加载缓慢
    const manifests = await Promise.all(
      dirs.map(async dir => {
        try { return await fetchAppVersionJson(`updates/${dir.name}/manifest.json`); }
        catch (e) { return null; }
      })
    );

    const versions = [];
    dirs.forEach((dir, i) => {
      const manifest = manifests[i];
      const fileEntries = manifest && manifest.files ? manifest.files : {};
      versions.push({
        version: dir.name,
        manifest,
        fileCount: Object.keys(fileEntries).length,
        totalSize: Object.values(fileEntries).reduce((s, f) => s + (f.size || 0), 0),
        createdAt: manifest ? manifest.createdAt : null,
        versionCode: manifest ? manifest.versionCode : null,
        isLatest: latest && String(latest.version) === String(dir.name)
      });
      appVersionManifestsCache.set(dir.name, manifest);
    });

    versions.sort((a, b) => {
      if (a.versionCode != null && b.versionCode != null) return a.versionCode - b.versionCode;
      return String(a.version).localeCompare(String(b.version), undefined, { numeric: true });
    });
    appVersionOrder = versions.map(v => v.version);

    // 计算每个版本相对上一版本的增量与变更文件
    versions.forEach((v, i) => {
      const prevFiles = i > 0 && versions[i - 1].manifest ? (versions[i - 1].manifest.files || {}) : null;
      v.delta = prevFiles ? computeAppVersionDelta(v.manifest.files || {}, prevFiles) : null;
    });

    // 文件对象在存储中按 hash 全局去重（files/{prefix}/{hash}），跨版本重复文件只计一次
    const uniqueFiles = new Set();
    versions.forEach(v => {
      for (const info of Object.values(v.manifest && v.manifest.files || {})) {
        if (info && info.hash) uniqueFiles.add(info.hash);
      }
    });
    const totalFiles = uniqueFiles.size;
    const t = (k, fb) => (i18n && i18n.t ? (i18n.t('admin.' + k) || fb) : fb);

    if (versions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <p>${t('appVersionsEmpty', '暂无已发布版本')}</p>
        </div>`;
      return;
    }

    const latestBadge = (v) => v.isLatest
      ? `<span style="color:#22c55e;font-size:12px;font-weight:500;">${t('appLatest', '最新')}</span>`
      : '';

    listEl.innerHTML = `
      <p style="color:var(--text-muted);font-size:13px;margin:0 0 12px;">
        ${t('appVersionsSummary', '共 {n} 个版本，{f} 个文件').replace('{n}', versions.length).replace('{f}', totalFiles)}
      </p>
      <div class="app-versions-list">
        ${versions.map(v => `
          <div class="app-version-card">
            <div class="app-version-head">
              <span class="app-version-name">${escapeHtml(v.version)}</span>
              ${latestBadge(v)}
            </div>
            <div class="app-version-meta">
              <span>${t('appVersionCode', '绝对版本')}: ${v.versionCode != null ? escapeHtml(String(v.versionCode)) : '-'}</span>
              <span>${t('appFilesCount', '文件数')}: ${v.fileCount}</span>
              <span>${t('appTotalSize', '完整体积')}: ${formatBytes(v.totalSize)}</span>
              ${v.delta ? `<span>${t('appDeltaSize', '相对上一版本增量')}: ${formatBytes(v.delta.deltaSize)} · ${v.delta.count} ${t('appChangedFiles', '个文件')}</span>` : ''}
              <span>${t('appPublishTime', '发布时间')}: ${v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'}</span>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:10px;">
              <button class="btn btn-primary btn-sm" onclick='viewAppVersionDetail(${JSON.stringify(v.version)})'>${t('appViewDetail', '查看文件与缺失')}</button>
            </div>
          </div>
        `).join('')}
      </div>`;
  } catch (err) {
    console.error('Load app versions error:', err);
    showErrorState(listEl, i18n.t('common.error'));
  }
}

async function viewAppVersionDetail(version) {
  currentAppVersion = version;
  const content = document.getElementById('appVersionDetailContent');
  const title = document.getElementById('appVersionDetailTitle');
  if (title) title.textContent = `${i18n.t('admin.appVersionDetail') || '应用版本详情'}: ${version}`;
  showLoading(content);
  document.getElementById('appVersionDetailModal').classList.remove('hidden');
  document.getElementById('appVersionDetailModal').classList.add('active');

  const t = (k, fb) => (i18n.t('admin.' + k) || fb);

  try {
    let manifest = appVersionManifestsCache.get(version);
    if (!manifest) manifest = await fetchAppVersionJson(`updates/${version}/manifest.json`);
    currentAppManifest = manifest;

    const fileEntries = manifest.files || {};
    const files = Object.entries(fileEntries);
    const totalSize = files.reduce((s, [, f]) => s + (f.size || 0), 0);

    // 相对上一版本的增量与变更文件
    const idx = appVersionOrder.indexOf(version);
    const prevVersion = idx > 0 ? appVersionOrder[idx - 1] : null;
    let delta = null;
    let prevFiles = {};
    if (prevVersion) {
      const pm = appVersionManifestsCache.get(prevVersion);
      prevFiles = (pm && pm.files) || {};
      delta = computeAppVersionDelta(fileEntries, prevFiles);
      delta.prevVersion = prevVersion;
    }

    // 缺失检测
    const { missing } = await detectAppVersionMissing(fileEntries);
    const missingKeys = new Set(missing.map(m => m.relPath));

    // 维护备注（meta.json，非签名）
    let notes = '';
    try { const meta = await fetchAppVersionJson(`updates/${version}/meta.json`); notes = meta.notes || ''; } catch (e) { notes = ''; }

    const missingSummary = missing.length === 0
      ? `<span style="color:#22c55e;font-weight:500;">${t('appNoMissing', '无缺失文件')}</span>`
      : `<span style="color:#d84a3f;font-weight:500;">${t('appMissingCount', '缺失 {n} 个文件').replace('{n}', missing.length)}</span>`;

    const tree = buildAppVersionStatusTree(fileEntries, (delta && delta.statusByPath) || {}, prevFiles);
    const treeHtml = renderAppVersionTree(tree, missingKeys, t);

    // 变更文件列表 HTML
    const deltaHtml = delta && delta.count
      ? `<div class="app-delta-box">
          <div class="app-delta-head">
            <span>${t('appDeltaTitle', '相对上一版本 {v} 的变更').replace('{v}', escapeHtml(delta.prevVersion))}</span>
            <span class="app-delta-size">${t('appDeltaSize', '增量')}: ${formatBytes(delta.deltaSize)} · ${delta.count} ${t('appChangedFiles', '个文件')}</span>
          </div>
          <ul class="app-delta-list">
            ${delta.changed.map(c => {
              const badge = c.deleted
                ? `<span class="app-badge deleted">${t('appDeleted', '删除')}</span>`
                : (missingKeys.has(c.relPath)
                    ? `<span class="app-badge missing">${t('appMissing', '缺失')}</span>`
                    : `<span class="app-badge ${c.size ? 'modified' : 'added'}">${c.size ? t('appModified', '修改') : t('appAdded', '新增')}</span>`);
              return `<li>${badge}<span class="app-delta-path">${escapeHtml(c.relPath)}</span><span class="app-delta-size">${c.deleted ? '-' : formatBytes(c.size)}</span></li>`;
            }).join('')}
          </ul>
        </div>`
      : '<div class="empty-state" style="padding:16px;"><p style="color:var(--text-muted);">' + t('appDeltaNone', '无变更文件（首版本或内容无变化）') + '</p></div>';

    content.innerHTML = `
      <div class="detail-section">
        <div class="detail-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
          <div><span class="detail-label">${t('versionNumber', '版本号')}</span><span>${escapeHtml(version)}</span></div>
          <div><span class="detail-label">${t('appVersionCode', '绝对版本')}</span><span>${manifest.versionCode != null ? escapeHtml(String(manifest.versionCode)) : '-'}</span></div>
          <div><span class="detail-label">${t('appCreatedAt', '创建时间')}</span><span>${manifest.createdAt ? new Date(manifest.createdAt).toLocaleString() : '-'}</span></div>
          <div><span class="detail-label">${t('appFilesCount', '文件数')}</span><span>${files.length}</span></div>
          <div><span class="detail-label">${t('appTotalSize', '完整体积')}</span><span>${formatBytes(totalSize)}</span></div>
          ${delta ? `<div><span class="detail-label">${t('appDeltaSize', '相对上一版本增量')}</span><span>${formatBytes(delta.deltaSize)}</span></div>` : ''}
          <div><span class="detail-label">${t('appIntegrity', '完整性')}</span><span>${missingSummary}</span></div>
        </div>
        ${missing.length > 0 ? `
        <div class="app-missing-box">
          <strong>${t('appMissingTitle', '缺失文件')}</strong>
          <ul class="app-missing-list">
            ${missing.map(m => `<li>${escapeHtml(m.relPath)} <span>${escapeHtml(m.reason)}</span></li>`).join('')}
          </ul>
        </div>` : ''}
      </div>

      <div class="detail-section">
        <h3>${t('appChangesTitle', '相对上一版本的变更')}</h3>
        ${deltaHtml}
      </div>

      <div class="detail-section">
        <h3>${t('appFilesTree', '文件结构')} (${files.length})</h3>
        <div class="app-file-tree">
          ${treeHtml}
        </div>
      </div>

      <div class="detail-section">
        <h3>${t('appNote', '维护备注')}</h3>
        <textarea id="appVersionNote" rows="3" placeholder="${t('appNotePlaceholder', '仅管理用，不进入签名 manifest，客户端不会读取该字段')}" style="width:100%;box-sizing:border-box;">${escapeHtml(notes)}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-primary btn-sm" onclick="saveAppVersionNote()">${t('appNoteSave', '保存备注')}</button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('View app version detail error:', err);
    content.innerHTML = `<div class="empty-state"><p>${t('appDetailFailed', '加载版本详情失败')}</p></div>`;
  }
}

function closeAppVersionDetailModal() {
  const modal = document.getElementById('appVersionDetailModal');
  modal.classList.remove('active');
  currentAppVersion = null;
  currentAppManifest = null;
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// 缺失检测：对照 manifest 中每个 hash，检查 files/{prefix}/{hash}（分片文件再检查 part-N）是否存在
async function detectAppVersionMissing(fileEntries) {
  const entries = Object.entries(fileEntries);
  const missing = [];
  if (entries.length === 0) return { missing, total: 0 };

  // 按前缀分组，普通文件与分片文件分别记录
  const grouped = {};
  for (const [relPath, info] of entries) {
    const hash = info.hash;
    if (!hash) { missing.push({ relPath, reason: '缺少 hash' }); continue; }
    const prefix = hash.substring(0, 2);
    grouped[prefix] = grouped[prefix] || { normal: new Set(), chunked: new Map() };
    if (info.chunks && info.chunks.length) {
      grouped[prefix].chunked.set(hash, info.chunks.length);
    } else {
      grouped[prefix].normal.add(hash);
    }
  }

  const presentNormal = new Set();              // "prefix/hash"
  const presentPartsByDir = new Map();          // "prefix/hash" -> Set(part names)

  // 收集所有 list 目标，一次性并发出请求，避免逐个串行等待
  const ops = [];
  for (const prefix of Object.keys(grouped)) {
    if (grouped[prefix].normal.size) ops.push({ kind: 'normal', key: prefix, path: `files/${prefix}` });
    for (const hash of grouped[prefix].chunked.keys()) {
      ops.push({ kind: 'chunk', key: `${prefix}/${hash}`, path: `files/${prefix}/${hash}` });
    }
  }

  const results = await Promise.all(
    ops.map(async op => {
      const { data, error } = await appSupabase.client.storage.from(APP_VERSION_BUCKET).list(op.path, { limit: 1000 });
      return { op, names: (!error && data) ? data.filter(d => d.name).map(d => d.name) : [] };
    })
  );

  for (const r of results) {
    if (r.op.kind === 'normal') {
      for (const n of r.names) presentNormal.add(r.op.key + '/' + n);
    } else {
      presentPartsByDir.set(r.op.key, new Set(r.names));
    }
  }

  for (const [relPath, info] of entries) {
    const hash = info.hash;
    if (!hash) continue;
    const key = hash.substring(0, 2) + '/' + hash;
    if (info.chunks && info.chunks.length) {
      const parts = presentPartsByDir.get(key);
      const wanted = Array.from({ length: info.chunks.length }, (_, i) => 'part-' + i);
      const missingParts = wanted.filter(p => !parts || !parts.has(p));
      if (missingParts.length) {
        missing.push({ relPath, reason: `${i18n.t('admin.appChunk') || '分片'}: ${missingParts.join(', ')}` });
      }
    } else if (!presentNormal.has(key)) {
      missing.push({ relPath, reason: i18n.t('admin.appMissingFile') || '文件对象不存在' });
    }
  }

  return { missing, total: entries.length };
}

// 将「当前文件 + 相对上一版本的状态」构建为带颜色的目录树。
// statusByPath 覆盖当前文件与已删除文件；每个节点持有 status，目录色由子级聚合。
function buildAppVersionStatusTree(fileEntries, statusByPath, prevFiles) {
  const paths = new Set([...Object.keys(fileEntries), ...Object.keys(statusByPath)]);
  const root = { name: '', dir: true, children: {} };
  for (const relPath of paths) {
    const status = statusByPath[relPath] || 'unchanged';
    const info = fileEntries[relPath] || (prevFiles ? prevFiles[relPath] : null);
    const parts = relPath.split('/');
    let node = root;
    parts.forEach((p, idx) => {
      const isFile = idx === parts.length - 1;
      if (isFile) {
        node.children['f:' + p] = { name: p, file: true, path: relPath, status, size: info ? info.size : 0 };
      } else {
        const key = 'd:' + p;
        if (!node.children[key]) node.children[key] = { name: p, dir: true, children: {} };
        node = node.children[key];
      }
    });
  }
  aggregateDirStatus(root);
  return root;
}

// 目录色 = 所有后代文件状态一致则取该状态，否则 modified(橙色)
function aggregateDirStatus(node) {
  const statuses = Object.values(node.children).map(child => {
    if (!child.file) aggregateDirStatus(child);
    return child.status;
  });
  node.status = statuses.length === 0
    ? 'unchanged'
    : (statuses.every(s => s === statuses[0]) ? statuses[0] : 'modified');
  return node.status;
}

function renderAppVersionTree(node, missingKeys, t) {
  const children = Object.values(node.children);
  if (!children.length) return '<span class="app-tree-empty">-</span>';
  children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : (a.dir ? -1 : 1)));

  const renderChildren = (items) => items.map(child => {
    if (child.dir) {
      return `
        <li class="app-tree-dir status-${child.status || 'unchanged'}">
          <span class="app-tree-toggle" onclick="toggleAppVersionDir(this)"></span>
          <span class="app-tree-name">${escapeHtml(child.name)}/</span>
          <ul class="app-tree-children hidden">${renderChildren(Object.values(child.children))}</ul>
        </li>`;
    }
    const isMissing = missingKeys.has(child.path);
    return `
      <li class="app-tree-file status-${child.status || 'unchanged'}">
        <span class="app-tree-caret"></span>
        <span class="app-tree-name">${escapeHtml(child.name)}</span>
        <span class="app-tree-info">${isMissing ? (t('appMissing', '缺失')) : (child.status === 'deleted' ? '' : formatBytes(child.size))}</span>
      </li>`;
  }).join('');

  return `<ul class="app-tree-root">${renderChildren(children)}</ul>`;
}

function toggleAppVersionDir(btn) {
  const li = btn.closest('li');
  const child = li && li.querySelector(':scope > .app-tree-children');
  if (child) child.classList.toggle('hidden');
  btn.classList.toggle('open');
}

// 保存维护备注到 updates/{version}/meta.json（非签名，不影响更新签名校验）
async function saveAppVersionNote() {
  if (!currentAppVersion) return;
  const el = document.getElementById('appVersionNote');
  const notes = el ? el.value : '';

  try {
    const sessionData = await appSupabase.client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      alert(i18n.t('common.loginFirst'));
      return;
    }

    const url = `${appSupabase.client.supabaseUrl}/storage/v1/object/${APP_VERSION_BUCKET}/updates/${currentAppVersion}/meta.json`;
    const body = JSON.stringify({ notes });
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
      xhr.setRequestHeader('apikey', appSupabase.client.supabaseKey);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || ''}`)));
      xhr.onerror = () => reject(new Error('network'));
      xhr.send(body);
    });

    alert(i18n.t('admin.appNoteSaveSuccess') || '备注已保存');
  } catch (err) {
    console.error('Save app version note error:', err);
    alert(i18n.t('admin.appNoteSaveFailed') || '备注保存失败：' + err.message);
  }
}

// ========== 内置 AI 管理 ==========

let aiModelsCache = [];
let aiKeysCache = [];
let aiCreditsCache = [];
let aiCurrentKeyModelId = null;
let aiActiveTab = 'models';
let aiUsageDays = 7;

function aiFormatNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 });
}

function aiDateTime(v) {
  if (!v) return '';
  return new Date(v).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US');
}

async function aiGetAdminToken() {
  const sessionData = await appSupabase.client.auth.getSession();
  return sessionData?.data?.session?.access_token || null;
}

// 调用 ai-gateway Edge Function（API Key 加解密在服务端完成）
async function aiEdgeAdminRequest(method, path, body) {
  const token = await aiGetAdminToken();
  if (!token) throw new Error('no-token');
  const resp = await fetch(SUPABASE_URL + '/functions/v1/ai-gateway/admin' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return resp.json();
}

async function aiEdgeKeyRequest(method, pathQuery, body) {
  return aiEdgeAdminRequest(method, '/key' + (pathQuery || ''), body);
}

function switchAITab(name) {
  aiActiveTab = name;
  document.querySelectorAll('.ai-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.aiTab === name);
  });
  document.querySelectorAll('.ai-tab-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('ai' + name.charAt(0).toUpperCase() + name.slice(1) + 'Panel');
  if (panel) panel.classList.remove('hidden');
  if (name === 'models') {
    loadAIModels();
  } else if (name === 'credits') {
    loadAICredits(document.getElementById('aiCreditsSearch').value.trim());
  } else if (name === 'usage') {
    loadAIUsage(aiUsageDays);
  }
}

function loadAIPage() {
  switchAITab(aiActiveTab);
}

// ---------- 模型管理 ----------

async function loadAIModels() {
  const list = document.getElementById('aiModelsList');
  showLoading(list);

  let billingCard = '';
  try {
    const cfgRes = await appSupabase.client.rpc('ai_admin_get_app_config');
    const baseRate = (cfgRes && !cfgRes.error && cfgRes.data && cfgRes.data.base_rate) ?? '';
    billingCard = `
      <div class="code-card">
        <div class="code-info">
          <div class="code-details" style="flex: 1;">
            <h4>${i18n.t('admin.aiBillingTitle')}</h4>
            <p style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <label for="aiBaseRateInput" style="color: var(--text-muted);">${i18n.t('admin.aiBaseRate')}</label>
              <input id="aiBaseRateInput" type="number" step="any" min="0" value="${escapeHtml(String(baseRate))}" style="width: 130px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text);">
              <span style="color: var(--text-muted); font-size: 12px;">${i18n.t('admin.aiBaseRateHint')}</span>
              <button class="action-btn primary" onclick="saveAIConfig('base_rate')">${i18n.t('common.save')}</button>
            </p>
          </div>
        </div>
      </div>`;
  } catch (e) { billingCard = ''; }

  try {
    const { data, error } = await appSupabase.client.rpc('ai_admin_list_models');
    if (error) {
      console.error('Load AI models error:', error);
      showErrorState(list, i18n.t('common.error'));
      return;
    }

    aiModelsCache = data || [];
    if (!aiModelsCache.length) {
      list.innerHTML = billingCard + `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 3v3"></path>
              <path d="M12 18v3"></path>
              <path d="M3 12h3"></path>
              <path d="M18 12h3"></path>
              <path d="M5.6 5.6l2.1 2.1"></path>
              <path d="M16.3 16.3l2.1 2.1"></path>
              <path d="M5.6 18.4l2.1-2.1"></path>
              <path d="M16.3 7.7l2.1-2.1"></path>
            </svg>
          </div>
          <p>${i18n.t('admin.aiNoModels')}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = billingCard + aiModelsCache.map(m => `
      <div class="code-card">
        <div class="code-info">
          <div class="code-details" style="flex: 1;">
            <h4>${escapeHtml(m.name)} <span class="ai-status-badge ${m.enabled ? 'on' : 'off'}">${m.enabled ? i18n.t('admin.aiEnabled') : i18n.t('admin.aiDisabled')}</span></h4>
            <p>${i18n.t('admin.aiModel')}: ${escapeHtml(m.model || '-')} · ${i18n.t('admin.aiModelType')}: ${m.model_type === 'image' ? i18n.t('admin.aiModelTypeImage') : m.model_type === 'video' ? i18n.t('admin.aiModelTypeVideo') : i18n.t('admin.aiModelTypeChat')} · ${i18n.t('admin.aiBackend')}: ${escapeHtml(m.backend || '-')}</p>
            ${m.model_type === 'image' || m.model_type === 'video'
              ? `<p>${i18n.t('admin.aiFixedRate')}: ${m.fixed_credits_per_call ?? 0} credits/${i18n.t('admin.aiPerCall')}${m.model_type === 'video' && m.video_operation ? ` · ${i18n.t('admin.aiVideoOperation')}: ${escapeHtml(m.video_operation)}${m.video_status_operation ? ` · ${i18n.t('admin.aiVideoStatusOperation')}: ${escapeHtml(m.video_status_operation)}` : ''}` : ''}</p>`
              : `<p>${i18n.t('admin.aiRatePerMillion')}: ${i18n.t('admin.aiRateInput')} ${m.rate_input_tokens ?? 0} / ${i18n.t('admin.aiRateOutput')} ${m.rate_output_tokens ?? 0} / ${i18n.t('admin.aiRateCached')} ${m.rate_cached_tokens ?? 0} credits</p>`}
            <p>${i18n.t('admin.aiKeysCount')}: ${m.key_count ?? 0} · ${i18n.t('admin.aiCost')}: ${m.key_total_cost ?? 0} credits · ${i18n.t('admin.aiMaxConcurrent')}: ${m.max_concurrent ?? 0}${m.context_length ? ` · ${i18n.t('admin.aiContextLength')}: ${Number(m.context_length).toLocaleString()}` : ''}</p>
          </div>
        </div>
        <div class="code-actions" style="flex-wrap: wrap; justify-content: flex-end;">
          <label class="ai-switch-label" title="${i18n.t('admin.aiEnabled')}">
            <input type="checkbox" class="ai-switch" ${m.enabled ? 'checked' : ''} onchange="toggleAIModelEnabled('${m.id}', this.checked)">
          </label>
          <button class="action-btn primary" onclick="openAIKeysModal('${m.id}')">${i18n.t('admin.aiManageKeys')}</button>
          <button class="action-btn edit" onclick="openAIModelModal('${m.id}')">${i18n.t('admin.aiEdit')}</button>
          <button class="action-btn" onclick="copyAIModel('${m.id}')">${i18n.t('admin.aiCopy')}</button>
          <button class="action-btn delete" onclick="deleteAIModel('${m.id}')">${i18n.t('admin.aiDelete')}</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load AI models error:', error);
    showErrorState(list, i18n.t('common.networkError'));
  }
}

async function toggleAIModelEnabled(modelId, enabled) {
  const model = aiModelsCache.find(m => m.id === modelId);
  if (!model) return;

  try {
    const { error } = await appSupabase.client.rpc('ai_admin_save_model', {
      p_id: model.id,
      p_name: model.name,
      p_backend: model.backend || 'openai',
      p_base_url: model.base_url,
      p_model: model.model,
      p_temperature: model.temperature ?? 0.7,
      p_enabled: enabled,
      p_rate_input: model.rate_input_tokens ?? 0,
      p_rate_output: model.rate_output_tokens ?? 0,
      p_rate_cached: model.rate_cached_tokens ?? 0,
      p_discount: model.discount ?? 1,
      p_sort_order: model.sort_order ?? 0,
      p_max_concurrent: model.max_concurrent ?? 0,
      p_model_type: model.model_type || 'chat',
      p_fixed_credits_per_call: model.fixed_credits_per_call ?? 0,
      p_video_operation: model.video_operation || null,
      p_multimodal: model.multimodal !== false,
      p_context_length: model.context_length || null
    });
    if (error) {
      console.error('Toggle AI model error:', error);
      alert(error.message || i18n.t('admin.aiModelSaveFailed'));
      loadAIModels();
      return;
    }
    model.enabled = enabled;
  } catch (error) {
    console.error('Toggle AI model error:', error);
    loadAIModels();
  }
}

// 切换模型类型：image / video 显示按次固定费率，隐藏 token 速率；video 额外显示视频操作/状态查询接口
function onAIModelTypeChange() {
  const type = document.getElementById('aiModelType').value;
  const isGen = type === 'image' || type === 'video';
  document.getElementById('aiModelFixedRateGroup').style.display = isGen ? '' : 'none';
  document.getElementById('aiModelTokenRateGroup').style.display = isGen ? 'none' : 'grid';
  document.getElementById('aiModelVideoOperationGroup').style.display = type === 'video' ? '' : 'none';
  document.getElementById('aiModelVideoStatusGroup').style.display = type === 'video' ? '' : 'none';
}

function openAIModelModal(modelId) {
  const form = document.getElementById('aiModelForm');
  form.reset();
  document.getElementById('aiModelId').value = '';
  document.getElementById('aiModelBackend').value = 'openai';
  document.getElementById('aiModelTemperature').value = '0.7';
  document.getElementById('aiModelSortOrder').value = '0';
  document.getElementById('aiModelRateInput').value = '0';
  document.getElementById('aiModelRateOutput').value = '0';
  document.getElementById('aiModelRateCached').value = '0';
  document.getElementById('aiModelDiscount').value = '1';
  document.getElementById('aiModelMaxConcurrent').value = '5';
  document.getElementById('aiModelContextLength').value = '';
  document.getElementById('aiModelType').value = 'chat';
  document.getElementById('aiModelFixedRate').value = '0';
  document.getElementById('aiModelVideoOperation').value = '';
  document.getElementById('aiModelVideoStatusOperation').value = '';
  onAIModelTypeChange();
  document.getElementById('aiModelEnabled').checked = true;
  document.getElementById('aiModelMultimodal').checked = true;
  document.getElementById('aiModelPreset').value = '';
  document.getElementById('aiModelDiscoveryKey').value = '';
  const modelPick = document.getElementById('aiModelPick');
  modelPick.classList.add('hidden');
  modelPick.innerHTML = '';
  document.getElementById('aiModelError').classList.add('hidden');
  document.getElementById('aiModelModalTitle').textContent = i18n.t('admin.aiModalTitleAddModel');

  if (modelId) {
    const model = aiModelsCache.find(m => m.id === modelId);
    if (model) {
      document.getElementById('aiModelModalTitle').textContent = i18n.t('admin.aiModalTitleEditModel');
      document.getElementById('aiModelId').value = model.id;
      document.getElementById('aiModelName').value = model.name || '';
      document.getElementById('aiModelBackend').value = model.backend || 'openai';
      document.getElementById('aiModelBaseUrl').value = model.base_url || '';
      document.getElementById('aiModelModel').value = model.model || '';
      document.getElementById('aiModelTemperature').value = model.temperature ?? 0.7;
      document.getElementById('aiModelSortOrder').value = model.sort_order ?? 0;
      document.getElementById('aiModelRateInput').value = model.rate_input_tokens ?? 0;
      document.getElementById('aiModelRateOutput').value = model.rate_output_tokens ?? 0;
      document.getElementById('aiModelRateCached').value = model.rate_cached_tokens ?? 0;
      document.getElementById('aiModelDiscount').value = model.discount ?? 1;
      document.getElementById('aiModelMaxConcurrent').value = model.max_concurrent ?? 5;
      document.getElementById('aiModelContextLength').value = model.context_length ?? '';
      document.getElementById('aiModelType').value = model.model_type || 'chat';
      document.getElementById('aiModelFixedRate').value = model.fixed_credits_per_call ?? 0;
      document.getElementById('aiModelVideoOperation').value = model.video_operation || '';
      document.getElementById('aiModelVideoStatusOperation').value = model.video_status_operation || '';
      onAIModelTypeChange();
      document.getElementById('aiModelEnabled').checked = !!model.enabled;
      document.getElementById('aiModelMultimodal').checked = model.multimodal !== false;
    }
  }

  const modal = document.getElementById('aiModelModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeAIModelModal() {
  const modal = document.getElementById('aiModelModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

// 常见上游预设：选中后自动填充后端与上游地址
const AI_MODEL_PRESETS = {
  openai:      { backend: 'openai', baseUrl: 'https://api.openai.com/v1' },
  deepseek:    { backend: 'openai', baseUrl: 'https://api.deepseek.com/v1' },
  dashscope:   { backend: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  zhipu:       { backend: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  moonshot:    { backend: 'openai', baseUrl: 'https://api.moonshot.cn/v1' },
  ark:         { backend: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  siliconflow: { backend: 'openai', baseUrl: 'https://api.siliconflow.cn/v1' },
  openrouter:  { backend: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  ollama:      { backend: 'ollama', baseUrl: 'http://localhost:11434/v1' },
};

function applyAIModelPreset() {
  const preset = AI_MODEL_PRESETS[document.getElementById('aiModelPreset').value];
  if (!preset) return;
  document.getElementById('aiModelBackend').value = preset.backend;
  document.getElementById('aiModelBaseUrl').value = preset.baseUrl;
  // 切换预设后清空模型，便于重新获取
  document.getElementById('aiModelModel').value = '';
  const pick = document.getElementById('aiModelPick');
  pick.classList.add('hidden');
  pick.innerHTML = '';
}

// 固定参考定价表（每百万 token，USD，input/output[/cached]）。仅作参考，选中模型后自动折算填入，可手动调整。
// 第三元 cached（缓存命中输入价）仅对官方公布了缓存价的模型给出；未给出的模型按输入价的
// DEFAULT_CACHED_INPUT_RATIO 折算参考。匹配按 key 子串（长度越长越优先，避免 gpt-4o-mini 误命中 gpt-4o、glm-4.5-air 误命中 glm-4）。
// 覆盖 OpenAI / Anthropic / Google / DeepSeek / GLM / Qwen / Kimi / Doubao / ERNIE / 混元 / MiniMax 等主流模型。
const AI_MODEL_REF_RATES_USD = {
  // ---- OpenAI ----
  'gpt-5.6': [2.50, 15.00, 0.25],
  'gpt-5.5': [5.00, 30.00, 0.50],
  'gpt-5.4-mini': [0.75, 4.50, 0.075],
  'gpt-5.4-nano': [0.20, 1.25, 0.02],
  'gpt-5.4': [2.50, 15.00, 0.25],
  'gpt-4o-mini': [0.15, 0.60, 0.075],
  'gpt-4o': [2.50, 10.00, 1.25],
  'gpt-4.1-nano': [0.10, 0.40, 0.025],
  'gpt-4.1-mini': [0.40, 1.60, 0.10],
  'gpt-4.1': [2.00, 8.00, 0.50],
  'gpt-4-turbo': [10.00, 30.00],
  'gpt-4': [30.00, 60.00],
  'o4-mini': [1.10, 4.40],
  'o3': [2.00, 8.00],
  'o1': [15.00, 60.00],
  // ---- Anthropic ----
  'claude-opus': [5.00, 25.00],
  'claude-sonnet': [3.00, 15.00],
  'claude-3-5-haiku': [0.80, 4.00],
  'claude-3-7-sonnet': [3.00, 15.00],
  'claude-haiku': [1.00, 5.00],
  // ---- Google Gemini ----
  'gemini-2.5-pro': [1.25, 10.00],
  'gemini-2.5-flash': [0.30, 2.50],
  'gemini-2-flash': [0.10, 0.40],
  'gemini-1.5-pro': [1.25, 5.00],
  'gemini-1.5-flash': [0.075, 0.30],
  'gemini-3': [2.50, 15.00],
  // ---- DeepSeek ----
  'deepseek-v4-flash-vision-exp': [0.44, 1.33, 0.015],
  'deepseek-v4-flash': [0.44, 1.33, 0.015],
  'deepseek-v4-pro': [1.33, 4.00, 0.044],
  'deepseek-v3.2': [0.30, 1.19, 0.074],
  'deepseek-v3.1': [0.16, 0.71, 0.044],
  'deepseek-r1': [0.55, 2.19, 0.40],
  'deepseek-reasoner': [0.55, 2.19, 0.40],
  'deepseek-chat': [0.28, 1.10, 0.07],
  // ---- GLM (智谱) ----
  'glm-5.2': [1.19, 4.15, 0.30],
  'glm-5.1': [0.89, 3.56, 0.19],
  'glm-5-turbo': [0.74, 3.26],
  'glm-5': [0.59, 2.67],
  'glm-4.7-flashx': [0.07, 0.40],
  'glm-4.7-flash': [0, 0],
  'glm-4.7': [0.30, 1.19, 0.059],
  'glm-4.6': [0.43, 1.75],
  'glm-4.5-airx': [0.15, 0.59],
  'glm-4.5-air': [0.20, 1.10],
  'glm-4.5-flash': [0, 0],
  'glm-4.5': [0.30, 1.19],
  'glm-4-plus': [0.74, 0.74],
  'glm-4-airx': [0.15, 0.44],
  'glm-4-air': [0.07, 0.07],
  'glm-4-flash': [0, 0],
  'glm-4-long': [0.15, 0.29],
  'glm-4': [0.11, 0.28],
  'glm-z1': [0.07, 0.44],
  'glm-4v': [0.15, 0.44],
  // ---- Qwen (通义千问) ----
  'qwen3.8-max': [1.78, 5.34],
  'qwen3.7-max': [1.78, 5.34],
  'qwen3.7-plus': [0.36, 1.42],
  'qwen3.5-flash': [0.03, 0.30],
  'qwen3.5-plus': [0.12, 0.71],
  'qwen3-coder': [5.00, 20.00],
  'qwen3-max': [0.60, 2.00],
  'qwq-plus': [0.60, 2.00],
  'qwen-max': [0.60, 2.00],
  'qwen-plus': [0.12, 0.69],
  'qwen-turbo': [0.05, 0.40],
  // ---- Kimi (月之暗面 Moonshot) ----
  'kimi-k2.7': [1.00, 5.00, 0.20],
  'kimi-k2.6': [0.96, 4.00, 0.16],
  'kimi-k2.5': [0.60, 2.50, 0.10],
  'kimi-k2': [0.60, 2.50],
  'moonshot-v1': [1.00, 0.90],
  // ---- 其他国产模型 ----
  'doubao-seed-2.1': [0.89, 4.45],
  'doubao-1.6': [0.12, 1.19],
  'doubao-1.5-pro': [0.12, 0.30],
  'doubao': [0.12, 0.30],
  'ernie-5.1': [0.59, 2.67],
  'ernie-4.5-turbo': [0.12, 0.47],
  'ernie': [0.24, 0.95],
  'hunyuan-turbos': [0.12, 0.30],
  'hunyuan-t1': [0.15, 0.59],
  'hunyuan': [0.12, 0.30],
  'minimax-m3': [0.30, 1.20],
  'minimax': [0.05, 0.10],
  'mimo-v2': [0.15, 0.30],
  'step-3.7': [0.20, 1.20],
  'step': [0.15, 0.59],
  // ---- 万能兜底（子串最短，仅命中裸名/未知变体） ----
  'glm': [0.30, 1.19],
  'deepseek': [0.28, 1.10],
  'qwen': [0.50, 2.00],
  'kimi': [0.60, 2.50],
  'gpt': [2.50, 15.00],
  'claude': [3.00, 15.00],
  'gemini': [1.25, 10.00],
};

// 参考上下文窗口（tokens，仅作参考）：与定价表同 key，选中模型后自动填入「最大上下文」，可手动调整。
// 取自各厂商公开的上下文窗口上限；未收录/无法命中时保持为空，不强行猜测。
const AI_MODEL_REF_CONTEXT = {
  // ---- OpenAI ----
  'gpt-5.6': 400000, 'gpt-5.5': 400000, 'gpt-5.4-mini': 400000, 'gpt-5.4-nano': 400000, 'gpt-5.4': 400000,
  'gpt-4o-mini': 128000, 'gpt-4o': 128000,
  'gpt-4.1-nano': 1000000, 'gpt-4.1-mini': 1000000, 'gpt-4.1': 1000000,
  'gpt-4-turbo': 128000, 'gpt-4': 32768,
  'o4-mini': 200000, 'o3': 200000, 'o1': 200000,
  // ---- Anthropic ----
  'claude-opus': 200000, 'claude-sonnet': 200000, 'claude-3-5-haiku': 200000, 'claude-3-7-sonnet': 200000, 'claude-haiku': 200000,
  // ---- Google Gemini ----
  'gemini-2.5-pro': 1000000, 'gemini-2.5-flash': 1000000, 'gemini-2-flash': 1000000, 'gemini-1.5-pro': 2000000, 'gemini-1.5-flash': 1000000, 'gemini-3': 1000000,
  // ---- DeepSeek ----
  'deepseek-v4-flash-vision-exp': 128000, 'deepseek-v4-flash': 128000, 'deepseek-v4-pro': 128000, 'deepseek-v3.2': 128000, 'deepseek-v3.1': 128000,
  'deepseek-r1': 64000, 'deepseek-reasoner': 64000, 'deepseek-chat': 128000,
  // ---- GLM (智谱) ----
  'glm-5.2': 128000, 'glm-5.1': 128000, 'glm-5-turbo': 128000, 'glm-5': 128000,
  'glm-4.7-flashx': 128000, 'glm-4.7-flash': 128000, 'glm-4.7': 128000, 'glm-4.6': 128000,
  'glm-4.5-airx': 128000, 'glm-4.5-air': 128000, 'glm-4.5-flash': 128000, 'glm-4.5': 128000,
  'glm-4-plus': 128000, 'glm-4-airx': 128000, 'glm-4-air': 128000, 'glm-4-flash': 128000, 'glm-4-long': 1000000, 'glm-4': 128000,
  'glm-z1': 128000, 'glm-4v': 128000,
  // ---- Qwen (通义千问) ----
  'qwen3.8-max': 131072, 'qwen3.7-max': 131072, 'qwen3.7-plus': 131072, 'qwen3.5-flash': 131072, 'qwen3.5-plus': 131072,
  'qwen3-coder': 131072, 'qwen3-max': 131072, 'qwq-plus': 131072, 'qwen-max': 131072, 'qwen-plus': 131072, 'qwen-turbo': 131072,
  // ---- Kimi (月之暗面 Moonshot) ----
  'kimi-k2.7': 131072, 'kimi-k2.6': 131072, 'kimi-k2.5': 131072, 'kimi-k2': 131072, 'moonshot-v1': 131072,
  // ---- 其他国产模型 ----
  'doubao-seed-2.1': 128000, 'doubao-1.6': 128000, 'doubao-1.5-pro': 128000, 'doubao': 128000,
  'ernie-5.1': 128000, 'ernie-4.5-turbo': 128000, 'ernie': 128000,
  'hunyuan-turbos': 128000, 'hunyuan-t1': 128000, 'hunyuan': 128000,
  'minimax-m3': 128000, 'minimax': 128000,
  'mimo-v2': 128000, 'step-3.7': 128000, 'step': 128000,
  // ---- 万能兜底（子串最短，仅命中裸名/未知变体） ----
  'glm': 128000, 'deepseek': 128000, 'qwen': 131072, 'kimi': 131072, 'gpt': 128000, 'claude': 200000, 'gemini': 1000000,
};

const AI_RATE_USD_CNY = 7.2;     // 美元→人民币汇率（可调）
const AI_RATE_CREDITS_PER_CNY = 100; // 100 credits = 1 元人民币

// USD/每百万token → credits/每百万token，整十位取整
function usdToCreditsRate(usd) {
  if (!usd || usd <= 0) return 0;
  return Math.round((usd * AI_RATE_USD_CNY * AI_RATE_CREDITS_PER_CNY) / 10) * 10;
}

// 折扣系数合法化：0 < discount <= 1，非法值回落为 1（不打折）
function clampDiscount(d) {
  const v = Number(d);
  if (!isFinite(v) || v <= 0 || v > 1) return 1;
  return v;
}

function lookupModelRefRateUsd(modelId) {
  if (!modelId) return null;
  // 大小写不敏感匹配：模型 ID 常为大写（如 DeepSeek-V4-Pro），而定价表 key 为全小写
  const id = String(modelId).toLowerCase();
  const keys = Object.keys(AI_MODEL_REF_RATES_USD).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (id.indexOf(k) !== -1) return AI_MODEL_REF_RATES_USD[k];
  }
  return null;
}

// 按模型 ID 命中参考上下文窗口（tokens）；匹配规则与定价表一致（大小写不敏感、子串、长 key 优先）
function lookupModelRefContext(modelId) {
  if (!modelId) return null;
  const id = String(modelId).toLowerCase();
  const keys = Object.keys(AI_MODEL_REF_CONTEXT).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (id.indexOf(k) !== -1) return AI_MODEL_REF_CONTEXT[k];
  }
  return null;
}

// 选中/输入模型后自动折算参考价填入输入/输出/缓存命中三档速率；仍可手动调整
const DEFAULT_CACHED_INPUT_RATIO = 0.1; // 未公布官方缓存价时，缓存命中输入价参考 = 输入价 × 10%

function fillModelRates(modelId) {
  if (!modelId) return;
  const ref = lookupModelRefRateUsd(modelId);
  if (!ref) return;
  const inputRate = usdToCreditsRate(ref[0]);
  const outputRate = usdToCreditsRate(ref[1]);
  // 缓存命中：有官方缓存价用官方值；否则按输入价 10% 折算参考
  const cachedUsd = ref.length >= 3 ? ref[2] : ref[0] * DEFAULT_CACHED_INPUT_RATIO;
  const cachedRate = ref.length >= 3 ? usdToCreditsRate(cachedUsd) : Math.round((cachedUsd * AI_RATE_USD_CNY * AI_RATE_CREDITS_PER_CNY) / 10) * 10;

  const inputEl = document.getElementById('aiModelRateInput');
  const outputEl = document.getElementById('aiModelRateOutput');
  const cachedEl = document.getElementById('aiModelRateCached');
  if (inputEl && outputEl) {
    inputEl.value = inputRate;
    outputEl.value = outputRate;
  }
  if (cachedEl) cachedEl.value = cachedRate;

  // 参考上下文窗口：命中则一并填入「最大上下文」；未收录时保持原值，不强行覆盖
  const ctx = lookupModelRefContext(modelId);
  if (ctx) {
    const ctxEl = document.getElementById('aiModelContextLength');
    if (ctxEl) ctxEl.value = ctx;
  }
}

// 通过 ai-gateway 调上游 /models 接口拉取模型列表（优先用弹窗里的临时 Key，否则用该模型已保存的 Key）
async function fetchAIModelList() {
  const errorEl = document.getElementById('aiModelError');
  const btn = document.getElementById('aiModelFetchBtn');
  errorEl.classList.add('hidden');

  const baseUrl = document.getElementById('aiModelBaseUrl').value.trim();
  if (!baseUrl) {
    errorEl.textContent = i18n.t('admin.aiBaseUrlRequired');
    errorEl.classList.remove('hidden');
    return;
  }

  const apiKey = document.getElementById('aiModelDiscoveryKey').value.trim();
  const modelId = document.getElementById('aiModelId').value || null;

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = i18n.t('admin.aiFetchModelsLoading');
  try {
    const resp = await aiEdgeAdminRequest('POST', '/list-models', { baseUrl, apiKey, modelId });
    if (!resp || !Array.isArray(resp.models)) {
      errorEl.textContent = (resp && resp.error) || i18n.t('admin.aiFetchModelsFailed');
      errorEl.classList.remove('hidden');
      return;
    }
    const pick = document.getElementById('aiModelPick');
    pick.innerHTML = resp.models.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
    if (!resp.models.length) {
      pick.classList.add('hidden');
      errorEl.textContent = i18n.t('admin.aiFetchModelsEmpty');
      errorEl.classList.remove('hidden');
      return;
    }
    pick.classList.remove('hidden');
    document.getElementById('aiModelModel').value = resp.models[0];
    fillModelRates(resp.models[0]);
  } catch (error) {
    console.error('Fetch AI models error:', error);
    errorEl.textContent = error.message || i18n.t('admin.aiFetchModelsFailed');
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function saveAIModel(e) {
  e.preventDefault();
  const errorEl = document.getElementById('aiModelError');
  errorEl.classList.add('hidden');

  const name = document.getElementById('aiModelName').value.trim();
  if (!name) {
    errorEl.textContent = i18n.t('admin.aiModelNameRequired');
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const isNew = !document.getElementById('aiModelId').value;
    const modelType = document.getElementById('aiModelType').value;
    const { data, error } = await appSupabase.client.rpc('ai_admin_save_model', {
      p_id: document.getElementById('aiModelId').value || null,
      p_name: name,
      p_backend: document.getElementById('aiModelBackend').value,
      p_base_url: document.getElementById('aiModelBaseUrl').value.trim(),
      p_model: document.getElementById('aiModelModel').value.trim(),
      p_temperature: parseFloat(document.getElementById('aiModelTemperature').value) || 0.7,
      p_enabled: document.getElementById('aiModelEnabled').checked,
      p_rate_input: parseFloat(document.getElementById('aiModelRateInput').value) || 0,
      p_rate_output: parseFloat(document.getElementById('aiModelRateOutput').value) || 0,
      p_rate_cached: parseFloat(document.getElementById('aiModelRateCached').value) || 0,
      p_discount: clampDiscount(parseFloat(document.getElementById('aiModelDiscount').value)),
      p_sort_order: parseInt(document.getElementById('aiModelSortOrder').value, 10) || 0,
      p_max_concurrent: Math.max(0, parseInt(document.getElementById('aiModelMaxConcurrent').value, 10) || 0),
      p_model_type: ['image', 'video'].includes(modelType) ? modelType : 'chat',
      p_fixed_credits_per_call: Math.max(0, parseFloat(document.getElementById('aiModelFixedRate').value) || 0),
      p_context_length: (() => {
        const v = parseInt(document.getElementById('aiModelContextLength').value, 10);
        return Number.isFinite(v) && v > 0 ? v : null;
      })(),
      p_video_operation: modelType === 'video'
        ? (document.getElementById('aiModelVideoOperation').value.trim() || null)
        : null,
      p_video_status_operation: modelType === 'video'
        ? (document.getElementById('aiModelVideoStatusOperation').value.trim() || null)
        : null,
      p_multimodal: document.getElementById('aiModelMultimodal').checked !== false
    });

    if (error) {
      console.error('Save AI model error:', error);
      errorEl.textContent = error.message || i18n.t('admin.aiModelSaveFailed');
      errorEl.classList.remove('hidden');
      return;
    }

    // 首次创建且填写了临时 discovery Key 时，自动注册为该模型的第一个 API Key
    const modelId = data && data.id;
    const discoveryKey = document.getElementById('aiModelDiscoveryKey').value.trim();
    if (isNew && modelId && discoveryKey) {
      const keyResp = await aiEdgeKeyRequest('POST', '', {
        modelId,
        keyName: i18n.t('admin.aiTempKeyName'),
        enabled: true,
        plaintextKey: discoveryKey
      });
      if (!keyResp || keyResp.success !== true) {
        console.error('Save temp AI key error:', keyResp);
        alert((keyResp && keyResp.error) || i18n.t('admin.aiKeySaveFailed'));
        return;
      }
    }

    closeAIModelModal();
    loadAIModels();
    alert(i18n.t('admin.aiModelSaveSuccess'));
  } catch (error) {
    console.error('Save AI model error:', error);
    errorEl.textContent = error.message || i18n.t('admin.aiModelSaveFailed');
    errorEl.classList.remove('hidden');
  }
}

// 复制模型：复制模型信息及其 API Key（服务端直接复制 Key 密文，不复制用量统计）
async function copyAIModel(modelId) {
  try {
    const { data, error } = await appSupabase.client.rpc('ai_admin_copy_model', { p_id: modelId });
    if (error) {
      console.error('Copy AI model error:', error);
      alert(error.message || i18n.t('admin.aiCopyFailed'));
      return;
    }
    if (!data || data.success !== true || !data.id) {
      alert((data && data.message) || i18n.t('admin.aiCopyFailed'));
      return;
    }
    loadAIModels();
    alert(i18n.t('admin.aiCopySuccess'));
  } catch (error) {
    console.error('Copy AI model error:', error);
    alert(error.message || i18n.t('admin.aiCopyFailed'));
  }
}

async function deleteAIModel(modelId) {
  if (!confirm(i18n.t('admin.aiModelDeleteConfirm'))) return;

  try {
    const { error } = await appSupabase.client.rpc('ai_admin_delete_model', { p_id: modelId });
    if (error) {
      console.error('Delete AI model error:', error);
      alert(error.message || i18n.t('admin.aiModelDeleteFailed'));
      return;
    }
    loadAIModels();
    alert(i18n.t('admin.aiModelDeleteSuccess'));
  } catch (error) {
    console.error('Delete AI model error:', error);
    alert(i18n.t('admin.aiModelDeleteFailed'));
  }
}

// 保存全局计费配置（如 1x 标准单位价 base_rate）
async function saveAIConfig(key) {
  try {
    const value = (document.getElementById('aiBaseRateInput') || {}).value || '';
    const { error } = await appSupabase.client.rpc('ai_admin_set_app_config', { p_key: key, p_value: String(value).trim() });
    if (error) {
      console.error('Save AI config error:', error);
      alert(error.message || i18n.t('common.error'));
      return;
    }
    alert(i18n.t('admin.aiBillingSaved'));
  } catch (error) {
    console.error('Save AI config error:', error);
    alert(i18n.t('common.networkError') + (error && error.message ? ': ' + error.message : ''));
  }
}

// ---------- 每个模型的 Key 管理 ----------

async function loadAIKeys(modelId) {
  aiCurrentKeyModelId = modelId;
  const list = document.getElementById('aiKeysList');
  showLoading(list);

  try {
    const { data, error } = await appSupabase.client.rpc('ai_admin_list_keys', { p_model_id: modelId });
    if (error) {
      console.error('Load AI keys error:', error);
      showErrorState(list, i18n.t('common.error'));
      return;
    }

    aiKeysCache = data || [];
    if (!aiKeysCache.length) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${i18n.t('admin.aiNoKeys')}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = aiKeysCache.map(k => `
      <div class="code-card" style="align-items: flex-start;">
        <div class="code-info">
          <div class="code-details">
            <h4>${escapeHtml(k.key_name)} <span class="ai-status-badge ${k.enabled ? 'on' : 'off'}">${k.enabled ? i18n.t('admin.aiEnabled') : i18n.t('admin.aiDisabled')}</span></h4>
            <p>${i18n.t('admin.aiKeyAlias')}: ${escapeHtml(k.key_alias || '-')}</p>
            ${k.base_url ? `<p>${i18n.t('admin.aiKeyBaseUrl')}: ${escapeHtml(k.base_url)}</p>` : ''}
            <p>${i18n.t('admin.aiQuotaCredits')}: ${k.quota_credits == null ? i18n.t('admin.aiUnlimited') : k.quota_credits} · ${i18n.t('admin.aiCost')}: ${k.total_cost_credits ?? 0}</p>
            <p>${i18n.t('admin.aiLastUsed')}: ${k.last_used_at ? aiDateTime(k.last_used_at) : i18n.t('admin.aiNeverUsed')}</p>
          </div>
        </div>
        <div class="code-actions">
          <button class="action-btn edit" onclick="openAIKeyModal('${k.id}')">${i18n.t('admin.aiEdit')}</button>
          <button class="action-btn delete" onclick="deleteAIKey('${k.id}')">${i18n.t('admin.aiDelete')}</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load AI keys error:', error);
    showErrorState(list, i18n.t('common.networkError'));
  }
}

function openAIKeysModal(modelId) {
  const model = aiModelsCache.find(m => m.id === modelId);
  document.getElementById('aiKeysModalTitle').textContent = (model ? model.name + ' · ' : '') + i18n.t('admin.aiKeysTitle');
  cancelAIKeyForm();
  const probeResults = document.getElementById('aiProbeResults');
  const probeSummary = document.getElementById('aiProbeSummary');
  if (probeResults) { probeResults.classList.add('hidden'); probeResults.innerHTML = ''; }
  if (probeSummary) probeSummary.textContent = '';
  const modal = document.getElementById('aiKeysModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
  loadAIKeys(modelId);
}

function closeAIKeysModal() {
  const modal = document.getElementById('aiKeysModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

function showAIKeyForm(show) {
  const form = document.getElementById('aiKeyForm');
  const addBtn = document.getElementById('aiAddKeyBtn');
  if (show) {
    form.classList.remove('hidden');
    form.style.display = 'flex';
    addBtn.classList.add('hidden');
  } else {
    form.classList.add('hidden');
    form.style.display = '';
    addBtn.classList.remove('hidden');
  }
}

function openAIKeyModal(keyId) {
  const errorEl = document.getElementById('aiKeyError');
  errorEl.classList.add('hidden');
  document.getElementById('aiKeyId').value = '';
  document.getElementById('aiKeyName').value = '';
  document.getElementById('aiKeyBaseUrl').value = '';
  document.getElementById('aiKeyPlain').value = '';
  document.getElementById('aiKeyQuota').value = '';
  document.getElementById('aiKeyEnabled').checked = true;

  if (keyId) {
    const key = aiKeysCache.find(k => k.id === keyId);
    if (key) {
      document.getElementById('aiKeyId').value = key.id;
      document.getElementById('aiKeyName').value = key.key_name || '';
      document.getElementById('aiKeyBaseUrl').value = key.base_url || '';
      document.getElementById('aiKeyQuota').value = key.quota_credits == null ? '' : key.quota_credits;
      document.getElementById('aiKeyEnabled').checked = !!key.enabled;
    }
  }
  showAIKeyForm(true);
}

function cancelAIKeyForm() {
  showAIKeyForm(false);
}

async function saveAIKey(e) {
  e.preventDefault();
  const errorEl = document.getElementById('aiKeyError');
  errorEl.classList.add('hidden');

  const keyId = document.getElementById('aiKeyId').value || undefined;
  const keyName = document.getElementById('aiKeyName').value.trim();
  const baseUrl = document.getElementById('aiKeyBaseUrl').value.trim();
  const plaintextKey = document.getElementById('aiKeyPlain').value.trim();
  const quotaVal = document.getElementById('aiKeyQuota').value.trim();
  const enabled = document.getElementById('aiKeyEnabled').checked;

  if (!keyName) {
    errorEl.textContent = i18n.t('admin.aiKeyNameRequired');
    errorEl.classList.remove('hidden');
    return;
  }
  if (!keyId && !plaintextKey) {
    errorEl.textContent = i18n.t('admin.aiKeyPlainRequired');
    errorEl.classList.remove('hidden');
    return;
  }

  const payload = { modelId: aiCurrentKeyModelId, keyName, enabled };
  if (keyId) payload.keyId = keyId;
  if (plaintextKey) payload.plaintextKey = plaintextKey;
  if (quotaVal !== '') payload.quotaCredits = parseFloat(quotaVal);
  if (baseUrl) payload.baseUrl = baseUrl;

  try {
    const resp = await aiEdgeKeyRequest('POST', '', payload);
    if (!resp || !resp.success) {
      console.error('Save AI key error:', resp);
      errorEl.textContent = (resp && resp.error) || i18n.t('admin.aiKeySaveFailed');
      errorEl.classList.remove('hidden');
      return;
    }
    cancelAIKeyForm();
    loadAIKeys(aiCurrentKeyModelId);
    alert(i18n.t('admin.aiKeySaveSuccess'));
  } catch (error) {
    console.error('Save AI key error:', error);
    errorEl.textContent = i18n.t('admin.aiKeySaveFailed');
    errorEl.classList.remove('hidden');
  }
}

async function deleteAIKey(keyId) {
  if (!confirm(i18n.t('admin.aiKeyDeleteConfirm'))) return;

  try {
    const resp = await aiEdgeKeyRequest('DELETE', '?id=' + encodeURIComponent(keyId), null);
    if (!resp || !resp.success) {
      console.error('Delete AI key error:', resp);
      alert((resp && resp.error) || i18n.t('admin.aiKeyDeleteFailed'));
      return;
    }
    loadAIKeys(aiCurrentKeyModelId);
    alert(i18n.t('admin.aiKeyDeleteSuccess'));
  } catch (error) {
    console.error('Delete AI key error:', error);
    alert(i18n.t('admin.aiKeyDeleteFailed'));
  }
}

// ---------- 探测全部 Key 状态 ----------

// 一键探测模型下所有 Key 的可用状态与额度（每次实时探测，不做缓存）
async function probeAIKeys() {
  const btn = document.getElementById('aiProbeKeysBtn');
  const resultsEl = document.getElementById('aiProbeResults');
  const summaryEl = document.getElementById('aiProbeSummary');
  if (!btn || !resultsEl || btn.disabled || !aiCurrentKeyModelId) return;

  if (!aiKeysCache.length) {
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = `<div class="empty-state">${i18n.t('admin.aiProbeNoKeys')}</div>`;
    return;
  }

  const labelSpan = btn.querySelector('span');
  btn.disabled = true;
  if (labelSpan) labelSpan.textContent = i18n.t('admin.aiProbing');
  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = `<div class="loading-state">${i18n.t('admin.aiProbing')}…</div>`;
  if (summaryEl) summaryEl.textContent = '';

  try {
    const resp = await aiEdgeAdminRequest('POST', '/probe-keys', { modelId: aiCurrentKeyModelId });
    if (!resp || !resp.success) {
      resultsEl.innerHTML = `<div class="error-message">${escapeHtml((resp && resp.error) || i18n.t('admin.aiProbeFailed'))}</div>`;
      return;
    }
    renderProbeResults(resp.keys || []);
  } catch (error) {
    console.error('Probe AI keys error:', error);
    resultsEl.innerHTML = `<div class="error-message">${i18n.t('admin.aiProbeFailed')}</div>`;
  } finally {
    btn.disabled = false;
    if (labelSpan) labelSpan.textContent = i18n.t('admin.aiProbeKeys');
  }
}

const AI_PROBE_HEALTH = {
  ok:            { cls: 'on',  label: 'admin.aiProbeHealthOk' },
  invalid:       { cls: 'off', label: 'admin.aiProbeHealthInvalid' },
  rate_limited:  { cls: 'off', label: 'admin.aiProbeHealthRateLimited' },
  upstream_error:{ cls: 'off', label: 'admin.aiProbeHealthUpstreamError' },
  error:         { cls: 'off', label: 'admin.aiProbeHealthError' },
};

function renderProbeResults(keys) {
  const resultsEl = document.getElementById('aiProbeResults');
  const summaryEl = document.getElementById('aiProbeSummary');
  if (!resultsEl) return;

  let okCount = 0;
  const rows = keys.map(k => {
    const h = AI_PROBE_HEALTH[k.health] || AI_PROBE_HEALTH.error;
    if (k.health === 'ok') okCount++;
    const healthBadge = `<span class="ai-status-badge ${h.cls}">${i18n.t(h.label)}</span>`;
    const httpTag = k.httpStatus ? `<span class="ai-probe-tag">HTTP ${k.httpStatus}</span>` : '';
    const enabledTag = !k.enabled ? `<span class="ai-probe-tag ai-probe-tag-disabled">${i18n.t('admin.aiKeyEnabledOff')}</span>` : '';

    let quotaLine = '';
    if (k.quotaCredits != null) {
      const remaining = Math.max(0, k.quotaCredits - (k.totalCostCredits || 0));
      quotaLine = `<div class="ai-probe-sub">${i18n.t('admin.aiProbeQuota')}: ${k.quotaCredits} · ${i18n.t('admin.aiProbeCost')}: ${k.totalCostCredits || 0} · ${i18n.t('admin.aiProbeRemaining')}: ${remaining}</div>`;
    }

    let balanceLine = '';
    if (k.health === 'ok' && k.enabled) {
      if (k.balance != null) {
        balanceLine = `<div class="ai-probe-sub">${i18n.t('admin.aiProbeBalance')}: <strong>${k.balance}${k.balanceUnit || ''}</strong>${k.balanceProvider ? ` <span class="ai-probe-tag">${escapeHtml(k.balanceProvider)}</span>` : ''}${k.balanceNote ? ` <span class="ai-probe-muted">(${escapeHtml(k.balanceNote)})</span>` : ''}</div>`;
      } else if (k.balanceProvider) {
        balanceLine = `<div class="ai-probe-sub">${i18n.t('admin.aiProbeBalance')}: <span class="ai-probe-muted">${i18n.t('admin.aiProbeBalanceFailed')}</span></div>`;
      } else {
        balanceLine = `<div class="ai-probe-sub">${i18n.t('admin.aiProbeBalance')}: <span class="ai-probe-muted">${i18n.t('admin.aiProbeBalanceNone')}</span></div>`;
      }
    }

    const noteLine = k.error && k.health !== 'ok'
      ? `<div class="ai-probe-sub ai-probe-error">${escapeHtml(k.error)}</div>`
      : '';

    return `
      <div class="ai-probe-row">
        <div class="ai-probe-head">
          <strong>${escapeHtml(k.keyName)}</strong>
          ${enabledTag}
          ${healthBadge}
          ${httpTag}
        </div>
        ${k.baseUrl ? `<div class="ai-probe-sub ai-probe-muted">${escapeHtml(k.baseUrl)}</div>` : ''}
        ${quotaLine}
        ${balanceLine}
        ${noteLine}
      </div>
    `;
  }).join('');

  resultsEl.innerHTML = rows || `<div class="empty-state">${i18n.t('admin.aiProbeNoKeys')}</div>`;
  if (summaryEl) summaryEl.textContent = i18n.t('admin.aiProbeSummary').replace('{total}', keys.length).replace('{ok}', okCount);
}

// ---------- 用户额度 ----------

async function loadAICredits(search) {
  const list = document.getElementById('aiCreditsList');
  showLoading(list);

  try {
    const params = {};
    if (search) params.p_search = search;
    const { data, error } = await appSupabase.client.rpc('ai_admin_list_credits', params);
    if (error) {
      console.error('Load AI credits error:', error);
      showErrorState(list, i18n.t('common.error'));
      return;
    }

    aiCreditsCache = data || [];
    if (!aiCreditsCache.length) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${i18n.t('admin.aiNoCreditsUsers')}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = aiCreditsCache.map(u => `
      <div class="user-card">
        <div class="user-info">
          <div class="user-icon">${u.username ? u.username.charAt(0).toUpperCase() : 'U'}</div>
          <div class="user-details">
            <h4>${escapeHtml(u.username || u.email)}</h4>
            <p>${escapeHtml(u.email || '-')}</p>
            <p>${i18n.t('admin.aiBalance')}: <strong>${u.balance ?? 0}</strong> · ${i18n.t('admin.aiTotalGranted')}: ${u.total_granted ?? 0} · ${i18n.t('admin.aiTotalSpent')}: ${u.total_spent ?? 0}</p>
          </div>
        </div>
        <div class="user-actions">
          <button class="action-btn primary" onclick="openAIRechargeModal('${u.user_id}')">${i18n.t('admin.aiRecharge')}</button>
          <button class="action-btn edit" onclick="openAILedgerModal('${u.user_id}')">${i18n.t('admin.aiLedger')}</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load AI credits error:', error);
    showErrorState(list, i18n.t('common.networkError'));
  }
}

function openAIRechargeModal(userId) {
  const user = aiCreditsCache.find(u => u.user_id === userId);
  if (!user) return;
  document.getElementById('aiRechargeUserId').value = user.user_id;
  document.getElementById('aiRechargeUserLabel').textContent = (user.username || user.email) + ' · ' + i18n.t('admin.aiBalance') + ': ' + (user.balance ?? 0);
  document.getElementById('aiRechargeAmount').value = '';
  document.getElementById('aiRechargeRemark').value = '';
  document.getElementById('aiRechargeExpires').value = '';
  document.getElementById('aiRechargeError').classList.add('hidden');
  const modal = document.getElementById('aiRechargeModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
}

function closeAIRechargeModal() {
  const modal = document.getElementById('aiRechargeModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function saveAIRecharge(e) {
  e.preventDefault();
  const errorEl = document.getElementById('aiRechargeError');
  errorEl.classList.add('hidden');

  const userId = document.getElementById('aiRechargeUserId').value;
  const amount = parseFloat(document.getElementById('aiRechargeAmount').value);
  if (!userId || isNaN(amount) || amount === 0) {
    errorEl.textContent = i18n.t('admin.aiRechargeInvalid');
    errorEl.classList.remove('hidden');
    return;
  }

  const remark = document.getElementById('aiRechargeRemark').value.trim();
  const expiresVal = document.getElementById('aiRechargeExpires').value;
  const expiresAt = expiresVal ? new Date(expiresVal + 'T23:59:59').toISOString() : null;

  try {
    const { error } = await appSupabase.client.rpc('ai_admin_recharge', {
      p_user_id: userId,
      p_amount: amount,
      p_remark: remark || null,
      p_expires_at: expiresAt
    });
    if (error) {
      console.error('AI recharge error:', error);
      errorEl.textContent = error.message || i18n.t('admin.aiRechargeFailed');
      errorEl.classList.remove('hidden');
      return;
    }
    closeAIRechargeModal();
    loadAICredits(document.getElementById('aiCreditsSearch').value.trim());
    alert(i18n.t('admin.aiRechargeSuccess'));
  } catch (error) {
    console.error('AI recharge error:', error);
    errorEl.textContent = error.message || i18n.t('admin.aiRechargeFailed');
    errorEl.classList.remove('hidden');
  }
}

// ---------- 额度明细（条目式账本） ----------

function openAILedgerModal(userId) {
  const modal = document.getElementById('aiLedgerModal');
  modal.classList.remove('hidden');
  modal.classList.add('active');
  loadAILedger(userId);
}

function closeAILedgerModal() {
  const modal = document.getElementById('aiLedgerModal');
  modal.classList.remove('active');
  setTimeout(() => modal.classList.add('hidden'), 200);
}

async function loadAILedger(userId) {
  const list = document.getElementById('aiLedgerList');
  showLoading(list);

  try {
    const { data, error } = await appSupabase.client.rpc('ai_admin_list_credits_ledger', { p_user_id: userId });
    if (error) {
      console.error('Load AI ledger error:', error);
      showErrorState(list, i18n.t('common.error'));
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      list.innerHTML = `
        <div class="empty-state">
          <p>${i18n.t('admin.aiLedgerEmpty')}</p>
        </div>
      `;
      return;
    }

    const fmtTime = (ts) => new Date(ts).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US');
    list.innerHTML = rows.map(l => {
      const isGrant = l.type === 'grant';
      const expiresText = l.expires_at
        ? new Date(l.expires_at).toLocaleDateString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')
        : i18n.t('admin.aiPermanent');
      return `
        <div class="user-card">
          <div class="user-info">
            <div class="user-details" style="width: 100%;">
              <h4 style="display: flex; align-items: center; gap: 8px;">
                <span class="ai-status-badge ${isGrant ? 'on' : 'off'}">${isGrant ? i18n.t('admin.aiLedgerGrant') : i18n.t('admin.aiLedgerConsume')}</span>
                <span style="font-weight: 600; color: ${isGrant ? 'var(--success-color)' : 'var(--error-color)'};">${isGrant ? '+' : '-'}${escapeHtml(String(l.amount))}</span>
              </h4>
              <p>${i18n.t('admin.aiLedgerCreated')}: ${fmtTime(l.created_at)}${isGrant ? ' · ' + i18n.t('admin.aiLedgerRemaining') + ': ' + l.remaining : ''} · ${i18n.t('admin.aiLedgerExpires')}: ${escapeHtml(expiresText)}</p>
              <p>${i18n.t('admin.aiLedgerRemark')}: ${escapeHtml(l.remark || '-')}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Load AI ledger error:', error);
    showErrorState(list, i18n.t('common.networkError'));
  }
}

// ---------- 用量统计 ----------

async function loadAIUsage(days) {
  aiUsageDays = days;
  document.querySelectorAll('.ai-days-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.days, 10) === days);
  });
  const content = document.getElementById('aiUsageContent');
  showLoading(content);

  try {
    const { data, error } = await appSupabase.client.rpc('ai_admin_usage_stats', { p_days: days });
    if (error) {
      console.error('Load AI usage error:', error);
      showErrorState(content, i18n.t('common.error'));
      return;
    }
    if (!data) {
      content.innerHTML = `<div class="empty-state"><p>${i18n.t('admin.aiNoStats')}</p></div>`;
      return;
    }

    const cards = [
      { label: i18n.t('admin.aiStatCost'), value: aiFormatNumber(data.total_cost) },
      { label: i18n.t('admin.aiStatRequests'), value: aiFormatNumber(data.total_requests) },
      { label: i18n.t('admin.aiStatSuccess'), value: aiFormatNumber(data.success_requests) },
      { label: i18n.t('admin.aiStatFailed'), value: aiFormatNumber(data.failed_requests) },
      { label: i18n.t('admin.aiStatInputHit'), value: aiFormatNumber(data.total_cached_tokens) },
      { label: i18n.t('admin.aiStatInputMiss'), value: aiFormatNumber(Math.max(0, (data.total_input_tokens || 0) - (data.total_cached_tokens || 0))) },
      { label: i18n.t('admin.aiStatOutputTokens'), value: aiFormatNumber(data.total_output_tokens) }
    ];

    const perModel = data.per_model || [];
    content.innerHTML = `
      <div class="ai-stat-grid">
        ${cards.map(c => `
          <div class="ai-stat-card">
            <div class="ai-stat-label">${c.label}</div>
            <div class="ai-stat-value">${c.value}</div>
          </div>
        `).join('')}
      </div>
      <h3 class="ai-stat-title">${i18n.t('admin.aiStatPerModel')}</h3>
      ${perModel.length ? `
        <table class="detail-table">
          <thead>
            <tr>
              <th>${i18n.t('admin.aiStatModelName')}</th>
              <th>${i18n.t('admin.aiStatModelRequests')}</th>
              <th>${i18n.t('admin.aiStatModelHit')}</th>
              <th>${i18n.t('admin.aiStatModelMiss')}</th>
              <th>${i18n.t('admin.aiStatModelOutput')}</th>
              <th>${i18n.t('admin.aiStatModelCost')}</th>
            </tr>
          </thead>
          <tbody>
            ${perModel.map(pm => `
              <tr>
                <td>${escapeHtml(pm.model_name || '-')}</td>
                <td>${aiFormatNumber(pm.requests)}</td>
                <td>${aiFormatNumber(pm.cached_tokens)}</td>
                <td>${aiFormatNumber(Math.max(0, (pm.input_tokens || 0) - (pm.cached_tokens || 0)))}</td>
                <td>${aiFormatNumber(pm.output_tokens)}</td>
                <td>${aiFormatNumber(pm.credits_cost)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<p class="form-hint">${i18n.t('admin.aiNoStats')}</p>`}
    `;
  } catch (error) {
    console.error('Load AI usage error:', error);
    showErrorState(content, i18n.t('common.networkError'));
  }
}