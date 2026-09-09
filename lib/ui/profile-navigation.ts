import type { MouseEvent } from "react";

export type ProfileTab = "attributes" | "portrait" | "relations" | "history";
export type OpenProfile = (id: string, tab?: ProfileTab) => void;

/** Avatar clicks open the original art; the rest of the same entrance opens the sheet. */
export function profileTabForClick(event: MouseEvent): ProfileTab {
  return event.target instanceof Element && event.target.closest("[data-person-avatar]")
    ? "portrait"
    : "attributes";
}
