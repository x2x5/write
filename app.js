"use strict";

const STORAGE_KEY = "prompt-card-layout-v2";
const PART_ONE_HEADING = /^#\s+Part I:\s*写作 Prompt 集合\s*$/;
const PART_TWO_HEADING = /^#\s+Part II:/;
const DEFAULT_COMMON_TITLES = [
  "中转英",
  "英转中",
  "表达润色（英文论文）",
  "实验分析",
];

const commonRoot = document.getElementById("commonRoot");
const poolRoot = document.getElementById("poolRoot");
const cardCount = document.getElementById("cardCount");
const cardTemplate = document.getElementById("cardTemplate");
const notice = document.getElementById("notice");
const noticeText = document.getElementById("noticeText");
const manualFile = document.getElementById("manualFile");
const manualLoadBtn = document.querySelector(".manual-load-btn");

let baseItems = [];
let allItems = [];
let draggingId = null;
const inputStore = new Map();
let state = createDefaultState();

init();

async function init() {
  const markdown = await tryReadReadme();
  if (!markdown) {
    render();
    return;
  }
  parseAndInit(markdown);
}

async function tryReadReadme() {
  try {
    const response = await fetch("./README.md", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("无法读取 README.md");
    }
    const text = await response.text();
    hideNotice();
    return text;
  } catch (error) {
    showNotice(
      "浏览器没有直接读取到 README.md。你可以点击下面按钮手动选择本地 README.md 文件。"
    );
    manualLoadBtn.classList.remove("hidden");
    return null;
  }
}

manualFile.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  const text = await file.text();
  parseAndInit(text);
});

commonRoot.addEventListener("dragover", (event) => {
  event.preventDefault();
});

commonRoot.addEventListener("drop", (event) => {
  if (!draggingId) {
    return;
  }
  const target = event.target instanceof Element ? event.target : null;
  const cardNode = target ? target.closest(".card") : null;
  if (cardNode && !cardNode.classList.contains("add-card")) {
    return;
  }
  moveCommonToEnd(draggingId);
});

function parseAndInit(markdown) {
  try {
    hideNotice();

    baseItems = parsePromptItems(markdown).map((item) => ({
      ...item,
      source: "base",
    }));
    state = normalizeState(loadState());
    refreshAllItems();

    state.commonIds = normalizeCommonIds(state.commonIds, allItems);
    if (state.commonIds.length === 0) {
      state.commonIds = buildDefaultCommonIds(allItems);
    }
    saveState();
    render();

    if (allItems.length === 0) {
      showNotice("没有解析到可用模板，请检查 README 的 Part I 和代码块格式。");
      manualLoadBtn.classList.remove("hidden");
    }
  } catch (error) {
    baseItems = [];
    allItems = [];
    state = createDefaultState();
    render();
    showNotice("解析 README 失败，请确认文件内容完整后重试。");
    manualLoadBtn.classList.remove("hidden");
  }
}

function parsePromptItems(markdown) {
  const partOne = extractPartOne(markdown);
  const sections = splitSections(partOne);

  return sections
    .map((section) => {
      const prompt = extractFenceBlocks(section.content).join("\n\n").trim();
      return {
        id: section.id,
        title: section.title,
        prompt,
      };
    })
    .filter((item) => item.prompt.length > 0);
}

function extractPartOne(markdown) {
  const lines = markdown.split(/\r?\n/);
  let inPartOne = false;
  const buffer = [];

  for (const line of lines) {
    if (!inPartOne) {
      if (PART_ONE_HEADING.test(line)) {
        inPartOne = true;
        buffer.push(line);
      }
      continue;
    }

    if (PART_TWO_HEADING.test(line)) {
      break;
    }
    buffer.push(line);
  }

  if (!inPartOne) {
    throw new Error("README.md 中未找到 Part I");
  }

  return buffer.join("\n");
}

