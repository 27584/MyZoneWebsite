// ZoneMind 网页版：i18n.js
// 国际化：预加载全部文案到缓存，提供 t / tSync 同步读取。

'use strict';

const i18nCache = new Map();
const I18N_KEYS = [
  'title', 'tagline', 'inputPlaceholder', 'send', 'sending', 'stop',
  'attachImage', 'attachFile', 'attachRemove', 'attachModelNotMultimodal',
  'attachFromLocal', 'attachFromMyzone', 'attachReadFail', 'attachFail', 'attachFilterImages',
  'attachTextFile', 'attachFilterText', 'attachTooBig', 'attachTooMany', 'attachUnsupported',
  'clearConversation', 'clearConfirm', 'clearConfirmYes', 'clearConfirmNo',
  'statusConfigured', 'statusNotConfigured', 'statusTesting', 'statusBuiltin',
  'statusNeedLogin', 'needLoginNoticeTitle', 'needLoginNoticeDesc',
  'notConfiguredTitle', 'notConfiguredDesc', 'builtinNoModelsDesc', 'checkAgain',
  'workFolder', 'workFolderRoot', 'chooseFolder', 'folderChanged',
  'welcomeTitle', 'welcomeDesc',
  'exampleOrganize', 'exampleCleanup', 'exampleSummarize',
  'thinking', 'executingTools', 'thinkingProcess',
  'queueWaiting', 'queueProcessing',
  'toolGetTree', 'toolListFolder', 'toolResolvePath', 'toolStatItem',
  'toolReadFile', 'toolCreateFolder', 'toolCreateFile', 'toolRenameItem',
  'toolMoveItems', 'toolCopyItems', 'toolDeleteItems',
  'toolExecuted', 'toolFailed', 'toolDenied', 'toolPending',
  'toolConfirmTitle', 'toolConfirmAllow', 'toolConfirmDeny',
  'deleteWarning', 'permanentDeleteWarning', 'aiNotConfigured', 'aiCallFailed', 'chatError',
  'conversationCleared', 'operationDone', 'operationExecuted',
  'confirmNeeded', 'folders', 'files', 'itemCount',
  'truncatedNote', 'workFolderSet', 'recycleBinNote',
  'conversationList', 'newConversation', 'toggleSidebar',
  'settings', 'modelLabel', 'selectModel',
  'approvalLabel', 'approvalManual', 'approvalAuto', 'approvalFull', 'selectApproval',
  'approvalSection', 'approvalFullWarning',
  'riskThresholdLabel', 'riskThresholdValue', 'riskLevelLabel',
  'riskLow', 'riskMedium', 'riskHigh', 'riskCritical',
  'skillsSection', 'skillBadge', 'skillFilesystemName', 'skillFilesystemDesc',
  'toolBudget',
  'mcpSection', 'mcpMasterToggle', 'mcpMasterDesc', 'mcpUnavailable', 'mcpEmpty', 'mcpServerOffline', 'mcpFromExt',
  'agentLabel', 'agentChanged', 'selectAgent',
  'ctxTotalLabel', 'ctxRiskScore',
  'agentDefaultName', 'agentDefaultDesc', 'agentOrganizerName', 'agentOrganizerDesc',
  'agentsSection', 'newAgentBtn', 'agentBuiltin', 'agentCustom',
  'agentSelectHint', 'agentName', 'agentDesc', 'agentPrompt',
  'agentNameRequired', 'agentCreated', 'save', 'saved', 'edit', 'customAgentDefaultName',
  'deleteAgent', 'deleteAgentConfirm', 'agentDeleted',
  'customSkillsSection', 'customSkillsSectionHint', 'newSkillBtn', 'skillName',
  'skillPrompt', 'skillNameRequired', 'customSkillsEmpty', 'customSkillDefaultName',
  'deleteSkill', 'deleteSkillConfirm',
  'copyConversation', 'conversationCopied', 'deleteConversation',
  'deleteConversationConfirm', 'delete', 'yesterday', 'replyFinished',
  'settingsTitle', 'modelsSection', 'modelsManageHint', 'addModel',
  'modelNameLabel', 'modelNamePlaceholder',
  'modelProviderLabel', 'providerCustom', 'modelIdLabel',
  'modelApiKeyLabel', 'modelApiKeyPlaceholder',
  'modelBaseUrlLabel', 'cancel', 'confirm', 'deleteModel', 'editModel',
  'noModels', 'clickToAdd',
  'outsideWorkDir', 'outsideWorkDirWarning', 'readOnlyIndicator',
  'showThinking', 'hideThinking', 'tokenUsage', 'tokenUsageNoCache',
  'toolEditFile', 'toolSetWindowTitle', 'toolMemory',
  'toolNewContent', 'toolTarget', 'toolItemCount',
  'toolResultLines', 'toolResultLine', 'toolResultTruncated',
  'toolStatName', 'toolStatType', 'toolStatSize', 'toolStatCount', 'toolStatModified',
  'toolWrittenChars', 'folderType', 'fileType',
  'copyMessage', 'messageCopied', 'deleteMessage',
  'collapseDetails', 'expandDetails', 'editTitle',
  'contextUnused', 'contextTooltip', 'contextTooltipNoLimit', 'contextProbing', 'contextOverflow',
  'toolResultRead', 'resultReadNotFound', 'toolTruncated', 'toolLoopBreak', 'toolTabsLinks',
  'devSection', 'devModeLabel', 'devModeDesc', 'devReqTitle', 'devReqMeta', 'devReqEstUsed', 'devReqEstLimit', 'devReqTools',
  'quotaLabel', 'quotaProbing', 'quotaUnavailable', 'quotaAvailable', 'quotaUsedRemain',
  'creditsBalance', 'creditsCost', 'creditsInsufficient', 'builtinModels', 'builtinBadge', 'autoBadge',
  'creditsDetailTitle', 'creditsDetailEmpty', 'creditsDetailModel', 'creditsDetailTokens',
  'creditsDetailCost', 'creditsDetailTime', 'creditsDetailMore', 'creditsDetailCount',
  'creditsDetailFailed', 'creditsDetailInvalid', 'creditsDetailTokenFormat',
  'creditsUsageTitle', 'creditsAvailable', 'creditsGranted', 'creditsSpent',
  'creditsGrantsTitle', 'creditsGrantsEmpty', 'creditsRemarkDefault', 'creditsGrantUsed',
  'creditsValidUntil', 'creditsValidForever', 'creditsExpired', 'creditsExpiredGrants',
  'creditsRateIn', 'creditsRateOut', 'creditsRateCached',
  'creditsRateUnit', 'rateOriginal',
  'discountOff', 'discountBadgeTitle', 'discountConsume',
  'toolAskUser', 'askTitle', 'askOther', 'askOtherPlaceholder',
  'askNoteLabel', 'askNotePlaceholder', 'askConfirm', 'askCancel', 'askCancelled',
  'askNext', 'askPrev', 'askMultiHint', 'askMultiJoin', 'askRepeatNotAllowed',
  'skillCoreName', 'skillCoreDesc', 'skillMcpName', 'skillMcpDesc',
  'toolSuccess', 'toolNoResult', 'searchShown', 'toolHttpStatus', 'toolClipContent', 'toolClipReadFail',
  'toolScriptResult', 'toolRunJs', 'toolRunJsSandbox', 'toolThink',
  'toolHistorySearch', 'toolHistoryRemove', 'toolHistoryClear',
  'toolFavSearch', 'toolFavCreate', 'toolFavRemove',
  'toolDlSearch', 'toolDlPause', 'toolDlCancel',
  'toolFetchUrl', 'toolWebSearch', 'toolClipRead', 'toolClipWrite',
  'toolTabsQuery', 'toolTabsCreate', 'toolTabsGet', 'toolTabsUpdate', 'toolTabsRemove',
  'toolTabsReload', 'toolTabsGoBack', 'toolTabsGoForward', 'toolTabsUrl', 'toolTabsContent', 'toolTabsTitle', 'toolTabsContentText',
  'toolServerGet', 'toolServerGetAll', 'toolServerKeys', 'toolServerSet', 'toolServerRemove',
  'skillSearchName', 'skillSearchDesc', 'skillNetworkName', 'skillNetworkDesc', 'skillSystemName', 'skillSystemDesc',
  'skillScriptName', 'skillScriptDesc',
  'skillBrowserName', 'skillBrowserDesc', 'skillCloudName', 'skillCloudDesc',
  'skillCookiesName', 'skillCookiesDesc', 'skillAccountName', 'skillAccountDesc',
  'skillNotificationsName', 'skillNotificationsDesc', 'skillArchiveName', 'skillArchiveDesc',
  'skillExternalName', 'skillExternalDesc',
  'skillGenerativeName', 'skillGenerativeDesc',
  'toolGenerateImage', 'toolGenerateVideo',
  'generatedImage', 'generatedVideo',
  'genNoImageModel', 'genNoVideoModel', 'genNoResult',
  'genStopped', 'genPollFailed', 'genVideoFailed', 'genVideoTimeout',
  // 底部技能栏（豆包式手动技能）
  'skillLabel', 'skillAdd',
  'manualImageGen', 'manualVideoGen', 'skillSelectModel',
  'skillNoImageModel', 'skillNoVideoModel', 'removeSkill',
  'manualImagePlaceholder', 'manualVideoPlaceholder', 'perCallCredits',
  'perImageCredits', 'perSecondCredits',
  'genParamSize', 'genParamRatio', 'genParamSeconds', 'genParamAspectRatio',
  'genImageWaiting', 'genVideoWaiting',
  'videoTaskSubmitted', 'imageTaskSubmitted',
  'manualSkillInjected', 'slashMenuEmpty',
  'toolCookiesList', 'toolCookiesGet', 'toolCookiesSet', 'toolCookiesRemove',
  'toolAccountInfo', 'toolAccountPro', 'toolAccountDevices', 'toolAccountSession',
  'toolNotify', 'toolArchiveDetect', 'toolArchiveList', 'toolArchiveExtract', 'toolArchiveCompress', 'toolArchiveFormat',
  'toolExtPickRead', 'toolExtSave', 'toolExtPickDir', 'toolExtList', 'toolExtStat',
  'toolExtExists', 'toolExtRead', 'toolExtWrite', 'toolExtAppend', 'toolExtMkdir',
  'toolExtCopy', 'toolExtMove', 'toolExtRemove',
  'skillCacheName', 'skillCacheDesc', 'skillTempName', 'skillTempDesc',
  'toolCacheList', 'toolCacheStat', 'toolCacheRead', 'toolCacheWrite', 'toolCacheMkdir',
  'toolCacheCopy', 'toolCacheMove', 'toolCacheRename', 'toolCacheDelete', 'toolCacheClear', 'toolCacheGetPath',
  'toolTempList', 'toolTempStat', 'toolTempRead', 'toolTempWrite', 'toolTempMkdir',
  'toolTempCopy', 'toolTempMove', 'toolTempRename', 'toolTempDelete', 'toolTempClear', 'toolTempGetPath',
  'toolDlStart', 'toolDlResume', 'toolDlRemove', 'toolDlClear', 'toolToast',
  // 会话状态标记 / 重试 / 失败详情 / 压缩提示 / 额度
  'convStatusStreaming', 'convStatusConfirming', 'convStatusAsking', 'convStatusCompleted', 'convStatusInterrupted',
  'retryMessage', 'noRetryTarget', 'errDetailTitle',
  'quotaUsed', 'contextCompressed',
  // 手动压缩
  'manualCompress', 'manualCompressBusy', 'ctxCompressing', 'ctxCompressNothing', 'ctxCompressedDone',
];

