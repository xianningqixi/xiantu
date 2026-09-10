"use client";
import { presentationShows } from "@/lib/game/presentation";
import { relation } from "@/lib/game/relationships";
import { commandDays } from "@/lib/game/action-cost";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { companyReason, intimacyReason, bondPartner, type IntimacyKind } from "@/lib/game/intimacy";
import type { Actor, World } from "@/lib/game/types";
import type { Send } from "./panels";
import { TimeBadge } from "./time-badge";
const names = { bond: "结为道侣", night: "共度良宵", dual: "道侣共修" };
export function IntimacyPanel({
  world: w,
  actor: a,
  send,
  blocked,
}: {
  world: World;
  actor: Actor;
  send: Send;
  blocked: boolean;
}) {
  const [pending, setPending] = useState<IntimacyKind | null>(null);
  const partner = bondPartner(w, a.id);
  const company = !presentationShows(w, "spendTime")
    ? "引气入体后开放相伴。"
    : companyReason(w, w.player, a);
  if (!relation(w, a.id)?.known)
    return (
      <section className="intimacy-panel">
        <p>尚未相识，请先使用下方的「上前见礼」。相识后可查看交往条件。</p>
      </section>
    );
  const bonded = partner?.id === "PLAYER" && bondPartner(w, "PLAYER")?.id === a.id;
  return (
    <section className="intimacy-panel" aria-label="相伴与亲密往来">
      <h3 className="list-heading">相伴与亲密往来</h3>
      {partner && (
        <p>
          道侣：{partner.name}
          {!partner.alive && "（已逝）"}
        </p>
      )}
      <p className="subtle">
        相伴交流会增进双方了解。亲密往来需双方成年、在场、愿意，并遵守各自的约定。
      </p>
      <Button
        variant="outline"
        disabled={blocked || !!company}
        onClick={() => void send({ type: "spendTime", target: a.id })}
      >
        相伴交流
        <TimeBadge world={w} command={{ type: "spendTime", target: a.id }} />
      </Button>
      {company && <small>{company}</small>}
      <div className="intimacy-options">
        {(bonded ? (["night", "dual"] as const) : (["bond"] as const)).map((kind) => {
          const reason =
            (kind === "bond" || kind === "dual") && !presentationShows(w, `intimacy.${kind}`)
              ? "筑基之后开放此入口。"
              : intimacyReason(w, w.player, a, kind);
          return (
            <div key={kind}>
              <Button
                variant="outline"
                disabled={blocked || !!reason}
                onClick={() => setPending(kind)}
              >
                {names[kind]}
                <TimeBadge
                  world={w}
                  command={{ type: "intimacy", target: a.id, kind, confirmed: true }}
                />
              </Button>
              <small>
                {reason === company
                  ? ""
                  : reason || `${a.name}愿意${names[kind]}，由你决定是否接受。`}
              </small>
            </div>
          );
        })}
      </div>
      {pending && (
        <div className="sect-confirm" role="group" aria-label="亲密往来确认">
          <strong>
            与{a.name}
            {names[pending]}
          </strong>
          <p>
            你向{a.name}提出{names[pending]}，当前双方符合条件。确认自愿接受？耗时{" "}
            {commandDays(w, { type: "intimacy", target: a.id, kind: pending, confirmed: true })}{" "}
            日，双方的经历会在保存后记入生平。
            {pending === "bond"
              ? "结侣后，任一方有在世道侣时不能再与他人结侣。"
              : pending === "dual"
                ? "双方按各自修炼规则获得修为，圆满不会自动尝试大境界突破。"
                : "此行动增进双方亲密关系，不直接给予修为奖励。"}
          </p>
          <div className="sect-actions">
            <Button
              disabled={blocked || !!intimacyReason(w, w.player, a, pending)}
              onClick={async () => {
                if (await send({ type: "intimacy", target: a.id, kind: pending, confirmed: true }))
                  setPending(null);
              }}
            >
              我愿意，确认{names[pending]}
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              暂不接受
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
