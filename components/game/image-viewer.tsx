"use client";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Display-only: viewing either an adopted image or a draft never adopts or saves it. */
export function ImageViewer({
  open,
  onOpenChange,
  src,
  alt,
  width = 1024,
  height = 1536,
  portrait = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  portrait?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`game-modal image-viewer${portrait ? " portrait-viewer" : ""}`}
        onKeyDown={(event) => {
          // Also handle an immediate Escape while Radix is registering this new layer.
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription>完整构图 · 按 Esc 或关闭按钮返回。</DialogDescription>
        </DialogHeader>
        {src && src !== failed ? (
          <img
            src={src}
            alt={alt}
            className="image-viewer-image"
            width={width}
            height={height}
            onError={() => setFailed(src)}
          />
        ) : (
          <div className="image-viewer-empty" role="status">
            <ImageOff aria-hidden="true" />
            <p>暂时无法显示这张图片</p>
            <small>可以稍后重试，或前往人物资料中的「立绘」查看。</small>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PortraitZoom({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="image-expand portrait-expand"
        onClick={() => setOpen(true)}
        aria-label={`放大查看：${alt}`}
      >
        <img src={src} alt={alt} width={1024} height={1536} onError={onError} />
        <span>点击放大 ↗</span>
      </button>
      <ImageViewer open={open} onOpenChange={setOpen} src={src} alt={alt} portrait />
    </>
  );
}
