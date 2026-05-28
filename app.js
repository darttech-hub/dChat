import { renderMarkdown } from "./markdown.js";

const LEGACY_STORAGE_KEY = "gemini-chat-rooms:v1";
const GEMINI_API_KEY_STORAGE = "gemini-chat-api-key:v1";
const GROQ_API_KEY_STORAGE = "groq-chat-api-key:v1";
const DB_NAME = "gemini-chat-local-db";
const DB_VERSION = 1;
const DB_STORE = "keyValue";
const DB_STATE_KEY = "app-state:v1";
const HIGH_DEMAND_RETRY_DELAYS_MS = [3000, 6000, 10000];
const DEFAULT_HISTORY_MESSAGE_LIMIT = 20;
const MAX_HISTORY_MESSAGE_LIMIT = 100;
const DEFAULT_COMPACT_RESPONSE_THRESHOLD = 2000;
const DEFAULT_COMPACT_RESPONSE_LENGTH = 600;
const MIN_COMPACT_RESPONSE_THRESHOLD = 500;
const MAX_COMPACT_RESPONSE_THRESHOLD = 50000;
const MIN_COMPACT_RESPONSE_LENGTH = 100;
const MAX_COMPACT_RESPONSE_LENGTH = 4000;
const PROVIDERS = {
  gemini: "Gemini",
  groq: "Groq"
};
const DEFAULT_GEMINI_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-2.0-flash",
  "models/gemini-1.5-flash",
  "models/gemini-1.5-pro"
];
const DEFAULT_GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "groq/compound",
  "groq/compound-mini"
];
const DEFAULT_MODELS_BY_PROVIDER = {
  gemini: DEFAULT_GEMINI_MODELS,
  groq: DEFAULT_GROQ_MODELS
};
const THEMES = {
  clean: {
    name: "클린",
    chatFontSize: 16
  },
  dawn: {
    name: "웜 던",
    chatFontSize: 16
  },
  forest: {
    name: "포레스트",
    chatFontSize: 17
  },
  ink: {
    name: "잉크",
    chatFontSize: 15
  },
  terminal: {
    name: "터미널",
    chatFontSize: 17
  },
  paper: {
    name: "페이퍼",
    chatFontSize: 16
  }
};
const DEFAULT_THEME_ID = "clean";

