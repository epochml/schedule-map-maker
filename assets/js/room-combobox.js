(function () {
  const RECENTS_KEY = "roomPicker:recentRooms";
  const FAVORITES_KEY = "roomPicker:favoriteRooms";
  const MAX_RECENTS = 8;
  const ASSET_BASE = resolveAssetBase();
  let roomNamesPromise = null;

  async function loadRoomNames() {
    if (roomNamesPromise) return roomNamesPromise;
    roomNamesPromise = fetch(new URL("nodes.json", ASSET_BASE).href, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load rooms: ${response.status}`);
        return response.json();
      })
      .then((nodes) =>
        Array.from(new Set(nodes.map((node) => node.name).filter(Boolean))).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        )
      );
    return roomNamesPromise;
  }

  function resolveAssetBase() {
    if (typeof document !== "undefined" && document.currentScript?.src) {
      return new URL("../", document.currentScript.src).href;
    }
    return "/assets/";
  }

  function attach(input, menu, names, onSelect, options = {}) {
    let activeIndex = -1;
    let matches = [];
    const recentKey = options.recentKey || RECENTS_KEY;
    const favoritesKey = options.favoritesKey || FAVORITES_KEY;

    function render() {
      matches = rankMatches(names, input.value, {
        recent: loadStoredRooms(recentKey),
        favorites: loadStoredRooms(favoritesKey),
      });
      menu.innerHTML = "";
      activeIndex = matches.length ? 0 : -1;
      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "room-combobox-empty";
        empty.textContent = "No matching rooms";
        menu.appendChild(empty);
      }
      for (const [index, name] of matches.entries()) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "room-combobox-option";
        if (isFavorite(name, favoritesKey)) option.classList.add("favorite");
        option.textContent = name;
        option.title = name;
        option.dataset.index = String(index);
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(index);
        });
        menu.appendChild(option);
      }
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function choose(index) {
      const name = matches[index];
      if (!name) return;
      input.value = name;
      addRecent(name, recentKey);
      hide();
      if (onSelect) onSelect(name);
    }

    function hide() {
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
    }

    function move(delta) {
      if (menu.hidden || !matches.length) render();
      if (!matches.length) return;
      activeIndex = (activeIndex + delta + matches.length) % matches.length;
      for (const option of menu.querySelectorAll(".room-combobox-option")) {
        const selected = Number(option.dataset.index) === activeIndex;
        option.setAttribute("aria-selected", selected ? "true" : "false");
        if (selected) option.scrollIntoView({ block: "nearest" });
      }
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.addEventListener("focus", render);
    input.addEventListener("click", render);
    input.addEventListener("input", render);
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Enter" && !menu.hidden && activeIndex >= 0) {
        event.preventDefault();
        choose(activeIndex);
      } else if (event.key === "Escape") {
        hide();
      }
    });
    input.addEventListener("blur", () => {
      window.setTimeout(hide, 120);
    });
  }

  function rankMatches(names, query, options = {}) {
    const normalized = query.trim().toLowerCase();
    const recent = options.recent || [];
    const favorites = options.favorites || [];
    if (!normalized) return prioritizeRooms(names, recent, favorites);
    return names
      .map((name) => ({
        name,
        score: scoreName(name, normalized) - favoriteBoost(name, recent, favorites),
      }))
      .filter((item) => item.score < 99)
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name, undefined, { numeric: true })
      )
      .map((item) => item.name);
  }

  function scoreName(name, query) {
    const lower = name.toLowerCase();
    if (lower === query) return 0;
    if (lower.startsWith(query)) return 1;
    if (lower.split(/[^a-z0-9]+/).some((part) => part.startsWith(query))) return 2;
    if (lower.includes(query)) return 3;
    return 99;
  }

  function prioritizeRooms(names, recent, favorites) {
    const seen = new Set();
    const ordered = [];
    for (const group of [favorites, recent, names]) {
      for (const name of group) {
        if (!names.includes(name) || seen.has(name)) continue;
        seen.add(name);
        ordered.push(name);
      }
    }
    return ordered;
  }

  function favoriteBoost(name, recent, favorites) {
    if (favorites.includes(name)) return 0.5;
    if (recent.includes(name)) return 0.25;
    return 0;
  }

  function loadStoredRooms(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(raw) ? raw.filter(Boolean) : [];
    } catch (_error) {
      return [];
    }
  }

  function saveStoredRooms(key, names) {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(names)).filter(Boolean)));
  }

  function addRecent(name, key = RECENTS_KEY) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    const rooms = loadStoredRooms(key).filter((item) => item !== trimmed);
    rooms.unshift(trimmed);
    saveStoredRooms(key, rooms.slice(0, MAX_RECENTS));
  }

  function isFavorite(name, key = FAVORITES_KEY) {
    return loadStoredRooms(key).includes(String(name || "").trim());
  }

  function toggleFavorite(name, key = FAVORITES_KEY) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return false;
    const rooms = loadStoredRooms(key);
    const index = rooms.indexOf(trimmed);
    if (index === -1) {
      rooms.unshift(trimmed);
      saveStoredRooms(key, rooms);
      return true;
    }
    rooms.splice(index, 1);
    saveStoredRooms(key, rooms);
    return false;
  }

  window.RoomCombobox = {
    addRecent,
    attach,
    isFavorite,
    loadRoomNames,
    rankMatches,
    toggleFavorite,
  };
})();
