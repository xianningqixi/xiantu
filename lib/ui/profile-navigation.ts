import type { MouseEvent } from "react";

export type ProfileTab = "attributes" | "portrait" | "relations" | "history";
export type ProfileTarget = ProfileTab | "image";
export type OpenProfile = (id: string, target?: ProfileTarget, displayName?: string) => void;

/** Avatar clicks open the original art; the rest of the same entrance opens the sheet. */
export function profileTargetForClick(event: MouseEvent): ProfileTarget {
  return event.target instanceof Element && event.target.closest("[data-person-avatar]")
    ? "image"
    : "attributes";
}
