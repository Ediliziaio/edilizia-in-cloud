import { useState } from "react";
import { Paintbrush } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMPIONI_FINITURE, campioneFinitura, type SuperficieFinitura } from "../../../../shared/planimetrie/finiture.ts";
import type { Finiture } from "../../../../shared/planimetrie/modello.ts";
import { fotoCampioneFinitura } from "@/lib/planimetrie/campioniFoto";
import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import { descrizionePavimento } from "../../../../shared/planimetrie/materialiProgetto.ts";
import type { ConfigPavimentoStanza } from "../../../../shared/render-room/floorSelection.ts";
import { floorSurfacePhoto } from "../../../../shared/render-references/floorReferences.ts";
import { normalizeRoomFloorConfig } from "../../../../shared/render-room/roomRenderConfig.ts";

const NOMI: Record<SuperficieFinitura, string> = { pavimento: "Pavimento", pareti: "Pareti", soffitto: "Soffitto" };

function CampoFinitura({ superficie, valore, cambia }: { superficie: SuperficieFinitura; valore?: string; cambia: (v: string | undefined) => void }) {
  const [testo, setTesto] = useState(valore ?? "");
  const campione = campioneFinitura(valore, superficie);
  const esatto = CAMPIONI_FINITURE[superficie].find((c) => c.descrizione === valore || c.nome === valore || c.id === valore);
  const foto = campione && fotoCampioneFinitura(campione, superficie);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`finitura-${superficie}`} className="text-xs">{NOMI[superficie]}</Label>
      <div className="flex items-center gap-2">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted" aria-hidden="true"
          style={{ backgroundColor: campione?.colore === "#ffffff" ? undefined : campione?.colore }}>
          {foto && <ReferenceThumb key={`${foto.folder}/${foto.filename}`} photo={foto} alt="" />}
        </div>
        <Select value={!valore ? "automatico" : esatto?.id ?? "personalizzata"} onValueChange={(id) => {
          if (id === "personalizzata") return;
          cambia(id === "automatico" ? undefined : CAMPIONI_FINITURE[superficie].find((c) => c.id === id)?.descrizione);
        }}>
          <SelectTrigger id={`finitura-${superficie}`} className="h-10 min-w-0 flex-1 text-xs" aria-label={`Finitura ${NOMI[superficie].toLowerCase()}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="automatico">Automatico</SelectItem>
            {CAMPIONI_FINITURE[superficie].map((c) => { const f = fotoCampioneFinitura(c, superficie); return <SelectItem key={c.id} value={c.id}><span className="flex items-center gap-2">{f && <span className="h-9 w-9 shrink-0 overflow-hidden rounded border"><ReferenceThumb photo={f} alt="" /></span>}<span>{c.nome}</span></span></SelectItem>; })}
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

export function FinitureStanza({ value, onChange, pavimentoComune }: { value: Finiture; onChange: (f: Finiture) => void; pavimentoComune?: ConfigPavimentoStanza }) {
  const fotoComune = pavimentoComune ? floorSurfacePhoto(normalizeRoomFloorConfig(pavimentoComune as unknown as Record<string, unknown>))?.entry : undefined;
  return (
    <section aria-label="Finiture della stanza" className="space-y-3 rounded-lg border bg-background p-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Paintbrush className="h-4 w-4" />Finiture della stanza</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Scegli il materiale: lo ritrovi nel 3D e nel render della stanza, con venature, fughe e texture.</p>
      </div>
      {pavimentoComune && <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-950"><p className="font-semibold">Pavimento comune del progetto</p><div className="mt-2 flex items-center gap-2">{fotoComune && <span className="h-12 w-12 shrink-0 overflow-hidden rounded border"><ReferenceThumb photo={fotoComune} alt="" /></span>}<span>{descrizionePavimento(pavimentoComune)}</span></div><p className="mt-2">Vale anche per questa stanza. Modificalo da «Materiali comuni» nella scheda della pianta.</p></div>}
      {(["pavimento", "pareti", "soffitto"] as const).filter((superficie) => superficie !== "pavimento" || !pavimentoComune).map((superficie) => <CampoFinitura key={`${superficie}:${value[superficie] ?? ""}`} superficie={superficie} valore={value[superficie]} cambia={(v) => onChange({ ...value, [superficie]: v })} />)}
    </section>
  );
}
