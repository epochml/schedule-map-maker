document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("schedule-app");

  const DAY_KEYS = ["aday", "bday", "cday", "dday", "iday"];
  const DAY_NAMES = {
    aday: "A Day",
    bday: "B Day",
    cday: "C Day",
    dday: "D Day",
    iday: "I Day",
  };
  const SEMESTERS = ["Semester 1", "Semester 2"];
  const routePalette = [
    "#d62728",
    "#ff7f0e",
    "#ffd400",
    "#2ca02c",
    "#00a6d6",
    "#1f77b4",
    "#6f42c1",
    "#c2185b",
    "#8c564b",
    "#17becf",
  ];
  const routeDashPatterns = ["", "10 6", "4 5", "14 5 3 5", "2 5"];
  const MUTED_ROUTE_OPACITY = 0.65;
  const HOVER_STICKY_DELAY_MS = 50;

  const els = {
    bottomPart: document.getElementById("bottom-part"),
    bookmarkletCard: document.getElementById("bookmarkletCard"),
    bookmarkletInstallLink: document.getElementById("bookmarkletInstallLink"),
    clearScheduleBtn: document.getElementById("clearScheduleBtn"),
    copyBookmarkletBtn: document.getElementById("copyBookmarkletBtn"),
    daySelector: document.getElementById("daySelector"),
    dayTabs: document.getElementById("dayTabs"),
    downloadMapBtn: document.getElementById("downloadMapBtn"),
    enterSelector: document.getElementById("enterSelector"),
    errorMessage: document.getElementById("error_message"),
    exampleSched: document.getElementById("exampleSched"),
    exitSelector: document.getElementById("exitSelector"),
    hallwayImage: document.getElementById("hallwayImage"),
    fitView: document.getElementById("fitView"),
    importStatus: document.getElementById("importStatus"),
    map: document.getElementById("map"),
    midday: document.getElementById("midday"),
    panzoomContainer: document.getElementById("panzoom-container"),
    panelPeek: document.getElementById("panelPeek"),
    parsePreview: document.getElementById("parsePreview"),
    pasteClipboardBtn: document.getElementById("pasteClipboardBtn"),
    scheduleBox: document.getElementById("scheduleBox"),
    scheduleDiagnostics: document.getElementById("scheduleDiagnostics"),
    scheduleForm: document.getElementById("scheduleForm"),
    scheduleInput: document.getElementById("scheduleInput"),
    semSelector: document.getElementById("semSelector"),
    semTabs: document.getElementById("semTabs"),
    submit: document.getElementById("submit"),
    svg: document.getElementById("mySvg"),
    toggleBookmarkletBtn: document.getElementById("toggleBookmarkletBtn"),
    tooltip: document.getElementById("tooltip"),
    viewTog: document.getElementById("viewTog"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
  };

  const persistedInputs = [
    "scheduleInput",
    "daySelector",
    "semSelector",
    "enterSelector",
    "exitSelector",
  ];
  const manualScaleFactor = 0.86;
  const scaleFactor = 1.08;
  const arrows = [];
  const labels = [];
  const legacyExamples = {};
  const routePointSets = [];

  let currentScale = 1;
  let focusedRouteIndex = null;
  let generatedSchedule = null;
  let generatedScheduleKey = "";
  let hasRendered = false;
  let hoveredRouteIndex = null;
  let hoverRouteTimer = null;
  let isPanning = false;
  let startPan = { x: 0, y: 0 };
  let touchDistance = null;
  let translate = { x: -390, y: -1410 };
  let validationResult = null;
  let validationTimer = null;
  let validationToken = 0;

  restoreInputs();
  setupBookmarklet();
  setupMap();
  setupEvents();
  syncAllTabs();
  setPanelVisible(true);
  updateEmptyPreview();

  if (els.scheduleInput.value.trim()) {
    queueValidation(0);
  }

  function setupEvents() {
    els.scheduleInput.addEventListener("input", () => {
      saveValue("scheduleInput", els.scheduleInput.value);
      invalidateGenerated(true);
      queueValidation();
    });

    els.scheduleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      generateAndRender();
    });

    els.pasteClipboardBtn.addEventListener("click", pasteFromClipboard);
    els.clearScheduleBtn.addEventListener("click", clearSchedule);
    els.exampleSched.addEventListener("change", applySelectedExample);
    els.toggleBookmarkletBtn.addEventListener("click", () => {
      els.bookmarkletCard.hidden = !els.bookmarkletCard.hidden;
    });
    els.copyBookmarkletBtn.addEventListener("click", copyBookmarklet);

    els.enterSelector.addEventListener("change", handleRouteSettingChange);
    els.exitSelector.addEventListener("change", handleRouteSettingChange);
    els.midday.addEventListener("change", handleRouteSettingChange);
    els.daySelector.addEventListener("change", () => {
      saveValue("daySelector", els.daySelector.value);
      syncTabs(els.dayTabs, els.daySelector.value);
      if (generatedSchedule) renderSelectedSchedule();
    });
    els.semSelector.addEventListener("change", () => {
      saveValue("semSelector", els.semSelector.value);
      syncTabs(els.semTabs, els.semSelector.value);
      if (generatedSchedule) renderSelectedSchedule();
    });

    els.dayTabs.addEventListener("click", (event) => handleTabClick(event, els.daySelector));
    els.semTabs.addEventListener("click", (event) => handleTabClick(event, els.semSelector));

    els.downloadMapBtn.addEventListener("click", downloadMapImage);
    els.viewTog.addEventListener("click", togglePanel);
    els.panelPeek.addEventListener("click", () => setPanelVisible(true));
    els.panelPeek.addEventListener("mouseenter", () => setPanelVisible(true));
    els.fitView.addEventListener("click", fitScheduleRoutes);
    els.zoomIn.addEventListener("click", () => zoomAroundMapCenter(scaleFactor));
    els.zoomOut.addEventListener("click", () => zoomAroundMapCenter(1 / scaleFactor));

    document.addEventListener("keydown", (event) => {
      if (event.key === "+") zoomAroundMapCenter(scaleFactor);
      if (event.key === "-") zoomAroundMapCenter(1 / scaleFactor);
    });

    window.addEventListener("resize", () => {
      adjustSvgSize();
      if (hasRendered) renderSelectedSchedule();
    });

    window.addEventListener("mousemove", (event) => {
      if (!document.body.classList.contains("panel-closed")) return;
      if (window.innerHeight - event.clientY <= 18) {
        setPanelVisible(true);
      }
    });

    window.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type !== "schedule-map-import" || typeof data.schedule !== "string") return;
      setScheduleText(data.schedule, "Imported from PowerSchool");
    });

    els.scheduleBox.addEventListener("click", (event) => {
      if (event.target.closest(".schedule-route-button")) return;
      clearFocusedRoute();
    });
  }

  function setupMap() {
    applyTransform();
    if (els.hallwayImage.complete) {
      adjustSvgSize();
    } else {
      els.hallwayImage.addEventListener("load", adjustSvgSize);
    }

    els.panzoomContainer.addEventListener("mousedown", (event) => {
      isPanning = true;
      startPan = { x: event.clientX - translate.x, y: event.clientY - translate.y };
      els.panzoomContainer.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (event) => {
      if (!isPanning) return;
      translate.x = event.clientX - startPan.x;
      translate.y = event.clientY - startPan.y;
      applyTransform();
    });

    window.addEventListener("mouseup", () => {
      if (!isPanning) return;
      isPanning = false;
      els.panzoomContainer.style.cursor = "grab";
    });

    els.panzoomContainer.style.cursor = "grab";
    els.panzoomContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
    els.panzoomContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    els.panzoomContainer.addEventListener("touchend", handleTouchEnd);
    els.panzoomContainer.addEventListener("touchcancel", handleTouchEnd);
    els.panzoomContainer.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const factor = event.deltaY < 0 ? scaleFactor : 1 / scaleFactor;
        zoomCanvas(factor, event.clientX, event.clientY);
      },
      { passive: false }
    );

    els.svg.addEventListener("mousemove", handleMouseMove);
    els.svg.addEventListener("mouseleave", () => {
      els.tooltip.style.display = "none";
    });
  }

  function handleTouchStart(event) {
    if (!event.touches.length) return;
    event.preventDefault();
    if (event.touches.length === 1) {
      touchDistance = null;
      isPanning = true;
      startPan = {
        x: event.touches[0].clientX - translate.x,
        y: event.touches[0].clientY - translate.y,
      };
    } else {
      isPanning = false;
      touchDistance = getTouchDistance(event.touches);
    }
  }

  function handleTouchMove(event) {
    if (!event.touches.length) return;
    event.preventDefault();
    if (event.touches.length === 1 && isPanning) {
      translate.x = event.touches[0].clientX - startPan.x;
      translate.y = event.touches[0].clientY - startPan.y;
      applyTransform();
      return;
    }
    if (event.touches.length >= 2) {
      const nextDistance = getTouchDistance(event.touches);
      const center = getTouchCenter(event.touches);
      if (touchDistance) zoomCanvas(nextDistance / touchDistance, center.x, center.y);
      touchDistance = nextDistance;
    }
  }

  function handleTouchEnd(event) {
    if (event.touches.length === 1) {
      touchDistance = null;
      isPanning = true;
      startPan = {
        x: event.touches[0].clientX - translate.x,
        y: event.touches[0].clientY - translate.y,
      };
      return;
    }
    isPanning = false;
    touchDistance = null;
  }

  function getTouchDistance(touches) {
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function getTouchCenter(touches) {
    const first = touches[0];
    const second = touches[1];
    return {
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
  }

  function restoreInputs() {
    for (const id of persistedInputs) {
      const element = document.getElementById(id);
      const saved = localStorage.getItem(id);
      if (saved !== null) element.value = saved;
    }

    const savedMidday = localStorage.getItem("midday");
    if (savedMidday !== null) {
      els.midday.checked = savedMidday === "true";
    }
  }

  function saveValue(id, value) {
    localStorage.setItem(id, value);
  }

  function handleRouteSettingChange(event) {
    const id = event.currentTarget.id;
    if (id === "midday") saveValue(id, event.currentTarget.checked);
    else saveValue(id, event.currentTarget.value);
    invalidateGenerated(false);
  }

  function handleTabClick(event, selectElement) {
    const button = event.target.closest(".tab-button");
    if (!button) return;
    selectElement.value = button.dataset.value;
    selectElement.dispatchEvent(new Event("change"));
  }

  function syncAllTabs() {
    syncTabs(els.semTabs, els.semSelector.value);
    syncTabs(els.dayTabs, els.daySelector.value);
  }

  function syncTabs(group, value) {
    for (const button of group.querySelectorAll(".tab-button")) {
      const active = button.dataset.value === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    }
  }

  function queueValidation(delay = 250) {
    clearTimeout(validationTimer);
    validationTimer = setTimeout(validateCurrentInput, delay);
  }

  async function validateCurrentInput() {
    const input = els.scheduleInput.value;
    const token = ++validationToken;

    if (!input.trim()) {
      validationResult = null;
      updateEmptyPreview();
      return null;
    }

    setImportStatus("Checking schedule", "pending");
    setSubmitEnabled(false);

    const result = await window.ScheduleMapEngine.validateSchedule(input);
    if (token !== validationToken || input !== els.scheduleInput.value) return null;

    validationResult = result;
    renderValidationPreview(result);
    setSubmitEnabled(result.status === 0);
    return result;
  }

  function updateEmptyPreview() {
    els.importStatus.textContent = "No schedule loaded";
    els.importStatus.dataset.state = "empty";
    setSubmitEnabled(false);
    clearNode(els.parsePreview);
    clearScheduleDiagnostics();

    const empty = document.createElement("div");
    empty.className = "preview-empty";
    empty.textContent = "Paste your PowerSchool Year Schedule, open PowerSchool, or use the bookmarklet to import.";
    els.parsePreview.appendChild(empty);
  }

  function renderValidationPreview(result) {
    clearNode(els.parsePreview);
    renderScheduleDiagnostics(result.issues || []);

    if (!result.semesters) {
      setImportStatus("Schedule needs attention", "error");
      const message = document.createElement("div");
      message.className = "preview-error";
      message.textContent = result.error_message || "Schedule could not be parsed.";
      els.parsePreview.appendChild(message);
      return;
    }

    els.parsePreview.appendChild(renderImportChecklist(result));

    if (result.status === 0) {
      setImportStatus("Schedule ready", "ready");
    } else {
      setImportStatus("Schedule needs attention", "error");
      const issueList = document.createElement("div");
      issueList.className = "preview-error";
      issueList.textContent = result.error_message;
      els.parsePreview.appendChild(issueList);
    }

    const summary = document.createElement("div");
    summary.className = "preview-summary";
    for (const semesterName of SEMESTERS) {
      const semester = result.semesters[semesterName];
      summary.appendChild(renderSemesterPreview(semesterName, semester));
    }
    els.parsePreview.appendChild(summary);
  }

  function renderImportChecklist(result) {
    const checklist = document.createElement("div");
    checklist.className = "import-checklist";
    const unknownRooms = (result.issues || []).filter((issue) => issue.code === "unknown_room").length;
    const checks = [
      ["Semester 1 found", Boolean(result.semesters?.["Semester 1"]?.totalRows)],
      ["Semester 2 found", Boolean(result.semesters?.["Semester 2"]?.totalRows)],
      [
        `${totalMappedClasses(result)} mapped class${totalMappedClasses(result) === 1 ? "" : "es"}`,
        totalMappedClasses(result) > 0,
      ],
      [`${unknownRooms} unknown room${unknownRooms === 1 ? "" : "s"}`, unknownRooms === 0],
    ];

    for (const [label, ok] of checks) {
      const item = document.createElement("span");
      item.className = `check-item ${ok ? "ok" : "bad"}`;
      item.textContent = `${ok ? "✓" : "!"} ${label}`;
      checklist.appendChild(item);
    }
    return checklist;
  }

  function totalMappedClasses(result) {
    return SEMESTERS.reduce(
      (total, semesterName) => total + (result.semesters?.[semesterName]?.classCount || 0),
      0
    );
  }

  function renderSemesterPreview(semesterName, semester) {
    const details = document.createElement("details");
    details.className = "semester-preview";
    details.open = true;

    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.textContent = semesterName;
    const count = document.createElement("span");
    count.className = "preview-count";
    count.textContent = `${semester.classCount} mapped classes`;
    summary.append(title, count);
    details.appendChild(summary);

    const dayCounts = document.createElement("div");
    dayCounts.className = "day-counts";
    for (const key of DAY_KEYS) {
      const day = key[0].toUpperCase();
      const chip = document.createElement("span");
      chip.className = "day-chip";
      chip.textContent = `${day}: ${semester.dayCounts[day] || 0}`;
      dayCounts.appendChild(chip);
    }
    details.appendChild(dayCounts);

    const table = document.createElement("table");
    table.className = "class-preview-table";
    const tbody = document.createElement("tbody");
    for (const klass of semester.classes.filter((item) => item.routeRelevant)) {
      const row = document.createElement("tr");
      if (!klass.roomFound) row.className = "row-warning";

      const course = document.createElement("td");
      course.textContent = klass.long_name || klass.short_name;
      const room = document.createElement("td");
      room.textContent = klass.room || "No room";
      const when = document.createElement("td");
      when.textContent = `${klass.days.join("")} / ${klass.mods.join("-")}`;
      row.append(course, room, when);
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    details.appendChild(table);
    return details;
  }

  async function generateAndRender() {
    const input = els.scheduleInput.value;
    const key = routeGenerationKey();

    if (!validationResult || validationResult.status !== 0) {
      const result = await validateCurrentInput();
      if (!result || result.status !== 0) return;
    }

    setSubmitBusy(true);
    els.errorMessage.textContent = "";

    try {
      if (!generatedSchedule || generatedScheduleKey !== key) {
        generatedSchedule = await window.ScheduleMapEngine.generateSchedule(
          input,
          els.enterSelector.value,
          els.exitSelector.value,
          els.midday.checked
        );
        generatedScheduleKey = key;
      }

      if (generatedSchedule.status === 1) {
        showError(generatedSchedule.error_message);
        return;
      }

      renderSelectedSchedule();
      hasRendered = true;
      setPanelVisible(false);
      setImportStatus("Map generated", "ready");
    } catch (error) {
      showError(error.message);
    } finally {
      setSubmitBusy(false);
    }
  }

  function renderSelectedSchedule() {
    if (!generatedSchedule || generatedSchedule.status === 1) return;
    applyTransform();

    const selectedDay = els.daySelector.value;
    const semesterType = els.semSelector.value;
    const semester = generatedSchedule[semesterType] || {};
    const currentDay = semester[selectedDay] || [];
    const segmentMap = new Map();
    const offsetSpacing = 3;

    els.svg.innerHTML = "";
    arrows.length = 0;
    labels.length = 0;
    routePointSets.length = 0;
    focusedRouteIndex = null;
    hoveredRouteIndex = null;

    for (const [pathIndex, path] of currentDay.entries()) {
      if (!path.nodes || path.nodes.length < 2) continue;
      routePointSets[pathIndex] = path.nodes.map(scheduleNodeToMapPoint);
      const pathDetails = {
        path: path.nodes,
        startName: path.nodes[0].name,
        endName: path.nodes[path.nodes.length - 1].name,
        info: path.info,
      };

      for (let i = 1; i < path.nodes.length; i++) {
        const width = getBaseWidth();
        const height = getBaseHeight();
        const node1 = path.nodes[i - 1];
        const node2 = path.nodes[i];
        const segKey = getSegmentKey(node1, node2);
        const existingCount = segmentMap.get(segKey) || 0;
        segmentMap.set(segKey, existingCount + 1);

        const dx = node2.x - node1.x;
        const dy = node2.y - node1.y;
        const len = Math.hypot(dx, dy) || 1;
        const dirX = dx / len;
        const dirY = dy / len;
        const orthoX = -dirY;
        const orthoY = dirX;
        const offset = offsetSpacing * existingCount;
        const xOffset = orthoX * offset;
        const yOffset = orthoY * offset;
        const x1 = (node1.x + xOffset) * manualScaleFactor;
        const y1 = (node1.y + yOffset) * manualScaleFactor;
        const x2 = (node2.x + xOffset) * manualScaleFactor;
        const y2 = (node2.y + yOffset) * manualScaleFactor;

        arrows.push({
          x1Pct: x1 / width,
          y1Pct: y1 / height,
          x2Pct: x2 / width,
          y2Pct: y2 / height,
          color: getRouteColor(pathIndex),
          routeIndex: pathIndex,
          name: node2.name,
          pathDetails,
          type: i === 1 ? "start" : i === path.nodes.length - 1 ? "end" : "mid",
          isStairTransition: isStairNode(node1) && isStairNode(node2),
        });
      }
    }

    renderScheduleBox(currentDay);
    adjustSvgSize();
    redrawArrows();
    els.errorMessage.textContent = currentDay.length
      ? ""
      : `No mapped routes for ${semesterType}, ${DAY_NAMES[selectedDay]}.`;
  }

  function renderScheduleBox(paths) {
    clearNode(els.scheduleBox);
    if (!paths.length) return;

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "schedule-clear-focus";
    clearButton.title = "Show all routes normally";
    clearButton.textContent = "Show all routes";
    clearButton.addEventListener("click", clearFocusedRoute);
    els.scheduleBox.appendChild(clearButton);

    for (const [index, path] of paths.entries()) {
      if (!path.nodes || !path.nodes.length) continue;
      const startName = path.nodes[0].name;
      const endName = path.nodes[path.nodes.length - 1].name;
      const line = document.createElement("button");
      line.type = "button";
      line.className = "schedule-line schedule-route-button";
      line.title = `Hover to preview this route. Click to lock or unlock focus.`;
      line.dataset.routeIndex = String(index);
      line.addEventListener("mouseenter", () => queueHoveredRoute(index));
      line.addEventListener("mouseleave", () => queueHoveredRoute(null));
      line.addEventListener("focus", () => queueHoveredRoute(index));
      line.addEventListener("blur", () => queueHoveredRoute(null));
      line.addEventListener("click", () => toggleFocusedRoute(index));

      const pill = document.createElement("div");
      pill.className = "schedule-pill";
      pill.style.backgroundColor = getRouteColor(index);

      const text = document.createElement("span");
      text.textContent = `${startName} → ${endName}`;

      line.append(pill, text);
      els.scheduleBox.appendChild(line);
    }
  }

  function getRouteColor(index) {
    return routePalette[index % routePalette.length];
  }

  function getRouteDash(index) {
    return routeDashPatterns[index % routeDashPatterns.length];
  }

  function queueHoveredRoute(index) {
    clearTimeout(hoverRouteTimer);
    hoverRouteTimer = window.setTimeout(() => {
      setHoveredRoute(index);
    }, HOVER_STICKY_DELAY_MS);
  }

  function setHoveredRoute(index) {
    hoveredRouteIndex = index;
    redrawArrows();
    syncScheduleRouteButtons();
  }

  function toggleFocusedRoute(index) {
    focusedRouteIndex = focusedRouteIndex === index ? null : index;
    hoveredRouteIndex = null;
    redrawArrows();
    syncScheduleRouteButtons();
    if (focusedRouteIndex !== null) fitScheduleRoutes();
  }

  function clearFocusedRoute() {
    focusedRouteIndex = null;
    hoveredRouteIndex = null;
    redrawArrows();
    syncScheduleRouteButtons();
  }

  function activeRouteIndex() {
    return hoveredRouteIndex !== null ? hoveredRouteIndex : focusedRouteIndex;
  }

  function syncScheduleRouteButtons() {
    const active = activeRouteIndex();
    for (const button of els.scheduleBox.querySelectorAll(".schedule-route-button")) {
      const routeIndex = Number(button.dataset.routeIndex);
      button.classList.toggle("active", routeIndex === active);
      button.classList.toggle("muted", active !== null && routeIndex !== active);
    }
  }

  function getSegmentKey(n1, n2) {
    const id1 = `${n1.x},${n1.y}`;
    const id2 = `${n2.x},${n2.y}`;
    return [id1, id2].sort().join("|");
  }

  function routeGenerationKey() {
    return JSON.stringify({
      input: els.scheduleInput.value,
      enter: els.enterSelector.value,
      exit: els.exitSelector.value,
      midday: els.midday.checked,
    });
  }

  function invalidateGenerated(clearMap) {
    generatedSchedule = null;
    generatedScheduleKey = "";
    if (!clearMap) return;
    hasRendered = false;
    arrows.length = 0;
    labels.length = 0;
    els.svg.innerHTML = "";
    clearNode(els.scheduleBox);
    els.errorMessage.textContent = "";
  }

  function showError(message) {
    els.errorMessage.textContent = message
      ? `There was an error: ${message}`
      : "There was an error generating the map.";
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setScheduleText(text, "Pasted from clipboard");
    } catch (_error) {
      showError("Clipboard paste is blocked by this browser. Paste into the text box instead.");
    }
  }

  function clearSchedule() {
    els.scheduleInput.value = "";
    saveValue("scheduleInput", "");
    validationResult = null;
    invalidateGenerated(true);
    updateEmptyPreview();
    els.scheduleInput.focus();
  }

  function setScheduleText(text, statusText) {
    els.scheduleInput.value = text;
    saveValue("scheduleInput", text);
    invalidateGenerated(true);
    setImportStatus(statusText, "pending");
    queueValidation(0);
  }

  async function applySelectedExample() {
    const key = els.exampleSched.value;
    if (key === "no_ex") return;

    try {
      const text = await loadLegacyExample(key);
      setScheduleText(text, "Example loaded");
    } catch (error) {
      showError(error.message);
    } finally {
      els.exampleSched.value = "no_ex";
    }
  }

  async function loadLegacyExample(key) {
    if (legacyExamples[key]) return legacyExamples[key];
    const response = await fetch("/assets/input/script.js", { cache: "force-cache" });
    if (!response.ok) throw new Error("Could not load examples.");
    const source = await response.text();
    const match = source.match(new RegExp(`const ${key} = \`([\\s\\S]*?)\``));
    if (!match) throw new Error("Example was not found.");
    legacyExamples[key] = match[1];
    return legacyExamples[key];
  }

  function setupBookmarklet() {
    const href = buildBookmarkletHref();
    els.bookmarkletInstallLink.href = href;
  }

  function buildBookmarkletHref() {
    const target = new URL("/", window.location.href).href;
    const origin = new URL(target).origin;
    const source = `(function(){var target=${JSON.stringify(target)};var origin=${JSON.stringify(origin)};function clean(value){return String(value||"").replace(/\\u00a0/g," ").replace(/[ \\t]+/g," ").trim()}function rowText(row){return Array.prototype.slice.call(row.cells||[]).map(function(cell){return clean(cell.innerText||cell.textContent)}).filter(Boolean).join("\\t")}function looksLike(line){return /Semester\\s+[12]/i.test(line)||/^Exp\\s+Trm\\s+Crs-Sec/i.test(line)||/^[A-Za-z0-9-]+\\([^)]+\\)\\s+/.test(line)}function hasSemester(line,n){return new RegExp("Semester\\\\s+"+n,"i").test(line)}var tableLines=Array.prototype.slice.call(document.querySelectorAll("tr")).map(rowText).filter(looksLike);var bodyLines=((document.body&&document.body.innerText)||"").split(/\\r?\\n/).map(clean).filter(looksLike);var lines=tableLines.length>=bodyLines.length?tableLines:bodyLines;if(tableLines.length){var joined=lines.join("\\n");var semesterLines=bodyLines.filter(function(line){return /Semester\\s+[12]/i.test(line)});if(!hasSemester(joined,1)&&semesterLines[0])lines.unshift(semesterLines[0]);if(!hasSemester(joined,2)&&semesterLines[1]){var secondHeader=lines.findIndex(function(line,index){return index>0&&/^Exp\\s+Trm\\s+Crs-Sec/i.test(line)});lines.splice(secondHeader>0?secondHeader:Math.ceil(lines.length/2),0,semesterLines[1])}}if(!lines.length){alert("No PowerSchool schedule rows found.");return}var schedule=lines.join("\\n");var win=window.open(target,"_blank");function send(){if(win&&!win.closed)win.postMessage({type:"schedule-map-import",schedule:schedule},origin)}setTimeout(send,700);setTimeout(send,1600);setTimeout(send,2800);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(schedule).catch(function(){})})();`;
    return `javascript:${source}`;
  }

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(els.bookmarkletInstallLink.href);
      els.copyBookmarkletBtn.textContent = "Copied";
      setTimeout(() => {
        els.copyBookmarkletBtn.textContent = "Copy";
      }, 1400);
    } catch (_error) {
      showError("Could not copy the bookmarklet.");
    }
  }

  function setImportStatus(text, state) {
    els.importStatus.textContent = text;
    els.importStatus.dataset.state = state;
  }

  function setSubmitEnabled(enabled) {
    els.submit.disabled = !enabled;
  }

  function setSubmitBusy(busy) {
    els.submit.disabled = busy || !validationResult || validationResult.status !== 0;
    els.submit.textContent = busy ? "Generating..." : hasRendered ? "Update Map" : "Generate Map";
  }

  function togglePanel() {
    setPanelVisible(document.body.classList.contains("panel-closed"));
  }

  function setPanelVisible(visible) {
    document.body.classList.toggle("panel-closed", !visible);
    els.viewTog.textContent = visible ? "Hide Panel" : "Show Panel";
    els.viewTog.title = visible ? "Hide the import panel" : "Show the import panel";
    els.panelPeek.setAttribute("aria-hidden", visible ? "true" : "false");
    els.panelPeek.tabIndex = visible ? -1 : 0;
  }

  function adjustSvgSize() {
    const width = getBaseWidth();
    const height = getBaseHeight();
    if (!width || !height) return;
    els.panzoomContainer.style.width = `${width}px`;
    els.panzoomContainer.style.height = `${height}px`;
    els.svg.style.width = `${width}px`;
    els.svg.style.height = `${height}px`;
    els.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  function getBaseWidth() {
    return els.hallwayImage.naturalWidth || els.hallwayImage.width || 0;
  }

  function getBaseHeight() {
    return els.hallwayImage.naturalHeight || els.hallwayImage.height || 0;
  }

  function applyTransform() {
    els.panzoomContainer.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${currentScale})`;
  }

  function zoomAroundMapCenter(factor) {
    const mapRect = els.map.getBoundingClientRect();
    zoomCanvas(factor, mapRect.left + mapRect.width / 2, mapRect.top + mapRect.height / 2);
  }

  function zoomCanvas(factor, centerX, centerY) {
    const prevScale = currentScale;
    currentScale = Math.min(8, Math.max(0.2, currentScale * factor));
    if (currentScale === prevScale) return;

    if (centerX != null && centerY != null) {
      const rect = els.panzoomContainer.getBoundingClientRect();
      const offsetX = centerX - rect.left;
      const offsetY = centerY - rect.top;
      const scaleChange = currentScale / prevScale - 1;
      translate.x -= offsetX * scaleChange;
      translate.y -= offsetY * scaleChange;
    }
    applyTransform();
    if (hasRendered) redrawArrows();
  }

  function createSvgElement(tag, attrs) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const key in attrs) {
      element.setAttribute(key, attrs[key]);
    }
    return element;
  }

  function isStairNode(node) {
    return /Stair.*F[12]$/.test(node.name);
  }

  function handleMouseMove(event) {
    const { mouseX, mouseY } = getMousePosition(event);
    let tooltipVisible = false;

    for (const label of labels) {
      const inside =
        mouseX >= label.x &&
        mouseX <= label.x + label.width &&
        mouseY >= label.y &&
        mouseY <= label.y + label.height;
      if (!inside) continue;

      renderTooltip(label);
      els.tooltip.style.display = "block";
      els.tooltip.style.left = `${event.clientX + window.scrollX + 5}px`;
      els.tooltip.style.top = `${event.clientY + window.scrollY + 5}px`;
      els.tooltip.style.border = `1px solid ${label.color}`;
      els.tooltip.style.backgroundColor = label.color;
      els.tooltip.style.color = shouldUseDarkText(label.color) ? "black" : "white";
      tooltipVisible = true;
    }

    if (!tooltipVisible) {
      els.tooltip.style.display = "none";
    }
  }

  function renderTooltip(label) {
    clearNode(els.tooltip);

    const title = document.createElement("strong");
    title.textContent = label.name;
    els.tooltip.appendChild(title);

    const route = document.createElement("div");
    route.textContent = `Route: ${label.pathDetails.startName} → ${label.pathDetails.endName}`;
    els.tooltip.appendChild(route);

    const info = label.pathDetails.info && label.pathDetails.info[1];
    if (!info) return;

    const details = [
      `Course: ${info.long_name} (${info.short_name})`,
      `Instructor: ${info.teacher}`,
      `Room: ${info.room}`,
      `Semester: ${info.semester}`,
      `Days: ${info.days.join(", ")}`,
      `Mods: ${info.mods.join(", ")}`,
    ];

    for (const line of details) {
      const item = document.createElement("div");
      item.textContent = line;
      els.tooltip.appendChild(item);
    }
  }

  function getMousePosition(event) {
    const rect = els.panzoomContainer.getBoundingClientRect();
    return {
      mouseX: (event.clientX - rect.left) / currentScale,
      mouseY: (event.clientY - rect.top) / currentScale,
    };
  }

  function scheduleNodeToMapPoint(node) {
    const width = getBaseWidth() || 1320;
    const offset = 1320 / width;
    return {
      x: (node.x * manualScaleFactor) / offset,
      y: (node.y * manualScaleFactor) / offset,
    };
  }

  function fitScheduleRoutes() {
    const active = focusedRouteIndex;
    const points =
      active !== null
        ? routePointSets[active] || []
        : routePointSets.flat().filter(Boolean);
    if (!points.length) {
      resetMapView();
      return;
    }
    fitPoints(points, 80);
  }

  function fitPoints(points, padding) {
    const rect = els.map.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const bounds = points.reduce(
      (box, point) => ({
        minX: Math.min(box.minX, point.x),
        minY: Math.min(box.minY, point.y),
        maxX: Math.max(box.maxX, point.x),
        maxY: Math.max(box.maxY, point.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );
    const routeWidth = Math.max(1, bounds.maxX - bounds.minX);
    const routeHeight = Math.max(1, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(80, rect.width - padding * 2);
    const availableHeight = Math.max(80, rect.height - padding * 2);
    currentScale = Math.min(4.5, Math.max(0.35, Math.min(availableWidth / routeWidth, availableHeight / routeHeight)));
    translate.x = rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * currentScale;
    translate.y = rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * currentScale;
    applyTransform();
    redrawArrows();
  }

  function resetMapView() {
    currentScale = 1;
    translate = { x: -390, y: -1410 };
    applyTransform();
    if (hasRendered) redrawArrows();
  }

  function redrawArrows() {
    labels.length = 0;
    els.svg.innerHTML = "";

    const width = getBaseWidth();
    const height = getBaseHeight();
    if (!width || !height) return;

    const offset = 1320 / width;
    let run = null;
    const active = activeRouteIndex();

    for (let i = 0; i < arrows.length; i++) {
      const cur = arrows[i];
      const x = (cur.x1Pct * width) / offset;
      const y = (cur.y1Pct * height) / offset;
      const nextX = (cur.x2Pct * width) / offset;
      const nextY = (cur.y2Pct * height) / offset;

      if (cur.isStairTransition) {
        flushRouteRun();
        const opacity = active !== null && cur.routeIndex !== active ? MUTED_ROUTE_OPACITY : 1;
        drawCircle(x, y, cur.color, opacity);
        drawCircle(nextX, nextY, cur.color, opacity);
        drawStairLabel(x, y, cur.name.includes("F1") ? "Take stairs down" : "Take stairs up", cur.color, opacity);
        continue;
      }

      if (!run || run.color !== cur.color || cur.type === "start") {
        flushRouteRun();
        run = {
          color: cur.color,
          routeIndex: cur.routeIndex,
          points: [{ x, y }],
          segments: [],
          labels: [],
        };
      }

      run.points.push({ x: nextX, y: nextY });
      run.segments.push({ x, y, nextX, nextY, color: cur.color });

      if (cur.type === "end") {
        run.labels.push({ x: nextX, y: nextY, cur });
        flushRouteRun();
      }
    }

    flushRouteRun();

    function flushRouteRun() {
      if (!run) return;
      if (run.points.length > 1) {
        const isMuted = active !== null && run.routeIndex !== active;
        const path = createSvgElement("path", {
          d: roundedPath(run.points, 18),
          fill: "none",
          stroke: run.color,
          "stroke-width": isMuted ? 2 : 3.4,
          "stroke-opacity": isMuted ? MUTED_ROUTE_OPACITY : 0.95,
          "stroke-dasharray": getRouteDash(run.routeIndex),
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        });
        path.classList.add("route-path");
        els.svg.appendChild(path);
        run.segments.forEach((segment, index) => {
          if (!isMuted && index % 4 === 0) {
            drawArrowhead(segment.x, segment.y, segment.nextX, segment.nextY, segment.color, 1.3 / currentScale);
          }
        });
      }
      for (const label of run.labels) {
        drawRoomLabel(label.x, label.y, label.cur);
      }
      run = null;
    }
  }

  function roundedPath(points, radius) {
    if (points.length < 3) {
      return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const next = points[i + 1];
      const inLen = Math.hypot(current.x - prev.x, current.y - prev.y) || 1;
      const outLen = Math.hypot(next.x - current.x, next.y - current.y) || 1;
      const curve = Math.min(radius, inLen / 2, outLen / 2);
      const before = {
        x: current.x - ((current.x - prev.x) / inLen) * curve,
        y: current.y - ((current.y - prev.y) / inLen) * curve,
      };
      const after = {
        x: current.x + ((next.x - current.x) / outLen) * curve,
        y: current.y + ((next.y - current.y) / outLen) * curve,
      };
      d += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
    }

    const last = points[points.length - 1];
    return `${d} L ${last.x} ${last.y}`;
  }

  function drawCircle(cx, cy, color, opacity = 1) {
    const circle = createSvgElement("circle", {
      cx,
      cy,
      r: 8 / currentScale,
      fill: color,
      "fill-opacity": opacity,
      stroke: "black",
      "stroke-width": 1,
    });
    els.svg.appendChild(circle);
  }

  function drawStairLabel(x, y, text, color, opacity = 1) {
    const rect = createSvgElement("rect", {
      x: x + 5,
      y: y - 10,
      width: 120,
      height: 30,
      fill: color,
      "fill-opacity": String(0.55 * opacity),
      rx: 4,
      ry: 4,
    });
    const label = createSvgElement("text", {
      x: x + 10,
      y: y + 5,
      "font-weight": "bold",
      fill: shouldUseDarkText(color) ? "black" : "white",
      "fill-opacity": opacity,
      "font-size": 12,
    });
    label.textContent = text;
    els.svg.append(rect, label);
  }

  function drawRoomLabel(x, y, cur) {
    const fontSize = 12;
    const paddingX = 8;
    const paddingY = 4;
    const measure = createSvgElement("text", {
      x: 0,
      y: 0,
      "font-size": fontSize,
      "font-weight": "bold",
      fill: "white",
    });
    measure.textContent = cur.name;
    els.svg.appendChild(measure);
    const bbox = measure.getBBox();
    els.svg.removeChild(measure);

    const rectWidth = bbox.width + paddingX * 2;
    const rectHeight = bbox.height + paddingY * 2;
    const rectX = x + 5;
    const rectY = y - rectHeight / 2;
    const rect = createSvgElement("rect", {
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight,
      fill: cur.color,
      "fill-opacity": activeRouteIndex() !== null && cur.routeIndex !== activeRouteIndex() ? MUTED_ROUTE_OPACITY : 1,
      stroke: "black",
      "stroke-width": 1,
      rx: 4,
      ry: 4,
    });
    const text = createSvgElement("text", {
      x: rectX + rectWidth / 2,
      y: rectY + rectHeight / 2 + bbox.height / 3,
      "text-anchor": "middle",
      "font-size": fontSize,
      "font-weight": "bold",
      fill: shouldUseDarkText(cur.color) ? "black" : "white",
      "fill-opacity": activeRouteIndex() !== null && cur.routeIndex !== activeRouteIndex() ? MUTED_ROUTE_OPACITY : 1,
    });
    text.textContent = cur.name;
    els.svg.append(rect, text);
    labels.push({
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight,
      color: cur.color,
      name: cur.name,
      routeIndex: cur.routeIndex,
      pathDetails: cur.pathDetails,
    });
  }

  function drawArrowhead(x1, y1, x2, y2, color, scale) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 6 * (scale || 1);
    const tipX = x2;
    const tipY = y2;
    const baseX1 = tipX - arrowLength * Math.cos(angle - Math.PI / 14);
    const baseY1 = tipY - arrowLength * Math.sin(angle - Math.PI / 14);
    const baseX2 = tipX - arrowLength * Math.cos(angle + Math.PI / 14);
    const baseY2 = tipY - arrowLength * Math.sin(angle + Math.PI / 14);
    const darkerColor = darkenColor(color, 0.6);
    els.svg.append(
      createSvgElement("line", {
        x1: tipX,
        y1: tipY,
        x2: baseX1,
        y2: baseY1,
        stroke: darkerColor,
        "stroke-width": 1,
      }),
      createSvgElement("line", {
        x1: tipX,
        y1: tipY,
        x2: baseX2,
        y2: baseY2,
        stroke: darkerColor,
        "stroke-width": 1,
      })
    );
  }

  function downloadMapImage() {
    const svgData = new XMLSerializer().serializeToString(els.svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const canvas = document.createElement("canvas");
    canvas.width = els.hallwayImage.naturalWidth;
    canvas.height = els.hallwayImage.naturalHeight;
    const ctx = canvas.getContext("2d");
    const imgObj = new Image();
    imgObj.crossOrigin = "anonymous";
    imgObj.src = els.hallwayImage.src;

    imgObj.onload = () => {
      ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);
      const svgImg = new Image();
      svgImg.crossOrigin = "anonymous";
      svgImg.src = svgUrl;
      svgImg.onload = () => {
        ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);
        const link = document.createElement("a");
        link.download = "schedule-map.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        URL.revokeObjectURL(svgUrl);
      };
    };
  }

  function shouldUseDarkText(color) {
    const rgb = parseColor(color);
    if (!rgb) return color === "yellow" || color === "cyan" || color === "chartreuse";
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 > 150;
  }

  function darkenColor(color, factor = 0.7) {
    const rgb = parseColor(color);
    if (!rgb) return color;
    const { r, g, b } = rgb;

    return `rgb(${Math.max(0, Math.floor(r * factor))}, ${Math.max(
      0,
      Math.floor(g * factor)
    )}, ${Math.max(0, Math.floor(b * factor))})`;
  }

  function parseColor(color) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (computed.startsWith("#")) {
      const cleanHex = computed.replace(/^#/, "");
      const normalized =
        cleanHex.length === 3
          ? cleanHex
              .split("")
              .map((char) => char + char)
              .join("")
          : cleanHex;
      const num = parseInt(normalized, 16);
      return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    const rgbMatch = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!rgbMatch) return null;
    const [r, g, b] = rgbMatch.slice(1, 4).map(Number);
    return { r, g, b };
  }

  function renderScheduleDiagnostics(issues) {
    clearScheduleDiagnostics();
    const lineIssues = (issues || [])
      .filter((issue) => issue.lineNumber)
      .sort(
        (a, b) =>
          a.lineNumber - b.lineNumber ||
          (a.columnStart || 0) - (b.columnStart || 0)
      );
    if (!lineIssues.length) return;

    els.scheduleDiagnostics.hidden = false;
    const heading = document.createElement("div");
    heading.className = "diagnostics-heading";
    heading.textContent = "Schedule issues";
    els.scheduleDiagnostics.appendChild(heading);

    const lines = els.scheduleInput.value.split(/\r?\n/);
    const grouped = new Map();
    for (const issue of lineIssues) {
      if (!grouped.has(issue.lineNumber)) grouped.set(issue.lineNumber, []);
      grouped.get(issue.lineNumber).push(issue);
    }

    for (const [lineNumber, issuesForLine] of grouped) {
      const line = lines[lineNumber - 1] || "";
      const row = document.createElement("div");
      row.className = "diagnostic-line";

      const number = document.createElement("span");
      number.className = "diagnostic-line-number";
      number.textContent = String(lineNumber).padStart(2, " ");
      row.appendChild(number);

      const content = document.createElement("div");
      content.className = "diagnostic-content";

      const code = document.createElement("code");
      code.className = "diagnostic-code";
      appendHighlightedLine(code, line, issuesForLine);
      content.appendChild(code);

      const actions = renderDiagnosticActions(issuesForLine);
      if (actions) content.appendChild(actions);
      row.appendChild(content);

      els.scheduleDiagnostics.appendChild(row);
    }
  }

  function renderDiagnosticActions(issues) {
    const actionable = issues.filter((issue) => issue.code === "unknown_room");
    if (!actionable.length) return null;

    const actions = document.createElement("div");
    actions.className = "diagnostic-actions";
    for (const issue of actionable) {
      for (const suggestion of issue.suggestions || []) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button compact-button diagnostic-action";
        button.title = `Replace ${issue.value} with ${suggestion}`;
        button.textContent = `Use ${suggestion}`;
        button.addEventListener("click", () => applyScheduleSuggestion(issue, suggestion));
        actions.appendChild(button);
      }

      const report = document.createElement("a");
      report.className = "diagnostic-report-link";
      report.title = `Report missing room ${issue.value}`;
      report.target = "_blank";
      report.rel = "noopener noreferrer";
      report.href = buildReportUrl(
        `Missing room in schedule import: ${issue.value}`,
        `Schedule validation could not find room '${issue.value}' on line ${issue.lineNumber}.\n\nOriginal row:\n${getScheduleLine(issue.lineNumber)}`
      );
      report.textContent = "Report room";
      actions.appendChild(report);
    }
    return actions;
  }

  function applyScheduleSuggestion(issue, suggestion) {
    const lines = els.scheduleInput.value.split(/\r?\n/);
    const index = Math.max(0, (issue.lineNumber || 1) - 1);
    const line = lines[index] || "";
    const start = Math.max(0, Math.min(issue.columnStart || 0, line.length));
    const end = Math.max(start, Math.min(issue.columnEnd || start, line.length));
    lines[index] = `${line.slice(0, start)}${suggestion}${line.slice(end)}`;
    setScheduleText(lines.join("\n"), `Changed ${issue.value} to ${suggestion}`);
    els.scheduleInput.focus();
  }

  function getScheduleLine(lineNumber) {
    return els.scheduleInput.value.split(/\r?\n/)[Math.max(0, (lineNumber || 1) - 1)] || "";
  }

  function buildReportUrl(title, body) {
    const params = new URLSearchParams({ title, body });
    return `https://github.com/epochml/schedule-map-maker/issues/new?${params.toString()}`;
  }

  function appendHighlightedLine(container, line, issues) {
    const normalized = issues
      .map((issue) => ({
        ...issue,
        columnStart: Math.max(0, Math.min(issue.columnStart || 0, line.length)),
        columnEnd: Math.max(1, Math.min(issue.columnEnd || line.length || 1, line.length || 1)),
      }))
      .sort((a, b) => a.columnStart - b.columnStart);
    let cursor = 0;

    for (const issue of normalized) {
      if (issue.columnStart > cursor) {
        container.appendChild(document.createTextNode(line.slice(cursor, issue.columnStart)));
      }
      const mark = document.createElement("mark");
      mark.className = "schedule-error-mark";
      mark.title = issue.message;
      const text = line.slice(issue.columnStart, issue.columnEnd) || line || " ";
      mark.textContent = text;
      container.appendChild(mark);
      cursor = Math.max(cursor, issue.columnEnd);
    }

    if (cursor < line.length) {
      container.appendChild(document.createTextNode(line.slice(cursor)));
    }
  }

  function clearScheduleDiagnostics() {
    clearNode(els.scheduleDiagnostics);
    els.scheduleDiagnostics.hidden = true;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
});
