import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { CampoUrbanistico as Campo, FonteLink } from "./InterventoUrbanistico";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import {
  firmaRiscontroTecnico, muriPortantiModificati, RISCONTRI_TECNICI,
  type DatiUrbanistici, type RiscontroTecnico, type TipoRiscontroTecnico,
} from "../../../shared/planimetrie/urbanistica.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type ControlloTecnico = Exclude<TipoRiscontroTecnico, "esodo">;
const INDICAZIONI: Record<ControlloTecnico,string> = {
  struttura: "Riporta numero o pagina della relazione, intervento ammesso e condizioni del tecnico.",
  percorso: "Descrivi l’accesso dalla strada, i cancelli e il percorso fino agli ingressi. Indica i piani collegati da scale o ascensori.",
  manovra: "Indica il locale, lo spazio libero misurato e l’ingombro delle porte o delle dotazioni.",
  elettrico: "Riporta circuiti, carichi, sezioni e protezioni dallo schema allegato.",
  scarichi: "Riporta locale, colonna, diametri, lunghezza, quote di innesto e pendenza disponibile.",
};
const chiave = (r: Pick<RiscontroTecnico,"varianteId"|"livelloId"|"criterio"|"muroId">) =>
  JSON.stringify([r.varianteId,r.livelloId,r.criterio,r.muroId]);
const vuoto = { fonteId:"", tecnico:"", riferimento:"", esito:"riscontrato" } as const;

