document.addEventListener("DOMContentLoaded", () => {
  const manualScaleFactor = 0.86;
  const scaleFactor = 1.08;
  const els = {
    bottomPart: document.getElementById("bottom-part"),
    downloadMapBtn: document.getElementById("downloadMapBtn"),
    favoriteRoom: document.getElementById("favoriteRoom"),
    fitView: document.getElementById("fitView"),
    hallwayImage: document.getElementById("hallwayImage"),
    importStatus: document.getElementById("importStatus"),
    map: document.getElementById("map"),
    message: document.getElementById("message"),
    panzoomContainer: document.getElementById("panzoom-container"),
    room: document.getElementById("room"),
    roomForm: document.getElementById("roomForm"),
    roomMenu: document.getElementById("roomMenu"),
    reportIssueLink: document.getElementById("reportIssueLink"),
    svg: document.getElementById("mySvg"),
    viewTog: document.getElementById("viewTog"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
  };

  let currentScale = 1;
  let autoFindFromUrl = false;
  let isPanning = false;
  let lastRoom = null;
  let lastPoint = null;
  let startPan = { x: 0, y: 0 };
  let touchDistance = null;
  let translate = { x: -390, y: -1410 };

  restoreInput();
  setupMap();
  setupEvents();
  setPanelVisible(true);
  setupRoomPicker();

  function setupEvents() {
    els.roomForm.addEventListener("submit", (event) => {
      event.preventDefault();
      findRoom();
    });
    els.room.addEventListener("input", () => {
      localStorage.setItem("room:room", els.room.value);
      updateFavoriteButton();
      updateUrlParams();
    });
    els.downloadMapBtn.addEventListener("click", downloadMapImage);
    els.viewTog.addEventListener("click", togglePanel);
    els.fitView.addEventListener("click", fitCurrentRoom);
    els.favoriteRoom.addEventListener("click", toggleFavoriteRoom);
    els.zoomIn.addEventListener("click", () => zoomAroundMapCenter(scaleFactor));
    els.zoomOut.addEventListener("click", () => zoomAroundMapCenter(1 / scaleFactor));
    document.addEventListener("keydown", (event) => {
      if (event.key === "+") zoomAroundMapCenter(scaleFactor);
      if (event.key === "-") zoomAroundMapCenter(1 / scaleFactor);
    });
    window.addEventListener("resize", () => {
      adjustSvgSize();
      if (lastRoom) drawRoom(lastRoom, false);
    });
    window.addEventListener("mousemove", (event) => {
      if (!document.body.classList.contains("panel-closed")) return;
      if (window.innerHeight - event.clientY <= 18) setPanelVisible(true);
    });
  }

  function restoreInput() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    autoFindFromUrl = Boolean(roomParam);
    els.room.value = roomParam || localStorage.getItem("room:room") || "";
    updateFavoriteButton();
  }

  async function setupRoomPicker() {
    try {
      const names = await window.RoomCombobox.loadRoomNames();
      window.RoomCombobox.attach(els.room, els.roomMenu, names, (name) => {
        localStorage.setItem("room:room", name);
        updateFavoriteButton();
        updateUrlParams();
      });
      if (autoFindFromUrl) findRoom();
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

  async function findRoom() {
    const roomName = els.room.value.trim();
    if (!roomName) {
      setMessage("Choose a room or location.", "error");
      return;
    }

    setMessage("Finding room...", "pending");
    try {
      const json = await window.ScheduleMapEngine.findRoom(roomName);
      if (json.status === 1) {
        setMessage(json.error_message || "Room could not be found.", "error");
        setReportLink(
          "Report room issue",
          `Room lookup failed: ${roomName}`,
          `The room finder could not find '${roomName}'.\n\nError:\n${json.error_message || "Unknown error"}`
        );
        return;
      }
      lastRoom = json.room;
      els.room.value = lastRoom.name;
      localStorage.setItem("room:room", lastRoom.name);
      drawRoom(lastRoom, true);
      window.RoomCombobox.addRecent(lastRoom.name);
      updateFavoriteButton();
      updateUrlParams();
      setMessage(`Room found: ${lastRoom.name}.`, "ready");
      setReportLink(
        "Report room location issue",
        `Bad room location: ${lastRoom.name}`,
        `The marked location for '${lastRoom.name}' looks wrong.`
      );
      setPanelVisible(false);
    } catch (error) {
      setMessage(error.message || "Room could not be found.", "error");
      setReportLink(
        "Report room issue",
        `Room lookup failed: ${roomName}`,
        `The room finder could not find '${roomName}'.\n\nError:\n${error.message || "Unknown error"}`
      );
    }
  }

  function drawRoom(room, centerAfterDraw) {
    els.svg.innerHTML = "";
    const point = nodeToMapPoint(room);
    lastPoint = point;
    drawRing(point.x, point.y, "#ffca91", 40, 4);
    drawRing(point.x, point.y, "#00ADBF", 24, 5);
    drawLabel(point.x, point.y, room.name);
    if (centerAfterDraw) centerOnPoint(point);
  }

  function drawLabel(x, y, text) {
    const rectWidth = Math.max(64, text.length * 8 + 20);
    const rectHeight = 32;
    const rect = createSvgElement("rect", {
      x: x - rectWidth / 2,
      y: y - 58,
      width: rectWidth,
      height: rectHeight,
      fill: "#00ADBF",
      rx: 4,
      ry: 4,
    });
    const label = createSvgElement("text", {
      x,
      y: y - 37,
      fill: "#101316",
      "font-size": 14,
      "font-weight": "bold",
      "text-anchor": "middle",
    });
    label.textContent = text;
    els.svg.append(rect, label);
  }

  function drawRing(cx, cy, color, radius, strokeWidth) {
    els.svg.appendChild(
      createSvgElement("circle", {
        cx,
        cy,
        r: radius,
        fill: "none",
        stroke: color,
        "stroke-width": strokeWidth,
      })
    );
  }

  function centerOnPoint(point) {
    const rect = els.map.getBoundingClientRect();
    currentScale = 2.1;
    translate.x = rect.width / 2 - point.x * currentScale;
    translate.y = rect.height / 2 - point.y * currentScale;
    applyTransform();
  }

  function fitCurrentRoom() {
    if (!lastPoint) {
      resetMapView();
      return;
    }
    centerOnPoint(lastPoint);
  }

  function resetMapView() {
    currentScale = 1;
    translate = { x: -390, y: -1410 };
    applyTransform();
  }

  function updateUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const value = els.room.value.trim();
    if (value) params.set("room", value);
    else params.delete("room");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function toggleFavoriteRoom() {
    const value = els.room.value.trim();
    if (!value) return;
    window.RoomCombobox.toggleFavorite(value);
    updateFavoriteButton();
  }

  function updateFavoriteButton() {
    const active = window.RoomCombobox && window.RoomCombobox.isFavorite(els.room.value.trim());
    els.favoriteRoom.classList.toggle("active", Boolean(active));
    els.favoriteRoom.textContent = active ? "Saved" : "Fav";
  }

  function setReportLink(label, title, body) {
    els.reportIssueLink.hidden = false;
    els.reportIssueLink.textContent = label;
    els.reportIssueLink.href = buildReportUrl(title, body);
  }

  function buildReportUrl(title, body) {
    const params = new URLSearchParams({ title, body });
    return `https://github.com/epochml/schedule-map-maker/issues/new?${params.toString()}`;
  }

  function nodeToMapPoint(node) {
    const width = getBaseWidth();
    const offset = 1320 / width;
    return {
      x: (node.x * manualScaleFactor) / offset,
      y: (node.y * manualScaleFactor) / offset,
    };
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
    els.viewTog.title = visible ? "Hide the room panel" : "Show the room panel";
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
        link.download = "room-location.png";
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
