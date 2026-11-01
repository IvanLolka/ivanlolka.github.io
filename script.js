  
                                      
                       
                                                                                            
                                                                  
                                    
                                                              
                                                                                 
   
                                                                           
                                                               
const SHEET_URL = "https://docs.google.com/spreadsheets/d/12LWMazV4G3kS_7bH1ee8COB4xFz8_T1lEepIMP4yG20/edit?usp=sharing";
                                                                      
                                                                                          
const SHEET_GID = "";
const PAGE_SIZE = 9;
const CACHE_KEY = "project-scaffold-sheet-cache-v3";
const GITHUB_CACHE_KEY = "project-scaffold-github-meta-v1:";
const GITHUB_CACHE_AGE = 12 * 60 * 60 * 1000;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const grid = $("#project-grid");
const searchInput = $("#project-search");
const categoryFilter = $("#category-filter");
const statusFilter = $("#status-filter");
const sortSelect = $("#sort-projects");
const resultCount = $("#result-count");
const dataStatus = $("#data-status");
const emptyState = $("#empty-state");
const emptyTitle = $("#empty-title");
const emptyMessage = $("#empty-message");
const showMoreButton = $("#show-more");

                                                                             
                                                               
const customSelects = new Map();
let customSelectCounter = 0;

function refreshCustomSelect(select) {
  const control = customSelects.get(select);
  if (!control) return;

  const selected = select.options[select.selectedIndex];
  control.trigger.querySelector(".custom-select-value").textContent = selected?.textContent || "Выбрать";
  control.menu.replaceChildren();

  [...select.options].forEach((option, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "custom-select-option";
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.value === select.value));
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    item.disabled = option.disabled;
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      closeCustomSelect(control);
      control.trigger.focus();
    });
    item.addEventListener("keydown", event => {
      const options = [...control.menu.querySelectorAll(".custom-select-option:not(:disabled)")];
      const current = options.indexOf(item);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        options[(current + direction + options.length) % options.length]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        (event.key === "Home" ? options[0] : options.at(-1))?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeCustomSelect(control);
        control.trigger.focus();
      }
    });
    control.menu.append(item);
  });
}

function closeCustomSelect(control) {
  control.menu.hidden = true;
  control.trigger.setAttribute("aria-expanded", "false");
  control.wrapper.classList.remove("is-open");
}

function closeAllCustomSelects(except = null) {
  for (const control of customSelects.values()) {
    if (control !== except) closeCustomSelect(control);
  }
}

function enhanceSelect(select) {
  const wrapper = select.closest(".custom-select-field");
  if (!wrapper || customSelects.has(select)) return;

  const id = `custom-select-menu-${++customSelectCounter}`;
  const label = wrapper.dataset.selectLabel || wrapper.querySelector(".sr-only")?.textContent || "Список";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-label", label);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", id);
  trigger.innerHTML = '<span class="custom-select-value"></span><span class="custom-select-arrow" aria-hidden="true"></span>';

  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.id = id;
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", label);
  menu.hidden = true;

  select.classList.add("native-select-source");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  wrapper.append(trigger, menu);

  const control = { wrapper, trigger, menu, select };
  customSelects.set(select, control);

  trigger.addEventListener("click", () => {
    const shouldOpen = menu.hidden;
    closeAllCustomSelects(control);
    menu.hidden = !shouldOpen;
    trigger.setAttribute("aria-expanded", String(shouldOpen));
    wrapper.classList.toggle("is-open", shouldOpen);
    if (shouldOpen) {
      const active = menu.querySelector('[aria-selected="true"]') || menu.querySelector(".custom-select-option:not(:disabled)");
      active?.focus();
    }
  });
  trigger.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (menu.hidden) {
        trigger.click();
        const options = [...menu.querySelectorAll(".custom-select-option:not(:disabled)")];
        (event.key === "ArrowUp" ? options.at(-1) : (menu.querySelector('[aria-selected="true"]') || options[0]))?.focus();
      }
    }
  });
  select.addEventListener("change", () => refreshCustomSelect(select));
  new MutationObserver(() => refreshCustomSelect(select)).observe(select, { childList: true, subtree: true, characterData: true });
  refreshCustomSelect(select);
}