async function preloadI18n() {
  const tasks = I18N_KEYS.map(async (key) => {
    try {
      const val = await window.myzone.i18n.getMessage(key);
      if (val) i18nCache.set(key, val);
    } catch (e) { /* ignore */ }
  });
  await Promise.all(tasks);
}

async function t(key) {
  if (i18nCache.has(key)) return i18nCache.get(key);
  try {
    const val = await window.myzone.i18n.getMessage(key);
    i18nCache.set(key, val || key);
    return val || key;
  } catch (e) {
    return key;
  }
}

function tSync(key) {
  if (i18nCache.has(key)) return i18nCache.get(key);
  return key;
}

// 从 usage 对象提取「缓存命中 token 数」：优先网关归一化的 cached_prompt_tokens，兼容常见模型原始字段
function extractCachedTokens(usage) {
  if (!usage) return 0;
  const cand = [
    usage.cached_prompt_tokens,
    usage.cached_tokens,
    usage.prompt_cache_hit_tokens,
    (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens),
    (usage.prompt_details && usage.prompt_details.cached_tokens),
  ].find((v) => Number.isFinite(Number(v)) && Number(v) > 0);
  return cand != null ? Number(cand) : 0;
}

// 是否明确带有缓存命中计数（旧历史消息未记录该字段时无缓存信息）
function usageHasCachedInfo(usage) {
  if (!usage) return false;
  return usage.cached_prompt_tokens != null
    || usage.cached_tokens != null
    || usage.prompt_cache_hit_tokens != null
    || (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens != null)
    || (usage.prompt_details && usage.prompt_details.cached_tokens != null);
}

