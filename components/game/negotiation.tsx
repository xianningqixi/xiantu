"use client";
import { Button } from "@/components/ui/button";
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
  const session = useRef(""),
    requestId = useRef(""),
    controller = useRef<AbortController | null>(null),
    adopting = useRef(false);
  const target = world.npcs.find((a) => a.id === PACK.roles.primary)!;
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
  return (
    <>
      <Button
        variant="outline"
        disabled={
          busy ||
          world.ended ||
          !!world.battle ||
          !!world.longAction ||
          !target.alive ||
          target.location !== world.player.location
        }
        onClick={() => {
          onPause();
          setOpen(true);
        }}
      >
        与{target.name}同行交涉
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) cancel();
          setOpen(value);
        }}
      >
        <DialogContent className="game-modal negotiation-modal">
          <DialogHeader>
            <DialogTitle>与{target.name}商议同行</DialogTitle>
            <DialogDescription>
              同行交涉可选；等待和阅读不推进游戏日。草案需由你确认，双方资格会再次核对。
            </DialogDescription>
          </DialogHeader>
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
              <Button type="submit" disabled={waiting || offline || !text.trim()}>
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
                    <li>出发时支付 2 灵石路费；没有取得药草不算违约。</li>
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
          <p className="subtle">也可以关闭此窗，使用故事中的固定选项继续。</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
