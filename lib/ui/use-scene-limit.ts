"use client";
import { useSyncExternalStore } from "react";
import { useCompactLayout } from "./use-compact-layout";
/**
 * 同屏能同时讲几条旁支：窄屏只讲一条，普通屏两条三条，宽屏才铺满。
 * 上限值来自规则层（content-story 的 SCENE_LIMIT），这里只决定当前屏幕用几条。
 */
const wide = "(min-width: 1440px)";
const medium = "(min-width: 1000px)";
const subscribe = (notify: () => void) => {
  const queries = [wide, medium].map((q) => window.matchMedia(q));
  for (const q of queries) q.addEventListener("change", notify);
  return () => {
    for (const q of queries) q.removeEventListener("change", notify);
  };
};
const snapshot = () =>
  window.matchMedia(wide).matches ? 4 : window.matchMedia(medium).matches ? 3 : 2;
export function useSceneLimit() {
  const compact = useCompactLayout();
  const limit = useSyncExternalStore(subscribe, snapshot, () => 3);
  return compact ? 1 : limit;
}
