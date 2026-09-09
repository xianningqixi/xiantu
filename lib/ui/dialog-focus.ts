"use client";
import { useRef } from "react";
export function useDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    opened: () => {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    closed: (event: Event) => {
      if (event.defaultPrevented) return;
      const origin = opener.current;
      const target =
        origin?.isConnected &&
        origin !== document.body &&
        origin !== document.documentElement &&
        origin.getClientRects().length &&
        !origin.closest('[data-state="closed"]')
          ? origin
          : document.querySelector<HTMLElement>(
              '[role="dialog"][data-state="open"] button, [role="tab"][data-state="active"], .creation-panel-nav button',
            );
      if (target) {
        event.preventDefault();
        target.focus({ preventScroll: true });
      }
    },
  };
}