document.addEventListener("click", event => {
  if (!event.target.closest(".custom-select-field")) closeAllCustomSelects();
});

let allProjects = [];
let filteredProjects = [];
let visibleCount = PAGE_SIZE;

const HEADER_ALIASES = {
  name: ["имя", "название", "название проекта", "имя проекта", "name", "title", "project"],
  description: ["описание", "краткое описание", "description"],
  category: ["категория", "category"],
  version: ["версия", "version"],
  image: ["ссылка на изображение", "ссылка на картинку", "изображение", "картинка", "image_url", "image", "cover"],
  changes: ["изменения", "изменения в версии", "список изменений", "changelog", "changes"],
  download: ["ссылка на архив", "ссылка на скачивание", "архив", "download_url", "download", "file_url"],
  status: ["статус разработки", "статус", "status"],
  github: ["ссылка на гитхаб", "ссылка на github", "гитхаб", "github", "source_url", "repository"],
  updated: ["дата последнего обновления", "последнее обновление", "дата обновления", "updated", "updated_at", "release_date"],
  size: ["размер", "размер файла", "file_size", "size"],
  visible: ["показывать", "показывать на сайте", "видимый", "visible"]
};

function normalizeHeader(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function safeURL(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function makeElement(tag, className = "", text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function isVisible(value) {
  return !["нет", "no", "false", "0", "скрыть", "hidden", "не показывать"].includes(String(value || "").trim().toLocaleLowerCase("ru-RU"));
}

function hasProjectContent(project) {
  return [project.name, project.description, project.category, project.download, project.github, project.image].some(value => String(value || "").trim());
}

function parseDate(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
                                              
  const ru = text.match(/^(\d{1,2})[.] (\d{1,2})[.] (\d{4})$/) || text.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (ru) return new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1])).getTime() || 0;
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
                                                                                                    
    const first = Number(dmy[1]), second = Number(dmy[2]);
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(Number(dmy[3]), month - 1, day).getTime() || 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const timestamp = parseDate(value);
  if (!timestamp) return String(value || "").trim();
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(timestamp));
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 1000) return `${value} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let size = value / 1000, index = 0;
  while (size >= 1000 && index < units.length - 1) { size /= 1000; index++; }
  return `${size.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ${units[index]}`;
}

function createGitHubIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "github-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", "M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.1c-3.1.67-3.76-1.32-3.76-1.32-.51-1.3-1.24-1.65-1.24-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.71-1.49-2.48-.28-5.09-1.24-5.09-5.53 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.12-1.44 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.61 5.24-5.1 5.52.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z");
  svg.append(path);
  return svg;
}

function addExternalLink(container, href, label, className, type = "") {
  const url = safeURL(href);
  if (!url) return false;
  const link = makeElement("a", `button ${className}`);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (type === "github") link.append(createGitHubIcon());
  link.append(document.createTextNode(label));
  if (type === "github") link.append(document.createTextNode(" ↗"));
  else link.append(document.createTextNode(" ↓"));
  container.append(link);
  return true;
}

function makeCard(project) {
  const card = makeElement("article", "project-card");
  const cover = makeElement("div", "project-cover", "[ МЕСТО ПОД ИЗОБРАЖЕНИЕ ]");
  const imageURL = safeURL(project.image);
  if (imageURL) {
    const image = makeElement("img");
    image.src = imageURL;
    image.alt = project.name ? `Изображение проекта ${project.name}` : "Изображение проекта";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("load", () => { cover.textContent = ""; cover.append(image); }, { once: true });
    image.addEventListener("error", () => { image.remove(); cover.textContent = "[ ИЗОБРАЖЕНИЕ НЕДОСТУПНО ]"; }, { once: true });
    cover.append(image);
  }

  const body = makeElement("div", "card-content");
  if (project.category) body.append(makeElement("p", "card-category", project.category));
  body.append(makeElement("h2", "", project.name || "[ НАЗВАНИЕ ПРОЕКТА ]"));
  if (project.description) body.append(makeElement("p", "card-description", project.description));
  else body.append(makeElement("p", "card-description", "[ ОПИСАНИЕ ПРОЕКТА ]"));

  const meta = makeElement("div", "metadata");
  if (project.version) meta.append(makeElement("span", "", `Версия ${project.version}`));
  if (project.status) meta.append(makeElement("span", "status-chip", project.status));
  if (project.updated) meta.append(makeElement("span", "", `Обновлено: ${formatDate(project.updated)}`));
  if (project.size) meta.append(makeElement("span", "", `Размер: ${project.size}`));
  if (meta.childElementCount) body.append(meta);

  if (project.changes) {
    const changes = makeElement("details", "changes");
    changes.append(makeElement("summary", "", "Изменения в этой версии"));
    changes.append(makeElement("p", "", project.changes));
    body.append(changes);
  }

  const actions = makeElement("div", "card-actions");
  const hasDownload = addExternalLink(actions, project.download, "Скачать архив", "button-download");
  const hasGithub = addExternalLink(actions, project.github, "GitHub", "button-github", "github");
  if (!hasDownload) {
    const missing = makeElement("span", "card-link-missing", "[ ДОБАВЬ ССЫЛКУ НА АРХИВ В ТАБЛИЦУ ]");
    actions.append(missing);
  }
  if (!hasGithub) {
    const missing = makeElement("span", "card-link-missing", "[ ДОБАВЬ ССЫЛКУ НА GITHUB В ТАБЛИЦУ ]");
    actions.append(missing);
  }
  body.append(actions);
  card.append(cover, body);
  return card;
}

function setDataStatus(message, kind = "info") {
  dataStatus.textContent = message;
  dataStatus.dataset.kind = kind;
}

function cacheProjects(projects) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), projects })); } catch (error) { console.warn("Не удалось сохранить локальный кеш таблицы:", error); }
}

function readCachedProjects() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && Array.isArray(cached.projects)) return cached;
  } catch (error) { console.warn("Кеш проекта повреждён:", error); }
  return null;
}

function getSheetSource() {
  const raw = String(SHEET_URL || "").trim();
  if (!/^https:\/\//i.test(raw) || raw.includes("ВСТАВЬ_СЮДА")) {
    throw new Error("Вставь обычную ссылку Google Sheets в настройку SHEET_URL в начале script.js.");
  }

  let sharedURL;
  try { sharedURL = new URL(raw); }
  catch { throw new Error("Ссылка Google Sheets выглядит некорректно."); }

  if (!/(^|\.)google\.com$/i.test(sharedURL.hostname) || !sharedURL.pathname.includes("/spreadsheets/")) {
    throw new Error("Нужна обычная ссылка именно на Google-таблицу, например docs.google.com/spreadsheets/d/…/edit.");
  }

  const match = sharedURL.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Не удалось найти ID таблицы в ссылке. Скопируй ссылку из адресной строки открытой Google-таблицы.");

  let gid = String(SHEET_GID || "").trim();
  if (!gid) {
    gid = sharedURL.searchParams.get("gid") || "";
    if (!gid && sharedURL.hash) gid = (sharedURL.hash.match(/(?:^|[&#])gid=(\d+)/) || [])[1] || "";
  }

  const endpoint = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq`);
  endpoint.searchParams.set("tqx", "out:json");
  endpoint.searchParams.set("headers", "1");
  if (gid) endpoint.searchParams.set("gid", gid);
  return { endpoint: endpoint.href, gid };
}

