import {
  COLOR_SLIDERS,
  DEFAULT_ADJUSTMENTS,
  SliderSpec,
  TONE_SLIDERS,
} from "../editor/adjustments";
import {
  cropToAspect,
  DEFAULT_GEOMETRY,
  isDefaultGeometry,
  rotate90CCW,
  rotate90CW,
} from "../editor/geometry";
import {
  DEFAULT_RAW_SETTINGS,
  DENOISE_OPTIONS,
  rawSettingsEqual,
} from "../editor/rawSettings";
import { FILM_STOCKS } from "../editor/filmStocks";
import {
  selectAdjustments,
  selectImage,
  selectIsRaw,
  selectRawSettings,
  useEditor,
} from "../state/store";
import { CurveEditor } from "./CurveEditor";

const ASPECT_PRESETS: { label: string; aspect: number | null }[] = [
  { label: "Free", aspect: null },
  { label: "Original", aspect: -1 },
  { label: "1:1", aspect: 1 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "16:9", aspect: 16 / 9 },
];

export function Sidebar() {
  const adj = useEditor(selectAdjustments);
  const image = useEditor(selectImage);
  const isRaw = useEditor(selectIsRaw);
  const raw = useEditor(selectRawSettings);
  const photoCount = useEditor((s) => s.photoOrder.length);
  const cropEditing = useEditor((s) => s.cropEditing);
  const setAdjustment = useEditor((s) => s.setAdjustment);
  const setGeometry = useEditor((s) => s.setGeometry);
  const setCropEditing = useEditor((s) => s.setCropEditing);
  const setRawSetting = useEditor((s) => s.setRawSetting);
  const resetRawSettings = useEditor((s) => s.resetRawSettings);
  const applyAdjustmentsToAll = useEditor((s) => s.applyAdjustmentsToAll);
  const applyRawSettingsToAll = useEditor((s) => s.applyRawSettingsToAll);
  const geom = adj.geometry;

  return (
    <aside className="sidebar">
      {photoCount > 1 && (
        <Section title="Bulk Edit">
          <button
            type="button"
            className="bulk-btn"
            onClick={applyAdjustmentsToAll}
          >
            Apply adjustments to all
          </button>
          {isRaw && (
            <button
              type="button"
              className="bulk-btn"
              onClick={applyRawSettingsToAll}
            >
              Apply RAW settings to all RAW
            </button>
          )}
          <p className="curve-hint">
            Copies the current photo&apos;s settings to every photo in the
            catalog. Edits are saved automatically.
          </p>
        </Section>
      )}
      {isRaw && (
        <Section title="RAW Develop">
          <div className="slider-row">
            <label htmlFor="raw-denoise">Denoise</label>
            <select
              id="raw-denoise"
              className="raw-select"
              value={raw.denoise}
              onChange={(e) =>
                setRawSetting("denoise", Number(e.target.value) as 0 | 1 | 2)
              }
            >
              {DENOISE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={raw.autoBright}
              onChange={(e) => setRawSetting("autoBright", e.target.checked)}
            />
            Auto brightness
          </label>

          <div className="slider-row">
            <label>Demosaic</label>
            <div className="slider-meta">
              <span className="value">{raw.demosaicQuality}</span>
              {raw.demosaicQuality !== DEFAULT_RAW_SETTINGS.demosaicQuality && (
                <button
                  className="reset"
                  title="Reset"
                  onClick={() =>
                    setRawSetting(
                      "demosaicQuality",
                      DEFAULT_RAW_SETTINGS.demosaicQuality,
                    )
                  }
                >
                  ↺
                </button>
              )}
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={raw.demosaicQuality}
              onChange={(e) =>
                setRawSetting("demosaicQuality", Number(e.target.value))
              }
              onDoubleClick={() =>
                setRawSetting(
                  "demosaicQuality",
                  DEFAULT_RAW_SETTINGS.demosaicQuality,
                )
              }
            />
          </div>

          {!rawSettingsEqual(raw, DEFAULT_RAW_SETTINGS) && (
            <button
              type="button"
              className="raw-reset-all"
              onClick={resetRawSettings}
            >
              Reset RAW settings
            </button>
          )}
          <p className="curve-hint">
            Changes reprocess the file (may take a few seconds).
          </p>
        </Section>
      )}

      <Section title="Transform">
        <div className="geo-actions">
          <button
            type="button"
            className="geo-btn"
            title="Rotate 90° left"
            disabled={!image}
            onClick={() => setGeometry(rotate90CCW(geom))}
          >
            ↺ 90°
          </button>
          <button
            type="button"
            className="geo-btn"
            title="Rotate 90° right"
            disabled={!image}
            onClick={() => setGeometry(rotate90CW(geom))}
          >
            90° ↻
          </button>
          <button
            type="button"
            className={`geo-btn${cropEditing ? " active" : ""}`}
            disabled={!image}
            onClick={() => setCropEditing(!cropEditing)}
          >
            {cropEditing ? "Done crop" : "Crop"}
          </button>
        </div>

        <div className="slider-row">
          <label>Level</label>
          <div className="slider-meta">
            <span className="value">
              {geom.straighten >= 0 ? "+" : ""}
              {geom.straighten.toFixed(1)}°
            </span>
            {geom.straighten !== 0 && (
              <button
                className="reset"
                title="Reset"
                onClick={() => setGeometry({ straighten: 0 })}
              >
                ↺
              </button>
            )}
          </div>
          <input
            type="range"
            min={-15}
            max={15}
            step={0.1}
            value={geom.straighten}
            disabled={!image}
            onChange={(e) =>
              setGeometry({ straighten: parseFloat(e.target.value) })
            }
            onDoubleClick={() => setGeometry({ straighten: 0 })}
          />
        </div>

        <p className="curve-hint geo-hint">Aspect ratio</p>
        <div className="aspect-grid">
          {ASPECT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="aspect-chip"
              disabled={!image}
              onClick={() => {
                if (!image) return;
                if (p.aspect === null) return;
                if (p.aspect === -1) {
                  setGeometry({
                    cropX: 0,
                    cropY: 0,
                    cropW: 1,
                    cropH: 1,
                  });
                  return;
                }
                setGeometry(
                  cropToAspect(image.width, image.height, p.aspect, geom),
                );
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {!isDefaultGeometry(geom) && (
          <button
            type="button"
            className="raw-reset-all"
            disabled={!image}
            onClick={() => setGeometry(DEFAULT_GEOMETRY)}
          >
            Reset transform
          </button>
        )}
        <p className="curve-hint">
          Crop: drag handles in crop mode · Level straightens horizons
        </p>
      </Section>

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

      <Section title="Film">
        <div className="film-grid">
          {FILM_STOCKS.map((stock) => (
            <button
              key={stock.id}
              type="button"
              className={`film-chip${adj.film === stock.id ? " active" : ""}`}
              title={stock.hint}
              onClick={() => setAdjustment("film", stock.id)}
            >
              {stock.label}
            </button>
          ))}
        </div>
        {adj.film !== "none" && (
          <p className="curve-hint">
            {FILM_STOCKS.find((s) => s.id === adj.film)?.hint}
          </p>
        )}
      </Section>

      <Section title="Tone Curve">
        <CurveEditor
          points={adj.curve}
          onChange={(c) => setAdjustment("curve", c)}
        />
        <p className="curve-hint">
          Drag points · click to add · double-click point to remove · double-click
          background to reset
        </p>
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
    <div className="slider-row">
      <label>{spec.label}</label>
      <div className="slider-meta">
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
      </div>
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