const els = {
  appShell: document.querySelector("#appShell"),
  roomList: document.querySelector("#roomList"),
  roomSearchInput: document.querySelector("#roomSearchInput"),
  roomSortSelect: document.querySelector("#roomSortSelect"),
  newRoomButton: document.querySelector("#newRoomButton"),
  toggleSidebarButton: document.querySelector("#toggleSidebarButton"),
  toggleSettingsPanelButton: document.querySelector("#toggleSettingsPanelButton"),
  roomTitleInput: document.querySelector("#roomTitleInput"),
  roomMeta: document.querySelector("#roomMeta"),
  roomModelSelect: document.querySelector("#roomModelSelect"),
  editRoomTitleButton: document.querySelector("#editRoomTitleButton"),
  openInstructionButton: document.querySelector("#openInstructionButton"),
  shareRoomButton: document.querySelector("#shareRoomButton"),
  deleteRoomButton: document.querySelector("#deleteRoomButton"),
  messageStream: document.querySelector("#messageStream"),
  composer: document.querySelector("#composer"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  scrollMinimapTrack: document.querySelector("#scrollMinimapTrack"),
  scrollMinimapThumb: document.querySelector("#scrollMinimapThumb"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  groqApiKeyInput: document.querySelector("#groqApiKeyInput"),
  toggleKeyButton: document.querySelector("#toggleKeyButton"),
  toggleGroqKeyButton: document.querySelector("#toggleGroqKeyButton"),
  rememberKeyInput: document.querySelector("#rememberKeyInput"),
  rememberGroqKeyInput: document.querySelector("#rememberGroqKeyInput"),
  geminiKeyStatus: document.querySelector("#geminiKeyStatus"),
  groqKeyStatus: document.querySelector("#groqKeyStatus"),
  clearGeminiKeyButton: document.querySelector("#clearGeminiKeyButton"),
  clearGroqKeyButton: document.querySelector("#clearGroqKeyButton"),
  loadModelsButton: document.querySelector("#loadModelsButton"),
  roomProviderSelect: document.querySelector("#roomProviderSelect"),
  defaultModelSelect: document.querySelector("#defaultModelSelect"),
  defaultProviderSelect: document.querySelector("#defaultProviderSelect"),
  temperatureInput: document.querySelector("#temperatureInput"),
  temperatureValue: document.querySelector("#temperatureValue"),
  maxTokensInput: document.querySelector("#maxTokensInput"),
  includeHistoryInput: document.querySelector("#includeHistoryInput"),
  historyLimitInput: document.querySelector("#historyLimitInput"),
  historyLimitValue: document.querySelector("#historyLimitValue"),
  compactResponsesInput: document.querySelector("#compactResponsesInput"),
  compactThresholdInput: document.querySelector("#compactThresholdInput"),
  compactThresholdValue: document.querySelector("#compactThresholdValue"),
  compactLengthInput: document.querySelector("#compactLengthInput"),
  compactLengthValue: document.querySelector("#compactLengthValue"),
  contextSizeText: document.querySelector("#contextSizeText"),
  modelPolicyText: document.querySelector("#modelPolicyText"),
  openPayloadPreviewButton: document.querySelector("#openPayloadPreviewButton"),
  themeSelect: document.querySelector("#themeSelect"),
  chatFontSizeInput: document.querySelector("#chatFontSizeInput"),
  chatFontSizeValue: document.querySelector("#chatFontSizeValue"),
  statusText: document.querySelector("#statusText"),
  openStoragePolicyButton: document.querySelector("#openStoragePolicyButton"),
  openRoomsButton: document.querySelector("#openRoomsButton"),
  openSettingsButton: document.querySelector("#openSettingsButton"),
  detailDialog: document.querySelector("#detailDialog"),
  detailDialogTitle: document.querySelector("#detailDialogTitle"),
  detailDialogDescription: document.querySelector("#detailDialogDescription"),
  detailTextOutput: document.querySelector("#detailTextOutput"),
  closeDetailDialogButton: document.querySelector("#closeDetailDialogButton"),
  copyDetailTextButton: document.querySelector("#copyDetailTextButton"),
  saveDetailTextButton: document.querySelector("#saveDetailTextButton"),
  regenerateDetailTextButton: document.querySelector("#regenerateDetailTextButton"),
  instructionDialog: document.querySelector("#instructionDialog"),
  instructionTextInput: document.querySelector("#instructionTextInput"),
  closeInstructionDialogButton: document.querySelector("#closeInstructionDialogButton"),
  clearInstructionButton: document.querySelector("#clearInstructionButton"),
  saveInstructionButton: document.querySelector("#saveInstructionButton"),
  shareDialog: document.querySelector("#shareDialog"),
  shareTextOutput: document.querySelector("#shareTextOutput"),
  closeShareDialogButton: document.querySelector("#closeShareDialogButton"),
  copyShareTextButton: document.querySelector("#copyShareTextButton"),
  sidebar: document.querySelector(".sidebar"),
  settingsPanel: document.querySelector(".settings-panel"),
  overlay: document.querySelector("#overlay")
};

let state = createDefaultState();
let activeRequest = null;
let isComposingMessage = false;
let activeDetailText = "";
let activeDetailSaveHandler = null;
let activeDetailRegenerateHandler = null;

function createRoom(name = "새 채팅방") {
  const provider = getValidProvider(state?.settings?.defaultProvider);
  return {
    id: crypto.randomUUID(),
    title: name,
    provider,
    model: getDefaultModel(provider),
    instruction: "",
    pinned: false,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createDefaultState() {
  return {
    activeRoomId: "",
    models: {
      gemini: DEFAULT_GEMINI_MODELS,
      groq: DEFAULT_GROQ_MODELS
    },
    settings: {
      defaultProvider: "gemini",
      defaultModels: {
        gemini: DEFAULT_GEMINI_MODELS[0],
        groq: DEFAULT_GROQ_MODELS[0]
      },
      temperature: 0.7,
      maxOutputTokens: 2048,
      includeHistory: true,
      historyMessageLimit: DEFAULT_HISTORY_MESSAGE_LIMIT,
      compactLargeResponses: true,
      compactResponseThreshold: DEFAULT_COMPACT_RESPONSE_THRESHOLD,
      compactResponseLength: DEFAULT_COMPACT_RESPONSE_LENGTH
    },
    ui: {
      leftCollapsed: false,
      rightCollapsed: false,
      themeId: DEFAULT_THEME_ID,
      chatFontSize: 16,
      roomSearch: "",
      roomSort: "recent"
    },
    rooms: []
  };
}

function openLocalDb() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
  });
}

async function readFromLocalDb(key) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readonly");
    const store = transaction.objectStore(DB_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function writeToLocalDb(key, value) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function loadState() {
  let saved = null;

  try {
    saved = await readFromLocalDb(DB_STATE_KEY);
  } catch {
    saved = null;
  }

  if (!saved) {
    saved = safeJson(localStorage.getItem(LEGACY_STORAGE_KEY));
  }

  const initialState = normalizeState(saved);
  return initialState;
}

function normalizeState(saved) {
  const initialState = saved || createDefaultState();

  initialState.models = normalizeModelState(initialState.models);
  const legacyDefaultModel = initialState.settings?.defaultModel;
  const defaultProvider = getValidProvider(initialState.settings?.defaultProvider);
  const defaultModels = {
    gemini: initialState.settings?.defaultModels?.gemini || legacyDefaultModel || initialState.models.gemini[0],
    groq: initialState.settings?.defaultModels?.groq || initialState.models.groq[0]
  };

  Object.keys(PROVIDERS).forEach((provider) => {
    if (!initialState.models[provider].includes(defaultModels[provider])) {
      initialState.models[provider] = normalizeProviderModels(provider, [defaultModels[provider], ...initialState.models[provider]]);
    }
  });

  initialState.settings = {
    defaultProvider,
    defaultModels,
    temperature: Number(initialState.settings?.temperature ?? 0.7),
    maxOutputTokens: Number(initialState.settings?.maxOutputTokens ?? 2048),
    includeHistory: initialState.settings?.includeHistory ?? true,
    historyMessageLimit: normalizeHistoryMessageLimit(initialState.settings?.historyMessageLimit),
    compactLargeResponses: initialState.settings?.compactLargeResponses ?? true,
    compactResponseThreshold: normalizeCompactResponseThreshold(initialState.settings?.compactResponseThreshold),
    compactResponseLength: normalizeCompactResponseLength(initialState.settings?.compactResponseLength)
  };

  if (!Array.isArray(initialState.rooms) || initialState.rooms.length === 0) {
    const provider = initialState.settings.defaultProvider;
    const firstRoom = {
      id: crypto.randomUUID(),
      title: "첫 채팅방",
      provider,
      model: initialState.settings.defaultModels[provider],
      instruction: "",
      pinned: false,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    initialState.rooms = [firstRoom];
    initialState.activeRoomId = firstRoom.id;
  }

  initialState.rooms.forEach((room) => {
    if (typeof room.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(room.id)) {
      room.id = crypto.randomUUID();
    }
    room.provider = getValidProvider(room.provider);
    room.instruction = typeof room.instruction === "string" ? room.instruction : "";
    room.pinned = Boolean(room.pinned);
    room.messages = Array.isArray(room.messages) ? room.messages : [];
    room.messages.forEach((message) => {
      if (typeof message.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(message.id)) {
        message.id = crypto.randomUUID();
      }
      if (typeof message.contextText !== "string") {
        delete message.contextText;
      }
    });
    if (!room.model) {
      room.model = initialState.settings.defaultModels[room.provider];
    }
    if (!initialState.models[room.provider].includes(room.model)) {
      initialState.models[room.provider] = normalizeProviderModels(room.provider, [room.model, ...initialState.models[room.provider]]);
    }
  });

  initialState.ui = {
    leftCollapsed: Boolean(initialState.ui?.leftCollapsed),
    rightCollapsed: Boolean(initialState.ui?.rightCollapsed),
    themeId: getValidThemeId(initialState.ui?.themeId),
    chatFontSize: clampNumber(Number(initialState.ui?.chatFontSize ?? 16), 14, 22),
    roomSearch: String(initialState.ui?.roomSearch || ""),
    roomSort: initialState.ui?.roomSort === "name" ? "name" : "recent"
  };

  if (!initialState.rooms.some((room) => room.id === initialState.activeRoomId)) {
    initialState.activeRoomId = initialState.rooms[0].id;
  }

  return initialState;
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function getValidProvider(provider) {
  return Object.hasOwn(PROVIDERS, provider) ? provider : "gemini";
}

function getProviderLabel(provider) {
  return PROVIDERS[getValidProvider(provider)];
}

function getValidThemeId(themeId) {
  return Object.hasOwn(THEMES, themeId) ? themeId : DEFAULT_THEME_ID;
}

function getTheme(themeId = state.ui.themeId) {
  return THEMES[getValidThemeId(themeId)];
}

function normalizeProviderModels(provider, models) {
  const validProvider = getValidProvider(provider);
  const defaults = DEFAULT_MODELS_BY_PROVIDER[validProvider] || [];
  const merged = Array.from(new Set([...(models || []), ...defaults]));
  return merged.filter(Boolean);
}

function normalizeModelState(models) {
  if (Array.isArray(models)) {
    return {
      gemini: normalizeProviderModels("gemini", models),
      groq: normalizeProviderModels("groq", [])
    };
  }

  return {
    gemini: normalizeProviderModels("gemini", models?.gemini),
    groq: normalizeProviderModels("groq", models?.groq)
  };
}

function getProviderModels(provider) {
  const validProvider = getValidProvider(provider);
  return state.models?.[validProvider] || DEFAULT_MODELS_BY_PROVIDER[validProvider] || [];
}

function getDefaultModel(provider) {
  const validProvider = getValidProvider(provider);
  return state.settings?.defaultModels?.[validProvider] || getProviderModels(validProvider)[0];
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHistoryMessageLimit(value) {
  return Math.round(clampNumber(Number(value ?? DEFAULT_HISTORY_MESSAGE_LIMIT), 1, MAX_HISTORY_MESSAGE_LIMIT));
}

function normalizeCompactResponseThreshold(value) {
  return Math.round(
    clampNumber(Number(value ?? DEFAULT_COMPACT_RESPONSE_THRESHOLD), MIN_COMPACT_RESPONSE_THRESHOLD, MAX_COMPACT_RESPONSE_THRESHOLD)
  );
}

function normalizeCompactResponseLength(value) {
  return Math.round(
    clampNumber(Number(value ?? DEFAULT_COMPACT_RESPONSE_LENGTH), MIN_COMPACT_RESPONSE_LENGTH, MAX_COMPACT_RESPONSE_LENGTH)
  );
}

function saveState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  writeToLocalDb(DB_STATE_KEY, snapshot).catch(() => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
  });
}

function getActiveRoom() {
  return state.rooms.find((room) => room.id === state.activeRoomId) || state.rooms[0];
}

function createMessage(role, text, extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    createdAt: Date.now(),
    ...extra
  };
}

function setStatus(message, tone = "neutral") {
  els.statusText.textContent = message;
  els.statusText.dataset.tone = tone;
}

function formatModelLabel(modelName) {
  return modelName.replace(/^models\//, "");
}

function renderModelOptions(select, selectedModel, provider) {
  select.innerHTML = "";
  getProviderModels(provider).forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = formatModelLabel(model);
    option.selected = model === selectedModel;
    select.append(option);
  });
}

function renderThemeOptions() {
  els.themeSelect.innerHTML = "";
  Object.entries(THEMES).forEach(([themeId, theme]) => {
    const option = document.createElement("option");
    option.value = themeId;
    option.textContent = theme.name;
    option.selected = themeId === state.ui.themeId;
    els.themeSelect.append(option);
  });
}

function renderRooms() {
  const activeRoom = getActiveRoom();
  els.roomList.innerHTML = "";
  els.roomSearchInput.value = state.ui.roomSearch;
  els.roomSortSelect.value = state.ui.roomSort;

  [...state.rooms]
    .filter((room) => {
      const query = state.ui.roomSearch.trim().toLowerCase();
      if (!query) return true;
      return `${room.title} ${room.messages.at(-1)?.text || ""}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (state.ui.roomSort === "name") {
        return a.title.localeCompare(b.title, "ko");
      }
      return b.updatedAt - a.updatedAt;
    })
    .forEach((room) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `room-item${room.id === activeRoom.id ? " active" : ""}`;
      button.dataset.roomId = room.id;

      const lastMessage = room.messages.at(-1)?.text || "새 대화";
      const count = room.messages.length;
      button.innerHTML = `
        <span class="room-copy">
          <span class="room-name"></span>
          <span class="room-subtitle"></span>
        </span>
        <span class="room-actions">
          <span class="room-pin${room.pinned ? " pinned" : ""}" role="button" aria-label="${room.pinned ? "고정 해제" : "채팅방 고정"}" title="${room.pinned ? "고정 해제" : "채팅방 고정"}">⌃</span>
          <span class="room-count">${count}</span>
        </span>
      `;
      button.querySelector(".room-name").textContent = room.title;
      button.querySelector(".room-subtitle").textContent = `${getProviderLabel(room.provider)} · ${lastMessage}`;
      els.roomList.append(button);
    });

  if (!els.roomList.children.length) {
    const empty = document.createElement("p");
    empty.className = "room-list-empty";
    empty.textContent = "검색 결과가 없습니다.";
    els.roomList.append(empty);
  }
}

function renderMessageActions(message) {
  if (message.pending) return null;
  const actions = document.createElement("div");
  actions.className = "message-actions";

  if (message.role === "model") {
    const showCompressedAction = message.contextText && shouldCompactMessage(message);
    actions.innerHTML = `
      <button type="button" data-action="copy-message" data-message-id="${message.id}">복사</button>
      ${showCompressedAction ? `<button type="button" data-action="show-compact" data-message-id="${message.id}">압축본</button>` : ""}
      <button type="button" data-action="regenerate-message" data-message-id="${message.id}">다시 생성</button>
      <button type="button" data-action="branch-message" data-message-id="${message.id}">새 방</button>
    `;
    return actions;
  }

  if (message.role === "error") {
    actions.innerHTML = `
      <button type="button" data-action="retry-message" data-message-id="${message.id}">다시 요청</button>
      <button type="button" data-action="copy-message" data-message-id="${message.id}">복사</button>
    `;
    return actions;
  }

  return null;
}

function renderMessages() {
  const room = getActiveRoom();
  els.messageStream.innerHTML = "";

  if (!room.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <h2>대화를 시작하세요</h2>
      <p>아직 메시지가 없습니다.</p>
    `;
    els.messageStream.append(empty);
    renderScrollMinimap();
    scrollMessagesToBottom();
    return;
  }

  room.messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `message ${message.role}${message.pending ? " pending" : ""}`;
    article.dataset.messageId = message.id;

    const label = document.createElement("div");
    label.className = "message-label";
    const labelText = document.createElement("span");
    labelText.textContent = message.role === "user" ? "You" : message.role === "error" ? "Error" : getProviderLabel(room.provider);
    label.append(labelText);

    if (message.role === "model" && message.contextText && shouldCompactMessage(message)) {
      const compactBadge = document.createElement("button");
      compactBadge.type = "button";
      compactBadge.className = "message-badge";
      compactBadge.dataset.action = "show-compact";
      compactBadge.dataset.messageId = message.id;
      compactBadge.title = "다음 요청에는 압축본을 사용합니다.";
      compactBadge.textContent = "압축";
      label.append(compactBadge);
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.role === "model" && !message.pending) {
      bubble.classList.add("markdown-body");
      bubble.innerHTML = renderMarkdown(message.text);
    } else {
      bubble.textContent = message.text;
    }

    article.append(label, bubble);
    const actions = renderMessageActions(message);
    if (actions) article.append(actions);
    els.messageStream.append(article);
  });

  renderScrollMinimap();
  scrollMessagesToBottom();
}

