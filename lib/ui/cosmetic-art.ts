import display from "@/lib/game/content/cosmetic-display.json";

type DisplayArt = { url: string; alt: string; kind: string };
const portraits = display.portraits as Record<string, DisplayArt>;
const locations = display.locations as Record<string, DisplayArt>;

/** Fixed sect residents have authored portraits without changing saved appearance seeds. */
export const cosmeticPortrait = (actorId: string) => portraits[actorId];
export const locationArt = (locationId: string) => locations[locationId];
