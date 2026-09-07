import type { Actor, World } from "./types";
import { recordFact as record } from "./knowledge";

export function die(w: World, person: Actor, cause: string) {
  if (!person.alive) return;
  person.alive = false;
  person.hp = 0;
  person.attempt = null;
  person.activity = "已逝";
  if (person.id === "PLAYER") {
    w.ended = true;
    w.longAction = null;
    w.notice = "此生已落笔。你可以导出已经发生的经历。";
  } else w.party = w.party.filter((id) => id !== person.id);
  record(w, "death", `${person.name}${cause}。其身份与已经发生的经历仍被保留。`, [person.id]);
}
