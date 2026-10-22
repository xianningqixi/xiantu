import { sectAt } from "./sect-content";
import type { Actor } from "./types";
import { B } from "./rules";
import { localSite, locationKind } from "./world-map";

/** Explicit nights are written only for a player and a partner who are both at least this age. */
export function explicitIntimacyAllowed(a: Actor, b: Actor) {
  const years = B.relationships.explicitSceneMinimumAgeYears * B.world.daysPerYear;
  return (a.id === "PLAYER" || b.id === "PLAYER") && a.ageDays >= years && b.ageDays >= years;
}

function place(actor: Actor) {
  if (locationKind(actor.location) === "inn") return "客栈厢房";
  if (actor.cave && localSite(actor.location, "market") === actor.cave) return "自己的洞府";
  if (sectAt(actor.location)) return "宗门静室";
  return "关上的房间";
}

function womanAndMan(a: Actor, b: Actor) {
  return {
    woman: a.sex === "female" ? a : b,
    man: a.sex === "male" ? a : b,
  };
}

function nightText(a: Actor, b: Actor, prior: number) {
  const room = place(a);
  const closing = "这段经过只写在两人的生平里。";
  if (a.sex !== b.sex) {
    const { woman, man } = womanAndMan(a, b);
    const variants = [
      `${woman.name}与${man.name}在${room}里再次确认愿意，才褪下衣裳。亲吻沿颈侧落下，${man.name}的手覆上${woman.name}的胸，指尖在乳尖上停留。${woman.name}分开腿接纳他，抽送渐渐加快，直到两人都在对方怀里到达高潮。`,
      `灯火压得很低。${woman.name}先用嘴唇含住${man.name}，再引导他进入自己。${man.name}托着她的腰顶到最深，${woman.name}的腿缠上来，高潮时指甲陷进他的背。事后他们没有立刻分开。`,
    ];
    return `${variants[prior % variants.length]}${closing}`;
  }
  if (a.sex === "female") {
    const variants = [
      `${a.name}与${b.name}在${room}里吻到呼吸发乱，手指探进彼此腿间，按着最敏感的地方打转。她们轮流用嘴唇把对方送上高潮，身体贴着身体发抖。`,
      `${a.name}让${b.name}躺进${room}的床上，膝盖分开她的腿，舌尖沿湿润处慢慢舔到她绷紧。随后两人手指交叠在一起，一起到达高潮。`,
    ];
    return `${variants[prior % variants.length]}${closing}`;
  }
  const first = prior % 2 === 0 ? a : b;
  const second = first === a ? b : a;
  return `${a.name}与${b.name}在${room}里吻着解开衣带，手握住彼此。${first.name}进入${second.name}时放得很慢，直到${second.name}自己把腰迎上来。两人一起释放之后，仍面对面躺着。${closing}`;
}

function dualText(a: Actor, b: Actor, prior: number) {
  const room = place(a);
  const closing = "这段经过只写在两人的生平里。";
  if (a.sex !== b.sex) {
    const { woman, man } = womanAndMan(a, b);
    const variants = [
      `${woman.name}坐进${man.name}怀里，让他进入自己。气机顺着交合处来回，抽送每深一分，两人的呼吸就更齐一些。高潮时修为沉回丹田，谁也没有勉强对方继续。`,
      `${man.name}与${woman.name}在${room}里面对面交合，她的腿环在他腰上。每一次顶入都把气息送过彼此的经脉，直到两人都在高潮里松开，修为各自落下。`,
    ];
    return `${variants[prior % variants.length]}${closing}`;
  }
  if (a.sex === "female")
    return `${a.name}与${b.name}在${room}里十指交扣，手指与嘴唇轮流进入对方。快感与气机一起涨落，高潮时两人都感到修为落回体内。${closing}`;
  const first = prior % 2 === 0 ? a : b;
  const second = first === a ? b : a;
  return `${first.name}进入${second.name}之后不再急着动作，只把呼吸和气机对齐。${second.name}主动迎合，直到两人同时释放，修为在余韵里稳住。${closing}`;
}

/** Player-facing adult scene. NPC-only lives and anyone under the age line keep the short record. */
export function explicitIntimacyText(a: Actor, b: Actor, kind: "night" | "dual", prior: number) {
  if (!explicitIntimacyAllowed(a, b)) return "";
  return kind === "night" ? nightText(a, b, prior) : dualText(a, b, prior);
}

function secrecy(names: string[]) {
  return names.length
    ? `这是背着${names.join("、")}的出轨。`
    : "没有在世道侣拦着，这一夜仍是偷情。";
}

