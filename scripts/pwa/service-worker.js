/* VERSION and CORE are replaced from the exact production build by prepare-offline.mjs. */
const VERSION = __VERSION__;
const CORE = __CORE__;
const ART_CACHE = `xiantu-art-${VERSION}`;
const CACHE = `xiantu-core-${VERSION}`;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(CORE.map((url) => new Request(url, { cache: "reload" })));
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith("xiantu-core-"));
      for (const key of keys.slice(0, -2)) if (key !== CACHE) await caches.delete(key);
      const artKeys = (await caches.keys()).filter((k) => k.startsWith("xiantu-art-"));
      for (const key of artKeys.slice(0, -2)) if (key !== ART_CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "VERSION") {
    event.source?.postMessage({ type: "VERSION", version: VERSION });
    return;
  }
  if (event.data?.type !== "REQUEST_ACTIVATE") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (clients.some((client) => client.id !== event.source?.id)) {
        event.source?.postMessage({
          type: "UPDATE_BLOCKED",
          message: "请先关闭其他游戏或预览页面，再应用更新。",
        });
        return;
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    ["/sw.js", "/offline-manifest.json"].includes(url.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The committed HTML and hashed bundles always come from one installed version.
      const key =
        request.mode === "navigate"
          ? url.pathname === "/author"
            ? "/author"
            : url.pathname === "/"
              ? "/"
              : request
          : request;
      const exact = await cache.match(key);
      if (exact) return exact;
      const previous = await caches.match(request);
      if (previous) return previous;
      const response = await fetch(request);
      if (url.pathname.startsWith("/art/optimized/") && response.ok) {
        const art = await caches.open(ART_CACHE);
        await art.put(request, response.clone());
        const entries = await art.keys();
        for (const entry of entries.slice(0, -8)) await art.delete(entry);
      }
      return response;
    })(),
  );
});