function splitSections(partOneText) {
  const lines = partOneText.split(/\r?\n/);
  const sections = [];
  let current = null;
  let inFence = false;
  let fenceMarker = "";
  const usedIds = new Set();

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker.length >= fenceMarker.length) {
        inFence = false;
        fenceMarker = "";
      }
      if (current) {
        current.content.push(line);
      }
      continue;
    }

    if (!inFence) {
      const heading = line.match(/^##\s+(.+?)\s*$/);
      if (heading) {
        if (current) {
          sections.push(current);
        }
        const title = cleanTitle(heading[1]);
        current = {
          id: buildStableId(title, usedIds),
          title,
          content: [],
        };
        continue;
      }
    }

    if (current) {
      current.content.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function extractFenceBlocks(lines) {
  const blocks = [];
  let inFence = false;
  let fenceMarker = "";
  let buffer = [];

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        buffer = [];
      } else if (marker.length >= fenceMarker.length) {
        inFence = false;
        const block = buffer.join("\n").trim();
        if (block) {
          blocks.push(block);
        }
        fenceMarker = "";
        buffer = [];
      }
      continue;
    }

    if (inFence) {
      buffer.push(line);
    }
  }

  return blocks;
}

function cleanTitle(title) {
  return title
    .replace(/[💡🎯✨📖📑🤖📝🎉🔬🚀🤝]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStableId(title, usedIds) {
  const base =
    title
      .toLowerCase()
      .replace(/[()（）]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]/g, "") || "card";

  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let index = 2;
  while (usedIds.has(`${base}-${index}`)) {
    index += 1;
  }
  const id = `${base}-${index}`;
  usedIds.add(id);
  return id;
}

function render() {
  const itemMap = new Map(allItems.map((item) => [item.id, item]));
  const commonItems = state.commonIds.map((id) => itemMap.get(id)).filter(Boolean);
  const poolItems = allItems.filter((item) => !state.commonIds.includes(item.id));

  renderList(commonRoot, commonItems, "common");
  renderList(poolRoot, poolItems, "pool");

  cardCount.textContent = `总计 ${allItems.length} 张卡片，常用 ${commonItems.length}，卡片池 ${poolItems.length}`;
}

function renderList(root, items, zone) {
  root.innerHTML = "";
  const fragment = document.createDocumentFragment();

  if (zone === "common") {
    items.forEach((item, index) => {
      const card = createCard(item, zone, index);
      fragment.appendChild(card);
    });
    fragment.appendChild(createAddCardNode(items.length));
    root.appendChild(fragment);
    return;
  }

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-tip";
    empty.textContent = "卡片池暂无卡片";
    root.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const card = createCard(item, zone, index);
    fragment.appendChild(card);
  });
  root.appendChild(fragment);
}

