const profileUsername = document.getElementById('profileUsername');
const profileEmail = document.getElementById('profileEmail');
const profileAvatarUrl = document.getElementById('profileAvatarUrl');
const profileBio = document.getElementById('profileBio');
const proStatus = document.getElementById('proStatus');
const saveProfileBtn = document.getElementById('saveProfileBtn');

const activationCode = document.getElementById('activationCode');
const redeemCodeBtn = document.getElementById('redeemCodeBtn');
const activationResult = document.getElementById('activationResult');

function showPage(pageName) {
  document.querySelectorAll('.subpage').forEach(page => {
    page.classList.add('hidden');
  });
  
  const targetPage = document.getElementById(pageName + 'Page');
  if (targetPage) {
    targetPage.classList.remove('hidden');
    if (pageName === 'messages') loadMessages();
  }
}

// ========== 系统消息 ==========

const messagesList = document.getElementById('messagesList');
const markAllMessagesReadBtn = document.getElementById('markAllMessagesReadBtn');

async function loadMessages() {
  if (!messagesList) return;
  const { data: messages, error } = await appSupabase.client.rpc('user_list_system_messages', { p_limit: 100, p_offset: 0 });
  if (error) {
    messagesList.innerHTML = `<p style="padding:16px;color:#dc2626">${escapeHtml(error.message || i18n.t('common.error'))}</p>`;
    return;
  }
  const rows = (messages && messages.items) || [];
  if (rows.length === 0) {
    messagesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <i data-lucide="message-square"></i>
        </div>
        <p>${i18n.t('admin.messagesEmpty') || '暂无系统消息'}</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }
  messagesList.innerHTML = rows.map(m => {
    const unreadDot = m.is_read ? '' : '<span class="messages-unread-dot"></span>';
    const typeLabel = m.type === 'extension_review'
      ? (i18n.t('admin.messagesTypeExtensionReview') || '扩展审核')
      : (i18n.t('admin.messagesTypeSystem') || '系统');
    return `
      <div class="code-card ${m.is_read ? '' : 'message-unread'}" id="msg-${m.id}" onclick="markMessageRead('${m.id}')" style="cursor:pointer;">
        <div class="code-info">
          <div class="code-code">${unreadDot}<span class="tag-chip">${escapeHtml(typeLabel)}</span> ${escapeHtml(m.title)}</div>
          <div class="code-details">
            <p>${escapeHtml(m.content || '')}</p>
            <p style="color:#a1a1aa;font-size:12px;">${new Date(m.created_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function markMessageRead(id) {
  const { error } = await appSupabase.client.rpc('user_mark_system_messages_read', { p_ids: [id] });
  const card = document.getElementById('msg-' + id);
  if (card) {
    card.classList.add('message-read');
    card.classList.remove('message-unread');
    const dot = card.querySelector('.messages-unread-dot');
    if (dot) dot.remove();
  }
  if (error) console.error('Mark message read error:', error);
  else refreshMessagesBadge();
}

async function markAllMessagesRead() {
  const { error } = await appSupabase.client.rpc('user_mark_all_system_messages_read');
  if (error) {
    console.error('Mark all messages read error:', error);
    return;
  }
  loadMessages();
  refreshMessagesBadge();
}

async function refreshMessagesBadge() {
  const badge = document.getElementById('sidebarMessagesBadge');
  if (!badge) return;
  const { data, error } = await appSupabase.client.rpc('user_list_system_messages', { p_limit: 1, p_offset: 0 });
  if (error || !data) return;
  const unread = data.unread || 0;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

window.markMessageRead = markMessageRead;

const devicesList = document.getElementById('devicesList');
const addDeviceBtn = document.getElementById('addDeviceBtn');
const addDeviceBtnEmpty = document.getElementById('addDeviceBtnEmpty');
const addDeviceModal = document.getElementById('addDeviceModal');
const closeDeviceModal = document.getElementById('closeDeviceModal');
const deviceBackdrop = document.getElementById('deviceBackdrop');
const addDeviceForm = document.getElementById('addDeviceForm');
const deviceName = document.getElementById('deviceName');
const deviceOs = document.getElementById('deviceOs');
const deviceId = document.getElementById('deviceId');
const deviceError = document.getElementById('deviceError');

const cloudSpacesList = document.getElementById('cloudSpacesList');
const cloudSpacesEmpty = document.getElementById('cloudSpacesEmpty');
const addCloudBtn = document.getElementById('addCloudBtn');
const cloudSyncSelectedInfo = document.getElementById('cloudSyncSelectedInfo');
const cloudSyncSelectedName = document.getElementById('cloudSyncSelectedName');
const cloudSyncSelectedProvider = document.getElementById('cloudSyncSelectedProvider');
const cloudSyncNoSpaceSelected = document.getElementById('cloudSyncNoSpaceSelected');
const cloudSyncEditSpaceBtn = document.getElementById('cloudSyncEditSpaceBtn');
const cloudSyncDeleteSpaceBtn = document.getElementById('cloudSyncDeleteSpaceBtn');

const cloudSpaceConfigModal = document.getElementById('cloudSpaceConfigModal');
const closeCloudSpaceConfigModal = document.getElementById('closeCloudSpaceConfigModal');
const cloudSpaceConfigOverlay = document.getElementById('cloudSpaceConfigOverlay');
const cloudSpaceConfigForm = document.getElementById('cloudSpaceConfigForm');
const cloudSpaceConfigId = document.getElementById('cloudSpaceConfigId');
const cloudSpaceConfigTitle = document.getElementById('cloudSpaceConfigTitle');
const cloudSpaceConfigName = document.getElementById('cloudSpaceConfigName');
const cloudSpaceConfigUrlPreset = document.getElementById('cloudSpaceConfigUrlPreset');
const cloudSpaceConfigUrl = document.getElementById('cloudSpaceConfigUrl');
const cloudSpaceConfigUsername = document.getElementById('cloudSpaceConfigUsername');
const cloudSpaceConfigPassword = document.getElementById('cloudSpaceConfigPassword');
const cloudSpaceConfigError = document.getElementById('cloudSpaceConfigError');
const cancelCloudSpaceConfigBtn = document.getElementById('cancelCloudSpaceConfigBtn');

let currentSelectedSpace = null;

function showLoading(container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <i data-lucide="loader-2" class="animate-spin"></i>
      </div>
      <p>${i18n.t('common.loading')}</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function showErrorState(container, message) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <i data-lucide="x-circle"></i>
      </div>
      <p>${message}</p>
      <button class="btn btn-secondary" onclick="loadDashboard()">${i18n.t('common.error')}</button>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

async function getCurrentUser() {
  const initialized = await appSupabase.ensureInitialized();
  if (!initialized) return null;
  
  const { data } = await appSupabase.client.auth.getSession();
  return data.session?.user || null;
}

async function loadProfile() {
  const user = await getCurrentUser();
  if (!user) return;

  try {
    const { data: profile, error } = await appSupabase.client
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Load profile error:', error);
      return;
    }

    profileUsername.value = profile.username || '';
    profileEmail.value = profile.email || user.email || '';
    profileAvatarUrl.value = profile.avatar_url || '';
    profileBio.value = profile.bio || '';

    const profileAvatarEl = document.getElementById('profileAvatar');
    if (profileAvatarEl) {
      const fallback = (profile.username || profile.email || user.email || 'U').charAt(0).toUpperCase();
      applyAvatar(profileAvatarEl, profile.avatar_url || '', fallback);
    }

    const { data: proStatusData, error: proError } = await appSupabase.client.rpc('check_pro_status');
    if (!proError && proStatusData) {
      if (proStatusData.is_pro) {
        const expires = new Date(proStatusData.pro_expires_at);
        proStatus.innerHTML = `<span class="status-label">${i18n.t('profile.proStatus')}</span> <span style="margin-left:8px;color:#a1a1aa;font-size:12px">${i18n.t('profile.statusExpires')}${expires.toLocaleDateString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</span>`;
        proStatus.classList.remove('expired');
      } else {
        proStatus.innerHTML = `<span class="status-label">${i18n.t('profile.normalStatus')}</span>`;
        proStatus.classList.add('expired');
      }
    }
  } catch (error) {
    console.error('Load profile error:', error);
  }
}

async function saveProfile() {
  const user = await getCurrentUser();
  if (!user) return;

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = i18n.t('common.saving');

  try {
    const { data: ok, error } = await appSupabase.client.rpc('update_profile_self', {
      new_username: profileUsername.value.trim(),
      new_bio: profileBio.value.trim(),
      new_avatar_url: profileAvatarUrl.value.trim()
    });

    if (error) {
      console.error('Save profile error:', error);
      alert(i18n.t('common.saveFailed') + error.message);
      return;
    }

    if (!ok) {
      alert(i18n.t('common.saveFailed'));
      return;
    }

    alert(i18n.t('common.saveSuccess'));

    // 保存后即时刷新资料预览与顶部昵称/头像
    await loadProfile();
    window.updateUserMenu && window.updateUserMenu(user);
  } catch (error) {
    console.error('Save profile error:', error);
    alert(i18n.t('common.saveFailed') + error.message);
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = i18n.t('profile.save');
  }
}

async function loadDevices() {
  const user = await getCurrentUser();
  if (!user) {
    showErrorState(devicesList, i18n.t('common.loginFirst'));
    return;
  }

  showLoading(devicesList);

  try {
    const { data: devices, error } = await appSupabase.client
      .from('user_devices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Load devices error:', error);
      showErrorState(devicesList, i18n.t('devices.loadFailed'));
      return;
    }

    if (!devices || devices.length === 0) {
      devicesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <i data-lucide="laptop"></i>
          </div>
          <p>${i18n.t('devices.empty')}</p>
          <p style="font-size:12px;color:#666;">${i18n.t('devices.emptyHint')}</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    devicesList.innerHTML = devices.map(device => {
      const osType = device.os_type === 'win32' ? 'Windows' : 
                     device.os_type === 'darwin' ? 'macOS' : 
                     device.os_type === 'linux' ? 'Linux' : 
                     device.os_type || i18n.t('devices.unknownOS');
      const platform = device.platform === 'x64' ? '64-bit' : (device.platform ? device.platform + '-bit' : '');
      const details = [];
      if (osType) details.push(osType);
      if (device.os_version) details.push(device.os_version);
      if (platform) details.push(platform);
      
      return `
      <div class="device-card">
        <div class="device-info">
          <div class="device-icon">
            <i data-lucide="laptop"></i>
          </div>
          <div class="device-details">
            <h4>${device.device_name}</h4>
            <p>${details.join(' | ')} · ${new Date(device.created_at).toLocaleDateString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</p>
          </div>
        </div>
        <div class="device-actions">
          <button class="action-btn delete" onclick="deleteDevice('${device.id}')">${i18n.t('common.delete')}</button>
        </div>
      </div>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();
  } catch (error) {
    console.error('Load devices error:', error);
    showErrorState(devicesList, i18n.t('common.networkError'));
  }
}

async function addDevice(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  if (!user) return;

  try {
    const { error } = await appSupabase.client
      .from('user_devices')
      .insert({
        user_id: user.id,
        device_name: deviceName.value.trim(),
        device_id: deviceId.value.trim(),
        os_type: deviceOs.value,
        created_at: new Date().toISOString(),
        last_active_at: new Date().toISOString()
      });

    if (error) {
      deviceError.textContent = error.message;
      deviceError.classList.remove('hidden');
      return;
    }

    closeDeviceModalFunc();
    addDeviceForm.reset();
    loadDevices();
  } catch (error) {
    deviceError.textContent = error.message;
    deviceError.classList.remove('hidden');
  }
}

async function deleteDevice(deviceId) {
  if (!confirm(i18n.t('devices.deleteConfirm'))) return;

  try {
    const { error } = await appSupabase.client
      .from('user_devices')
      .delete()
      .eq('id', deviceId);

    if (error) {
      console.error('Delete device error:', error);
      alert(i18n.t('devices.deleteFailed'));
      return;
    }

    loadDevices();
  } catch (error) {
    console.error('Delete device error:', error);
  }
}

async function isProActive(userId) {
  const { data: profile, error } = await appSupabase.client
    .from('user_profiles')
    .select('pro_expires_at')
    .eq('id', userId)
    .single();
  
  if (error || !profile || !profile.pro_expires_at) {
    return false;
  }
  
  const expires = new Date(profile.pro_expires_at);
  return expires > new Date();
}

async function loadCloudSpaces() {
  const user = await getCurrentUser();
  if (!user) {
    cloudSpacesList.innerHTML = `<p>${i18n.t('common.loginFirst')}</p>`;
    return;
  }

  cloudSpacesList.innerHTML = `<div class="loading">${i18n.t('common.loading')}</div>`;

  try {
    const isPro = await isProActive(user.id);
    
    const { data: spaces, error } = await appSupabase.client
      .from('cloud_spaces')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Load cloud spaces error:', error);
      cloudSpacesList.innerHTML = `<p>${i18n.t('cloud.loadFailed')}</p>`;
      return;
    }

    updateAddCloudBtnState(isPro, spaces ? spaces.length : 0);

    if (!spaces || spaces.length === 0) {
      cloudSpacesList.innerHTML = '';
      cloudSpacesEmpty.classList.remove('hidden');
      cloudSyncSelectedInfo.style.display = 'none';
      cloudSyncNoSpaceSelected.style.display = 'block';
      currentSelectedSpace = null;
      return;
    }

    spaces.sort((a, b) => {
      if (!a.last_sync_at && !b.last_sync_at) return 0;
      if (!a.last_sync_at) return 1;
      if (!b.last_sync_at) return -1;
      return new Date(b.last_sync_at) - new Date(a.last_sync_at);
    });

    let processedSpaces = spaces;
    
    if (!isPro) {
      processedSpaces = spaces.map(space => ({
        ...space,
        locked: space.id !== spaces[0].id,
        canUse: space.id === spaces[0].id
      }));
    } else {
      processedSpaces = spaces.map(space => ({
        ...space,
        locked: false,
        canUse: true
      }));
    }

    cloudSpacesEmpty.classList.add('hidden');
    cloudSpacesList.innerHTML = processedSpaces.map(space => {
      const provider = getCloudProviderName(space.provider_config?.provider, space.url);
      const isSelected = currentSelectedSpace?.id === space.id;
      const isLocked = space.locked || false;
      
      return `
        <div class="cloud-space-item ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}" 
             onclick="selectCloudSpace('${space.id}', ${isLocked})">
          <div class="cloud-space-icon ${isLocked ? 'locked' : ''}">
            <i data-lucide="${isLocked ? 'lock' : 'cloud'}"></i>
          </div>
          <div class="cloud-space-info">
            <h4>${space.name}${isLocked ? ' <span class="locked-badge">' + i18n.t('cloud.locked') + '</span>' : ''}</h4>
            <p>${provider}</p>
            ${isLocked ? '<p class="locked-hint">' + i18n.t('cloud.lockedHint') + '</p>' : ''}
          </div>
          ${space.last_sync_at ? `<span class="cloud-space-last-sync">${i18n.t('cloud.lastSync')}${new Date(space.last_sync_at).toLocaleString(i18n.currentLang() === 'zh' ? 'zh-CN' : 'en-US')}</span>` : ''}
        </div>
      `;
    }).join('');
    if (window.lucide) lucide.createIcons();

    if (!currentSelectedSpace && processedSpaces.length > 0) {
      const availableSpace = processedSpaces.find(s => !s.locked) || processedSpaces[0];
      selectCloudSpace(availableSpace.id, availableSpace.locked);
    }
  } catch (error) {
    console.error('Load cloud spaces error:', error);
    cloudSpacesList.innerHTML = `<p>${i18n.t('common.networkError')}</p>`;
  }
}

function updateAddCloudBtnState(isPro, spaceCount) {
  if (isPro || spaceCount < 1) {
    addCloudBtn.disabled = false;
    addCloudBtn.classList.remove('disabled');
    addCloudBtn.title = '';
    addCloudBtn.textContent = i18n.t('cloud.addSpace');
  } else {
    addCloudBtn.disabled = true;
    addCloudBtn.classList.add('disabled');
    addCloudBtn.title = i18n.t('cloud.limitError');
    addCloudBtn.textContent = i18n.t('cloud.upgrade');
  }
}

function selectCloudSpace(spaceId, isLocked = false) {
  currentSelectedSpace = null;
  
  const items = cloudSpacesList.querySelectorAll('.cloud-space-item');
  items.forEach(item => item.classList.remove('selected'));
  
  const selectedItem = cloudSpacesList.querySelector(`.cloud-space-item[onclick*="${spaceId}"]`);
  if (selectedItem) {
    selectedItem.classList.add('selected');
  }

  if (isLocked) {
    cloudSyncSelectedInfo.style.display = 'none';
    cloudSyncNoSpaceSelected.innerHTML = '<p>' + i18n.t('cloud.lockedHint') + '</p>';
    cloudSyncNoSpaceSelected.style.display = 'block';
    return;
  }

  appSupabase.client
    .from('cloud_spaces')
    .select('*')
    .eq('id', spaceId)
    .single()
    .then(({ data: space, error }) => {
      if (error) {
        console.error('Get space error:', error);
        return;
      }
      currentSelectedSpace = space;
      cloudSyncSelectedName.textContent = space.name;
      cloudSyncSelectedProvider.textContent = space.provider_config?.provider || 'WebDAV';
      cloudSyncSelectedInfo.style.display = 'block';
      cloudSyncNoSpaceSelected.style.display = 'none';
    });
}

async function saveCloudSpaceConfig(e) {
  e.preventDefault();
  const user = await getCurrentUser();
  if (!user) return;

  const spaceId = cloudSpaceConfigId.value;
  const isEdit = !!spaceId;

  const providerConfig = {
    provider: getProviderFromUrl(cloudSpaceConfigUrl.value),
    url: cloudSpaceConfigUrl.value,
    username: cloudSpaceConfigUsername.value || null,
    password: cloudSpaceConfigPassword.value || null
  };

  try {
    if (!isEdit) {
      const isPro = await isProActive(user.id);
      const { data: spaces, error: spacesError } = await appSupabase.client
        .from('cloud_spaces')
        .select('id')
        .eq('user_id', user.id);
      
      if (spacesError) {
        cloudSpaceConfigError.textContent = i18n.t('cloud.checkLimitFailed');
        cloudSpaceConfigError.classList.remove('hidden');
        return;
      }

      if (!isPro && (spaces && spaces.length >= 1)) {
        cloudSpaceConfigError.textContent = i18n.t('cloud.limitError');
        cloudSpaceConfigError.classList.remove('hidden');
        return;
      }
    }

    if (isEdit) {
      const { error } = await appSupabase.client
        .from('cloud_spaces')
        .update({
          name: cloudSpaceConfigName.value.trim(),
          provider_config: providerConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', spaceId);

      if (error) {
        cloudSpaceConfigError.textContent = error.message;
        cloudSpaceConfigError.classList.remove('hidden');
        return;
      }
    } else {
      const { error } = await appSupabase.client
        .from('cloud_spaces')
        .insert({
          user_id: user.id,
          name: cloudSpaceConfigName.value.trim(),
          provider_config: providerConfig,
          sync_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        cloudSpaceConfigError.textContent = error.message;
        cloudSpaceConfigError.classList.remove('hidden');
        return;
      }
    }

    closeCloudSpaceConfigModalFunc();
    cloudSpaceConfigForm.reset();
    cloudSpaceConfigId.value = '';
    await loadCloudSpaces();
  } catch (error) {
    cloudSpaceConfigError.textContent = error.message;
    cloudSpaceConfigError.classList.remove('hidden');
  }
}

function getCloudProviderName(provider, url) {
  if (provider) return provider;
  if (!url) return 'WebDAV';
  if (url.includes('jianguoyun')) return i18n.t('cloud.providers.jianguoyun');
  if (url.includes('nextcloud')) return 'Nextcloud';
  if (url.includes('owncloud')) return 'OwnCloud';
  if (url.includes('hubic')) return 'Hubic';
  if (url.includes('yandex')) return 'Yandex Disk';
  return 'WebDAV';
}

async function deleteCloudSpace() {
  if (!currentSelectedSpace) return;
  if (!confirm(i18n.t('cloud.deleteConfirm').replace('{name}', currentSelectedSpace.name))) return;

  try {
    const { error } = await appSupabase.client
      .from('cloud_spaces')
      .delete()
      .eq('id', currentSelectedSpace.id);

    if (error) {
      console.error('Delete cloud space error:', error);
      alert(i18n.t('common.deleteFailed'));
      return;
    }

    currentSelectedSpace = null;
    await loadCloudSpaces();
  } catch (error) {
    console.error('Delete cloud space error:', error);
  }
}

function openCloudSpaceConfigModal(spaceId = null) {
  cloudSpaceConfigModal.classList.remove('hidden');
  cloudSpaceConfigModal.classList.add('active');
  cloudSpaceConfigError.classList.add('hidden');
  
  if (spaceId) {
    cloudSpaceConfigTitle.textContent = i18n.t('cloud.editConfig');
    appSupabase.client
      .from('cloud_spaces')
      .select('*')
      .eq('id', spaceId)
      .single()
      .then(({ data: space, error }) => {
        if (error) {
          console.error('Get space error:', error);
          return;
        }
        cloudSpaceConfigId.value = space.id;
        cloudSpaceConfigName.value = space.name;
        cloudSpaceConfigUrl.value = space.provider_config?.url || '';
        cloudSpaceConfigUsername.value = space.provider_config?.username || '';
        cloudSpaceConfigPassword.value = space.provider_config?.password || '';
      });
  } else {
    cloudSpaceConfigTitle.textContent = i18n.t('cloud.addSpace');
    cloudSpaceConfigId.value = '';
    cloudSpaceConfigForm.reset();
  }
}

function closeCloudSpaceConfigModalFunc() {
  cloudSpaceConfigModal.classList.remove('active');
  setTimeout(() => {
    cloudSpaceConfigModal.classList.add('hidden');
  }, 200);
  cloudSpaceConfigError.classList.add('hidden');
}

function openAddDeviceModal() {
  addDeviceModal.classList.remove('hidden');
}

function closeDeviceModalFunc() {
  addDeviceModal.classList.add('hidden');
  deviceError.classList.add('hidden');
}

function openAddCloudModal() {
  addCloudModal.classList.remove('hidden');
}

function closeCloudModalFunc() {
  addCloudModal.classList.add('hidden');
  cloudError.classList.add('hidden');
}

async function loadDashboard() {
  await loadProfile();
  await loadDevices();
  await loadCloudSpaces();
  refreshMessagesBadge();
}

async function redeemCode() {
  const code = activationCode.value.trim();
  if (!code) {
    showActivationResult(i18n.t('activation.error.empty'), 'error');
    return;
  }

  redeemCodeBtn.disabled = true;
  redeemCodeBtn.textContent = i18n.t('activation.processing');

  try {
    const { data, error } = await appSupabase.client.rpc('redeem_code', { code_input: code });

    if (error) {
      showActivationResult(error.message || i18n.t('activation.error.failed'), 'error');
      return;
    }

    if (data.success) {
      showActivationResult(data.message || i18n.t('activation.success'), 'success');
      activationCode.value = '';
      await loadProfile();
    } else {
      showActivationResult(data.message || i18n.t('activation.error.failed'), 'error');
    }
  } catch (error) {
    showActivationResult(error.message || i18n.t('common.networkError'), 'error');
  } finally {
    redeemCodeBtn.disabled = false;
    redeemCodeBtn.textContent = i18n.t('activation.redeem');
  }
}

function showActivationResult(message, type) {
  activationResult.textContent = message;
  activationResult.className = type === 'success' ? 'success-message' : 'error-message';
  activationResult.classList.remove('hidden');

  setTimeout(() => {
    activationResult.classList.add('hidden');
  }, 5000);
}

window.loadDashboard = loadDashboard;
window.deleteDevice = deleteDevice;
window.selectCloudSpace = selectCloudSpace;

document.addEventListener('languageChanged', () => {
  if (window.loadDashboard) {
    window.loadDashboard();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);

  if (closeDeviceModal) closeDeviceModal.addEventListener('click', closeDeviceModalFunc);
  if (deviceBackdrop) deviceBackdrop.addEventListener('click', closeDeviceModalFunc);
  if (addDeviceForm) addDeviceForm.addEventListener('submit', addDevice);

  if (addCloudBtn) addCloudBtn.addEventListener('click', () => openCloudSpaceConfigModal());
  if (closeCloudSpaceConfigModal) closeCloudSpaceConfigModal.addEventListener('click', closeCloudSpaceConfigModalFunc);
  if (cloudSpaceConfigOverlay) cloudSpaceConfigOverlay.addEventListener('click', closeCloudSpaceConfigModalFunc);
  if (cancelCloudSpaceConfigBtn) cancelCloudSpaceConfigBtn.addEventListener('click', closeCloudSpaceConfigModalFunc);
  if (cloudSpaceConfigForm) cloudSpaceConfigForm.addEventListener('submit', saveCloudSpaceConfig);

  if (cloudSpaceConfigUrlPreset) {
    cloudSpaceConfigUrlPreset.addEventListener('change', (e) => {
      if (e.target.value) {
        cloudSpaceConfigUrl.value = e.target.value;
      }
    });
  }

  if (cloudSyncEditSpaceBtn) {
    cloudSyncEditSpaceBtn.addEventListener('click', () => {
      if (currentSelectedSpace) {
        openCloudSpaceConfigModal(currentSelectedSpace.id);
      }
    });
  }

  if (cloudSyncDeleteSpaceBtn) cloudSyncDeleteSpaceBtn.addEventListener('click', deleteCloudSpace);

  if (redeemCodeBtn) redeemCodeBtn.addEventListener('click', redeemCode);

  if (markAllMessagesReadBtn) markAllMessagesReadBtn.addEventListener('click', markAllMessagesRead);

  const sidebarItems = document.querySelectorAll('.sidebar-item');
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const page = item.getAttribute('data-page');
      showPage(page);
    });
  });

  if (window.loadDashboard) {
    window.loadDashboard();
  }
});