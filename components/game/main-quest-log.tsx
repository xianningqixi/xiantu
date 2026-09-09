import { mainProgress, mainEvent } from "@/lib/game/main-story";
import type { World } from "@/lib/game/types";
export function MainQuestLog({ world: w }: { world: World }) {
  const progress = mainProgress(w),
    complete = progress.length > 0 && progress.every((p) => p.done);
  return (
    <details className="main-quest-log">
      <summary>
        {complete ? "残碑寻源已完结 · 回顾查证与最后选择" : "主线足迹 · 查看已查明的线索"}
      </summary>
      {complete && <p>主线已完结。可以继续修行、回访故人与探索未经历的人物故事。</p>}
      <ol>
        {progress.map(({ chapter, done }) => (
          <li key={chapter.id}>
            <strong>
              {chapter.volumeTitle} · {chapter.regionName}
            </strong>
            {[chapter.dialogue.id, chapter.discovery.id].map((id) => {
              const event = mainEvent(w, id);
              return event ? (
                <p key={id}>
                  第 {event.day + 1} 日 · {event.text}
                </p>
              ) : null;
            })}
            {!done && <span>本卷线索尚未全部查明</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