function renderHeader() {
  const room = getActiveRoom();
  els.roomTitleInput.value = room.title;
  const userCount = room.messages.filter((message) => message.role === "user").length;
  const instructionMeta = getRoomInstruction(room) ? " · 지침 있음" : "";
  els.roomMeta.textContent = `${room.messages.length} messages · ${userCount} turns · ${getProviderLabel(room.provider)} / ${formatModelLabel(room.model)}${instructionMeta}`;
  els.openInstructionButton.classList.toggle("active", Boolean(getRoomInstruction(room)));
  els.openInstructionButton.title = getRoomInstruction(room) ? "채팅방 지침 수정" : "채팅방 지침 추가";
  els.openInstructionButton.setAttribute("aria-label", els.openInstructionButton.title);
}

function renderSettings() {
  const room = getActiveRoom();
  els.roomProviderSelect.value = room.provider;
  renderModelOptions(els.roomModelSelect, room.model, room.provider);
  els.defaultProviderSelect.value = state.settings.defaultProvider;
  renderModelOptions(els.defaultModelSelect, getDefaultModel(state.settings.defaultProvider), state.settings.defaultProvider);
  els.temperatureInput.value = state.settings.temperature;
  els.temperatureValue.textContent = String(state.settings.temperature);
  els.maxTokensInput.value = state.settings.maxOutputTokens;
  els.includeHistoryInput.checked = Boolean(state.settings.includeHistory);
  els.historyLimitInput.value = state.settings.historyMessageLimit;
  els.historyLimitInput.disabled = !state.settings.includeHistory;
  els.historyLimitValue.textContent = String(state.settings.historyMessageLimit);
  els.compactResponsesInput.checked = Boolean(state.settings.compactLargeResponses);
  els.compactThresholdInput.value = state.settings.compactResponseThreshold;
  els.compactThresholdInput.disabled = !state.settings.compactLargeResponses;
  els.compactThresholdValue.textContent = `${state.settings.compactResponseThreshold}자`;
  els.compactLengthInput.value = state.settings.compactResponseLength;
  els.compactLengthInput.disabled = !state.settings.compactLargeResponses;
  els.compactLengthValue.textContent = `${state.settings.compactResponseLength}자`;
  renderContextSize();
  renderModelPolicy();
  renderThemeOptions();
  els.chatFontSizeInput.value = state.ui.chatFontSize;
  els.chatFontSizeValue.textContent = `${state.ui.chatFontSize}px`;
}

function renderUiState() {
  els.appShell.classList.toggle("left-collapsed", state.ui.leftCollapsed);
  els.appShell.classList.toggle("right-collapsed", state.ui.rightCollapsed);
  document.body.dataset.theme = state.ui.themeId;
  els.appShell.style.setProperty("--chat-font-size", `${state.ui.chatFontSize}px`);

  const leftLabel = state.ui.leftCollapsed ? "왼쪽 패널 펼치기" : "왼쪽 패널 접기";
  const rightLabel = state.ui.rightCollapsed ? "오른쪽 패널 펼치기" : "오른쪽 패널 접기";
  els.toggleSidebarButton.setAttribute("aria-label", leftLabel);
  els.toggleSidebarButton.title = leftLabel;
  els.toggleSidebarButton.querySelector("span").textContent = state.ui.leftCollapsed ? "›" : "‹";
  els.toggleSettingsPanelButton.setAttribute("aria-label", rightLabel);
  els.toggleSettingsPanelButton.title = rightLabel;
  els.toggleSettingsPanelButton.querySelector("span").textContent = state.ui.rightCollapsed ? "‹" : "›";
}

function render() {
  renderUiState();
  renderRooms();
  renderHeader();
  renderMessages();
  renderSettings();
  saveState();
}

function switchRoom(roomId) {
  state.activeRoomId = roomId;
  clearComposerInput();
  closeMobilePanels();
  render();
  scrollMessagesToBottom();
}

function addRoom() {
  const room = createRoom(`채팅방 ${state.rooms.length + 1}`);
  state.rooms.push(room);
  state.activeRoomId = room.id;
  clearComposerInput();
  render();
  els.roomTitleInput.focus();
  els.roomTitleInput.select();
}

function deleteActiveRoom() {
  if (state.rooms.length === 1) {
    const room = getActiveRoom();
    room.messages = [];
    room.updatedAt = Date.now();
    render();
    return;
  }

  const room = getActiveRoom();
  const ok = confirm(`"${room.title}" 채팅방을 삭제할까요?`);
  if (!ok) return;

  state.rooms = state.rooms.filter((item) => item.id !== room.id);
  state.activeRoomId = state.rooms[0].id;
  render();
}

function updateRoomTitle(title) {
  const room = getActiveRoom();
  room.title = title.trim() || "이름 없는 채팅방";
  room.updatedAt = Date.now();
  renderRooms();
  saveState();
}

function toggleRoomPinned(roomId) {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return;
  room.pinned = !room.pinned;
  room.updatedAt = Date.now();
  renderRooms();
  saveState();
}

function focusRoomTitle() {
  els.roomTitleInput.focus();
  els.roomTitleInput.select();
}

function getRoomInstruction(room) {
  return (room.instruction || "").trim();
}

function openInstructionDialog() {
  const room = getActiveRoom();
  els.instructionTextInput.value = room.instruction || "";
  els.instructionDialog.hidden = false;
  requestAnimationFrame(() => {
    els.instructionTextInput.focus();
  });
}

function closeInstructionDialog() {
  els.instructionDialog.hidden = true;
}

function saveRoomInstruction() {
  const room = getActiveRoom();
  room.instruction = els.instructionTextInput.value.trim();
  room.updatedAt = Date.now();
  closeInstructionDialog();
  renderHeader();
  renderRooms();
  renderContextSize();
  renderModelPolicy();
  saveState();
  setStatus(room.instruction ? "채팅방 지침을 저장했습니다." : "채팅방 지침을 비웠습니다.", "success");
}

function clearRoomInstruction() {
  els.instructionTextInput.value = "";
  saveRoomInstruction();
}

function updateRoomModel(model) {
  const room = getActiveRoom();
  room.model = model;
  room.updatedAt = Date.now();
  render();
  saveState();
}

function updateRoomProvider(provider) {
  const room = getActiveRoom();
  room.provider = getValidProvider(provider);
  room.model = getDefaultModel(room.provider);
  room.updatedAt = Date.now();
  render();
  saveState();
}

function updateDefaultProvider(provider) {
  state.settings.defaultProvider = getValidProvider(provider);
  renderSettings();
  saveState();
}

function updateDefaultModel(model) {
  state.settings.defaultModels[state.settings.defaultProvider] = model;
  saveState();
}

function updateIncludeHistory(includeHistory) {
  state.settings.includeHistory = includeHistory;
  renderSettings();
  saveState();
}

