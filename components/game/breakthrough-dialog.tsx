"use client";
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { B, stats } from "@/lib/game/rules";
import { PACK, REALMS } from "@/lib/game/content/official";
import { relation } from "@/lib/game/relationships";
import { breakthroughChance } from "@/lib/game/cultivation";
import { SHOP_ITEMS } from "@/lib/game/economy";
import { realmPresentation } from "@/lib/ui/realm-presentation";
import { LOCATIONS } from "@/lib/game/world-map";
import type { World } from "@/lib/game/types";
import type { Send } from "./panels";
export function BreakthroughDialog({
  world: w,
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
  const [gathering, setGathering] = useState(false);
  const gatherTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) setGathering(false);
    return () => {
      if (gatherTimer.current) clearTimeout(gatherTimer.current);
      gatherTimer.current = null;
    };
  }, [open]);
  const [pill, setPill] = useState(false),
    [guardian, setGuardian] = useState(false);
  const p = w.player,
    state = realmPresentation(p),
    rule = state.rule;
  const person = w.npcs.find((a) => a.id === PACK.roles.primary)!,
    rel = relation(w, person.id);
  const checks = [
    { ok: person.alive, text: "在世" },
    { ok: !person.attempt, text: "未在突破" },
    {
      ok: person.location === p.location,
      text: `同一地点（她在${LOCATIONS[person.location].name}）`,
    },
    { ok: person.realm >= p.realm, text: `境界不低于你（${REALMS[person.realm]}）` },
    {
      ok: (rel?.trust || 0) >= B.cultivation.breakthrough.guardianMinimumTrust,
      text: "彼此信任已足够",
    },
    {
      ok: (rel?.favor || 0) >= B.cultivation.breakthrough.guardianMinimumFavorability,
      text: "交情已足够",
    },
  ];
  const possible = checks.every((c) => c.ok),
    usePill = state.preparation && pill && p.pills > 0,
    useGuardian = state.preparation && guardian && possible;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="game-modal breakthrough-dialog">
        <DialogHeader>
          <DialogTitle>准备踏入{state.target ?? REALMS[p.realm]}</DialogTitle>
          <DialogDescription>
            耗时 {rule.days} 日；失败不致命。普通失败损失 {rule.failureExperienceLossBp / 100}% 修为
            {rule.severeFailureConditionalBp > 0 &&
              `，失败时有 ${rule.severeFailureConditionalBp / 100}% 概率跌落一层`}
            。
          </DialogDescription>
        </DialogHeader>
        <strong className="breakthrough-chance">
          {breakthroughChance(w, p, usePill, useGuardian) / 100}
          <small>% 成功率</small>
        </strong>
        {state.preparation && (
          <>
            <label className="switch-row">
              <span>
                服用突破丹
                <small>
                  成功率 +{B.cultivation.breakthrough.pillBonusBp / 100}% · 持有 {p.pills} 枚
                </small>
              </span>
              <Switch
                aria-label="服用突破丹"
                checked={usePill}
                onCheckedChange={setPill}
                disabled={blocked || gathering || !p.pills}
              />
            </label>
            {!p.pills && (
              <p>
                坊市售价 {SHOP_ITEMS.pills.price} 灵石，亦可用{" "}
                {B.economy.pillExchange.inputQuantity} 株凝元草与{" "}
                {B.economy.pillExchange.spiritStoneCost} 灵石兑换。
              </p>
            )}
            <label className="switch-row">
              <span>
                邀请{person.name}护法
                <small>成功率 +{B.cultivation.breakthrough.guardianBonusBp / 100}%</small>
              </span>
              <Switch
                aria-label={`邀请${person.name}护法`}
                checked={useGuardian}
                onCheckedChange={setGuardian}
                disabled={blocked || gathering || !possible}
              />
            </label>
            <div className="guardian-checks">
              {checks.map((c) => (
                <span key={c.text}>
                  {c.ok ? "✓" : "未满足："} {c.text}
                </span>
              ))}
            </div>
          </>
        )}
        {!state.canBreak && <p>修为尚未圆满，或当前境界无需手动突破。</p>}
        {gathering && (
          <p className="breakthrough-gathering" role="status">
            屏息凝神，灵气正汇入丹田。
          </p>
        )}
        <Button
          disabled={blocked || gathering || !state.canBreak || p.location === "ruins"}
          onClick={() => {
            setGathering(true);
            gatherTimer.current = setTimeout(async () => {
              gatherTimer.current = null;
              const ok = await act({ type: "breakthrough", usePill, guardian: useGuardian });
              setGathering(false);
              if (ok) onOpenChange(false);
            }, 1200);
          }}
        >
          {gathering ? "凝聚气机…" : `凝神，尝试突破 · ${rule.days} 日`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
