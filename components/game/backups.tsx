"use client";
import { useState } from "react";
import { Archive, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import type { BackupSummary, SaveExpectation } from "@/lib/game/types";
import type { useGame } from "@/lib/game/use-game";

type Props = { game: ReturnType<typeof useGame>; onPause: () => void };
export function BackupManager({ game, onPause }: Props) {
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<{
    backup: BackupSummary;
    expected: SaveExpectation;
  } | null>(null);
  const show = async () => {
    onPause();
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      setBackups(await game.listBackups());
    } catch (e) {
      setError(e instanceof Error ? e.message : "备份读取失败。");
    } finally {
      setLoading(false);
    }
  };
  const download = async (backup: BackupSummary) => {
    try {
      const text = await game.exportBackup(backup.key);
      if (!text) return;
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `仙途_备份_${backup.name}_第${backup.day + 1}日.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "备份导出失败。");
    }
  };
  return (
    <>
      <Button variant="outline" disabled={game.busy} onClick={() => void show()}>
        <Archive data-icon="inline-start" />
        本机备份
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="game-modal">
          <DialogHeader>
            <DialogTitle>找回一段人生</DialogTitle>
            <DialogDescription>
              开始新局、导入或升级前保留的完整快照。恢复时也会备份当前进度。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {game.recovery && (
            <Button
              variant="outline"
              onClick={async () => {
                const text = await game.exportSave();
                if (!text) {
                  setError("原始数据未能导出，请重新读取后重试。");
                  return;
                }
                const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "仙途_原始进度_待恢复.json";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              }}
            >
              导出原始进度
            </Button>
          )}
          {loading ? (
            <p role="status">正在读取备份…</p>
          ) : backups.length === 0 ? (
            <p>暂无备份。首次开始新局、导入或升级存档时会自动保留。</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-4 overflow-y-auto">
              {backups.map((backup) => (
                <li key={backup.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {backup.name} · 第 {backup.day + 1} 日
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void download(backup)}
                      aria-label={`导出${backup.name}第${backup.day + 1}日备份`}
                    >
                      <Download data-icon="inline-start" />
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
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!selection}
        onOpenChange={(value) => {
          if (!value) setSelection(null);
        }}
      >
        <AlertDialogContent className="game-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>恢复这份备份？</AlertDialogTitle>
            <AlertDialogDescription>
              将恢复「{selection?.backup.name}」第 {(selection?.backup.day ?? 0) + 1}{" "}
              日。当前进度会先保留为另一份备份。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>再想一想</AlertDialogCancel>
            <AlertDialogAction
              disabled={game.busy}
              onClick={async () => {
                if (!selection) return;
                if (await game.restoreBackup(selection.backup.key, selection.expected))
                  setOpen(false);
                else setError("备份未恢复，请查看原页面提示，重新读取后再试。");
                setSelection(null);
              }}
            >
              确认恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
