import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { unitaDellEdificio } from "@/lib/planimetrie/unita";
import { percorsoVariantePlanimetria } from "@/lib/planimetrie/render/percorsi";
import { ambitiDi, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import type { FonteUrbanistica, PraticaImmobiliare } from "../../../shared/planimetrie/urbanistica.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const STATI: Record<PraticaImmobiliare["stato"],string> = {bozza:"Bozza",presentata:"Presentata",integrazione:"Integrazione richiesta",conclusa:"Conclusa"};
const nuova = (varianteId: string): PraticaImmobiliare => ({
  id:"",titolo:"",stato:"bozza",protocollo:"",responsabile:"",varianteId,nota:"",unita:[],fonti:[],
});
const cambiaSelezione = (attuale: string[], valore: string, aggiungi: boolean) => aggiungi ? [...new Set([...attuale,valore])] : attuale.filter(x=>x!==valore);

export function PratichePlanimetria({ documento, planimetriaId, fonti, pratiche, variante, prossimaVersione, unita, solaLettura, onModifica, onApriAllegato }: {
  documento: Planimetria; planimetriaId: string; fonti: FonteUrbanistica[]; pratiche: PraticaImmobiliare[]; variante: string; prossimaVersione: number; unita?: string;
  solaLettura: boolean; onModifica: (pratiche: PraticaImmobiliare[]) => void; onApriAllegato: (allegato: string) => void;
}) {
  const t = useT();
  const uid=useId();
  const [form,setForm]=useState(()=>nuova(variante));
  const [aperta,setAperta]=useState(false);
  const [errore,setErrore]=useState("");
  const set=(valore:Partial<PraticaImmobiliare>)=>setForm(f=>({...f,...valore}));
  const disponibili = unitaDellEdificio(documento,form.varianteId ? `progetto:${form.varianteId}` : "fatto");
  const varianti=ambitiDi(documento).filter(v=>v.propostaId);
  const visibili=pratiche.filter(p=>(!variante || !p.varianteId || p.varianteId===variante) && (!unita || !p.unita.length || p.unita.includes(unita)));
  const salva = () => {
    if (!form.titolo.trim()) return setErrore(t("Indica il nome della pratica."));
    if (form.stato!=="bozza" && (!form.protocollo.trim() || !form.presentataIl)) return setErrore(t("Indica protocollo e data di presentazione."));
    if (form.scadenza && form.presentataIl && form.scadenza<form.presentataIl) return setErrore(t("Controlla la scadenza della pratica."));
    if (!form.id && pratiche.length>=30) return setErrore(t("Puoi registrare fino a 30 pratiche in questa planimetria."));
    const prima = pratiche.find(p=>p.id===form.id);
    const versione = prima?.varianteId===form.varianteId ? prima.versione ?? prossimaVersione : prossimaVersione;
    const p={...form,id:form.id || crypto.randomUUID(),versione,titolo:form.titolo.trim(),protocollo:form.protocollo.trim(),responsabile:form.responsabile.trim(),nota:form.nota.trim()};
    onModifica([...pratiche.filter(x=>x.id!==p.id),p]);
    setAperta(false);
    setErrore("");
  };
  return <div className="space-y-3">
    {unita && <p className="text-sm text-muted-foreground">{t("Pratiche per l’unità {unita}", { unita: String(unita ?? "") })}</p>}
    {visibili.length ? <ul className="divide-y rounded-lg border">{visibili.map(p=><li key={p.id} className="space-y-1.5 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{p.titolo}</p><span className="rounded-full bg-muted px-2 py-1 text-xs">{t(STATI[p.stato])}</span></div>
      <p className="text-xs text-muted-foreground">{[
        p.protocollo && t("Protocollo {protocollo}", { protocollo: p.protocollo }),p.presentataIl && t("Presentata il {data}", { data: p.presentataIl }),p.scadenza && t("Scadenza {data}", { data: p.scadenza }),p.responsabile,
        varianti.find(v=>v.propostaId===p.varianteId)?.nome,p.versione && t("Planimetria v{versione}", { versione: p.versione }),p.unita.length ? t("Unità {sigla}", { sigla: p.unita.join(", ") }) : t("Immobile"),
      ].filter(Boolean).join(" · ")}</p>
      {p.versione && p.versione<prossimaVersione && <Link target="_blank" rel="noreferrer" className="inline-block text-xs font-medium text-primary hover:underline"
        to={percorsoVariantePlanimetria({planimetriaId,versione:p.versione,varianteId:p.varianteId})}>{t("Apri la tavola della pratica")}</Link>}
      {p.nota && <p className="whitespace-pre-wrap">{p.nota}</p>}
      <ul className="space-y-1">{p.fonti.map(id=>{
        const f=fonti.find(x=>x.id===id);
        if (!f) return <li className="text-muted-foreground" key={id}>{t("Elaborato disponibile nella revisione precedente")}</li>;
        return <li key={id} className="flex flex-wrap items-center gap-2">
          {f.url ? <a className="text-primary hover:underline" href={f.url} target="_blank" rel="noreferrer">{f.titolo}</a> : <span>{f.titolo}</span>}
          {f.allegato && <Button size="sm" variant="outline" onClick={()=>onApriAllegato(f.allegato!.percorso)}>{t("Apri PDF")}</Button>}
        </li>;
      })}</ul>
      {!solaLettura && <Button variant="ghost" size="sm" onClick={()=>{setForm(p);setAperta(true);setErrore("");}}>{t("Modifica pratica")}</Button>}
    </li>)}</ul> : <p className="rounded-lg border p-3 text-sm text-muted-foreground">{t("Nessuna pratica collegata. Puoi associare gli elaborati già presenti in «Fonti e atti».")}</p>}
    {!solaLettura && !aperta && <Button variant="outline" size="sm" onClick={()=>{setForm({...nuova(variante),unita:unita ? [unita] : []});setAperta(true);}}>{t("Aggiungi pratica")}</Button>}
    {!solaLettura && aperta && <div className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">{form.id ? t("Modifica pratica") : t("Nuova pratica")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label className="space-y-1.5"><span>{t("Nome della pratica")}</span><Input value={form.titolo} maxLength={240} placeholder={t("Es. SCIA")} onChange={e=>set({titolo:e.target.value})}/></Label>
        <Label className="space-y-1.5"><span>{t("Variante di riferimento")}</span><UniformSelect value={form.varianteId} onChange={e=>set({varianteId:e.target.value,unita:[]})}>
          <option value="">{t("Immobile")}</option>{varianti.map(v=><option key={v.chiave} value={v.propostaId!}>{v.nome}</option>)}
        </UniformSelect></Label>
        <Label className="space-y-1.5"><span>{t("Stato della pratica")}</span><UniformSelect value={form.stato} onChange={e=>set({stato:e.target.value as PraticaImmobiliare["stato"]})}>
          {Object.entries(STATI).map(([k,v])=><option value={k} key={k}>{v}</option>)}
        </UniformSelect></Label>
        <Label className="space-y-1.5"><span>{t("Numero di protocollo")}</span><Input value={form.protocollo} maxLength={100} onChange={e=>set({protocollo:e.target.value})}/></Label>
        <Label className="space-y-1.5"><span>{t("Data di presentazione")}</span><Input type="date" value={form.presentataIl ?? ""} onChange={e=>set({presentataIl:e.target.value || undefined})}/></Label>
        <Label className="space-y-1.5"><span>{t("Scadenza o integrazione entro il")}</span><Input type="date" value={form.scadenza ?? ""} onChange={e=>set({scadenza:e.target.value || undefined})}/></Label>
      </div>
      <Label className="block space-y-1.5"><span>{t("Responsabile")}</span><Input value={form.responsabile} maxLength={240} onChange={e=>set({responsabile:e.target.value})}/></Label>
      {!!disponibili.length && <fieldset className="flex flex-wrap gap-3"><legend className="mb-1.5 text-sm font-medium">{t("Unità interessate")}</legend>
        {disponibili.map((u,i)=><div className="flex items-center gap-2" key={u.sigla}><Checkbox id={uid+"unita"+i} checked={form.unita.includes(u.sigla)} onCheckedChange={v=>set({unita:cambiaSelezione(form.unita,u.sigla,v===true)})}/><Label htmlFor={uid+"unita"+i}>{t("Unità {sigla}", { sigla: String(u.sigla ?? "") })}</Label></div>)}
      </fieldset>}
      {!!fonti.length && <fieldset className="space-y-2"><legend className="mb-1.5 text-sm font-medium">{t("Elaborati da collegare")}</legend>
        {fonti.map((f,i)=><div className="flex items-center gap-2" key={f.id}><Checkbox id={uid+"fonte"+i} checked={form.fonti.includes(f.id)} onCheckedChange={v=>set({fonti:cambiaSelezione(form.fonti,f.id,v===true)})}/><Label htmlFor={uid+"fonte"+i}>{f.titolo}</Label></div>)}
      </fieldset>}
      <Label className="block space-y-1.5"><span>{t("Integrazioni ed esiti")}</span><Textarea maxLength={2000} value={form.nota} onChange={e=>set({nota:e.target.value})}/></Label>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <div className="flex gap-2"><Button size="sm" onClick={salva}>{form.id ? t("Aggiorna pratica") : t("Registra pratica")}</Button><Button variant="ghost" size="sm" onClick={()=>setAperta(false)}>{t("Annulla modifica")}</Button></div>
    </div>}
  </div>;
}
