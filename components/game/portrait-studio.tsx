"use client";
import { useEffect, useRef, useState } from "react";
import { Dices, LoaderCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortraitSubject } from "@/lib/game/portrait-subject";
import { cachePortrait, portraitAsset } from "@/lib/ui/portrait-cache";
import { bundledPortrait } from "@/lib/game/portrait-library";
export function usePortrait(id?: string) {
  const [loaded, setLoaded] = useState({ id, src: "" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener("xiantu:portrait", update);
    return () => window.removeEventListener("xiantu:portrait", update);
  }, []);
  useEffect(() => {
    let active = true,
      url = "";
    setLoaded({ id, src: "" });
    void portraitAsset(id)
      .then((asset) => {
        if (active && asset) {
          url = URL.createObjectURL(asset.blob);
          setLoaded({ id, src: url });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, version]);
  return loaded.id === id ? loaded.src : "";
}
export function PortraitStudio({
  subject,
  portraitId,
  onAdopt,
  disabled = false,
  name = "角色",
}: {
  subject: PortraitSubject;
  portraitId?: string;
  onAdopt: (id: string) => void | Promise<void>;
  disabled?: boolean;
  name?: string;
}) {
  const cached = usePortrait(portraitId);
  const bundled = !portraitId ? bundledPortrait(subject) : null;
  const [failed, setFailed] = useState("");
  const candidate = cached || bundled?.src || "";
  const src = candidate === failed ? "" : candidate;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const signature = JSON.stringify(subject);
  const current = useRef(signature);
  current.current = signature;
  const unavailable = useRef(disabled);
  unavailable.current = disabled;
  useEffect(() => {
    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, []);
  const generate = async () => {
    if (controller.current || disabled) return;
    const original = signature,
      serial = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 125000);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/portraits", {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, variation: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "立绘生成失败。");
      if (serial !== sequence.current || abort.signal.aborted) return;
      if (current.current !== original)
        throw new Error("形貌已经修改，这张旧配置立绘未采用，请重新生成。");
      const id = await cachePortrait(data.image, original);
      if (serial !== sequence.current || current.current !== original || abort.signal.aborted)
        return;
      if (unavailable.current) throw new Error("当前行动或存档状态已变化，请结束行动后重新生成。");
      await onAdopt(id);
      frame.current?.scrollIntoView({ block: "nearest" });
    } catch (reason) {
      if (serial === sequence.current)
        setError(
          abort.signal.aborted
            ? "生成已取消或超时，请重试。"
            : reason instanceof Error
              ? reason.message
              : "生成失败，请重试。",
        );
    } finally {
      clearTimeout(timer);
      if (serial === sequence.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  };
  return (
    <section className="portrait-studio" aria-label={`${name}的全身立绘`}>
      <div className="fullbody-frame" ref={frame}>
        {src ? (
          <img
            src={src}
            alt={`${name}的全身立绘`}
            width={640}
            height={960}
            onError={() => setFailed(src)}
          />
        ) : (
          <div className="portrait-empty">
            <UserRound size={42} strokeWidth={1} />
            <span>全身立绘</span>
            <small>
              {portraitId ? "此浏览器尚无这张立绘，可重新生成。" : "按当前形貌随机绘制"}
            </small>
          </div>
        )}
        {busy && (
          <div className="portrait-pending" role="status">
            <LoaderCircle className="spin" />
            正在绘制全身立绘…
          </div>
        )}
      </div>
      {subject.sex === "female" && (
        <small className="portrait-hint">高开叉裙 · 丝袜美腿 · 高跟鞋</small>
      )}
      <div className="portrait-actions">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => void generate()}
        >
          <Dices size={15} />
          {portraitId || bundled ? "重新随机立绘" : "随机生成立绘"}
        </Button>
        {busy && (
          <Button type="button" variant="ghost" onClick={() => controller.current?.abort()}>
            取消生成
          </Button>
        )}
      </div>
      <small className="portrait-hint">
        使用「AI 模型设置」中的生图服务，生成一张可能产生费用。
      </small>
      {error && (
        <p role="alert" className="portrait-error">
          {error}
        </p>
      )}
    </section>
  );
}