function isSheetURLConfigured() {
  return /^https:\/\//i.test(String(SHEET_URL || "").trim()) && !String(SHEET_URL).includes("ВСТАВЬ_СЮДА");
}

function parseGoogleVisualizationResponse(source) {
  const text = String(source || "").trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    if (/accounts\.google\.com|ServiceLogin|you need access/i.test(text)) {
      throw new Error("Google не открыл таблицу. Проверь доступ «Все, у кого есть ссылка — Читатель».");
    }
    throw new Error("Google вернул неожиданный ответ вместо данных таблицы.");
  }

  let payload;
  try { payload = JSON.parse(text.slice(firstBrace, lastBrace + 1)); }
  catch { throw new Error("Не удалось разобрать ответ Google Sheets. Проверь ссылку и доступ к таблице."); }

  if (payload.status && payload.status !== "ok") {
    const details = (payload.errors || []).map(item => item.detailed_message || item.message).filter(Boolean).join("; ");
    throw new Error(details || "Google Sheets вернул ошибку. Проверь доступ по ссылке и выбранный лист.");
  }

  const table = payload.table;
  if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
    throw new Error("В ответе Google не найдена таблица. Проверь, что первая строка содержит названия столбцов.");
  }

  const headers = table.cols.map((column, index) => normalizeHeader(column.label || column.id || `column_${index + 1}`));
  if (!headers.some(Boolean)) throw new Error("Не удалось прочитать заголовки столбцов в первой строке.");

  return table.rows.map((row, rowIndex) => {
    const raw = {};
    (row.c || []).forEach((cell, columnIndex) => {
      const header = headers[columnIndex];
      if (!header) return;
      if (!cell) { raw[header] = ""; return; }
                                                                                  
      const value = cell.f !== undefined && cell.f !== null ? cell.f : cell.v;
      raw[header] = value === undefined || value === null ? "" : String(value).trim();
    });

    const project = { _row: rowIndex + 2 };
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      const matched = aliases.map(normalizeHeader).find(alias => Object.hasOwn(raw, alias));
      project[field] = matched ? raw[matched] : "";
    }
    return project;
  }).filter(project => Object.values(project).some(value => String(value ?? "").trim()));
}

