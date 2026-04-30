"use strict";

const STORAGE_KEY = "prompt-card-layout-v2";
const PRIMARY_DATA_SOURCE = "./skills.md";
const FALLBACK_DATA_SOURCE = "./README.md";
const PART_ONE_HEADING = /^#\s+Part I:\s*写作 Prompt 集合\s*$/;
const PART_TWO_HEADING = /^#\s+Part II:/;
const DEFAULT_COMMON_TITLES = [
  "中转英",
  "英转中",
  "表达润色（英文论文）",
  "实验分析",
];
const META_TEMPLATE_TEXT = `# Role
你是一位世界顶级的 AI 提示词工程师（Prompt Engineer）。你的任务是根据我的【核心需求】，为我量身定制一套高标准、结构化的提示词模板，以便我能够用它来指导其他 AI 完美执行任务。

# Task
请分析我的需求，并严格按照下方的【目标模板结构】生成一份高质量的提示词。

# Target Template Structure (目标模板结构)
你输出的提示词必须包含以下四个部分，并且排版清晰：
1. # Role (角色设定)：为执行该任务的 AI 赋予一个最匹配、最资深的专家身份（例如：资深学术翻译官、顶级期刊编辑、高级数据分析师等）。
2. # Task (核心任务)：用一两句话清晰、无歧义地概括 AI 需要完成的动作。
3. # Constraints (约束与规则)：这是最核心的部分。请根据我的需求，帮我穷举并细化 AI 在执行任务时必须遵守的规则。可以包括但不限于：
   - 工作流（第一步做什么，第二步做什么）
   - 质量标准（语气风格、专业度要求）
   - 避坑指南（明确指出“不要做什么”，比如不要擅自增加信息、不要使用特定词汇等）
   - 输出格式（JSON、Markdown、纯文本、表格等）
4. # Input (输入区)：在末尾留出用括号包裹的占位符，例如 [在此处粘贴你的文本/数据/代码]，方便我后续填入真实内容。

# Constraints for You (对你的约束)
1. 专业度：生成的约束条件（Constraints）必须直击痛点。比如如果是学术写作任务，你要自动帮我加上“学术客观语气”、“避免使用过度口语化的副词”等专业规则。
2. 零废话：只输出生成好的提示词模板本身，不要加任何诸如“好的，我为您生成”之类的寒暄废话。
3. 语言：输出的提示词模板使用中文。
4. 输出格式补充：最终输出的第一行必须是标题（仅标题，不加解释），且必须为中文短标题，严格控制在 4-5 个字；从第二行开始输出完整 skills 模板正文。

# Input (我的核心需求)
[在这里填写你的具体需求，例如：我想把一篇论文的 Introduction 喂给 AI，让它帮我写出一篇不超过300字的 Abstract，要有逻辑感，符合计算机顶会的风格。]`;
const META_INPUT_PLACEHOLDER =
  "[在这里填写你的具体需求，例如：我想把一篇论文的 Introduction 喂给 AI，让它帮我写出一篇不超过300字的 Abstract，要有逻辑感，符合计算机顶会的风格。]";

const commonRoot = document.getElementById("commonRoot");
const poolRoot = document.getElementById("poolRoot");
const trashRoot = document.getElementById("trashRoot");
const clearTrashBtn = document.getElementById("clearTrashBtn");
const cardCount = document.getElementById("cardCount");
const cardTemplate = document.getElementById("cardTemplate");
const openAddBtn = document.getElementById("openAddBtn");
const toggleUsageSortBtn = document.getElementById("toggleUsageSortBtn");
const resetUsageBtn = document.getElementById("resetUsageBtn");
const addModal = document.getElementById("addModal");
const addModalMask = document.getElementById("addModalMask");
const metaTemplateInput = document.getElementById("metaTemplateInput");
const metaNeedInput = document.getElementById("metaNeedInput");
const copyMetaBtn = document.getElementById("copyMetaBtn");
const metaStatusText = document.getElementById("metaStatusText");
const addPromptInput = document.getElementById("addPromptInput");
const createCardBtn = document.getElementById("createCardBtn");
const cancelAddBtn = document.getElementById("cancelAddBtn");
const addStatusText = document.getElementById("addStatusText");
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
bindAddCardPanel();

async function init() {
  const markdown = await tryReadDataSource();
  if (!markdown) {
    render();
    return;
  }
  parseAndInit(markdown);
}

