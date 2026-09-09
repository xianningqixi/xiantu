"use client";
import { DEPARTURE_FEE } from "@/lib/game/economy";
import { scene } from "@/lib/game/story";
import { renewalReason, negotiationAvailability } from "@/lib/game/agreement";
import { TimeBadge } from "./time-badge";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PACK } from "@/lib/game/content/official";
import { uniqueId } from "@/lib/game/ids";
import {
  negotiationContext,
  proposalSchema,
  validTerms,
  type NegotiationProposal,
} from "@/lib/game/negotiation";
import type { Command, World } from "@/lib/game/types";
import { useEffect, useRef, useState } from "react";
export function Negotiation({
  world,
  busy,
  send,
  onPause,
}: {
  world: World;
  busy: boolean;
  send: (command: Command) => Promise<boolean>;
  onPause: () => void;
}) {
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [message, setMessage] = useState(""),
    [waiting, setWaiting] = useState(false),
    [proposal, setProposal] = useState<NegotiationProposal | null>(null),
    [mock, setMock] = useState(false),
    [offline, setOffline] = useState(false);
  const entryRef = useRef<HTMLButtonElement>(null);
  const session = useRef(""),
    requestId = useRef(""),
    controller = useRef<AbortController | null>(null),
    adopting = useRef(false);
  const target = world.npcs.find((a) => a.id === PACK.roles.primary)!;
  const companion = world.npcs.find((a) => a.id === PACK.roles.companion)!;
  const repeat = !!world.agreement && !["accepted", "active"].includes(world.agreement.status);
  const repeatReason = repeat ? renewalReason(world) : "";
  const availability = negotiationAvailability(world);
  const fixed = scene(world);
  const cancel = () => {
    requestId.current = "";
    controller.current?.abort();
    controller.current = null;
    setWaiting(false);
    setProposal(null);
  };
  useEffect(() => {
    let active = true;
    const update = async () => {
      if (!navigator.onLine) {
        if (active) setOffline(true);
        return;
      }
      try {
        await fetch("/offline-manifest.json", {
          method: "HEAD",
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        if (active) setOffline(false);
      } catch {
        if (active) setOffline(true);
      }
    };
    void update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [open]);
  useEffect(() => {
    session.current = open ? uniqueId() : "";
    requestId.current = "";
    controller.current?.abort();
    setWaiting(false);
    setProposal(null);
    setMessage("");
    return () => {
      requestId.current = "";
      controller.current?.abort();
    };
  }, [open, world.saveId, world.revision]);
  const ask = async () => {
    if (availability) return;
    cancel();
    const id = uniqueId(),
      sid = session.current;
    requestId.current = id;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 35000);
    setWaiting(true);
    setMessage("");
    try {
      const result = await fetch("/api/negotiation", {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saveId: world.saveId,
          sessionId: sid,
          revision: world.revision,
          text,
          context: negotiationContext(world, target.id),
        }),
      });
      const data = await result.json();
      if (requestId.current !== id || session.current !== sid) return;
      if (!result.ok)
        throw new Error(typeof data.error === "string" ? data.error : "交涉暂时不可用。");
      if (
        data.saveId !== world.saveId ||
        data.sessionId !== sid ||
        data.revision !== world.revision
      )
        throw new Error("进度已经变化，请重新商议。");
      setProposal(proposalSchema.parse(data.proposal));
      setMock(!!data.mock);
    } catch (error) {
      if (requestId.current === id)
        setMessage(
          abort.signal.aborted
            ? "交涉等待超时，请重试或继续固定选项。"
            : error instanceof Error
              ? error.message
              : "交涉未能完成，可继续固定选项。",
        );
    } finally {
      clearTimeout(timeout);
      if (requestId.current === id) setWaiting(false);
    }
  };
  const adopt = async () => {
    if (!proposal || adopting.current || waiting || !requestId.current) return;
    adopting.current = true;
    try {
      const ok = await send({
        type: "adoptNegotiation",
        proposalId: requestId.current,
        sessionId: session.current,
        saveId: world.saveId,
        revision: world.revision,
        target: target.id,
        proposal,
        confirmed: true,
      });
      if (ok) setOpen(false);
      else setMessage("规则未接受当前条款，请查看页面提示并重新商议。");
    } finally {
      adopting.current = false;
    }
  };
  const confirmable =
    proposal &&
    ["invite", "counter_offer", "accept"].includes(proposal.intent) &&
    validTerms(proposal);
  const renew = async () => {
    if (busy || adopting.current || waiting || repeatReason) return;
    adopting.current = true;
    try {
      if (await send({ type: "renewAgreement" })) setOpen(false);
      else setMessage("尚未建立新约定，请查看页面提示后重试。");
    } finally {
      adopting.current = false;
    }
  };
  return (
    <>
      <Button
        ref={entryRef}
        variant="outline"
        className="encounter-action negotiation-entry"
        disabled={busy || !!(repeat ? repeatReason : availability)}
        aria-describedby="negotiation-availability"
        onClick={() => {
          onPause();
          setOpen(true);
        }}
      >
        <span>{repeat ? `再次邀约${target.name}同行` : `与${target.name}同行交涉`}</span>
        <MessageCircle size={15} aria-hidden="true" />
      </Button>
      {(repeat ? repeatReason : availability) && (
        <p className="action-reason" id="negotiation-availability">
          {repeat ? repeatReason : availability}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) cancel();
          setOpen(value);
        }}
      >
        <DialogContent
          className="game-modal negotiation-modal"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            entryRef.current?.focus({ preventScroll: true });
          }}
        >
          <DialogHeader>
            <DialogTitle>{repeat ? "再次相约探秘境" : `与${target.name}商议同行`}</DialogTitle>
            <DialogDescription>
              当前只支持三人同行、第一株草归{target.name}、其余归你、路费 {DEPARTURE_FEE}{" "}
              灵石的标准约定；不支持自由定价或其他分配。等待和阅读不推进游戏日。
            </DialogDescription>
          </DialogHeader>
          {repeat && (
            <section className="negotiation-proposal" aria-label="再次同行条款">
              <p>再次邀约会建立一份新约定，之前的结算与共同经历仍然保留。</p>
              <ul>
                <li>
                  下一次秘境，由你、{target.name}和{companion.name}三人同行。
                </li>
                <li>第一株凝元草归{target.name}，其余战利品归你。</li>
                <li>出发时支付 {DEPARTURE_FEE} 灵石；现在确认不扣款。</li>
                <li>没有取得药草不算违约。</li>
              </ul>
              {repeatReason && <p role="status">{repeatReason}</p>}
              <Button disabled={busy || waiting || !!repeatReason} onClick={() => void renew()}>
                确认再次同行
                <TimeBadge world={world} command={{ type: "renewAgreement" }} />
              </Button>
            </section>
          )}
          {!repeat && fixed?.id === "agreement" && (
            <section className="negotiation-proposal">
              <p>也可直接采用故事中的标准条款，无需等待模型。</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  const choice = fixed.choices.find((c) => c.id === "accept") ?? fixed.choices[0];
                  if (await send({ type: "choose", nodeId: fixed.id, choiceId: choice.id }))
                    setOpen(false);
                }}
              >
                接受标准同行约定
              </Button>
            </section>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="form-field">
              <span>你想怎样商议</span>
              <textarea
                maxLength={1000}
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="说清药草归属、其余战利品和路费…"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={waiting || offline || !text.trim() || !!availability}>
                提出商议
              </Button>
              {waiting && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    cancel();
                    setMessage("已取消，游戏进度未改变。");
                  }}
                >
                  取消等待
                </Button>
              )}
            </div>
          </form>
          {availability && <p className="action-reason">文字交涉：{availability}</p>}
          {offline && <p role="status">当前离线，同行交涉不可用。关闭此窗后可以继续固定选项。</p>}
          {waiting && <p role="status">正在等待回应…</p>}
          {message && <p role="alert">{message}</p>}
          {proposal && (
            <section className="negotiation-proposal">
              <span className="eyebrow">{mock ? "本地测试回应" : "交涉草案"} · 尚未成立</span>
              <p>{proposal.reply}</p>
              {confirmable ? (
                <>
                  <ul>
                    <li>下一次秘境，由你、{target.name}和周安三人同行。</li>
                    <li>第一株凝元草归{target.name}，其余战利品归你。</li>
                    <li>出发时支付 {DEPARTURE_FEE} 灵石路费；没有取得药草不算违约。</li>
                  </ul>
                  <Button disabled={busy || waiting} onClick={() => void adopt()}>
                    确认以上条款
                  </Button>
                </>
              ) : (
                <p>
                  {proposal.intent === "reject"
                    ? "对方没有接受，当前没有新约定。"
                    : "条款仍不完整，请补充后重新商议。"}
                </p>
              )}
            </section>
          )}
          <p className="subtle">
            {repeat
              ? "可以直接确认上方固定条款，无需文字交涉。关闭此窗不会建立新约定。"
              : "也可以关闭此窗，使用故事中的固定选项继续。"}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