function normalizeProjects(rows) {
  return rows.filter(project => isVisible(project.visible) && hasProjectContent(project)).map(project => ({
    ...project,
    _updatedTimestamp: parseDate(project.updated),
    _autoUpdated: false,
    _autoSize: false
  }));
}

function fillSelect(select, defaultLabel, values, currentValue) {
  select.replaceChildren(new Option(defaultLabel, ""));
  for (const value of values) select.add(new Option(value, value));
  select.value = values.includes(currentValue) ? currentValue : "";
  refreshCustomSelect(select);
}

function updateFilterOptions() {
  const currentCategory = categoryFilter.value;
  const currentStatus = statusFilter.value;
  const categories = [...new Set(allProjects.map(project => project.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const statuses = [...new Set(allProjects.map(project => project.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  fillSelect(categoryFilter, "Все категории", categories, currentCategory);
  fillSelect(statusFilter, "Все статусы", statuses, currentStatus);
}

function sortProjects(projects) {
  const sort = sortSelect.value;
  return [...projects].sort((a, b) => {
    if (sort === "name-asc") return (a.name || "").localeCompare(b.name || "", "ru", { sensitivity: "base" });
    if (sort === "name-desc") return (b.name || "").localeCompare(a.name || "", "ru", { sensitivity: "base" });
    if (sort === "category-asc") return (a.category || "").localeCompare(b.category || "", "ru", { sensitivity: "base" }) || (a.name || "").localeCompare(b.name || "", "ru");
    return (b._updatedTimestamp || parseDate(b.updated)) - (a._updatedTimestamp || parseDate(a.updated)) || (a.name || "").localeCompare(b.name || "", "ru", { sensitivity: "base" });
  });
}

function updateCount(total, shown) {
                                                                            
                                                                                  
  const word = total === 1 ? "проект" : total >= 2 && total <= 4 ? "проекта" : "проектов";
  resultCount.textContent = total ? `Найдено: ${total} ${word}${shown < total ? ` · показано ${shown}` : ""}` : "Проекты не найдены";
}

function renderProjects(resetPage = false) {
  if (resetPage) visibleCount = PAGE_SIZE;
  const search = searchInput.value.trim().toLocaleLowerCase("ru-RU");
  const category = categoryFilter.value;
  const status = statusFilter.value;
  filteredProjects = sortProjects(allProjects.filter(project => {
    if (category && project.category !== category) return false;
    if (status && project.status !== status) return false;
    if (!search) return true;
    const haystack = [project.name, project.description, project.category, project.version, project.status, project.changes].join(" ").toLocaleLowerCase("ru-RU");
    return haystack.includes(search);
  }));

  const shownProjects = filteredProjects.slice(0, visibleCount);
  grid.replaceChildren(...shownProjects.map(makeCard));
  grid.setAttribute("aria-busy", "false");
  updateCount(filteredProjects.length, shownProjects.length);
  emptyState.hidden = filteredProjects.length > 0;
  showMoreButton.hidden = filteredProjects.length <= visibleCount;
  showMoreButton.textContent = `Показать ещё (${Math.min(PAGE_SIZE, filteredProjects.length - visibleCount)})`;

  if (filteredProjects.length) {
    emptyTitle.textContent = "Ничего не найдено";
    emptyMessage.textContent = "Попробуй изменить запрос или сбросить фильтры.";
  } else if (!allProjects.length) {
    emptyTitle.textContent = "Пока нет карточек проектов";
    emptyMessage.textContent = isSheetURLConfigured()
      ? "Проверь доступ «Все, у кого есть ссылка — Читатель» и наличие заполненных строк."
      : "Подключи Google Sheets: вставь обычную ссылку в настройку SHEET_URL в начале script.js.";
  } else {
    emptyTitle.textContent = "Ничего не найдено";
    emptyMessage.textContent = "По текущему запросу нет совпадений. Попробуй сбросить фильтры.";
  }
  renderUpdates();
}

function renderUpdates() {
  const list = $("#updates-list");
  const updates = allProjects.filter(project => project.changes).sort((a, b) => (b._updatedTimestamp || parseDate(b.updated)) - (a._updatedTimestamp || parseDate(a.updated)));
  list.replaceChildren();
  $("#updates-empty").hidden = updates.length > 0;
  for (const project of updates) {
    const item = makeElement("article", "update-item");
    item.append(makeElement("time", "update-date", project.updated ? formatDate(project.updated) : (project.version ? `Версия ${project.version}` : "Дата не указана")));
    const content = makeElement("div");
    content.append(makeElement("span", "update-project", project.name || "Проект"));
    content.append(makeElement("h2", "", project.version ? `Версия ${project.version}` : "Обновление проекта"));
    content.append(makeElement("p", "", project.changes));
    item.append(content);
    list.append(item);
  }
}

function resetFilters() {
  searchInput.value = "";
  categoryFilter.value = "";
  statusFilter.value = "";
  sortSelect.value = "updated-desc";
  refreshCustomSelect(categoryFilter);
  refreshCustomSelect(statusFilter);
  refreshCustomSelect(sortSelect);
  $("#clear-search").hidden = true;
  renderProjects(true);
}

function setActiveTab(id, updateHistory = false, announceMascot = true) {
  const validIds = ["projects", "about", "updates", "links"];
  const tabId = validIds.includes(id) ? id : "projects";
  for (const panel of $$(".tab-panel")) panel.hidden = panel.id !== tabId;
  for (const button of $$("[data-tab]")) {
    const active = button.dataset.tab === tabId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  if (updateHistory && location.hash !== `#${tabId}`) history.pushState({ tab: tabId }, "", `#${tabId}`);
  window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                                                                               
                                                                            
  if (announceMascot) document.dispatchEvent(new CustomEvent("site:tabchange", { detail: { tab: tabId } }));
}

const SETTINGS_KEY = "codelite-site-interface-settings-v3";
const DEFAULT_ACCENT = "#F4A943";
const DEFAULT_SETTINGS = { theme: "dark", fontSize: "normal", mascot: true, accent: DEFAULT_ACCENT };

function normalizeAccent(value) {
  return /^#[0-9A-F]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : DEFAULT_ACCENT;
}

function getAccentInk(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map(part => parseInt(part, 16));
  const brightness = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
  return brightness > 150 ? "#17130D" : "#FFFFFF";
}

function readInterfaceSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const legacy = JSON.parse(localStorage.getItem("codelite-site-interface-settings-v2") || "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...legacy,
      ...saved,
      theme: ["dark", "light"].includes(saved.theme || legacy.theme) ? (saved.theme || legacy.theme) : DEFAULT_SETTINGS.theme,
      fontSize: ["small", "normal", "large"].includes(saved.fontSize || legacy.fontSize) ? (saved.fontSize || legacy.fontSize) : DEFAULT_SETTINGS.fontSize,
      mascot: typeof (saved.mascot ?? legacy.mascot) === "boolean" ? (saved.mascot ?? legacy.mascot) : DEFAULT_SETTINGS.mascot,
      accent: normalizeAccent(saved.accent || legacy.accent)
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function applyInterfaceSettings(settings) {
  const root = document.documentElement;
  const accent = normalizeAccent(settings.accent);
  const theme = ["dark", "light"].includes(settings.theme) ? settings.theme : "dark";
  root.dataset.theme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "light" ? "#F6F7F9" : "#1D1B1B";
  root.dataset.fontSize = settings.fontSize;
  root.dataset.mascot = settings.mascot ? "on" : "off";
  root.style.setProperty("--accent-color", accent);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--honey-accent", accent);
  root.style.setProperty("--accent-ink", getAccentInk(accent));
  root.style.setProperty("--honey-text", theme === "light" ? "color-mix(in srgb, " + accent + " 82%, #202632)" : accent);

  for (const button of $$("[data-theme-choice]")) {
    const active = button.dataset.themeChoice === theme;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const radio of $$("[data-size-radio]")) radio.checked = radio.value === settings.fontSize;
  const mascot = $("#ui-mascot");
  if (mascot) mascot.checked = settings.mascot;

  const swatch = $("#accent-trigger-swatch");
  const preview = $("#accent-preview");
  if (swatch) swatch.style.background = accent;
  if (preview) {
    preview.querySelector("span").style.background = accent;
    preview.querySelector("code").textContent = accent;
  }
  for (const button of $$('[data-accent]')) {
    button.classList.toggle("active", button.dataset.accent.toUpperCase() === accent);
  }
}

function hexToHsv(hex) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(max === 0 ? 0 : delta / max * 100), v: Math.round(max * 100) };
}

function hsvToHex(h, saturation, value) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(saturation))) / 100;
  const v = Math.max(0, Math.min(100, Number(value))) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = v - c;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return "#" + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function wireInterfaceSettings() {
  const dialog = $("#interface-settings");
  if (!dialog) return;

  let settings = readInterfaceSettings();
  let hsvDraftAccent = settings.accent;
  applyInterfaceSettings(settings);

  const saveSettings = () => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) {
      console.warn("Не удалось сохранить настройки интерфейса:", error);
    }
  };

  const readForm = () => ({
    theme: settings.theme,
    fontSize: ($$('[data-size-radio]').find(radio => radio.checked) || {}).value || DEFAULT_SETTINGS.fontSize,
    mascot: $("#ui-mascot").checked,
    accent: settings.accent
  });

  $("[data-open-settings]").addEventListener("click", () => {
    settings = readInterfaceSettings();
    applyInterfaceSettings(settings);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  for (const button of $$("[data-theme-choice]")) {
    button.addEventListener("click", () => {
      settings.theme = button.dataset.themeChoice === "light" ? "light" : "dark";
      applyInterfaceSettings(settings);
      saveSettings();
    });
  }

  $("#settings-form").addEventListener("change", () => {
    settings = readForm();
    applyInterfaceSettings(settings);
    saveSettings();
  });
  $("#settings-form").addEventListener("submit", () => {
    settings = readForm();
    saveSettings();
    applyInterfaceSettings(settings);
  });

  $("[data-reset-settings]").addEventListener("click", () => {
    settings = { ...DEFAULT_SETTINGS };
    try { localStorage.removeItem(SETTINGS_KEY); } catch {}
    applyInterfaceSettings(settings);
  });

  for (const button of $$('[data-accent]')) {
    button.addEventListener("click", () => {
      settings.accent = normalizeAccent(button.dataset.accent);
      applyInterfaceSettings(settings);
      saveSettings();
    });
  }

  const picker = $("#accent-picker-dialog");
  const hue = $("#hsv-hue");
  const saturation = $("#hsv-saturation");
  const value = $("#hsv-value");
  const previewSwatch = $("#hsv-preview-swatch");
  const previewHex = $("#hsv-hex-value");

  function refreshAccentPreview() {
    const hueColor = `hsl(${hue.value}, 100%, 50%)`;
    hue.style.setProperty("--hsv-track", "linear-gradient(90deg,#f00 0%,#ff0 16.6%,#0f0 33.3%,#0ff 50%,#00f 66.6%,#f0f 83.3%,#f00 100%)");
    saturation.style.setProperty("--hsv-track", `linear-gradient(90deg,#fff,${hueColor})`);
    value.style.setProperty("--hsv-track", "linear-gradient(90deg,#000,#fff)");
    hsvDraftAccent = hsvToHex(hue.value, saturation.value, value.value);
    previewSwatch.style.background = hsvDraftAccent;
    previewHex.textContent = hsvDraftAccent;
  }

  $("#open-accent-picker").addEventListener("click", () => {
    const hsv = hexToHsv(settings.accent);
    hue.value = String(hsv.h);
    saturation.value = String(hsv.s);
    value.value = String(hsv.v);
    refreshAccentPreview();
    if (typeof picker.showModal === "function") picker.showModal();
    else picker.setAttribute("open", "");
  });
  [hue, saturation, value].forEach(input => input.addEventListener("input", refreshAccentPreview));
  $("#close-accent-picker").addEventListener("click", () => picker.close?.());
  $("#cancel-accent-picker").addEventListener("click", () => picker.close?.());
  $("#apply-accent-picker").addEventListener("click", () => {
    settings.accent = hsvDraftAccent;
    applyInterfaceSettings(settings);
    saveSettings();
    picker.close?.();
  });
}

function wireTabs() {
  for (const button of $$("[data-tab]")) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab, true));
    button.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$("[data-tab]");
      const index = tabs.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      setActiveTab(tabs[next].dataset.tab, true);
    });
  }
  for (const link of $$("[data-tab-link]")) link.addEventListener("click", event => { event.preventDefault(); setActiveTab(link.dataset.tabLink, true); });
  for (const button of $$("[data-open-tab]")) button.addEventListener("click", () => setActiveTab(button.dataset.openTab, true));
  window.addEventListener("popstate", () => setActiveTab(location.hash.slice(1) || "projects", false));
  window.addEventListener("hashchange", () => setActiveTab(location.hash.slice(1) || "projects", false));
                                                                                               
  setActiveTab(location.hash.slice(1) || "projects", false, false);
}

