import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const adapters = /(?:use-game|simulation\.worker|\/ids$|\/ui\/|\/components\/|\/server\/)/;
const external = /^(?:react(?:-dom)?(?:\/|$)|next(?:\/|$)|node:|fs$|http$|https$|axios$)/;
const ambient = new Set([
  "window",
  "document",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Date",
  "crypto",
]);
export function boundaryViolations(source, filename = "core.ts") {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const errors = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (external.test(specifier) || adapters.test(specifier))
        errors.push(`forbidden dependency ${specifier}`);
    }
    if (ts.isIdentifier(node) && ambient.has(node.text))
      errors.push(`forbidden ambient ${node.text}`);
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.getText(parsed) === "Math" &&
      node.name.text === "random"
    )
      errors.push("forbidden Math.random");
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return [...new Set(errors)];
}
export function checkProject(root = process.cwd()) {
  const files = fs
    .readdirSync(path.join(root, "lib/game"))
    .filter(
      (name) =>
        name.endsWith(".ts") && !["ids.ts", "use-game.ts", "simulation.worker.ts"].includes(name),
    );
  const errors = files.flatMap((name) =>
    boundaryViolations(fs.readFileSync(path.join(root, "lib/game", name), "utf8"), name).map(
      (error) => `lib/game/${name}: ${error}`,
    ),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  return files.length;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Core boundary check passed: ${checkProject()} modules.`);
}
