import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { apriElaboratoUrbanistico } from "@/lib/planimetrie/fontiUrbanistiche";
import { CampoUrbanistico as Campo, FonteLink } from "./InterventoUrbanistico";
import { TavolaInterattiva } from "./TavolaInterattiva";
import type { Livello, Planimetria } from "../../../shared/planimetrie/modello.ts";
import { RUOLI_TAVOLA, type FonteUrbanistica, type InquadramentoTavola } from "../../../shared/planimetrie/urbanistica.ts";

function inquadratura(piano: Livello): InquadramentoTavola {
  if (piano.ricalco) return { livelloId:piano.id, pagina:1, larghezzaCm:piano.ricalco.larghezzaCm, x:piano.ricalco.x, y:piano.ricalco.y };
  const punti = piano.fatto.muri.flatMap(m=>[m.p1,m.p2]).concat(piano.fatto.locali.flatMap(l=>l.contorno));
  if (!punti.length) return {livelloId:piano.id,pagina:1,larghezzaCm:1000,x:0,y:500};
  const x = Math.min(...punti.map(p=>p.x));
  return {livelloId:piano.id,pagina:1,larghezzaCm:Math.max(1,Math.round(Math.max(...punti.map(p=>p.x))-x)),
    x:Math.round(x),y:Math.round(Math.max(...punti.map(p=>p.y)))};
}

type Props = {
  documento: Planimetria;
  fonti: FonteUrbanistica[];
  companyId: string;
  planimetriaId: string;
  varianteId: string;
  onAllinea?: (fonteId: string, inquadramento: InquadramentoTavola) => void;
};

export function ConfrontoTavoleFascicolo({fonti,apertoIniziale,...props}: Props & {apertoIniziale?: boolean}) {
  const tavole = fonti.filter(f=>f.ruoloTavola);
  const confronto = useRef<HTMLDetailsElement>(null);
  const [fonteId,setFonteId] = useState(apertoIniziale ? tavole.find(f=>f.allegato)?.id ?? "" : "");
  const fonte = tavole.find(f=>f.id===fonteId);
  useEffect(()=>{
    if (!apertoIniziale) return;
    const avvio = requestAnimationFrame(()=>confronto.current?.scrollIntoView({block:"start"}));
    return ()=>cancelAnimationFrame(avvio);
  },[apertoIniziale]);
  return <details ref={confronto} open={apertoIniziale || undefined} className="scroll-mt-12 rounded-xl border bg-card p-3 sm:p-4">
    <summary className="cursor-pointer text-sm font-semibold"><Layers className="mr-2 inline size-4 text-primary" aria-hidden="true"/>Confronta rilievo, titolo edilizio e catasto</summary>
    <div className="mt-3 space-y-3">
      <Campo nome="Elaborato da confrontare"><UniformSelect value={fonte?.id ?? ""} onChange={e=>setFonteId(e.target.value)}>
        <option value="">Scegli una tavola collegata</option>
        {tavole.map(f=><option key={f.id} value={f.id}>{RUOLI_TAVOLA[f.ruoloTavola!]} · {f.titolo}</option>)}
      </UniformSelect></Campo>
      {!tavole.length && <p className="text-sm text-muted-foreground">In «Collega un elaborato» scegli il ruolo della tavola e allega il PDF.</p>}
      {fonte && <p className="text-xs text-muted-foreground">{fonte.ente} · {fonte.versione ? `Riferimento ${fonte.versione} · ` : ""}Acquisito il {fonte.acquisitaIl}
        {fonte.url && <span className="ml-2"><FonteLink url={fonte.url}>Apri la fonte</FonteLink></span>}</p>}
      {fonte && !fonte.allegato && <p className="text-sm text-muted-foreground">Allega il PDF di questo elaborato per sovrapporlo al disegno.</p>}
      {fonte?.allegato && <AnteprimaElaborato key={fonte.id+":"+fonte.allegato.percorso} fonte={fonte} {...props}/>}
    </div>
  </details>;
}

