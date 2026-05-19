import {
  COLOR_SLIDERS,
  DEFAULT_ADJUSTMENTS,
  SliderSpec,
  TONE_SLIDERS,
} from "../editor/adjustments";
import { useEditor } from "../state/store";
import { CurveEditor } from "./CurveEditor";

export function Sidebar() {
  const adj = useEditor((s) => s.adjustments);
  const setAdjustment = useEditor((s) => s.setAdjustment);

  return (
    <aside className="sidebar">
      <Section title="Light">
        {TONE_SLIDERS.map((s) => (
          <Slider
            key={s.key}
            spec={s}
            value={adj[s.key]}
            onChange={(v) => setAdjustment(s.key, v)}
          />
        ))}
      </Section>

      <Section title="Color">
        {COLOR_SLIDERS.map((s) => (
          <Slider
            key={s.key}
            spec={s}
            value={adj[s.key]}
            onChange={(v) => setAdjustment(s.key, v)}
          />
        ))}
      </Section>

      <Section title="Tone Curve">
        <CurveEditor
          points={adj.curve}
          onChange={(c) => setAdjustment("curve", c)}
        />
      </Section>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Slider({
  spec,
  value,
  onChange,
}: {
  spec: SliderSpec;
  value: number;
  onChange: (v: number) => void;
}) {
  const def = DEFAULT_ADJUSTMENTS[spec.key];
  const display = formatValue(value, spec);
  return (
    <div className="slider-row with-reset">
      <label>{spec.label}</label>
      <span className="value">{display}</span>
      {value !== def && (
        <button
          className="reset"
          title="Reset"
          onClick={() => onChange(def as number)}
        >
          ↺
        </button>
      )}
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => onChange(def as number)}
      />
    </div>
  );
}

function formatValue(v: number, spec: SliderSpec) {
  if (spec.key === "exposure") return `${v >= 0 ? "+" : ""}${v.toFixed(2)} EV`;
  return Math.round(v * 100).toString();
}
