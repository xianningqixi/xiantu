"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { saveDownloadName, downloadSaveText } from "@/lib/ui/save-download";
import { REALMS } from "@/lib/game/content/official";
import type { BackupSummary, SaveExpectation } from "@/lib/game/types";
import type { useGame } from "@/lib/game/use-game";
type Props = { game: ReturnType<typeof useGame>; onPause: () => void };
export function BackupList({ game, onRestored }: { game: Props["game"]; onRestored: () => void }) {
  const [backups, setBackups] = useState<BackupSummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selection, setSelection] = useState<{
    backup: BackupSummary;
    expected: SaveExpectation;
  } | null>(null);
  useEffect(() => {
    let active = true;
    game
      .listBackups()
      .then((value) => {
        if (active) setBackups(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const download = async (backup?: BackupSummary) => {
    try {
      const text = backup ? await game.exportBackup(backup.key) : await game.exportSave();
      if (text)
        downloadSaveText(
          text,
          saveDownloadName({
            name: backup?.name ?? game.world?.player.name,
            day: backup?.day ?? game.world?.day,
            kind: backup ? "备份" : "原始进度",
            preview:
              backup?.key.startsWith("preview:") ?? game.world?.saveId.startsWith("preview:"),
          }),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败，请重新读取。");
    }
  };
  const reason = { create: "开始新局前", import: "导入前", restore: "恢复前", migration: "升级前" };
  return (
    <section className="backup-list">
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {game.recovery && (
        <Button variant="outline" onClick={() => void download()}>
          导出原始进度
        </Button>
      )}
      {loading ? (
        <p role="status">正在读取备份…</p>
      ) : backups.length ? (
        <ul>
          {backups.map((backup) => (
            <li key={backup.key}>
              <div>
                <strong>
                  {backup.name} · 第 {backup.day + 1} 日
                </strong>
                <p>
                  {backup.realm !== undefined ? REALMS[backup.realm] : "境界未记录"} ·{" "}
                  {backup.mode === "complex"
                    ? "复杂模式"
                    : backup.mode === "simple"
                      ? "简单模式"
                      : "模式未记录"}{" "}
                  · 版本 {backup.revision}
                </p>
                <small>
                  {backup.createdAt
                    ? new Date(backup.createdAt).toLocaleString("zh-CN")
                    : "历史备份 · 时间未记录"}
                  {backup.reason ? ` · ${reason[backup.reason]}` : ""}
                </small>
              </div>
              <div className="backup-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void download(backup)}
                  aria-label={`导出${backup.name}第${backup.day + 1}日备份`}
                >
                  导出
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={game.busy}
                  onClick={() => setSelection({ backup, expected: { ...game.expected } })}
                >
                  恢复
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>暂无备份。开始新局、导入或升级存档时会自动保留。</p>
      )}
      <AlertDialog open={!!selection} onOpenChange={(open) => !open && setSelection(null)}>
        <AlertDialogContent className="game-modal compact-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>恢复这份备份？</AlertDialogTitle>
            <AlertDialogDescription>
              用「{selection?.backup.name} · 第 {(selection?.backup.day ?? 0) + 1} 日」替换「
              {game.world?.player.name ?? "待读取角色"} · 第 {(game.world?.day ?? 0) + 1}{" "}
              日」。当前完整进度会先保留为另一份备份。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => void download()}>
              先导出当前存档
            </Button>
            <AlertDialogCancel>取消恢复</AlertDialogCancel>
            <AlertDialogAction
              disabled={game.busy}
              onClick={async (event) => {
                event.preventDefault();
                if (!selection) return;
                if (await game.restoreBackup(selection.backup.key, selection.expected)) {
                  setSelection(null);
                  onRestored();
                } else {
                  setSelection(null);
                  setError("备份未恢复，当前进度保留。请重新读取后再试。");
                }
              }}
            >
              确认恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
export function BackupManager({ game, onPause }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) onPause();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={game.busy}>
          本机备份
        </Button>
      </DialogTrigger>
      <DialogContent className="game-modal backups-modal">
        <DialogHeader>
          <DialogTitle>找回一段人生</DialogTitle>
          <DialogDescription>
            开始新局、导入或升级前的完整快照。恢复时也会备份当前进度。
          </DialogDescription>
        </DialogHeader>
        {open && <BackupList game={game} onRestored={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
