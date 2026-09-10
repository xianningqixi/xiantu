"use client";
import { useModelReadiness } from "@/lib/ui/use-model-readiness";
import { AISettingsEntry } from "./ai-settings-entry";
import { useEffect, useRef, useState } from "react";
import { Dices, LoaderCircle, UserRound, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { portraitSubjectSchema, type PortraitSubject } from "@/lib/game/portrait-subject";
import { AppearanceFields } from "./appearance-fields";
import { portraitFeatures, PORTRAIT_FEATURES_MAX_LENGTH } from "@/lib/game/portrait-features";
import { cachePortrait, portraitAsset } from "@/lib/ui/portrait-cache";
import { bundledPortrait } from "@/lib/game/portrait-library";
import { extensionPortrait } from "@/lib/game/content/extensions";
import { imageAsset } from "@/lib/game/images";
import { cropAvatar } from "@/lib/ui/avatar-image";
import { cosmeticPortrait } from "@/lib/ui/cosmetic-art";
export function usePortrait(id?: string, variant: "fullbody" | "avatar" = "fullbody") {
  const [loaded, setLoaded] = useState({ id, variant, src: "" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener("xiantu:portrait", update);
    return () => window.removeEventListener("xiantu:portrait", update);
  }, []);
  useEffect(() => {
    let active = true,
      url = "";
    setLoaded({ id, variant, src: "" });
    void portraitAsset(id)
      .then(async (asset) => {
        if (!active || !asset) return;
        let blob = asset.blob;
        if (variant === "avatar") {
          if (asset.avatar) blob = asset.avatar;
          else {
            // Existing saved portraits get a display-only derivative, without a save migration.
            const bitmap = await createImageBitmap(asset.blob);
            try {
              blob = await cropAvatar(bitmap);
            } finally {
              bitmap.close();
            }
          }
        }
        if (!active) return;
        url = URL.createObjectURL(blob);
        setLoaded({ id, variant, src: url });
      })
      .catch(() => {});
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, version, variant]);
  return loaded.id === id && loaded.variant === variant ? loaded.src : "";
}
export function PortraitStudio({
  subject,
  portraitId,
  onAdopt,
  disabled = false,
  name = "角色",
  actorId,
  onFeaturesChange,
  editable = false,
  onRestore,
  restoreAvailable = false,
  originalPortraitId,
  protectedIds = [],
  onStateChange,
  showModelSettings = true,
}: {
  subject: PortraitSubject;
  portraitId?: string;
  onAdopt: (id: string, subject: PortraitSubject) => void | Promise<void>;
  disabled?: boolean;
  name?: string;
  actorId?: string;
  onFeaturesChange?: (features: string) => void;
  editable?: boolean;
  onRestore?: () => Promise<void>;
  restoreAvailable?: boolean;
  originalPortraitId?: string;
  protectedIds?: string[];
  onStateChange?: (state: { busy: boolean; pending: boolean }) => void;
  showModelSettings?: boolean;
}) {
  const readiness = useModelReadiness();
  const cached = usePortrait(portraitId);
  const bundled = !portraitId ? bundledPortrait(subject) : null;
  const owned = actorId ? (extensionPortrait(actorId) ?? cosmeticPortrait(actorId)) : null;
  const [failed, setFailed] = useState("");
  const candidate = cached || (owned?.url ? imageAsset(owned.url).src : "") || bundled?.src || "";
  const src = candidate === failed ? "" : candidate;
  const [draft, setDraft] = useState<PortraitSubject | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    signature: string;
    subject: PortraitSubject;
  } | null>(null);
  const previewSrc = usePortrait(pending?.id);
  const drawing = draft ?? subject;
  const [busy, setBusy] = useState(false),
    [adopting, setAdopting] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const editor = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const adoptionLock = useRef(false);
  const generatingSubject = useRef("");
  const appearanceChanged = useRef(false);
  const signature = JSON.stringify(drawing);
  const current = useRef(signature);
  current.current = signature;
  const unavailable = useRef(disabled);
  unavailable.current = disabled;
  const preview = pending?.signature === signature ? pending : null;
  const valid = portraitSubjectSchema.safeParse(drawing).success;
  useEffect(() => {
    onStateChange?.({ busy: busy || adopting, pending: !!preview });
  }, [busy, adopting, !!preview, onStateChange]);
  const hasOriginal = !!(portraitId || candidate);
  const editing = !!draft;
  useEffect(() => {
    if (editing) {
      editor.current?.scrollIntoView({ block: "start" });
      editor.current?.focus({ preventScroll: true });
    }
  }, [editing]);
  useEffect(() => {
    if (controller.current && generatingSubject.current !== signature) {
      appearanceChanged.current = true;
      controller.current.abort();
    }
    setPending((previous) => (previous?.signature === signature ? previous : null));
  }, [signature]);
  useEffect(() => {
    return () => {
      sequence.current++;
      controller.current?.abort();
    };
  }, []);
  const keepOriginal = () => {
    if (adoptionLock.current) return;
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setPending(null);
    setDraft(null);
    setError("");
    setNotice(hasOriginal ? "已保留原立绘和形貌。" : "已取消本次绘制。");
  };
  const generate = async () => {
    if (
      controller.current ||
      adoptionLock.current ||
      disabled ||
      !valid ||
      readiness.loading ||
      readiness.reason
    )
      return;
    const original = signature,
      serial = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    generatingSubject.current = original;
    appearanceChanged.current = false;
    // Covers the configured LLM (up to 30 s), image (up to 120 s), and transport overhead.
    const timer = setTimeout(() => abort.abort(), 165000);
    setBusy(true);
    setPending(null);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/portraits", {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: drawing, variation: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "立绘生成失败。");
      if (serial !== sequence.current || abort.signal.aborted) return;
      if (current.current !== original)
        throw new Error("形貌已经修改，这张旧配置立绘未采用，请重新生成。");
      // Preview storage must never evict the portrait the player can choose to retain.
      const id = await cachePortrait(data.image, original, [
        ...protectedIds,
        ...(portraitId ? [portraitId] : []),
        ...(originalPortraitId ? [originalPortraitId] : []),
      ]);
      if (serial !== sequence.current || current.current !== original || abort.signal.aborted)
        return;
      if (unavailable.current) throw new Error("当前行动或存档状态已变化，请结束行动后重新生成。");
      setPending({ id, signature: original, subject: structuredClone(drawing) });
    } catch (reason) {
      if (serial === sequence.current)
        setError(
          appearanceChanged.current
            ? "形貌已经修改，旧配置的立绘生成已取消，请重新生成。"
            : abort.signal.aborted
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
  const adopt = async () => {
    if (!preview || !previewSrc || disabled || busy || adoptionLock.current) return;
    adoptionLock.current = true;
    const serial = sequence.current;
    setAdopting(true);
    setError("");
    try {
      await onAdopt(preview.id, preview.subject);
      if (serial !== sequence.current) return;
      setPending(null);
      setDraft(null);
      setNotice("新立绘已采用。");
    } catch (reason) {
      if (serial === sequence.current)
        setError(reason instanceof Error ? reason.message : "尚未保存，可以重试或保留原立绘。");
    } finally {
      adoptionLock.current = false;
      if (serial === sequence.current) setAdopting(false);
    }
  };
  const restore = async () => {
    if (!onRestore || !restoreAvailable || disabled || busy || adoptionLock.current) return;
    adoptionLock.current = true;
    setAdopting(true);
    setError("");
    try {
      if (originalPortraitId && !(await portraitAsset(originalPortraitId)))
        throw new Error("此浏览器未保存原立绘图片，当前立绘已保留。");
      await onRestore();
      setDraft(null);
      setPending(null);
      setNotice("已恢复原立绘与对应形貌。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "原立绘尚未恢复，请重试。");
    } finally {
      adoptionLock.current = false;
      setAdopting(false);
    }
  };
  const originalPicture = src ? (
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
      <small>{portraitId ? "此浏览器尚无这张立绘，可重新生成。" : "按当前形貌随机绘制"}</small>
    </div>
  );
  return (
    <section
      className={`portrait-studio${draft ? " portrait-redraw" : ""}`}
      aria-label={`${name}的全身立绘`}
    >
      <div className="portrait-content">
        <p className="portrait-state" role="status">
          {busy
            ? "正在绘制 · 可取消"
            : adopting
              ? "正在保存采用结果"
              : preview
                ? "新立绘待采用 · 当前角色尚未改变"
                : draft
                  ? "编辑形貌 · 原立绘保留中"
                  : hasOriginal
                    ? "当前立绘"
                    : "尚未生成立绘 · 也可直接开始游戏"}
        </p>
        {draft && (
          <section className="portrait-editor" aria-label="重新绘制形貌" ref={editor} tabIndex={-1}>
            <h3 className="list-heading">重新绘制 · {name}</h3>
            <p className="subtle">按创建主角时的方式调整形貌，生成后再选择是否采用。</p>
            <AppearanceFields
              sex={drawing.sex}
              appearance={drawing.appearance}
              physique={drawing.physique}
              onAppearanceChange={(appearance) => setDraft({ ...drawing, appearance })}
              onPhysiqueChange={(physique) => setDraft({ ...drawing, physique })}
              disabled={disabled || adopting}
            />
          </section>
        )}
        {(draft || onFeaturesChange) && (
          <fieldset className="portrait-features">
            <legend>
              立绘特征 <span>可选 · 可修改默认造型</span>
            </legend>
            <input
              aria-label="立绘特征"
              autoComplete="off"
              maxLength={PORTRAIT_FEATURES_MAX_LENGTH}
              value={portraitFeatures(drawing)}
              placeholder="描述服饰、腿部、鞋履等立绘特征"
              disabled={disabled || adopting}
              onChange={(event) =>
                draft
                  ? setDraft({ ...drawing, portraitFeatures: event.target.value })
                  : onFeaturesChange?.(event.target.value)
              }
            />
            <small>衣着选项指定整体基调；这里补充剪裁、腿部与配饰，生成时合并使用。</small>
          </fieldset>
        )}
        {preview ? (
          <div className="portrait-comparison" aria-label="立绘对比">
            <figure>
              <figcaption>{hasOriginal ? "原立绘 · 当前使用" : "当前形象"}</figcaption>
              <div className="fullbody-frame">{originalPicture}</div>
            </figure>
            <figure>
              <figcaption>新立绘 · 待选择</figcaption>
              <div className="fullbody-frame">
                {previewSrc && (
                  <img src={previewSrc} alt={`${name}的新立绘预览`} width={640} height={960} />
                )}
              </div>
            </figure>
          </div>
        ) : (
          <div className="fullbody-frame">{originalPicture}</div>
        )}
        {!draft && !onFeaturesChange && (subject.role === "player" || subject.sex === "female") && (
          <small className="portrait-hint">{portraitFeatures(subject)}</small>
        )}
        {draft && <p className="portrait-hint">生成后可对比新旧立绘，采用时一并保存形貌。</p>}
        {!valid && (
          <p role="alert" className="portrait-error">
            请填写有效形貌，身高需为 145–210 cm 的整数。
          </p>
        )}
        {showModelSettings ? (
          <div className="model-readiness">
            <p>{readiness.reason || "文字与生图模型已就绪。"}</p>
            <AISettingsEntry onPause={() => {}} />
          </div>
        ) : (
          !readiness.loading &&
          readiness.reason && (
            <p className="portrait-hint" role="status">
              {readiness.reason}
            </p>
          )
        )}
      </div>
      <div className="portrait-actions">
        {busy && (
          <p className="portrait-action-message" role="status">
            <LoaderCircle className="spin" size={16} /> 正在综合形貌、生成提示词并绘制立绘…
          </p>
        )}
        {notice && (
          <p className="portrait-action-message portrait-hint" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="portrait-action-message portrait-error" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <Button
            type="button"
            disabled={disabled || adopting || busy || !previewSrc}
            onClick={() => void adopt()}
          >
            {adopting ? "正在保存…" : "采用新立绘"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={
            disabled ||
            busy ||
            adopting ||
            !valid ||
            ((!!draft || !editable) && (readiness.loading || !!readiness.reason))
          }
          onClick={() => {
            if (editable && !draft) {
              setDraft({
                ...structuredClone(subject),
                portraitFeatures: portraitFeatures(subject),
              });
              setError("");
              setNotice("");
            } else void generate();
          }}
        >
          <Dices data-icon="inline-start" />
          {editable && !draft
            ? "重新绘制立绘"
            : preview
              ? "再生成一张"
              : draft
                ? "生成新立绘"
                : hasOriginal
                  ? "重新随机立绘"
                  : "随机生成立绘"}
        </Button>
        {onRestore && !draft && !preview && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy || adopting || !restoreAvailable}
            onClick={() => void restore()}
          >
            <RotateCcw data-icon="inline-start" />
            恢复原立绘
          </Button>
        )}
        {busy && (
          <Button type="button" variant="ghost" onClick={() => controller.current?.abort()}>
            取消生成
          </Button>
        )}
        {(draft || preview) && (
          <Button type="button" variant="ghost" disabled={adopting} onClick={keepOriginal}>
            {hasOriginal ? "保留原立绘" : "取消绘制"}
          </Button>
        )}
      </div>
      {onRestore && !restoreAvailable && !draft && (
        <p className="portrait-hint">采用新立绘时会保留原图及形貌，之后可在这里恢复。</p>
      )}
    </section>
  );
}
