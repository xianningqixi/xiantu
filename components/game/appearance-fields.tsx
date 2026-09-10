"use client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { COLORS, FACES, HAIRS } from "@/lib/game/content/official";
import { BODY_BUILDS, BUST_CUPS, type Physique } from "@/lib/game/physique";
import type { Profile } from "@/lib/game/types";

/** The same appearance controls in creation and portrait redraws. */
export function AppearanceFields({
  sex,
  appearance,
  physique: body,
  onAppearanceChange,
  onPhysiqueChange,
  disabled = false,
  omitFace = false,
}: {
  sex: Profile["sex"];
  appearance: Profile["appearance"];
  physique: Physique;
  onAppearanceChange: (value: Profile["appearance"]) => void;
  onPhysiqueChange: (value: Physique) => void;
  disabled?: boolean;
  omitFace?: boolean;
}) {
  const setBody = <K extends keyof Physique>(key: K, value: Physique[K]) =>
    onPhysiqueChange({ ...body, [key]: value });
  return (
    <>
      <div className="appearance-row">
        {(
          [
            { key: "face", label: "容貌", options: FACES },
            { key: "hair", label: "发式", options: HAIRS },
            { key: "color", label: "服饰主色", options: COLORS },
          ] as const
        )
          .filter((f) => !omitFace || f.key !== "face")
          .map((f) => (
            <div className="appearance-field" key={f.key}>
              <span>{f.label}</span>
              <RadioGroup
                aria-label={f.label}
                className="appearance-choices"
                disabled={disabled}
                value={String(appearance[f.key])}
                onValueChange={(v) => onAppearanceChange({ ...appearance, [f.key]: Number(v) })}
              >
                {f.options.map((o, i) => (
                  <label key={o} className="choice-chip">
                    <RadioGroupItem value={String(i)} aria-label={o} />
                    <span>{o}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          ))}
      </div>
      <div className="physique-fields">
        <div className="body-build-field">
          <span>身材</span>
          <RadioGroup
            aria-label="身材"
            className="appearance-choices"
            disabled={disabled}
            value={body.build}
            onValueChange={(value) => setBody("build", value as Physique["build"])}
          >
            {Object.entries(BODY_BUILDS).map(([id, label]) => (
              <label key={id} className="choice-chip">
                <RadioGroupItem value={id} aria-label={label} />
                <span>{label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
        <label className="form-field">
          <span>身高（cm）</span>
          <input
            disabled={disabled}
            type="number"
            min={145}
            max={210}
            value={body.heightCm}
            onChange={(e) => setBody("heightCm", Number(e.target.value))}
          />
        </label>
        {sex === "female" && (
          <label className="form-field">
            <span>胸围</span>
            <select
              disabled={disabled}
              value={body.bustCup ?? ""}
              onChange={(e) => setBody("bustCup", e.target.value as Physique["bustCup"])}
            >
              <option value="" disabled>
                请选择
              </option>
              {BUST_CUPS.map((cup) => (
                <option key={cup} value={cup}>
                  {cup}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </>
  );
}