async function tryReadDataSource() {
  try {
    const response = await fetch(PRIMARY_DATA_SOURCE, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("无法读取 skills.md");
    }
    const text = await response.text();
    hideNotice();
    return text;
  } catch (error) {
    try {
      const fallbackResponse = await fetch(FALLBACK_DATA_SOURCE, { cache: "no-store" });
      if (!fallbackResponse.ok) {
        throw new Error("无法读取 fallback README.md");
      }
      const fallbackText = await fallbackResponse.text();
      showNotice("当前未读取到 skills.md，已回退到 README.md。建议把数据迁移到 skills.md。");
      return fallbackText;
    } catch (fallbackError) {
      showNotice(
        "浏览器没有直接读取到 skills.md。你可以点击下面按钮手动选择本地 skills.md 文件。"
      );
      manualLoadBtn.classList.remove("hidden");
      return null;
    }
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

if (clearTrashBtn) {
  clearTrashBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearTrash();
  });
}

if (resetUsageBtn) {
  resetUsageBtn.addEventListener("click", () => {
    resetAllUsageCount();
  });
}

if (toggleUsageSortBtn) {
  toggleUsageSortBtn.addEventListener("click", () => {
    applyUsageSort();
  });
}

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
      showNotice("没有解析到可用模板，请检查 skills.md 的 Part I 和代码块格式。");
      manualLoadBtn.classList.remove("hidden");
    }
  } catch (error) {
    baseItems = [];
    allItems = [];
    state = createDefaultState();
    render();
    showNotice("解析 skills.md 失败，请确认文件内容完整后重试。");
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
    throw new Error("skills.md 中未找到 Part I");
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

function render(options = {}) {
  const suppressAnimation = Boolean(options.suppressAnimation);
  if (suppressAnimation) {
    document.body.classList.add("no-enter-anim");
  }

  const itemMap = new Map(allItems.map((item) => [item.id, item]));
  const commonItems = state.commonIds.map((id) => itemMap.get(id)).filter(Boolean);
  const poolItems = allItems.filter((item) => !state.commonIds.includes(item.id));
  const trashItems = (state.trashedCustomCards || []).map((item) => ({ ...item, source: "trash" }));

  renderList(commonRoot, commonItems, "common");
  renderList(poolRoot, poolItems, "pool");
  renderList(trashRoot, trashItems, "trash");

  if (cardCount) {
    cardCount.textContent = `总计 ${allItems.length} 张卡片，常用 ${commonItems.length}，卡片池 ${poolItems.length}`;
  }
  if (suppressAnimation) {
    requestAnimationFrame(() => {
      document.body.classList.remove("no-enter-anim");
    });
  }
}

function renderList(root, items, zone) {
  root.innerHTML = "";
  const fragment = document.createDocumentFragment();

  if (zone === "common") {
    items.forEach((item, index) => {
      const card = createCard(item, zone, index);
      fragment.appendChild(card);
    });
    root.appendChild(fragment);
    return;
  }

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-tip";
    if (zone === "pool") {
      empty.textContent = "替补卡片暂无卡片";
    } else if (zone === "trash") {
      empty.textContent = "目前没有垃圾";
    } else {
      empty.textContent = "暂无卡片";
    }
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
  node.dataset.cardId = item.id;
  node.dataset.zone = zone;

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
  const previewSummary = node.querySelector(".prompt-preview summary");

  const editPanel = node.querySelector(".edit-panel");
  const editTitleInput = node.querySelector(".edit-title");
  const editPromptInput = node.querySelector(".edit-prompt");
  const saveEditBtn = node.querySelector(".save-edit-btn");
  const cancelEditBtn = node.querySelector(".cancel-edit-btn");

  title.textContent = item.title;
  subtitle.textContent = "";
  subtitle.classList.add("hidden");
  preview.textContent = item.prompt;
  if (previewSummary) {
    const usage = document.createElement("span");
    usage.className = "usage-count";
    usage.textContent = `使用 ${getUsageCount(item.id)} 次`;
    previewSummary.appendChild(usage);
  }
  input.value = inputStore.get(item.id) || "";

  if (zone === "common") {
    node.setAttribute("draggable", "true");
    node.classList.add("draggable");
    bindDragEvents(node, item.id);
    toggleBtn.textContent = "移到替补";
    toggleBtn.classList.add("warning");
  } else if (zone === "pool") {
    toggleBtn.textContent = "加入主力";
    toggleBtn.classList.add("secondary");
  } else {
    toggleBtn.textContent = "加入主力";
    toggleBtn.classList.add("secondary");
    node.removeAttribute("draggable");
  }

  const isCustomCard = item.source === "custom";
  if (isCustomCard && zone !== "trash") {
    editBtn.classList.remove("hidden");
    deleteBtn.classList.remove("hidden");
  } else {
    editBtn.classList.add("hidden");
    deleteBtn.classList.add("hidden");
  }

  input.addEventListener("input", () => {
    inputStore.set(item.id, input.value);
  });

  copyBtn.addEventListener("click", async () => {
    const content = mergePromptAndInput(item.prompt, input.value);
    if (input.value.trim()) {
      const nextCount = incrementUsageCount(item.id, { skipRender: true });
      const usageNode = node.querySelector(".usage-count");
      if (usageNode) {
        usageNode.textContent = `使用 ${nextCount} 次`;
      }
      if (state.sortByUsage) {
        state.sortByUsage = false;
        saveState();
      }
    }
    try {
      await copyToClipboard(content);
      setStatus(status, "已复制到剪贴板", "success");
    } catch (error) {
      setStatus(status, "复制失败，请手动复制", "error");
    }
  });

  toggleBtn.addEventListener("click", () => {
    if (zone === "trash") {
      restoreFromTrash(item.id);
      return;
    }
    if (zone === "common") {
      removeFromCommon(item.id);
    } else {
      addToCommon(item.id);
    }
  });

  editBtn.addEventListener("click", () => {
    if (node.querySelector(".inline-title-edit")) {
      return;
    }
    const inlineInput = document.createElement("input");
    inlineInput.type = "text";
    inlineInput.className = "inline-title-edit";
    inlineInput.value = item.title;
    inlineInput.setAttribute("aria-label", "编辑标题");
    inlineInput.style.width = "100%";
    inlineInput.style.font = "inherit";
    inlineInput.style.padding = "4px 6px";
    inlineInput.style.borderRadius = "8px";
    inlineInput.style.border = "1px solid rgba(20, 34, 58, 0.24)";

    title.classList.add("hidden");
    title.parentNode.insertBefore(inlineInput, title);
    inlineInput.focus();
    inlineInput.select();

    const finish = (commit) => {
      const newTitle = inlineInput.value.trim();
      inlineInput.remove();
      title.classList.remove("hidden");
      if (!commit) {
        return;
      }
      if (!newTitle) {
        setStatus(status, "标题不能为空", "error");
        return;
      }
      if (newTitle === item.title) {
        return;
      }
      updateCard(item.id, newTitle, item.prompt);
    };

    inlineInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    inlineInput.addEventListener("blur", () => finish(true));
  });

  saveEditBtn.addEventListener("click", () => {
    editPanel.classList.add("hidden");
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
    deleteCard(item.id);
  });

  return node;
}

function bindAddCardPanel() {
  if (
    !openAddBtn ||
    !addModal ||
    !addModalMask ||
    !metaTemplateInput ||
    !metaNeedInput ||
    !copyMetaBtn ||
    !metaStatusText ||
    !addPromptInput ||
    !createCardBtn ||
    !cancelAddBtn ||
    !addStatusText
  ) {
    return;
  }

  metaTemplateInput.value = META_TEMPLATE_TEXT;

  openAddBtn.addEventListener("click", () => {
    addModal.classList.remove("hidden");
    metaNeedInput.focus();
  });

  addModalMask.addEventListener("click", () => {
    closeAddPanel();
  });

  cancelAddBtn.addEventListener("click", () => {
    closeAddPanel();
  });

  copyMetaBtn.addEventListener("click", async () => {
    const need = metaNeedInput.value.trim();
    if (!need) {
      metaStatusText.textContent = "请先填写需求";
      metaStatusText.className = "meta-status error";
      metaNeedInput.focus();
      return;
    }
    const output = META_TEMPLATE_TEXT.replace(META_INPUT_PLACEHOLDER, need);
    try {
      await copyToClipboard(output);
      metaStatusText.textContent = "已复制元模板 + 需求";
      metaStatusText.className = "meta-status success";
    } catch (error) {
      metaStatusText.textContent = "复制失败，请手动复制";
      metaStatusText.className = "meta-status error";
    }
  });

  createCardBtn.addEventListener("click", () => {
    const parsed = parseGeneratedSkill(addPromptInput.value);
    if (!parsed) {
      addStatusText.textContent = "请粘贴完整内容：第一行标题，后续为 skills 模板";
      addStatusText.className = "add-status error";
      return;
    }
    addNewCard(parsed.title, parsed.prompt);
    closeAddPanel();
  });
}

function closeAddPanel() {
  if (!addModal) {
    return;
  }
  addModal.classList.add("hidden");
  metaNeedInput.value = "";
  metaStatusText.textContent = "";
  metaStatusText.className = "meta-status";
  addPromptInput.value = "";
  addStatusText.textContent = "";
  addStatusText.className = "add-status";
}

function parseGeneratedSkill(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length < 2) {
    return null;
  }
  let title = nonEmpty[0]
    .replace(/^#+\s*/, "")
    .replace(/^标题[:：]\s*/i, "")
    .trim();
  const prompt = nonEmpty.slice(1).join("\n").trim();
  if (!title || !prompt) {
    return null;
  }
  return { title, prompt };
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && addModal && !addModal.classList.contains("hidden")) {
    closeAddPanel();
  }
});

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
  resetUsageCount(cardId);
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
    state.trashedCustomCards = state.trashedCustomCards || [];
    if (!state.trashedCustomCards.some((card) => card.id === cardId)) {
      state.trashedCustomCards.push({
        id: item.id,
        title: item.title,
        prompt: item.prompt,
      });
    }
    state.customCards = state.customCards.filter((card) => card.id !== cardId);
  } else {
    if (!state.deletedCardIds.includes(cardId)) {
      state.deletedCardIds.push(cardId);
    }
  }

  delete state.editedCards[cardId];
  state.commonIds = state.commonIds.filter((id) => id !== cardId);
  resetUsageCount(cardId);
  inputStore.delete(cardId);
  commitState();
}

