"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

type Span = { start: number; end: number };

/** Lay out real DOM in readable pages. Page boundaries never bisect a control or a line of text. */
function measurePages(document: HTMLElement, height: number): Span[] {
  const documentRect = document.getBoundingClientRect();
  const origin = documentRect.top;
  // Dialog entrance animations scale client rectangles, but pagination uses layout pixels.
  const scale = document.offsetHeight ? documentRect.height / document.offsetHeight : 1;
  const total = document.scrollHeight;
  if (total <= height + 1) return [{ start: 0, end: total }];
  const capacity = Math.max(80, height - 44);
  const spans: Span[] = [];
  const add = (rect: DOMRect) => {
    if (rect.height > 0 && rect.height / scale <= capacity && rect.width > 0)
      spans.push({
        start: Math.max(0, (rect.top - origin) / scale),
        end: (rect.bottom - origin) / scale,
      });
  };
  for (const element of document.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,li,dt,dd,label,button,input,select,textarea,summary,img,[data-page-block]",
  )) {
    if (
      !element.checkVisibility() ||
      element.closest('[aria-hidden="true"], .sr-only') ||
      getComputedStyle(element).opacity === "0"
    )
      continue;
    add(element.getBoundingClientRect());
  }
  // An unusually long paragraph can span pages, but its rendered lines stay intact.
  const walker = document.ownerDocument.createTreeWalker(document, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent?.trim()) continue;
    const range = document.ownerDocument.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) add(rect);
  }
  const merged: Span[] = [];
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && span.start < last.end - 0.5) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  const pages: Span[] = [];
  let start = 0;
  while (start < total - 1) {
    let end = Math.min(total, start + capacity);
    const crossing = merged.find((span) => span.start < end - 0.5 && span.end > end + 0.5);
    if (crossing && crossing.start > start + 8) end = crossing.start;
    // Overlapping blocks taller than a page fall back to the last complete text/control boundary.
    if (crossing && crossing.start <= start + 8) {
      const boundaries = spans
        .flatMap((span) => [span.start, span.end])
        .filter((value) => value > start + 8 && value <= end)
        .sort((a, b) => b - a);
      end =
        boundaries.find(
          (value) => !spans.some((s) => s.start < value - 0.5 && s.end > value + 0.5),
        ) ?? end;
    }
    pages.push({ start, end });
    start = end;
  }
  return pages.length ? pages : [{ start: 0, end: 0 }];
}

export function PagedContent({
  children,
  className = "",
  label = "内容",
  resetKey,
  initialPage = 0,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  resetKey?: string | number;
  initialPage?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const document = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Span[]>([{ start: 0, end: 100000 }]);
  const [requested, setRequested] = useState(initialPage);
  const [ready, setReady] = useState(false);
  const page = Math.min(requested, pages.length - 1);
  const current = pages[page];
  useLayoutEffect(() => {
    setRequested(initialPage);
    setReady(false);
  }, [resetKey, initialPage]);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!host.current || !document.current || host.current.clientHeight < 40) return;
        const next = measurePages(document.current, host.current.clientHeight);
        setPages((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
        setReady(true);
        const focused = document.current.ownerDocument.activeElement;
        if (
          focused instanceof HTMLElement &&
          document.current.contains(focused) &&
          focused.checkVisibility()
        ) {
          const rect = focused.getBoundingClientRect();
          const root = document.current.getBoundingClientRect();
          const scale = document.current.offsetHeight
            ? root.height / document.current.offsetHeight
            : 1;
          const top = (rect.top - root.top) / scale;
          const found = next.findIndex(
            (part) => top >= part.start - 1 && top + rect.height / scale <= part.end + 1,
          );
          if (found >= 0) setRequested(found);
        }
      });
    };
    const resize = new ResizeObserver(measure);
    const mutation = new MutationObserver((changes) => {
      if (changes.some((change) => change.attributeName === "hidden")) setRequested(0);
      setReady(false);
      measure();
    });
    if (host.current) resize.observe(host.current);
    if (document.current) {
      resize.observe(document.current);
      mutation.observe(document.current, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["hidden", "open", "data-state"],
      });
    }
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [resetKey, initialPage]);
  return (
    <div
      ref={host}
      className={`paged-content ${className}`}
      data-paginated={pages.length > 1}
      data-page={page + 1}
      data-ready={ready}
      aria-label={label}
    >
      <div className="page-window">
        <div className="page-crop" style={{ height: current.end - current.start }}>
          <div
            ref={document}
            className="paged-document"
            style={{ transform: `translateY(-${current.start}px)` }}
            onFocusCapture={(event) => {
              const rect = event.target.getBoundingClientRect();
              const documentRect = event.currentTarget.getBoundingClientRect();
              const scale = event.currentTarget.offsetHeight
                ? documentRect.height / event.currentTarget.offsetHeight
                : 1;
              const top = (rect.top - documentRect.top) / scale;
              const next = pages.findIndex(
                (part) => top >= part.start - 1 && top + rect.height / scale <= part.end + 1,
              );
              if (next >= 0 && next !== page) setRequested(next);
            }}
          >
            {children}
          </div>
        </div>
      </div>
      {pages.length > 1 && (
        <nav className="page-navigation" aria-label={`${label}翻页`}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setRequested(page - 1)}
            aria-label={`上一页${label}`}
          >
            <ChevronLeft size={16} /> 上一页
          </Button>
          <span aria-live="polite">
            {page + 1} / {pages.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page === pages.length - 1}
            onClick={() => setRequested(page + 1)}
            aria-label={`下一页${label}`}
          >
            下一页 <ChevronRight size={16} />
          </Button>
        </nav>
      )}
    </div>
  );
}
