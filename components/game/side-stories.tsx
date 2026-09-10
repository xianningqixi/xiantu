"use client";
import { extensionScenes } from "@/lib/game/content-story";
import { CAMPAIGN_VOLUMES } from "@/lib/game/campaign-content";
import { extensionPortrait, extensionVisual } from "@/lib/game/content/extensions";
import type { Command, World } from "@/lib/game/types";
import { GameImage } from "./panels";
import type { OpenProfile } from "@/lib/ui/profile-navigation";
import { TimeBadge } from "./time-badge";
export function SideStories({
  world,
  busy,
  send,
  onProfile,
}: {
  world: World;
  busy: boolean;
  send: (command: Command) => Promise<boolean>;
  onProfile: OpenProfile;
}) {
  const scenes = extensionScenes(world);
  const hint = (text: string) =>
    text.replace(
      /\{\{([^{}]+)\.name\}\}/g,
      (token, id: string) =>
        (id === "player" ? world.player : world.npcs.find((actor) => actor.id === id))?.name ??
        token,
    );
  if (!scenes.length) return null;
  return (
    <section className="side-stories" aria-label="此地故事">
      {scenes.slice(0, 1).map((scene) => {
        const art = extensionVisual(scene.visualId);
        const chapter = CAMPAIGN_VOLUMES.find((v) => v.entry.lock === scene.lock)?.chapter;
        const portraitActor = scene.participants.find((id) => extensionPortrait(id)?.url);
        const portrait = portraitActor ? extensionPortrait(portraitActor) : null;
        const participants = scene.participants
          .map((id) => world.npcs.find((a) => a.id === id))
          .filter((a) => !!a);
        const cg = (
          <figure className="side-story-cg">
            <GameImage src={art.url} alt={art.alt} zoom />
          </figure>
        );
        return (
          <article
            className={`side-story${portrait ? " with-portrait" : ""}`}
            key={scene.id}
            data-story-id={scene.id}
          >
            {portrait ? (
              <div className="side-story-media">
                {cg}
                <figure className="side-story-portrait" aria-label="故事人物立绘">
                  <button
                    className="character-link"
                    onClick={() => portraitActor && onProfile(portraitActor, "image")}
                    aria-label={`查看${participants.find((a) => a.id === portraitActor)?.name ?? "故事人物"}的全身立绘`}
                  >
                    <GameImage src={portrait.url} alt={portrait.alt} />
                  </button>
                </figure>
              </div>
            ) : (
              cg
            )}
            <div>
              <span className="eyebrow">
                {chapter
                  ? `${chapter.volumeTitle} · ${scene.id.endsWith(".intro") ? "卷首" : "人物故事"}`
                  : scene.eyebrow}
              </span>
              <h2 className="serif">{scene.title}</h2>
              {chapter && scene.id.endsWith(".intro") && (
                <p className="campaign-lead">{chapter.volumeLead}</p>
              )}
              <p>{scene.body}</p>
              {scene.quote && <blockquote>{scene.quote}</blockquote>}
              {participants.length > 0 && (
                <div className="story-people" aria-label="故事人物">
                  {participants.map((actor) => (
                    <button
                      className="character-link"
                      key={actor.id}
                      onClick={() => onProfile(actor.id)}
                    >
                      {actor.name} · 查看资料
                    </button>
                  ))}
                </div>
              )}
              <div className="story-choices">
                {scene.choices.map((c, i) => (
                  <button
                    className="story-choice"
                    key={c.id}
                    disabled={busy}
                    onClick={() =>
                      void send({ type: "chooseExtension", nodeId: scene.id, choiceId: c.id })
                    }
                  >
                    <span className="choice-number">{String(i + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{c.label}</strong>
                      <small>{hint(c.hint)}</small>
                    </span>
                    <TimeBadge
                      world={world}
                      command={{ type: "chooseExtension", nodeId: scene.id, choiceId: c.id }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
