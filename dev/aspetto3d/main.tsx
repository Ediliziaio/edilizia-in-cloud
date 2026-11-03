import { createRoot } from "react-dom/client";
import Vista3D from "../../src/components/planimetrie/Vista3D";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { RenderEsterniDialog } from "../../src/components/planimetrie/RenderEsterniDialog";
import { pianiDaPlanimetria, pianteDaPlanimetria } from "../../src/lib/planimetrie/tred";
import trilocale from "../../shared/planimetrie/esempi/trilocale.json";
import "../../src/index.css";

// Prova locale del 3D: ?tetto=verde|tegole|lamiera|ghiaia|verde_intensivo&piano=1 (tetto piano)&piani=3
const q = new URLSearchParams(window.location.search);
const base = JSON.parse(JSON.stringify(trilocale));
const l0 = base.livelli[0];
const n = Number(q.get("piani") ?? "1");
base.livelli = Array.from({ length: n }, (_, i) => ({ ...JSON.parse(JSON.stringify(l0)), id: `p${i}`, nome: i ? `Piano ${i}` : "Piano terra", quota: i * 300 }));
const piatto = q.get("piano") === "1";
const finitura = q.get("tetto");
base.livelli[n - 1].tetto = { tipo: piatto ? "piano" : "due_falde", pendenza: 30, sporto: 50, ...(finitura ? { finitura } : {}) };
// ids unici fra piani
base.livelli.forEach((l: { id: string; fatto: Record<string, Array<Record<string, unknown>>> }, i: number) => {
  if (!i) return;
  const m = new Map<string, string>();
  for (const k of ["muri", "aperture", "locali", "elementi"]) for (const o of l.fatto[k] ?? []) { const nuovo = `${o.id}_${i}`; m.set(String(o.id), nuovo); o.id = nuovo; }
  for (const a of l.fatto.aperture ?? []) a.muroId = m.get(String(a.muroId)) ?? a.muroId;
});
const piante = pianteDaPlanimetria(base, { livelloId: base.livelli[0].id });
const piani = n > 1 ? pianiDaPlanimetria(base) : undefined;
createRoot(document.getElementById("root")!).render(
  q.get("esterni") ? <MemoryRouter><RenderEsterniDialog aperto onChiudi={() => undefined} pianta={piante.fatto} vista="fatto" titolo="Prova" piani={piani} /><Toaster /></MemoryRouter> :
  <main className="p-3"><Vista3D piante={piante} piani={piani} modoIniziale="giro" vistaIniziale="fatto" aspettoIniziale={{ ...(q.get("facciata") ? { facciata: q.get("facciata") as never } : {}), ...(q.get("infissi") ? { infissi: q.get("infissi") as never } : {}), ...(q.get("ora") ? { ora: Number(q.get("ora")) } : {}), ...(q.get("effetti") === "0" ? { effetti: false } : {}) }} className="[&>div:last-child]:h-[78vh]" /></main>,
);

// scorciatoia di prova: tutto l'edificio e soffitto accesi, ed eventuali scelte da indirizzo (?ora=18&facciata=mattone&infissi=verde)
setTimeout(() => {
  const clic = (id: string) => (document.getElementById(id) as HTMLButtonElement | null)?.click();
  if (n > 1) clic("vista3d-edificio");
  clic("vista3d-soffitto");
  if (q.get("senza")) for (const id of String(q.get("senza")).split(",")) clic(`vista3d-${id}`);
}, 900);
