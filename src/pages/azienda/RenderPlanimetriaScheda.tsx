import { FabbisognoMateriali } from "@/components/planimetrie/FabbisognoMateriali";
import { StatoVerificaDocumento } from "@/components/planimetrie/ControlloPrimaDellUso";
import { useControlloPrimaDellUso } from "@/hooks/useVerificaPlanimetria";
import { MaterialiProgetto } from "@/components/planimetrie/MaterialiProgetto";
import { NuovaCostruzione } from "@/components/planimetrie/NuovaCostruzione";
import { parametriGuida, type DestinazioneGuida } from "@/lib/planimetrie/guidaProgetto";
import { RiepilogoProgetto } from "@/components/planimetrie/RiepilogoProgetto";
import { AssociazioniPiantaPanel, CollegamentiProgetto } from "@/components/planimetrie/CollegamentiPianta";
import { accessiCollegamenti, useCollegamentiPiante, type TipoCollegamento } from "@/lib/planimetrie/collegamenti";
import { controlliDalDocumento } from "../../../shared/planimetrie/letturaDocumento.ts";
import { StudioImmobiliare } from "@/components/planimetrie/StudioImmobiliare";
import { PiantaProgettoWorkspace, type VistaProgettoPianta } from "@/components/planimetrie/PiantaProgettoWorkspace";
import { VerificaTavola } from "@/components/planimetrie/VerificaTavola";
import { creaAnteprimaPianta, percorsoTavolaDaRicalcare, percorsoTavolaOriginale, useUrlTavolaOriginale } from "@/lib/planimetrie/anteprime";
import { ambitoGeometriaDelPiano } from "../../../shared/planimetrie/materialiProgetto.ts";
/**
 * Planimetrie → una pianta: le sue stanze, il 3D e i render fatti.
 *
 * Da ogni stanza: «Fai il render di questa stanza». Si sceglie lo stato (com'è oggi o il
 * progetto) e, se ci sono più piani, il piano. Le misure stimate dall'AI si vedono come
 * tali: il render le usa come indicative.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Building2, ClipboardList, Download, Ellipsis, FileText, ImageIcon, Layers2, MapPin, PenLine, Ruler, Sparkles, Trees, Wand2, Wind } from "lucide-react";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { EsportaPiantaDialog } from "@/components/planimetrie/EsportaPiantaDialog";
import { AbachiPianta } from "@/components/planimetrie/AbachiPianta";
import { AccessoAbachiPianta } from "@/components/planimetrie/AccessoAbachiPianta";
import { ProspettiDialog } from "@/components/planimetrie/ProspettiDialog";
import { pianiProspetto } from "@/lib/planimetrie/prospetti";
import { RenderInSerieDialog } from "@/components/planimetrie/RenderInSerieDialog";
import { RenderEsterniDialog } from "@/components/planimetrie/RenderEsterniDialog";
import { PrimaEDopo } from "@/components/planimetrie/PrimaEDopo";
import { GalleriaStanza } from "@/components/planimetrie/GalleriaStanza";
import { UnitaEdificio } from "@/components/planimetrie/UnitaEdificio";
import { VerifichePianta } from "@/components/planimetrie/VerifichePianta";
import { pianiDaPlanimetria, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { fotorealisticoDisponibile } from "@/lib/planimetrie/renderFotorealisticoLocale";
import { usePlanimetria, useVersionePlanimetria, useVersioniPlanimetria } from "@/lib/planimetrie/archivio";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { percorsiPlanimetrie, ritornoProgettoValido } from "@/lib/planimetrie/render/percorsi";
import { useRenderDellaPianta } from "@/lib/planimetrie/render/renderDallaPianta";
import { ambitiDi, eAmbienteInterno, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { statoPerAmbito, vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
import { svgPiantaStanza } from "../../../shared/render-planimetria/piantaStanza.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Con una piscina disegnata si propone il render della piscina, con una pergola quello della pergola. */
function moduloEsterno(p: { elementi?: Array<{ tipo: string }> }) {
  const tipi = new Set((p.elementi ?? []).map((e) => e.tipo));
  if (tipi.has("piscina") || tipi.has("idromassaggio")) return "piscine" as const;
  if (tipi.has("pergola")) return "pergole" as const;
  return "giardini" as const;
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const UrbanisticaDialog = lazy(() => import("@/components/planimetrie/UrbanisticaDialog").then(m => ({ default: m.UrbanisticaDialog })));
const RenderCasaDialog = lazy(() => import("@/components/planimetrie/editor/RenderCasaDialog"));
const StudioCanaliTavola = lazy(() => import("@/components/planimetrie/StudioCanaliTavola").then(m => ({ default: m.StudioCanaliTavola })));

export default function RenderPlanimetriaScheda() {
  const t = useT();
  const { id = "" } = useParams();
  // La galleria di una stanza si apre da sola quando si arriva da «Salva nella galleria» (?galleria=<stanza>).
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const galleriaDi = params.get("galleria");
  const chiudiGalleria = () => setParams((p) => { const n = new URLSearchParams(p); n.delete("galleria"); return n; }, { replace: true });
  const permessi = usePermissions();
  const { effectiveCompany } = useAuth();
  const corrente = usePlanimetria(id);
  const numeroRichiesto = Number(params.get("versione"));
  const storico = Number.isSafeInteger(numeroRichiesto) && numeroRichiesto > 0 && numeroRichiesto !== corrente.data?.versione.numero;
  const revisione = useVersionePlanimetria(storico && corrente.data ? id : null, storico ? numeroRichiesto : null);
  const elencoVersioni = useVersioniPlanimetria(corrente.data ? id : null);
  const data = corrente.data && (!storico ? corrente.data : revisione.data ? { ...corrente.data, versione:revisione.data } : undefined);
  const isLoading = corrente.isLoading || (!!corrente.data && storico && revisione.isLoading);
  const error = corrente.error || (storico ? revisione.error : null);
  const sola = permessi.solaLettura || storico || (data && data.riga.company_id !== effectiveCompany?.id);
  const apriVersione = (numero: string) => setParams(p=>{
    const n = new URLSearchParams(p);
    if (Number(numero) === corrente.data?.versione.numero) n.delete("versione");
    else n.set("versione",numero);
    n.delete("galleria");
    return n;
  });
  const collegamenti = useCollegamentiPiante(data?.riga.company_id, data ? [data.riga] : [], accessiCollegamenti(permessi));
  const [gestisciCollegamenti, setGestisciCollegamenti] = useState<{ tipo?: TipoCollegamento } | null>(null);
  const { data: renders = [] } = useRenderDellaPianta(id);
  const documento = data?.versione.documento;
  const [bozza3D, setBozza3D] = useState<{ id: string; versione: number; documento: Planimetria } | null>(null);
  const bozzaInterni = bozza3D?.id === id && bozza3D.versione === data?.versione.numero ? bozza3D.documento : null;
  const daDwg=/\.dwg\b/i.test(documento?.riferimenti?.note ?? "");
  const livelloId = params.get("livello");
  const richiesto = params.get("ambito") ?? "fatto";
  const ambito = documento && ambitiDi(documento).some((a) => a.chiave === richiesto) ? richiesto : "fatto";
  const percorsoEditor = percorsiPlanimetrie.modifica(id, livelloId ?? undefined, ambito, params.get("muro") ?? undefined);
  const { primaDi, dialogo: controlloUso } = useControlloPrimaDellUso(documento, percorsoEditor);
  const setLivelloId = (v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("livello", v); n.delete("locale"); n.delete("muro"); n.delete("apertura"); return n; }, { replace: true });
  const setAmbito = (v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set("ambito", v); n.delete("muro"); n.delete("apertura"); return n; }, { replace: true });
  const dettaglioDaAncora = ["#nuova-costruzione","#materiali-progetto","#prima-e-dopo","#stanze","#verifiche","#unita","#abachi","#render-fatti"].includes(hash);
  const sezioneRichiesta=params.get("sezione");
  const tavolaHvac = documento?.letturaDocumento?.verifiche?.some((v) => v.id === "hvac-rete") === true;
  const scheda = params.get("studio")==="1" ? "studio"
    : sezioneRichiesta==="verifica" ? "verifica"
    : sezioneRichiesta==="canali" && tavolaHvac ? "canali"
    : sezioneRichiesta==="dettagli" || (!sezioneRichiesta && dettaglioDaAncora) ? "dettagli" : "pianta";
  useEffect(()=>{
    if (scheda==="dettagli" && dettaglioDaAncora && !isLoading) document.getElementById(hash.slice(1))?.scrollIntoView({block:"start"});
  },[scheda,dettaglioDaAncora,hash,isLoading]);
  const chatAperta = scheda==="pianta" && params.get("silvio")==="1";
  const analisiAperta = chatAperta && params.get("analisi")==="1";
  const selezionato = params.get("locale") ?? undefined;
  const vistaRichiesta = params.get("vista");
  const vistaPianta: VistaProgettoPianta = vistaRichiesta === "3d" || vistaRichiesta === "originale" ? vistaRichiesta : "pianta";
  const cambiaVistaPianta = (vista: VistaProgettoPianta, punto?: { livelloId: string; localeId?: string }) => setParams(p => {
    const n = new URLSearchParams(p);
    if (vista === "pianta") n.delete("vista"); else n.set("vista", vista);
    if (punto) {
      n.set("livello", punto.livelloId);
      if (punto.localeId) n.set("locale", punto.localeId); else n.delete("locale");
      n.delete("muro"); n.delete("apertura");
    }
    return n;
  }, { replace: true });
  const vaiAllaScheda = (pagina: string) => setParams(p=>{
    const n=new URLSearchParams(p);
    if (pagina==="studio") { n.set("studio","1"); n.delete("sezione"); }
    else { n.delete("studio"); n.set("sezione",pagina); }
    return n;
  },{replace:true});
  const apriSilvio = (base = ambito) => setParams(p=>{
    const n=new URLSearchParams(p);
    n.delete("studio"); n.set("sezione","pianta"); n.set("silvio","1");
    n.set("ambito",base);
    return n;
  },{replace:true});
  const chiudiSilvio = () => setParams(p=>{const n=new URLSearchParams(p);n.delete("silvio");n.delete("analisi");return n;},{replace:true});
  // La guida di Silvio dopo il DWG porta dove la cosa si fa (24/11/2026).
  const vaiDallaGuida = (verso: DestinazioneGuida) => {
    const { params: nuovi, ancora } = parametriGuida(params, verso);
    setParams(nuovi, { replace: false });
    if (ancora) setTimeout(() => document.getElementById(ancora)?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
  };
  const sezioneFascicolo = params.get("fascicolo");
  const riscontro = sezioneFascicolo === "verifiche" ? params.get("riscontro") : null;
  const [apriUrbanistica, setApriUrbanistica] = useState(!!sezioneFascicolo && ["urbanistica","pratiche","verifiche","tavole","esodo"].includes(sezioneFascicolo));
  const formatoDaLink = params.get("esporta");
  const [esporta, setEsporta] = useState(false);
  const [prospetti, setProspetti] = useState(false);
  const [esterni, setEsterni] = useState(false);
  // Render in serie: null chiuso, "" tutte le stanze, altrimenti più stili per quella stanza.
  const [serie, setSerie] = useState<string | null>(null);

  // Senza un piano scelto si apre il primo con delle stanze (una cantina vuota non dice niente).
  const livello = documento?.livelli.find((l) => l.id === livelloId)
    ?? documento?.livelli.find((l) => l.fatto.locali.length || l.proposte.some((p) => p.locali.length))
    ?? documento?.livelli[0];
  const percorsoTavola = percorsoTavolaOriginale(data?.riga.company_id,livello,documento);
  const sovrapponibile = !!percorsoTavolaDaRicalcare(data?.riga.company_id,livello,true);
  const { data: urlTavola, isLoading: tavolaInCaricamento } = useUrlTavolaOriginale(data?.riga.company_id,livello,documento);
  const ambitoGeometria = documento && livello ? ambitoGeometriaDelPiano(documento, livello.id, ambito) : ambito;
  const ambiti = useMemo(() => (documento ? ambitiDi(documento) : []), [documento]);
  const stanze = useMemo(() => {
    if (!documento || !livello) return [];
    const stato = statoPerAmbito(documento, livello.id, ambitoGeometria);
    return (stato?.locali ?? [])
      .map((l) => vincoliDellaStanza(documento, { livello_id: livello.id, ambito: ambitoGeometria, locale_id: l.id }))
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [documento, livello, ambitoGeometria]);
  // tutte le stanze di tutti i piani (render di tutto l'edificio): com'è oggi o la proposta, se il piano ce l'ha
  const stanzeEdificio = useMemo(() => {
    if (!documento) return [];
    return [...documento.livelli].sort((a, b) => a.quota - b.quota).flatMap((l) => {
      const st = statoPerAmbito(documento, l.id, ambito) ?? l.fatto;
      return st.locali.map((x) => ({ id: x.id, nome: x.nome, destinazione: x.destinazione, aperto: x.aperto, livelloId: l.id, piano: l.nome }));
    });
  }, [documento, ambito]);
  const piante3D = useMemo(() => {
    if (!documento || !livello) return null;
    const propostaId = ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined;
    return pianteDaPlanimetria(documento, { livelloId: livello.id, propostaId, materialiAmbito: ambito });
  }, [documento, livello, ambito]);
  const geometria3D = ambito === "fatto" ? piante3D?.fatto : piante3D?.progetto;
  const puoAprire3D = !!(geometria3D?.muri.length || geometria3D?.locali.length || geometria3D?.elementi.length || geometria3D?.aree?.length);
  const soloTavola = !!percorsoTavola && !puoAprire3D;
  const anteprima2D = useMemo(() => {
    if (!documento || !livello) return undefined;
    try {
      const anteprima = creaAnteprimaPianta(documento, livello.id, ambito);
      if (soloTavola) return urlTavola ? { ...anteprima, src: urlTavola, tavola: true } : undefined;
      return anteprima;
    } catch { return undefined; }
  }, [documento, livello, ambito, soloTavola, urlTavola]);

  const renderPerLocale = useMemo(() => {
    const conta = new Map<string, number>();
    for (const r of renders) {
      if (r.status !== "completed" || !r.planimetria?.locale_id) continue;
      conta.set(r.planimetria.locale_id, (conta.get(r.planimetria.locale_id) ?? 0) + 1);
    }
    return conta;
  }, [renders]);
  const completati = renders.filter((r) => r.status === "completed" && r.result_urls?.[0]);
  // tutti i render di ogni stanza, i più recenti per primi (per la galleria della stanza)
  const renderPerStanza = useMemo(() => {
    const m = new Map<string, Array<{ id: string; url: string; salvato: boolean; creato: string }>>();
    for (const r of [...completati].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      const k = r.planimetria?.locale_id;
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), { id: r.id, url: r.result_urls![0], salvato: !!r.saved_to_gallery, creato: r.created_at }]);
    }
    return m;
  }, [completati]);
  // l'ultimo render fatto per ogni stanza: la scheda mostra quello, invece dello schema, appena c'è
  const ultimoPerLocale = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...completati].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      const k = r.planimetria?.locale_id;
      if (k && r.planimetria?.versione === data?.versione.numero && r.planimetria?.ambito === ambitoGeometria && (r.planimetria?.materiali_ambito ?? r.planimetria?.ambito) === ambito && !m.has(k)) m.set(k, r.result_urls![0]);
    }
    return m;
  }, [completati, data?.versione.numero, ambito, ambitoGeometria]);
  // la sezione delle unità c'è solo con due appartamenti o più (condomini, bifamiliari)
  const piuUnita = useMemo(() => {
    if (!documento) return false;
    const sigle = new Set(documento.livelli.flatMap((l) => l.fatto.locali.map((x) => x.unita?.trim()).filter((u): u is string => !!u && !/comun|condominial|androne/i.test(u))));
    return sigle.size >= 2;
  }, [documento]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !data || !documento || !livello) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <TestataPlanimetrie indietro={percorsiPlanimetrie.elenco} titolo={t("Pianta")} />
        <Card>
          <CardContent className="p-6 text-sm">{error instanceof Error ? error.message : t("Pianta non disponibile.")}</CardContent>
        </Card>
      </div>
    );
  }

  const nomeAmbito=ambito==="fatto" ? "Stato di fatto" : ambiti.find(a=>a.chiave===ambito)?.nome ?? "Variante";
  const puoChat=permessi.canViewRenderAi && data.riga.company_id===effectiveCompany?.id;
  const puoRenderLocale = fotorealisticoDisponibile() && stanzeEdificio.some(eAmbienteInterno);
  const apriRenderStanze = (aperto: boolean) => setParams(p => {
    const n = new URLSearchParams(p);
    if (aperto) n.set("renderStanze", "1");
    else n.delete("renderStanze");
    return n;
  }, { replace: true });
  const fascicoloVisibile=Boolean(documento.urbanistica || !sola);
  const piani=documento.livelli.length;
  const schede=[
    {id:"pianta",nome:"Planimetria",icona:Layers2},
    {id:"verifica",nome:"Verifica tavola",icona:Ruler},
    ...(tavolaHvac ? [{id:"canali",nome:"Canali HVAC",icona:Wind}] : []),
    {id:"studio",nome:"Studio immobiliare",icona:Building2},
    {id:"dettagli",nome:"Render e dettagli",icona:ImageIcon},
  ];
  return (
    <div className="mx-auto max-w-[1480px] space-y-5 pb-12 max-md:space-y-4">
      <header className="space-y-4">
        <TestataPlanimetrie
          indietro={ritornoProgettoValido(params.get("torna")) ?? percorsiPlanimetrie.elenco}
          titolo={data.riga.titolo}
          sottotitolo={[t("Versione {n}", { n: data.versione.numero }), t(piani===1 ? "{n} piano" : "{n} piani", { n: piani }), daDwg ? t("Importata da DWG") : ""].filter(Boolean).join(" · ")}
          azioni={<>
            {fascicoloVisibile && <Button size="sm" variant="outline" className="gap-2" onClick={()=>setApriUrbanistica(true)}><MapPin className="h-4 w-4"/>{documento.urbanistica ? t("Fascicolo urbanistico") : t("Regole urbanistiche")}</Button>}
            <Button asChild size="sm" variant="outline" className="gap-2"><Link to={percorsoEditor}><PenLine className="h-4 w-4"/>{storico ? t("Editor versione corrente") : t("Apri editor")}</Link></Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => primaDi("pdf", () => setEsporta(true))}><FileText className="h-4 w-4"/>{t("PDF progetto")}</Button>
            {puoChat && <Button size="sm" className="gap-2 bg-blue-700 text-white hover:bg-blue-800" onClick={()=>chatAperta ? chiudiSilvio() : apriSilvio()} aria-pressed={chatAperta}><Sparkles className="h-4 w-4"/>{t("Chiedi a Silvio")}</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-9 w-9" aria-label={t("Altre azioni della planimetria")}><Ellipsis className="h-5 w-5"/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={()=>primaDi("3d",()=>setProspetti(true))}><Building2 className="mr-2 h-4 w-4"/>{t("Prospetti e sezioni")}</DropdownMenuItem>
                {!storico && <DropdownMenuItem disabled={!stanze.length} onSelect={()=>primaDi("render",()=>setEsterni(true))}><Trees className="mr-2 h-4 w-4"/>{t("Render esterni")}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={()=>primaDi("pdf",()=>setEsporta(true))}><Download className="mr-2 h-4 w-4"/>{t("Esporta")}</DropdownMenuItem>
                {permessi.canViewSopralluoghi && data.riga.survey_id && <DropdownMenuItem asChild>
                  <Link to={`/azienda/sopralluoghi/${data.riga.survey_id}`}><ClipboardList className="mr-2 h-4 w-4" />{t("Apri il sopralluogo")}</Link>
                </DropdownMenuItem>}
                {permessi.canViewOrders && data.riga.order_id && <DropdownMenuItem asChild>
                  <Link to={`/azienda/ordini/${data.riga.order_id}`}><Building2 className="mr-2 h-4 w-4" />{t("Apri la commessa")}</Link>
                </DropdownMenuItem>}
                {!sola && <DropdownMenuItem onSelect={()=>setGestisciCollegamenti({})}>{t("Associa scheda")}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </>}
        />
        <nav className="flex gap-1 overflow-x-auto border-b" aria-label={t("Sezioni del progetto")}>
          {schede.map(({id,nome,icona:Icona})=><button type="button" key={id} onClick={()=>vaiAllaScheda(id)}
            aria-current={scheda===id ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
              scheda===id ? "border-blue-700 text-blue-800 dark:text-blue-300" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icona className="h-4 w-4"/>{t(nome)}
          </button>)}
        </nav>
      </header>

      {controlloUso}
      {puoRenderLocale && params.get("renderStanze") === "1" && <Suspense fallback={<p role="status">{t("Apro i render delle stanze…")}</p>}>
        <RenderCasaDialog key={data.versione.numero + ":" + ambito} documento={documento} vista={ambito === "fatto" ? "fatto" : "progetto"}
          propostaId={ambito.startsWith("progetto:") ? ambito.slice(9) : undefined} modo="foto:render" soloInterni
          archivio={{ planimetriaId: id, versione: data.versione.numero, ambito, serie: "stanze" }} onChiudi={() => apriRenderStanze(false)} />
      </Suspense>}
      {apriUrbanistica && <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">{t("Apro il fascicolo urbanistico…")}</p>}><UrbanisticaDialog key={data.versione.numero} documento={documento} planimetriaId={id} companyId={data.riga.company_id}
        versione={data.versione.numero} varianteIniziale={ambito.startsWith("progetto:") ? ambito.slice(9) : undefined} solaLettura={!!sola}
        apriPratiche={sezioneFascicolo==="pratiche"} apriVerifiche={sezioneFascicolo==="verifiche"} apriTavole={sezioneFascicolo==="tavole"} unita={params.get("unita") ?? undefined}
        apriEsodo={sezioneFascicolo==="esodo"} livelloIniziale={riscontro ? params.get("livelloRiscontro") ?? livello.id : livello.id}
        riscontroIniziale={riscontro==="elettrico" || riscontro==="scarichi" ? riscontro : undefined}
        onVersioneCorrente={storico && corrente.data ? ()=>apriVersione(String(corrente.data?.versione.numero)) : undefined}
        onChiudi={()=>{
          setApriUrbanistica(false);
          if (sezioneFascicolo) setParams(p=>{const n=new URLSearchParams(p); n.delete("fascicolo"); n.delete("unita"); n.delete("riscontro"); n.delete("livelloRiscontro"); return n;},{replace:true});
        }} /></Suspense>}

      <div className="flex flex-wrap items-end gap-3" aria-label={t("Contesto della planimetria")}>
        {documento.livelli.length>1 && <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{t("Piano")}</span><UniformSelect value={livello.id} onChange={e=>setLivelloId(e.target.value)} className="h-9">
            {documento.livelli.map(l=><option value={l.id} key={l.id}>{l.nome}</option>)}
          </UniformSelect>
        </label>}
        {scheda!=="studio" && ambiti.length>1 && <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{t("Disegno")}</span><UniformSelect value={ambito} onChange={e=>setAmbito(e.target.value)} className="h-9 max-w-[240px]">
            {ambiti.map(a=><option value={a.chiave} key={a.chiave}>{a.nome}</option>)}
          </UniformSelect>
        </label>}
        {scheda === "pianta" && <AccessoAbachiPianta documento={documento} livelloId={livello.id} ambito={ambitoGeometria}
          nomeContesto={`${livello.nome} · ${ambitoGeometria === "fatto" ? "Stato di fatto" : nomeAmbito}`} />}
        {puoRenderLocale && <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => apriRenderStanze(true)}>
          <ImageIcon className="size-4" />{t("Render tutte le stanze")}
        </Button>}
        {(elencoVersioni.data?.length ?? 0)>1 && <UniformSelect className="ml-auto h-9" aria-label={t("Versione della planimetria")} value={data.versione.numero} onChange={e=>apriVersione(e.target.value)}>
          {elencoVersioni.data?.map(v=><option key={v.numero} value={v.numero}>{t("Versione {n}", { n: v.numero })}{v.numero===corrente.data?.versione.numero ? ` ${t("· corrente")}` : ""}</option>)}
        </UniformSelect>}
      </div>

      {scheda==="pianta" && <PiantaProgettoWorkspace key={data.versione.numero+":"+livello.id+":"+ambito}
        documento={documento} titolo={data.riga.titolo} livello={livello} ambito={ambito} nomeAmbito={nomeAmbito}
        companyId={data.riga.company_id} planimetriaId={id} versione={data.versione.numero} tavola={urlTavola} cercaTavola={tavolaInCaricamento}
        selezionato={selezionato} muroSelezionato={params.get("muro") ?? undefined} chatAperta={chatAperta && !!puoChat} analisiAperta={analisiAperta} puoScrivere={!!puoChat && !sola}
        onSeleziona={localeId=>setParams(p=>{const n=new URLSearchParams(p);if(localeId)n.set("locale",localeId);else n.delete("locale");n.delete("muro");return n;},{replace:true})}
        onApriChat={puoChat ? ()=>apriSilvio() : undefined} onChiudiChat={chiudiSilvio}
        onApriCorrente={storico && corrente.data ? ()=>apriVersione(String(corrente.data?.versione.numero)) : undefined}
        vista={vistaPianta} onVista={cambiaVistaPianta} puoModificare3D={!!puoChat && !sola} torna={params.get("torna")} esplosoIniziale={params.get("strati") === "1"}
        bozzaInterni={bozzaInterni} onBozzaInterni={d => setBozza3D(d ? { id, versione: data.versione.numero, documento: d } : null)}
        onAnalisi={aperta=>setParams(p=>{const n=new URLSearchParams(p);if(aperta)n.set("analisi","1");else n.delete("analisi");return n;},{replace:true})}
        onEsodo={fascicoloVisibile ? () => {
          setParams(p=>{const n=new URLSearchParams(p);n.set("fascicolo","esodo");return n;},{replace:true});
          setApriUrbanistica(true);
        } : undefined}
        onRiscontro={fascicoloVisibile ? ({criterio,livelloId})=>{
          setParams(p=>{
            const n=new URLSearchParams(p);
            n.set("fascicolo","verifiche"); n.set("riscontro",criterio); n.set("livelloRiscontro",livelloId);
            return n;
          },{replace:true});
          setApriUrbanistica(true);
        } : undefined}
        onVerifica={()=>setParams(p=>{const n=new URLSearchParams(p);n.set("sezione","verifica");return n;},{replace:true})}
        onSalvato3D={localeId=>setParams(p=>{const n=new URLSearchParams(p);n.delete("versione");n.set("vista","3d");if(localeId)n.set("locale",localeId);return n;},{replace:true})}
        onSalvata={v=>setParams(p=>{const n=new URLSearchParams(p);n.delete("versione");n.set("ambito",v.ambito);n.set("livello",v.livelloId);n.set("locale",v.localeId);return n;},{replace:true})}
        onGuida={storico ? undefined : vaiDallaGuida} />}

      {scheda==="studio" && <StudioImmobiliare key={data.versione.numero+":"+ambito} documento={documento} companyId={data.riga.company_id} planimetriaId={id}
        versione={data.versione.numero} orderId={data.riga.order_id} livelloId={livello.id} varianteIniziale={ambito.startsWith("progetto:") ? ambito.slice(9) : undefined}
        onApriSilvio={puoChat ? apriSilvio : undefined} onFascicolo={fascicoloVisibile ? ambitoStudio=>{
          setParams(p=>{const n=new URLSearchParams(p);n.set("ambito",ambitoStudio);n.set("fascicolo","verifiche");return n;},{replace:true});
          setApriUrbanistica(true);
        } : undefined}
        onVarianteSalvata={puoChat && !sola ? (nuovoAmbito, piano, numero) => setParams(p=>{
          const n = new URLSearchParams(p);
          n.set("ambito",nuovoAmbito); n.set("versione",String(numero)); n.set("livello",piano); n.delete("locale");
          return n;
        },{replace:true}) : undefined}/>}

      {scheda==="verifica" && <VerificaTavola key={data.versione.numero+":"+livello.id+":"+ambito+":"+(params.get("apertura") ?? "")}
        documento={documento} livello={livello} ambito={ambito} planimetriaId={id} versione={data.versione.numero}
        tavola={urlTavola} sovrapponibile={sovrapponibile} puoScrivere={!sola} aperturaIniziale={params.get("apertura") ?? undefined}/>}

      {scheda==="canali" && (urlTavola ? <Suspense fallback={<p role="status">{t("Apro la tavola HVAC…")}</p>}>
        <StudioCanaliTavola key={`${data.versione.numero}:${livello.id}`} src={urlTavola} companyId={data.riga.company_id}
          planimetriaId={id} versione={data.versione.numero} livelloId={livello.id} titolo={data.riga.titolo}
          puoComputo={permessi.canEditPreventivi && !sola} vista={vistaPianta === "3d" ? "3d" : "tavola"}
          nodo={params.get("nodo") ?? undefined} onVista={(vista, nodo) => setParams(p => {
            const n = new URLSearchParams(p);
            if (vista === "3d") n.set("vista", "3d"); else n.delete("vista");
            if (nodo) n.set("nodo", nodo); else n.delete("nodo");
            return n;
          }, { replace: true })} />
      </Suspense> : <p role="status" className="text-sm text-muted-foreground">{tavolaInCaricamento ? t("Apro la tavola HVAC…") : t("Tavola HVAC non disponibile per questo piano.")}</p>)}

      <EsportaPiantaDialog
        key={`esporta:${ambito}:${data.versione.numero}:${formatoDaLink ?? ""}`}
        aperto={esporta || formatoDaLink === "fascicolo" || formatoDaLink === "pdf"}
        formatoIniziale={formatoDaLink === "pdf" ? "pdf" : undefined}
        onChiudi={() => { setEsporta(false); if (params.has("esporta")) setParams((p) => { const n = new URLSearchParams(p); n.delete("esporta"); return n; }, { replace: true }); }}
        documento={documento}
        titolo={data.riga.titolo}
        versione={data.versione.numero}
        livelloId={livello.id}
        propostaId={ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined}
        haProgetto={documento.livelli.some((l) => l.proposte.length > 0)}
        ambitoIniziale={ambito}
        planimetriaId={id}
        modifiche3DNonSalvate={!!bozzaInterni}
      />

      <RenderInSerieDialog
        aperto={serie !== null}
        onChiudi={() => setSerie(null)}
        planimetriaId={id}
        versione={data.versione.numero}
        documento={documento}
        livelloId={livello.id}
        ambito={ambito}
        stanze={stanze.map((v) => ({ id: v.locale.id, nome: v.locale.nome, destinazione: v.locale.destinazione }))}
        stanzeEdificio={documento.livelli.length > 1 ? stanzeEdificio : undefined}
        soloStanza={serie || null}
      />

      {piante3D && (
        <RenderEsterniDialog
          documento={documento}
          aperto={esterni}
          onChiudi={() => setEsterni(false)}
          pianta={ambito === "fatto" ? piante3D.fatto : piante3D.progetto}
          vista={ambito === "fatto" ? "fatto" : "progetto"}
          titolo={data.riga.titolo}
          moduloIniziale={moduloEsterno(ambito === "fatto" ? piante3D.fatto : piante3D.progetto)}
          piani={documento.livelli.length > 1 ? pianiDaPlanimetria(documento, ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : undefined) : undefined}
        />
      )}

      {(() => {
        const st = galleriaDi ? stanzeEdificio.find((x) => x.id === galleriaDi) : undefined;
        return (
          <GalleriaStanza
            aperto={!!galleriaDi && !!st}
            onChiudi={chiudiGalleria}
            nomeStanza={st?.nome ?? "Stanza"}
            render={galleriaDi ? renderPerStanza.get(galleriaDi) ?? [] : []}
            nuovoRender={galleriaDi ? percorsiPlanimetrie.renderStanza(id, galleriaDi, { livelloId: livello.id, ambito: ambitoGeometria, materialiAmbito: ambito, versione:data.versione.numero, torna:params.get("torna") }) : "#"}
          />
        );
      })()}

      <ProspettiDialog aperto={prospetti} onChiudi={() => setProspetti(false)} stato={statoPerAmbito(documento, livello.id, ambito)} tetto={livello.tetto} titolo={data.riga.titolo} piani={pianiProspetto(documento, ambito)} />

      {scheda==="dettagli" && <div className="space-y-6">
        <StatoVerificaDocumento documento={documento} modifica={percorsoEditor} />
        {/* Prima i numeri del progetto, poi le scelte, poi prima e dopo e render (24/11/2026). */}
        <RiepilogoProgetto documento={documento} ambito={ambito} companyId={data.riga.company_id} onStudio={() => vaiAllaScheda("studio")} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div id="nuova-costruzione" className="scroll-mt-4"><NuovaCostruzione key={"costruzione:"+data.versione.numero} documento={documento} planimetriaId={id} versione={data.versione.numero} solaLettura={!!sola} /></div>
          <MaterialiProgetto key={ambito+":"+data.versione.numero} documento={documento} ambito={ambito} planimetriaId={id} versione={data.versione.numero} solaLettura={!!sola} />
        </div>
        {!storico && <CollegamentiProgetto riga={data.riga} mappa={collegamenti.data} onAssocia={tipo=>setGestisciCollegamenti({tipo})} />}
        {controlliDalDocumento(documento).length > 0 && <section aria-label={t("Controlli dal documento originale")} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="mb-2 font-semibold">{t("Controlli dal documento originale")}</h2>
          <ul className="list-disc space-y-1 pl-5">{controlliDalDocumento(documento).map((s,i)=><li key={i}>{s}</li>)}</ul>
        </section>}
      {/* Scorciatoie: la scheda è lunga, si salta a quello che serve */}
      {stanze.length > 0 && (
        <nav aria-label={t("Sezioni della scheda")} className="-mx-1 overflow-x-auto px-1 max-md:hidden">
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {([
              livello.proposte.length > 0 && ["prima-e-dopo", t("Prima e dopo")],
              ["stanze", t("Stanze e render")],
              ["verifiche", t("Verifiche")],
              piuUnita && ["unita", t("Unità e vendite")],
              ["abachi", t("Abachi")],
              ["materiali", t("Materiali")],
              completati.length > 0 && ["render-fatti", t("Render fatti")],
            ].filter(Boolean) as Array<[string, string]>).map(([ancora, nome]) => (
              <a key={ancora} href={`#${ancora}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(ancora)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground hover:shadow-sm">
                {nome}
              </a>
            ))}
          </div>
        </nav>
      )}

      {livello.proposte.length > 0 && (
        <div id="prima-e-dopo" className="scroll-mt-4">
        <PrimaEDopo
          key={`${livello.id}:${ambito}`}
          documento={documento}
          titolo={data.riga.titolo}
          planimetriaId={id}
          versione={data.versione.numero}
          livelloId={livello.id}
          propostaId={ambito.startsWith("progetto:") ? ambito.slice("progetto:".length) : livello.proposte[0].id}
          contactId={data.riga.contact_id}
          sola={!!sola}
          prezzi={permessi.canViewPreventivi}
          creaPreventivo={permessi.canEditPreventivi && !sola}
        />
        </div>
      )}

      <section id="stanze" className="scroll-mt-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
              {t("Render delle stanze")}
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground max-md:hidden">
              {t("L'AI parte dalla stanza com'è nella pianta (vista 3D o una tua foto), ne rispetta misure, porte e finestre, e la veste con lo stile che scegli. In circa 1–2 minuti hai il risultato.")}
            </p>
          </div>
          {!storico && stanze.length > 1 && (
            <Button size="sm" className="gap-1.5 max-md:w-full" onClick={() => primaDi("render", () => setSerie(""))}>
              <Sparkles className="h-4 w-4" />
              {t("Render di tutte le stanze")}
            </Button>
          )}
        </div>
        {stanze.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t("Questa pianta non ha ancora stanze. Aprila con «Modifica la pianta» e disegnale: poi qui puoi fare il render di ognuna.")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-md:gap-2.5">
            {stanze.map((v) => {
              const fatti = renderPerLocale.get(v.locale.id) ?? 0;
              const ultimo = ultimoPerLocale.get(v.locale.id);
              const porte = v.aperture.filter((a) => a.tipo === "porta").length;
              const finestre = v.aperture.filter((a) => a.tipo === "finestra" || a.tipo === "portafinestra").length;
              const stimata = v.locale.stimata || v.aperture.some((a) => a.stimata);
              const chip = [
                `${v.locale.superficie_mq.toFixed(1).replace(".", ",")} m²`,
                `h ${(v.locale.altezza_cm / 100).toFixed(2).replace(".", ",")} m`,
                porte ? t(porte === 1 ? "{n} porta" : "{n} porte", { n: porte }) : null,
                finestre ? t(finestre === 1 ? "{n} finestra" : "{n} finestre", { n: finestre }) : null,
              ].filter(Boolean) as string[];
              return (
                <Card key={v.locale.id} className="overflow-hidden transition-shadow hover:shadow-md max-sm:grid max-sm:grid-cols-[116px_1fr]">
                  <div className="relative border-b bg-white max-sm:border-b-0 max-sm:border-r">
                    {fatti > 0 && <button type="button" className="absolute inset-0 z-10" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("galleria", v.locale.id); return n; })} aria-label={t("Apri la galleria di {nome}", { nome: String(v.locale.nome ?? "") })} />}
                    <img
                      loading="lazy"
                      src={ultimo ?? svgUrl(svgPiantaStanza(v, { lato: 480 }))}
                      alt={ultimo ? t("Ultimo render di {nome}", { nome: String(v.locale.nome ?? "") }) : t("Pianta di {nome}", { nome: String(v.locale.nome ?? "") })}
                      className={cn("w-full bg-white", ultimo ? "aspect-[4/3] object-cover max-sm:aspect-square" : "aspect-[4/3] object-contain p-2 max-sm:aspect-square")}
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm max-sm:hidden">
                      {ultimo ? t("Ultimo render") : t("Pianta della stanza")}
                    </span>
                  </div>
                  <CardContent className="flex min-w-0 flex-col gap-2.5 p-4 max-sm:p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight">{v.locale.nome}</p>
                      {stimata && (
                        <Badge variant="outline" className="shrink-0 border-primary/40 text-primary" title={t("Misure stimate da controllare")}>
                          {t("Stimate")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {chip.map((c) => (
                        <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{c}</span>
                      ))}
                    </div>
                    {!storico && <div className="mt-auto flex items-center gap-2 pt-1">
                      <Button asChild size="sm" className="flex-1 gap-1.5">
                        <Link to={percorsiPlanimetrie.renderStanza(id, v.locale.id, { livelloId: livello.id, ambito: ambitoGeometria, materialiAmbito: ambito, versione:data.versione.numero, torna:params.get("torna") })}>
                          <Wand2 className="h-4 w-4" />
                          {fatti > 0 ? t("Nuovo render") : t("Fai il render")}
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => primaDi("render", () => setSerie(v.locale.id))} aria-label={t("Più stili insieme")} title={t("Più stili insieme")}>
                        <Sparkles className="h-4 w-4" />
                        <span className="max-xl:hidden">{t("Più stili")}</span>
                      </Button>
                    </div>}
                    {fatti > 0 && (
                      <button type="button" className="w-fit text-left text-xs font-medium text-primary hover:underline" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("galleria", v.locale.id); return n; })}>
                        {t("Galleria ·")} {fatti === 1 ? t("1 render") : t("{fatti} render", { fatti: String(fatti ?? "") })}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div id="verifiche" className="scroll-mt-4">
        <VerifichePianta documento={documento} titolo={data.riga.titolo} ambito={ambito} nomeStato={ambito === "fatto" ? "Com'è oggi" : ambiti.find((x) => x.chiave === ambito)?.nome ?? "Progetto"} modifica={percorsoEditor} />
      </div>

      <div id="unita" className="scroll-mt-4">
        <UnitaEdificio documento={documento} titolo={data.riga.titolo} planimetriaId={id} versione={data.versione.numero} sola={!!sola} prezzi={permessi.canViewPreventivi} modificaPrezzi={permessi.canEditPreventivi && !sola} />
      </div>

      <div id="abachi" className="scroll-mt-4">
        <AbachiPianta documento={documento} livelloId={livello.id} ambito={ambito} titolo={data.riga.titolo} />
      </div>

      <div id="materiali" className="scroll-mt-4">
        <FabbisognoMateriali documento={documento} ambito={ambito} />
      </div>

      {completati.length > 0 && (
        <section id="render-fatti" className="scroll-mt-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
            {t("Render di questa pianta")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("Le immagini delle versioni precedenti conservano i materiali scelti allora. Genera nuovi render per applicare le ultime scelte del progetto.")}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {completati.map((r) => (
              <Link key={r.id} to={`/azienda/render/stanza/gallery/${r.id}`} className="group overflow-hidden rounded-lg border">
                <img loading="lazy" src={r.result_urls![0]} alt={t("Render di {nome}", { nome: r.planimetria?.locale_nome ?? t("una stanza") })} className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]" />
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block truncate">{r.planimetria?.locale_nome ?? t("Stanza")}</span>{r.planimetria?.versione !== data.versione.numero ? <span className="text-[10px] text-amber-700">{t("Versione precedente")}</span> : r.planimetria?.ambito !== ambito ? <span className="text-[10px] text-muted-foreground">{t("Altro stato della pianta")}</span> : null}</span>
                  {r.planimetria?.partenza === "vista_3d" && <span className="ml-auto shrink-0 text-muted-foreground">{t("dal 3D")}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      </div>}
      {gestisciCollegamenti && <AssociazioniPiantaPanel riga={data.riga} mappa={collegamenti.data} anteprima={anteprima2D} tipoIniziale={gestisciCollegamenti.tipo} onChiudi={() => setGestisciCollegamenti(null)} />}
    </div>
  );
}
