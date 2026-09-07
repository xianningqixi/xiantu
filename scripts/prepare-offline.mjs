import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = path.resolve("dist/client");
const files = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const assets = files(root)
  .filter((p) => /\.(js|css|png|jpg|jpeg|webp|svg|webmanifest)$/.test(p) && !p.endsWith("/sw.js"))
  .sort();
const fingerprint = crypto.createHash("sha256");
for (const file of assets) {
  fingerprint.update(path.relative(root, file));
  fingerprint.update(fs.readFileSync(file));
}
const version = fingerprint.digest("hex").slice(0, 20),
  core = ["/", "/author", ...assets.map((file) => "/" + path.relative(root, file))];
const source = fs
  .readFileSync("scripts/pwa/service-worker.js", "utf8")
  .replace("__VERSION__", JSON.stringify(version))
  .replace("__CORE__", JSON.stringify(core));
fs.writeFileSync(path.join(root, "sw.js"), source);
fs.writeFileSync(
  path.join(root, "offline-manifest.json"),
  JSON.stringify({
    available: true,
    version,
    files: core,
    bytes: assets.reduce((n, p) => n + fs.statSync(p).size, 0),
  }),
);
console.log(`离线核心 ${version}: ${core.length} 个文件（HTML在安装时原子缓存），保留最近两版。`);