function githubRepoFromURL(value) {
  const url = safeURL(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0], repo = parts[1].replace(/\.git$/i, "");
    if (["features", "topics", "collections", "marketplace"].includes(owner.toLowerCase())) return null;
    return { owner, repo, key: `${owner}/${repo}` };
  } catch { return null; }
}

async function fetchGithubLatestRelease(repoInfo) {
  const cacheKey = GITHUB_CACHE_KEY + repoInfo.key.toLowerCase();
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && cached.savedAt && Date.now() - cached.savedAt < GITHUB_CACHE_AGE) return cached.data;
  } catch { /* Ignore invalid local metadata cache. */ }
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(repoInfo.repo)}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`GitHub API: HTTP ${response.status}`);
  const release = await response.json();
  const metadata = {
    published_at: release.published_at || release.created_at || "",
    assets: (release.assets || []).map(asset => ({ name: asset.name, size: asset.size, browser_download_url: asset.browser_download_url }))
  };
  try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: metadata })); } catch { /* Storage can be disabled. */ }
  return metadata;
}

function assetForDownload(project, assets) {
  const url = safeURL(project.download);
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const lastPart = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "").toLowerCase();
  if (!lastPart) return null;
                                                                                                                       
  const exact = assets.filter(asset => String(asset.name || "").toLowerCase() === lastPart);
  if (exact.length === 1) return exact[0];
  const githubReleaseLink = parsed.hostname.toLowerCase() === "github.com" && parsed.pathname.toLowerCase().includes("/releases/");
  if (githubReleaseLink && assets.length === 1) return assets[0];
  return null;
}