// 将 usage 对象格式化为可读文本（输入拆分为命中缓存/未命中 + 输出/合计），内置 AI 追加 credits 消耗
function formatUsageText(usage, creditsCost) {
  const cost = Number(creditsCost);
  const hasCost = Number.isFinite(cost) && cost > 0;
  if (!usage && !hasCost) return '';
  const p = usage ? (usage.prompt_tokens || 0) : 0;
  const c = usage ? (usage.completion_tokens || 0) : 0;
  const t = usage ? (usage.total_tokens || (p + c)) : 0;
  // 有缓存计数信息才拆「命中/未命中」；无则退回两段，避免旧记录显示成「命中 0」
  const hasCached = usage ? usageHasCachedInfo(usage) : false;
  let text = '';
  if (usage) {
    text = hasCached
      ? tSync('tokenUsage')
          .replace('{{inCached}}', formatTokenCount(extractCachedTokens(usage)))
          .replace('{{inUncached}}', formatTokenCount(Math.max(0, p - extractCachedTokens(usage))))
          .replace('{{out}}', formatTokenCount(c))
          .replace('{{total}}', formatTokenCount(t))
      : tSync('tokenUsageNoCache')
          .replace('{{in}}', formatTokenCount(p))
          .replace('{{out}}', formatTokenCount(c))
          .replace('{{total}}', formatTokenCount(t));
  }
  if (hasCost) {
    const costText = tSync('creditsCost').replace('{{cost}}', formatCredits(cost));
    text = text ? `${text} · ${costText}` : costText;
  }
  return text;
}
