import fs from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const engine = require("../assets/js/map-engine.js");

const inputPath = new URL("../assets/nodes.json", import.meta.url);
const outputPath = new URL("../assets/route-cache.rle.json", import.meta.url);

const nodes = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const started = performance.now();
const routeCache = engine._internal.buildRouteCache(nodes);
fs.writeFileSync(outputPath, JSON.stringify(routeCache));

const elapsed = Math.round(performance.now() - started);
const bytes = fs.statSync(outputPath).size;
console.log(`Wrote assets/route-cache.rle.json (${bytes} bytes) in ${elapsed}ms`);