export function RiscontriTecnici({ documento, dati, varianteId, oggi, criterioIniziale, livelloIniziale, onModifica, onFonti, onPdf }: {
  documento: Planimetria;
  dati: DatiUrbanistici;
  varianteId: string;
  oggi: string;
  criterioIniziale?: ControlloTecnico;
  livelloIniziale?: string;
  onModifica?: (riscontri: RiscontroTecnico[]) => void;
  onFonti: () => void;
  onPdf: (percorso: string) => void;
}) {
  const t = useT();
  const piani = documento.livelli.filter(p=>p.proposte.some(v=>v.id===varianteId));
  const [livelloId,setLivelloId] = useState(piani.find(p=>p.id===livelloIniziale)?.id ?? piani[0]?.id ?? "");
  const [criterio,setCriterio] = useState<ControlloTecnico>(criterioIniziale ?? "percorso");
  const [muroId,setMuroId] = useState("");
  const [campi,setCampi] = useState<Pick<RiscontroTecnico,"fonteId"|"tecnico"|"riferimento"|"esito">>(vuoto);
  const [errore,setErrore] = useState("");
  const piano = piani.find(p=>p.id===livelloId);
  const muri = piano && criterio==="struttura" ? muriPortantiModificati(piano,varianteId) : [];
  const richiedeRelazione = criterio==="struttura" || criterio==="elettrico";
  const fonti = richiedeRelazione ? dati.fonti.filter(f=>f.tipo==="relazione" && (criterio!=="elettrico" || f.allegato || f.url)) : dati.fonti;
  const tutti = dati.riscontriTecnici ?? [];
  const pertinenti = tutti.filter(r=>r.varianteId===varianteId && r.criterio!=="esodo");
  const registra = () => {
    const base = { varianteId, livelloId, criterio, ...campi, ...(criterio==="struttura" ? {muroId} : {}),
      tecnico:campi.tecnico.trim(), riferimento:campi.riferimento.trim(), data:oggi };
    if (!base.tecnico || !base.riferimento) return setErrore(t("Indica il tecnico e descrivi il riscontro."));
    const firma = firmaRiscontroTecnico(documento,base,dati);
    if (!firma) return setErrore(criterio==="struttura" ? t("Seleziona la parete modificata e collega la relazione strutturale.")
      : criterio==="elettrico" ? t("Collega lo schema o la relazione elettrica con un PDF o un link.")
      : t("Seleziona il piano e una fonte disponibile."));
    const altri = tutti.filter(r=>chiave(r)!==chiave(base));
    if (altri.length>=200) return setErrore(t("Sono già presenti 200 riscontri in questo fascicolo."));
    onModifica?.([...altri,{...base,firma}]);
    setCampi(vuoto);
    setErrore("");
  };
  const cambiaOggetto = () => { setCampi(vuoto); setErrore(""); };
  if (!piani.length) return null;
  return <section aria-label={t("Riscontri tecnici")} className="space-y-3 rounded-xl border bg-card p-3 sm:p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="size-4 text-primary" aria-hidden="true"/>{t("Riscontri tecnici della variante")}</h3>
    {pertinenti.length > 0 && <ul className="divide-y rounded-lg border">
      {pertinenti.map(r=>{
        const attuale = firmaRiscontroTecnico(documento,r,dati)===r.firma;
        const fonte = dati.fonti.find(f=>f.id===r.fonteId);
        return <li key={chiave(r)} className="space-y-1 px-3 py-2 text-sm">
          <div className="flex flex-wrap justify-between gap-1">
            <p className="font-medium">{RISCONTRI_TECNICI[r.criterio]} · {piani.find(p=>p.id===r.livelloId)?.nome ?? t("Piano rimosso")}</p>
            <span className={attuale && r.esito==="riscontrato" ? "text-muted-foreground" : "text-amber-800 dark:text-amber-200"}>
              {attuale ? r.esito==="riscontrato" ? t("Riscontro registrato") : t("Criticità registrata") : t("Da rinnovare sulla versione attuale")}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{r.riferimento}</p>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{r.tecnico} · {r.data}</span>
            {fonte?.url ? <FonteLink url={fonte.url}>{fonte.titolo}</FonteLink> : fonte?.titolo}
            {fonte?.allegato && <Button size="sm" variant="link" className="h-6 px-1" onClick={()=>onPdf(fonte.allegato!.percorso)}>{t("Apri PDF")}</Button>}
            {onModifica && <Button size="sm" variant="ghost" className="h-6 px-1" onClick={()=>{
              if (r.criterio === "esodo") return;
              setLivelloId(r.livelloId); setMuroId(r.muroId ?? ""); setCriterio(r.criterio);
              setCampi({fonteId:r.fonteId,tecnico:r.tecnico,riferimento:r.riferimento,esito:r.esito}); setErrore("");
            }}>{t("Rivedi riscontro")}</Button>}
            {onModifica && <Button size="sm" variant="ghost" className="h-6 px-1" onClick={()=>onModifica(tutti.filter(x=>x!==r))}>{t("Rimuovi riscontro")}</Button>}
          </div>
        </li>;
      })}
    </ul>}
    {onModifica && <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo nome={t("Controllo tecnico")}><UniformSelect value={criterio} onChange={e=>{setCriterio(e.target.value as ControlloTecnico);setMuroId("");cambiaOggetto();}}>
          {Object.keys(INDICAZIONI).map(k=><option key={k} value={k}>{RISCONTRI_TECNICI[k as ControlloTecnico]}</option>)}
        </UniformSelect></Campo>
        <Campo nome={t("Piano del riscontro")}><UniformSelect value={livelloId} onChange={e=>{setLivelloId(e.target.value);setMuroId("");cambiaOggetto();}}>
          {piani.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
        </UniformSelect></Campo>
        {criterio==="struttura" && <Campo nome={t("Parete portante modificata")}><UniformSelect value={muroId} onChange={e=>setMuroId(e.target.value)}>
          <option value="">{muri.length ? t("Scegli la parete") : t("Nessuna modifica portante sul piano")}</option>
          {muri.map(m=><option key={m.id} value={m.id}>{t("Parete {id} · {spessore} cm", { id: m.id.slice(0,12), spessore: String(m.spessore ?? "") })}</option>)}
        </UniformSelect></Campo>}
        <Campo nome={criterio==="struttura" ? t("Relazione strutturale") : criterio==="elettrico" ? t("Schema o relazione elettrica") : t("Fonte del riscontro (facoltativa)")}>
          <UniformSelect value={campi.fonteId} onChange={e=>setCampi(c=>({...c,fonteId:e.target.value}))}>
            <option value="">{richiedeRelazione ? t("Scegli l’elaborato") : t("Rilievo riportato nella nota")}</option>
            {fonti.map(f=><option key={f.id} value={f.id}>{f.titolo}</option>)}
          </UniformSelect>
        </Campo>
        <Campo nome={t("Tecnico del riscontro")}><Input maxLength={160} value={campi.tecnico} onChange={e=>setCampi(c=>({...c,tecnico:e.target.value}))}/></Campo>
        <Campo nome={t("Esito del riscontro")}><UniformSelect value={campi.esito} onChange={e=>setCampi(c=>({...c,esito:e.target.value as RiscontroTecnico["esito"]}))}>
          <option value="riscontrato">{t("Riscontro favorevole")}</option><option value="criticita">{t("Criticità da risolvere")}</option>
        </UniformSelect></Campo>
      </div>
      <Campo nome={t("Nota e misure del riscontro")}><Textarea maxLength={1500} value={campi.riferimento} onChange={e=>setCampi(c=>({...c,riferimento:e.target.value}))}/></Campo>
      <p className="text-xs text-muted-foreground">{t(INDICAZIONI[criterio])}</p>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={registra}>{t("Registra riscontro")}</Button>
        {richiedeRelazione && <Button type="button" variant="ghost" size="sm" onClick={onFonti}>{t("Vai alle fonti e agli atti")}</Button>}
      </div>
    </div>}
  </section>;
}
