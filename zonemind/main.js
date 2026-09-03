// myzone.ai-assistant / main.js
// 入口模块：主题、发送消息、事件绑定与初始化。

'use strict';

// ========== 主题 ==========
function applyTheme() {
  const apply = (theme) => {
    if (theme === 'light') document.documentElement.classList.add('light-theme');
    else document.documentElement.classList.remove('light-theme');
  };
  apply(window.myzone.theme.get());
  window.myzone.theme.onChange(apply);
}

// ========== 发送消息 ==========
async function onSend() {
  const text = inputEl().value.trim();
  if (state.busy) return;
  inputEl().value = '';
  autoGrow();
  await sendUserMessage(text);
}

// 把用户的文本作为新一轮生成发送（供「发送」与消息「重试」共用）
async function sendUserMessage(text) {
  const hasAtt = hasAttachments();
  if (!hasAtt && !String(text || '').trim()) return;
  if (state.busy) return;
  // 附图片时当前模型必须启用多模态；纯文本/代码文件附件无此限制
  if (hasImageAttachments() && !currentModelMultimodal()) {
    window.myzone.toast.warning(tSync('attachModelNotMultimodal'));
    clearAttachments();
    return;
  }
  const content = buildContent(text); // 无图=纯文本字符串；有图=OpenAI 多模态 content 数组
  const isEmpty = typeof content === 'string' ? !content.trim() : !content.length;
  if (isEmpty) return;
  if (!state.aiReady) {
    // 未登录但内置网关已配置：提示登录而非误导「尚未配置/去设置配置本地后端」
    if (state.aiNeedLogin) {
      window.myzone.toast.show(tSync('needLoginNoticeDesc'), 'info');
    } else {
      window.myzone.toast.warning(tSync('aiNotConfigured'));
    }
    checkAiStatus();
    return;
  }
  // 确保首条为 system 消息
  if (!state.history.length || state.history[0]?.role !== 'system') {
    state.history.unshift({ role: 'system', content: buildSystemPrompt() });
  }
  const userMsg = makeMsg('user', content);
  const userNode = addUserMessage(content, userMsg.uid);
  const userBubble = userNode && userNode.querySelector('.bubble');
  state.history.push(userMsg);
  clearAttachments(); // 图片已并入 content，发送后清空输入区预览
  renderTokenGauges(); // 实时刷新上下文用量（所见即所发）
  // 手动技能（豆包式底部技能栏）：直接调用生成模型，不走对话循环
  if (hasManualSkill()) {
    await runManualSkill(content);
    return;
  }
  // 开发者模式：发送即展示「将实际发送给模型」的请求详情，无需等整轮生成结束
  if (state.settings.devMode && userBubble) {
    attachRequestDetail(userBubble, buildDevSnapshot());
  }
  await processTurn();
}