function updateHistoryMessageLimit(value) {
  state.settings.historyMessageLimit = normalizeHistoryMessageLimit(value);
  els.historyLimitInput.value = state.settings.historyMessageLimit;
  els.historyLimitValue.textContent = String(state.settings.historyMessageLimit);
  renderContextSize();
  renderModelPolicy();
  saveState();
}

function updateCompactLargeResponses(compactLargeResponses) {
  state.settings.compactLargeResponses = compactLargeResponses;
  renderSettings();
  saveState();
}

function updateCompactResponseThreshold(value) {
  state.settings.compactResponseThreshold = normalizeCompactResponseThreshold(value);
  els.compactThresholdInput.value = state.settings.compactResponseThreshold;
  els.compactThresholdValue.textContent = `${state.settings.compactResponseThreshold}자`;
  renderContextSize();
  renderModelPolicy();
  saveState();
}

function updateCompactResponseLength(value) {
  state.settings.compactResponseLength = normalizeCompactResponseLength(value);
  els.compactLengthInput.value = state.settings.compactResponseLength;
  els.compactLengthValue.textContent = `${state.settings.compactResponseLength}자`;
  renderContextSize();
  saveState();
}

function updateTheme(themeId) {
  const validThemeId = getValidThemeId(themeId);
  state.ui.themeId = validThemeId;
  state.ui.chatFontSize = clampNumber(getTheme(validThemeId).chatFontSize, 14, 22);
  render();
  scrollMessagesToBottom();
  setStatus(`${getTheme(validThemeId).name} 테마를 적용했습니다.`, "success");
}

function formatMessageRole(role, provider) {
  if (role === "user") return "나";
  if (role === "error") return "오류";
  return getProviderLabel(provider);
}

function buildShareText(room) {
  const messages = room.messages.filter((message) => !message.pending);
  if (!messages.length) return "";

  const lines = [
    room.title,
    `모델: ${getProviderLabel(room.provider)} / ${formatModelLabel(room.model)}`,
    "",
    ...messages.flatMap((message) => [`[${formatMessageRole(message.role, room.provider)}]`, message.text.trim(), ""])
  ];

  return lines.join("\n").trim();
}

function buildPayloadPreviewText() {
  const room = getActiveRoom();
  const messages = getPreviewRequestMessages(room, els.messageInput.value);
  const payload = createRequestPayload(room.provider, room, messages);
  const stats = getRequestPayloadStats(room.provider, room, messages);
  const instruction = getRoomInstruction(room);
  const lines = [
    `Provider: ${getProviderLabel(room.provider)}`,
    `Model: ${formatModelLabel(room.model)}`,
    `Size: ${stats.size}`,
    `Messages: ${messages.length}`,
    `Instruction: ${instruction ? "included" : "none"}`,
    "",
    "[지침]",
    instruction || "(없음)",
    "",
    "[메시지]",
    ...messages.flatMap((message, index) => [
      `${index + 1}. ${message.role === "model" ? "assistant" : message.role}${message.compressed ? " (압축본)" : ""}`,
      message.text,
      ""
    ]),
    "[Payload JSON]",
    JSON.stringify(payload, null, 2)
  ];
  return lines.join("\n");
}

function openPayloadPreview() {
  openDetailDialog("전송 내용 미리보기", "이번 요청에 실제로 포함될 payload입니다.", buildPayloadPreviewText());
}

function buildStoragePolicyText() {
  return [
    "[앱 데이터]",
    "- 대화방, 메시지, 설정, 모델 목록, 테마, 압축본은 IndexedDB에 저장됩니다.",
    "- IndexedDB를 사용할 수 없는 브라우저 환경에서는 localStorage로 fallback합니다.",
    "",
    "[API key]",
    "- Gemini/Groq API key는 앱 데이터와 분리해서 저장합니다.",
    "- 키 저장 체크 ON: localStorage에 저장되어 브라우저를 다시 열어도 유지됩니다.",
    "- 키 저장 체크 OFF: sessionStorage에 저장되어 현재 세션에서만 유지됩니다.",
    "",
    "[범위]",
    "- 모든 데이터는 현재 브라우저와 현재 기기에만 저장됩니다.",
    "- 다른 브라우저나 다른 기기로 자동 동기화되지 않습니다.",
    "- 브라우저 사이트 데이터를 삭제하면 저장된 대화, 설정, API key가 함께 삭제될 수 있습니다."
  ].join("\n");
}

function openStoragePolicy() {
  openDetailDialog(
    "저장 정책",
    "앱 데이터는 로컬DB 중심, API key는 별도 브라우저 저장소로 분리합니다.",
    buildStoragePolicyText()
  );
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy copy path for browsers that expose Clipboard API
      // but block it in embedded or non-secure contexts.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function openShareDialog(text) {
  els.shareTextOutput.value = text;
  els.shareDialog.hidden = false;
  requestAnimationFrame(() => {
    els.shareTextOutput.focus();
    els.shareTextOutput.select();
  });
}

function closeShareDialog() {
  els.shareDialog.hidden = true;
}

function openDetailDialog(title, description, text, options = {}) {
  activeDetailText = text;
  activeDetailSaveHandler = typeof options.onSave === "function" ? options.onSave : null;
  activeDetailRegenerateHandler = typeof options.onRegenerate === "function" ? options.onRegenerate : null;
  els.detailDialogTitle.textContent = title;
  els.detailDialogDescription.textContent = description;
  els.detailTextOutput.value = text;
  els.detailTextOutput.readOnly = !activeDetailSaveHandler;
  els.saveDetailTextButton.hidden = !activeDetailSaveHandler;
  els.regenerateDetailTextButton.hidden = !activeDetailRegenerateHandler;
  els.detailDialog.hidden = false;
  requestAnimationFrame(() => {
    els.detailTextOutput.focus();
    if (els.detailTextOutput.readOnly) {
      els.detailTextOutput.select();
    }
  });
}

function closeDetailDialog() {
  els.detailDialog.hidden = true;
  activeDetailSaveHandler = null;
  activeDetailRegenerateHandler = null;
  els.detailTextOutput.readOnly = true;
  els.saveDetailTextButton.hidden = true;
  els.regenerateDetailTextButton.hidden = true;
}

function saveDetailDialogText() {
  if (!activeDetailSaveHandler) return;
  activeDetailText = els.detailTextOutput.value.trim();
  activeDetailSaveHandler(activeDetailText);
  closeDetailDialog();
}

function regenerateDetailDialogText() {
  if (!activeDetailRegenerateHandler) return;
  activeDetailText = activeDetailRegenerateHandler();
  els.detailTextOutput.value = activeDetailText;
  els.detailTextOutput.focus();
}

async function shareActiveRoom() {
  const room = getActiveRoom();
  const text = buildShareText(room);

  if (!text) {
    setStatus("공유할 대화가 없습니다.", "error");
    return;
  }

  const shareData = {
    title: room.title,
    text
  };

  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      setStatus("공유 창을 열었습니다.", "success");
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        setStatus("공유가 취소되었습니다.");
        return;
      }
    }
  }

  try {
    await copyTextToClipboard(text);
    setStatus("공유 API가 없어 대화 내용을 복사했습니다.", "success");
  } catch {
    openShareDialog(text);
    setStatus("복사 창을 열었습니다.", "success");
  }
}

function findMessageById(messageId) {
  const room = getActiveRoom();
  const index = room.messages.findIndex((message) => message.id === messageId);
  return { room, index, message: index >= 0 ? room.messages[index] : null };
}

function findPreviousUserIndex(room, fromIndex) {
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    if (room.messages[index].role === "user") return index;
  }
  return -1;
}

async function retryFromMessage(messageId) {
  if (activeRequest) return;
  const { room, index, message } = findMessageById(messageId);
  if (!message) return;
  const userIndex = findPreviousUserIndex(room, index);
  if (userIndex < 0) {
    setStatus("다시 요청할 사용자 메시지를 찾지 못했습니다.", "error");
    return;
  }

  room.messages = room.messages.slice(0, index);
  const pending = createMessage("model", "응답을 기다리는 중입니다.", { pending: true });
  room.messages.push(pending);
  room.updatedAt = Date.now();
  render();
  await processRoomRequest(room, pending.id);
}

async function regenerateMessage(messageId) {
  if (activeRequest) return;
  const { room, index, message } = findMessageById(messageId);
  if (!message || message.role !== "model") return;
  const userIndex = findPreviousUserIndex(room, index);
  if (userIndex < 0) {
    setStatus("다시 생성할 사용자 메시지를 찾지 못했습니다.", "error");
    return;
  }

  room.messages = room.messages.slice(0, index);
  const pending = createMessage("model", "응답을 다시 생성하는 중입니다.", { pending: true });
  room.messages.push(pending);
  room.updatedAt = Date.now();
  render();
  await processRoomRequest(room, pending.id);
}

