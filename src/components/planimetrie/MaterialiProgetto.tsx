import { PROJECT_WINDOW_PHOTOS } from "../../../shared/render-references/projectWindowReferences.ts";
import { useState } from "react";
import { Paintbrush, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReferenceThumb } from "@/components/render/ReferenceThumb";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { PAVIMENTI_STANZA } from "../../../shared/planimetrie/finiture.ts";
import { COLORI_INFISSI_PROGETTO, PROFILI_PROGETTO, cambiaFormatoPavimento, descrizionePavimento, materialiDelProgetto, pavimentoDaCampione, type MaterialiProgetto, type InfissiProgetto } from "../../../shared/planimetrie/materialiProgetto.ts";
import { floorSurfacePhoto } from "../../../shared/render-references/floorReferences.ts";
import { normalizeRoomFloorConfig } from "../../../shared/render-room/roomRenderConfig.ts";
import { ROOM_VISUAL_LABELS } from "../../../shared/render-references/roomVisualCatalog.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

export function MaterialiProgetto({ documento, ambito, planimetriaId, versione, solaLettura }: { documento: Planimetria; ambito: string; planimetriaId: string; versione: number; solaLettura: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [bozza, setBozza] = useState<MaterialiProgetto>({});
  const salva = useSalvaVersionePlanimetria();
  const comuni = materialiDelProgetto(documento, ambito);
  const apri = () => { setBozza(structuredClone(comuni)); setAperto(true); };
  const salvaScelte = async () => {
    try {
      await salva.mutateAsync({ planimetriaId, versioneAttesa: versione, documento: { ...documento, materialiProgetto: { ...documento.materialiProgetto, [ambito]: bozza } }, nota: "Materiali comuni a tutte le stanze e viste" });
      toast.success("Materiali salvati per tutto il progetto"); setAperto(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Materiali non salvati: riprova."); }
  };
  return <section aria-label="Materiali comuni del progetto" className="rounded-2xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Paintbrush className="h-4 w-4 text-primary" />Materiali comuni del progetto</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Scegli una volta pavimento e infissi. Il 3D, i render delle stanze e le viste esterne seguono queste scelte.</p></div><Button variant="outline" size="sm" onClick={apri} disabled={solaLettura}>Scegli materiali comuni</Button></div>
    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p><strong>Pavimento:</strong> {comuni.pavimento ? descrizionePavimento(comuni.pavimento) : "Da scegliere · ogni stanza usa le proprie finiture"}</p><p><strong>Infissi:</strong> {comuni.infissi ? `${PROFILI_PROGETTO[comuni.infissi.profilo]} · ${COLORI_INFISSI_PROGETTO[comuni.infissi.colore].nome}` : "Da scegliere · mantieni quelli esistenti"}</p></div>
    <Dialog open={aperto} onOpenChange={(v) => { if (!salva.isPending) setAperto(v); }}><DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Una scelta, in tutte le stanze</DialogTitle><DialogDescription>I materiali vengono salvati in questa pianta e in questo stato del progetto, anche per gli altri piani. Le dimensioni delle finestre restano quelle disegnate.</DialogDescription></DialogHeader>
      <fieldset disabled={salva.isPending} className="space-y-5"><legend className="mb-2 text-sm font-semibold">Pavimento comune</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PAVIMENTI_STANZA.map((c) => { const floor = pavimentoDaCampione(c.id); const photo = floorSurfacePhoto(normalizeRoomFloorConfig(floor as unknown as Record<string, unknown>))?.entry; const selected = bozza.pavimento?.colore_nome === c.nome; return <button key={c.id} type="button" aria-pressed={selected} onClick={() => setBozza({ ...bozza, pavimento: floor })} className={`overflow-hidden rounded-lg border text-left ${selected ? "border-primary ring-2 ring-primary" : "border-border"}`}><div className="aspect-[4/3] overflow-hidden bg-muted">{photo && <ReferenceThumb photo={photo} alt="" />}</div><span className="block p-2 text-xs font-medium">{c.nome}</span></button>; })}</div>
        {bozza.pavimento && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-xs">Formato (cm)<input className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={bozza.pavimento.formato_piastrella ?? ""} onChange={(e) => setBozza({ ...bozza, pavimento: cambiaFormatoPavimento(bozza.pavimento!, e.target.value) })} /></label>{(["pattern", "finitura"] as const).map((key) => <label key={key} className="text-xs">{key === "pattern" ? "Posa" : "Finitura"}<select className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={bozza.pavimento?.[key]} onChange={(e) => setBozza({ ...bozza, pavimento: { ...bozza.pavimento!, [key]: e.target.value } })}>{Object.entries(ROOM_VISUAL_LABELS[key === "pattern" ? "floor_pattern" : "floor_finish"]).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>)}<label className="text-xs">Colore<input aria-label="Colore del pavimento comune" type="color" className="mt-1 h-10 w-full rounded-md border bg-background" value={bozza.pavimento.colore_hex} onChange={(e) => setBozza({ ...bozza, pavimento: { ...bozza.pavimento!, colore_hex: e.target.value } })} /></label></div>}
        <Button variant="ghost" size="sm" onClick={() => setBozza({ ...bozza, pavimento: undefined })}>Usa le finiture proprie di ogni stanza</Button>
        <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">Infissi comuni</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Materiale del profilo<select aria-label="Materiale degli infissi comuni" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={bozza.infissi?.profilo ?? "esistenti"} onChange={(e) => setBozza({ ...bozza, infissi: e.target.value === "esistenti" ? undefined : { profilo: e.target.value as InfissiProgetto["profilo"], colore: bozza.infissi?.colore ?? "bianco" } })}><option value="esistenti">Mantieni gli infissi esistenti</option>{Object.entries(PROFILI_PROGETTO).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{bozza.infissi && <label className="text-xs">Finitura<select aria-label="Finitura degli infissi comuni" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={bozza.infissi.colore} onChange={(e) => setBozza({ ...bozza, infissi: { ...bozza.infissi!, colore: e.target.value as InfissiProgetto["colore"] } })}>{Object.entries(COLORI_INFISSI_PROGETTO).map(([id, c]) => <option key={id} value={id}>{c.nome}</option>)}</select></label>}</div>{bozza.infissi && <div className="flex items-center gap-3"><div className="h-20 w-24 overflow-hidden rounded border"><ReferenceThumb photo={PROJECT_WINDOW_PHOTOS[bozza.infissi.profilo]} alt={`Campione profilo ${PROFILI_PROGETTO[bozza.infissi.profilo]}`} /></div><span className="h-10 w-10 rounded border" style={{ backgroundColor: COLORI_INFISSI_PROGETTO[bozza.infissi.colore].hex }} aria-label={COLORI_INFISSI_PROGETTO[bozza.infissi.colore].nome} /></div>}<p className="text-xs text-muted-foreground">Stesso profilo e stessa finitura in ogni vista. Larghezza, altezza, ante e posizione restano proprie di ciascuna finestra.</p></div>
        <Button onClick={salvaScelte} className="w-full gap-2"><Save className="h-4 w-4" />{salva.isPending ? "Salvo i materiali…" : "Salva per tutto il progetto"}</Button>
      </fieldset>
    </DialogContent></Dialog>
  </section>;
}