async function enrichGithubMetadata(projects) {
  const repoPromises = new Map();
  for (const project of projects) {
                                                                
    if ((project.updated && project.size) || !project.github) continue;
    const repoInfo = githubRepoFromURL(project.github);
    if (!repoInfo) continue;
    if (!repoPromises.has(repoInfo.key.toLowerCase())) repoPromises.set(repoInfo.key.toLowerCase(), fetchGithubLatestRelease(repoInfo).catch(error => {
      console.info(`Автоданные GitHub недоступны для ${repoInfo.key}:`, error.message);
      return null;
    }));
    project._repoKey = repoInfo.key.toLowerCase();
  }
  await Promise.all(projects.map(async project => {
    if (!project._repoKey || (project.updated && project.size)) return;
    const metadata = await repoPromises.get(project._repoKey);
    if (!metadata) return;
    if (!project.updated && metadata.published_at) {
      project.updated = metadata.published_at;
      project._updatedTimestamp = parseDate(project.updated);
      project._autoUpdated = true;
    }
    if (!project.size) {
      const asset = assetForDownload(project, metadata.assets);
      if (asset && Number.isFinite(Number(asset.size))) {
        project.size = formatBytes(Number(asset.size));
        project._autoSize = true;
      }
    }
  }));
}

async function loadProjectsFromSheet() {
  grid.setAttribute("aria-busy", "true");
  $("#refresh-projects").disabled = true;
  $("#refresh-projects").textContent = "Загружаю…";
  const cached = readCachedProjects();
  if (!isSheetURLConfigured()) {
    if (cached?.projects?.length) {
      allProjects = cached.projects;
      updateFilterOptions();
      renderProjects(true);
      setDataStatus("Показан локальный кеш. Добавь обычную ссылку Google Sheets в script.js, чтобы обновлять данные.", "info");
    } else {
      allProjects = [];
      updateFilterOptions();
      renderProjects(true);
      setDataStatus("Google Sheets пока не подключена. Вставь обычную ссылку на таблицу в начале script.js.", "info");
    }
    finishRefreshButton();
    grid.setAttribute("aria-busy", "false");
    return;
  }

  if (cached?.projects?.length && !allProjects.length) {
    allProjects = cached.projects;
    updateFilterOptions();
    renderProjects(true);
    setDataStatus("Показан сохранённый список. Проверяю обновления таблицы…", "info");
  }

  try {
    const source = getSheetSource();
    const response = await fetch(source.endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json,text/plain,*/*" }
    });
    if (!response.ok) throw new Error(`Google Sheets вернул HTTP ${response.status}`);
    const responseText = await response.text();
    const rows = parseGoogleVisualizationResponse(responseText);
    if (!rows.length) throw new Error("В таблице пока нет строк с проектами. Проверь заголовки в первой строке и данные ниже.");

    allProjects = normalizeProjects(rows);
    cacheProjects(allProjects);
    updateFilterOptions();
    renderProjects(true);
    setDataStatus(`Таблица загружена: ${allProjects.length} ${allProjects.length === 1 ? "проект" : "проектов"}.`, "success");

                                                                                            
    await enrichGithubMetadata(allProjects);
    cacheProjects(allProjects);
    updateFilterOptions();
    renderProjects(false);
    if (allProjects.some(project => project._autoUpdated || project._autoSize)) {
      setDataStatus("Таблица загружена. Дата релиза и/или размер некоторых GitHub-архивов получены автоматически; ручные значения имеют приоритет.", "success");
    }
  } catch (error) {
    console.error("Не удалось загрузить Google Sheets:", error);
    if (allProjects.length) {
      setDataStatus(`Не удалось обновить таблицу (${error.message}). Пока показаны ранее сохранённые данные.`, "error");
    } else {
      setDataStatus(`Не удалось загрузить таблицу: ${error.message}`, "error");
      renderProjects(true);
    }
  } finally {
    finishRefreshButton();
    grid.setAttribute("aria-busy", "false");
  }
}

function finishRefreshButton() {
  const button = $("#refresh-projects");
  button.disabled = false;
  button.innerHTML = '<span aria-hidden="true">↻</span> Обновить данные';
}

function init() {
  $("#current-year").textContent = String(new Date().getFullYear());
  wireInterfaceSettings();
  for (const select of [categoryFilter, statusFilter, sortSelect]) enhanceSelect(select);
  wireTabs();
  searchInput.addEventListener("input", () => {
    $("#clear-search").hidden = !searchInput.value;
    renderProjects(true);
  });
  $("#clear-search").addEventListener("click", () => {
    searchInput.value = "";
    $("#clear-search").hidden = true;
    searchInput.focus();
    renderProjects(true);
  });
  categoryFilter.addEventListener("change", () => renderProjects(true));
  statusFilter.addEventListener("change", () => renderProjects(true));
  sortSelect.addEventListener("change", () => renderProjects(true));
  $("#reset-filters").addEventListener("click", resetFilters);
  $("#empty-reset").addEventListener("click", resetFilters);
  $("#refresh-projects").addEventListener("click", loadProjectsFromSheet);
  showMoreButton.addEventListener("click", () => { visibleCount += PAGE_SIZE; renderProjects(false); });
  loadProjectsFromSheet();
}

init();
