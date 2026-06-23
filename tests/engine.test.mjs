import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const engine = require("../assets/js/map-engine.js");
const nodes = JSON.parse(fs.readFileSync(new URL("../assets/nodes.json", import.meta.url), "utf8"));
const routeCachePath = new URL("../assets/route-cache.rle.json", import.meta.url);
const routeCache = fs.existsSync(routeCachePath)
  ? JSON.parse(fs.readFileSync(routeCachePath, "utf8"))
  : engine._internal.buildRouteCache(nodes);

const state = engine._internal.createState(nodes, routeCache);
const script = fs.readFileSync(new URL("../assets/input/script.js", import.meta.url), "utf8");

function example(name) {
  const match = script.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\``));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

test("direct path returns expected route shape", () => {
  const response = engine._internal.getDirectionsSync("A147", "A155", state);
  assert.equal(response.path.length, 11);
  assert.equal(response.path[0].name, "A147");
  assert.equal(response.path.at(-1).name, "A155");
});

test("same-room direct path is handled", () => {
  const response = engine._internal.getDirectionsSync("A147", "A147", state);
  assert.deepEqual(response.path.map((node) => node.name), ["A147"]);
});

test("room lookup and invalid room errors work", () => {
  assert.equal(engine._internal.findRoomSync("A147", state).room.id, 0);
  assert.throws(
    () => engine._internal.findRoomSync("NOPE", state),
    /Could not identify a node/
  );
});

test("room aliases resolve through the shared engine", () => {
  assert.equal(engine._internal.findRoomSync("lex", state).room.name, "Lexington (B137)");
  assert.equal(engine._internal.findRoomSync("door 13", state).room.name, "Door 13 Entrance/Exit");
  assert.equal(engine._internal.getDirectionsSync("main entrance", "lex", state).path.at(-1).name, "Lexington (B137)");
});

test("room suggestions rank likely typo corrections", () => {
  assert.equal(engine._internal.suggestRoomNames("A155", state)[0], "A155");
  assert.ok(engine._internal.suggestRoomNames("A14", state, 10).includes("A147"));
  assert.equal(engine._internal.suggestRoomNames("lex", state)[0], "Lexington (B137)");
});

test("schedule example 1 produces day route groups", () => {
  const response = engine._internal.generateScheduleSync(
    example("ex1"),
    "east",
    "east",
    false,
    state
  );

  assert.equal(response["Semester 1"].aday.length, 8);
  assert.equal(response["Semester 1"].bday.length, 7);
  assert.equal(response["Semester 1"].cday.length, 6);
  assert.equal(response["Semester 1"].dday.length, 7);
  assert.equal(response["Semester 1"].iday.length, 2);
  assert.equal(response["Semester 1"].aday[0].nodes[0].name, "East Main Entrance/Exit");
  assert.equal(response["Semester 1"].aday[0].nodes.at(-1).name, "B108");
});

test("schedule validation summarizes parsed semesters", () => {
  const response = engine._internal.validateScheduleSync(example("ex1"), state);

  assert.equal(response.status, 0);
  assert.equal(response.semesters["Semester 1"].classCount, 8);
  assert.equal(response.semesters["Semester 2"].classCount, 7);
  assert.equal(response.semesters["Semester 1"].dayCounts.A, 7);
  assert.equal(response.semesters["Semester 1"].dayCounts.I, 1);
  assert.equal(response.semesters["Semester 1"].classes[0].roomFound, true);
});

test("schedule validation reports unknown rooms with source location", () => {
  const response = engine._internal.validateScheduleSync(
    example("ex1").replace("B108", "ZZ999"),
    state
  );

  const roomIssue = response.issues.find((issue) => issue.code === "unknown_room");
  assert.equal(response.status, 1);
  assert.ok(roomIssue);
  assert.equal(roomIssue.value, "ZZ999");
  assert.equal(roomIssue.field, "room");
  assert.ok(Array.isArray(roomIssue.suggestions));
  assert.equal(typeof roomIssue.lineNumber, "number");
  assert.equal(typeof roomIssue.columnStart, "number");
  assert.ok(roomIssue.columnEnd > roomIssue.columnStart);
});

test("schedule example 1 with Lexington inserts midday stop", () => {
  const response = engine._internal.generateScheduleSync(
    example("ex1"),
    "west",
    "d6",
    true,
    state
  );

  const routes = response["Semester 1"].aday.map(
    (path) => `${path.nodes[0].name}->${path.nodes.at(-1).name}`
  );
  assert.equal(response["Semester 1"].aday.length, 9);
  assert.ok(routes.includes("A152->Lexington (B137)"));
  assert.ok(routes.includes("Lexington (B137)->A119"));
  assert.equal(response["Semester 1"].aday.at(-1).nodes.at(-1).name, "Door 6 Exit");
});

test("route cache matches heap fallback for representative paths", () => {
  const cached = engine._internal.createState(nodes, routeCache);
  const uncached = engine._internal.createState(nodes, null);
  const pairs = [
    [0, 27],
    [643, 706],
    [987, 643],
    [354, 121],
    [691, 692],
  ];

  for (const [start, end] of pairs) {
    assert.deepEqual(
      engine._internal.getPathIds(start, end, cached),
      engine._internal.getPathIds(start, end, uncached)
    );
  }
});

test("every named map node routes to key anchors", () => {
  const anchorIds = [987, 988, 691, 692, 354];
  const missing = [];

  for (const node of nodes) {
    if (!node.name) continue;
    for (const anchorId of anchorIds) {
      if (!engine._internal.getPathIds(node.id, anchorId, state).length) {
        missing.push(`${node.id}:${node.name}->${anchorId}`);
        break;
      }
    }
  }

  assert.deepEqual(missing, []);
});