function branchFromMessage(messageId) {
  const { room, index, message } = findMessageById(messageId);
  if (!message || index < 0) return;
  const newRoom = {
    ...createRoom(`${room.title} 복사`),
    provider: room.provider,
    model: room.model,
    instruction: room.instruction || "",
    messages: room.messages.slice(0, index + 1).map((item) => ({ ...item, id: crypto.randomUUID() })),
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.rooms.push(newRoom);
  state.activeRoomId = newRoom.id;
  render();
  setStatus("선택한 응답까지 새 채팅방으로 복사했습니다.", "success");
}

async function handleMessageAction(action, messageId) {
  const { message } = findMessageById(messageId);
  if (!message) return;

  if (action === "copy-message") {
    try {
      await copyTextToClipboard(message.text);
      setStatus("메시지를 복사했습니다.", "success");
    } catch {
      openDetailDialog("메시지 복사", "복사가 차단되어 직접 선택할 수 있게 열었습니다.", message.text);
    }
    return;
  }

  if (action === "show-compact") {
    openDetailDialog(
      "압축본 편집",
      "저장하면 다음 요청부터 이 압축본이 원문 대신 사용됩니다.",
      message.contextText || createCompressedContextText(message.text),
      {
        onRegenerate: () => createCompressedContextText(message.text),
        onSave: (value) => {
          message.contextText = value || createCompressedContextText(message.text);
          renderMessages();
          renderContextSize();
          saveState();
          setStatus("압축본을 저장했습니다.", "success");
        }
      }
    );
    return;
  }

  if (action === "retry-message") {
    await retryFromMessage(messageId);
    return;
  }

  if (action === "regenerate-message") {
    await regenerateMessage(messageId);
    return;
  }

  if (action === "branch-message") {
    branchFromMessage(messageId);
  }
}

function getApiKey(provider) {
  return getValidProvider(provider) === "groq" ? els.groqApiKeyInput.value.trim() : els.apiKeyInput.value.trim();
}

function storeApiKey(storageKey, key, persist) {
  localStorage.removeItem(storageKey);
  sessionStorage.removeItem(storageKey);

  if (!key) return;

  const storage = persist ? localStorage : sessionStorage;
  storage.setItem(storageKey, key);
}

function persistApiKeys() {
  persistProviderApiKey("gemini");
  persistProviderApiKey("groq");
}

function persistProviderApiKey(provider) {
  const validProvider = getValidProvider(provider);
  const storageKey = validProvider === "groq" ? GROQ_API_KEY_STORAGE : GEMINI_API_KEY_STORAGE;
  const persist = validProvider === "groq" ? els.rememberGroqKeyInput.checked : els.rememberKeyInput.checked;
  storeApiKey(storageKey, getApiKey(validProvider), persist);
  renderKeyStatuses();
}

function loadSavedApiKey() {
  const geminiLocalKey = localStorage.getItem(GEMINI_API_KEY_STORAGE);
  const groqLocalKey = localStorage.getItem(GROQ_API_KEY_STORAGE);
  els.apiKeyInput.value = geminiLocalKey || sessionStorage.getItem(GEMINI_API_KEY_STORAGE) || "";
  els.groqApiKeyInput.value = groqLocalKey || sessionStorage.getItem(GROQ_API_KEY_STORAGE) || "";
  els.rememberKeyInput.checked = Boolean(geminiLocalKey);
  els.rememberGroqKeyInput.checked = Boolean(groqLocalKey);
  renderKeyStatuses();
}

function getKeyStorageStatus(storageKey, key) {
  if (!key) return "저장 안 됨";
  if (localStorage.getItem(storageKey)) return "브라우저 저장";
  if (sessionStorage.getItem(storageKey)) return "세션 저장";
  return "입력됨";
}

function renderKeyStatuses() {
  els.geminiKeyStatus.textContent = getKeyStorageStatus(GEMINI_API_KEY_STORAGE, getApiKey("gemini"));
  els.groqKeyStatus.textContent = getKeyStorageStatus(GROQ_API_KEY_STORAGE, getApiKey("groq"));
}

function clearProviderApiKey(provider) {
  const validProvider = getValidProvider(provider);
  const storageKey = validProvider === "groq" ? GROQ_API_KEY_STORAGE : GEMINI_API_KEY_STORAGE;
  localStorage.removeItem(storageKey);
  sessionStorage.removeItem(storageKey);
  if (validProvider === "groq") {
    els.groqApiKeyInput.value = "";
    els.rememberGroqKeyInput.checked = false;
  } else {
    els.apiKeyInput.value = "";
    els.rememberKeyInput.checked = false;
  }
  renderKeyStatuses();
  setStatus(`${getProviderLabel(validProvider)} API 키를 삭제했습니다.`, "success");
}

async function loadModels() {
  const provider = getActiveRoom().provider;
  const key = getApiKey(provider);
  if (!key) {
    setStatus(`${getProviderLabel(provider)} 모델을 불러오려면 API 키가 필요합니다.`, "error");
    (provider === "groq" ? els.groqApiKeyInput : els.apiKeyInput).focus();
    return;
  }

  els.loadModelsButton.disabled = true;
  setStatus(`${getProviderLabel(provider)} 모델 목록을 불러오는 중입니다.`);

  try {
    const models = provider === "groq" ? await loadGroqModels(key) : await loadGeminiModels(key);

    if (!models.length) {
      throw new Error(`${getProviderLabel(provider)}에서 사용할 수 있는 모델이 없습니다.`);
    }

    state.models[provider] = normalizeProviderModels(provider, models);
    if (!state.models[provider].includes(getDefaultModel(provider))) {
      state.settings.defaultModels[provider] = state.models[provider][0];
    }
    state.rooms.forEach((room) => {
      if (room.provider === provider && !state.models[provider].includes(room.model)) {
        room.model = getDefaultModel(provider);
      }
    });

    persistApiKeys();
    setStatus(`${getProviderLabel(provider)} 모델 ${models.length}개를 불러왔습니다.`, "success");
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.loadModelsButton.disabled = false;
  }
}

async function loadGeminiModels(key) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Gemini 모델 목록을 불러오지 못했습니다.");
  }

  return (data.models || [])
    .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
    .map((model) => model.name)
    .sort();
}

async function loadGroqModels(key) {
  const response = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Groq 모델 목록을 불러오지 못했습니다.");
  }

  return (data.data || [])
    .map((model) => model.id)
    .filter(Boolean)
    .sort();
}

function toGeminiContents(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "model")
    .map((message) => ({
      role: message.role,
      parts: [{ text: message.text }]
    }));
}

function toGroqMessages(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "model")
    .map((message) => ({
      role: message.role === "model" ? "assistant" : "user",
      content: message.text
    }));
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function clipText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function clipContextSummary(text, maxLength) {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const sentenceEnd = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf("!"), clipped.lastIndexOf("?"));
  if (sentenceEnd > maxLength * 0.55) {
    return clipped.slice(0, sentenceEnd + 1);
  }
  return `${clipped}…`;
}

function shouldCompactMessage(message) {
  return (
    state.settings.compactLargeResponses &&
    message.role === "model" &&
    typeof message.text === "string" &&
    message.text.length >= state.settings.compactResponseThreshold
  );
}

const CONTEXT_STOP_WORDS = new Set([
  "그리고",
  "그러나",
  "하지만",
  "또한",
  "입니다",
  "합니다",
  "됩니다",
  "있는",
  "없는",
  "대한",
  "관련",
  "경우",
  "정도",
  "내용",
  "아래",
  "다음",
  "이번",
  "위해",
  "사용",
  "가능",
  "필요",
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "you",
  "are",
  "cm",
  "mm",
  "ml",
  "kg",
  "mg",
  "ppm"
]);

function cleanMarkdownLine(line) {
  const trimmed = line.trim();
  if (!trimmed || (/^\|?[\s:|-]+\|?$/.test(trimmed) && trimmed.includes("-"))) {
    return "";
  }

  return normalizeWhitespace(
    trimmed
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^```.*$/g, "")
      .replace(/^#{1,6}\s*/, "")
      .replace(/^>\s*/, "")
      .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+[.)]\s*/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/(\d)\s*[~∼]\s*(\d)/g, "$1-$2")
      .replace(/\s[-–—]\s/g, " ")
      .replace(/[*_`#]/g, "")
      .replace(/~{2,}/g, "")
      .replace(/[|]/g, " ")
      .replace(/[•·●○◆◇▶▷▪▫■□]/g, " ")
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/\s*[-=]{3,}\s*/g, " ")
      .replace(/\s+([.,!?;:])/g, "$1")
  );
}

function splitLongContextLine(line) {
  if (line.length <= 180) return [line];
  const sentences = line.match(/[^.!?。！？]+[.!?。！？]?/g) || [];
  const cleaned = sentences.flatMap((sentence) => splitContextChunk(normalizeWhitespace(sentence))).filter((sentence) => sentence.length >= 14);
  return cleaned.length ? cleaned : [clipText(line, 180)];
}

function splitContextChunk(text, maxLength = 160) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const breakAt = Math.max(80, remaining.lastIndexOf(" ", maxLength));
    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function getContextCandidates(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => splitLongContextLine(cleanMarkdownLine(line)))
    .map((line) => normalizeWhitespace(line))
    .filter(isUsefulContextCandidate);
}

