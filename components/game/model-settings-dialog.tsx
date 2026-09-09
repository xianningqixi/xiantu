"use client";
import { validateModelDraft } from "@/lib/ai/model-draft";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MODEL_PRESETS,
  matchesModelEndpoint,
  type ModelDraft,
  type ModelKind,
  type ModelSummaries,
  type ModelSummary,
} from "@/lib/ai/model-settings";

async function api(body: object, signal: AbortSignal) {
  const response = await fetch("/api/model-settings", {
    method: "POST",
    cache: "no-store",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作未完成，请重试。");
  return data;
}
export default function ModelSettingsDialog({ onClose }: { onClose: () => void }) {
  const [models, setModels] = useState<ModelSummaries | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState<ModelKind>("llm");
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let current = true;
    setReading(true);
    setError("");
    void api({ action: "read" }, controller.signal)
      .then((data) => {
        if (current) {
          setModels(data.models);
          setError(data.warning || "");
        }
      })
      .catch(() => {
        if (current) setError("配置暂时无法读取。请确认联网后重新读取。");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (current) setReading(false);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [version]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="game-modal model-settings-modal">
        <DialogHeader>
          <DialogTitle className="serif">AI 模型设置</DialogTitle>
          <DialogDescription>
            只需填写 API Key，服务和模型已设好。密钥不进入游戏存档。
          </DialogDescription>
        </DialogHeader>
        <div className="model-settings-status">
          <small>{reading ? "正在读取配置…" : "密钥保存后仅显示配置状态。"}</small>
          <Button
            variant="ghost"
            size="sm"
            disabled={reading}
            onClick={() => {
              setModels(null);
              setVersion((v) => v + 1);
            }}
          >
            重新读取
          </Button>
        </div>
        {error && (
          <p className="model-message model-error" role="alert">
            {error}
          </p>
        )}
        {models && (
          <Tabs value={active} onValueChange={(value) => setActive(value as ModelKind)}>
            <TabsList className="model-settings-tabs" aria-label="模型类型">
              <TabsTrigger value="llm">
                LLM 文字模型{" "}
                <small aria-hidden="true">{models.llm.enabled ? "已启用" : "未启用"}</small>
              </TabsTrigger>
              <TabsTrigger value="image">
                生图模型{" "}
                <small aria-hidden="true">{models.image.enabled ? "已启用" : "未启用"}</small>
              </TabsTrigger>
            </TabsList>
            {(["llm", "image"] as const).map((kind) => (
              <TabsContent
                key={`${kind}:${version}`}
                value={kind}
                forceMount
                hidden={active !== kind}
              >
                <ModelForm
                  kind={kind}
                  initial={models[kind]}
                  onUpdate={(model) => {
                    setModels((value) => (value ? { ...value, [kind]: model } : value));
                    window.dispatchEvent(new Event("xiantu:model-settings"));
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
function ModelForm({
  kind,
  initial,
  onUpdate,
}: {
  kind: ModelKind;
  initial: ModelSummary;
  onUpdate: (value: ModelSummary) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<ModelDraft>({ key: "", revision: initial.revision });
  const [working, setWorking] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState("");
  const [keyError, setKeyError] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0),
    keyInput = useRef<HTMLInputElement>(null);
  const name = kind === "llm" ? "LLM 文字模型" : "生图模型";
  const preset = MODEL_PRESETS[kind];
  const reusableKey =
    initial.source === "personal" &&
    initial.hasKey &&
    !initial.needsKey &&
    matchesModelEndpoint(kind, initial.baseUrl);
  const ready = !!draft.key.trim() || reusableKey;
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  const cancel = () => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setWorking(null);
    setMessage("本次测试已取消；之前保存的 Key 仍保留。");
  };
  const submit = async (action: "save" | "test" | "clear") => {
    if (controller.current) return;
    if (action !== "clear") {
      const invalid = validateModelDraft(draft, initial, kind);
      setKeyError(invalid.key || "");
      if (invalid.key) {
        setError(invalid.key);
        keyInput.current?.focus();
        return;
      }
    }
    const serial = ++sequence.current,
      abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(
      () => abort.abort(),
      action === "test" ? preset.timeout + 5000 : 15000,
    );
    setWorking(action);
    setError("");
    setMessage("");
    if (action !== "save") setPreview("");
    try {
      const data = await api(
        action === "clear"
          ? { action, kind, revision: draft.revision }
          : { action, kind, config: { key: draft.key.trim(), revision: draft.revision } },
        abort.signal,
      );
      if (serial !== sequence.current) return;
      if (data.model) {
        onUpdate(data.model);
        setDraft({ key: "", revision: data.model.revision });
        setKeyError("");
      }
      if (data.image) setPreview(data.image);
      setMessage(
        (data.message || "操作完成。") +
          (action === "test" ? " 测试不保存 Key，请点击保存 Key。" : ""),
      );
    } catch (reason) {
      if (serial === sequence.current)
        setError(
          abort.signal.aborted
            ? "等待超时，请稍后重试。"
            : reason instanceof Error
              ? reason.message
              : "操作失败，请重新读取后重试。",
        );
    } finally {
      clearTimeout(timer);
      if (serial === sequence.current) {
        controller.current = null;
        setWorking(null);
      }
    }
  };
  return (
    <form
      noValidate
      className="model-settings-form"
      aria-label={`${name}配置`}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void submit("save");
      }}
    >
      <div className="model-form-body">
        <p className="model-state">
          {preset.model} · {initial.enabled ? "已启用" : "未启用"}
        </p>
        <p className="subtle">
          {kind === "llm"
            ? "用于同行交涉和构思立绘提示词。"
            : "用于绘制人物立绘，需同时配置文字模型的 Key。"}
        </p>
        <p className="subtle model-fixed-service">固定服务：{preset.baseUrl}</p>
        {initial.needsKey ? (
          <p className="model-message">
            原 Key 对应其他服务，请填写当前固定服务的 Key。原 Key 未被转移。
          </p>
        ) : initial.source === "server" ? (
          <p className="subtle">当前可使用站点服务；填写自己的 Key 后优先使用个人 Key。</p>
        ) : reusableKey && !initial.enabled ? (
          <p className="subtle">已保留个人 Key，点击保存即可重新启用。</p>
        ) : null}
        <div className="form-field">
          <label htmlFor={`${id}-key`}>API Key</label>
          <input
            ref={keyInput}
            id={`${id}-key`}
            name="key"
            type="password"
            value={draft.key}
            disabled={!!working}
            aria-invalid={!!keyError}
            aria-describedby={`${id}-key-help`}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={2048}
            placeholder={reusableKey ? "已保存；留空保留现有 Key" : "粘贴当前服务的 API Key"}
            onChange={(event) => {
              setDraft((value) => ({ ...value, key: event.target.value }));
              setMessage("");
              setError("");
              setKeyError("");
            }}
          />
          <small id={`${id}-key-help`} className={keyError ? "model-error" : ""}>
            {keyError ||
              (reusableKey
                ? "留空保留，填写新 Key 可替换。"
                : "保存后自动启用，其他参数无需填写。")}
          </small>
        </div>
        {initial.source === "personal" && initial.hasKey && (
          <Button
            className="model-clear"
            type="button"
            variant="ghost"
            disabled={!!working}
            onClick={() => setClearConfirm(true)}
          >
            清除{name} Key
          </Button>
        )}
        {preview && (
          <figure className="model-image-preview">
            <img src={preview} alt="生图模型测试预览" width={1024} height={1024} />
            <figcaption>测试预览 · 未写入游戏存档</figcaption>
          </figure>
        )}
      </div>
      <div className="model-form-footer">
        <div className="model-actions">
          <Button type="submit" disabled={!!working}>
            {working === "save" ? "正在保存…" : "保存 Key"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!!working || !ready}
            onClick={() => void submit("test")}
          >
            {working === "test" ? "测试中…" : kind === "llm" ? "测试连接" : "测试生图（1 张）"}
          </Button>
          {working === "test" && (
            <Button type="button" variant="ghost" onClick={cancel}>
              取消测试
            </Button>
          )}
        </div>
        <small>
          {!ready
            ? "填写个人 Key 后即可保存或测试。"
            : kind === "image"
              ? "测试会生成一张图片，可能产生费用；不消耗游戏日。"
              : "测试发送短消息，可能产生 Token 费用；不消耗游戏日。"}
        </small>
        {error && (
          <p className="model-message model-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="model-message" role="status">
            {message}
          </p>
        )}
      </div>
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent className="game-modal compact-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>清除{name} Key？</AlertDialogTitle>
            <AlertDialogDescription>
              删除本浏览器已保存的{name} Key
              并停用该模型。另一类模型和游戏存档不受影响；以后只需重新填写 Key。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留 Key</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit("clear")}>
              确认清除{name}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
