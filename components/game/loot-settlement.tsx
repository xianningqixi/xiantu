"use client";
import { TimeBadge } from "./time-badge";

import { PACK } from "@/lib/game/content/official";
import type { Command, World } from "@/lib/game/types";
import { ArrowLeft, ArrowRight } from "lucide-react";

type LootProps = {
  world: World;
  send: (command: Command) => Promise<boolean>;
  requestConfirm: (value: "breach") => void;
  blocked: boolean;
};
export function LootSettlement({ world: w, send, requestConfirm, blocked }: LootProps) {
  const p = w.player;
  const primary = w.npcs.find((a) => a.id === PACK.roles.primary)!;
  return (
    <>
      {" "}
      {w.loot && p.location === "ruins" && (
        <button
          className="story-choice"
          disabled={blocked}
          onClick={() => send({ type: "return" })}
        >
          <span className="choice-number">
            <ArrowLeft size={17} />
          </span>
          <span>
            <strong>收好战利品，返回坊市</strong>
            <small>同行返回 · 2 日</small>
          </span>
          <ArrowRight size={17} />
          <TimeBadge world={w} command={{ type: "return" }} />
        </button>
      )}
      {w.loot && p.location === "market" && w.agreement?.status === "impossible" && (
        <button
          className="story-choice"
          disabled={blocked}
          onClick={() => send({ type: "resolveAgreement" })}
        >
          <span className="choice-number">01</span>
          <span>
            <strong>按例外清点战利品</strong>
            <small>{w.agreement.reason} 不作为违约。</small>
          </span>
          <ArrowRight size={17} />
          <TimeBadge world={w} command={{ type: "resolveAgreement" }} />
        </button>
      )}
      {w.loot && p.location === "market" && w.agreement?.status !== "impossible" && (
        <>
          <button
            className="story-choice"
            disabled={blocked}
            onClick={() => send({ type: "settle", honor: true, confirm: true })}
          >
            <span className="choice-number">01</span>
            <span>
              <strong>按约将凝元草交给{primary.name}</strong>
              <small>履行约定 · 你获得 {w.loot?.stones} 灵石</small>
            </span>
            <ArrowRight size={17} />
            <TimeBadge world={w} command={{ type: "settle", honor: true, confirm: true }} />
          </button>
          <button
            className="story-choice alternative"
            disabled={blocked || w.agreement?.strict}
            onClick={() => requestConfirm("breach")}
          >
            <span className="choice-number">02</span>
            <span>
              <strong>把凝元草也收入自己囊中</strong>
              <small>
                {w.agreement?.strict ? "严格条款不允许违约分配" : "违背约定 · 她会记住你的选择"}
              </small>
            </span>
            <ArrowRight size={17} />
          </button>
        </>
      )}
    </>
  );
}
