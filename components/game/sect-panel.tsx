"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { sectAt, sectById } from "@/lib/game/sect-content";
import { joinSectReason } from "@/lib/game/sects";
import { LOCATIONS } from "@/lib/game/world-map";
import B from "@/lib/game/content/balance.json";
import type { World } from "@/lib/game/types";
import type { Send } from "./panels";
import { TimeBadge } from "./time-badge";

export function SectPanel({
  world: w,
  send,
  blocked,
  onProfile,
}: {
  world: World;
  send: Send;
  blocked: boolean;
  onProfile: (id: string) => void;
}) {
  const [confirmJoin, setConfirmJoin] = useState(false);
  const oath = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirmJoin) {
      oath.current?.focus({ preventScroll: true });
    }
  }, [confirmJoin]);
  const here = sectAt(w.player.location),
    m = w.player.sectMembership;
  if (!here) return null;
  const memberSect = sectById(m?.id);
  const visited = here && w.visitedSects?.includes(here.id);
  const disabled = blocked || !!w.loot;
  const joinReason = here ? joinSectReason(w, here.id) : "";
  const act: Send = async (c) => {
    const ok = await send(c);
    if (ok) setConfirmJoin(false);
    return ok;
  };
  return (
    <section id="sect-panel" className="sect-panel" aria-label="宗门修行" tabIndex={-1}>
      <header>
        <div>
          <span className="eyebrow">访山门 · 寻师友</span>
          <h3 className="serif">{here.name}</h3>
        </div>
        {m && (
          <span>
            贡献 {m.contribution} · 累计 {m.earned}
          </span>
        )}
      </header>
      {here && (
        <>
          <p className="sect-motto">{here.motto}</p>
          <p>{here.description}</p>
          <div className="sect-benefits">
            <strong>《{here.technique}》</strong>
            <p>
              学成后每日修炼 +{B.sects.growth[here.id].dailyGain} 修为
              {B.sects.growth[here.id].dualGain
                ? `，道侣共修另加 ${B.sects.growth[here.id].dualGain} 修为`
                : ""}
              。研习需 {B.sects.artContributionCost} 贡献。
            </p>
            <p>
              宗门委托耗时 {B.sects.taskDays} 日，奖励 {B.sects.taskContribution} 贡献、
              {B.sects.taskStones} 灵石。
            </p>
          </div>
          {!visited ? (
            <Button
              disabled={disabled}
              onClick={() => void act({ type: "visitSect", sectId: here.id })}
            >
              拜访{here.name}
              <TimeBadge world={w} command={{ type: "visitSect", sectId: here.id }} />
            </Button>
          ) : (
            <>
              <div className="sect-residents">
                {here.residents.map((r) => {
                  const a = w.npcs.find((n) => n.id === r.id);
                  return (
                    a && (
                      <Button key={r.id} variant="outline" onClick={() => onProfile(r.id)}>
                        查看{a.name} · {a.alive ? "门人" : "已逝"}
                      </Button>
                    )
                  );
                })}
              </div>
              {!m && (
                <div className="sect-admission">
                  <Button
                    disabled={disabled || !!joinReason}
                    onClick={() => setConfirmJoin(!confirmJoin)}
                  >
                    {confirmJoin ? "收起入门誓约" : `申请加入${here.name}`}
                  </Button>
                  {joinReason && <p className="subtle">{joinReason}</p>}
                  {confirmJoin && !joinReason && (
                    <div
                      className="sect-confirm"
                      role="group"
                      aria-label="入门誓约"
                      ref={oath}
                      tabIndex={-1}
                    >
                      <strong>入门誓约 · {here.name}</strong>
                      <p>
                        {here.id === "yunv"
                          ? "我确认此前未有性经历，自愿在宗期间守贞清修，不结道侣、不行亲密双修；若改变修行选择，可自由离宗。"
                          : "我自愿拜入师门，通过委托积累贡献、学习心法。结侣与亲密共修由双方另行决定。"}
                      </p>
                      <div className="sect-actions">
                        <Button
                          disabled={disabled}
                          onClick={() =>
                            void act({ type: "joinSect", sectId: here.id, confirmed: true })
                          }
                        >
                          确认自愿入门
                          <TimeBadge
                            world={w}
                            command={{ type: "joinSect", sectId: here.id, confirmed: true }}
                          />
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmJoin(false)}>
                          再考虑
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      {m && memberSect && (
        <div className="sect-training" data-sect-membership={m.id}>
          <p>
            《{memberSect.technique}》 · {m.artLearned ? "已掌握" : "尚未研习"}。学成后每日修炼增加{" "}
            {B.sects.growth[m.id].dailyGain} 修为
            {B.sects.growth[m.id].dualGain
              ? `，道侣共修另加 ${B.sects.growth[m.id].dualGain} 修为`
              : ""}
            。
          </p>
          {here?.id === m.id ? (
            <>
              <div className="sect-actions">
                <Button disabled={disabled} onClick={() => void act({ type: "sectTask" })}>
                  {memberSect.task}
                  <TimeBadge world={w} command={{ type: "sectTask" }} />
                </Button>
                {!m.artLearned && (
                  <Button
                    variant="outline"
                    disabled={
                      disabled || m.artLearned || m.contribution < B.sects.artContributionCost
                    }
                    onClick={() => void act({ type: "learnSectArt" })}
                  >
                    {m.artLearned ? "心法已习得" : `研习心法 · ${B.sects.artContributionCost} 贡献`}
                    <TimeBadge world={w} command={{ type: "learnSectArt" }} />
                  </Button>
                )}
              </div>
              {!m.artLearned && (
                <p className="action-reason">
                  研习还需 {Math.max(0, B.sects.artContributionCost - m.contribution)} 贡献，约{" "}
                  {Math.ceil(
                    Math.max(0, B.sects.artContributionCost - m.contribution) /
                      B.sects.taskContribution,
                  )}{" "}
                  次委托。
                </p>
              )}
              <small>
                委托报酬：{B.sects.taskContribution} 贡献、{B.sects.taskStones} 灵石。
              </small>
              <details className="sect-departure">
                <summary>离宗另行求道</summary>
                <p>
                  归还门籍后，当前贡献清零，本宗心法加成失效；重新入宗需重新研习。基础吐纳与过去经历保留，可以另择宗门。
                </p>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void act({ type: "leaveSect" })}
                >
                  确认离开{memberSect.name}
                  <TimeBadge world={w} command={{ type: "leaveSect" }} />
                </Button>
              </details>
            </>
          ) : (
            <p>回{LOCATIONS[memberSect.home].name}办理宗门委托、研习心法。</p>
          )}
        </div>
      )}
    </section>
  );
}
