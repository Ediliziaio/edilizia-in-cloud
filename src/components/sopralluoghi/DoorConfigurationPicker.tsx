import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";
import { doorSurveyScene } from "@/lib/surveys/doorSurvey";
import type { WindowValues } from "@/lib/surveys/windowSurvey";
const presets = [
  { label: "Anta unica", layout: "singola", sides: "no", top: "no" },
  { label: "Anta con fiancoluce", layout: "singola", sides: "sx", top: "no" },
  {
    label: "Anta con due fiancoluce",
    layout: "singola",
    sides: "entrambi",
    top: "no",
  },
  { label: "Anta con sopraluce", layout: "singola", sides: "no", top: "fisso" },
  {
    label: "Due ante simmetriche",
    layout: "doppia_simmetrica",
    sides: "no",
    top: "no",
  },
  {
    label: "Due ante asimmetriche",
    layout: "doppia_asimmetrica",
    sides: "no",
    top: "no",
  },
];
export function DoorConfigurationPicker({
  values,
  onChange,
  disabled = false,
}: {
  values: WindowValues;
  onChange: (v: WindowValues) => void;
  disabled?: boolean;
}) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        Scegli la forma dal disegno
      </summary>
      <p className="my-3 text-xs text-slate-500">
        Figure illustrative, non in scala. La scelta imposta solo la
        configurazione: inserisci poi le misure reali. Puoi combinare ante,
        fiancoluce e sopraluce nei campi sotto.
      </p>
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        aria-label="Configurazioni illustrate del portoncino"
      >
        {presets.map((p) => {
          const scene = doorSurveyScene(
            1500,
            2300,
            {
              rv_door_layout: p.layout,
              rv_door_sidelights: p.sides,
              rv_door_toplight: p.top,
              rv_door_sidelight_left_width: 300,
              rv_door_sidelight_right_width: 300,
              rv_door_split_mm: 1000,
              rv_door_toplight_height: 350,
            },
            true,
          ).scene;
          const selected =
            values.rv_door_layout === p.layout &&
            (values.rv_door_sidelights || "no") === p.sides &&
            (values.rv_door_toplight || "no") === p.top;
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              aria-label={`Configurazione: ${p.label}`}
              aria-pressed={selected}
              className={`min-w-0 rounded-xl border bg-white p-3 text-left transition-colors motion-reduce:transition-none ${selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-300"}`}
              onClick={() =>
                onChange({
                  ...values,
                  rv_door_layout: p.layout,
                  rv_door_sidelights: p.sides,
                  rv_door_toplight: p.top,
                })
              }
            >
              <span
                aria-hidden="true"
                className="mx-auto mb-2 block h-24 w-full overflow-hidden [&>svg]:!h-24 [&>svg]:!w-full"
              >
                <DisegnoSerramentoSvg
                  scena={scene}
                  mostraQuote={false}
                  compatto
                  vista="esterna"
                />
              </span>
              <span className="block text-xs font-medium text-slate-800">
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
