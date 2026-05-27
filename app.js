import { renderMarkdown } from "./markdown.js";

const LEGACY_STORAGE_KEY = "gemini-chat-rooms:v1";
const API_KEY_STORAGE = "gemini-chat-api-key:v1";
const DB_NAME = "gemini-chat-local-db";
const DB_VERSION = 1;
const DB_STORE = "keyValue";
const DB_STATE_KEY = "app-state:v1";
const HIGH_DEMAND_RETRY_DELAYS_MS = [3000, 6000, 10000];
const DEFAULT_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-2.0-flash",
  "models/gemini-1.5-flash",
  "models/gemini-1.5-pro"
];

const els = {
  appShell: document.querySelector("#appShell"),
  roomList: document.querySelector("#roomList"),
  newRoomButton: document.querySelector("#newRoomButton"),
  toggleSidebarButton: document.querySelector("#toggleSidebarButton"),
  toggleSettingsPanelButton: document.querySelector("#toggleSettingsPanelButton"),
  roomTitleInput: document.querySelector("#roomTitleInput"),
  roomMeta: document.querySelector("#roomMeta"),
  roomModelSelect: document.querySelector("#roomModelSelect"),
  shareRoomButton: document.querySelector("#shareRoomButton"),
  deleteRoomButton: document.querySelector("#deleteRoomButton"),
  messageStream: document.querySelector("#messageStream"),
  composer: document.querySelector("#composer"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  toggleKeyButton: document.querySelector("#toggleKeyButton"),
  rememberKeyInput: document.querySelector("#rememberKeyInput"),
  loadModelsButton: document.querySelector("#loadModelsButton"),
  defaultModelSelect: document.querySelector("#defaultModelSelect"),
  temperatureInput: document.querySelector("#temperatureInput"),
  temperatureValue: document.querySelector("#temperatureValue"),
  maxTokensInput: document.querySelector("#maxTokensInput"),
  chatFontSizeInput: document.querySelector("#chatFontSizeInput"),
  chatFontSizeValue: document.querySelector("#chatFontSizeValue"),
  statusText: document.querySelector("#statusText"),
  openRoomsButton: document.querySelector("#openRoomsButton"),
  openSettingsButton: document.querySelector("#openSettingsButton"),
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

function createRoom(name = "새 채팅방") {
  return {
    id: crypto.randomUUID(),
    title: name,
    model: state?.settings?.defaultModel || DEFAULT_MODELS[0],
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createDefaultState() {
  return {
    activeRoomId: "",
    models: DEFAULT_MODELS,
    settings: {
      defaultModel: DEFAULT_MODELS[0],
      temperature: 0.7,
      maxOutputTokens: 2048
    },
    ui: {
      leftCollapsed: false,
      rightCollapsed: false,
      chatFontSize: 16
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

  if (!Array.isArray(initialState.rooms) || initialState.rooms.length === 0) {
    const firstRoom = {
      id: crypto.randomUUID(),
      title: "첫 채팅방",
      model: initialState.settings.defaultModel || DEFAULT_MODELS[0],
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    initialState.rooms = [firstRoom];
    initialState.activeRoomId = firstRoom.id;
  }

  initialState.models = normalizeModels(initialState.models);
  initialState.settings = {
    defaultModel: initialState.settings?.defaultModel || initialState.models[0],
    temperature: Number(initialState.settings?.temperature ?? 0.7),
    maxOutputTokens: Number(initialState.settings?.maxOutputTokens ?? 2048)
  };
  initialState.ui = {
    leftCollapsed: Boolean(initialState.ui?.leftCollapsed),
    rightCollapsed: Boolean(initialState.ui?.rightCollapsed),
    chatFontSize: clampNumber(Number(initialState.ui?.chatFontSize ?? 16), 14, 22)
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

function normalizeModels(models) {
  const merged = Array.from(new Set([...(models || []), ...DEFAULT_MODELS]));
  return merged.filter(Boolean);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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

function setStatus(message, tone = "neutral") {
  els.statusText.textContent = message;
  els.statusText.dataset.tone = tone;
}

function formatModelLabel(modelName) {
  return modelName.replace(/^models\//, "");
}

function renderModelOptions(select, selectedModel) {
  select.innerHTML = "";
  state.models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = formatModelLabel(model);
    option.selected = model === selectedModel;
    select.append(option);
  });
}

function renderRooms() {
  const activeRoom = getActiveRoom();
  els.roomList.innerHTML = "";

  [...state.rooms]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((room) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `room-item${room.id === activeRoom.id ? " active" : ""}`;
      button.dataset.roomId = room.id;

      const lastMessage = room.messages.at(-1)?.text || "새 대화";
      const count = room.messages.length;
      button.innerHTML = `
        <span>
          <span class="room-name"></span>
          <span class="room-subtitle"></span>
        </span>
        <span class="room-count">${count}</span>
      `;
      button.querySelector(".room-name").textContent = room.title;
      button.querySelector(".room-subtitle").textContent = lastMessage;
      els.roomList.append(button);
    });
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
    scrollMessagesToBottom();
    return;
  }

  room.messages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `message ${message.role}${message.pending ? " pending" : ""}`;

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = message.role === "user" ? "You" : message.role === "error" ? "Error" : "Gemini";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.role === "model" && !message.pending) {
      bubble.classList.add("markdown-body");
      bubble.innerHTML = renderMarkdown(message.text);
    } else {
      bubble.textContent = message.text;
    }

    article.append(label, bubble);
    els.messageStream.append(article);
  });

  scrollMessagesToBottom();
}

function renderHeader() {
  const room = getActiveRoom();
  els.roomTitleInput.value = room.title;
  const userCount = room.messages.filter((message) => message.role === "user").length;
  els.roomMeta.textContent = `${room.messages.length} messages · ${userCount} turns`;
  renderModelOptions(els.roomModelSelect, room.model);
}

function renderSettings() {
  renderModelOptions(els.defaultModelSelect, state.settings.defaultModel);
  els.temperatureInput.value = state.settings.temperature;
  els.temperatureValue.textContent = String(state.settings.temperature);
  els.maxTokensInput.value = state.settings.maxOutputTokens;
  els.chatFontSizeInput.value = state.ui.chatFontSize;
  els.chatFontSizeValue.textContent = `${state.ui.chatFontSize}px`;
}

function renderUiState() {
  els.appShell.classList.toggle("left-collapsed", state.ui.leftCollapsed);
  els.appShell.classList.toggle("right-collapsed", state.ui.rightCollapsed);
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

function updateRoomModel(model) {
  const room = getActiveRoom();
  room.model = model;
  room.updatedAt = Date.now();
  renderRooms();
  saveState();
}

function updateDefaultModel(model) {
  state.settings.defaultModel = model;
  saveState();
}

function formatMessageRole(role) {
  if (role === "user") return "나";
  if (role === "error") return "오류";
  return "Gemini";
}

function buildShareText(room) {
  const messages = room.messages.filter((message) => !message.pending);
  if (!messages.length) return "";

  const lines = [
    room.title,
    `모델: ${formatModelLabel(room.model)}`,
    "",
    ...messages.flatMap((message) => [`[${formatMessageRole(message.role)}]`, message.text.trim(), ""])
  ];

  return lines.join("\n").trim();
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

function getApiKey() {
  return els.apiKeyInput.value.trim();
}

function persistApiKey() {
  const key = getApiKey();
  if (!key) {
    localStorage.removeItem(API_KEY_STORAGE);
    sessionStorage.removeItem(API_KEY_STORAGE);
    return;
  }

  if (els.rememberKeyInput.checked && key) {
    localStorage.setItem(API_KEY_STORAGE, key);
    sessionStorage.removeItem(API_KEY_STORAGE);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
    sessionStorage.setItem(API_KEY_STORAGE, key);
  }
}

function loadSavedApiKey() {
  const localKey = localStorage.getItem(API_KEY_STORAGE);
  const sessionKey = sessionStorage.getItem(API_KEY_STORAGE);
  const key = localKey || sessionKey || "";
  els.apiKeyInput.value = key;
  els.rememberKeyInput.checked = Boolean(localKey);
}

async function loadModels() {
  const key = getApiKey();
  if (!key) {
    setStatus("모델을 불러오려면 API 키가 필요합니다.", "error");
    els.apiKeyInput.focus();
    return;
  }

  els.loadModelsButton.disabled = true;
  setStatus("모델 목록을 불러오는 중입니다.");

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "모델 목록을 불러오지 못했습니다.");
    }

    const models = (data.models || [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => model.name)
      .sort();

    if (!models.length) {
      throw new Error("generateContent를 지원하는 모델이 없습니다.");
    }

    state.models = normalizeModels(models);
    if (!state.models.includes(state.settings.defaultModel)) {
      state.settings.defaultModel = state.models[0];
    }
    state.rooms.forEach((room) => {
      if (!state.models.includes(room.model)) room.model = state.settings.defaultModel;
    });

    persistApiKey();
    setStatus(`${models.length}개 모델을 불러왔습니다.`, "success");
    render();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    els.loadModelsButton.disabled = false;
  }
}

function toGeminiContents(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "model")
    .map((message) => ({
      role: message.role,
      parts: [{ text: message.text }]
    }));
}

function extractGeminiText(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("\n").trim();
  return text || "응답 텍스트가 비어 있습니다.";
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

async function requestGeminiResponse(room, key, signal) {
  const endpointModel = room.model.replace(/[^a-zA-Z0-9_.\/-]/g, "");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${endpointModel}:generateContent?key=${encodeURIComponent(key)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: toGeminiContents(room.messages.filter((message) => !message.pending)),
      generationConfig: {
        temperature: state.settings.temperature,
        maxOutputTokens: state.settings.maxOutputTokens
      }
    }),
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

async function sendMessage(event) {
  event.preventDefault();

  if (isComposingMessage) {
    els.messageInput.focus();
    setStatus("한글 입력을 확정한 뒤 전송하세요.");
    return;
  }

  const key = getApiKey();
  const text = els.messageInput.value.trim();
  const room = getActiveRoom();

  if (!key) {
    setStatus("API 키를 입력하세요.", "error");
    els.apiKeyInput.focus();
    openSettingsOnSmallScreen();
    return;
  }

  if (!text || activeRequest) return;

  persistApiKey();
  room.messages.push({ role: "user", text, createdAt: Date.now() });
  room.messages.push({ role: "model", text: "응답을 기다리는 중입니다.", pending: true, createdAt: Date.now() });
  room.updatedAt = Date.now();
  clearComposerInput();
  render();

  const controller = new AbortController();
  activeRequest = controller;
  els.sendButton.disabled = true;
  setStatus(`${formatModelLabel(room.model)} 응답 생성 중입니다.`);

  try {
    const pending = room.messages.findLast((message) => message.pending);
    let data = null;

    for (let retryIndex = 0; retryIndex <= HIGH_DEMAND_RETRY_DELAYS_MS.length; retryIndex += 1) {
      try {
        if (retryIndex > 0 && pending) {
          pending.text = "다시 요청합니다.\nGemini에 재요청 중입니다.";
          renderMessages();
        }
        data = await requestGeminiResponse(room, key, controller.signal);
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
      pending.text = extractGeminiText(data);
    }
    setStatus("응답을 받았습니다.", "success");
  } catch (error) {
    const pending = room.messages.findLast((message) => message.pending);
    if (pending) {
      pending.role = "error";
      pending.pending = false;
      pending.text = error.name === "AbortError" ? "요청이 취소되었습니다." : error.message;
    }
    setStatus(error.name === "AbortError" ? "요청이 취소되었습니다." : error.message, "error");
  } finally {
    activeRequest = null;
    els.sendButton.disabled = false;
    room.updatedAt = Date.now();
    render();
  }
}

function resizeComposer() {
  els.messageInput.style.height = "auto";
  els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 170)}px`;
}

function clearComposerInput() {
  els.messageInput.value = "";
  resizeComposer();
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    els.messageStream.scrollTop = els.messageStream.scrollHeight;
  });
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

els.roomList.addEventListener("click", (event) => {
  const roomButton = event.target.closest(".room-item");
  if (roomButton) switchRoom(roomButton.dataset.roomId);
});

els.roomTitleInput.addEventListener("change", (event) => updateRoomTitle(event.target.value));
els.roomTitleInput.addEventListener("blur", (event) => updateRoomTitle(event.target.value));
els.roomModelSelect.addEventListener("change", (event) => updateRoomModel(event.target.value));
els.defaultModelSelect.addEventListener("change", (event) => updateDefaultModel(event.target.value));
els.composer.addEventListener("submit", sendMessage);
els.messageInput.addEventListener("input", resizeComposer);
els.messageInput.addEventListener("compositionstart", () => {
  isComposingMessage = true;
});
els.messageInput.addEventListener("compositionend", () => {
  isComposingMessage = false;
  resizeComposer();
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
  saveState();
});

els.maxTokensInput.addEventListener("change", (event) => {
  state.settings.maxOutputTokens = Number(event.target.value);
  saveState();
});

els.chatFontSizeInput.addEventListener("input", (event) => {
  state.ui.chatFontSize = clampNumber(Number(event.target.value), 14, 22);
  els.chatFontSizeValue.textContent = `${state.ui.chatFontSize}px`;
  renderUiState();
  scrollMessagesToBottom();
  saveState();
});

els.apiKeyInput.addEventListener("change", persistApiKey);
els.rememberKeyInput.addEventListener("change", persistApiKey);
els.loadModelsButton.addEventListener("click", loadModels);

els.toggleKeyButton.addEventListener("click", () => {
  const visible = els.apiKeyInput.type === "text";
  els.apiKeyInput.type = visible ? "password" : "text";
  els.toggleKeyButton.textContent = visible ? "보기" : "숨김";
});

els.openRoomsButton.addEventListener("click", openRooms);
els.openSettingsButton.addEventListener("click", openSettings);
els.overlay.addEventListener("click", closeMobilePanels);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobilePanels();
    closeShareDialog();
  }
});

async function initializeApp() {
  loadSavedApiKey();
  state = await loadState();
  render();
  resizeComposer();
}

initializeApp().catch((error) => {
  console.error(error);
  state = normalizeState(null);
  loadSavedApiKey();
  render();
  resizeComposer();
  setStatus("로컬 DB를 열지 못해 임시 상태로 시작했습니다.", "error");
});