function createCard(item, zone, index) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  node.style.setProperty("--delay", `${Math.min(index * 40, 520)}ms`);

  const title = node.querySelector(".card-title");
  const subtitle = node.querySelector(".card-subtitle");
  const input = node.querySelector(".card-input");
  const copyBtn = node.querySelector(".copy-btn");
  const toggleBtn = node.querySelector(".toggle-btn");
  const editBtn = node.querySelector(".edit-btn");
  const clearInputBtn = node.querySelector(".clear-input-btn");
  const deleteBtn = node.querySelector(".delete-btn");
  const status = node.querySelector(".copy-status");
  const preview = node.querySelector("pre");

  const editPanel = node.querySelector(".edit-panel");
  const editTitleInput = node.querySelector(".edit-title");
  const editPromptInput = node.querySelector(".edit-prompt");
  const saveEditBtn = node.querySelector(".save-edit-btn");
  const cancelEditBtn = node.querySelector(".cancel-edit-btn");

  title.textContent = item.title;
  subtitle.textContent =
    zone === "common" ? "常用卡片，可拖动排序" : "来自卡片池，加入常用后会显示在主页";
  preview.textContent = item.prompt;
  input.value = inputStore.get(item.id) || "";

  if (zone === "common") {
    node.setAttribute("draggable", "true");
    node.classList.add("draggable");
    bindDragEvents(node, item.id);
    toggleBtn.textContent = "移回卡片池";
    toggleBtn.classList.add("warning");
    deleteBtn.classList.add("hidden");
  } else {
    toggleBtn.textContent = "加入常用";
    toggleBtn.classList.add("secondary");
    deleteBtn.classList.remove("hidden");
  }

  input.addEventListener("input", () => {
    inputStore.set(item.id, input.value);
  });

  copyBtn.addEventListener("click", async () => {
    const content = mergePromptAndInput(item.prompt, input.value);
    try {
      await copyToClipboard(content);
      setStatus(status, "已复制到剪贴板", "success");
    } catch (error) {
      setStatus(status, "复制失败，请手动复制", "error");
    }
  });

  toggleBtn.addEventListener("click", () => {
    if (zone === "common") {
      removeFromCommon(item.id);
    } else {
      addToCommon(item.id);
    }
  });

  editBtn.addEventListener("click", () => {
    editTitleInput.value = item.title;
    editPromptInput.value = item.prompt;
    editPanel.classList.remove("hidden");
  });

  saveEditBtn.addEventListener("click", () => {
    const newTitle = editTitleInput.value.trim();
    const newPrompt = editPromptInput.value.trim();
    if (!newTitle || !newPrompt) {
      setStatus(status, "标题和模板内容不能为空", "error");
      return;
    }
    updateCard(item.id, newTitle, newPrompt);
  });

  cancelEditBtn.addEventListener("click", () => {
    editPanel.classList.add("hidden");
  });

  clearInputBtn.addEventListener("click", () => {
    input.value = "";
    inputStore.set(item.id, "");
    setStatus(status, "", "");
  });

  deleteBtn.addEventListener("click", () => {
    if (zone !== "pool") {
      return;
    }
    const ok = window.confirm(`确定删除卡片「${item.title}」吗？`);
    if (!ok) {
      return;
    }
    deleteCard(item.id);
  });

  return node;
}

function createAddCardNode(index) {
  const node = document.createElement("article");
  node.className = "card add-card";
  node.style.setProperty("--delay", `${Math.min(index * 40, 520)}ms`);
  node.innerHTML = `
    <div class="add-card-head">
      <h3>新增卡片</h3>
      <p>在常用区快速创建你的自定义模板卡片。</p>
    </div>
    <button class="open-add-btn" type="button">+ 新增卡片</button>
    <section class="add-form hidden">
      <label>
        标题
        <input class="add-title" type="text" placeholder="例如：英文润色（个人版）" />
      </label>
      <label>
        模板内容
        <textarea class="add-prompt" placeholder="粘贴你的模板内容..."></textarea>
      </label>
      <div class="add-form-actions">
        <button class="create-btn" type="button">创建卡片</button>
        <button class="cancel-btn" type="button">取消</button>
      </div>
      <p class="add-status"></p>
    </section>
  `;

  const openBtn = node.querySelector(".open-add-btn");
  const form = node.querySelector(".add-form");
  const titleInput = node.querySelector(".add-title");
  const promptInput = node.querySelector(".add-prompt");
  const createBtn = node.querySelector(".create-btn");
  const cancelBtn = node.querySelector(".cancel-btn");
  const addStatus = node.querySelector(".add-status");

  openBtn.addEventListener("click", () => {
    form.classList.remove("hidden");
    openBtn.classList.add("hidden");
    titleInput.focus();
  });

  cancelBtn.addEventListener("click", () => {
    form.classList.add("hidden");
    openBtn.classList.remove("hidden");
    titleInput.value = "";
    promptInput.value = "";
    addStatus.textContent = "";
  });

  createBtn.addEventListener("click", () => {
    const title = titleInput.value.trim();
    const prompt = promptInput.value.trim();
    if (!title || !prompt) {
      addStatus.textContent = "标题和模板内容不能为空";
      addStatus.className = "add-status error";
      return;
    }
    addNewCard(title, prompt);
  });

  return node;
}

