/**
 * 成就：纯派生数据。每次行动后由引擎结算，只写入 `world.achievements`（id → 解锁日）
 * 与一条见闻，不推进时间、不重抽随机，也不需要玩家额外操作。
 */
import { recordFact } from "./knowledge";
import { intimacyKind } from "./intimacy-history";
import type { World } from "./types";

export type AchievementCategory =
  | "cultivation"
  | "combat"
  | "exploration"
  | "social"
  | "story"
  | "life";

export const ACHIEVEMENT_CATEGORIES: Record<AchievementCategory, string> = {
  cultivation: "修行",
  combat: "争斗",
  exploration: "历练",
  social: "人情",
  story: "故事",
  life: "生活",
};

/** 一次遍历得到的累计值，成就判定只看它，避免每条成就自己扫事件。 */
export type AchievementTally = {
  events: Record<string, number>;
  enemiesDefeated: number;
  exploreWins: number;
  expeditionWins: number;
  retreats: number;
  defeats: number;
  victories: number;
  skillsLearned: number;
  met: number;
  friends: number;
  chats: number;
  bonds: number;
  nights: number;
  duals: number;
  partners: number;
  chapters: number;
  storyChoices: number;
  breakthroughs: number;
};

export type Achievement = {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  /** 隐藏成就解锁前只显示轮廓。 */
  hidden?: boolean;
  target: number;
  progress: (w: World, t: AchievementTally) => number;
};

const count = (t: AchievementTally, kind: string) => t.events[kind] ?? 0;

export function achievementTally(w: World): AchievementTally {
  const t: AchievementTally = {
    events: {},
    enemiesDefeated: 0,
    exploreWins: 0,
    expeditionWins: 0,
    retreats: 0,
    defeats: 0,
    victories: 0,
    skillsLearned: 0,
    met: 0,
    friends: 0,
    chats: 0,
    bonds: 0,
    nights: 0,
    duals: 0,
    partners: 0,
    chapters: 0,
    storyChoices: 0,
    breakthroughs: 0,
  };
  const partners = new Set<string>();
  for (const e of w.events) {
    t.events[e.kind] = (t.events[e.kind] ?? 0) + 1;
    if (e.kind === "battle-win" || e.kind.endsWith("-battle-win")) t.victories++;
    if (e.kind.includes("battle-defeat")) t.defeats++;
    if (e.kind.includes("battle-retreat")) t.retreats++;
    if (e.kind === "explore-encounter") t.exploreWins++;
    if (e.kind === "expedition" || e.kind === "expedition-repeat") t.expeditionWins++;
    if (e.kind === "npc-meet") t.met++;
    if (e.kind === "npc-friendship") t.friends++;
    if (e.kind === "social") t.chats++;
    if (e.kind === "chapter-reward") t.chapters++;
    if (e.kind === "story-choice") t.storyChoices++;
    if (e.kind === "skill") t.skillsLearned++;
    const intimacy = intimacyKind(w, e);
    if (intimacy === "bond") t.bonds++;
    if (intimacy === "night") t.nights++;
    if (intimacy === "dual") t.duals++;
    if (intimacy) for (const id of e.actors) if (id !== "PLAYER") partners.add(id);
  }
  t.partners = partners.size;
  t.breakthroughs = count(t, "breakthrough");
  // 敌方单位被击败的次数寄存在战斗见闻的 count 上。
  for (const e of w.events) if (e.kind.endsWith("battle-win")) t.enemiesDefeated += e.count ?? 1;
  return t;
}