// ========== 事件绑定 ==========
function bindEvents() {
  sendBtnEl().addEventListener('click', onSend);
  bindAttachEvents(); // 插图：粘贴截图 / 「插图」按钮选图
  $('stop-btn')?.addEventListener('click', onStop);
  inputEl().addEventListener('keydown', (e) => {
    // 斜杠技能菜单：输入 / 弹出、↑↓ 选择、Enter/Tab 确认、Esc/Backspace 关闭
    if (slashMenuOpen()) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        slashMove(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        slashPick();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        slashClose();
        return;
      }
      if (e.key === 'Backspace' && inputEl().value.replace(/^\s*\/\s*/, '') === '') {
        slashClose();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });
  inputEl().addEventListener('input', () => {
    autoGrow();
    slashFilter();
  });
  $('work-folder')?.addEventListener('click', chooseWorkFolder);

  // 侧边栏
  $('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  $('new-conv-btn')?.addEventListener('click', () => createConversation());
  $('credits-badge')?.addEventListener('click', openCreditsDetail);

  // 对话操作
  $('clear-btn')?.addEventListener('click', clearConversation);
  $('check-again-btn')?.addEventListener('click', checkAiStatus);
  $('conv-title')?.addEventListener('click', editConvTitle);

  // 设置面板
  $('settings-btn')?.addEventListener('click', openSettings);
  $('settings-close')?.addEventListener('click', closeSettings);
  $('settings-overlay')?.addEventListener('click', closeSettings);

  // 新建自定义智能体：创建占位并进入编辑
  $('new-agent-btn')?.addEventListener('click', () => {
    const agent = createCustomAgent({});
    _editAgentId = agent.id;
    renderSettingsPanel();
    window.myzone.toast.success(tSync('agentCreated'));
  });

  // 新建自定义技能
  $('new-skill-btn')?.addEventListener('click', () => {
    _editSkillId = '__new__';
    renderCustomSkillList();
  });

  // 模型选择器下拉
  $('model-selector')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.target.closest('#model-dropdown')) return;
    const dropdown = $('model-dropdown');
    if (dropdown && dropdown.classList.contains('visible')) {
      hideModelDropdown();
    } else {
      await showModelDropdown();
    }
  });

  // 底部技能栏（豆包式）：打开技能面板
  $('skill-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $('skill-dropdown');
    if (dd && dd.classList.contains('visible')) {
      dd.classList.remove('visible');
    } else if (dd) {
      renderSkillDropdown();
      dd.classList.add('visible');
    }
  });

  // 审批模式下拉
  $('approval-selector')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('#approval-dropdown')) return;
    toggleApprovalDropdown();
  });

  // Agent 下拉（输入区选择当前会话的 Agent）
  $('agent-selector')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('#agent-dropdown')) return;
    toggleAgentDropdown();
  });

  // 自动审批风险阈值（设置面板，变更即保存并回显）
  $('risk-threshold')?.addEventListener('change', (e) => {
    const v = Number(e.target.value);
    state.settings.riskThreshold = Number.isFinite(v) ? v : 70;
    window.myzone.storage.set('riskThreshold', state.settings.riskThreshold);
    const valEl = $('risk-threshold-value');
    if (valEl) valEl.textContent = tSync('riskThresholdValue').replace('{{value}}', String(state.settings.riskThreshold));
  });

  // 开发者模式开关（设置面板，即时保存）：用于在每次 AI 回复下查看实际发送给模型的消息
  $('dev-mode-toggle')?.addEventListener('change', (e) => {
    state.settings.devMode = !!e.target.checked;
    window.myzone.storage.set('devMode', state.settings.devMode);
  });

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    const md = $('model-dropdown');
    if (md && md.classList.contains('visible') &&
        !e.target.closest('#model-selector') && !e.target.closest('#model-dropdown')) {
      hideModelDropdown();
    }
    const ad = $('approval-dropdown');
    if (ad && ad.classList.contains('visible') &&
        !e.target.closest('#approval-selector') && !e.target.closest('#approval-dropdown')) {
      hideApprovalDropdown();
    }
    const gd = $('agent-dropdown');
    if (gd && gd.classList.contains('visible') &&
        !e.target.closest('#agent-selector') && !e.target.closest('#agent-dropdown')) {
      hideAgentDropdown();
    }
    // 技能面板：点击外部关闭
    const sd = $('skill-dropdown');
    if (sd && sd.classList.contains('visible') &&
        !e.target.closest('#skill-btn') && !e.target.closest('#skill-dropdown')) {
      sd.classList.remove('visible');
    }
    // 技能条模型菜单：点击外部关闭
    if (!e.target.closest('.skill-chip .sc-model')) closeSkillModelMenus();
  });

  // ESC 关闭设置面板
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = $('settings-panel');
      if (panel && panel.classList.contains('open')) closeSettings();
    }
  });

  // 窗口重新获得焦点时重新检查 AI 状态：本地密钥或内置模型任一可用即隐藏「尚未配置」。
  // 覆盖「启动时尚未登录/配置、后经账户页登录」导致提示陈旧的问题（以往仅 aiReady 才刷新模型，会漏掉该场景）。
  window.addEventListener('focus', () => {
    checkAiStatus();
  });
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  try {
    state.appLang = await window.myzone.i18n.getCurrentLanguage();
  } catch (e) {
    state.appLang = 'zh';
  }
  await preloadI18n();
  await loadSettings();
  await loadApprovalMode();
  // 先加载 skills/*/skill.md、agents/*/agent.md 到注册表，后续 buildSystemPrompt/loadSkills 才能用
  await loadSkillMds();
  await loadAgentMds();
  await loadSkills();
  // 合并其它扩展暴露的 MCP 工具（须在构建 system prompt 之前完成，且挂到技能开关列表）
  await syncMcpTools();
  renderSettingsPanel();
  await loadConversations();
  bindEvents();
  updateConvTitle();
  renderTokenGauges();
  contextTipInit();
  ctxCompressInit();
  await checkAiStatus();
  refreshModelMeta();
  inputEl().focus();
});
