"use client";
import { journeyContext, localChapterStatus } from "@/lib/game/journey-presentation";
import { LOCATIONS } from "@/lib/game/world-map";
import { contentText, PACK, PRESENTATION, REALMS } from "@/lib/game/content/official";
import { extensionVisual } from "@/lib/game/content/extensions";
import { CAMPAIGN_VOLUMES } from "@/lib/game/campaign-content";
import { locationArt } from "@/lib/ui/cosmetic-art";
import type { World } from "@/lib/game/types";
import type { OpenProfile } from "@/lib/ui/profile-navigation";
import { NpcPortrait } from "./npc-portrait";
import { GameImage } from "./panels";

/** Reading surface only. Every story choice is projected into the dojo action dock. */
export function JourneyTab({ world: w, onProfile }: { world: World; onProfile: OpenProfile }) {
  const context = journeyContext(w);
  const { main, side, official } = context;
  const place = LOCATIONS[w.player.location];
  const node = main ?? side ?? official;
  const transition = w.loot
    ? w.player.location === "ruins"
      ? PRESENTATION.lootReturn
      : PRESENTATION.lootSettle
    : null;
  const art = transition
    ? extensionVisual(transition.visualId)
    : side
      ? extensionVisual(side.visualId)
      : (locationArt(w.player.location) ?? extensionVisual(official?.visualId || place.visualId));
  const chapter = side
    ? CAMPAIGN_VOLUMES.find((v) => v.entry.lock === side.lock)?.chapter
    : undefined;
  const chapterStatus = localChapterStatus(w);
  const present = w.npcs.filter(
    (a) => a.alive && !a.npcJourney && a.location === w.player.location,
  );
  const primary = w.npcs.find((a) => a.id === PACK.roles.primary)!;
  return (
    <section
      className="dojo-scene"
      id="current-scene"
      aria-label="查看此地故事"
      data-main-story-id={main?.id}
      data-story-id={side?.id}
    >
      <figure className="dojo-landscape">
        <GameImage src={art.url} alt={art.alt} />
        <figcaption>
          {place.name} · {place.subtitle}
        </figcaption>
      </figure>
      <div className={`dojo-story-layout${context.actor ? " has-speaker" : ""}`}>
        <article className="dojo-story">
          <span className="eyebrow">
            {main
              ? `主线 · 残碑寻源 · ${main.chapter.volumeTitle}`
              : side
                ? chapter
                  ? `${chapter.volumeTitle} · ${side.id.endsWith(".intro") ? "卷首" : "人物故事"}`
                  : side.eyebrow
                : transition?.eyebrow || official?.eyebrow || "此地见闻"}
          </span>
          <h1 className="serif">{transition?.title || node?.title || place.subtitle}</h1>
          {chapter && side?.id.endsWith(".intro") && (
            <p className="campaign-lead">{chapter.volumeLead}</p>
          )}
          <p>
            {main?.body ||
              side?.body ||
              contentText(transition?.body || official?.body || place.body, w)}
          </p>
          {(side?.quote || (!w.loot && official?.quote && !main)) && (
            <blockquote>
              {side?.quote || official?.quote}
              <cite>— {context.displayName || primary.name}</cite>
            </blockquote>
          )}
          {!context.actionable && chapterStatus && (
            <p className="subtle">
              {chapterStatus.done ? chapterStatus.done.text : chapterStatus.missing.join("；")}
            </p>
          )}
          <p className="dojo-present">
            在场：
            {present
              .slice(0, 2)
              .map((a) => a.name)
              .join(" · ") || "暂无他人"}
            {present.length > 2 && ` · +${present.length - 2}`}
          </p>
        </article>
        {context.actor && (
          <button
            className="dojo-speaker character-link"
            aria-label={`查看${context.displayName}的人物资料`}
            onClick={() => onProfile(context.actor!.id)}
          >
            <NpcPortrait world={w} actor={context.actor} full displayName={context.displayName} />
            <span>
              {context.displayName}
              <small>{REALMS[context.actor.realm]} · 查看资料</small>
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
