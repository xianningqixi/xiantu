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
import { Switch } from "@/components/ui/switch";
import {
  MAX_REPLY_TOKENS,
  modelDefaults,
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
            分别配置文字与生图服务。配置只对当前浏览器生效，密钥不进入游戏存档。保存后立即生效。
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
  const [personal, setPersonal] = useState(initial.source !== "server");
  const [draft, setDraft] = useState<ModelDraft>(() => ({ ...initial, key: "" }));
  const [working, setWorking] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof ModelDraft, string>>>({});
  const [clearConfirm, setClearConfirm] = useState(false);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0),
    form = useRef<HTMLFormElement>(null);
  const name = kind === "llm" ? "LLM 文字模型" : "生图模型";
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  const field = <K extends keyof ModelDraft>(name: K, value: ModelDraft[K]) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setMessage("");
    setError("");
    setErrors((e) => ({ ...e, [name]: undefined }));
  };
  const focusField = (name: string) => {
    const input = form.current?.querySelector<HTMLElement>(`[name="${name}"]`);
    const details = input?.closest("details");
    if (details) details.open = true;
    input?.focus();
  };
  const cancel = () => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setWorking(null);
    setMessage("本次测试已取消；之前保存的配置仍保留。");
  };
  const submit = async (action: "save" | "test" | "clear") => {
    if (controller.current) return;
    if (action !== "clear") {
      const invalid = validateModelDraft(draft, initial, kind);
      setErrors(invalid);
      const first = Object.keys(invalid)[0];
      if (first) {
        setError("请修正标出的配置项。");
        focusField(first);
        return;
      }
      if (action === "test" && !draft.enabled) {
        setError("请先启用模型。");
        return;
      }
    }
    const serial = ++sequence.current,
      abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), action === "test" ? draft.timeout + 5000 : 15000);
    setWorking(action);
    setError("");
    setMessage("");
    if (action !== "save") setPreview("");
    try {
      const config = {
        enabled: draft.enabled,
        baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""),
        model: draft.model.trim(),
        key: draft.key,
        timeout: draft.timeout,
        maxTokens: draft.maxTokens,
        revision: draft.revision,
      };
      const data = await api(
        action === "clear" ? { action, kind, revision: draft.revision } : { action, kind, config },
        abort.signal,
      );
      if (serial !== sequence.current) return;
      if (data.model) {
        onUpdate(data.model);
        setDraft({ ...data.model, key: "" });
        setPersonal(data.model.source !== "server");
      }
      if (data.image) setPreview(data.image);
      setMessage(
        (data.message || "操作完成。") +
          (action === "test" ? " 测试不保存修改，请点击保存配置。" : ""),
      );
    } catch (reason) {
      if (serial === sequence.current)
        setError(
          abort.signal.aborted
            ? "等待超时，可在高级选项调整等待上限。"
            : reason instanceof Error
              ? reason.message
              : "操作失败，请重新读取配置后重试。",
        );
    } finally {
      clearTimeout(timer);
      if (serial === sequence.current) {
        controller.current = null;
        setWorking(null);
      }
    }
  };
  const input = (
    key: "baseUrl" | "model" | "key" | "timeout" | "maxTokens",
    label: string,
    type = "text",
    help = "",
  ) => (
    <label className="form-field" key={key}>
      <span>{label}</span>
      <input
        name={key}
        type={type}
        value={key === "timeout" ? draft.timeout / 1000 : draft[key]}
        disabled={!!working}
        aria-invalid={!!errors[key]}
        aria-describedby={`${id}-${key}-help`}
        autoComplete={key === "key" ? "new-password" : "off"}
        spellCheck={false}
        min={key === "timeout" ? 1 : key === "maxTokens" ? 100 : undefined}
        max={
          key === "timeout"
            ? kind === "llm"
              ? 30
              : 120
            : key === "maxTokens"
              ? MAX_REPLY_TOKENS
              : undefined
        }
        maxLength={key === "key" ? 2048 : key === "baseUrl" ? 512 : 100}
        placeholder={
          key === "key" && initial.source === "personal" && initial.hasKey
            ? "已保存；留空保留现有密钥"
            : key === "baseUrl"
              ? "https://api.example.com/v1"
              : undefined
        }
        onChange={(event) =>
          field(
            key,
            key === "timeout"
              ? Number(event.target.value) * 1000
              : key === "maxTokens"
                ? Number(event.target.value)
                : event.target.value,
          )
        }
      />
      <small id={`${id}-${key}-help`} className={errors[key] ? "model-error" : ""}>
        {errors[key] || help}
      </small>
    </label>
  );
  return (
    <form
      ref={form}
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
          {initial.enabled ? "已启用" : "未启用"} ·{" "}
          {initial.source === "server"
            ? "站点服务"
            : initial.source === "personal"
              ? "个人配置"
              : "尚未配置"}
        </p>
        <p className="subtle">
          {kind === "llm"
            ? "用于同行交涉和生成立绘提示词。支持 OpenAI 兼容 Chat Completions。"
            : "用于人物立绘。需要同时启用文字模型：先综合形貌生成提示词，再调用生图模型绘制。支持 OpenAI 兼容 Images 接口。"}
        </p>
        {!personal ? (
          <section className="model-source">
            <h3>当前使用站点默认{name}</h3>
            <p>可以直接使用已启用的站点服务。个人地址和密钥只在切换后填写。</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPersonal(true);
                setDraft({
                  ...modelDefaults(kind),
                  enabled: true,
                  key: "",
                  revision: initial.revision,
                });
              }}
            >
              使用自己的服务
            </Button>
          </section>
        ) : (
          <>
            <div className="model-enable-row">
              <label htmlFor={`${id}-enabled`}>启用{name}</label>
              <Switch
                id={`${id}-enabled`}
                checked={draft.enabled}
                disabled={!!working}
                onCheckedChange={(value) => field("enabled", value)}
              />
            </div>
            {input(
              "baseUrl",
              "服务地址（Base URL）",
              "url",
              "支持公网 HTTP / HTTPS；填写接口根地址，例如以 /v1 结尾。",
            )}
            {input("model", "模型 ID")}
            {input(
              "key",
              "API Key",
              "password",
              initial.hasKey && initial.source === "personal"
                ? "留空保留已存密钥。更换地址需重新填写。"
                : "密钥不进入游戏存档或导出文件。",
            )}
            <details className="model-advanced">
              <summary>高级选项</summary>
              {input("timeout", "等待上限（秒）", "number")}
              {kind === "llm" && input("maxTokens", "回复 Token 上限", "number")}
            </details>
            {initial.source === "personal" && (
              <details className="model-danger">
                <summary>个人配置管理</summary>
                <p>停用开关会保留密钥；清除操作会删除本类型个人配置并停用。</p>
                <Button
                  className="model-clear"
                  type="button"
                  variant="ghost"
                  disabled={!!working}
                  onClick={() => setClearConfirm(true)}
                >
                  清除{name}个人配置
                </Button>
              </details>
            )}
          </>
        )}
        {preview && (
          <figure className="model-image-preview">
            <img src={preview} alt="生图模型测试预览" width={1024} height={1024} />
            <figcaption>测试预览 · 未写入游戏存档</figcaption>
          </figure>
        )}
      </div>
      <div className="model-form-footer">
        {personal && (
          <>
            <div className="model-actions">
              <Button type="submit" disabled={!!working}>
                {working === "save" ? "正在保存…" : "保存配置"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!!working || !draft.enabled}
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
              {!draft.enabled
                ? "先启用模型并补齐配置即可测试。"
                : kind === "image"
                  ? "测试会生成一张图片，可能产生费用；不消耗游戏日。"
                  : "测试发送短消息，可能产生 Token 费用；不消耗游戏日。"}
            </small>
          </>
        )}
        {error && (
          <p className="model-message model-error" role="alert">
            {error}
            {error.includes("超时") && (
              <Button type="button" variant="ghost" onClick={() => focusField("timeout")}>
                调整等待上限
              </Button>
            )}
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
            <AlertDialogTitle>清除{name}个人配置？</AlertDialogTitle>
            <AlertDialogDescription>
              删除本浏览器的{name}地址、模型 ID
              与已保存密钥，并停用该服务。另一类模型不变；以后需要重新填写。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留配置</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit("clear")}>
              确认清除{name}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