function AnteprimaElaborato({documento,companyId,planimetriaId,varianteId,fonte,onAllinea}: Omit<Props,"fonti"> & {fonte:FonteUrbanistica}) {
  const [allineamento,setAllineamento] = useState<InquadramentoTavola>(()=>
    fonte.inquadramento && documento.livelli.some(l=>l.id===fonte.inquadramento!.livelloId)
      ? fonte.inquadramento : inquadratura(documento.livelli[0]));
  const [progetto,setProgetto] = useState(false);
  const [opacita,setOpacita] = useState(45);
  const [blob,setBlob] = useState<Blob>();
  const [immagine,setImmagine] = useState<{url:string;proporzione:number;pagina:number;pagine:number}>();
  const [errore,setErrore] = useState("");
  const piano = documento.livelli.find(p=>p.id===allineamento.livelloId) ?? documento.livelli[0];
  const haProgetto = piano.proposte.some(p=>p.id===varianteId);
  const pagina = allineamento.pagina;
  const percorso = fonte.allegato!.percorso;
  useEffect(()=>{
    const abort = new AbortController();
    async function leggi() {
      try {
        const url = await apriElaboratoUrbanistico(companyId,planimetriaId,percorso);
        if (abort.signal.aborted) return;
        const response = await fetch(url,{signal:abort.signal});
        if (!response.ok) throw new Error("Elaborato non disponibile.");
        const file = await response.blob();
        if (!abort.signal.aborted) setBlob(file);
      } catch {
        if (!abort.signal.aborted) setErrore("Il PDF collegato non è disponibile.");
      }
    }
    void leggi();
    return ()=>abort.abort();
  },[companyId,planimetriaId,percorso]);
  useEffect(()=>{
    if (!blob) return;
    let annullata = false, url = "";
    async function disegna(file: Blob) {
      try {
        const { conPaginePdf } = await import("./editor/paginaPdf");
        const { immagine, proporzione, pagine } = await conPaginePdf(file,1800,async carica=>{
          const {canvas,pagine} = await carica(pagina);
          if (pagina > pagine) return {immagine:null,proporzione:0,pagine};
          const immagine = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
          return {immagine,proporzione:canvas.height/canvas.width,pagine};
        });
        if (annullata) return;
        if (!immagine) throw new Error(`Il PDF contiene ${pagine} ${pagine===1 ? "pagina" : "pagine"}. Scegli una pagina valida.`);
        url = URL.createObjectURL(immagine);
        setErrore("");
        setImmagine({url,proporzione,pagine,pagina});
      } catch(e) {
        if (!annullata) setErrore(e instanceof Error ? e.message : "Anteprima del PDF non disponibile.");
      }
    }
    void disegna(blob);
    return ()=>{annullata=true; if(url) URL.revokeObjectURL(url);};
  },[blob,pagina]);
  const pronta = immagine?.pagina===pagina ? immagine : undefined;
  const numerico = (campo: "pagina" | "larghezzaCm" | "x" | "y" | "rotazione", min: number, max: number) => ({
    type:"number", value:allineamento[campo] ?? 0, min, max, step:campo==="pagina" ? 1 : "any",
    onChange:(e:React.ChangeEvent<HTMLInputElement>)=>{
      const n = e.target.valueAsNumber;
      if (!Number.isFinite(n)) return;
      if (campo === "pagina" && n !== pagina) setErrore("");
      setAllineamento(a=>({...a,[campo]:campo==="pagina" ? Math.max(1,Math.floor(n)) : n}));
    },
  });
  const valido = allineamento.larghezzaCm>0 && allineamento.larghezzaCm<=10_000_000
    && Math.abs(allineamento.x)<=10_000_000 && Math.abs(allineamento.y)<=10_000_000 && Math.abs(allineamento.rotazione ?? 0)<=360;
  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-3">
      <Campo nome="Piano da confrontare"><UniformSelect value={piano.id} onChange={e=>{
        const altro = documento.livelli.find(p=>p.id===e.target.value);
        if (altro) setAllineamento({...inquadratura(altro),pagina});
      }}>{documento.livelli.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</UniformSelect></Campo>
      <Campo nome="Disegno da confrontare"><UniformSelect value={progetto && haProgetto ? "progetto" : "fatto"} onChange={e=>setProgetto(e.target.value==="progetto")}>
        <option value="fatto">Stato di fatto</option>{haProgetto && <option value="progetto">Variante di progetto</option>}
      </UniformSelect></Campo>
      <Campo nome={pronta ? `Pagina PDF (di ${pronta.pagine})` : "Pagina PDF"}><Input aria-label="Pagina PDF" {...numerico("pagina",1,pronta?.pagine ?? 10000)}/></Campo>
    </div>
    <div className="overflow-hidden rounded-lg border">
      {pronta && opacita===100 ? <div className="flex h-[clamp(270px,45vh,440px)] justify-center bg-muted/25 p-2">
        <img src={pronta.url} alt={`PDF originale di ${fonte.titolo}, pagina ${pagina}`} className="min-w-0 max-w-full object-contain"/>
      </div> : <TavolaInterattiva key={piano.id} documento={documento} livelloId={piano.id} ambito={progetto && haProgetto ? "progetto:"+varianteId : "fatto"}
        className="h-[clamp(270px,45vh,440px)]" comandi
        sovrapposizione={pronta && valido ? { ...allineamento, url:pronta.url, altezzaCm:allineamento.larghezzaCm*pronta.proporzione,
          rotazione:allineamento.rotazione ?? 0, opacita:opacita/100 } : undefined}/>}
    </div>
    {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    {!errore && !pronta && <p role="status" className="text-sm text-muted-foreground">Carico la pagina del PDF…</p>}
    <div className="grid gap-3 sm:grid-cols-4">
      <Campo nome="Larghezza foglio (cm)"><Input {...numerico("larghezzaCm",1,10_000_000)}/></Campo>
      <Campo nome="Spostamento X (cm)"><Input {...numerico("x",-10_000_000,10_000_000)}/></Campo>
      <Campo nome="Spostamento Y (cm)"><Input {...numerico("y",-10_000_000,10_000_000)}/></Campo>
      <Campo nome="Rotazione (°)"><Input {...numerico("rotazione",-360,360)}/></Campo>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Campo nome={`Opacità tavola · ${opacita}%`}><input type="range" min="0" max="100" step="5" value={opacita} onChange={e=>setOpacita(Number(e.target.value))} className="w-48 accent-primary"/></Campo>
      <div className="flex gap-1">
        <Button type="button" variant={opacita===0 ? "secondary" : "ghost"} size="sm" onClick={()=>setOpacita(0)}>Disegno</Button>
        <Button type="button" variant={opacita>0 && opacita<100 ? "secondary" : "ghost"} size="sm" onClick={()=>setOpacita(45)}>Sovrapposti</Button>
        <Button type="button" variant={opacita===100 ? "secondary" : "ghost"} size="sm" onClick={()=>setOpacita(100)}>Originale</Button>
      </div>
      {onAllinea && <Button variant="outline" size="sm" disabled={!pronta || !valido}
        onClick={()=>onAllinea(fonte.id,allineamento)}>{fonte.inquadramento===allineamento ? "Allineamento in fascicolo" : "Registra l’allineamento"}</Button>}
    </div>
    <p className="text-xs text-muted-foreground">Allinea almeno due punti comuni usando una quota nota. Salva il fascicolo per ritrovare il confronto. La sovrapposizione serve a individuare differenze fra gli elaborati.</p>
  </div>;
}
