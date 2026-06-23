import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyDirectory(path.join(root, "assets"), path.join(dist, "assets"));
writePage("assets/input/index.html", "index.html");
writePage("assets/path/home.html", "path/index.html");
writePage("assets/find_room/home.html", "room/index.html");
writePage("assets/about/about.html", "about/index.html");
writePage("assets/editor/editor.html", "editor/index.html");
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

console.log("Wrote static site to dist/");

function writePage(source, target) {
  const sourcePath = path.join(root, source);
  const targetPath = path.join(dist, target);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}
