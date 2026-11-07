import { Check, X } from "lucide-react";
import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import { roomVisualChoices, selectedRoomVisuals, type RoomVisualGroup } from "../../../shared/render-references/roomVisualCatalog.ts";

const NOMI: Record<RoomVisualGroup, string> = {
  window_profile: "Profilo comune degli infissi",
  style: "Stile del render", paint_finish: "Finitura della pittura", floor_type: "Materiale del pavimento", floor_effect: "Effetto del pavimento", floor_essence: "Essenza del legno", floor_pattern: "Posa del pavimento", floor_finish: "Finitura del pavimento", floor_skirting: "Tipo battiscopa", furniture_material: "Materiale degli arredi", ceiling_type: "Tipo di soffitto", lighting_type: "Tipo di illuminazione", wallpaper_pattern: "Carta da parati", cladding_type: "Rivestimento delle pareti", curtain_type: "Tende", kitchen_front: "Frontali cucina", kitchen_worktop: "Piano di lavoro", kitchen_handle: "Maniglie cucina",
};

/** Le opzioni usano le STESSE PhotoEntry delle tavole inviate al modello. */
export function ScelteVisiveStanza({ gruppo, value, onValueChange, disabled, config }: { gruppo: RoomVisualGroup; value?: string; onValueChange: (v: string) => void; disabled?: boolean; config?: unknown }) {
  return (
    <div role="group" aria-label={NOMI[gruppo]} className="grid w-full grid-cols-2 gap-2 min-[450px]:grid-cols-3">
      {roomVisualChoices(gruppo, config).map((c) => (
        <button key={c.value} type="button" disabled={disabled} aria-pressed={value === c.value} onClick={() => onValueChange(c.value)}
          className={`relative min-w-0 overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${value === c.value ? "border-primary ring-2 ring-primary" : "border-border bg-background hover:border-primary/60"}`}>
          <span className="block aspect-[4/3] w-full overflow-hidden bg-muted">
            {c.photo ? <ReferenceThumb key={`${c.photo.folder}/${c.photo.filename}`} photo={c.photo} alt="" /> : <span className="flex h-full items-center justify-center text-muted-foreground"><X className="h-7 w-7" /></span>}
          </span>
          <span className="block px-2 py-1.5 text-[11px] font-medium leading-snug">{c.label}</span>
          {value === c.value && <span aria-hidden="true" className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3 w-3" /></span>}
        </button>
      ))}
    </div>
  );
}

export function RiepilogoCampioniStanza({ config }: { config: unknown }) {
  const scelte = selectedRoomVisuals(config);
  if (!scelte.length) return null;
  return (
    <section aria-label="Campioni selezionati per il render" className="space-y-2 rounded-xl border bg-muted/20 p-3">
      <h3 className="text-sm font-semibold">I tuoi campioni per il render</h3>
      <p className="text-xs text-muted-foreground">Queste immagini vengono raccolte nelle tavole di riferimento del render. Colori, misure e pareti su cui applicarle seguono le tue impostazioni.</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {scelte.map((c) => <figure key={c.id} className="min-w-0 overflow-hidden rounded border bg-background"><div className="aspect-square overflow-hidden bg-muted">{c.photo && <ReferenceThumb photo={c.photo} alt="" />}</div><figcaption className="p-1.5 text-[10px] leading-tight">{c.label}</figcaption></figure>)}
      </div>
    </section>
  );
}
