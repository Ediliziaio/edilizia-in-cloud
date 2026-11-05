import { Check } from "lucide-react";
import { PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture.ts";
import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import { floorSurfacePhoto } from "../../../shared/render-references/floorReferences.ts";
import { normalizeRoomFloorConfig } from "../../../shared/render-room/roomRenderConfig.ts";
import { applicaCampionePavimento, campionePavimentoAttivo } from "@/modules/render-stanza/lib/campioniFiniture";
import type { ConfigurazioneStanza } from "@/modules/render-stanza/lib/types";

export function CampioniFinitureStanza({ value, onChange, disabled, onPersonalizza }: { value: ConfigurazioneStanza; onChange: (c: ConfigurazioneStanza) => void; disabled?: boolean; onPersonalizza?: () => void }) {
  const attivo = campionePavimentoAttivo(value);
  return (
    <section aria-label="Materiali realistici del render" className="space-y-3 rounded-xl border bg-background p-3 sm:p-4">
      <div>
        <h3 className="text-sm font-semibold">Finiture per il render</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Scegli un campione per il pavimento: imposta materiale, effetto, colore e formato. Puoi personalizzare essenza, posa e finitura in “Pavimento” qui sotto.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAVIMENTI_STANZA.map((c) => {
          const foto = floorSurfacePhoto(normalizeRoomFloorConfig(applicaCampionePavimento(value, c.id).pavimento as unknown as Record<string, unknown>))?.entry;
          return (
            <button key={c.id} type="button" disabled={disabled} aria-pressed={attivo === c.id} onClick={() => onChange(applicaCampionePavimento(value, c.id))}
              className={`relative overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${attivo === c.id ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/60"}`}>
              <span className="block h-20 overflow-hidden bg-muted" style={{ backgroundColor: c.colore }}>
                {foto && <ReferenceThumb photo={foto} alt="" />}
              </span>
              <span className="block px-2 py-2 text-[11px] font-medium leading-snug sm:text-xs">{c.nome}</span>
              {attivo === c.id && <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3 w-3" /></span>}
            </button>
          );
        })}
      </div>
      {value.pavimento.attivo && onPersonalizza && <button type="button" disabled={disabled} onClick={onPersonalizza} className="text-xs font-medium text-primary underline underline-offset-4">Personalizza colore, posa e finitura</button>}
      {value.pavimento.attivo && <p className="text-[11px] text-muted-foreground">Il pavimento scelto qui viene applicato al render. Le misure, le porte e le finestre della stanza restano quelle della planimetria.</p>}
    </section>
  );
}