function bindDragEvents(node, cardId) {
  node.addEventListener("dragstart", (event) => {
    draggingId = cardId;
    node.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  });

  node.addEventListener("dragend", () => {
    draggingId = null;
    node.classList.remove("dragging");
    clearDragState();
  });

  node.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (draggingId === cardId) {
      return;
    }
    node.classList.add("drag-over");
  });

  node.addEventListener("dragleave", () => {
    node.classList.remove("drag-over");
  });

  node.addEventListener("drop", (event) => {
    event.preventDefault();
    node.classList.remove("drag-over");
    const sourceId = draggingId || event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === cardId) {
      return;
    }
    reorderCommon(sourceId, cardId);
  });
}

function clearDragState() {
  commonRoot.querySelectorAll(".card.drag-over").forEach((node) => {
    node.classList.remove("drag-over");
  });
}

function reorderCommon(sourceId, targetId) {
  const arr = [...state.commonIds];
  const sourceIndex = arr.indexOf(sourceId);
  const targetIndex = arr.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }
  const [moved] = arr.splice(sourceIndex, 1);
  const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  arr.splice(insertIndex, 0, moved);
  state.commonIds = arr;
  commitState();
}

function moveCommonToEnd(cardId) {
  const arr = state.commonIds.filter((id) => id !== cardId);
  arr.push(cardId);
  state.commonIds = arr;
  commitState();
}

function addToCommon(cardId) {
  if (state.commonIds.includes(cardId)) {
    return;
  }
  state.commonIds = [...state.commonIds, cardId];
  commitState();
}

function removeFromCommon(cardId) {
  state.commonIds = state.commonIds.filter((id) => id !== cardId);
  commitState();
}

function addNewCard(title, prompt) {
  const id = buildCustomCardId();
  state.customCards.push({
    id,
    title,
    prompt,
  });
  state.commonIds.push(id);
  commitState();
}

function updateCard(cardId, newTitle, newPrompt) {
  const item = allItems.find((card) => card.id === cardId);
  if (!item) {
    return;
  }

  if (item.source === "custom") {
    state.customCards = state.customCards.map((card) =>
      card.id === cardId ? { ...card, title: newTitle, prompt: newPrompt } : card
    );
  } else {
    state.editedCards[cardId] = {
      title: newTitle,
      prompt: newPrompt,
    };
  }
  commitState();
}

function deleteCard(cardId) {
  const item = allItems.find((card) => card.id === cardId);
  if (!item) {
    return;
  }

  if (item.source === "custom") {
    state.customCards = state.customCards.filter((card) => card.id !== cardId);
  } else {
    if (!state.deletedCardIds.includes(cardId)) {
      state.deletedCardIds.push(cardId);
    }
  }

  delete state.editedCards[cardId];
  state.commonIds = state.commonIds.filter((id) => id !== cardId);
  inputStore.delete(cardId);
  commitState();
}

function buildCustomCardId() {
  const existing = new Set(allItems.map((item) => item.id));
  let id = "";
  do {
    id = `custom-${Math.random().toString(36).slice(2, 9)}`;
  } while (existing.has(id));
  return id;
}

function commitState() {
  refreshAllItems();
  state.commonIds = normalizeCommonIds(state.commonIds, allItems);
  saveState();
  render();
}

function refreshAllItems() {
  allItems = materializeItems(baseItems, state);
}

