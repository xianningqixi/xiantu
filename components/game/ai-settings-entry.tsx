"use client";
import { lazy, Suspense, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
const ModelSettingsDialog = lazy(() => import("./model-settings-dialog"));
export function AISettingsEntry({ onPause }: { onPause: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onPause();
          setOpen(true);
        }}
      >
        <Settings2 size={16} /> AI 模型设置
      </Button>
      {open && (
        <Suspense fallback={<p role="status">正在打开模型设置…</p>}>
          <ModelSettingsDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
