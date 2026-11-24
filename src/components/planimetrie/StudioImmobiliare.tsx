import { FabbisognoMateriali } from "./FabbisognoMateriali";
import { PrevisioneLavori } from "./PrevisioneLavori";
import { previsioneLavori } from "@/lib/planimetrie/previsioneLavori";
import { CorreggiPrezzoLavorazione } from "./CorreggiPrezzoLavorazione";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Bath, Calculator, ChevronRight, CookingPot, Files, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { leggiComputoCloud } from "@/lib/computo/cloudComputo";
import { differenzeLavorazioni, idComputoStudio, importiLavorazioni, percorsoMisuraSullaPianta, studioVariante } from "@/lib/planimetrie/studioImmobiliare";
import { apriComputoDaVariante } from "@/lib/planimetrie/computoDaVariante";
import { useFontiPrezzi } from "@/lib/planimetrie/fontiPrezzi";
import { conPrezziProposti, tipiDaCercare } from "@/lib/planimetrie/prezziProposti";
import { accessiDellaVariante } from "@/lib/planimetrie/accessiPlanimetria";
import { useSalvaVersionePlanimetria, useVersionePlanimetria, useVersioniPlanimetria } from "@/lib/planimetrie/archivio";
import { percorsoVariantePlanimetria, percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { ambitiDi, eAmbienteInterno, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import { verificaUrbanisticaAperta } from "../../../shared/planimetrie/urbanistica.ts";
import { ComputoStudioInCommessa } from "./ComputoStudioInCommessa";
import { TavolaInterattiva } from "./TavolaInterattiva";
import { AccessiProposta } from "./AccessiProposta";
import { SpostaBagnoDialog } from "./SpostaBagnoDialog";
import { localiPerSpostamento } from "@/lib/planimetrie/spostamentoBagno";
import { localiPerSpostareCucina } from "@/lib/planimetrie/spostamentoCucina";
import { SpostaCucinaDialog } from "./SpostaCucinaDialog";

const num = (n: number) => n.toLocaleString("it-IT", {maximumFractionDigits:2});
const sup = (n: number) => `${num(n)} m²`;
const euro = new Intl.NumberFormat("it-IT", {style:"currency",currency:"EUR"});

export function StudioImmobiliare({ documento, companyId, planimetriaId, versione, livelloId, orderId, varianteIniziale, onApriSilvio, onFascicolo, onVarianteSalvata }: {
  documento: Planimetria; companyId: string; planimetriaId: string; versione: number; livelloId: string; orderId: string | null;
  varianteIniziale?: string; onApriSilvio?: (ambito: string) => void; onFascicolo?: (ambito: string) => void;
  onVarianteSalvata?: (ambito: string, livelloId: string, versione: number) => void;
}) {
  const { user, effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const varianti = ambitiDi(documento).filter(v => v.propostaId !== null);
  const [variante, setVariante] = useState(varianteIniziale && varianti.some(v => v.propostaId === varianteIniziale) ? varianteIniziale : varianti[0]?.propostaId ?? "");
  const [confronto, setConfronto] = useState(() => {
    const base = documento.livelli.flatMap(l => l.proposte).find(p => p.id === variante)?.alternativaDi;
    return base && varianti.some(v => v.propostaId === base) ? base : "fatto";
  });
  const studioGrezzo = useMemo(() => variante ? studioVariante(documento,variante) : null,[documento,variante]);
  const bilocali = documento.livelli.some(l => l.proposte.some(p => p.id === variante && p.distribuzioneBilocali));
  const altroGrezzo = useMemo(() => confronto !== variante ? studioVariante(documento,confronto === "fatto" ? null : confronto) : null,[documento,confronto,variante]);
  // Le voci senza prezzo nascono quotate (listino dell'azienda, prezzario di zona, prezzo indicativo): solo per chi vede gli importi.
  const tipiPrezzi = useMemo(() => tipiDaCercare([...(studioGrezzo?.righe ?? []), ...(altroGrezzo?.righe ?? [])]),[studioGrezzo,altroGrezzo]);
  const { fonti: fontiPrezzi } = useFontiPrezzi(companyId, tipiPrezzi, permessi.canViewPreventivi && effectiveCompany?.id === companyId);
  const studio = useMemo(() => studioGrezzo && permessi.canViewPreventivi ? { ...studioGrezzo, righe: conPrezziProposti(studioGrezzo.righe, fontiPrezzi) } : studioGrezzo,[studioGrezzo,fontiPrezzi,permessi.canViewPreventivi]);
  const altro = useMemo(() => altroGrezzo && permessi.canViewPreventivi ? { ...altroGrezzo, righe: conPrezziProposti(altroGrezzo.righe, fontiPrezzi) } : altroGrezzo,[altroGrezzo,fontiPrezzi,permessi.canViewPreventivi]);
  const accessi = useMemo(()=>accessiDellaVariante(documento,variante),[documento,variante]);
  const [computi, setComputi] = useState<Record<string,string>>({});
  const [occupato, setOccupato] = useState(false);
  const [spostaBagno, setSpostaBagno] = useState(false);
  const [spostaCucina, setSpostaCucina] = useState(false);
  const salvaVersione = useSalvaVersionePlanimetria();
  const [errore,setErrore] = useState("");
  const [mostraRevisioni,setMostraRevisioni] = useState(false);
  const [revisioneConfronto,setRevisioneConfronto] = useState<number>();
  const [versioniRiprese,setVersioniRiprese] = useState<Record<string,number>>({});
  const inCorso = useRef(false);
  const titolo = varianti.find(v => v.propostaId === variante)?.nome ?? "Variante";
  const abilitata = effectiveCompany?.id === companyId && !!user?.id && !permessi.solaLettura;
  const puoComputo = abilitata && permessi.canEditPreventivi;
  // Il prezzo corretto a mano va nel listino dell'azienda: vale anche per le altre piante.
  const puoCorreggerePrezzi = puoComputo && permessi.canViewPreventivi;
  const puoSimulare = abilitata && (permessi.isAdmin || permessi.canViewMargins);
  const fonte = { planimetriaId, versione, varianteId:variante };
  const bozzaEsistente = useQuery({
    queryKey:["computo-studio",companyId,planimetriaId,versione,variante],
    enabled:abilitata && (permessi.canViewPreventivi || puoComputo) && !!variante,
    queryFn:async()=>{
      const id = await idComputoStudio(fonte);
      return await leggiComputoCloud(companyId,id) ? id : null;
    },
  });
  const idBozza = computi[variante] || bozzaEsistente.data;
  const aperte = verificaUrbanisticaAperta(documento.urbanistica,variante,versione);
  const revisioni = useVersioniPlanimetria(mostraRevisioni ? planimetriaId : null);
  const precedenti = revisioni.data?.filter(r=>r.numero<versione) ?? [];
  const versioneConfronto = revisioneConfronto ?? precedenti[0]?.numero;
  const precedente = useVersionePlanimetria(mostraRevisioni ? planimetriaId : null,versioneConfronto);
  const differenze = useMemo(()=>{
    const d = precedente.data?.documento;
    if (!mostraRevisioni || !studio || !d?.livelli.some(l=>l.proposte.some(p=>p.id===variante))) return null;
    return differenzeLavorazioni(studioVariante(d,variante).righe,studio.righe);
  },[precedente.data,mostraRevisioni,studio,variante]);
  const salva = async () => {
    if (!studio?.righe.length || !puoComputo || !user || inCorso.current) return;
    inCorso.current = true;
    setOccupato(true);
    setErrore("");
    try {
      const { id, precedente } = await apriComputoDaVariante(companyId,user.id,fonte);
      if (precedente) setVersioniRiprese(p=>({...p,[variante]:precedente}));
      setComputi(p => ({ ...p, [variante]:id }));
    } catch (e) { setErrore(e instanceof Error ? e.message : "Computo non disponibile."); }
    finally { inCorso.current = false; setOccupato(false); }
  };
  const percorsoSimulatore = (modello: "sviluppo" | "compravendita") => `/azienda/ordini/simulatore?${new URLSearchParams({ planimetria:planimetriaId, versione:String(versione), variante, modello })}`;
  const piano = documento.livelli.find(l=>l.id===livelloId) ?? documento.livelli[0];
  const opzioniBagno = localiPerSpostamento(piano);
  const puoSpostareBagno = !!onVarianteSalvata && opzioniBagno.destinazioni.some(d => opzioniBagno.origini.some(o => o.id !== d.id));
  const opzioniCucina = localiPerSpostareCucina(piano,variante || undefined);
  const puoSpostareCucina = !!onVarianteSalvata && opzioniCucina.origini.length > 0 && opzioniCucina.destinazioni.length > 0;
  const localiDaRivedere = [...new Set([...(studio?.bagniDaRivedere ?? []), ...(studio?.cucineDaRivedere ?? [])])];
  const badgeQuantita = studio?.righe.filter(r => r.quantita === null).length ?? 0;
  const riscontriDwgAperti = documento.livelli.flatMap(livello => (livello.controlloDwg ?? []).flatMap(r =>
    r.stato === "da_rivedere" && r.modifica && studio?.righe.some(voce =>
      voce.livelloId === livello.id && voce.riferimento?.tipo === "locale" && voce.riferimento.id === r.modifica.localeId)
      ? [{ livello, riscontro: r }] : []));
  const primoRiscontroDwg = riscontriDwgAperti[0];
  const nome = (id: string) => id==="fatto" ? "Stato di fatto" : varianti.find(v=>v.propostaId===id)?.nome ?? "Variante";
  const metriche = useMemo(()=>{
    return [variante,confronto].map(id=>{
      const locali = documento.livelli.flatMap(l=>l.proposte.find(p=>p.id===id)?.locali ?? l.fatto.locali).filter(eAmbienteInterno);
      return {superficie:locali.reduce((m,l)=>m+areaPoligono(l.contorno)/10_000,0),ambienti:locali.length};
    });
  },[documento,variante,confronto]);
  const colonne: Array<{etichetta:string; formatta?:(n:number)=>string; valori:[number|null,number|null]; parziale?:boolean}> = [
    {etichetta:"Superficie interna netta",formatta:sup,valori:[metriche[0].superficie,metriche[1].superficie]},
    {etichetta:"Ambienti",valori:[metriche[0].ambienti,metriche[1].ambienti]},
    {etichetta:"Lavorazioni",valori:[studio?.righe.length ?? 0,altro?.righe.length ?? 0]},
  ];
  if (studio?.muriMq || altro?.muriMq) colonne.push({etichetta:"Ingombro dei nuovi tramezzi",formatta:sup,valori:[studio?.muriMq??0,altro?.muriMq??0]});
  if (studio?.unita.length || altro?.unita.length) {
    colonne.push({etichetta:"Unità assegnate",valori:[studio?.unita.length??0,altro?.unita.length??0]});
    colonne.push({etichetta:"Parti comuni interne",formatta:sup,valori:[studio?.comuni??0,altro?.comuni??0]});
    if (studio?.esterniComuni || altro?.esterniComuni) colonne.push({etichetta:"Spazi comuni esterni e cavedi",formatta:sup,valori:[studio?.esterniComuni??0,altro?.esterniComuni??0]});
    if (studio?.senzaUnita || altro?.senzaUnita) colonne.push({etichetta:"Superficie da assegnare",formatta:sup,valori:[studio?.senzaUnita??0,altro?.senzaUnita??0]});
  }
  // Costo completo e durata delle due soluzioni a confronto: solo a chi vede i prezzi.
  const previsioni = useMemo(() => [studio, altro].map(s => s?.righe.length && permessi.canViewPreventivi ? previsioneLavori(s.righe) : null),
    [studio, altro, permessi.canViewPreventivi]);
  const importoVariante = importiLavorazioni(studio?.righe ?? []);
  const importoConfronto = importiLavorazioni(altro?.righe ?? []);
  const costiParziali = [importoVariante, importoConfronto].some(i => i.daQuotare || i.daMisurare);
  if (studio?.righe.length || altro?.righe.length) {
    colonne.push({etichetta:"Importo delle voci valorizzate",formatta:euro.format,
      valori:[studio?.righe.length ? importoVariante.importo : null,altro?.righe.length ? importoConfronto.importo : null],parziale:costiParziali});
    colonne.push({etichetta:"Voci da quotare",valori:[importoVariante.daQuotare,importoConfronto.daQuotare]});
    colonne.push({etichetta:"Quantità da completare",valori:[importoVariante.daMisurare,importoConfronto.daMisurare]});
    const indicative = (s: typeof studio) => s?.righe.filter(r => r.quantita !== null && r.stimata).length ?? 0;
    const valoriIndicativi: [number,number] = [indicative(studio),indicative(altro)];
    if (valoriIndicativi.some(Boolean)) colonne.push({etichetta:"Quantità indicative",valori:valoriIndicativi});
    // Confronto fra due soluzioni: non basta l'importo dei lavori, servono il costo con gli
    // extra (cantiere, pratica, sicurezza, imprevisti) e i giorni. Stesse regole del pannello.
    if (previsioni.some(p => p && p.lavori > 0)) {
      colonne.push({etichetta:"Costo previsto, con i costi in più",formatta:euro.format,
        valori:[previsioni[0]?.totale ?? null,previsioni[1]?.totale ?? null],parziale:costiParziali});
      colonne.push({etichetta:"Durata prevista in giorni",valori:[previsioni[0]?.giorniCalendario ?? null,previsioni[1]?.giorniCalendario ?? null]});
    }
  }
  const statoVerifica = (id: string) => id === "fatto" ? "—"
    : verificaUrbanisticaAperta(documento.urbanistica,id,versione) ? "Da completare" : "Verificate sulla fonte";

  const selezionaVariante = (valore: string) => {
    setErrore("");
    if (valore===confronto) setConfronto(variante || "fatto");
    setVariante(valore);
  };
  const tavola = (id: string, intestazione: ReactNode) => {
    const muri=piano.proposte.find(p=>p.id===id)?.muri;
    const muriNuovi=muri?.filter(m=>m.stato==="nuovo").map(m=>m.id);
    const demolizioni=muri?.filter(m=>m.stato==="da_demolire");
    const esito = id === "fatto" || id === variante ? studio : altro;
    const localiInEvidenza = [...(esito?.bagni ?? []), ...(esito?.cucine ?? [])].filter(b => b.livelloId === piano.id)
      .map(b => id === "fatto" ? b.origine.id : b.nuovo.id);
    const fonteTavola = {planimetriaId,versione,varianteId:id === "fatto" ? "" : id};
    return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <figcaption className="flex min-h-[66px] flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        {intestazione}
        <div className="space-y-1 text-right text-xs text-muted-foreground">
          <p>{piano.nome}</p>
          {!!muriNuovi?.length && <p className="flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-200"><span className="h-0.5 w-3 rounded bg-teal-700" aria-hidden="true"/>Nuove pareti</p>}
          {!!demolizioni?.length && <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200"><span className="w-3 border-t-2 border-dashed border-amber-700" aria-hidden="true"/>Da demolire</p>}
        </div>
      </figcaption>
      <TavolaInterattiva key={livelloId+":"+id} documento={documento} ambito={id==="fatto" ? "fatto" : "progetto:"+id} livelloId={piano.id} comandi
        className="h-[clamp(245px,39vh,475px)]" evidenzaMuri={muriNuovi} evidenzaDemolizioni={demolizioni} evidenzaLocali={localiInEvidenza}/>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2">
        <Button asChild variant="outline" size="sm"><Link to={percorsoVariantePlanimetria(fonteTavola,{livello:piano.id})}>Tavola e 3D</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link to={percorsoVariantePlanimetria(fonteTavola,{livello:piano.id,esporta:"pdf"})}>Esporta PDF</Link></Button>
        <span className="ml-auto text-xs text-muted-foreground">v{versione}</span>
      </div>
    </figure>
    );
  };

  return <section aria-label="Studio immobiliare" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Studio immobiliare</h2>
        <p className="text-sm text-muted-foreground">Confronta il disegno, le superfici e le lavorazioni.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {puoSpostareBagno && <Button variant="outline" size="sm" onClick={() => setSpostaBagno(true)}><Bath className="h-4 w-4" />Sposta bagno</Button>}
        {puoSpostareCucina && <Button variant="outline" size="sm" onClick={() => setSpostaCucina(true)}><CookingPot className="h-4 w-4" />Sposta cucina</Button>}
        {onApriSilvio && <Button variant="outline" size="sm" className="gap-2" onClick={()=>onApriSilvio(variante ? "progetto:"+variante : "fatto")}>
          <Sparkles className="h-4 w-4 text-blue-700"/>{studio ? "Rivedi con Silvio" : "Proponi una variante con Silvio"}
        </Button>}
      </div>
    </div>
    {spostaBagno && onVarianteSalvata && <SpostaBagnoDialog key={piano.id} documento={documento} piano={piano} daVariante={piano.proposte.some(p => p.id === variante) ? variante : undefined}
      onChiudi={() => setSpostaBagno(false)} onSalva={async ({ documento:progetto, id }) => {
        const numero = await salvaVersione.mutateAsync({ planimetriaId, documento:progetto, versioneAttesa:versione, nota:"Spostamento bagno" });
        setSpostaBagno(false);
        onVarianteSalvata(`progetto:${id}`, piano.id, numero);
      }} />}
    {spostaCucina && onVarianteSalvata && <SpostaCucinaDialog key={piano.id} documento={documento} piano={piano} varianteId={variante || undefined}
      onChiudi={() => setSpostaCucina(false)} onSalva={async ({documento:progetto,id}) => {
        const numero = await salvaVersione.mutateAsync({ planimetriaId, documento:progetto, versioneAttesa:versione, nota:"Spostamento cucina" });
        setSpostaCucina(false);
        onVarianteSalvata(`progetto:${id}`,piano.id,numero);
      }} />}
    {!studio ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      {tavola("fatto",<p className="text-sm font-semibold">Stato di fatto</p>)}
      <div className="self-start rounded-2xl border bg-card p-4 shadow-sm">
        <span className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-muted"><Plus className="h-4 w-4"/></span>
        <h3 className="font-semibold">Prima variante</h3>
        <p className="mt-1 text-sm text-muted-foreground">Disegna una modifica nell’editor{onApriSilvio ? " o seleziona una stanza e chiedi una proposta a Silvio" : ""}.</p>
        <Button size="sm" variant="outline" asChild className="mt-3"><Link to={percorsiPlanimetrie.modifica(planimetriaId)}>Apri l’editor <ChevronRight className="ml-1 h-4 w-4"/></Link></Button>
      </div>
    </div> : <>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {tavola(variante,<div className="min-w-[10rem]">
          <Label className="text-xs text-muted-foreground" htmlFor="studio-variante">Variante di progetto</Label>
          <UniformSelect id="studio-variante" value={variante} onChange={e=>selezionaVariante(e.target.value)} className="mt-1 h-8">
            {varianti.map(v=><option key={v.chiave} value={v.propostaId!}>{v.nome}</option>)}
          </UniformSelect>
        </div>)}
        {tavola(confronto,<div className="min-w-[10rem]">
          <Label className="text-xs text-muted-foreground" htmlFor="studio-confronto">Confronta con</Label>
          <UniformSelect id="studio-confronto" value={confronto} onChange={e=>setConfronto(e.target.value)} className="mt-1 h-8">
            <option value="fatto">Stato di fatto</option>
            {varianti.filter(v=>v.propostaId!==variante).map(v=><option key={v.chiave} value={v.propostaId!}>{v.nome}</option>)}
          </UniformSelect>
        </div>)}
      </div>
      {studio.cucine.map(c => <section key={c.id} aria-label="Spostamento cucina" className="rounded-xl border bg-card px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><CookingPot className="h-4 w-4 text-primary" />Cucina spostata · {c.piano}</h3>
        <div className="mt-2 flex flex-wrap items-start gap-2.5 text-sm">
          <span><strong>{c.origine.nome}</strong> <span className="text-muted-foreground">({c.ex.nome.toLowerCase()} nel progetto)</span></span>
          <ArrowRight className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <span><strong>{c.nuovo.nome}</strong> · {sup(areaPoligono(c.nuovo.contorno)/10_000)}
            {c.prima && <span className="ml-1 text-muted-foreground">(prima {c.prima.nome})</span>}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{c.lunghezza ? `${num(c.lunghezza)} m di cucina lineare nella tavola` : "Composizione della cucina da posizionare"}</p>
      </section>)}
      {studio.bagni.map(b => <section key={b.id} aria-label="Spostamento bagno" className="rounded-xl border bg-card px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bath className="h-4 w-4 text-primary" />Bagno spostato · {b.piano}</h3>
        <div className="mt-2 flex flex-wrap items-start gap-2.5 text-sm">
          <span><strong>{b.origine.nome}</strong> · {sup(areaPoligono(b.origine.contorno) / 10_000)}<span className="ml-1 text-muted-foreground">({b.ex.nome.toLowerCase()} nel progetto)</span></span>
          <ArrowRight className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
          <span><strong>{b.nuovo.nome}</strong> · {sup(areaPoligono(b.nuovo.contorno) / 10_000)}{b.prima && <span className="ml-1 text-muted-foreground">(prima {b.prima.nome})</span>}</span>
        </div>
        {!!b.daPosizionare.length && <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">Da posizionare sulla pianta · {b.daPosizionare.join(", ")}</p>}
      </section>)}
      {!!localiDaRivedere.length && <p role="status" className="rounded-lg border border-amber-200 p-3 text-sm text-amber-800 dark:text-amber-200">
        Spostamento da rivedere su {localiDaRivedere.join(", ")}. Controlla i locali della variante prima di portare i costi nel computo.
      </p>}
      {!!studio.paretiDaRiscontrare.length && <p role="status" className="rounded-lg border border-amber-200 p-3 text-sm text-amber-800 dark:text-amber-200">
        {studio.paretiDaRiscontrare.length} {studio.paretiDaRiscontrare.length===1 ? "parete portante da riscontrare" : "pareti portanti da riscontrare"}.{" "}
        {onFascicolo && <button type="button" onClick={()=>onFascicolo("progetto:"+variante)} className="font-medium underline underline-offset-2">Apri il fascicolo</button>}
      </p>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b px-4 py-3"><Files className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">Differenze sull’intero immobile</h3></div>
          <div className="overflow-x-auto">
            <table aria-label="Confronto delle superfici e delle lavorazioni" className="w-full min-w-[370px] text-sm">
              <thead><tr className="border-b bg-muted/25 text-left text-xs font-medium text-muted-foreground"><th scope="col" className="px-4 py-2.5">Misura</th><th scope="col" className="px-3 py-2.5">{nome(variante)}</th><th scope="col" className="px-3 py-2.5">{nome(confronto)}</th><th scope="col" className="px-3 py-2.5">Differenza</th></tr></thead>
              <tbody className="divide-y">{colonne.map(({etichetta,formatta=num,valori,parziale})=>{
                const diff=valori[0] !== null && valori[1] !== null && !parziale ? Math.round((valori[0]-valori[1])*100)/100 : null;
                return <tr key={etichetta}><th scope="row" className="px-4 py-3 text-left font-medium">{etichetta}</th>
                  {valori.map((n,i)=><td key={i} className="whitespace-nowrap px-3 py-3 text-sm tabular-nums">{n === null ? "—" : formatta(n)}</td>)}
                  <td className="whitespace-nowrap px-3 py-3 text-sm font-medium tabular-nums text-muted-foreground">{diff ? (diff>0 ? "+" : "")+formatta(diff) : "—"}</td></tr>;
              })}
                <tr><th scope="row" className="px-4 py-3 text-left font-medium">Verifiche urbanistiche</th>
                  {[variante,confronto].map(id => <td key={id} className="px-3 py-3">{statoVerifica(id)}</td>)}
                  <td className="px-3 py-3 text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          {costiParziali && <p className="border-t px-4 py-2 text-xs text-muted-foreground">La differenza economica si calcola quando entrambe le soluzioni hanno quantità e prezzi completi.</p>}
          {!!studio.unita.length && <ul className="flex flex-wrap gap-2 border-t p-3" aria-label="Unità della variante">
            {studio.unita.map(u=><li key={u.sigla} className="rounded-md bg-blue-50 px-2.5 py-1.5 text-xs text-blue-950">Unità {u.sigla} · {sup(u.mqNetti)} netti · {sup(u.mqCommerciali)} commerciali</li>)}
          </ul>}
          {bilocali && !!studio.unita.length && <details className="border-t px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">Ambienti di ciascuna unità</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {studio.unita.map(u=><div key={u.sigla}>
                <h4 className="font-medium">Unità {u.sigla}</h4>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {u.locali.map(l=><li key={`${l.livelloId}:${l.id}`}>{l.nome} · {sup(l.mq)}</li>)}
                </ul>
              </div>)}
            </div>
          </details>}
          {(studio.scalaIncerta || studio.sovrapposti.length>0) && <div role="status" className="border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            {studio.scalaIncerta && <p>Scala o perimetri da verificare. Le superfici sono indicative.</p>}
            {studio.sovrapposti.map(s=><p key={s}>Perimetri sovrapposti · {s}</p>)}
          </div>}
        </div>
        <div className="space-y-3 self-start rounded-2xl border bg-card p-4 shadow-sm">
          <h3 id="computo-variante" className="flex scroll-mt-20 items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4 text-primary" />Computo della variante</h3>
          {primoRiscontroDwg && <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950" role="status">
            {riscontriDwgAperti.length === 1 ? "Un locale del computo ha un riscontro DWG aperto." : `${riscontriDwgAperti.length} riscontri DWG aperti sui locali del computo.`}{" "}
            <Link className="font-medium underline underline-offset-2" to={`/azienda/planimetrie/${planimetriaId}?${new URLSearchParams({
              versione: String(versione), sezione: "verifica", livello: primoRiscontroDwg.livello.id, riscontroDwg: primoRiscontroDwg.riscontro.id,
            })}`}>Controlla sulla tavola</Link>
          </p>}
          {studio.righe.length ? <>
            {!!badgeQuantita && <p className="text-xs text-muted-foreground">{studio.righe.length} lavorazioni · {badgeQuantita} quantità da completare</p>}
            <div className="max-h-64 overflow-auto" tabIndex={0} aria-label="Lavorazioni e quantità"><ul className="divide-y">
              {studio.righe.map(r=>{
                const percorso = percorsoMisuraSullaPianta(fonte,r);
                return <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-2 text-sm">
                <div><p className="font-medium">{r.descrizione}</p><p className="text-xs text-muted-foreground">{/* senza unità assegnate (un appartamento solo) «Parti comuni» confonde: si omette */}{studio.unita.length ? `${r.gruppo} · ` : ""}{r.fase} · {r.criterio}</p>
                  {r.prezzo && <p className="text-xs text-muted-foreground">{euro.format(r.prezzo.importo)}/{r.unita} · {r.prezzo.fonte}{r.prezzo.tariffa && ` · ${r.prezzo.tariffa}`}</p>}
                  {puoCorreggerePrezzi && <CorreggiPrezzoLavorazione companyId={companyId} riga={r} />}
                  {percorso && <Link to={percorso} className="text-xs font-medium text-primary underline-offset-2 hover:underline">Vedi sulla pianta</Link>}</div>
                <p className="whitespace-nowrap text-right text-xs tabular-nums">
                  {r.quantita === null ? <span className="text-amber-800 dark:text-amber-200">Da completare · {r.unita}</span> : <>{r.stimata && "≈ "}{num(r.quantita)} {r.unita}</>}
                </p>
              </li>;})}
            </ul></div>
          </> : <p className="text-sm text-muted-foreground">La variante non contiene ancora lavorazioni misurabili.</p>}
          {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          {aperte && <p className="text-xs text-amber-800 dark:text-amber-200">Computo preliminare · {onFascicolo ? <button type="button" onClick={()=>onFascicolo("progetto:"+variante)} className="underline underline-offset-2">verifiche aperte nel fascicolo</button> : "verifiche urbanistiche aperte"}</p>}
          {versioniRiprese[variante] && <p className="text-xs text-muted-foreground">Prezzi e correzioni ripresi dal computo della planimetria v{versioniRiprese[variante]}.</p>}
          {versione>1 && <details className="rounded-lg border p-2 text-xs" onToggle={e=>setMostraRevisioni(e.currentTarget.open)}>
            <summary className="cursor-pointer font-medium">Variazioni delle quantità tra revisioni</summary>
            <div className="mt-2 space-y-2">
              {!!precedenti.length && <Label className="flex flex-wrap items-center gap-2 text-xs">Confronta con
                <UniformSelect value={versioneConfronto} onChange={e=>setRevisioneConfronto(Number(e.target.value))} className="h-8">
                  {precedenti.map(p=><option value={p.numero} key={p.numero}>Versione {p.numero}</option>)}
                </UniformSelect></Label>}
              {mostraRevisioni && (revisioni.isLoading || precedente.isLoading) && <p role="status">Carico la revisione…</p>}
              {mostraRevisioni && (revisioni.isError || precedente.isError) && <p role="alert" className="text-destructive">Revisione non disponibile.</p>}
              {precedente.data && !differenze && <p>La variante non era ancora presente in questa revisione.</p>}
              {differenze?.length===0 && <p>Nessuna differenza nelle quantità generate.</p>}
              {!!differenze?.length && <ul className="max-h-44 divide-y overflow-auto" aria-label="Quantità cambiate">
                {differenze.map(({prima,dopo,delta})=>{
                  const r = dopo ?? prima!;
                  const mostra = (voce: typeof prima) => !voce ? "Assente" : voce.quantita===null ? "Da completare" : `${num(voce.quantita)} ${voce.unita}`;
                  return <li key={r.livelloId+":"+r.id} className="py-1.5">
                    <strong>{r.descrizione} · {r.piano}</strong>
                    <p className="tabular-nums">{mostra(prima)} → {mostra(dopo)}{delta===null ? "" : ` · ${delta>0 ? "+" : ""}${num(delta)} ${r.unita}`}</p>
                  </li>;
                })}
              </ul>}
            </div>
          </details>}
          <div className="flex flex-wrap gap-2">
            {permessi.canViewPreventivi && idBozza ? <Button asChild size="sm"><Link to={"/azienda/marketing/preventivi/computo?bozza="+idBozza+"&esistente=1&fase=3"}>Apri il computo modificabile</Link></Button> :
              puoComputo && !!studio.righe.length && (
              <Button size="sm" disabled={occupato || bozzaEsistente.isPending || !!localiDaRivedere.length} onClick={() => void salva()}>{occupato ? "Salvataggio…" : "Salva bozza di computo"}</Button>)}
            {orderId && idBozza && permessi.canViewOrders && <ComputoStudioInCommessa companyId={companyId} orderId={orderId}
              bozzaId={idBozza} puoSalvare={abilitata && permessi.canEditOrders && !permessi.solaLettura} />}
          </div>
        </div>
      </div>
      {/* Cambia con la variante: frazionare o spostare un tramezzo aggiorna i materiali. */}
      {permessi.canViewPreventivi && studio && <PrevisioneLavori key={variante} righe={studio.righe}
        fonte={orderId && variante ? { companyId, orderId, planimetriaId, versione, varianteId:variante, varianteNome:titolo } : null} />}
      <FabbisognoMateriali documento={documento} ambito={`progetto:${variante}`} titolo={`Materiali da comprare · ${varianti.find(v=>v.propostaId===variante)?.nome ?? "variante"}`} />
      <AccessiProposta accessi={accessi}/>
      {puoSimulare && !!studio.unita.length && !studio.sovrapposti.length && !localiDaRivedere.length && <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 text-sm font-medium">Business plan</p>
        <Button variant="outline" size="sm" asChild><Link to={percorsoSimulatore("sviluppo")}>Sviluppo immobiliare</Link></Button>
        <Button variant="outline" size="sm" asChild><Link to={percorsoSimulatore("compravendita")}>Compra, ristruttura, vendi</Link></Button>
      </div>}
    </>}
  </section>;
}
