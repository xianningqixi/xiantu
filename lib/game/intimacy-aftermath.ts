/** 亲近之后的余韵：按性格抽取一句，不写数值、不推进时间。
 * 只在 settleIntimacy 内部调用，随机数走 simulation 频道，昼夜刷新不会重抽。 */
import type { Actor } from "./types";
import type { IntimacyKind } from "./intimacy";

/** 性格关键词 → 事后反应。顺序即优先级，先匹配先命中。 */
const byTemperament: { match: string[]; lines: string[] }[] = [
  {
    match: ["沉静", "清冷", "冷峻", "冷淡", "寡言"],
    lines: [
      "事后她没有立刻说话，只把额前的碎发拨到耳后，呼吸一点点放缓。",
      "她侧过身去，露出一点耳根的红，许久才低声道：“……不必当没发生过。”",
      "她把被角拉高的动作很慢，像在整理一页写乱的字。",
    ],
  },
  {
    match: ["泼辣", "直率", "豪爽", "嘴快"],
    lines: [
      "她先笑出声，随手把散开的衣襟一拢：“就这么点本事，也值得脸红？”嘴上这么说，耳根却没退红。",
      "她整个人往你怀里一赖，声音还带着哑：“明晚还来。”",
      "她翻身坐起，把头发三下两下盘好，回头看你一眼，笑意没收。",
    ],
  },
  {
    match: ["温婉", "温柔", "温润", "温和", "和蔼"],
    lines: [
      "她替你理好衣襟，指尖还带着一点热，动作很轻。",
      "她没有起身，只把脸贴在你肩上，慢慢地呼吸。",
      "她低声问了一句“累不累”，问完自己先红了脸。",
    ],
  },
  {
    match: ["伶俐", "精明", "通透", "慧"],
    lines: [
      "她先一步开口打断了那点尴尬：“别急，我来收拾。”手里的动作却比平时慢了半拍。",
      "她晃着脚尖看你，眼里有点藏不住的算计：“这笔账，我以后再跟你算。”",
      "她把话岔到别处去了，声音却一直是软的。",
    ],
  },
  {
    match: ["认真", "笨拙", "憨厚", "拘谨"],
    lines: [
      "她坐得笔直，隔了一会才小声问：“方才……还好么？”问完又赶紧补了一句“没事，不说也行”。",
      "她手忙脚乱地捡起衣裳，捡到一半又停住，好像不知道该先穿哪件。",
      "她把被角一寸寸掖平，掖到你身边来，才肯躺下。",
    ],
  },
  {
    match: ["占有", "强势", "威严", "眼角", "妩媚", "狐"],
    lines: [
      "她没有松开手，反而往你颈侧靠了靠，像要把这一点余温收进自己身上。",
      "她抬眼看你，声音低而笃定：“记着，是我先要的。”",
      "她闭上眼，嘴角挂着一点叫人说不出意思的笑。",
    ],
  },
];
const fallback = [
  "两人都没说话，只听着屋外的风声，谁也没先起身。",
  "她把脸埋进你的肩窝，过了很久才松开。",
  "余下的夜里，气机慢慢平了下来，只剩彼此的呼吸挨在一起。",
];
const bondLines = [
  "定下名分的那一刻，她反倒平静下来，把你手握住了。",
  "她把代表道侣的信物递到你手心，指尖按了一下才放开。",
];

export function aftermathLines(kind: IntimacyKind, a: Actor, b: Actor) {
  if (kind === "bond") return bondLines;
  const text = `${a.personality} ${b.personality}`;
  return (
    byTemperament.find((entry) => entry.match.some((key) => text.includes(key)))?.lines ?? fallback
  );
}

/** 事件流提示：保留原来的短句，再补一句余韵，避免把整段正文塞进日志。 */
export function aftermathNote(kind: IntimacyKind, line: string, a: Actor, b: Actor, detail = "") {
  const head =
    kind === "bond"
      ? `${a.name}与${b.name}当面互诉心意，结为道侣。`
      : kind === "night"
        ? `${a.name}与${b.name}确认彼此意愿，共度良宵一夜。`
        : `${a.name}与${b.name}双方自愿共修，各自按修炼规则积累修为。${detail}`;
  return `${head}${line}`;
}