function materializeItems(base, currentState) {
  const deleted = new Set(currentState.deletedCardIds);
  const edited = currentState.editedCards || {};
  const seen = new Set();
  const output = [];

  base.forEach((item) => {
    if (deleted.has(item.id)) {
      return;
    }
    const patch = edited[item.id];
    const next = {
      id: item.id,
      title: patch && typeof patch.title === "string" ? patch.title : item.title,
      prompt: patch && typeof patch.prompt === "string" ? patch.prompt : item.prompt,
      source: "base",
    };
    if (!next.title || !next.prompt || seen.has(next.id)) {
      return;
    }
    seen.add(next.id);
    output.push(next);
  });

  currentState.customCards.forEach((item) => {
    if (!item || !item.id || !item.title || !item.prompt) {
      return;
    }
    if (seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    output.push({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
      source: "custom",
    });
  });

  return output;
}

function normalizeCommonIds(ids, items) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }
  const validSet = new Set(items.map((item) => item.id));
  const normalized = [];
  ids.forEach((id) => {
    if (validSet.has(id) && !normalized.includes(id)) {
      normalized.push(id);
    }
  });
  return normalized;
}

function buildDefaultCommonIds(items) {
  const byTitle = new Map(items.map((item) => [item.title, item.id]));
  const selected = [];

  DEFAULT_COMMON_TITLES.forEach((title) => {
    const id = byTitle.get(title);
    if (id && !selected.includes(id)) {
      selected.push(id);
    }
  });

  const fallback = items.map((item) => item.id).filter((id) => !selected.includes(id));
  while (selected.length < Math.min(4, items.length) && fallback.length > 0) {
    selected.push(fallback.shift());
  }

  return selected;
}

function createDefaultState() {
  return {
    commonIds: [],
    customCards: [],
    editedCards: {},
    deletedCardIds: [],
  };
}

function normalizeState(raw) {
  const next = createDefaultState();
  if (!raw || typeof raw !== "object") {
    return next;
  }

  if (Array.isArray(raw.commonIds)) {
    next.commonIds = raw.commonIds.filter((id) => typeof id === "string");
  }
  if (Array.isArray(raw.customCards)) {
    next.customCards = raw.customCards
      .filter((card) => card && typeof card === "object")
      .map((card) => ({
        id: String(card.id || "").trim(),
        title: String(card.title || "").trim(),
        prompt: String(card.prompt || "").trim(),
      }))
      .filter((card) => card.id && card.title && card.prompt);
  }
  if (raw.editedCards && typeof raw.editedCards === "object") {
    Object.keys(raw.editedCards).forEach((id) => {
      const patch = raw.editedCards[id];
      if (!patch || typeof patch !== "object") {
        return;
      }
      const title = String(patch.title || "").trim();
      const prompt = String(patch.prompt || "").trim();
      if (!title || !prompt) {
        return;
      }
      next.editedCards[id] = { title, prompt };
    });
  }
  if (Array.isArray(raw.deletedCardIds)) {
    next.deletedCardIds = raw.deletedCardIds.filter((id) => typeof id === "string");
  }

  return next;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }
    return JSON.parse(raw);
  } catch (error) {
    return createDefaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        updatedAt: Date.now(),
      })
    );
  } catch (error) {
    // Ignore persistence failures.
  }
}

function mergePromptAndInput(promptTemplate, inputText) {
  const template = (promptTemplate || "").trim();
  const userText = (inputText || "").trim();
  if (!userText) {
    return template;
  }

  const placeholderRegex = /\[在此处粘贴[^\]]*\]/g;
  if (placeholderRegex.test(template)) {
    return template.replace(placeholderRegex, userText);
  }

  return `${template}\n\n${userText}`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) {
    throw new Error("copy failed");
  }
}

function setStatus(element, text, stateClass) {
  element.textContent = text;
  element.classList.remove("success", "error");
  if (stateClass) {
    element.classList.add(stateClass);
  }
}

function showNotice(text) {
  noticeText.textContent = text;
  notice.classList.remove("hidden");
}

function hideNotice() {
  notice.classList.add("hidden");
  manualLoadBtn.classList.add("hidden");
}
