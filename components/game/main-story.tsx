"use client";
import { profileTargetForClick, type OpenProfile } from "@/lib/ui/profile-navigation";
import type { mainScene } from "@/lib/game/main-story";
import type { World } from "@/lib/game/types";
import { TimeBadge } from "./time-badge";
import { NpcPortrait } from "./npc-portrait";
import type { Send } from "./panels";
export function MainStoryScene({
  world,
  scene,
  send,
  blocked,
  onProfile,
}: {
  world: World;
  scene: NonNullable<ReturnType<typeof mainScene>>;
  send: Send;
  blocked: boolean;
  onProfile: OpenProfile;
}) {
  return (
    <article className="main-story-scene" id="main-story-scene" data-main-story-id={scene.id}>
      <span className="eyebrow">主线 · 残碑寻源 · {scene.chapter.volumeTitle}</span>
      <h2 className="serif">{scene.title}</h2>
      {scene.guide && (
        <button
          className="main-story-speaker character-link"
          onClick={(event) => onProfile(scene.guide!.id, profileTargetForClick(event))}
          aria-label={`查看${scene.guide.name}的人物资料`}
        >
          <NpcPortrait world={world} actor={scene.guide} className="person-avatar" />
          <span>
            {scene.guide.name}
            <small>与你同在此处 · 查看资料</small>
          </span>
        </button>
      )}
      <p>{scene.body}</p>
      <div className="story-choices">
        {scene.choices.map((choice, index) => (
          <button
            key={choice.id}
            className="story-choice"
            disabled={blocked}
            onClick={() => void send({ type: "chooseMain", nodeId: scene.id, choiceId: choice.id })}
          >
            <span className="choice-number">0{index + 1}</span>
            <span>
              <strong>{choice.label}</strong>
              <small>
                {scene.id === scene.chapter.discovery.id && scene.chapter.id === "dongxue"
                  ? "仅改变本次历程记述，修为与资源相同"
                  : "记入主线与历程"}
              </small>
            </span>
            <TimeBadge
              world={world}
              command={{ type: "chooseMain", nodeId: scene.id, choiceId: choice.id }}
            />
          </button>
        ))}
      </div>
    </article>
  );
}
