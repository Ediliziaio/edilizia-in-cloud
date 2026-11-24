import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vistaPerAnteprima } from "@/lib/planimetrie/anteprime";
import type { PosizioneSegnalazioneProgetto, SegnalazioneProgetto } from "@/lib/planimetrie/analisiProgetto";
import type { CorrezioneSullaTavola } from "@/lib/planimetrie/chatProgetto";
import { esportaSvg } from "@/lib/planimetrie/esporta/svg";
import { aperturaDaVerificare, lineaQuota, NOMI_APERTURE, puntoSullAsse, type SelezioneTavola } from "@/lib/planimetrie/verificaTavola";
import { distanza, distanzaDalContorno, puntoInterno, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { Muro, Planimetria, Punto, Ricalco, StatoPianta } from "../../../shared/planimetrie/modello.ts";
import type { TracciatoEsodo } from "../../../shared/planimetrie/urbanistica.ts";
import type { RiscontroDwg } from "../../../shared/planimetrie/controlloDwg.ts";
import { ZoneRadiantiSvg } from "./ZoneRadiantiSvg";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const ZOOM = [1,1.35,1.8,2.35];
const SCALA = 50;
const MARGINE_MM = 6;
const MQ = new Intl.NumberFormat(intlCampo(),{maximumFractionDigits:1});
const puntiSvg=(contorno: Punto[])=>contorno.map(p=>`${p.x},${p.y}`).join(" ");
const centroDelTratto = ({ da, a }: CorrezioneSullaTavola["tratto"]) => ({
  x: (da.x + a.x) / 2, y: -(da.y + a.y) / 2,
});
interface VerificaDisegno {
  stato: StatoPianta;
  selezione: SelezioneTavola | null;
  ricalco?: {url: string; dati: Ricalco; opacita: number};
  puntoQuota?: Punto;
  superficieDaLocalizzare?: { punto: Punto; etichetta: string };
  onSeleziona: (selezione: SelezioneTavola) => void;
  onPunto?: (punto: Punto) => void;
}

function posizioneEtichetta(contorno: Punto[]) {
  let centro=puntoInterno(contorno);
  if (!centro) return null;
  const xs=contorno.map(p=>p.x), ys=contorno.map(p=>p.y);
  const minX=Math.min(...xs), minY=Math.min(...ys);
  const larghezza=Math.max(...xs)-minX, altezza=Math.max(...ys)-minY;
  let margine=distanzaDalContorno(centro,contorno);
  // Cerca una posizione centrale anche nei locali a L e nei contorni CAD irregolari.
  const campioni=[0.5,0.3,0.7,0.1,0.9];
  for (const x of campioni) for (const y of campioni) {
    const punto={x:minX+x*larghezza,y:minY+y*altezza};
    if (!puntoNelPoligono(punto,contorno)) continue;
    const distanza=distanzaDalContorno(punto,contorno);
    if (distanza>margine || (x===0.5 && y===0.5 && distanza===margine)) {
      centro=punto;
      margine=distanza;
    }
  }
  return {centro,larghezza,margine};
}

export function TavolaInterattiva({ documento, livelloId, ambito, selezionato, evidenzaLocali, evidenzaMuri, evidenzaDemolizioni, muroSelezionato, segnalazione, correzioni, onSeleziona, onPunto, esodo, verifica, controlloDwg, sovrapposizione, statoImpianti, comandi, className }: {
  documento: Planimetria; livelloId: string; ambito: string; selezionato?: string;
  evidenzaLocali?: readonly string[]; evidenzaMuri?: readonly string[]; evidenzaDemolizioni?: readonly Muro[]; muroSelezionato?: Muro;
  segnalazione?: SegnalazioneProgetto | null;
  correzioni?: { elementi: readonly CorrezioneSullaTavola[]; prima: boolean };
  onSeleziona?: (localeId: string) => void;
  onPunto?: (punto: Punto) => void;
  esodo?: { tracciati: readonly TracciatoEsodo[]; daRinnovare?: boolean };
  verifica?: VerificaDisegno;
  controlloDwg?: RiscontroDwg;
  sovrapposizione?: { url: string; x: number; y: number; larghezzaCm: number; altezzaCm: number; opacita: number; rotazione: number };
  statoImpianti?: StatoPianta;
  comandi?: boolean; className?: string;
}) {
  const tr = useT();
  const [indiceZoom,setIndiceZoom]=useState(0);
  const [mostraRadiante, setMostraRadiante] = useState(false);
  const idFrecciaEsodo = useId().replaceAll(":", "");
  const registraPunto = onPunto ?? verifica?.onPunto;
  const mostraQuote=!!verifica;
  const disegno=useMemo(()=>{
    const vista=vistaPerAnteprima(documento,livelloId,ambito);
    if (!mostraQuote) vista.quote=vista.quote.filter(q=>q.origine!=="da_documento");
    const {svg,scena}=esportaSvg(vista,{stile:"presentazione",scala:SCALA,margineMm:MARGINE_MM,quoteAutomatiche:false,etichetteLocali:false,sfondo:"trasparente"});
    const margine=MARGINE_MM*SCALA/10;
    const r=scena.riquadro;
    const x=r.minX-margine,y=r.minY-margine,w=Math.max(1,r.maxX-r.minX+2*margine),h=Math.max(1,r.maxY-r.minY+2*margine);
    const locali=vista.locali.flatMap(l=>{
      const etichetta=posizioneEtichetta(l.contorno);
      return etichetta ? [{...l,...etichetta}] : [];
    });
    const risalto=new Set(evidenzaMuri);
    const muri=risalto.size ? vista.muri.filter(m=>risalto.has(m.id)) : [];
    const haDisegno=!!(vista.muri.length || vista.locali.length || vista.aree?.length || vista.elementi.length || vista.quote.length);
    return {x,y,w,h,locali,muri,haDisegno,src:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`};
  },[documento,livelloId,ambito,evidenzaMuri,mostraQuote]);
  const {x,y,w,h,locali,muri,haDisegno,src}=disegno;
  const selezione=locali.find(l=>l.id===selezionato);
  const marcatori=useMemo(()=>verifica ? marcatoriVerifica(verifica.stato) : [],[verifica?.stato]);
  const marcatore=marcatori.find(m=>m.id===verifica?.selezione?.id && m.tipo===verifica?.selezione?.tipo);
  const superficie = verifica?.superficieDaLocalizzare;
  const puntoSuperficie = superficie && {x: superficie.punto.x, y: -superficie.punto.y};
  const trattoDwg = controlloDwg?.tratti[0];
  const puntoDwg = trattoDwg && {x:(trattoDwg.a.x+trattoDwg.b.x)/2, y:-(trattoDwg.a.y+trattoDwg.b.y)/2};
  const zoom=ZOOM[indiceZoom];
  const vw=w/zoom,vh=h/zoom;
  const centroMuro = muroSelezionato && {x:(muroSelezionato.p1.x+muroSelezionato.p2.x)/2,y:-(muroSelezionato.p1.y+muroSelezionato.p2.y)/2};
  const posizione = segnalazione?.posizione?.livelloId === livelloId ? segnalazione.posizione : undefined;
  const tratto = posizione?.tratto;
  const localeSegnalato = locali.find(l => posizione?.locali?.includes(l.id));
  const primoPunto = posizione?.punti?.[0];
  const puntoSegnalato = tratto ? centroDelTratto(tratto) : primoPunto ? { x: primoPunto.x, y: -primoPunto.y } : localeSegnalato?.centro;
  const coloreSegnalazione = segnalazione?.priorita === "problema" ? "#b91c1c" : "#9a4d0e";
  const centro = puntoDwg ?? puntoSuperficie ?? puntoSegnalato ?? centroMuro ?? selezione?.centro ?? {x:x+w/2,y:y+h/2};
  const cx=marcatore ? (marcatore.a.x+marcatore.b.x)/2 : centro.x;
  const cy=marcatore ? -(marcatore.a.y+marcatore.b.y)/2 : centro.y;
  const vx=Math.min(x+w-vw,Math.max(x,cx-vw/2)),vy=Math.min(y+h-vh,Math.max(y,cy-vh/2));
  const corpo=Math.max(14,Math.min(34,Math.max(w,h)/72));
  if (!haDisegno) return <div className={cn("grid min-h-52 place-items-center bg-muted/30 p-5 text-center text-sm text-muted-foreground",className)}>{tr("Disegno da completare")}</div>;

  return <div className={cn("relative isolate min-w-0 overflow-hidden bg-[#f8fafc] dark:bg-slate-200",className)}>
    <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true"
      style={{backgroundImage:"radial-gradient(#adbace 0.75px, transparent 0.75px)",backgroundSize:"16px 16px"}}/>
    <svg role="group" aria-label={tr("Tavola della planimetria")} viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={cn("relative block h-full min-h-[inherit] w-full p-4 sm:p-6",registraPunto && "cursor-crosshair")}
      onClick={registraPunto ? (e:MouseEvent<SVGSVGElement>)=>{
        const matrice=e.currentTarget.getScreenCTM();
        if (!matrice) return;
        const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrice.inverse());
        registraPunto({x:Math.round(p.x*100)/100,y:Math.round(-p.y*100)/100});
      } : undefined}>
      <image href={src} x={x} y={y} width={w} height={h} pointerEvents="none" />
      {mostraRadiante && statoImpianti && <ZoneRadiantiSvg stato={statoImpianti} />}
      {verifica?.ricalco && verifica.ricalco.opacita>0 && <image href={verifica.ricalco.url}
        x={verifica.ricalco.dati.x} y={-verifica.ricalco.dati.y} width={verifica.ricalco.dati.larghezzaCm}
        height={verifica.ricalco.dati.larghezzaCm*verifica.ricalco.dati.proporzione} opacity={verifica.ricalco.opacita}
        preserveAspectRatio="none" pointerEvents="none"/>}
      {sovrapposizione && sovrapposizione.opacita>0 && <image href={sovrapposizione.url} opacity={sovrapposizione.opacita}
        x={sovrapposizione.x} y={-sovrapposizione.y} width={sovrapposizione.larghezzaCm} height={sovrapposizione.altezzaCm}
        transform={`rotate(${-sovrapposizione.rotazione} ${sovrapposizione.x} ${-sovrapposizione.y})`} preserveAspectRatio="none" pointerEvents="none"/>}
      {locali.map(l=>{
        const attivo=l.id===selezionato;
        const proposta=evidenzaLocali?.includes(l.id);
        const segnalato=posizione?.locali?.includes(l.id);
        const massimo=Math.max(5,Math.min(24,Math.floor(l.larghezza/corpo*1.82)));
        const nome=l.nome.length>massimo ? l.nome.slice(0,massimo-1)+"…" : l.nome;
        const mq=l.superficieMq && l.larghezza>corpo*7 && l.margine>corpo*1.4 ? `${l.origine==="stimata" ? "≈ " : ""}${MQ.format(l.superficieMq)} m²` : null;
        return <g key={l.id}>
          <polygon points={puntiSvg(l.contorno)} role={onSeleziona ? "button" : undefined} tabIndex={onSeleziona ? 0 : undefined}
            aria-label={onSeleziona ? tr("Seleziona {nome} sulla tavola", { nome: String(l.nome ?? "") }) : undefined} aria-pressed={onSeleziona ? attivo : undefined}
            className={cn("transition-colors focus-visible:outline-none",onSeleziona && "cursor-pointer hover:fill-blue-400/15 focus-visible:stroke-blue-700 focus-visible:stroke-2",
              segnalato ? "fill-red-500/10 stroke-red-700" : proposta ? "fill-teal-500/20 stroke-teal-700" : attivo ? "fill-blue-500/20 stroke-blue-600" : "fill-transparent stroke-transparent")}
            vectorEffect="non-scaling-stroke" strokeWidth={attivo || proposta || segnalato ? 2 : 1}
            onClick={onSeleziona ? ()=>onSeleziona(l.id) : undefined}
            onKeyDown={onSeleziona ? e=>{if(e.key==="Enter" || e.key===" "){e.preventDefault();onSeleziona(l.id);}} : undefined} />
          {l.larghezza>corpo*3.7 && l.margine>corpo*.8 && <g pointerEvents="none" textAnchor="middle" fontFamily="system-ui, sans-serif">
            <text x={l.centro.x} y={l.centro.y-(mq ? corpo*.12 : 0)} dominantBaseline="central" fontSize={corpo} fontWeight={700} fill="#243349"
              stroke="#fff" strokeWidth={corpo*.13} paintOrder="stroke">{nome}</text>
            {mq && <text x={l.centro.x} y={l.centro.y+corpo} dominantBaseline="central" fontSize={corpo*.8} fontWeight={550} fill="#425572"
              stroke="#fff" strokeWidth={corpo*.13} paintOrder="stroke">{mq}</text>}
          </g>}
        </g>;
      })}
      {muri.map(m=><line key={m.id} x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y}
        stroke="#04796a" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none"/>)}
      {evidenzaDemolizioni?.map(m=><line key={m.id} x1={m.p1.x} y1={-m.p1.y} x2={m.p2.x} y2={-m.p2.y}
        stroke="#b45309" strokeWidth={3} strokeDasharray="6 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none"/>)}
      {muroSelezionato && <line x1={muroSelezionato.p1.x} y1={-muroSelezionato.p1.y} x2={muroSelezionato.p2.x} y2={-muroSelezionato.p2.y}
        stroke="#1d4ed8" strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
      {posizione && puntoSegnalato && <MarcatoreSegnalazione etichetta={posizione.etichetta} punto={puntoSegnalato}
        tratto={tratto} colore={coloreSegnalazione} corpo={corpo} />}
      {posizione?.punti?.slice(1).map((p,i)=><circle key={i} cx={p.x} cy={-p.y} r={corpo * .33} fill={coloreSegnalazione}
        stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none"/>)}
      {correzioni?.elementi.map(c => <MarcatoreSegnalazione key={c.tipo + ":" + c.id}
        etichetta={correzioni.prima ? c.prima : c.dopo} punto={centroDelTratto(c.tratto)}
        tratto={{ ...c.tratto, tratteggiato: correzioni.prima }} corpo={corpo}
        colore={correzioni.prima ? (c.tipo === "ripristina-apertura" ? "#b91c1c" : "#9a4d0e") : "#04796a"} />)}
      {esodo && <g pointerEvents="none" color={esodo.daRinnovare ? "#b45309" : "#087567"}>
        <defs><marker id={idFrecciaEsodo} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3" markerHeight="3" orient="auto">
          <path d="M0 0 L10 5 L0 10 Z" fill="currentColor"/>
        </marker></defs>
        {esodo.tracciati.map((t,i)=>t.punti.length>0 && <g key={i} role="img" aria-label={tr("Tracciato d’esodo · {nome}", { nome: String(t.nome ?? "") })}>
          <polyline points={t.punti.map(p=>`${p.x},${-p.y}`).join(" ")} fill="none" stroke="white" strokeWidth={7}
            strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          <polyline points={t.punti.map(p=>`${p.x},${-p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth={3.5}
            strokeDasharray={esodo.daRinnovare ? "6 4" : undefined} strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke" markerEnd={`url(#${idFrecciaEsodo})`}/>
          <circle cx={t.punti[0].x} cy={-t.punti[0].y} r={corpo*.28} fill="currentColor" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke"/>
        </g>)}
      </g>}
      {verifica && marcatori.map(m=><MarcatoreVerifica key={m.tipo+":"+m.id} marcatore={m}
        attivo={m.id===marcatore?.id && m.tipo===marcatore.tipo} onSeleziona={verifica.onPunto ? undefined : verifica.onSeleziona}/>)}
      {verifica?.puntoQuota && <circle cx={verifica.puntoQuota.x} cy={-verifica.puntoQuota.y}
        r={corpo*.28} fill="#1d4ed8" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
      {superficie && puntoSuperficie && <MarcatoreSegnalazione etichetta={superficie.etichetta}
        punto={puntoSuperficie} colore="#9a4d0e" corpo={corpo}/>}
      {controlloDwg && <RiscontroDwgSullaTavola riscontro={controlloDwg} corpo={corpo}/>}
    </svg>
    {!!statoImpianti?.pavimentoRadiante?.length && <Button size="sm" variant={mostraRadiante ? "secondary" : "outline"}
      className="absolute bottom-3 left-3 bg-white shadow-sm" aria-pressed={mostraRadiante} onClick={() => setMostraRadiante(v => !v)}>{tr("Pavimento radiante")}</Button>}
    {comandi && <div role="group" aria-label={tr("Zoom della tavola")} className="absolute bottom-3 right-3 flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-slate-700 shadow-sm">
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Riduci zoom")} disabled={!indiceZoom} onClick={()=>setIndiceZoom(i=>i-1)}><Minus className="h-4 w-4"/></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Adatta la tavola")} disabled={!indiceZoom} onClick={()=>setIndiceZoom(0)}><Maximize className="h-4 w-4"/></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={tr("Aumenta zoom")} disabled={indiceZoom===ZOOM.length-1} onClick={()=>setIndiceZoom(i=>i+1)}><Plus className="h-4 w-4"/></Button>
    </div>}
  </div>;
}

function RiscontroDwgSullaTavola({ riscontro, corpo }: { riscontro: RiscontroDwg; corpo: number }) {
  const t = useT();
  const disegna = (contorno: Punto[]) => contorno.map(({x, y}) => `${x},${-y}`).join(" ");
  return <g role="img" aria-label={riscontro.modifica ? t("Contorno prima e dopo sul DWG") : t("Sovrapposizione sul DWG")} pointerEvents="none">
    {riscontro.modifica && <>
      <polygon points={disegna(riscontro.modifica.dopo)} fill="#15a674" fillOpacity={0.12}
        stroke="#08795f" strokeWidth={2.5} vectorEffect="non-scaling-stroke"/>
      <polygon points={disegna(riscontro.modifica.prima)} fill="none"
        stroke="#245cca" strokeWidth={2.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>
    </>}
    {riscontro.tratti.map(({a, b}, i) => <g key={i}>
      <line x1={a.x} y1={-a.y} x2={b.x} y2={-b.y}
        stroke="#b45309" strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
      <circle cx={(a.x+b.x)/2} cy={-(a.y+b.y)/2} r={corpo*.43} fill="#fef3c7"
        stroke="#b45309" strokeWidth={2} vectorEffect="non-scaling-stroke"/>
    </g>)}
  </g>;
}

function MarcatoreSegnalazione({ etichetta, punto, tratto, colore, corpo }: {
  etichetta: string; punto: Punto; tratto?: PosizioneSegnalazioneProgetto["tratto"]; colore: string; corpo: number;
}) {
  const t = useT();
  return <g role="img" aria-label={t("Segnalazione sulla tavola · {etichetta}", { etichetta: String(etichetta ?? "") })} pointerEvents="none">
    {tratto && <line x1={tratto.da.x} y1={-tratto.da.y} x2={tratto.a.x} y2={-tratto.a.y}
      stroke={colore} strokeWidth={5} strokeDasharray={tratto.tratteggiato ? "7 4" : undefined}
      strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
    <circle cx={punto.x} cy={punto.y} r={corpo * .33} fill={colore}
      stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke"/>
    <text x={punto.x} y={punto.y - corpo * .85} fill={colore} textAnchor="middle"
      fontSize={corpo * 1.15} fontWeight={750} stroke="white" strokeWidth={corpo * .22} paintOrder="stroke">{etichetta}</text>
  </g>;
}

interface Marcatore extends SelezioneTavola {
  nome: string;
  a: Punto;
  b: Punto;
  stimata: boolean;
}

function marcatoriVerifica(stato: StatoPianta): Marcatore[] {
  const muri=new Map(stato.muri.filter(m=>m.stato!=="da_demolire").map(m=>[m.id,m]));
  const aperture=stato.aperture.flatMap((a,i)=>{
    const muro=muri.get(a.muroId);
    if (!muro || a.stato==="da_demolire") return [];
    return [{
      id:a.id,tipo:"apertura" as const,nome:`${NOMI_APERTURE[a.tipo]} ${i+1}`,
      a:puntoSullAsse(muro,a.offset),b:puntoSullAsse(muro,a.offset+a.larghezza),stimata:aperturaDaVerificare(a),
    }];
  });
  const quote=stato.quote.map((q,i)=>{
    const [a,b]=lineaQuota(q);
    return {id:q.id,tipo:"quota" as const,nome:`Quota ${i+1} · ${MQ.format(distanza(q.p1,q.p2))} cm`,a,b,stimata:q.origine==="stimata"};
  });
  return [...quote,...aperture];
}

function MarcatoreVerifica({marcatore,attivo,onSeleziona}: {
  marcatore:Marcatore; attivo:boolean; onSeleziona?:(v:SelezioneTavola)=>void;
}) {
  const t = useT();
  const {a,b,tipo,id,nome,stimata}=marcatore;
  const linea={x1:a.x,y1:-a.y,x2:b.x,y2:-b.y};
  const scegli=()=>onSeleziona?.({tipo,id});
  const tasto=(e:KeyboardEvent<SVGGElement>)=>{
    if (e.key!=="Enter" && e.key!==" ") return;
    e.preventDefault();
    scegli();
  };
  return <g role={onSeleziona ? "button" : undefined} tabIndex={onSeleziona ? 0 : undefined}
    aria-label={onSeleziona ? t("Seleziona {nome} sulla tavola", { nome: String(nome ?? "") }) : undefined} aria-pressed={onSeleziona ? attivo : undefined}
    onClick={onSeleziona ? scegli : undefined} onKeyDown={onSeleziona ? tasto : undefined}
    className={cn("group focus-visible:outline-none",onSeleziona && "cursor-pointer")}>
    <circle cx={(a.x+b.x)/2} cy={-(a.y+b.y)/2} r={tipo==="quota" ? 10 : 16} fill="transparent"/>
    <line {...linea} stroke="transparent" strokeWidth={tipo==="quota" ? 11 : 20} vectorEffect="non-scaling-stroke"/>
    <line {...linea} stroke={attivo ? "#1d4ed8" : tipo==="quota" ? "#475569" : stimata ? "#b45309" : "#0f766e"}
      strokeWidth={attivo ? 4.5 : tipo==="quota" ? 1.1 : 3.5} strokeLinecap="round"
      strokeDasharray={tipo==="quota" && !attivo ? "3 3" : undefined} vectorEffect="non-scaling-stroke"
      className="group-hover:stroke-blue-600 group-focus-visible:stroke-blue-700" pointerEvents="none"/>
  </g>;
}
