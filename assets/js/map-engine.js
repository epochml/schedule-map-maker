(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ScheduleMapEngine = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_ASSET_BASE = "/assets/";
  const ROUTE_CACHE_MISSING = 65535;
  const LEXINGTON_ID = 354;
  const ENTRANCE_IDS = {
    west: 988,
    east: 987,
    d13: 691,
    d6: 692,
  };
  const DAY_ORDER = ["A", "B", "C", "D", "I"];
  const RANGE_DAY_ORDER = ["A", "B", "C", "D"];
  const DAY_KEYS = ["aday", "bday", "cday", "dday", "iday"];
  const ROOM_ALIASES = {
    lex: "Lexington (B137)",
    lexington: "Lexington (B137)",
    lunch: "Lexington (B137)",
    cafeteria: "Lexington (B137)",
    cafe: "Lexington (B137)",
    east: "East Main Entrance/Exit",
    "east main": "East Main Entrance/Exit",
    "east entrance": "East Main Entrance/Exit",
    "main entrance": "East Main Entrance/Exit",
    entrance: "East Main Entrance/Exit",
    "east exit": "East Main Entrance/Exit",
    west: "West Exit",
    "west main": "West Exit",
    "west exit": "West Exit",
    d13: "Door 13 Entrance/Exit",
    "door 13": "Door 13 Entrance/Exit",
    "door13": "Door 13 Entrance/Exit",
    "13": "Door 13 Entrance/Exit",
    d6: "Door 6 Exit",
    "door 6": "Door 6 Exit",
    "door6": "Door 6 Exit",
    "6": "Door 6 Exit",
  };

  let assetBase = DEFAULT_ASSET_BASE;
  let state = null;
  let statePromise = null;

  function configure(options = {}) {
    if (options.assetBase) {
      assetBase = options.assetBase.endsWith("/")
        ? options.assetBase
        : options.assetBase + "/";
    }
  }

  async function ready(options = {}) {
    if (options.assetBase) configure(options);
    if (state && !options.force) return state;
    if (statePromise && !options.force) return statePromise;

    statePromise = loadState(options)
      .then((loaded) => {
        state = loaded;
        return loaded;
      })
      .finally(() => {
        statePromise = null;
      });

    return statePromise;
  }

  async function loadState(options = {}) {
    const nodes = options.nodes || (await fetchJson(assetBase + "nodes.json"));
    const routeCache =
      options.routeCache === undefined
        ? await tryFetchJson(assetBase + "route-cache.rle.json")
        : options.routeCache;
    return createState(nodes, routeCache);
  }

  async function fetchJson(url) {
    if (typeof fetch !== "function") {
      throw new Error("fetch is not available; provide data directly in tests");
    }
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: ${response.status}`);
    }
    return response.json();
  }

  async function tryFetchJson(url) {
    try {
      return await fetchJson(url);
    } catch (_err) {
      return null;
    }
  }

  function createState(nodes, routeCache = null) {
    const maxId = nodes.reduce((max, node) => Math.max(max, node.id), -1);
    const nodesById = new Array(maxId + 1);
    const adjacency = Array.from({ length: maxId + 1 }, () => []);
    const edgeWeights = Array.from({ length: maxId + 1 }, () => new Map());
    const nameToIds = new Map();

    for (const node of nodes) {
      if (nodesById[node.id]) {
        throw new Error(`Duplicate node id ${node.id}`);
      }
      nodesById[node.id] = node;
      const key = normalizeName(node.name);
      if (!nameToIds.has(key)) nameToIds.set(key, []);
      nameToIds.get(key).push(node.id);
    }

    for (const node of nodes) {
      adjacency[node.id] = node.neighbor_nodes.map(([id, weight]) => [id, weight]);
      for (const [id, weight] of node.neighbor_nodes) {
        edgeWeights[node.id].set(id, weight);
      }
    }

    return {
      nodes,
      nodesById,
      adjacency,
      edgeWeights,
      nameToIds,
      routeCache: routeCache || null,
    };
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getIdsByName(name, st = state) {
    const ids = st.nameToIds.get(resolveNameKey(name)) || [];
    return ids.filter((id) => st.nodesById[id]);
  }

  function requireIdsByName(name, st = state) {
    const ids = getIdsByName(name, st);
    if (!ids.length) {
      const suggestions = suggestRoomNames(name, st, 3);
      const suffix = suggestions.length ? `. Did you mean ${suggestions.join(", ")}?` : "";
      throw new Error(`Could not identify a node for string '${name}'${suffix}`);
    }
    return ids;
  }

  function resolveNameKey(name) {
    const normalized = normalizeName(name);
    return normalizeName(ROOM_ALIASES[normalized] || normalized);
  }

  function canonicalRoomName(name, st = state) {
    const ids = getIdsByName(name, st);
    return ids.length ? st.nodesById[ids[0]].name : String(name || "").trim();
  }

  function uniqueRoomNames(st = state) {
    return Array.from(new Set(st.nodes.map((node) => node.name).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }

  function suggestRoomNames(name, st = state, limit = 5) {
    const query = normalizeName(name);
    if (!query) return [];

    const alias = ROOM_ALIASES[query];
    if (alias && getIdsByName(alias, st).length) return [alias];

    return uniqueRoomNames(st)
      .map((roomName) => ({ roomName, score: roomSuggestionScore(roomName, query) }))
      .filter((item) => item.score < 80)
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.roomName.length - b.roomName.length ||
          a.roomName.localeCompare(b.roomName, undefined, { numeric: true })
      )
      .slice(0, limit)
      .map((item) => item.roomName);
  }

  function roomSuggestionScore(roomName, query) {
    const lower = normalizeName(roomName);
    const compact = lower.replace(/[^a-z0-9]/g, "");
    const queryCompact = query.replace(/[^a-z0-9]/g, "");
    const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);

    if (lower === query) return 0;
    if (compact === queryCompact) return 1;
    if (lower.startsWith(query)) return 2;
    if (compact.startsWith(queryCompact)) return 3;
    if (tokens.some((token) => token.startsWith(query))) return 5;
    if (lower.includes(query)) return 8;
    if (compact.includes(queryCompact)) return 10;

    const distance = levenshtein(compact, queryCompact);
    const allowed = Math.max(1, Math.ceil(queryCompact.length * 0.35));
    return distance <= allowed ? 20 + distance : 99;
  }

  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > Math.max(3, Math.ceil(b.length * 0.5))) return 99;
    const previous = new Array(b.length + 1);
    const current = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) previous[j] = j;

    for (let i = 1; i <= a.length; i++) {
      current[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
      }
      for (let j = 0; j <= b.length; j++) previous[j] = current[j];
    }

    return previous[b.length];
  }

  function toNodeJson(id, st = state) {
    const node = st.nodesById[id];
    return {
      x: node.x,
      y: node.y,
      name: node.name,
      index: id,
    };
  }

  function findRoomSync(room, st = state) {
    const id = requireIdsByName(room, st)[0];
    return { room: st.nodesById[id] };
  }

  async function findRoom(room) {
    const st = await ready();
    try {
      return findRoomSync(room, st);
    } catch (err) {
      return { status: 1, error_message: err.message };
    }
  }

  function getDirectionsSync(startRoom, destination, st = state) {
    const [startId, endId] = pickBestPair(startRoom, destination, st);
    const pathIds = getPathIds(startId, endId, st);
    if (!pathIds.length) {
      throw new Error(`Could not find a path from '${startRoom}' to '${destination}'`);
    }
    return { path: pathIds.map((id) => toNodeJson(id, st)) };
  }

  async function getDirections(startRoom, destination) {
    const st = await ready();
    try {
      return getDirectionsSync(startRoom, destination, st);
    } catch (err) {
      return { status: 1, error_message: err.message };
    }
  }

  function pickBestPair(startName, endName, st = state) {
    const starts = requireIdsByName(startName, st);
    const ends = requireIdsByName(endName, st);

    if (normalizeName(startName) === normalizeName(endName)) {
      return [starts[0], starts[0]];
    }

    let best = null;
    for (const startId of starts) {
      for (const endId of ends) {
        const pathIds = getPathIds(startId, endId, st);
        if (!pathIds.length) continue;
        const walkingDistance = pathDistance(pathIds, st);
        const straightLine = euclidean(startId, endId, st);
        const candidate = { startId, endId, walkingDistance, straightLine };
        if (
          !best ||
          candidate.walkingDistance < best.walkingDistance ||
          (candidate.walkingDistance === best.walkingDistance &&
            candidate.straightLine < best.straightLine)
        ) {
          best = candidate;
        }
      }
    }

    if (!best) {
      throw new Error(`Could not match room '${startName}' or '${endName}'`);
    }
    return [best.startId, best.endId];
  }

  function pickBestNodeFromFixed(fixedId, roomName, st = state) {
    const ids = requireIdsByName(roomName, st);
    return pickBestFixedPair([fixedId], ids, st)[1];
  }

  function pickBestNodeToFixed(roomName, fixedId, st = state) {
    const ids = requireIdsByName(roomName, st);
    return pickBestFixedPair(ids, [fixedId], st)[0];
  }

  function pickBestFixedPair(starts, ends, st = state) {
    let best = null;
    for (const startId of starts) {
      for (const endId of ends) {
        const pathIds = getPathIds(startId, endId, st);
        if (!pathIds.length) continue;
        const walkingDistance = pathDistance(pathIds, st);
        const candidate = { startId, endId, walkingDistance };
        if (!best || candidate.walkingDistance < best.walkingDistance) {
          best = candidate;
        }
      }
    }
    if (!best) {
      throw new Error("Could not find a matching route");
    }
    return [best.startId, best.endId];
  }

  function getPathIds(startId, endId, st = state) {
    if (startId === endId) return [startId];
    if (st.routeCache) {
      const cachedPath = getCachedPathIds(startId, endId, st.routeCache, st.nodesById.length);
      if (cachedPath.length) return cachedPath;
    }
    return dijkstraPath(startId, endId, st);
  }

  function getCachedPathIds(startId, endId, routeCache, nodeCount) {
    const path = [startId];
    let current = startId;
    const seen = new Set([current]);
    const limit = nodeCount + 1;

    for (let step = 0; step < limit; step++) {
      const next = routeNextHop(routeCache, current, endId);
      if (next === ROUTE_CACHE_MISSING || next === undefined || next === null) return [];
      path.push(next);
      if (next === endId) return path;
      if (seen.has(next)) return [];
      seen.add(next);
      current = next;
    }

    return [];
  }

  function routeNextHop(routeCache, startId, endId) {
    const row = routeCache.rows[startId];
    if (!row) return ROUTE_CACHE_MISSING;
    let index = 0;
    for (const [value, count] of row) {
      if (endId < index + count) return value;
      index += count;
    }
    return ROUTE_CACHE_MISSING;
  }

  function dijkstraPath(startId, endId, st = state) {
    const nodeCount = st.nodesById.length;
    const dist = new Float64Array(nodeCount);
    const prev = new Int32Array(nodeCount);
    dist.fill(Infinity);
    prev.fill(-1);

    const heap = new MinHeap();
    dist[startId] = 0;
    heap.push([0, startId]);

    while (heap.length) {
      const [currentDistance, current] = heap.pop();
      if (currentDistance !== dist[current]) continue;
      if (current === endId) break;

      for (const [neighborId, weight] of st.adjacency[current] || []) {
        const nextDistance = currentDistance + weight;
        if (nextDistance < dist[neighborId]) {
          dist[neighborId] = nextDistance;
          prev[neighborId] = current;
          heap.push([nextDistance, neighborId]);
        }
      }
    }

    if (prev[endId] === -1) return [];

    const path = [];
    let current = endId;
    while (current !== -1) {
      path.push(current);
      if (current === startId) break;
      current = prev[current];
    }
    if (path[path.length - 1] !== startId) return [];
    path.reverse();
    return path;
  }

  function pathDistance(pathIds, st = state) {
    let total = 0;
    for (let i = 1; i < pathIds.length; i++) {
      const prev = pathIds[i - 1];
      const next = pathIds[i];
      total += st.edgeWeights[prev].get(next) || euclidean(prev, next, st);
    }
    return total;
  }

  function euclidean(startId, endId, st = state) {
    const a = st.nodesById[startId];
    const b = st.nodesById[endId];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  class MinHeap {
    constructor() {
      this.items = [];
    }

    get length() {
      return this.items.length;
    }

    push(item) {
      const items = this.items;
      let index = items.length;
      items.push(item);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (items[parent][0] <= item[0]) break;
        items[index] = items[parent];
        index = parent;
      }
      items[index] = item;
    }

    pop() {
      const items = this.items;
      if (!items.length) return null;
      const root = items[0];
      const item = items.pop();
      if (items.length) {
        let index = 0;
        while (true) {
          const left = index * 2 + 1;
          const right = left + 1;
          if (left >= items.length) break;
          const child =
            right < items.length && items[right][0] < items[left][0] ? right : left;
          if (items[child][0] >= item[0]) break;
          items[index] = items[child];
          index = child;
        }
        items[index] = item;
      }
      return root;
    }
  }

  function getSchedule(input) {
    const [semesterOneInput, semesterTwoInput] = splitSemesters(input);
    if (!semesterOneInput.trim() && !semesterTwoInput.trim()) {
      throw new Error(
        "Did you actually input anything? Make sure you copy and paste your schedule in!"
      );
    }
    if (!semesterOneInput.trim() || !semesterTwoInput.trim()) {
      throw new Error("Please provide both semesters");
    }
    return [resolveSemester(semesterOneInput), resolveSemester(semesterTwoInput)];
  }

  function splitSemesters(input) {
    const sem1 = [];
    const sem2 = [];
    let inSem2 = false;

    for (const line of String(input || "").split(/\r?\n/)) {
      if (line.includes("Semester 2")) inSem2 = true;
      if (inSem2) sem2.push(line);
      else sem1.push(line);
    }

    return [sem1.join("\n"), sem2.join("\n")];
  }

  function resolveSemester(input) {
    let lines = input.split(/\r?\n/);
    while (lines.length && (!lines[0].trim() || lines[0].includes("Semester"))) {
      lines.shift();
    }
    while (lines.length && lines[0].includes("Teacher") && lines[0].includes("Crs-Sec")) {
      lines.shift();
    }

    lines = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith("RC") &&
        !trimmed.startsWith("CC") &&
        !trimmed.startsWith("EVE")
      );
    });

    if (!lines.length) throw new Error("Not enough lines");

    return lines.map((line, index) => {
      const split = splitScheduleColumns(line);
      if (split.length < 8) {
        throw new Error(`Not enough arguments provided in line ${index}`);
      }

      let room = split[5];
      if (room.includes("/")) {
        room = room.split("/")[0];
      }

      const [days, mods] = parseModsAndDays(split[0], index);
      return {
        days,
        mods,
        semester: parseSemester(split[1]),
        short_name: split[2],
        long_name: split[3],
        teacher: split[4],
        room,
        start: split[6],
        end: split[7],
      };
    });
  }

  function splitScheduleColumns(line) {
    return line
      .trim()
      .split(/\t+|\s{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function parseSemester(value) {
    if (value === "S1" || value === "S2") return value;
    if (/^Y\d{2}-\d{2}$/.test(value)) return "Year";
    throw new Error(`Unknown semester '${value}'`);
  }

  function parseModsAndDays(modsDays, lineIndex) {
    const groupRegex = /([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\(([^)]+)\)/g;
    const groups = [];
    let match;
    while ((match = groupRegex.exec(modsDays)) !== null) {
      groups.push([match[1], match[2]]);
    }

    if (!groups.length) {
      throw new Error(
        `There was no "(" token in line ${lineIndex}. The problematic input was ${modsDays}`
      );
    }

    const days = [];
    const mods = [];
    for (const [modString, dayString] of groups) {
      days.push(...parseDays(dayString));
      mods.push(...parseMods(modString));
    }
    if (!mods.length && days.includes("I")) {
      mods.push(1);
    }
    return [days, mods];
  }

  function parseDays(dayString) {
    if (!/^[ ABCDI,-]*$/.test(dayString)) {
      throw new Error(`Invalid day value: ${dayString}`);
    }

    const days = [];
    for (const part of dayString.split(",").map((item) => item.trim()).filter(Boolean)) {
      if (["A", "B", "C", "D", "I"].includes(part)) {
        days.push(part);
        continue;
      }
      if (part.includes("-")) {
        const [start, end] = part.split("-");
        const startIndex = RANGE_DAY_ORDER.indexOf(start[0]);
        const endIndex = RANGE_DAY_ORDER.indexOf(end[0]);
        if (startIndex === -1 || endIndex === -1) {
          throw new Error(
            `Invalid range: '${part}' while parsing '${dayString}'. I days are separate and must be listed explicitly as I.`
          );
        }
        const rangeStart = Math.min(startIndex, endIndex);
        const rangeEnd = Math.max(startIndex, endIndex);
        for (let i = rangeStart; i <= rangeEnd; i++) {
          days.push(RANGE_DAY_ORDER[i]);
        }
        continue;
      }
      throw new Error(
        `Unknown day pattern '${part}' while parsing '${dayString}'. Try to copy and paste the schedule in again.`
      );
    }
    return days;
  }

  function parseMods(modString) {
    if (!/^[a-zA-Z0-9-]*$/.test(modString)) {
      throw new Error(`Invalid mod value: ${modString}`);
    }

    const mods = [];
    for (const part of modString.split("-")) {
      const first = Number(part[0]);
      const last = Number(part[part.length - 1]);
      if (!Number.isInteger(first) || !Number.isInteger(last)) continue;
      const start = Math.min(first, last);
      const end = Math.max(first, last);
      for (let mod = start; mod <= end; mod++) {
        mods.push(mod);
      }
    }
    return mods;
  }

  function scheduleGrid(classes) {
    const grid = DAY_ORDER.map(() => Array(8).fill(null));
    for (const klass of classes) {
      for (const day of klass.days) {
        const dayIndex = DAY_ORDER.indexOf(day);
        if (dayIndex === -1) continue;
        for (const mod of klass.mods) {
          const modIndex = mod - 1;
          if (modIndex < 0 || modIndex >= 8) {
            throw new Error(`Unexpected mod value --> ${mod}`);
          }
          grid[dayIndex][modIndex] = klass;
        }
      }
    }
    return grid;
  }

  function generateScheduleSync(input, enter, exit, lexMidday, st = state) {
    const [sem1, sem2] = getSchedule(input);
    return {
      "Semester 1": buildScheduleJson(scheduleGrid(sem1), enter, exit, lexMidday, st),
      "Semester 2": buildScheduleJson(scheduleGrid(sem2), enter, exit, lexMidday, st),
    };
  }

  async function generateSchedule(input, enter, exit, lexMidday) {
    const st = await ready();
    try {
      return generateScheduleSync(input, enter, exit, lexMidday, st);
    } catch (err) {
      return { status: 1, error_message: err.message };
    }
  }

  function validateScheduleSync(input, st = state) {
    const issues = [];
    const [sem1, sem2] = getScheduleForValidation(input, issues);
    const semesters = {
      "Semester 1": summarizeScheduleClasses(sem1, "Semester 1", st, issues),
      "Semester 2": summarizeScheduleClasses(sem2, "Semester 2", st, issues),
    };
    const errorIssues = issues.filter((issue) => issue.severity !== "warning");

    return {
      status: errorIssues.length ? 1 : 0,
      error_message: errorIssues.map((issue) => issue.message).join(" "),
      warnings: issues.map((issue) => issue.message),
      issues,
      semesters,
    };
  }

  async function validateSchedule(input) {
    const st = await ready();
    try {
      return validateScheduleSync(input, st);
    } catch (err) {
      return {
        status: 1,
        error_message: err.message,
        warnings: [err.message],
        issues: [
          {
            code: "validation_exception",
            severity: "error",
            message: err.message,
            lineNumber: 1,
            columnStart: 0,
            columnEnd: 1,
          },
        ],
        semesters: null,
      };
    }
  }

  function getScheduleForValidation(input, issues) {
    const lines = String(input || "").split(/\r?\n/);
    if (!String(input || "").trim()) {
      issues.push(makeIssue("empty_schedule", "Schedule text is empty.", 1, 0, 1));
      return [[], []];
    }

    const sem2Index = lines.findIndex((line) => /Semester\s*2/i.test(line));
    if (sem2Index === -1) {
      issues.push(
        makeIssue(
          "missing_semester_2",
          "Semester 2 could not be found. Copy both semester sections from PowerSchool.",
          1,
          0,
          Math.max(lines[0]?.length || 1, 1)
        )
      );
    }

    const sem1Lines = lines
      .slice(0, sem2Index === -1 ? lines.length : sem2Index)
      .map((text, index) => ({ text, lineNumber: index + 1 }));
    const sem2Lines =
      sem2Index === -1
        ? []
        : lines.slice(sem2Index).map((text, index) => ({ text, lineNumber: sem2Index + index + 1 }));

    return [
      resolveSemesterForValidation(sem1Lines, "Semester 1", issues),
      resolveSemesterForValidation(sem2Lines, "Semester 2", issues),
    ];
  }

  function resolveSemesterForValidation(lineEntries, label, issues) {
    const classes = [];

    for (const entry of lineEntries) {
      const trimmed = entry.text.trim();
      if (
        !trimmed ||
        /Semester\s*[12]/i.test(trimmed) ||
        (trimmed.includes("Teacher") && trimmed.includes("Crs-Sec")) ||
        trimmed.startsWith("RC") ||
        trimmed.startsWith("CC") ||
        trimmed.startsWith("EVE")
      ) {
        continue;
      }

      const split = splitScheduleColumnsDetailed(entry.text);
      if (split.length < 8) {
        issues.push(
          makeIssue(
            "bad_column_count",
            `${label}, line ${entry.lineNumber}: expected 8 PowerSchool columns but found ${split.length}. Re-copy the full row including Exp, Trm, course, teacher, room, enroll, and leave.`,
            entry.lineNumber,
            0,
            Math.max(entry.text.length, 1)
          )
        );
        continue;
      }

      const semester = parseSemesterForValidation(split[1], entry, label, issues);
      const [days, mods] = parseModsAndDaysForValidation(split[0], entry, label, issues);
      let room = split[5].value;
      if (room.includes("/")) room = room.split("/")[0].trim();

      classes.push({
        days,
        mods,
        semester,
        short_name: split[2].value,
        long_name: split[3].value,
        teacher: split[4].value,
        room,
        start: split[6].value,
        end: split[7].value,
        source: {
          lineNumber: entry.lineNumber,
          exp: split[0],
          term: split[1],
          room: split[5],
        },
      });
    }

    if (!classes.length) {
      issues.push(
        makeIssue(
          "empty_semester",
          `${label} has no usable schedule rows. Verify that the semester header and table rows were copied.`,
          lineEntries[0]?.lineNumber || 1,
          0,
          Math.max(lineEntries[0]?.text.length || 1, 1)
        )
      );
    }

    return classes;
  }

  function splitScheduleColumnsDetailed(line) {
    const values = splitScheduleColumns(line);
    const columns = [];
    let cursor = 0;
    for (const value of values) {
      const start = line.indexOf(value, cursor);
      const safeStart = start === -1 ? cursor : start;
      const end = safeStart + value.length;
      columns.push({ value, start: safeStart, end });
      cursor = end;
    }
    return columns;
  }

  function parseSemesterForValidation(column, entry, label, issues) {
    try {
      return parseSemester(column.value);
    } catch (_err) {
      issues.push(
        makeIssue(
          "invalid_term",
          `${label}, line ${entry.lineNumber}: unknown term '${column.value}'. Expected S1, S2, or a year value like Y25-26.`,
          entry.lineNumber,
          column.start,
          column.end
        )
      );
      return column.value;
    }
  }

  function parseModsAndDaysForValidation(column, entry, label, issues) {
    const groupRegex = /([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\(([^)]+)\)/g;
    const days = [];
    const mods = [];
    let match;

    while ((match = groupRegex.exec(column.value)) !== null) {
      days.push(
        ...parseDaysForValidation(match[2], {
          entry,
          label,
          start: column.start + match.index,
          end: column.start + match.index + match[0].length,
        }, issues)
      );
      mods.push(...parseMods(match[1]));
    }

    if (!days.length) {
      issues.push(
        makeIssue(
          "invalid_exp",
          `${label}, line ${entry.lineNumber}: the Exp field '${column.value}' does not contain a valid day group like 1(A-D) or SIR(I).`,
          entry.lineNumber,
          column.start,
          column.end
        )
      );
    }

    if (!mods.length && days.includes("I")) mods.push(1);
    return [days, mods];
  }

  function parseDaysForValidation(dayString, source, issues) {
    if (!/^[ ABCDI,-]*$/.test(dayString)) {
      issues.push(
        makeIssue(
          "invalid_day_value",
          `${source.label}, line ${source.entry.lineNumber}: invalid day value '${dayString}'. Valid days are A, B, C, D, and explicit I.`,
          source.entry.lineNumber,
          source.start,
          source.end
        )
      );
      return [];
    }

    const days = [];
    for (const part of dayString.split(",").map((item) => item.trim()).filter(Boolean)) {
      if (["A", "B", "C", "D", "I"].includes(part)) {
        days.push(part);
        continue;
      }
      if (part.includes("-")) {
        const [start, end] = part.split("-");
        const startIndex = RANGE_DAY_ORDER.indexOf(start[0]);
        const endIndex = RANGE_DAY_ORDER.indexOf(end[0]);
        if (startIndex === -1 || endIndex === -1) {
          issues.push(
            makeIssue(
              "invalid_day_range",
              `${source.label}, line ${source.entry.lineNumber}: '${part}' is not a valid range. A-D ranges do not include I days; list I separately only when the class explicitly meets on I days.`,
              source.entry.lineNumber,
              source.start,
              source.end
            )
          );
          continue;
        }
        const rangeStart = Math.min(startIndex, endIndex);
        const rangeEnd = Math.max(startIndex, endIndex);
        for (let index = rangeStart; index <= rangeEnd; index++) {
          days.push(RANGE_DAY_ORDER[index]);
        }
        continue;
      }
      issues.push(
        makeIssue(
          "unknown_day_pattern",
          `${source.label}, line ${source.entry.lineNumber}: unknown day pattern '${part}'.`,
          source.entry.lineNumber,
          source.start,
          source.end
        )
      );
    }
    return days;
  }

  function makeIssue(code, message, lineNumber, columnStart, columnEnd, severity = "error") {
    return {
      code,
      severity,
      message,
      lineNumber,
      columnStart,
      columnEnd,
    };
  }

  function summarizeScheduleClasses(classes, label, st, issues) {
    const rows = classes.map((klass) => {
      const room = String(klass.room || "").trim();
      const routeRelevant =
        klass.mods.length > 0 && room && room.toUpperCase() !== "N/A";
      const roomFound = routeRelevant ? getIdsByName(room, st).length > 0 : true;
      const suggestions = !roomFound ? suggestRoomNames(room, st, 5) : [];
      if (!roomFound) {
        issues.push({
          code: "unknown_room",
          severity: "error",
          message: `${label}, line ${klass.source?.lineNumber || "?"}: room '${room}' is not in the map data. Check for a typo${suggestions.length ? ` or choose ${suggestions[0]}` : ""}.`,
          lineNumber: klass.source?.lineNumber || 1,
          columnStart: klass.source?.room?.start || 0,
          columnEnd: klass.source?.room?.end || Math.max(room.length, 1),
          field: "room",
          value: room,
          suggestions,
        });
      }

      return {
        days: Array.from(new Set(klass.days)),
        mods: Array.from(new Set(klass.mods)).sort((a, b) => a - b),
        semester: klass.semester,
        short_name: klass.short_name,
        long_name: klass.long_name,
        teacher: klass.teacher,
        room,
        start: klass.start,
        end: klass.end,
        routeRelevant,
        roomFound,
      };
    });

    const dayCounts = {};
    for (const day of DAY_ORDER) dayCounts[day] = 0;
    for (const row of rows) {
      if (!row.routeRelevant) continue;
      for (const day of row.days) {
        if (dayCounts[day] !== undefined) dayCounts[day] += 1;
      }
    }

    return {
      label,
      totalRows: rows.length,
      classCount: rows.filter((row) => row.routeRelevant).length,
      dayCounts,
      classes: rows,
    };
  }

  function buildScheduleJson(grid, enter, exit, lexMidday, st = state) {
    const result = {};
    for (let dayIndex = 0; dayIndex < DAY_ORDER.length; dayIndex++) {
      result[DAY_KEYS[dayIndex]] = buildDayPaths(
        grid[dayIndex],
        enter,
        exit,
        lexMidday,
        st
      );
    }
    return result;
  }

  function buildDayPaths(day, enter, exit, lexMidday, st = state) {
    const entranceId = ENTRANCE_IDS[enter];
    const exitId = ENTRANCE_IDS[exit];
    if (entranceId === undefined) throw new Error("Invalid entrance string");
    if (exitId === undefined) throw new Error("Invalid exit string");

    const cleanClasses = [];
    for (let modIndex = 0; modIndex < day.length; modIndex++) {
      const klass = day[modIndex];
      if (klass && klass.room.trim()) cleanClasses.push(klass);
      if (modIndex === 3 && lexMidday) cleanClasses.push(null);
    }

    const realClasses = cleanClasses.filter(Boolean);
    if (!realClasses.length) return [];

    const basicPaths = [];
    if (realClasses.length === 1) {
      const onlyClass = realClasses[0];
      basicPaths.push({
        start: entranceId,
        end: pickBestNodeFromFixed(entranceId, onlyClass.room, st),
        startClass: null,
        endClass: onlyClass,
      });
      basicPaths.push({
        start: pickBestNodeToFixed(onlyClass.room, exitId, st),
        end: exitId,
        startClass: onlyClass,
        endClass: null,
      });
      return materializeBasicPaths(basicPaths, st);
    }

    for (let index = 0; index < cleanClasses.length; index++) {
      const rawClass = cleanClasses[index];
      if (index === cleanClasses.length - 1) continue;

      if (rawClass) {
        if (rawClass.mods.includes(4) && lexMidday) continue;

        if (index === 0) {
          basicPaths.push({
            start: entranceId,
            end: pickBestNodeFromFixed(entranceId, rawClass.room, st),
            startClass: null,
            endClass: rawClass,
          });
        }

        const nextClass = getNextClass(cleanClasses, index);
        if (nextClass) {
          const [startRoom, nextRoom] = pickBestPair(rawClass.room, nextClass.room, st);
          if (startRoom !== nextRoom) {
            basicPaths.push({
              start: startRoom,
              end: nextRoom,
              startClass: rawClass,
              endClass: nextClass,
            });
          }
        }
      } else {
        const previousClass = getPreviousClass(cleanClasses, index);
        const nextClass = getNextClass(cleanClasses, index);
        if (previousClass) {
          basicPaths.push({
            start: pickBestNodeToFixed(previousClass.room, LEXINGTON_ID, st),
            end: LEXINGTON_ID,
            startClass: previousClass,
            endClass: null,
          });
        } else {
          basicPaths.push({
            start: entranceId,
            end: LEXINGTON_ID,
            startClass: null,
            endClass: null,
          });
        }
        if (nextClass) {
          basicPaths.push({
            start: LEXINGTON_ID,
            end: pickBestNodeFromFixed(LEXINGTON_ID, nextClass.room, st),
            startClass: null,
            endClass: nextClass,
          });
        }
      }
    }

    const finalClass = realClasses[realClasses.length - 1];
    basicPaths.push({
      start: pickBestNodeToFixed(finalClass.room, exitId, st),
      end: exitId,
      startClass: finalClass,
      endClass: null,
    });

    return materializeBasicPaths(basicPaths, st);
  }

  function getNextClass(cleanClasses, index) {
    for (let i = index + 1; i < cleanClasses.length; i++) {
      if (cleanClasses[i]) return cleanClasses[i];
    }
    return null;
  }

  function getPreviousClass(cleanClasses, index) {
    for (let i = index - 1; i >= 0; i--) {
      if (cleanClasses[i]) return cleanClasses[i];
    }
    return null;
  }

  function materializeBasicPaths(basicPaths, st = state) {
    return basicPaths
      .map((basicPath) => {
        const pathIds = getPathIds(basicPath.start, basicPath.end, st);
        if (!pathIds.length) return null;
        return {
          info: [basicPath.startClass || null, basicPath.endClass || null],
          nodes: pathIds.map((id) => toNodeJson(id, st)),
        };
      })
      .filter(Boolean);
  }

  function buildRouteCache(nodes) {
    const st = createState(nodes, null);
    const nodeCount = st.nodesById.length;
    const rows = [];

    for (let startId = 0; startId < nodeCount; startId++) {
      if (!st.nodesById[startId]) {
        rows.push([[ROUTE_CACHE_MISSING, nodeCount]]);
        continue;
      }
      rows.push(buildRouteCacheRow(startId, st));
    }

    return {
      version: 1,
      missing: ROUTE_CACHE_MISSING,
      nodeCount,
      rows,
    };
  }

  function buildRouteCacheRow(startId, st) {
    const nodeCount = st.nodesById.length;
    const dist = new Float64Array(nodeCount);
    const prev = new Int32Array(nodeCount);
    dist.fill(Infinity);
    prev.fill(-1);

    const heap = new MinHeap();
    dist[startId] = 0;
    heap.push([0, startId]);

    while (heap.length) {
      const [currentDistance, current] = heap.pop();
      if (currentDistance !== dist[current]) continue;
      for (const [neighborId, weight] of st.adjacency[current] || []) {
        const nextDistance = currentDistance + weight;
        if (nextDistance < dist[neighborId]) {
          dist[neighborId] = nextDistance;
          prev[neighborId] = current;
          heap.push([nextDistance, neighborId]);
        }
      }
    }

    const row = [];
    for (let endId = 0; endId < nodeCount; endId++) {
      let nextHop = ROUTE_CACHE_MISSING;
      if (endId === startId) {
        nextHop = startId;
      } else if (prev[endId] !== -1) {
        let current = endId;
        let previous = prev[current];
        while (previous !== startId && previous !== -1) {
          current = previous;
          previous = prev[current];
        }
        if (previous === startId) nextHop = current;
      }

      const last = row[row.length - 1];
      if (last && last[0] === nextHop) {
        last[1] += 1;
      } else {
        row.push([nextHop, 1]);
      }
    }
    return row;
  }

  return {
    configure,
    ready,
    findRoom,
    getDirections,
    suggestRoomNames: async function (name, limit = 5) {
      const st = await ready();
      return suggestRoomNames(name, st, limit);
    },
    generateSchedule,
    validateSchedule,
    _internal: {
      createState,
      buildRouteCache,
      findRoomSync,
      getDirectionsSync,
      suggestRoomNames,
      canonicalRoomName,
      generateScheduleSync,
      validateScheduleSync,
      getPathIds,
      getSchedule,
      scheduleGrid,
      pickBestPair,
    },
  };
});
