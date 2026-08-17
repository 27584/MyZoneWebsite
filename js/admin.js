const usersList = document.getElementById('usersList');
const codesList = document.getElementById('codesList');
const addCodeBtn = document.getElementById('addCodeBtn');
const batchDeleteCodesBtn = document.getElementById('batchDeleteCodesBtn');
const addCodesForm = document.getElementById('addCodesForm');
const codeCount = document.getElementById('codeCount');
const codeDays = document.getElementById('codeDays');
const codeExpireDays = document.getElementById('codeExpireDays');
const codeMaxUses = document.getElementById('codeMaxUses');
const codesError = document.getElementById('codesError');
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

    codesList.innerHTML = codes.map(code => {
      const redeemedBy = code.redeemed_by || [];
      const redeemedHtml = redeemedBy.length > 0 ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color);">
          <p style="font-weight: bold; margin-bottom: 5px;">${i18n.t('codes.redeemedBy')}:</p>
          ${redeemedBy.map(r => `
            <p style="font-size: 12px; color: var(--text-secondary);">
              ${r.username} (${r.email}) · ${new Date(r.redeemed_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}
            </p>
          `).join('')}
        </div>
      ` : '';
      
      return `
      <div class="code-card" data-code-id="${code.code_id}">
        <input type="checkbox" class="code-checkbox" value="${code.code_id}" onchange="toggleCodeSelection(this)">
        <div class="code-info">
          <div class="code-code">${code.code}</div>
          <div class="code-details">
            <p>${i18n.t('codes.proCode')} · ${code.used_count >= code.max_uses ? '<span style="color:#ef4444">'+i18n.t('admin.used')+'</span>' : '<span style="color:#22c55e">'+i18n.t('admin.unused')+'</span>'} · ${code.is_active ? '' : '<span style="color:#f59e0b">'+i18n.t('admin.disabled')+'</span>'}</p>
            <p>${i18n.t('codes.expireAt')}: ${code.expires_at ? new Date(code.expires_at).toLocaleDateString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US') : i18n.t('admin.permanent')}</p>
            <p>${i18n.t('codes.duration')}: ${code.duration_days}${i18n.t('admin.days')}</p>
            <p>${i18n.t('codes.usage')}: ${code.used_count}/${code.max_uses}</p>
            ${redeemedHtml}
          </div>
        </div>
        <div class="code-actions">
          <button class="action-btn delete" onclick="deleteCode('${code.code_id}')">${i18n.t('admin.deleteCode')}</button>
        </div>
      </div>
    `;
    }).join('');
    updateBatchDeleteBtn();
  } catch (error) {
    console.error('Load codes error:', error);
    showErrorState(codesList, i18n.t('common.networkError'));
  }
}

async function addCodes(e) {
  e.preventDefault();

  try {
    const { error } = await appSupabase.client.rpc('admin_create_codes', {
      count: parseInt(codeCount.value),
      duration_days: parseInt(codeDays.value),
      expire_days: parseInt(codeExpireDays.value),
      max_uses: parseInt(codeMaxUses.value)
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
    selectedCodeIds.push(codeId);
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
}

function closeAddCodesModal() {
  const modal = document.getElementById('addCodesModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
  codesError.classList.add('hidden');
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
      } else if (item.dataset.page === 'crashReports') {
        loadCrashReports();
      }
    });
  });

  const refreshCrashReportsBtn = document.getElementById('refreshCrashReportsBtn');
  if (refreshCrashReportsBtn) refreshCrashReportsBtn.addEventListener('click', loadCrashReports);

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
  } else if (page === 'crashReports') {
    loadCrashReports();
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
          <div class="code-code">${iconHtml}${escapeHtml(ext.name)}${ext.name_en ? ' / ' + escapeHtml(ext.name_en) : ''}</div>
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
        p_tags: tags
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
        p_tags: tags
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
                  ${!v.is_latest ? `<button class="action-btn delete" onclick="deleteVersion('${v.id}')">${i18n.t('admin.delete') || '删除'}</button>` : '-'}
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
    `;

    document.getElementById('extensionDetailTitle').textContent = ext.name;
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
  }
});

// ========== 崩溃报告管理功能 ==========

let currentCrashReportId = null;

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
        <pre style="white-space: pre-wrap; word-break: break-all; background: var(--surface-light); padding: 12px; border-radius: 8px; font-size: 12px; margin: 0; max-height: 260px; overflow: auto;">${escapeHtml(d.log_content || (i18n.t('admin.crashLogEmpty') || '无日志内容'))}</pre>
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
  setTimeout(() => modal.classList.add('hidden'), 200);
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