function restoreFromTrash(cardId) {
  const list = state.trashedCustomCards || [];
  const item = list.find((card) => card.id === cardId);
  if (!item) {
    return;
  }
  state.trashedCustomCards = list.filter((card) => card.id !== cardId);
  if (!state.customCards.some((card) => card.id === cardId)) {
    state.customCards.push({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
    });
  }
  if (!state.commonIds.includes(cardId)) {
    state.commonIds.push(cardId);
  }
  commitState();
}

function clearTrash() {
  if (!state.trashedCustomCards || state.trashedCustomCards.length === 0) {
    return;
  }
  state.trashedCustomCards = [];
  commitState();
}

function getUsageCount(cardId) {
  const map = state.usageCountById || {};
  const value = Number(map[cardId] || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function incrementUsageCount(cardId, options) {
  if (!state.usageCountById || typeof state.usageCountById !== "object") {
    state.usageCountById = {};
  }
  const current = getUsageCount(cardId);
  const next = current + 1;
  state.usageCountById[cardId] = next;
  saveState();
  if (!options || !options.skipRender) {
    render({ suppressAnimation: true });
  }
  return next;
}

function resetUsageCount(cardId) {
  if (!state.usageCountById || typeof state.usageCountById !== "object") {
    return;
  }
  if (state.usageCountById[cardId]) {
    delete state.usageCountById[cardId];
  }
}

function resetAllUsageCount() {
  state.usageCountById = {};
  commitState();
}

function applyUsageSort() {
  if (state.sortByUsage) {
    return;
  }
  const orderMap = new Map(state.commonIds.map((id, index) => [id, index]));
  state.commonIds = [...state.commonIds].sort((a, b) => {
    const diff = getUsageCount(b) - getUsageCount(a);
    if (diff !== 0) {
      return diff;
    }
    return (orderMap.get(a) || 0) - (orderMap.get(b) || 0);
  });
  state.sortByUsage = true;
  commitState({ suppressAnimation: true });
}

function buildCustomCardId() {
  const existing = new Set(allItems.map((item) => item.id));
  let id = "";
  do {
    id = `custom-${Math.random().toString(36).slice(2, 9)}`;
  } while (existing.has(id));
  return id;
}

function commitState(options = {}) {
  refreshAllItems();
  state.commonIds = normalizeCommonIds(state.commonIds, allItems);
  saveState();
  render(options);
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
    trashedCustomCards: [],
    usageCountById: {},
    sortByUsage: false,
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
  if (Array.isArray(raw.trashedCustomCards)) {
    next.trashedCustomCards = raw.trashedCustomCards
      .filter((card) => card && typeof card === "object")
      .map((card) => ({
        id: String(card.id || "").trim(),
        title: String(card.title || "").trim(),
        prompt: String(card.prompt || "").trim(),
      }))
      .filter((card) => card.id && card.title && card.prompt);
  }
  if (raw.usageCountById && typeof raw.usageCountById === "object") {
    Object.keys(raw.usageCountById).forEach((id) => {
      const count = Number(raw.usageCountById[id]);
      if (!id || !Number.isFinite(count) || count <= 0) {
        return;
      }
      next.usageCountById[id] = Math.floor(count);
    });
  }
  if (typeof raw.sortByUsage === "boolean") {
    next.sortByUsage = raw.sortByUsage;
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
