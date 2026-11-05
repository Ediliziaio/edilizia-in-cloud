import { useState } from "react";
import { Paintbrush } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMPIONI_FINITURE, campioneFinitura, type SuperficieFinitura } from "../../../../shared/planimetrie/finiture.ts";
import type { Finiture } from "../../../../shared/planimetrie/modello.ts";
import { FOTO_FINITURE } from "@/lib/planimetrie/fotoFiniture";

const NOMI: Record<SuperficieFinitura, string> = { pavimento: "Pavimento", pareti: "Pareti", soffitto: "Soffitto" };

function CampoFinitura({ superficie, valore, cambia }: { superficie: SuperficieFinitura; valore?: string; cambia: (v: string | undefined) => void }) {
  const [testo, setTesto] = useState(valore ?? "");
  const campione = campioneFinitura(valore, superficie);
  const esatto = CAMPIONI_FINITURE[superficie].find((c) => c.descrizione === valore || c.nome === valore || c.id === valore);
  const foto = campione && FOTO_FINITURE[campione.trama];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`finitura-${superficie}`} className="text-xs">{NOMI[superficie]}</Label>
      <div className="flex items-center gap-2">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted" aria-hidden="true"
          style={{ backgroundColor: campione?.colore === "#ffffff" ? undefined : campione?.colore }}>
          {foto && <img src={foto} alt="" className="h-full w-full object-cover" style={{ filter: campione?.id === "noce" ? "brightness(0.55) saturate(1.1)" : undefined }} />}
        </div>
        <Select value={!valore ? "automatico" : esatto?.id ?? "personalizzata"} onValueChange={(id) => {
          if (id === "personalizzata") return;
          cambia(id === "automatico" ? undefined : CAMPIONI_FINITURE[superficie].find((c) => c.id === id)?.descrizione);
        }}>
          <SelectTrigger id={`finitura-${superficie}`} className="h-10 min-w-0 flex-1 text-xs" aria-label={`Finitura ${NOMI[superficie].toLowerCase()}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="automatico">Automatico</SelectItem>
            {CAMPIONI_FINITURE[superficie].map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            {valore && !esatto && <SelectItem value="personalizzata">Personalizzata</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      <Input value={testo} maxLength={160} aria-label={`Descrizione ${NOMI[superficie].toLowerCase()}`} placeholder={`Oppure descrivi ${superficie === "pareti" ? "le pareti" : `il ${superficie}`}`}
        className="h-8 text-xs" onChange={(e) => setTesto(e.target.value)} onBlur={() => { if (testo.trim() !== (valore ?? "")) cambia(testo.trim() || undefined); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </div>
  );
}

export function FinitureStanza({ value, onChange }: { value: Finiture; onChange: (f: Finiture) => void }) {
  return (
    <section aria-label="Finiture della stanza" className="space-y-3 rounded-lg border bg-background p-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Paintbrush className="h-4 w-4" />Finiture della stanza</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Scegli il materiale: lo ritrovi nel 3D e nel render della stanza, con venature, fughe e texture.</p>
      </div>
      {(["pavimento", "pareti", "soffitto"] as const).map((superficie) => <CampoFinitura key={`${superficie}:${value[superficie] ?? ""}`} superficie={superficie} valore={value[superficie]} cambia={(v) => onChange({ ...value, [superficie]: v })} />)}
    </section>
  );
}
