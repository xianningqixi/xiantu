"use client";
import { useEffect, useState } from "react";
import type { ModelSummaries } from "@/lib/ai/model-settings";
export function useModelReadiness() {
  const [state, setState] = useState<{ loading: boolean; reason: string }>({
    loading: true,
    reason: "正在读取模型状态…",
  });
  useEffect(() => {
    let active = true;
    let sequence = 0;
    let controller: AbortController | null = null;
    const read = async () => {
      const request = ++sequence;
      controller?.abort();
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
      setState({ loading: true, reason: "正在读取模型状态…" });
      try {
        const response = await fetch("/api/model-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read" }),
          cache: "no-store",
          signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error();
        const models: ModelSummaries = data.settings ?? data.models ?? data;
        const missing = (["llm", "image"] as const).filter(
          (kind) => !models[kind]?.enabled || !models[kind]?.hasKey || !models[kind]?.model,
        );
        if (active && request === sequence)
          setState({
            loading: false,
            reason: missing.length
              ? `生成立绘需要${missing.map((k) => (k === "llm" ? "文字模型" : "生图模型")).join("和")}，请先配置。`
              : "",
          });
      } catch {
        if (active && request === sequence)
          setState({ loading: false, reason: "无法读取模型状态，请打开 AI 模型设置重新读取。" });
      }
    };
    void read();
    window.addEventListener("xiantu:model-settings", read);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("xiantu:model-settings", read);
    };
  }, []);
  return state;
}