/** 按类别排列；category 顺序即界面顺序。 */
const ACHIEVEMENTS: Achievement[] = [
  // 修行
  {
    id: "realm-qi3",
    category: "cultivation",
    title: "引气入体",
    description: "修至炼气三层。",
    target: 3,
    progress: (w) => w.player.realm,
  },
  {
    id: "realm-qi6",
    category: "cultivation",
    title: "气贯周天",
    description: "修至炼气六层。",
    target: 6,
    progress: (w) => w.player.realm,
  },
  {
    id: "realm-qi9",
    category: "cultivation",
    title: "炼气圆满",
    description: "修至炼气九层。",
    target: 9,
    progress: (w) => w.player.realm,
  },
  {
    id: "realm-foundation",
    category: "cultivation",
    title: "筑基",
    description: "踏上筑基。",
    target: 10,
    progress: (w) => w.player.realm,
  },
  {
    id: "break-through-1",
    category: "cultivation",
    title: "第一次破关",
    description: "突破一层。",
    target: 1,
    progress: (_w, t) => t.breakthroughs,
  },
  {
    id: "break-through-10",
    category: "cultivation",
    title: "百炼",
    description: "累计突破十次。",
    target: 10,
    progress: (_w, t) => t.breakthroughs,
  },
  {
    id: "manual-learned",
    category: "cultivation",
    title: "功法在身",
    description: "习得一门功法。",
    target: 1,
    progress: (w) => (w.player.manual ? 1 : 0),
  },
  {
    id: "skills-5",
    category: "cultivation",
    title: "五术皆通",
    description: "集齐五种战技。",
    target: 5,
    progress: (_w, t) => t.skillsLearned,
  },

  // 争斗
  {
    id: "win-1",
    category: "combat",
    title: "初次得手",
    description: "赢下第一场战斗。",
    target: 1,
    progress: (_w, t) => t.victories,
  },
  {
    id: "win-25",
    category: "combat",
    title: "惯战",
    description: "累计取胜二十五场。",
    target: 25,
    progress: (_w, t) => t.victories,
  },
  {
    id: "kill-50",
    category: "combat",
    title: "五十具尸首",
    description: "击败五十个敌手。",
    target: 50,
    progress: (_w, t) => t.enemiesDefeated,
  },
  {
    id: "retreat-10",
    category: "combat",
    title: "活着退出",
    description: "主动撤出十次。",
    target: 10,
    progress: (_w, t) => t.retreats,
  },
  {
    id: "defeat-5",
    category: "combat",
    title: "五次躺下",
    description: "战败五次仍未死。",
    target: 5,
    progress: (_w, t) => t.defeats,
  },
  {
    id: "expedition-win-5",
    category: "combat",
    title: "秘境常客",
    description: "在秘境战局取胜五次。",
    target: 5,
    progress: (_w, t) => t.expeditionWins,
  },

  // 历练
  {
    id: "explore-1",
    category: "exploration",
    title: "出城看看",
    description: "第一次郊野探索。",
    target: 1,
    progress: (_w, t) => count(t, "explore"),
  },
  {
    id: "explore-25",
    category: "exploration",
    title: "踏遍郊野",
    description: "郊野探索二十五次。",
    target: 25,
    progress: (_w, t) => count(t, "explore"),
  },
  {
    id: "explore-win-10",
    category: "exploration",
    title: "野外无惧",
    description: "野外遭遇取胜十次。",
    target: 10,
    progress: (_w, t) => t.exploreWins,
  },
  {
    id: "survey-5",
    category: "exploration",
    title: "残碑之上",
    description: "勘察残碑五次。",
    target: 5,
    progress: (_w, t) => count(t, "survey"),
  },
  {
    id: "travel-50",
    category: "exploration",
    title: "行旅",
    description: "赶路五十次。",
    target: 50,
    progress: (_w, t) => count(t, "travel"),
  },

  // 人情
  {
    id: "meet-10",
    category: "social",
    title: "人间相识",
    description: "结识十个人。",
    target: 10,
    progress: (_w, t) => t.met,
  },
  {
    id: "friend-3",
    category: "social",
    title: "三五知己",
    description: "与三人结为朋友。",
    target: 3,
    progress: (_w, t) => t.friends,
  },
  {
    id: "chat-30",
    category: "social",
    title: "闲谈有度",
    description: "闲谈三十回。",
    target: 30,
    progress: (_w, t) => t.chats,
  },
  {
    id: "bond-1",
    category: "social",
    title: "结为道侣",
    description: "与一人结契。",
    target: 1,
    progress: (_w, t) => t.bonds,
  },
  {
    id: "dual-1",
    category: "social",
    title: "既济",
    description: "第一次双修。",
    target: 1,
    progress: (_w, t) => t.duals,
  },
  {
    id: "dual-10",
    category: "social",
    title: "炉火纯青",
    description: "双修十次。",
    target: 10,
    progress: (_w, t) => t.duals,
  },
  {
    id: "partner-3",
    category: "social",
    title: "念念不忘",
    description: "与三个人有过亲密经历。",
    target: 3,
    progress: (_w, t) => t.partners,
  },
  {
    id: "sect-join",
    category: "social",
    title: "入得门户",
    description: "拜入一门。",
    target: 1,
    progress: (_w, t) => count(t, "sect-join"),
  },

  // 故事
  {
    id: "chapter-1",
    category: "story",
    title: "春水",
    description: "走完第一卷。",
    target: 1,
    progress: (_w, t) => t.chapters,
  },
  {
    id: "chapter-2",
    category: "story",
    title: "冬雪",
    description: "走完第二卷。",
    target: 2,
    progress: (_w, t) => t.chapters,
  },
  {
    id: "chapter-3",
    category: "story",
    title: "秋灯",
    description: "走完第三卷。",
    target: 3,
    progress: (_w, t) => t.chapters,
  },
  {
    id: "chapter-4",
    category: "story",
    title: "夏夜",
    description: "走完四卷。",
    target: 4,
    progress: (_w, t) => t.chapters,
  },
  {
    id: "choice-50",
    category: "story",
    title: "五十个岔口",
    description: "做出五十个剧情选择。",
    target: 50,
    progress: (_w, t) => t.storyChoices,
  },
  {
    id: "night-10",
    category: "story",
    title: "长夜漫漫",
    description: "共度良宵十次。",
    target: 10,
    progress: (_w, t) => t.nights,
  },

  // 生活
  {
    id: "work-20",
    category: "life",
    title: "手上有茧",
    description: "做劳务二十次。",
    target: 20,
    progress: (_w, t) => count(t, "work"),
  },
  {
    id: "day-100",
    category: "life",
    title: "百日",
    description: "在这人间活过一百天。",
    target: 100,
    progress: (w) => w.day,
  },
  {
    id: "day-365",
    category: "life",
    title: "一年",
    description: "熬过整整一年。",
    target: 365,
    progress: (w) => w.day,
  },
  {
    id: "stones-500",
    category: "life",
    title: "攒得住",
    description: "身上同时有五百灵石。",
    target: 500,
    progress: (w) => w.player.stones,
  },
  {
    id: "death-1",
    category: "life",
    title: "见过死人",
    description: "经历过一次离世。",
    target: 1,
    progress: (_w, t) => count(t, "death"),
    hidden: true,
  },
  {
    id: "broke",
    category: "life",
    title: "一文不名",
    description: "身上一块灵石也没有的时候还在赶路。",
    target: 1,
    progress: (w) => (w.player.stones === 0 && w.day > 20 ? 1 : 0),
    hidden: true,
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

export function achievementById(id: string) {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
export const achievementsOf = (category: AchievementCategory) =>
  ACHIEVEMENTS.filter((a) => a.category === category);

export type AchievementRow = Achievement & { done: boolean; day?: number; current: number };

export function achievementRows(w: World): AchievementRow[] {
  const t = achievementTally(w);
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    current: Math.min(a.progress(w, t), a.target),
    done: w.achievements?.[a.id] !== undefined,
    day: w.achievements?.[a.id],
  }));
}

