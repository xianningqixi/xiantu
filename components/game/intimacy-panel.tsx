"use client";
import { presentationShows } from "@/lib/game/presentation";
import { relation } from "@/lib/game/relationships";
import { commandDays } from "@/lib/game/action-cost";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { intimacyKind } from "@/lib/game/intimacy-history";
import {
  companyReason,
  intimacyReason,
  bondPartner,
  liaisonReason,
  betrayedIds,
  intimacyHistory,
  explicitIntimacyAllowed,
  type IntimacyKind,
  type LiaisonPlay,
  type LiaisonStance,
} from "@/lib/game/intimacy";
import { actorById } from "@/lib/game/rules";
import type { Actor, World } from "@/lib/game/types";
import type { Send } from "./panels";
import { TimeBadge } from "./time-badge";
const names = { bond: "结为道侣", night: "共度良宵", dual: "道侣共修" };
const plays = {
  tryst: "私下亲热",
  affair: "偷情",
  witness: "亲眼看着道侣出轨",
} as const;
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
  const [liaison, setLiaison] = useState<LiaisonPlay | null>(null);
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
  const scene = intimacyHistory(w, a.id).findLast(
    (event) =>
      event.actors.includes("PLAYER") && !!event.intimacy && intimacyKind(w, event) !== "bond",
  );
  const explicit = explicitIntimacyAllowed(w.player, a);
  const betrayed = betrayedIds(w, w.player, a)
    .map((id) => actorById(w, id)?.name)
    .filter((name): name is string => !!name);
  const confirmLiaison = async (play: LiaisonPlay, stance: LiaisonStance) => {
    if (await send({ type: "liaison", target: a.id, play, stance, confirmed: true }))
      setLiaison(null);
  };
  return (
    <section className="intimacy-panel" aria-label="相伴与亲密往来">
      <h3 className="list-heading">相伴与亲密往来</h3>
      {partner && (
        <p>
          道侣：{partner.name}
          {!partner.alive && "（已逝）"}
          {pairGrievance(w, a.id, partner.id) ? "（已生嫌隙）" : ""}
        </p>
      )}
      <p className="subtle">
        相伴交流会增进双方了解。亲密往来需双方成年、在场、愿意，并遵守各自的约定。
        满二十一岁后，还可以私下亲热、偷情，或看着自己的道侣和别人做。
      </p>
      {scene && <blockquote className="intimacy-scene">{scene.text}</blockquote>}
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
      <div className="intimacy-options liaison-options">
        <h4 className="list-heading">偷情、出轨与寝取</h4>
        <p className="subtle">
          先私下亲热，再偷情。对方或你已有道侣时，这一夜就是出轨。道侣在场时，可以把道侣推给眼前这个人，自己看着。
          {explicit ? "确认后会写下只属于当事人的具体经过。" : ""}
        </p>
        {(["tryst", "affair", "witness"] as const).map((play) => {
          const stance = play === "witness" ? "indulge" : "secret";
          const reason = liaisonReason(w, a, play, stance);
          return (
            <div key={play}>
              <Button
                variant="outline"
                disabled={blocked || !!reason}
                onClick={() => setLiaison(play)}
              >
                {plays[play]}
                <TimeBadge
                  world={w}
                  command={{ type: "liaison", target: a.id, play, stance, confirmed: true }}
                />
              </Button>
              <small>
                {reason ||
                  (play === "affair" && betrayed.length
                    ? `出轨。在世道侣是${betrayed.join("、")}，可以选择掩饰或留痕。`
                    : play === "affair"
                      ? "还没有在世道侣，这一夜仍是背着外人的偷情。"
                      : play === "witness"
                        ? `${bondPartner(w, "PLAYER")?.name ?? "道侣"}会和${a.name}做到高潮，你在旁边看着。`
                        : `${a.name}愿意先私下亲热，由你决定是否接受。`)}
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
            {pending !== "bond" && explicit ? "确认后会把这一夜写成只属于你们的经过。" : ""}
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
      {liaison && (
        <div className="sect-confirm" role="group" aria-label="出轨确认">
          <strong>
            与{a.name}
            {plays[liaison]}
          </strong>
          <p>
            {liaison === "witness"
              ? `${bondPartner(w, "PLAYER")?.name ?? "道侣"}和${a.name}都点头愿意。你会看着他们做到高潮。纵容则道侣还在；翻脸会结下仇怨，之后不能再共度良宵。`
              : liaison === "affair"
                ? betrayed.length
                  ? `这是出轨。${betrayed.join("、")}仍是道侣，这一夜不会先问他们。掩饰则暂时不让他们知道；留痕则会让他们推门看见。`
                  : "你们都没有在世道侣。确认之后仍会把这一夜写成偷情。"
                : `你和${a.name}都愿意先亲热，停在插入之前。耗时 ${commandDays(w, { type: "liaison", target: a.id, play: "tryst", stance: "secret", confirmed: true })} 日。`}
          </p>
          <div className="sect-actions">
            {liaison === "tryst" && (
              <Button
                disabled={blocked || !!liaisonReason(w, a, "tryst", "secret")}
                onClick={() => void confirmLiaison("tryst", "secret")}
              >
                我愿意，确认私下亲热
              </Button>
            )}
            {liaison === "affair" && (
              <>
                <Button
                  disabled={blocked || !!liaisonReason(w, a, "affair", "secret")}
                  onClick={() => void confirmLiaison("affair", "secret")}
                >
                  小心掩饰，确认偷情
                </Button>
                <Button
                  disabled={blocked || !!liaisonReason(w, a, "affair", "mark")}
                  onClick={() => void confirmLiaison("affair", "mark")}
                >
                  故意留痕，确认偷情
                </Button>
              </>
            )}
            {liaison === "witness" && (
              <>
                <Button
                  disabled={blocked || !!liaisonReason(w, a, "witness", "indulge")}
                  onClick={() => void confirmLiaison("witness", "indulge")}
                >
                  我只看着，确认
                </Button>
                <Button
                  disabled={blocked || !!liaisonReason(w, a, "witness", "sever")}
                  onClick={() => void confirmLiaison("witness", "sever")}
                >
                  看完就翻脸，确认
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setLiaison(null)}>
              暂不接受
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function pairGrievance(w: World, left: string, right: string) {
  return w.relations.some(
    (edge) =>
      edge.grievance &&
      ((edge.from === left && edge.to === right) || (edge.from === right && edge.to === left)),
  );
}
