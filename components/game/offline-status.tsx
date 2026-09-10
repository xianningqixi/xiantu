"use client";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function OfflineStatus({
  safe,
  container,
}: {
  safe: boolean;
  container?: HTMLElement | null;
}) {
  const [online, setOnline] = useState(true);
  const [blockedMessage, setBlockedMessage] = useState("");
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    change();
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  const [status, setStatus] = useState(""),
    [update, setUpdate] = useState(false),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [applying, setApplying] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    requested = useRef(false);
  useEffect(() => {
    let live = true;
    const cacheViewedArt = () => {
      navigator.serviceWorker.controller?.postMessage({
        type: "CACHE_VIEWED_ART",
        urls: [...document.images]
          .filter((img) => img.complete && img.naturalWidth > 0)
          .map((img) => img.currentSrc),
      });
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_BLOCKED") {
        requested.current = false;
        setApplying(false);
        setBlockedMessage(event.data.message);
      }
    };
    const changed = () => {
      if (requested.current) location.reload();
      else cacheViewedArt();
    };
    const installable = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", installable);
    if (!("serviceWorker" in navigator))
      return () => window.removeEventListener("beforeinstallprompt", installable);
    navigator.serviceWorker.addEventListener("message", message);
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    const prepare = async () => {
      try {
        const manifest = await fetch("/offline-manifest.json", { cache: "no-store" });
        if (!manifest.ok) return;
        const metadata = await manifest.json();
        if (!metadata.available) return;
        const r = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        registration.current = r;
        const observe = () => {
          if (!live) return;
          setUpdate(!!r.waiting);
          if (r.waiting) setStatus("固定剧情离线内容已缓存");
        };
        const watch = () => {
          const worker = r.installing;
          if (!live) return;
          setStatus("正在准备离线内容…");
          worker?.addEventListener("statechange", () => {
            observe();
            if (worker.state === "redundant" && live)
              setStatus("离线内容未准备完整，请联网重开后重试。");
          });
        };
        observe();
        r.addEventListener("updatefound", watch);
        if (r.installing) watch();
        await navigator.serviceWorker.ready;
        cacheViewedArt();
        if (live) {
          observe();
          setStatus("固定剧情离线内容已缓存");
        }
      } catch {
        if (live)
          setStatus(
            navigator.serviceWorker.controller
              ? "已缓存的固定剧情仍可游玩"
              : navigator.onLine
                ? "离线准备暂未完成，请联网重开后重试。"
                : "当前离线，已缓存的固定剧情可继续游玩。",
          );
      }
    };
    void prepare();
    return () => {
      live = false;
      window.removeEventListener("beforeinstallprompt", installable);
      navigator.serviceWorker.removeEventListener("message", message);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);
  const activate = () => {
    if (!safe || !registration.current?.waiting) return;
    setBlockedMessage("");
    requested.current = true;
    setApplying(true);
    registration.current.waiting.postMessage({ type: "REQUEST_ACTIVATE" });
  };
  if (online && !status && !install && !update) return null;
  const content = (
    <aside className="offline-status" aria-label="离线与安装">
      <span role="status">{online ? status : "当前离线 · 固定剧情可玩，AI 与生图需联网"}</span>
      {install && (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await install.prompt();
            await install.userChoice;
            setInstall(null);
          }}
        >
          安装仙途
        </Button>
      )}
      {update && (
        <Button
          variant="outline"
          size="sm"
          title="已保存进度保留，页面将重新打开"
          disabled={!safe || applying}
          onClick={activate}
        >
          {applying ? "正在应用更新…" : safe ? "更新并重载" : "请先结束当前行动"}
        </Button>
      )}
      {update && <small>有可用更新 · 已保存进度保留，页面将重新打开。</small>}
      {blockedMessage && <p role="status">{blockedMessage}</p>}
      {applying && (
        <div className="update-overlay" role="alert">
          正在应用已缓存的版本，请稍候…
        </div>
      )}
    </aside>
  );
  return container === undefined ? content : container ? createPortal(content, container) : null;
}
