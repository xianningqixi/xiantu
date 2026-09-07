"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LOCATIONS, REALMS } from "@/lib/game/content/official";
import type { World } from "@/lib/game/types";
import { useGame } from "@/lib/game/use-game";
import { ArrowDownToLine, RotateCcw, Save, Upload } from "lucide-react";
import { BackupManager } from "./backups";

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
  const p = w.player;
  return (
    <Dialog
      open={settings}
      onOpenChange={(open) => {
        pause();
        setSettings(open);
      }}
    >
      <DialogContent className="game-modal">
        <DialogHeader>
          <DialogTitle className="serif">收好这一卷人生</DialogTitle>
          <DialogDescription>
            进度自动保存在当前浏览器。换设备或清理浏览器前，请导出备份。
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              重新读取
            </Button>
          </div>
        )}
        <div className="save-info">
          <Save />
          <div>
            <strong>
              {p.name} · {REALMS[p.realm]}
            </strong>
            <p>
              第 {w.day + 1} 日 · {LOCATIONS[p.location].name}
            </p>
            <small>
              机缘种子 {w.seed} · {w.profile.mode === "simple" ? "简单模式" : "复杂模式"}
            </small>
          </div>
        </div>
        <Button disabled={busy} onClick={() => void download()}>
          <ArrowDownToLine size={16} /> 导出当前存档
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => importRef.current?.click()}>
          <Upload size={16} /> 导入存档
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            pause();
            await game.refreshDraft();
            setSettings(false);
            setShowCreate(true);
          }}
        >
          <RotateCcw size={16} /> 创建新角色
        </Button>
        <BackupManager game={game} onPause={pause} />
        <div className="template-card">
          <div>
            <span className="eyebrow">内容创作模板</span>
            <h3 className="serif">青石人间 · 一诺之重</h3>
            <p>下载这章的大纲、剧情、NPC 资料与全部配图，交给创作者继续改写。</p>
          </div>
          <a className="template-link" href="/templates/qingshi-content-pack.zip" download>
            <ArrowDownToLine size={16} /> 下载故事与配图模板
          </a>
          <small>按包内说明修改后，由开发者更新网页。当前不支持在游戏内上传内容包。</small>
        </div>
        <p className="subtle">
          青石篇可游玩至筑基。自由交涉需要服务端配置，可随时使用固定选项继续。
        </p>
      </DialogContent>
    </Dialog>
  );
}
