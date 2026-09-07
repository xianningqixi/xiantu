"use client";
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
import type { ModelDraft, ModelKind, ModelSummaries, ModelSummary } from "@/lib/ai/model-settings";

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
              <TabsTrigger value="llm">LLM 文字模型</TabsTrigger>
              <TabsTrigger value="image">生图模型</TabsTrigger>
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
                  onUpdate={(model) =>
                    setModels((value) => (value ? { ...value, [kind]: model } : value))
                  }
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
  const [draft, setDraft] = useState<ModelDraft>(() => ({ ...initial, key: "" }));
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
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
  };
  const cancel = () => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setWorking(null);
    setMessage("测试已取消，配置未改变。");
  };
  const submit = async (action: "save" | "test" | "clear") => {
    if (controller.current) return;
    const serial = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), action === "test" ? draft.timeout + 5000 : 15000);
    setWorking(action);
    setMessage("");
    setError("");
    if (action !== "save") setPreview("");
    // Pick only the accepted fields; metadata and any inherited server key never go back.
    const config = {
      enabled: draft.enabled,
      baseUrl: draft.baseUrl,
      model: draft.model,
      key: draft.key,
      timeout: draft.timeout,
      maxTokens: draft.maxTokens,
      revision: draft.revision,
    };
    try {
      const data = await api(
        action === "clear" ? { action, kind, revision: draft.revision } : { action, kind, config },
        abort.signal,
      );
      if (serial !== sequence.current) return;
      if (data.model) {
        onUpdate(data.model);
        setDraft({ ...data.model, key: "" });
      }
      if (data.image) setPreview(data.image);
      setMessage(data.message + (action === "test" ? " 测试不会保存修改，请点击保存配置。" : ""));
    } catch (reason) {
      if (serial === sequence.current)
        setError(
          abort.signal.aborted
            ? "等待超时，请检查服务或增加等待时间。"
            : reason instanceof Error
              ? reason.message
              : "操作失败，请重试。",
        );
    } finally {
      clearTimeout(timer);
      if (serial === sequence.current) {
        controller.current = null;
        setWorking(null);
      }
    }
  };
  const name = kind === "llm" ? "LLM 文字模型" : "生图模型";
  return (
    <form
      className="model-settings-form"
      aria-label={`${name}配置`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit("save");
      }}
    >
      <div className="model-enable-row">
        <label htmlFor={`${id}-enabled`}>启用{name}</label>
        <Switch
          id={`${id}-enabled`}
          checked={draft.enabled}
          disabled={!!working}
          onCheckedChange={(value) => field("enabled", value)}
        />
      </div>
      <p className="subtle">
        {kind === "llm"
          ? "用于同行交涉。支持 OpenAI 兼容 Chat Completions 与严格 JSON Schema。"
          : "支持 OpenAI 兼容 Images 接口。测试会生成一张预览图，游戏人物与场景仍使用现有配图。"}
      </p>
      {initial.source === "server" && (
        <p className="model-source">当前使用站点默认服务。自定义配置请填写自己的密钥。</p>
      )}
      <label className="form-field">
        <span id={`${id}-base-label`}>服务地址（Base URL）</span>
        <input
          type="url"
          aria-labelledby={`${id}-base-label`}
          aria-describedby={`${id}-base-help`}
          value={draft.baseUrl}
          maxLength={512}
          disabled={!!working}
          onChange={(event) => field("baseUrl", event.target.value)}
          placeholder="https://api.example.com/v1"
          autoCapitalize="none"
          spellCheck={false}
        />
        <small id={`${id}-base-help`}>填写 HTTPS 接口根地址，例如以 /v1 结尾。</small>
      </label>
      <label className="form-field">
        <span>模型 ID</span>
        <input
          value={draft.model}
          maxLength={100}
          disabled={!!working}
          onChange={(event) => field("model", event.target.value)}
          placeholder="填写服务商提供的模型 ID"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <label className="form-field">
        <span id={`${id}-key-label`}>API Key</span>
        <input
          type="password"
          aria-labelledby={`${id}-key-label`}
          aria-describedby={`${id}-key-help`}
          value={draft.key}
          maxLength={2048}
          disabled={!!working}
          onChange={(event) => field("key", event.target.value)}
          placeholder={
            initial.hasKey && initial.source === "personal"
              ? "已保存；留空保留现有密钥"
              : "输入自己的 API Key"
          }
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
        />
        <small id={`${id}-key-help`}>
          {initial.hasKey && initial.source === "personal"
            ? "密钥已保存。更换服务地址时需要重新填写。"
            : "密钥仅提交到本站服务端，不会写入浏览器本地存储或导出文件。"}
        </small>
      </label>
      <details className="model-advanced">
        <summary>高级选项</summary>
        <label className="form-field">
          <span>等待上限（秒）</span>
          <input
            type="number"
            min={1}
            max={kind === "llm" ? 30 : 120}
            value={draft.timeout / 1000}
            disabled={!!working}
            onChange={(event) => field("timeout", Number(event.target.value) * 1000)}
          />
        </label>
        {kind === "llm" && (
          <label className="form-field">
            <span>回复 Token 上限</span>
            <input
              type="number"
              min={100}
              max={1500}
              value={draft.maxTokens}
              disabled={!!working}
              onChange={(event) => field("maxTokens", Number(event.target.value))}
            />
          </label>
        )}
      </details>
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
          {working === "test" ? (
            <>
              <LoaderCircle size={15} className="spin" /> 测试中…
            </>
          ) : kind === "llm" ? (
            "测试连接"
          ) : (
            "测试生图（1 张）"
          )}
        </Button>
        {working === "test" && (
          <Button type="button" variant="ghost" onClick={cancel}>
            取消测试
          </Button>
        )}
      </div>
      <small className="subtle">
        {kind === "image"
          ? "测试生图会调用服务商接口，可能产生一张图片的费用。"
          : "测试会发送一条短消息，可能产生少量 Token 费用。"}
        测试不消耗游戏日。
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
      {preview && (
        <figure className="model-image-preview">
          <img src={preview} alt="生图模型测试预览" width={1024} height={1024} />
          <figcaption>测试预览 · 未写入游戏存档</figcaption>
        </figure>
      )}
      <Button
        className="model-clear"
        type="button"
        variant="ghost"
        disabled={!!working || initial.source !== "personal"}
        onClick={() => void submit("clear")}
      >
        清除个人配置并关闭
      </Button>
    </form>
  );
}