function getContextTokens(text) {
  return (text.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []).filter(
    (token) => !CONTEXT_STOP_WORDS.has(token) && !/^\d+$/.test(token)
  );
}

function isUsefulContextCandidate(candidate) {
  if (candidate.length < 14) return false;
  if (/^[\d\s.,:;()/-]+$/.test(candidate)) return false;
  const symbols = (candidate.match(/[|_*#<>{}\[\]`~]/g) || []).length;
  if (symbols > candidate.length * 0.08) return false;
  return getContextTokens(candidate).length >= 2 || candidate.length >= 24;
}

function extractContextKeywords(candidates) {
  const counts = new Map();
  getContextTokens(candidates.join(" ")).forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return new Map(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
      .slice(0, 12)
  );
}

function isImportantContextCandidate(candidate) {
  return /(요약|결론|핵심|주의|중요|필수|권장|추천|문제|원인|해결|방법|단계|변경|파일|테스트|오류|에러|설정|위험|안전|불가|해야|필요|먼저|최종|한 줄|summary|conclusion|important|warning|error|fix|test|file|next|must|should|recommend)/i.test(
    candidate
  );
}

function isConclusionContextCandidate(candidate) {
  return /(요약|결론|핵심|최종|한 줄|주의|중요|summary|conclusion|important|warning)/i.test(candidate);
}

function scoreContextCandidate(candidate, index, keywords) {
  const lower = candidate.toLowerCase();
  let score = 0;

  keywords.forEach((count, keyword) => {
    if (lower.includes(keyword)) score += Math.min(count, 3);
  });

  if (isImportantContextCandidate(candidate)) score += 4;
  if (/^(요약|결론|핵심|최종|한 줄|주의|중요|summary|conclusion|important|warning)\b/i.test(candidate)) score += 5;
  if (/[0-9]/.test(candidate)) score += 0.5;
  if (candidate.length >= 35 && candidate.length <= 180) score += 1;
  if (candidate.length > 220) score -= 1.5;
  if (index < 5) score += 1.4 - index * 0.2;

  const symbolCount = (candidate.match(/[=|_*#<>{}\[\]`~]/g) || []).length;
  return score - symbolCount * 0.45;
}

function isNearDuplicateContext(candidate, selected) {
  const tokens = new Set(getContextTokens(candidate));
  if (!tokens.size) return false;

  return selected.some((item) => {
    const itemTokens = new Set(getContextTokens(item));
    if (!itemTokens.size) return false;
    const shorterSize = Math.min(tokens.size, itemTokens.size);
    let overlap = 0;
    tokens.forEach((token) => {
      if (itemTokens.has(token)) overlap += 1;
    });
    return overlap / shorterSize > 0.72;
  });
}

function uniqueContextCandidates(candidates) {
  return candidates.reduce((items, candidate) => {
    if (!isNearDuplicateContext(candidate, items)) items.push(candidate);
    return items;
  }, []);
}

function createCompressedContextText(text, maxLength = state.settings.compactResponseLength) {
  const normalized = normalizeWhitespace(cleanMarkdownLine(text));
  if (normalized.length <= maxLength) return normalized;

  const candidates = getContextCandidates(text);
  if (!candidates.length) {
    return clipContextSummary(`요약: ${normalized}`, maxLength);
  }

  const keywords = extractContextKeywords(candidates);
  const topic = candidates.find((candidate, index) => index < 5 && candidate.length <= 140);
  const forcedImportant = candidates.filter(isConclusionContextCandidate).slice(-2);
  const selected = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreContextCandidate(candidate, index, keywords)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .reduce((items, item) => {
      const limit = maxLength < 350 ? 3 : maxLength < 900 ? 5 : 7;
      if (items.length >= limit) return items;
      if (!isNearDuplicateContext(item.candidate, items.map((selectedItem) => selectedItem.candidate))) {
        items.push(item);
      }
      return items;
    }, [])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.candidate);

  const importantSelected = selected.filter(isImportantContextCandidate);
  const regularSelected = selected.filter((candidate) => !isImportantContextCandidate(candidate));
  const prioritized = uniqueContextCandidates([...forcedImportant, ...importantSelected, ...regularSelected]);
  const bodyParts = topic ? prioritized.filter((candidate) => !isNearDuplicateContext(candidate, [topic])) : prioritized;
  const body = bodyParts.join(" ") || candidates.slice(0, 3).join(" ");
  const keywordText = [...keywords.keys()].slice(0, 5).join(", ");
  const topicText = topic ? `주제: ${topic}. ` : "";
  const keywordPrefix = keywordText ? `핵심 키워드: ${keywordText}. ` : "";

  return clipContextSummary(`요약: ${topicText}${keywordPrefix}${body}`, maxLength);
}

function getMessageContextText(message) {
  if (shouldCompactMessage(message)) {
    if (message.contextText?.trim()) return message.contextText.trim();
    return createCompressedContextText(message.text);
  }
  return message.text;
}

function toRequestMessage(message) {
  const requestMessage = {
    role: message.role,
    text: getMessageContextText(message)
  };

  if (shouldCompactMessage(message)) {
    requestMessage.compressed = true;
  }
  return requestMessage;
}

function applyCompressedContextText(message) {
  if (shouldCompactMessage(message)) {
    message.contextText = createCompressedContextText(message.text);
    return true;
  }

  delete message.contextText;
  return false;
}

function getConversationMessages(room) {
  return room.messages.filter((message) => !message.pending && (message.role === "user" || message.role === "model"));
}

function getRequestMessages(room) {
  const messages = getConversationMessages(room);
  if (!messages.length) return [];

  const currentMessage = messages.at(-1);
  if (!state.settings.includeHistory) return [toRequestMessage(currentMessage)];

  const historyLimit = normalizeHistoryMessageLimit(state.settings.historyMessageLimit);
  const previousMessages = messages.slice(0, -1).slice(-historyLimit);
  return [...previousMessages, currentMessage].map(toRequestMessage);
}

function getPreviewRequestMessages(room, draftText) {
  const historyMessages = getConversationMessages(room);
  const draft = draftText.trim();

  if (!state.settings.includeHistory) {
    return draft ? [{ role: "user", text: draft }] : [];
  }

  const historyLimit = normalizeHistoryMessageLimit(state.settings.historyMessageLimit);
  const messages = historyMessages.slice(-historyLimit).map(toRequestMessage);
  if (draft) {
    messages.push({ role: "user", text: draft });
  }
  return messages;
}

function createGeminiRequestPayload(room, messages) {
  const payload = {
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature: state.settings.temperature,
      maxOutputTokens: state.settings.maxOutputTokens
    }
  };
  const instruction = getRoomInstruction(room);
  if (instruction) {
    payload.systemInstruction = {
      parts: [{ text: instruction }]
    };
  }
  return payload;
}

function createGroqRequestPayload(room, messages) {
  const instruction = getRoomInstruction(room);
  const requestMessages = toGroqMessages(messages);
  if (instruction) {
    requestMessages.unshift({ role: "system", content: instruction });
  }

  return {
    model: room.model,
    messages: requestMessages,
    temperature: state.settings.temperature,
    max_completion_tokens: state.settings.maxOutputTokens
  };
}

function createRequestPayload(provider, room, messages) {
  return getValidProvider(provider) === "groq"
    ? createGroqRequestPayload(room, messages)
    : createGeminiRequestPayload(room, messages);
}

function getPayloadByteSize(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

function getRequestPayloadStats(provider, room, messages) {
  const payload = createRequestPayload(provider, room, messages);
  const bytes = getPayloadByteSize(payload);
  return {
    bytes,
    size: formatByteSize(bytes)
  };
}

function formatByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const value = bytes / 1024;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function renderContextSize() {
  const room = getActiveRoom();
  const messages = getPreviewRequestMessages(room, els.messageInput.value);
  const stats = getRequestPayloadStats(room.provider, room, messages);
  const mode = state.settings.includeHistory ? `이전 최대 ${state.settings.historyMessageLimit}개` : "현재 메시지만";
  const instructionMeta = getRoomInstruction(room) ? " · 지침 포함" : "";
  const compressedCount = messages.filter((message) => message.compressed).length;
  const compressedMeta = compressedCount ? ` · 압축 ${compressedCount}개` : "";

  els.contextSizeText.textContent = `전송 예상: ${messages.length}개 메시지 · ${stats.size} · ${mode}${instructionMeta}${compressedMeta}`;
  els.contextSizeText.dataset.tone = stats.bytes > 512 * 1024 ? "warning" : "neutral";
}

function renderModelPolicy() {
  const room = getActiveRoom();
  const parts = [
    getRoomInstruction(room) ? "지침 포함" : "지침 없음",
    state.settings.includeHistory ? `이전 최대 ${state.settings.historyMessageLimit}개` : "현재 메시지만",
    state.settings.compactLargeResponses ? `압축 ${state.settings.compactResponseThreshold}자 이상` : "압축 꺼짐"
  ];
  els.modelPolicyText.textContent = parts.join(" · ");
}

function extractGeminiText(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("\n").trim();
  return text || "응답 텍스트가 비어 있습니다.";
}

function extractGroqText(data) {
  return data.choices?.[0]?.message?.content?.trim() || "응답 텍스트가 비어 있습니다.";
}

function extractResponseText(provider, data) {
  return getValidProvider(provider) === "groq" ? extractGroqText(data) : extractGeminiText(data);
}

function createAbortError() {
  const error = new Error("요청이 취소되었습니다.");
  error.name = "AbortError";
  return error;
}

function isHighDemandError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("currently experiencing high demand") ||
    message.includes("spikes in demand") ||
    message.includes("please try again later") ||
    message.includes("model is overloaded") ||
    (error?.status === 503 && message.includes("temporar"))
  );
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, ms);
    const abort = () => {
      window.clearTimeout(timeoutId);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", abort, { once: true });
    window.setTimeout(() => signal?.removeEventListener("abort", abort), ms);
  });
}

async function waitBeforeRetry(delayMs, retryNumber, maxRetries, pending, signal) {
  const startedAt = Date.now();
  let remainingMs = delayMs;

  while (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    pending.text = `다시 요청합니다.\n${seconds}초 후 자동으로 다시 요청합니다. (${retryNumber}/${maxRetries})`;
    setStatus(`모델 사용량이 높아 ${seconds}초 후 다시 요청합니다. (${retryNumber}/${maxRetries})`);
    renderMessages();

    await wait(Math.min(1000, remainingMs), signal);
    remainingMs = delayMs - (Date.now() - startedAt);
  }
}

async function requestGeminiResponse(room, key, messages, signal) {
  const endpointModel = room.model.replace(/[^a-zA-Z0-9_.\/-]/g, "");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${endpointModel}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createGeminiRequestPayload(room, messages)),
    signal
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini 요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function requestGroqResponse(room, key, messages, signal) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(createGroqRequestPayload(room, messages)),
    signal
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.error?.message || "Groq 요청에 실패했습니다.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function requestModelResponse(room, key, messages, signal) {
  return getValidProvider(room.provider) === "groq"
    ? requestGroqResponse(room, key, messages, signal)
    : requestGeminiResponse(room, key, messages, signal);
}