/** Consensual secret sex or heavy petting. The betrayed spouse is named and was not asked. */
export function explicitLiaisonText(
  a: Actor,
  b: Actor,
  play: "tryst" | "affair",
  prior: number,
  betrayedNames: string[],
) {
  const room = place(a);
  if (play === "tryst") {
    const closing = "这段私会只写在两人的生平里。";
    if (a.sex !== b.sex) {
      const { woman, man } = womanAndMan(a, b);
      return `${woman.name}把${man.name}拉进${room}，亲到两人都喘。她的手伸进他衣服里套弄，他的手指则探进她腿间打转，直到她咬着他的肩到达高潮。他们停在插入之前。${secrecy(betrayedNames)}${closing}`;
    }
    if (a.sex === "female")
      return `${a.name}与${b.name}在${room}里把衣襟拉开，乳房贴着乳房，手指互相插进腿间。她们谁也没把这一夜说出去，却都在对方手里到达高潮。${secrecy(betrayedNames)}${closing}`;
    return `${a.name}与${b.name}在${room}里解开裤带，手握住彼此套弄，亲吻又重又急。他们射在对方手里，仍说好这只是私下亲热。${secrecy(betrayedNames)}${closing}`;
  }
  const closing = "这段偷情只写在当事人的生平里。";
  if (a.sex !== b.sex) {
    const { woman, man } = womanAndMan(a, b);
    const variants = [
      `${woman.name}与${man.name}在${room}里再次确认愿意，才把裙子和裤子褪到一处。她分开腿让他插进来，抽送一下重过一下，直到两人都到达高潮。`,
      `${man.name}让${woman.name}趴在${room}的榻上，从后面进入她。${woman.name}把脸埋进臂弯里浪叫，高潮时腿都在抖，却还是把他夹紧。`,
    ];
    return `${variants[prior % variants.length]}${secrecy(betrayedNames)}${closing}`;
  }
  if (a.sex === "female") {
    const variants = [
      `${a.name}与${b.name}在${room}里反锁了门。她们把裙子撩起来，手指和舌头都探进对方腿间，轮流把对方舔到高潮。`,
      `${a.name}骑在${b.name}脸上，同时又把手指插进她体内。两个人都到达高潮之后，仍赤裸着叠在一起，谁也没提门外的人。`,
    ];
    return `${variants[prior % variants.length]}${secrecy(betrayedNames)}${closing}`;
  }
  const first = prior % 2 === 0 ? a : b;
  const second = first === a ? b : a;
  return `${a.name}与${b.name}在${room}里吻着把对方按到榻上。${first.name}进入${second.name}，动作又慢又深，直到两人一起释放。${secrecy(betrayedNames)}${closing}`;
}

/** The player watches a dao companion willingly have sex with someone else. */
export function explicitNtrText(player: Actor, partner: Actor, other: Actor, prior: number) {
  const room = place(player);
  const closing = "这一夜的寝取写在三人的生平里。";
  if (partner.sex !== other.sex) {
    const { woman, man } = womanAndMan(partner, other);
    const variants = [
      `${player.name}在${room}里看着。${woman.name}点头说愿意，然后分开腿让${man.name}进入自己。抽送越来越响，她到达高潮时喊的是${man.name}的名字，道侣就在旁边。`,
      `${man.name}把${woman.name}抱起来进入，${player.name}站在一旁看得清楚。${woman.name}的腿缠上别人的腰，高潮时指甲陷进${man.name}的背。这是当面的寝取。`,
    ];
    return `${variants[prior % variants.length]}${closing}`;
  }
  if (partner.sex === "female")
    return `${player.name}看着${partner.name}与${other.name}在${room}的榻上叠在一起。她们手指交插进彼此腿间，舔到两人都到达高潮，谁也没避着旁边的道侣。这是当面的寝取。${closing}`;
  const first = prior % 2 === 0 ? partner : other;
  const second = first === partner ? other : partner;
  return `${player.name}看着${first.name}进入${second.name}。${partner.name}没有推开，反而自己把腰送上去，直到两人一起释放。道侣的誓约还在，这一夜却是当面的寝取。${closing}`;
}

export function explicitDiscoveryText(spouses: Actor[], a: Actor, b: Actor) {
  const names = spouses.map((spouse) => spouse.name).join("、");
  const room = place(a);
  if (a.sex !== b.sex) {
    const { woman, man } = womanAndMan(a, b);
    return `${names}推开${room}的门，看见${man.name}还埋在${woman.name}体内。两个人赤裸着停了一停，身体却还连在一起，${woman.name}腿间的水光瞒不住。发现了这场出轨。`;
  }
  if (a.sex === "female")
    return `${names}推开${room}的门，看见${a.name}与${b.name}还叠在一处，手指留在彼此腿间，高潮后的身体没有分开。发现了这场出轨。`;
  return `${names}推开${room}的门，看见${a.name}与${b.name}还交合在一起，谁都来不及把衣服拉上。发现了这场出轨。`;
}