export function achievementSummary(w: World) {
  const rows = achievementRows(w);
  return {
    total: rows.length,
    done: rows.filter((r) => r.done).length,
    byCategory: Object.fromEntries(
      (Object.keys(ACHIEVEMENT_CATEGORIES) as AchievementCategory[]).map((c) => {
        const group = rows.filter((r) => r.category === c);
        return [c, { total: group.length, done: group.filter((r) => r.done).length }];
      }),
    ) as Record<AchievementCategory, { total: number; done: number }>,
  };
}

/**
 * 结算新达成的成就。只写本存档：解锁日与一条见闻（不给修为数值，
 * 免得成就与修炼规则互相拉扯）。返回本次新解锁的 id。
 */
export function settleAchievements(w: World): string[] {
  const unlocked: string[] = [];
  const t = achievementTally(w);
  w.achievements ??= {};
  for (const a of ACHIEVEMENTS) {
    if (w.achievements[a.id] !== undefined) continue;
    if (a.progress(w, t) < a.target) continue;
    w.achievements[a.id] = w.day;
    unlocked.push(a.id);
    recordFact(
      w,
      "achievement",
      `达成「${a.title}」——${a.description}`,
      ["PLAYER"],
      false,
      `achievement:${a.id}`,
    );
  }
  return unlocked;
}