async function sendMessage(event) {
  event.preventDefault();

  if (activeRequest) {
    abortActiveRequest();
    return;
  }

  if (isComposingMessage) {
    els.messageInput.focus();
    setStatus("한글 입력을 확정한 뒤 전송하세요.");
    return;
  }

  const room = getActiveRoom();
  const provider = getValidProvider(room.provider);
  const key = getApiKey(provider);
  const text = els.messageInput.value.trim();

  if (!key) {
    setStatus(`${getProviderLabel(provider)} API 키를 입력하세요.`, "error");
    (provider === "groq" ? els.groqApiKeyInput : els.apiKeyInput).focus();
    openSettingsOnSmallScreen();
    return;
  }

  if (!text || activeRequest) return;

  persistApiKeys();
  room.messages.push(createMessage("user", text));
  const pending = createMessage("model", "응답을 기다리는 중입니다.", { pending: true });
  room.messages.push(pending);
  room.updatedAt = Date.now();
  clearComposerInput();
  render();
  await processRoomRequest(room, pending.id);
}

async function processRoomRequest(room, pendingId) {
  const provider = getValidProvider(room.provider);
  const key = getApiKey(provider);
  if (!key) {
    const pending = room.messages.find((message) => message.id === pendingId);
    if (pending) {
      pending.role = "error";
      pending.pending = false;
      pending.text = `${getProviderLabel(provider)} API 키를 입력하세요.`;
    }
    setStatus(`${getProviderLabel(provider)} API 키를 입력하세요.`, "error");
    render();
    return;
  }

  const requestMessages = getRequestMessages(room);
  const requestStats = getRequestPayloadStats(provider, room, requestMessages);
  const controller = new AbortController();
  activeRequest = { controller, roomId: room.id, pendingId };
  renderSendButtonState();
  setStatus(`${getProviderLabel(provider)} ${formatModelLabel(room.model)} 응답 생성 중입니다. 전송 ${requestStats.size}.`);

  try {
    const pending = room.messages.find((message) => message.id === pendingId);
    let data = null;

    for (let retryIndex = 0; retryIndex <= HIGH_DEMAND_RETRY_DELAYS_MS.length; retryIndex += 1) {
      try {
        if (retryIndex > 0 && pending) {
          pending.text = `다시 요청합니다.\n${getProviderLabel(provider)}에 재요청 중입니다.`;
          renderMessages();
        }
        data = await requestModelResponse(room, key, requestMessages, controller.signal);
        break;
      } catch (error) {
        const canRetry = retryIndex < HIGH_DEMAND_RETRY_DELAYS_MS.length && isHighDemandError(error);
        if (!canRetry || !pending) throw error;

        await waitBeforeRetry(
          HIGH_DEMAND_RETRY_DELAYS_MS[retryIndex],
          retryIndex + 1,
          HIGH_DEMAND_RETRY_DELAYS_MS.length,
          pending,
          controller.signal
        );
      }
    }

    if (pending) {
      pending.pending = false;
      pending.text = extractResponseText(provider, data);
      const compressed = applyCompressedContextText(pending);
      if (compressed) {
        setStatus("응답을 받았습니다. 큰 응답은 다음 요청용 압축본도 저장했습니다.", "success");
      } else {
        setStatus("응답을 받았습니다.", "success");
      }
    }
  } catch (error) {
    const pending = room.messages.find((message) => message.id === pendingId);
    if (pending) {
      pending.role = "error";
      pending.pending = false;
      pending.text = error.name === "AbortError" ? "요청이 취소되었습니다." : error.message;
    }
    setStatus(error.name === "AbortError" ? "요청이 취소되었습니다." : error.message, "error");
  } finally {
    activeRequest = null;
    renderSendButtonState();
    room.updatedAt = Date.now();
    render();
  }
}

function abortActiveRequest() {
  if (!activeRequest) return;
  activeRequest.controller.abort();
}

function renderSendButtonState() {
  const icon = els.sendButton.querySelector("span");
  if (activeRequest) {
    els.sendButton.disabled = false;
    els.sendButton.setAttribute("aria-label", "요청 중지");
    els.sendButton.title = "요청 중지";
    icon.textContent = "■";
  } else {
    els.sendButton.disabled = false;
    els.sendButton.setAttribute("aria-label", "보내기");
    els.sendButton.title = "보내기";
    icon.textContent = "↑";
  }
}

