"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { practicePreview } from "@/lib/ui/realm-presentation";
import { STONE_METHOD } from "@/lib/game/economy";
import type { World } from "@/lib/game/types";
import type { Send } from "./panels";
export function PracticeSettings({
  world,
  open,
  onOpenChange,
  act,
  blocked,
}: {
  world: World;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  act: Send;
  blocked: boolean;
}) {
  const [days, setDays] = useState(7),
    [stone, setStone] = useState(false),
    [mode, setMode] = useState("ready");
  const preview = practicePreview(world, mode === "ready" ? 30 : days, stone, mode === "important");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="game-modal dojo-drawer">
        <DialogHeader>
          <DialogTitle>设置修炼方式</DialogTitle>
          <DialogDescription>世界逐日推进，每一日完整保存后显示结果。</DialogDescription>
        </DialogHeader>
        <label className="switch-row">
          <span>
            以灵石辅助
            <small>
              每日额外 +{STONE_METHOD.additionalExperiencePerDay} 修为，消耗{" "}
              {STONE_METHOD.costSpiritStonesPerDay} 灵石
            </small>
          </span>
          <Switch aria-label="以灵石辅助修炼" checked={stone} onCheckedChange={setStone} />
        </label>
        <label className="field-label">
          停止条件
          <select aria-label="停止条件" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="ready">修炼至圆满（最多 30 日）</option>
            <option value="days">按选定日数</option>
            <option value="important">重要事件时暂停</option>
          </select>
        </label>
        {mode !== "ready" && (
          <label className="field-label">
            修炼日数
            <select
              aria-label="修炼日数"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[1, 3, 7, 30].map((d) => (
                <option key={d} value={d}>
                  {d} 日
                </option>
              ))}
            </select>
          </label>
        )}
        <p>
          每日 +{preview.gain} 修为，约 {preview.readyAfter} 日圆满。
          {stone ? `需备足 ${preview.budget} 灵石，按实际日数扣除。` : "无灵石消耗。"}
        </p>
        {preview.reason && <p id="practice-reason">{preview.reason}</p>}
        <Button
          id="practice-start"
          disabled={blocked || !!preview.reason}
          onClick={async () => {
            const command =
              mode === "days" ? { ...preview.command, stopWhen: undefined } : preview.command;
            if (await act(command)) onOpenChange(false);
          }}
        >
          开始修炼 · 最多 {mode === "ready" ? 30 : days} 日
        </Button>
      </DialogContent>
    </Dialog>
  );
}
