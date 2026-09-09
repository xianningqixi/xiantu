"use client";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REALMS } from "@/lib/game/content/official";
import { LOCATIONS } from "@/lib/game/world-map";
import type { World } from "@/lib/game/types";
import type { useGame } from "@/lib/game/use-game";
import { BackupList } from "./backups";
const ModelSettingsDialog = lazy(() => import("./model-settings-dialog"));
type SettingsProps = {
  world: World;
  game: ReturnType<typeof useGame>;
  busy: boolean;
  error: string;
  settings: boolean;
  setSettings: (value: boolean) => void;
  pause: () => void;
  reload: () => Promise<boolean>;
  download: () => Promise<void>;
  importRef: React.RefObject<HTMLInputElement | null>;
  setShowCreate: (value: boolean) => void;
};
export function SettingsDialog({
  world: w,
  game,
  busy,
  error,
  settings,
  setSettings,
  pause,
  reload,
  download,
  importRef,
  setShowCreate,
}: SettingsProps) {
  const [view, setView] = useState("settings");
  const modelsEntry = useRef<HTMLButtonElement>(null);
  const returningFromModels = useRef(false);
  useEffect(() => {
    if (!settings) setView("settings");
  }, [settings]);
  if (!settings) return null;
  if (view === "models")
    return (
      <Suspense fallback={<p role="status">正在读取模型设置…</p>}>
        <ModelSettingsDialog
          onClose={() => {
            returningFromModels.current = true;
            setView("settings");
          }}
        />
      </Suspense>
    );
  return (
    <Dialog
      open={settings}
      onOpenChange={(open) => {
        pause();
        setSettings(open);
      }}
    >
      <DialogContent
        className="game-modal settings-modal"
        onOpenAutoFocus={(event) => {
          if (returningFromModels.current) {
            event.preventDefault();
            returningFromModels.current = false;
            modelsEntry.current?.focus({ preventScroll: true });
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="serif">
            {view === "backups" ? "存档与设置 › 本机备份" : "存档与设置"}
          </DialogTitle>
          <DialogDescription>
            当前浏览器自动保存进度。换设备或清理浏览器前请导出。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="error-banner" role="alert">
            <p>{error}</p>
            {game.canRetry && (
              <Button variant="outline" disabled={busy} onClick={() => void game.retry()}>
                重试此行动
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => void reload()}>
              重新读取并确认进度
            </Button>
          </div>
        )}
        {view === "backups" ? (
          <>
            <Button variant="ghost" onClick={() => setView("settings")}>
              返回存档与设置
            </Button>
            <BackupList game={game} onRestored={() => setSettings(false)} />
          </>
        ) : (
          <div className="settings-body">
            <section>
              <h3>这一世</h3>
              <div className="save-info">
                <div>
                  <strong>
                    {w.player.name} · {REALMS[w.player.realm]}
                  </strong>
                  <p>
                    第 {w.day + 1} 日 · {LOCATIONS[w.player.location].name} ·{" "}
                    {w.profile.mode === "simple" ? "简单" : "复杂"}模式
                  </p>
                </div>
              </div>
              <div className="settings-actions">
                <Button disabled={busy} onClick={() => void download()}>
                  导出当前存档
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => importRef.current?.click()}
                >
                  导入存档
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setView("backups")}>
                  本机备份
                </Button>
              </div>
            </section>
            <section>
              <h3>新的一世</h3>
              <p>填写新角色后再确认替换；旧进度会保留备份。</p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  pause();
                  try {
                    await game.refreshDraft();
                    setSettings(false);
                    setShowCreate(true);
                  } catch {
                    game.setError("创角草稿读取失败，请重试。");
                  }
                }}
              >
                创建新角色
              </Button>
            </section>
            <section>
              <h3>工具</h3>
              <Button
                ref={modelsEntry}
                variant="outline"
                onClick={() => {
                  pause();
                  setView("models");
                }}
              >
                AI 模型设置
              </Button>
              <details className="template-card">
                <summary>内容创作模板</summary>
                <p>下载青石篇的故事、人物资料与配图，供创作者改写。</p>
                <a className="template-link" href="/templates/qingshi-content-pack.zip" download>
                  下载故事与配图模板
                </a>
                <small>修改后由开发者更新网页，游戏内不能上传内容包。</small>
              </details>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