function resizeComposer() {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 170)}px`;
}

function handleMessageInput() {
  resizeComposer();
  renderContextSize();
}

function clearComposerInput() {
  els.messageInput.value = "";
  resizeComposer();
  renderContextSize();
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    els.messageStream.scrollTop = els.messageStream.scrollHeight;
    updateScrollMinimapThumb();
  });
}

function renderScrollMinimap() {
  const room = getActiveRoom();
  els.scrollMinimapTrack.innerHTML = "";

  const messages = room.messages;
  if (!messages.length) {
    updateScrollMinimapThumb();
    return;
  }

  messages.forEach((message, index) => {
    const compressed = Boolean(message.contextText && shouldCompactMessage(message));
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `minimap-marker ${message.role}${compressed ? " compressed" : ""}`;
    marker.dataset.messageId = message.id;
    marker.style.top = `${messages.length === 1 ? 50 : (index / (messages.length - 1)) * 100}%`;
    marker.title = message.role === "user" ? "사용자 메시지" : message.role === "error" ? "오류 메시지" : compressed ? "AI 응답, 압축됨" : "AI 응답";
    els.scrollMinimapTrack.append(marker);
  });

  updateScrollMinimapThumb();
}

function updateScrollMinimapThumb() {
  const stream = els.messageStream;
  const maxScroll = stream.scrollHeight - stream.clientHeight;
  if (maxScroll <= 0) {
    els.scrollMinimapThumb.style.height = "100%";
    els.scrollMinimapThumb.style.top = "0%";
    return;
  }

  const thumbHeight = Math.max(10, (stream.clientHeight / stream.scrollHeight) * 100);
  const top = (stream.scrollTop / maxScroll) * (100 - thumbHeight);
  els.scrollMinimapThumb.style.height = `${thumbHeight}%`;
  els.scrollMinimapThumb.style.top = `${top}%`;
}

function scrollToMessage(messageId) {
  const target = els.messageStream.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
}

function toggleLeftPanel() {
  state.ui.leftCollapsed = !state.ui.leftCollapsed;
  renderUiState();
  saveState();
}

function toggleRightPanel() {
  state.ui.rightCollapsed = !state.ui.rightCollapsed;
  renderUiState();
  saveState();
}

function openRooms() {
  els.sidebar.classList.add("open");
  els.overlay.hidden = false;
}

function openSettings() {
  els.settingsPanel.classList.add("open");
  els.overlay.hidden = false;
}

function openSettingsOnSmallScreen() {
  if (window.matchMedia("(max-width: 980px)").matches) openSettings();
}

function closeMobilePanels() {
  els.sidebar.classList.remove("open");
  els.settingsPanel.classList.remove("open");
  els.overlay.hidden = true;
}

els.newRoomButton.addEventListener("click", addRoom);
els.deleteRoomButton.addEventListener("click", deleteActiveRoom);
els.shareRoomButton.addEventListener("click", shareActiveRoom);
els.toggleSidebarButton.addEventListener("click", toggleLeftPanel);
els.toggleSettingsPanelButton.addEventListener("click", toggleRightPanel);
els.closeShareDialogButton.addEventListener("click", closeShareDialog);
els.closeDetailDialogButton.addEventListener("click", closeDetailDialog);
els.saveDetailTextButton.addEventListener("click", saveDetailDialogText);
els.regenerateDetailTextButton.addEventListener("click", regenerateDetailDialogText);
els.copyDetailTextButton.addEventListener("click", async () => {
  try {
    await copyTextToClipboard(els.detailTextOutput.value);
    closeDetailDialog();
    setStatus("내용을 복사했습니다.", "success");
  } catch {
    els.detailTextOutput.focus();
    els.detailTextOutput.select();
    setStatus("복사가 차단되어 텍스트를 직접 선택했습니다.", "error");
  }
});
els.copyShareTextButton.addEventListener("click", async () => {
  try {
    await copyTextToClipboard(els.shareTextOutput.value);
    closeShareDialog();
    setStatus("대화 내용을 복사했습니다.", "success");
  } catch {
    els.shareTextOutput.focus();
    els.shareTextOutput.select();
    setStatus("복사가 차단되어 텍스트를 직접 선택했습니다.", "error");
  }
});
els.openInstructionButton.addEventListener("click", openInstructionDialog);
els.closeInstructionDialogButton.addEventListener("click", closeInstructionDialog);
els.saveInstructionButton.addEventListener("click", saveRoomInstruction);
els.clearInstructionButton.addEventListener("click", clearRoomInstruction);

els.messageStream.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  await handleMessageAction(actionButton.dataset.action, actionButton.dataset.messageId);
});

els.scrollMinimapTrack.addEventListener("click", (event) => {
  const marker = event.target.closest(".minimap-marker");
  if (marker) {
    scrollToMessage(marker.dataset.messageId);
    return;
  }

  const rect = els.scrollMinimapTrack.getBoundingClientRect();
  const ratio = clampNumber((event.clientY - rect.top) / rect.height, 0, 1);
  const maxScroll = els.messageStream.scrollHeight - els.messageStream.clientHeight;
  els.messageStream.scrollTo({ top: maxScroll * ratio, behavior: "smooth" });
});

els.messageStream.addEventListener("scroll", updateScrollMinimapThumb);

els.roomList.addEventListener("click", (event) => {
  const pinButton = event.target.closest(".room-pin");
  if (pinButton) {
    event.preventDefault();
    event.stopPropagation();
    const roomButton = event.target.closest(".room-item");
    if (roomButton) toggleRoomPinned(roomButton.dataset.roomId);
    return;
  }

  const roomButton = event.target.closest(".room-item");
  if (roomButton) switchRoom(roomButton.dataset.roomId);
});

els.roomSearchInput.addEventListener("input", (event) => {
  state.ui.roomSearch = event.target.value;
  renderRooms();
  saveState();
});

els.roomSortSelect.addEventListener("change", (event) => {
  state.ui.roomSort = event.target.value === "name" ? "name" : "recent";
  renderRooms();
  saveState();
});

els.roomTitleInput.addEventListener("change", (event) => updateRoomTitle(event.target.value));
els.roomTitleInput.addEventListener("blur", (event) => updateRoomTitle(event.target.value));
els.roomTitleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.roomTitleInput.blur();
  }
});
els.editRoomTitleButton.addEventListener("click", focusRoomTitle);
els.roomProviderSelect.addEventListener("change", (event) => updateRoomProvider(event.target.value));
els.roomModelSelect.addEventListener("change", (event) => updateRoomModel(event.target.value));
els.defaultProviderSelect.addEventListener("change", (event) => updateDefaultProvider(event.target.value));
els.defaultModelSelect.addEventListener("change", (event) => updateDefaultModel(event.target.value));
els.composer.addEventListener("submit", sendMessage);
els.sendButton.addEventListener("click", (event) => {
  if (!activeRequest) return;
  event.preventDefault();
  abortActiveRequest();
});
els.messageInput.addEventListener("input", handleMessageInput);
els.messageInput.addEventListener("compositionstart", () => {
  isComposingMessage = true;
});
els.messageInput.addEventListener("compositionend", () => {
  isComposingMessage = false;
  resizeComposer();
  renderContextSize();
});
els.messageInput.addEventListener("keydown", (event) => {
  const isImeConfirming = event.isComposing || isComposingMessage || event.keyCode === 229;
  if (event.key === "Enter" && !event.shiftKey && !isImeConfirming) {
    event.preventDefault();
    els.composer.requestSubmit();
  }
});
els.messageInput.addEventListener("blur", () => {
  isComposingMessage = false;
});

els.temperatureInput.addEventListener("input", (event) => {
  state.settings.temperature = Number(event.target.value);
  els.temperatureValue.textContent = event.target.value;
  renderContextSize();
  saveState();
});

els.maxTokensInput.addEventListener("change", (event) => {
  state.settings.maxOutputTokens = Number(event.target.value);
  renderContextSize();
  saveState();
});

els.includeHistoryInput.addEventListener("change", (event) => updateIncludeHistory(event.target.checked));
els.openPayloadPreviewButton.addEventListener("click", openPayloadPreview);
els.openStoragePolicyButton.addEventListener("click", openStoragePolicy);
els.historyLimitInput.addEventListener("change", (event) => updateHistoryMessageLimit(event.target.value));
els.historyLimitInput.addEventListener("input", (event) => {
  const value = normalizeHistoryMessageLimit(event.target.value);
  state.settings.historyMessageLimit = value;
  els.historyLimitValue.textContent = String(value);
  renderContextSize();
  renderModelPolicy();
});
els.compactResponsesInput.addEventListener("change", (event) => updateCompactLargeResponses(event.target.checked));
els.compactThresholdInput.addEventListener("change", (event) => updateCompactResponseThreshold(event.target.value));
els.compactThresholdInput.addEventListener("input", (event) => {
  const value = normalizeCompactResponseThreshold(event.target.value);
  state.settings.compactResponseThreshold = value;
  els.compactThresholdValue.textContent = `${value}자`;
  renderContextSize();
  renderModelPolicy();
});
els.compactLengthInput.addEventListener("change", (event) => updateCompactResponseLength(event.target.value));
els.compactLengthInput.addEventListener("input", (event) => {
  const value = normalizeCompactResponseLength(event.target.value);
  state.settings.compactResponseLength = value;
  els.compactLengthValue.textContent = `${value}자`;
  renderContextSize();
});

els.themeSelect.addEventListener("change", (event) => updateTheme(event.target.value));

els.chatFontSizeInput.addEventListener("input", (event) => {
  state.ui.chatFontSize = clampNumber(Number(event.target.value), 14, 22);
  els.chatFontSizeValue.textContent = `${state.ui.chatFontSize}px`;
  renderUiState();
  scrollMessagesToBottom();
  saveState();
});

els.apiKeyInput.addEventListener("change", () => persistProviderApiKey("gemini"));
els.groqApiKeyInput.addEventListener("change", () => persistProviderApiKey("groq"));
els.rememberKeyInput.addEventListener("change", () => persistProviderApiKey("gemini"));
els.rememberGroqKeyInput.addEventListener("change", () => persistProviderApiKey("groq"));
els.clearGeminiKeyButton.addEventListener("click", () => clearProviderApiKey("gemini"));
els.clearGroqKeyButton.addEventListener("click", () => clearProviderApiKey("groq"));
els.loadModelsButton.addEventListener("click", loadModels);

els.toggleKeyButton.addEventListener("click", () => {
  const visible = els.apiKeyInput.type === "text";
  els.apiKeyInput.type = visible ? "password" : "text";
  els.toggleKeyButton.textContent = visible ? "보기" : "숨김";
});

els.toggleGroqKeyButton.addEventListener("click", () => {
  const visible = els.groqApiKeyInput.type === "text";
  els.groqApiKeyInput.type = visible ? "password" : "text";
  els.toggleGroqKeyButton.textContent = visible ? "보기" : "숨김";
});

els.openRoomsButton.addEventListener("click", openRooms);
els.openSettingsButton.addEventListener("click", openSettings);
els.overlay.addEventListener("click", closeMobilePanels);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobilePanels();
    closeShareDialog();
    closeDetailDialog();
    closeInstructionDialog();
  }
});

async function initializeApp() {
  loadSavedApiKey();
  state = await loadState();
  render();
  resizeComposer();
  renderSendButtonState();
}

initializeApp().catch((error) => {
  console.error(error);
  state = normalizeState(null);
  loadSavedApiKey();
  render();
  resizeComposer();
  renderSendButtonState();
  setStatus("로컬 DB를 열지 못해 임시 상태로 시작했습니다.", "error");
});
