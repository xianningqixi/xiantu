import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { startProdServer } from "vinext/server/prod-server";
import { originTarget } from "./http-target.mjs";

// Match production dotenv precedence; explicit process configuration wins.
for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (existsSync(file)) loadEnvFile(file);
}
const { values } = parseArgs({
  options: { port: { type: "string", short: "p" }, hostname: { type: "string", short: "H" } },
});
const port = Number(values.port ?? process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
const { server } = await startProdServer({
  port,
  host: values.hostname ?? "127.0.0.1",
  outDir: "dist",
});
const handlers = server.listeners("request");
server.removeAllListeners("request");
server.on("request", (request, response) => {
  try {
    request.url = originTarget(request.url ?? "/", request.headers.host);
  } catch {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }
  for (const handler of handlers) handler.call(server, request, response);
});
