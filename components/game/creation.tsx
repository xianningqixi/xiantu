"use client";
import B from "@/lib/game/content/balance.json";
import { upgradeJourneyLocks } from "@/lib/game/journey-migration";
import {
  CAMPAIGN_VOLUMES,
  OPTIONAL_EXTENSIONS,
  withCampaignContent,
} from "@/lib/game/campaign-content";
import { physiqueSchema, profilePhysique, defaultPhysique } from "@/lib/game/physique";
import { playerSubject } from "@/lib/game/portrait-subject";
import { AppearanceFields } from "./appearance-fields";
import { PortraitStudio } from "./portrait-studio";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { selectedExtensions } from "@/lib/game/content/extensions";
import { ARTIFACTS } from "@/lib/game/content/official";
import { rollAptitude } from "@/lib/game/engine";
import { draftSchema } from "@/lib/game/protocol";
import type { CreationDraft, Profile } from "@/lib/game/types";
import { ArrowRight, Dices, Leaf, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function Creation({
  onCreate,
  busy,
  onCancel,
  initialDraft,
  onSaveDraft,
}: {
  onCreate: (profile: Profile, seed: number, contentLocks: string[]) => void | Promise<void>;
  busy: boolean;
  onCancel?: () => void;
  initialDraft?: CreationDraft | null;
  onSaveDraft?: (draft: Omit<CreationDraft, "revision" | "version">) => Promise<CreationDraft>;
}) {
  const [panel, setPanel] = useState("identity");
  const [seed, setSeed] = useState(String(initialDraft?.seed ?? 12345));
  const [roll, setRoll] = useState(initialDraft?.roll ?? 0);
  const [profile, setProfile] = useState<Profile>(
    () =>
      initialDraft?.profile ?? {
        name: "",
        sex: "female",
        aptitude: rollAptitude(12345, 0),
        artifact: "focus",
        mode: "simple",
        appearance: { face: 0, hair: 0, color: 0 },
        physique: {
          ...defaultPhysique("female"),
          apparentAge: B.world.startAgeYears,
          bustCup: "C",
        },
      },
  );
  const [contentLocks, setContentLocks] = useState<string[]>(
    withCampaignContent(upgradeJourneyLocks(initialDraft?.contentLocks ?? [])),
  );
  const [draftStatus, setDraftStatus] = useState(initialDraft ? "创角草稿已恢复" : "");
  const [submitting, setSubmitting] = useState(false);
  const [portraitState, setPortraitState] = useState({ busy: false, pending: false });
  const [appearanceNotice, setAppearanceNotice] = useState(
    initialDraft?.previousLook
      ? "形貌修改尚待决定，原立绘已恢复供对比。可恢复原形貌，或按新形貌继续。"
      : "",
  );
  const [previousLook, setPreviousLook] = useState<{
    profile: Profile;
    seed: number;
    roll: number;
  } | null>(initialDraft?.previousLook ?? null);
  const submitLock = useRef(false);
  const draftFile = useRef<HTMLInputElement>(null);
  const exportDraft = () => {
    const draft = {
      version: 1,
      revision: initialDraft?.revision ?? 0,
      seed: Number(seed),
      roll,
      profile,
      contentLocks,
      ...(previousLook ? { previousLook } : {}),
    };
    const blob = new Blob([JSON.stringify({ format: "xiantu-creation-draft-1", draft }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `仙途_创角草稿_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const importDraft = async (file: File) => {
    try {
      if (file.size > 65536) throw new Error("创角草稿超过 64 KiB。");
      const raw = JSON.parse(await file.text());
      if (raw.format !== "xiantu-creation-draft-1")
        throw new Error("请选择创角草稿文件；人生存档请使用页面上的导入存档入口。");
      const parsed = draftSchema.parse(raw.draft);
      parsed.contentLocks = withCampaignContent(upgradeJourneyLocks(parsed.contentLocks ?? []));
      selectedExtensions(parsed.contentLocks);
      const value = {
        seed: parsed.seed,
        roll: parsed.roll,
        profile: parsed.profile,
        contentLocks: parsed.contentLocks ?? [],
        ...(parsed.previousLook ? { previousLook: parsed.previousLook } : {}),
      };
      if (onSaveDraft) await onSaveDraft(value);
      saved.current = JSON.stringify(value);
      setSeed(String(value.seed));
      setRoll(value.roll);
      setProfile(value.profile);
      setContentLocks(value.contentLocks);
      setPreviousLook(parsed.previousLook ?? null);
      setAppearanceNotice(
        parsed.previousLook ? "已恢复待决定的形貌修改，原立绘仍保留供对比。" : "",
      );
      setDraftStatus("创角草稿已导入并保存");
    } catch {
      setDraftStatus("创角草稿格式或内容版本不匹配，原草稿保留。");
    }
  };
  const saved = useRef(JSON.stringify({ seed: Number(seed), roll, profile, contentLocks }));
  useEffect(() => {
    const value = {
      seed: Number(seed),
      roll,
      profile,
      contentLocks,
      ...(previousLook ? { previousLook } : {}),
    };
    const signature = JSON.stringify(value);
    if (!onSaveDraft || signature === saved.current) return;
    let active = true;
    setDraftStatus("正在保存创角草稿…");
    void onSaveDraft(value)
      .then(() => {
        saved.current = signature;
        if (active) setDraftStatus("创角草稿已保存");
      })
      .catch((e) => {
        if (active) setDraftStatus(e instanceof Error ? e.message : "草稿尚未保存，请重试。");
      });
    return () => {
      active = false;
    };
  }, [seed, roll, profile, contentLocks, previousLook, onSaveDraft]);
  const submit = async () => {
    if (
      submitLock.current ||
      portraitState.busy ||
      portraitState.pending ||
      previousLook ||
      !profile.name.trim()
    )
      return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (onSaveDraft) await onSaveDraft({ seed: Number(seed), roll, profile, contentLocks });
      await onCreate(profile, Number(seed), contentLocks);
    } catch (e) {
      setDraftStatus(e instanceof Error ? e.message : "创角尚未保存，请重试。");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    const changesLook = ["sex", "appearance", "physique", "portraitFeatures"].includes(key);
    if (changesLook && profile.portraitId) {
      setPreviousLook({ profile: structuredClone(profile), seed: Number(seed), roll });
      setAppearanceNotice(
        "形貌已修改，原立绘暂时保留供对比。请选择生成新图、恢复原形貌，或不带立绘开始。",
      );
    }
    if (key === "portraitId") {
      setPreviousLook(null);
      setAppearanceNotice("");
    }
    setProfile((p) => {
      const next = { ...p, [key]: value };
      if (changesLook) delete next.portraitId;
      if (key === "sex")
        next.physique = {
          ...defaultPhysique(value as Profile["sex"]),
          apparentAge: B.world.startAgeYears,
          ...(value === "female" ? { bustCup: "C" as const } : {}),
        };
      return next;
    });
  };
  const body = profilePhysique(profile);
  const reroll = () => {
    const n = roll + 1;
    setRoll(n);
    update("aptitude", rollAptitude(Number(seed) || 0, n));
  };
  return (
    <form
      className={`creation-form creation-panel-${panel}`}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.nativeEvent.isComposing &&
          e.target instanceof HTMLInputElement
        ) {
          e.preventDefault();
        }
      }}
      onSubmit={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        void submit();
      }}
    >
      <div className="form-heading">
        <span className="eyebrow">
          <Leaf size={14} /> 你的角色
        </span>
        <h2 className="serif">为这一世，落笔。</h2>
        <p>凡人之身，亦可踏上仙途。</p>
      </div>
      <nav className="creation-panel-nav" aria-label="创角面板">
        {[
          ["identity", "身份与身形"],
          ["portrait", "全身立绘"],
          ["options", "天资与机缘"],
        ].map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={panel === key ? "default" : "ghost"}
            aria-pressed={panel === key}
            onClick={() => setPanel(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div className="creation-workbench">
        <section className="creation-identity" aria-label="身份与身形">
          <h3 className="creation-column-title">
            身份与身形 <small>姓名必填，其余可调整</small>
          </h3>
          <div className="identity-row">
            <label className="form-field">
              <span>
                姓名 <small>必填</small>
              </span>
              <input
                required
                aria-label="姓名"
                aria-describedby="creation-name-hint"
                autoComplete="off"
                maxLength={16}
                placeholder="留一个名字在人间"
                value={profile.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <fieldset>
              <legend>性别</legend>
              <RadioGroup
                className="inline-radio"
                value={profile.sex}
                onValueChange={(v) => update("sex", v as Profile["sex"])}
              >
                <label>
                  <RadioGroupItem value="female" />女
                </label>
                <label>
                  <RadioGroupItem value="male" />男
                </label>
              </RadioGroup>
            </fieldset>
          </div>
          {!profile.name.trim() && (
            <p id="creation-name-hint" className="action-reason">
              先填写这一世的姓名。
            </p>
          )}
          <AppearanceFields
            sex={profile.sex}
            appearance={profile.appearance}
            physique={body}
            onAppearanceChange={(value) => update("appearance", value)}
            onPhysiqueChange={(value) => update("physique", value)}
            disabled={busy || submitting}
          />
          <label className="form-field seed-field">
            <span>机缘种子</span>
            <input
              title="相同种子重现相同的初始世界。"
              aria-description="相同种子重现相同的初始世界。"
              type="number"
              min="0"
              max="4294967295"
              value={seed}
              onChange={(e) => {
                if (profile.portraitId) {
                  setPreviousLook({ profile: structuredClone(profile), seed: Number(seed), roll });
                  setAppearanceNotice("机缘种子已变化，原立绘保留供对比，请重新决定形象。");
                }
                setSeed(e.target.value);
                setRoll(0);
                setProfile(({ portraitId: _previous, ...p }) => ({
                  ...p,
                  aptitude: rollAptitude(Number(e.target.value) || 0, 0),
                }));
              }}
            />
            <small>
              相同种子重现相同初始世界。默认 12345 与现有角色原画配套；修改会改变世界与随机人物。
            </small>
          </label>
        </section>
        <div className="creation-portrait-panel">
          <h3 className="creation-column-title">
            全身立绘 <small>可选，可入世后再绘制</small>
          </h3>
          {appearanceNotice && <p role="status">{appearanceNotice}</p>}
          {previousLook && (
            <div className="portrait-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const old = previousLook;
                  setProfile((p) => ({
                    ...p,
                    sex: old.profile.sex,
                    appearance: old.profile.appearance,
                    physique: old.profile.physique,
                    portraitFeatures: old.profile.portraitFeatures,
                    portraitId: old.profile.portraitId,
                    aptitude: old.profile.aptitude,
                  }));
                  setSeed(String(old.seed));
                  setRoll(old.roll);
                  setPreviousLook(null);
                  setAppearanceNotice("已恢复原立绘与对应形貌。");
                }}
              >
                恢复原形貌与立绘
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPreviousLook(null);
                  setAppearanceNotice("采用当前形貌，可不带立绘开始游戏。");
                }}
              >
                按新形貌开始，暂不配图
              </Button>
            </div>
          )}
          <PortraitStudio
            onStateChange={setPortraitState}
            subject={playerSubject(profile, Number(seed))}
            portraitId={profile.portraitId ?? previousLook?.profile.portraitId}
            name={profile.name || "你的角色"}
            disabled={!physiqueSchema.safeParse(body).success || submitting || busy}
            onAdopt={(id) => update("portraitId", id)}
            onFeaturesChange={(features) => update("portraitFeatures", features)}
          />
        </div>
        <section className="creation-options-panel" aria-label="天资与机缘">
          <h3 className="creation-column-title">
            天资与机缘 <small>已选默认配置，可调整</small>
          </h3>
          <div className="aptitude-box">
            <div className="spread">
              <span>
                <Sparkles size={15} /> 灵根资质
              </span>
              <strong>
                {profile.aptitude}
                <small> / 100</small>
              </strong>
              <Button type="button" size="sm" variant="ghost" onClick={reroll}>
                <Dices size={16} /> 重掷
              </Button>
            </div>
            <Progress aria-label="灵根资质" value={profile.aptitude} />
            <p>
              {profile.aptitude >= 80
                ? "灵台澄明，天资出众。"
                : profile.aptitude >= 50
                  ? "灵根通达，勤修可期。"
                  : "天资虽朴，向道之心不改。"}{" "}
              可以不限次数重掷。
            </p>
          </div>
          <fieldset className="artifact-field">
            <legend>
              伴生法宝 <span>必选 · 三选其一</span>
            </legend>
            <RadioGroup
              value={profile.artifact}
              onValueChange={(v) => update("artifact", v as Profile["artifact"])}
              className="artifact-choices"
            >
              {ARTIFACTS.map((a) => (
                <label
                  key={a.id}
                  className={`artifact-option ${profile.artifact === a.id ? "selected" : ""}`}
                >
                  <RadioGroupItem value={a.id} className="artifact-radio" aria-label={a.name} />
                  <img
                    className="artifact-art"
                    src={`/artifacts/${a.id}.svg`}
                    alt=""
                    width={96}
                    height={96}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <small>{a.description.replace(/^.*?。/, "")}</small>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <fieldset className="creation-options">
            <legend>游玩模式</legend>
            <RadioGroup
              value={profile.mode}
              onValueChange={(v) => update("mode", v as Profile["mode"])}
              className="mode-choices"
            >
              <label>
                <RadioGroupItem value="simple" />
                <span>
                  简单 <small>战败可恢复；寿尽仍会结束这一世。</small>
                </span>
              </label>
              <label>
                <RadioGroupItem value="complex" />
                <span>
                  复杂 <small>真正死亡会结束本局；突破失败不致死。</small>
                </span>
              </label>
            </RadioGroup>
          </fieldset>
          <fieldset className="content-choices">
            <legend>主线 · 青石十钗</legend>
            <p className="campaign-introduction">
              {CAMPAIGN_VOLUMES.map(({ chapter }) =>
                chapter.volumeTitle.replace(/^卷. · /, ""),
              ).join(" → ")}
              <br />
              随修行与远行，依次走入四城的人与事。
            </p>
          </fieldset>
          <fieldset className="content-choices">
            <legend>
              其他故事 <span className="optional-note">可选</span>
            </legend>
            {OPTIONAL_EXTENSIONS.map((e) => (
              <label className="content-choice" key={e.lock}>
                <input
                  type="checkbox"
                  checked={contentLocks.includes(e.lock)}
                  onChange={(event) =>
                    setContentLocks((locks) =>
                      event.target.checked
                        ? [...locks, e.lock]
                        : locks.filter((lock) => lock !== e.lock),
                    )
                  }
                />
                <span>
                  {e.data.manifest.title}
                  <small>可选支线 · 开局后保留本版故事</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
      </div>
      <div className="creation-file-options">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={exportDraft}>
            导出创角草稿
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || submitting}
            onClick={() => draftFile.current?.click()}
          >
            导入创角草稿
          </Button>
          <input
            ref={draftFile}
            className="sr-only"
            tabIndex={-1}
            type="file"
            accept=".json"
            aria-label="选择创角草稿"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importDraft(file);
            }}
          />
        </div>
        <p className="save-footnote" role="status">
          {draftStatus || "进度保存在当前浏览器"}
        </p>
      </div>
      <div className="creation-bottom">
        {(portraitState.busy || portraitState.pending) && (
          <p role="status">
            {portraitState.busy
              ? "立绘正在生成，可取消后开始游戏。"
              : "新立绘待选择，请先采用或取消绘制。"}
          </p>
        )}
        {onCancel && (
          <Button variant="ghost" type="button" onClick={onCancel}>
            回到此世
          </Button>
        )}
        <Button
          className="begin-button"
          type="submit"
          disabled={
            busy ||
            submitting ||
            portraitState.busy ||
            portraitState.pending ||
            !!previousLook ||
            !profile.name.trim() ||
            !physiqueSchema.safeParse(body).success
          }
        >
          {busy || submitting ? "正在展开这一世…" : "踏入仙途"}
          <ArrowRight size={18} />
        </Button>
      </div>
    </form>
  );
}
