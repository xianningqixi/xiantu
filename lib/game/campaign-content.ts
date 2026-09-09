import { EXTENSIONS, selectedExtensions } from "./content/extensions";
import registry from "./content/main-story.json";

/** The shipped campaign is fixed; other authored stories may be added alongside it. */
export const CAMPAIGN_VOLUMES = registry.data.chapters.map((chapter) => {
  const entry = EXTENSIONS.find((e) => e.data.manifest.packId === chapter.volumePackId);
  if (!entry?.data.journey) throw new Error(`主线篇章缺失：${chapter.volumePackId}`);
  return { chapter, entry };
});
export const CAMPAIGN_LOCKS = CAMPAIGN_VOLUMES.map(({ entry }) => entry.lock);
export const OPTIONAL_EXTENSIONS = EXTENSIONS.filter((e) => !CAMPAIGN_LOCKS.includes(e.lock));
export function withCampaignContent(locks: string[] = []) {
  // Validate before deduplication; a stale or unknown lock must never be silently replaced.
  selectedExtensions(locks);
  return [...locks, ...CAMPAIGN_LOCKS.filter((lock) => !locks.includes(lock))];
}
