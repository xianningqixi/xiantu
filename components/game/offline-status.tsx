"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function OfflineStatus({ safe }: { safe: boolean }) {
  const [status, setStatus] = useState(""),
    [update, setUpdate] = useState(false),
    [install, setInstall] = useState<InstallEvent | null>(null),
    [applying, setApplying] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    requested = useRef(false);
  useEffect(() => {
    let live = true;
    const message = (event: MessageEvent) => {
      if (event.data?.type === "UPDATE_BLOCKED") {
        requested.current = false;
        setApplying(false);
        setStatus(event.data.message);
      }
    };
    const changed = () => {
      if (requested.current) location.reload();
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
          if (r.waiting) setStatus("新版已准备好，可在行动结束后更新。");
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
        if (live) {
          observe();
          if (!r.waiting) setStatus("离线可用");
        }
      } catch {
        if (live)
          setStatus(
            navigator.onLine
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
    requested.current = true;
    setApplying(true);
    registration.current.waiting.postMessage({ type: "REQUEST_ACTIVATE" });
  };
  if (!status && !install) return null;
  return (
    <aside className="offline-status" aria-label="离线与安装">
      <span role="status">{status}</span>
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
        <Button variant="outline" size="sm" disabled={!safe || applying} onClick={activate}>
          {applying ? "正在应用更新…" : safe ? "应用更新并重开" : "请先结束当前行动"}
        </Button>
      )}
      {applying && (
        <div className="update-overlay" role="alert">
          正在应用已缓存的版本，请稍候…
        </div>
      )}
    </aside>
  );
}
