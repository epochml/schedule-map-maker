document.addEventListener("DOMContentLoaded", () => {
  const manualScaleFactor = 0.86;
  const scaleFactor = 1.08;
  const els = {
    bottomPart: document.getElementById("bottom-part"),
    downloadMapBtn: document.getElementById("downloadMapBtn"),
    end: document.getElementById("end"),
    endMenu: document.getElementById("endMenu"),
    favoriteEnd: document.getElementById("favoriteEnd"),
    favoriteStart: document.getElementById("favoriteStart"),
    fitView: document.getElementById("fitView"),
    hallwayImage: document.getElementById("hallwayImage"),
    importStatus: document.getElementById("importStatus"),
    map: document.getElementById("map"),
    message: document.getElementById("message"),
    panzoomContainer: document.getElementById("panzoom-container"),
    pathForm: document.getElementById("pathForm"),
    reportIssueLink: document.getElementById("reportIssueLink"),
    start: document.getElementById("start"),
    startMenu: document.getElementById("startMenu"),
    swapRooms: document.getElementById("swapRooms"),
    svg: document.getElementById("mySvg"),
    viewTog: document.getElementById("viewTog"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
  };

  let currentScale = 1;
  let autoFindFromUrl = false;
  let isPanning = false;
  let lastPath = [];
  let lastPoints = [];
  let startPan = { x: 0, y: 0 };
  let touchDistance = null;
  let translate = { x: -390, y: -1410 };

  restoreInputs();
  setupMap();
  setupEvents();
  setPanelVisible(true);
  setupRoomPickers();

  function setupEvents() {
    els.pathForm.addEventListener("submit", (event) => {
      event.preventDefault();
      findPath();
    });
    els.start.addEventListener("input", () => {
      saveInput("path:start", els.start.value);
      updateFavoriteButtons();
      updateUrlParams();
    });
    els.end.addEventListener("input", () => {
      saveInput("path:end", els.end.value);
      updateFavoriteButtons();
      updateUrlParams();
    });
    els.downloadMapBtn.addEventListener("click", downloadMapImage);
    els.viewTog.addEventListener("click", togglePanel);
    els.fitView.addEventListener("click", fitCurrentRoute);
    els.favoriteStart.addEventListener("click", () => toggleFavoriteForInput(els.start));
    els.favoriteEnd.addEventListener("click", () => toggleFavoriteForInput(els.end));
    els.swapRooms.addEventListener("click", swapRooms);
    els.zoomIn.addEventListener("click", () => zoomAroundMapCenter(scaleFactor));
    els.zoomOut.addEventListener("click", () => zoomAroundMapCenter(1 / scaleFactor));
    document.addEventListener("keydown", (event) => {
      if (event.key === "+") zoomAroundMapCenter(scaleFactor);
      if (event.key === "-") zoomAroundMapCenter(1 / scaleFactor);
    });
    window.addEventListener("resize", () => {
      adjustSvgSize();
      if (lastPath.length) drawPath(lastPath, false);
    });
    window.addEventListener("mousemove", (event) => {
      if (!document.body.classList.contains("panel-closed")) return;
      if (window.innerHeight - event.clientY <= 18) setPanelVisible(true);
    });
  }

  function restoreInputs() {
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get("start");
    const endParam = params.get("end");
    autoFindFromUrl = Boolean(startParam && endParam);
    els.start.value = startParam || localStorage.getItem("path:start") || "";
    els.end.value = endParam || localStorage.getItem("path:end") || "";
    updateFavoriteButtons();
  }

  function saveInput(key, value) {
    localStorage.setItem(key, value);
  }

  async function setupRoomPickers() {
    try {
      const names = await window.RoomCombobox.loadRoomNames();
      window.RoomCombobox.attach(els.start, els.startMenu, names, (name) => {
        saveInput("path:start", name);
        updateFavoriteButtons();
        updateUrlParams();
      });
      window.RoomCombobox.attach(els.end, els.endMenu, names, (name) => {
        saveInput("path:end", name);
        updateFavoriteButtons();
        updateUrlParams();
      });
      if (autoFindFromUrl) findPath();
    } catch (error) {
      setMessage(error.message, "error");
    }
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
        zoomCanvas(event.deltaY < 0 ? scaleFactor : 1 / scaleFactor, event.clientX, event.clientY);
      },
      { passive: false }
    );
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

  async function findPath() {
    const start = els.start.value.trim();
    const end = els.end.value.trim();
    if (!start || !end) {
      setMessage("Choose both a start and destination.", "error");
      return;
    }

    setMessage("Finding path...", "pending");
    try {
      const json = await window.ScheduleMapEngine.getDirections(start, end);
      if (json.status === 1) {
        setMessage(json.error_message || "Path could not be found.", "error");
        setReportLink(
          "Report room/path issue",
          `Path failed: ${start} to ${end}`,
          `The route finder could not route from '${start}' to '${end}'.\n\nError:\n${json.error_message || "Unknown error"}`
        );
        return;
      }
      lastPath = json.path || [];
      const canonicalStart = lastPath[0]?.name || start;
      const canonicalEnd = lastPath.at(-1)?.name || end;
      els.start.value = canonicalStart;
      els.end.value = canonicalEnd;
      saveInput("path:start", canonicalStart);
      saveInput("path:end", canonicalEnd);
      drawPath(lastPath, true);
      window.RoomCombobox.addRecent(canonicalStart);
      window.RoomCombobox.addRecent(canonicalEnd);
      updateFavoriteButtons();
      updateUrlParams();
      setMessage(`Path found: ${canonicalStart} to ${canonicalEnd}.`, "ready");
      setReportLink(
        "Report route issue",
        `Bad route: ${canonicalStart} to ${canonicalEnd}`,
        `The route from '${canonicalStart}' to '${canonicalEnd}' looks wrong.\n\nPath returned:\n${lastPath.map((node) => node.name).join(" -> ")}`
      );
      setPanelVisible(false);
    } catch (error) {
      setMessage(error.message || "Path could not be found.", "error");
      setReportLink(
        "Report room/path issue",
        `Path failed: ${start} to ${end}`,
        `The route finder could not route from '${start}' to '${end}'.\n\nError:\n${error.message || "Unknown error"}`
      );
    }
  }

  function drawPath(path, centerAfterDraw) {
    els.svg.innerHTML = "";
    if (!path.length) return;

    const points = path.map(nodeToMapPoint);
    lastPoints = points;
    if (points.length === 1) {
      drawRing(points[0].x, points[0].y, "#00ADBF", 24);
    } else {
      const d = smoothPath(points, 18);
      els.svg.appendChild(
        createSvgElement("path", {
          d,
          fill: "none",
          stroke: "#00ADBF",
          "stroke-width": 5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        })
      );
      drawArrowhead(points.at(-2), points.at(-1), "#00ADBF");
      drawStairLabels(path, points);
      drawRing(points[0].x, points[0].y, "#58d68d", 18);
      drawRing(points.at(-1).x, points.at(-1).y, "#ffca91", 22);
    }

    if (centerAfterDraw) centerOnPoint(points[0], 2.2);
  }

  function drawStairLabels(path, points) {
    for (let i = 1; i < path.length; i++) {
      if (!isStairNode(path[i - 1]) || !isStairNode(path[i])) continue;
      const point = points[i - 1];
      const text = path[i].name.includes("F1") ? "Take stairs down" : "Take stairs up";
      const rect = createSvgElement("rect", {
        x: point.x + 8,
        y: point.y - 14,
        width: 122,
        height: 28,
        fill: "#ffca91",
        "fill-opacity": "0.78",
        rx: 4,
        ry: 4,
      });
      const label = createSvgElement("text", {
        x: point.x + 14,
        y: point.y + 5,
        fill: "#101316",
        "font-size": 12,
        "font-weight": "bold",
      });
      label.textContent = text;
      els.svg.append(rect, label);
    }
  }

  function drawArrowhead(from, to, color) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const length = 13;
    const baseX1 = to.x - length * Math.cos(angle - Math.PI / 7);
    const baseY1 = to.y - length * Math.sin(angle - Math.PI / 7);
    const baseX2 = to.x - length * Math.cos(angle + Math.PI / 7);
    const baseY2 = to.y - length * Math.sin(angle + Math.PI / 7);
    els.svg.appendChild(
      createSvgElement("path", {
        d: `M ${to.x} ${to.y} L ${baseX1} ${baseY1} L ${baseX2} ${baseY2} Z`,
        fill: color,
      })
    );
  }

  function drawRing(cx, cy, color, radius) {
    els.svg.appendChild(
      createSvgElement("circle", {
        cx,
        cy,
        r: radius,
        fill: "none",
        stroke: color,
        "stroke-width": 5,
      })
    );
  }

  function centerOnPoint(point, scale) {
    const rect = els.map.getBoundingClientRect();
    currentScale = scale;
    translate.x = rect.width / 2 - point.x * currentScale;
    translate.y = rect.height / 2 - point.y * currentScale;
    applyTransform();
  }

  function fitCurrentRoute() {
    if (!lastPoints.length) {
      resetMapView();
      return;
    }
    fitPoints(lastPoints, 90);
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
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    currentScale = Math.min(4.5, Math.max(0.35, Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height)));
    translate.x = rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * currentScale;
    translate.y = rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * currentScale;
    applyTransform();
  }

  function resetMapView() {
    currentScale = 1;
    translate = { x: -390, y: -1410 };
    applyTransform();
  }

  function swapRooms() {
    const start = els.start.value;
    els.start.value = els.end.value;
    els.end.value = start;
    saveInput("path:start", els.start.value);
    saveInput("path:end", els.end.value);
    updateFavoriteButtons();
    updateUrlParams();
  }

  function updateUrlParams() {
    const params = new URLSearchParams(window.location.search);
    setOrDeleteParam(params, "start", els.start.value.trim());
    setOrDeleteParam(params, "end", els.end.value.trim());
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function setOrDeleteParam(params, key, value) {
    if (value) params.set(key, value);
    else params.delete(key);
  }

  function toggleFavoriteForInput(input) {
    const value = input.value.trim();
    if (!value) return;
    window.RoomCombobox.toggleFavorite(value);
    updateFavoriteButtons();
  }

  function updateFavoriteButtons() {
    updateFavoriteButton(els.favoriteStart, els.start.value);
    updateFavoriteButton(els.favoriteEnd, els.end.value);
  }

  function updateFavoriteButton(button, value) {
    const active = window.RoomCombobox && window.RoomCombobox.isFavorite(value.trim());
    button.classList.toggle("active", Boolean(active));
    button.textContent = active ? "Saved" : "Fav";
  }

  function setReportLink(label, title, body) {
    els.reportIssueLink.hidden = false;
    els.reportIssueLink.textContent = label;
    els.reportIssueLink.href = buildReportUrl(title, body);
  }

  function buildReportUrl(title, body) {
    const params = new URLSearchParams({ title, body });
    return `https://github.com/1337isnot1337/schedule-map-maker/issues/new?${params.toString()}`;
  }

  function smoothPath(points, radius) {
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

  function nodeToMapPoint(node) {
    const width = getBaseWidth();
    const offset = 1320 / width;
    return {
      x: (node.x * manualScaleFactor) / offset,
      y: (node.y * manualScaleFactor) / offset,
    };
  }

  function isStairNode(node) {
    return /Stair.*F[12]$/.test(node.name);
  }

  function setMessage(message, state) {
    els.message.textContent = message;
    els.message.dataset.state = state;
    els.importStatus.textContent = message;
    els.importStatus.dataset.state = state;
  }

  function togglePanel() {
    setPanelVisible(document.body.classList.contains("panel-closed"));
  }

  function setPanelVisible(visible) {
    document.body.classList.toggle("panel-closed", !visible);
    els.viewTog.textContent = visible ? "Hide Panel" : "Show Panel";
    els.viewTog.title = visible ? "Hide the route panel" : "Show the route panel";
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
    const rect = els.map.getBoundingClientRect();
    zoomCanvas(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function zoomCanvas(factor, centerX, centerY) {
    const prevScale = currentScale;
    currentScale = Math.min(8, Math.max(0.2, currentScale * factor));
    if (currentScale === prevScale) return;
    const rect = els.panzoomContainer.getBoundingClientRect();
    const offsetX = centerX - rect.left;
    const offsetY = centerY - rect.top;
    const scaleChange = currentScale / prevScale - 1;
    translate.x -= offsetX * scaleChange;
    translate.y -= offsetY * scaleChange;
    applyTransform();
  }

  function downloadMapImage() {
    const svgData = new XMLSerializer().serializeToString(els.svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const canvas = document.createElement("canvas");
    canvas.width = els.hallwayImage.naturalWidth;
    canvas.height = els.hallwayImage.naturalHeight;
    const ctx = canvas.getContext("2d");
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = els.hallwayImage.src;
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const svgImage = new Image();
      svgImage.crossOrigin = "anonymous";
      svgImage.src = svgUrl;
      svgImage.onload = () => {
        ctx.drawImage(svgImage, 0, 0, canvas.width, canvas.height);
        const link = document.createElement("a");
        link.download = "direct-path.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        URL.revokeObjectURL(svgUrl);
      };
    };
  }

  function createSvgElement(tag, attrs) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const key in attrs) element.setAttribute(key, attrs[key]);
    return element;
  }
});
