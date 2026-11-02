import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits modal animation and reduced-motion styles", async () => {
  const css = await readCssTree(path.join(root, "dist"));
  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("intimate paragraphs follow the chosen detail level", async () => {
  const { IntimateBody } = await vite.ssrLoadModule("/components/game/side-stories.tsx");
  const render = (detail) =>
    renderToStaticMarkup(React.createElement(IntimateBody, { detail, text: "夜话" }));

  assert.equal(render("tasteful"), "");
  assert.match(render("standard"), /<details class="intimate-body-fold">/);
  assert.match(render("standard"), /展开亲密段落/);
  assert.match(render(undefined), /<details/, "缺失偏好按标准处理");
  const explicit = render("explicit");
  assert.match(explicit, /<p class="intimate-body">夜话<\/p>/);
  assert.doesNotMatch(explicit, /<details/);
  assert.equal(
    renderToStaticMarkup(React.createElement(IntimateBody, { detail: "explicit" })),
    "",
    "无正文时不渲染",
  );
});
