import type { ContestoLetturaPsc } from "@/components/sicurezza/pos/LetturaOcrPsc";
import { PerimetroAiPos, RevisioneProposteAiPos, type PerimetroPropostePos, type RisultatoPropostePos } from "@/components/sicurezza/pos/ProposteAiPos";
import { UniformSelect } from "@/components/ui/uniform-select";
import { ContestoSchedaCommessa, useModificheSchedaCommessa } from "@/components/sicurezza/ContestoSchedaCommessa";
import { invalidaRiesameTecnico } from "../../../../supabase/functions/_shared/posTecnica";
import { ConfrontoFontiPos } from "@/components/sicurezza/pos/ConfrontoFontiPos";
import { PreparaBozzaPos } from "@/components/sicurezza/pos/PreparaBozzaPos";
import { inserisciTestiLavorazione, stessaLavorazionePos } from "@/lib/sicurezza/testiLavorazionePos";
import { useAnteprimaPos } from "@/hooks/useAnteprimaPos";
import { AnnullaPdf, AnnunciaFasePdf } from "@/components/sicurezza/pos/PosPdfStato";
import { etichettaFasePdf } from "@/lib/sicurezza/posPdfErrori";
import { errorePscAvvio, prossimoPassoPos, verificaIterNegativa } from "@/lib/sicurezza/posIter";
import { useAvvioSicurezza } from "@/hooks/useAvvioSicurezza";
import { AvvioSicurezzaPos } from "@/components/sicurezza/AvvioSicurezzaPos";
import { stessaFontePsc, stessoRiferimentoPsc } from "../../../../supabase/functions/_shared/posPsc";
import { EmissioniPos } from "@/components/sicurezza/pos/EmissioniPos";
import { RiusoPosDialog } from "@/components/sicurezza/pos/RiusoPosDialog";
import { StoricoContenutiPos } from "@/components/sicurezza/pos/StoricoContenutiPos";
/**
 * Editor del POS sul modello ufficiale (DI 9/9/2014, Allegato I).
 *
 * La bozza vive nello stato della pagina e si salva col pulsante (o Ctrl/Cmd+S).
 * L'approvazione la fa il server dopo il controllo dei contenuti minimi
 * dell'Allegato XV; un POS approvato si legge soltanto: per cambiarlo si apre
 * una nuova revisione. Firme, consultazione dell'RLS e verifiche di impresa
 * affidataria e CSE (art. 101 c. 3) si segnano anche dopo l'approvazione.
 */
import { lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Copy, Eye, FileDown, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePscCommessa } from "@/hooks/usePscCommessa";
import {
  ErrorePos, chiaveDatiAppPos, datiAppPos, lavorazioniAiPos, useApprovaPos, useNuovaRevisione, usePos, useSalvaPos,
  type IterPos, type PosRiga,
} from "@/hooks/usePos";
import type { ContestoPos } from "../../../../supabase/functions/_shared/posModello";
import {
  completezzaPercento, vociMancanti,
  type Lavorazione, type PosContenuto, type SezionePos, type VoceMancante,
} from "../../../../supabase/functions/_shared/posModello";
import { AperturaSezioniContext, Campo } from "@/components/sicurezza/pos/campi";
import { CosaManca } from "@/components/sicurezza/pos/CosaManca";
import { InvioPos, useIncaricoCse, type DestinatarioPos } from "@/components/sicurezza/pos/InvioPos";
import { CopiaFirmataSezione } from "@/components/sicurezza/pos/CopiaFirmataPos";
import { useEmissioniPos } from "@/hooks/useEmissioniPos";
import { BarraSezioniPos, NavSezioniPos, type VoceMenuSezione } from "@/components/sicurezza/pos/MenuSezioniPos";
import { useSezioniApertePos, useStickyNelDocumento } from "@/components/sicurezza/pos/useSezioniPos";
import {
  SezioneAllegati, SezioneEmergenze, SezioneFigure, SezioneFormazione, SezioneImpresa, SezioneLavorazioni,
  SezioneLavoratori, SezioneOpera, SezionePsc, SezioneRumore, type Modifica,
} from "@/components/sicurezza/pos/PosSezioni";

const AnteprimaBozzaPos = lazy(() => import("@/components/sicurezza/pos/AnteprimaBozzaPos")
  .then(m => ({ default: m.AnteprimaBozzaPos })));

const SEZIONI: Array<{ id: SezionePos | "iter"; titolo: string }> = [
  { id: "opera", titolo: "Opera e cantiere" },
  { id: "impresa", titolo: "Impresa" },
  { id: "figure", titolo: "Figure" },
  { id: "emergenze", titolo: "Emergenze" },
  { id: "lavoratori", titolo: "Lavoratori" },
  { id: "formazione", titolo: "Formazione" },
  { id: "rumore", titolo: "Rumore" },
  { id: "lavorazioni", titolo: "Lavorazioni" },
  { id: "psc", titolo: "Procedure PSC" },
  { id: "allegati", titolo: "Allegati" },
  { id: "iter", titolo: "Firme e consegna" },
];

/** Le sezioni dell'editor che si aprono e si chiudono (la «Firme e consegna» è sempre aperta). */
const IDS_SEZIONI_APRIBILI = SEZIONI.filter((x) => x.id !== "iter").map((x) => x.id);

const vaiA = (id: string) => document.getElementById(`pos-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
const chiaveVoce = (v: VoceMancante) => JSON.stringify([v.sezione, v.lavorazione_id, v.riferimento, v.testo]);

function dataIt(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function piu15(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

/** Una bozza modificabile parte sempre dai controlli aggiornati; con la CSE nominata anche dal riferimento PSC. */
const conControlliAggiornati = (base: PosContenuto): PosContenuto =>
  ({ ...base, versione_controlli: 2, versione_prodotti: 1, ...(base.procedure_psc.psc_presente ? { versione_psc: 1 as const } : {}) });

export default function PosEditor() {
  const { id } = useParams<{ id: string }>();
  const companyId = useEffectiveCompanyId();
  const perms = usePermissions();
  const { data: pos, isLoading, error, refetch } = usePos(id);
  const puoScrivere = (perms.canViewSicurezzaCantiere || perms.isAdmin) && !perms.solaLettura;
  const [compilazioneManuale, setCompilazioneManuale] = useState<string | null>(null);
  const identita = `${companyId}:${id}`;

  // I dati dell'app: il contesto (mezzi e subappaltatori della commessa) per le
  // lavorazioni, e il POS già compilato per chi lo apre la prima volta.
  const fonti = useQuery<NonNullable<EditorProps["datiApp"]>>({
    queryKey: chiaveDatiAppPos(companyId, id),
    enabled: !!id && !!companyId && !!pos && puoScrivere && pos.status !== "approvato",
    queryFn: () => datiAppPos(companyId!, id!),
    staleTime: pos?.daCompilare ? 0 : 5 * 60 * 1000,
    retry: false,
  });
  const datiApp = fonti.data;

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  // Con un POS già letto un errore di ricarica in background (rete che cade e torna) non butta via la bozza: si resta nell'editor.
  if (!pos) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <p className="text-sm">{error ? "Non riesco a caricare il POS." : "POS non trovato."}</p>
        <div className="flex justify-center gap-2">
          {error && <Button variant="outline" onClick={() => refetch()}>Riprova</Button>}
          <Button asChild variant="outline"><Link to="/azienda/sicurezza-cantiere">Torna a Sicurezza cantiere</Link></Button>
        </div>
      </div>
    );
  }
  // Un POS del vecchio generatore o creato vuoto dall'assistente si compila
  // subito dai dati dell'app: si aspetta che arrivino.
  if (pos.daCompilare && puoScrivere && pos.status !== "approvato" && !datiApp?.contenuto && compilazioneManuale !== identita) {
    if (fonti.isLoading || fonti.isFetching) {
      return <div role="status" className="flex flex-col items-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />Recupero i dati della commessa…
      </div>;
    }
    if (fonti.isError) {
      return <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
        <p role="alert" className="text-sm">I dati della commessa non sono disponibili per la precompilazione.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => void fonti.refetch()}>Riprova a recuperare i dati</Button>
          <Button variant="outline" onClick={() => setCompilazioneManuale(identita)}>Compila a mano</Button>
        </div>
      </div>;
    }
  }

  // Si rimonta quando cambiano stato o revisione (approvato, nuova revisione),
  // NON a ogni salvataggio: un rimontaggio a metà di un'operazione (salva e poi
  // chiedi le proposte all'AI, salva e poi approva) ne butterebbe via l'esito.
  const versione = `${companyId}:${pos.id}:${pos.revisione}:${pos.status}`;
  return <EditorPos key={versione} pos={pos} datiApp={datiApp ?? null} puoScrivere={puoScrivere} puoLeggereComputo={perms.canViewOrders}
    senzaPrecompilazione={compilazioneManuale === identita} fontiNonDisponibili={fonti.isError && !datiApp}
    fontiInCaricamento={fonti.isLoading && !datiApp} rileggiFonti={() => void fonti.refetch()} />;
}

interface EditorProps {
  pos: PosRiga;
  datiApp: { contenuto?: PosContenuto; contesto: ContestoPos } | null;
  puoScrivere: boolean;
  puoLeggereComputo: boolean;
  senzaPrecompilazione: boolean;
  fontiNonDisponibili: boolean;
  fontiInCaricamento: boolean;
  rileggiFonti: () => void;
}

function EditorPos({ pos, datiApp, puoScrivere, puoLeggereComputo, senzaPrecompilazione, fontiNonDisponibili, fontiInCaricamento, rileggiFonti }: EditorProps) {
  const schedaCommessa = useContext(ContestoSchedaCommessa);
  const location = useLocation();
  const companyId = useEffectiveCompanyId();
  const salva = useSalvaPos(pos.id);
  const approva = useApprovaPos();
  const nuovaRevisione = useNuovaRevisione(pos);

  const approvato = pos.status === "approvato";
  const ro = !puoScrivere || approvato || approva.isPending;
  const precompilato = pos.daCompilare && !ro && !senzaPrecompilazione ? datiApp?.contenuto : undefined;
  const aggiornaControlli = !ro && (pos.contenuto.versione_controlli !== 2 || pos.contenuto.versione_prodotti !== 1 || (pos.contenuto.procedure_psc.psc_presente && pos.contenuto.versione_psc !== 1));

  // This identifies the content the editor actually loaded, not a later cache
  // refresh. Only a successful local save or an explicit discard advances it.
  const versioneLetta=useRef(pos.updated_at);
  const modifiche=useRef(0);
  const salvando=useRef(false);
  const [riusoAperto,setRiusoAperto]=useState(false);
  // Il contenuto da cui parte questa sessione: «Annulla» ci torna (non al POS vuoto da cui si è appena compilato).
  const contenutoDiPartenza = () => ro ? pos.contenuto : conControlliAggiornati(precompilato ?? pos.contenuto);
  const [bozza, setBozza] = useState<PosContenuto>(contenutoDiPartenza);
  const avvioQuery = useAvvioSicurezza(pos.company_id, pos.order_id);
  const pscCorrente = avvioQuery.data?.psc;
  const documentiPsc = usePscCommessa(pos.company_id, pscCorrente ? pos.order_id : "");
  const pscDisponibile = !pscCorrente || !!documentiPsc.data?.some((f) => stessaFontePsc(pscCorrente, f));
  const avvio = avvioQuery.data && !pscDisponibile ? { ...avvioQuery.data, psc: null } : avvioQuery.data;
  const erroreAvvio = avvioQuery.isError ? "Riprova a caricare la decisione del PSC in Avvio sicurezza."
    : errorePscAvvio(bozza.procedure_psc, avvio);
  const [iter, setIter] = useState<IterPos>(() => pos.iter);
  const [sporco, setSporco] = useState(!!precompilato || aggiornaControlli);
  const [iterSporco, setIterSporco] = useState(false);
  useModificheSchedaCommessa(sporco || iterSporco, salva.isPending || approva.isPending || nuovaRevisione.isPending);
  const [avvisi, setAvvisi] = useState<string[]>(() =>
    [...(precompilato && datiApp ? datiApp.contesto.avvisi : ((location.state as { avvisi?: string[] } | null)?.avvisi ?? [])),
      ...(aggiornaControlli ? ["Controlli aggiornati proposti per questa bozza: verifica formazione, prodotti e il riferimento PSC della commessa; salva prima dell’approvazione. Lo storico approvato resta invariato."] : [])]);
  const anteprima=useAnteprimaPos();
  const [erroreApprovazione,setErroreApprovazione]=useState<string|null>(null);
  const [mancantiServer, setMancantiServer] = useState<VoceMancante[] | null>(null);
  const [preparazioneAperta, setPreparazioneAperta] = useState(false);
  const [guidaAttiva, setGuidaAttiva] = useState(false);
  const [ultimaVoce, setUltimaVoce] = useState<string | null>(null);
  const [navigazioneGuida, setNavigazioneGuida] = useState<{ voce: VoceMancante } | null>(null);
  const destinazioneElenco = useRef<VoceMancante | string | null>(null);
  const [revisioneAperta, setRevisioneAperta] = useState(false);
  const [descrRevisione, setDescrRevisione] = useState("");
  const [aggiornaAperto, setAggiornaAperto] = useState(false);
  const [proposte, setProposte] = useState<(RisultatoPropostePos & { destinazioneId?: string }) | null>(null);
  const [perimetroAi, setPerimetroAi] = useState<(Pick<PerimetroPropostePos, "ambito" | "fasi"> & { destinazioneId?: string }) | null>(null);
  const [erroreProposte, setErroreProposte] = useState<string | null>(null);
  const [proponendo, setProponendo] = useState(false);

  const modifica: Modifica = useCallback((fn) => {
    modifiche.current++;
    setBozza((prev) => {
      const copia = structuredClone(prev);
      fn(copia);
      invalidaRiesameTecnico(prev,copia);
      return copia;
    });
    setSporco(true);
  }, []);

  const mancanti = useMemo(() => vociMancanti(bozza), [bozza]);
  const perSezione = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of mancanti) m.set(v.sezione, (m.get(v.sezione) ?? 0) + 1);
    return m;
  }, [mancanti]);
  const percento = completezzaPercento(bozza, mancanti.length);
  // Alla prima apertura restano aperte le sezioni con qualcosa da fare; un POS già approvato (sola lettura) si legge tutto aperto.
  const sezioniApertura = useSezioniApertePos(IDS_SEZIONI_APRIBILI, (id) => ro || (perSezione.get(id) ?? 0) > 0);
  const radiceEditor = useRef<HTMLDivElement>(null);
  const pulsanteAnteprima = useRef<HTMLButtonElement>(null);
  const [anteprimaAperta, setAnteprimaAperta] = useState(false);
  const [puoAffiancare, setPuoAffiancare] = useState(false);
  const anteprimaAffiancata = anteprimaAperta && puoAffiancare;
  useStickyNelDocumento(radiceEditor);
  useEffect(() => {
    const radice = radiceEditor.current;
    if (!radice || typeof ResizeObserver === "undefined") return;
    const misura = () => setPuoAffiancare(radice.clientWidth >= 880);
    misura();
    const observer = new ResizeObserver(misura);
    observer.observe(radice);
    return () => observer.disconnect();
  }, []);
  const vaiASezione = useCallback((id: string) => {
    sezioniApertura.apri(id);
    requestAnimationFrame(() => requestAnimationFrame(() => vaiA(id)));
  }, [sezioniApertura]);
  const vocePsc: VoceMancante | null = erroreAvvio && !avvioQuery.isLoading
    ? { sezione: "psc", campo: "pos-impostazioni-psc", testo: erroreAvvio, riferimento: "Avvio sicurezza" }
    : null;
  const vociGuida = vocePsc ? [vocePsc, ...mancanti] : mancanti;
  const indiceGuida = vociGuida.findIndex(v => chiaveVoce(v) === ultimaVoce);
  const prossimaVoce = vociGuida[(indiceGuida + 1) % Math.max(1, vociGuida.length)];

  function vaiAVoce(voce: VoceMancante) {
    setUltimaVoce(chiaveVoce(voce));
    if (voce.campo !== "pos-impostazioni-psc") sezioniApertura.apri(voce.sezione);
    setNavigazioneGuida({ voce });
  }

  useLayoutEffect(() => {
    const radice = radiceEditor.current;
    if (!radice || !navigazioneGuida) return;
    const { voce } = navigazioneGuida;
    const sezione = document.getElementById(`pos-${voce.sezione}`);
    const scheda = voce.lavorazione_id ? [...radice.querySelectorAll<HTMLElement>("[data-pos-lavorazione]")]
      .find(el => el.dataset.posLavorazione === voce.lavorazione_id) : undefined;
    const apriScheda = scheda?.querySelector<HTMLButtonElement>("[data-pos-apri-scheda]");
    const apri = voce.campo === "pos-impostazioni-psc" ? document.getElementById(voce.campo) : apriScheda;
    const raggiungiCampo = () => {
      const campo = voce.campo ? document.getElementById(voce.campo) : null;
      // Gli indici delle schede possono cambiare. Il salto preciso vale solo all’interno della scheda giusta.
      const obiettivo = campo && (scheda ?? radice).contains(campo) && !campo.closest("[hidden]") ? campo : null;
      const titolo = sezione?.querySelector<HTMLButtonElement>("header button") ?? null;
      (obiettivo ?? scheda ?? sezione)?.scrollIntoView({ behavior: "smooth", block: obiettivo || scheda ? "center" : "start" });
      const focus = obiettivo?.matches(":disabled") ? apriScheda ?? titolo : obiettivo ?? apriScheda ?? titolo;
      focus?.focus({ preventScroll: true });
    };
    if (apri?.getAttribute("aria-expanded") === "false") {
      apri.click();
      const frame = requestAnimationFrame(raggiungiCampo);
      return () => cancelAnimationFrame(frame);
    }
    raggiungiCampo();
  }, [navigazioneGuida]);

  function avviaGuida(contenuto: PosContenuto) {
    const daVerificare = contenuto === bozza ? mancanti : vociMancanti(contenuto);
    const sezioniDaVerificare = new Set(daVerificare.map(v => v.sezione));
    setGuidaAttiva(true);
    sezioniApertura.comprimiComplete(id => sezioniDaVerificare.has(id as SezionePos) ? 1 : 0);
    const prima = vocePsc ?? daVerificare[0];
    if (prima) vaiAVoce(prima);
  }

  const sezioniMenu: VoceMenuSezione[] = SEZIONI.map((x) => ({ id: x.id, titolo: x.titolo, mancanti: x.id === "iter" ? undefined : (perSezione.get(x.id) ?? 0) }));

  const salvaOra = useCallback(async () => {
    if(salvando.current) return false;
    salvando.current=true;
    const numeroModifiche=modifiche.current;
    try {
      const aggiornato=await salva.mutateAsync({ contenuto: sporco ? bozza : undefined, iter: iterSporco ? iter : undefined, attesa_updated_at:versioneLetta.current });
      versioneLetta.current=aggiornato.updated_at;
      if(modifiche.current!==numeroModifiche) {
        toast.success("Versione salvata; le nuove modifiche restano da salvare");
        return false;
      }
      setSporco(false);
      setIterSporco(false);
      toast.success("POS salvato");
      return true;
    } catch {
      return false;
    } finally { salvando.current=false; }
  }, [bozza, iter, sporco, iterSporco, salva]);

  // Ctrl/Cmd+S e avviso se si esce con modifiche non salvate.
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (sporco || iterSporco) void salvaOra();
      }
    };
    const esci = (e: BeforeUnloadEvent) => {
      if (sporco || iterSporco) e.preventDefault();
    };
    window.addEventListener("keydown", tasto);
    window.addEventListener("beforeunload", esci);
    return () => {
      window.removeEventListener("keydown", tasto);
      window.removeEventListener("beforeunload", esci);
    };
  }, [sporco, iterSporco, salvaOra]);

  const approvaOra = async () => {
    setErroreApprovazione(null);
    if (mancanti.length) {
      setMancantiServer(mancanti);
      return;
    }
    if (erroreAvvio) {
      setErroreApprovazione(erroreAvvio);
      return;
    }
    if (sporco || iterSporco) {
      const ok = await salvaOra();
      if (!ok) return;
    }
    try {
      await approva.mutateAsync({posId:pos.id,attesaUpdatedAt:versioneLetta.current});
      setMancantiServer(null);
    } catch (e) {
      if (e instanceof ErrorePos && e.mancanti.length) setMancantiServer(e.mancanti);
      else {const messaggio=e instanceof Error?e.message:"POS non approvato";setErroreApprovazione(messaggio);toast.error(messaggio);}
    }
  };

  const pscAllineato = avvio?.stato === "previsto" && !!avvio.psc && bozza.procedure_psc.psc_presente &&
    stessoRiferimentoPsc(bozza.procedure_psc.documento, avvio.psc);
  const contestoLetturaPsc: ContestoLetturaPsc | undefined = pscAllineato && bozza.procedure_psc.documento
    ? { companyId: pos.company_id, posId: pos.id, fonte: bozza.procedure_psc.documento, salva: sporco ? salvaOra : undefined }
    : undefined;
  const apriProposteAi = (lavorazione?: Lavorazione) => {
    setErroreProposte(null);
    setPerimetroAi({ ambito: lavorazione?.titolo.trim().slice(0, 1000) ?? "", fasi: lavorazione?.fase_id ? [lavorazione.fase_id] : [], destinazioneId: lavorazione?.id });
  };
  const proponiAi = async (perimetro: PerimetroPropostePos) => {
    if (!companyId || proponendo || ro) return;
    setErroreProposte(null);
    setProponendo(true);
    try {
      if (sporco && !await salvaOra()) {
        setErroreProposte("Salva la bozza prima di generare le proposte.");
        return;
      }
      const risultato = await lavorazioniAiPos(companyId, pos.id, perimetro);
      const conservaDestinazione = perimetroAi?.ambito === perimetro.ambito && !perimetro.computo &&
        perimetroAi.fasi.length === perimetro.fasi.length && perimetroAi.fasi.every(id => perimetro.fasi.includes(id));
      setProposte({ ...risultato, destinazioneId: conservaDestinazione ? perimetroAi.destinazioneId : undefined });
      setPerimetroAi(null);
    } catch (e) {
      setErroreProposte(e instanceof Error ? e.message : "Proposte non arrivate. Riprova tra poco.");
    } finally {
      setProponendo(false);
    }
  };

  const modificaIter = (fn: (x: IterPos) => IterPos) => {
    modifiche.current++;
    setIter((prev) => fn(prev));
    setIterSporco(true);
  };

  const titoloCommessa = [pos.commessa?.order_code, pos.commessa?.description].filter(Boolean).join(" — ") || "Commessa";
  const subappalto = bozza.impresa.ruolo === "esecutrice_subappalto";
  const conCse = avvio?.stato === "previsto" || bozza.procedure_psc.psc_presente;
  // L'invio del POS parte dal PDF approvato della revisione corrente; il CSE della commessa precompila il destinatario.
  const emissioni = useEmissioniPos(companyId || pos.company_id, pos.id, approvato && puoScrivere);
  const emissioneCorrente = emissioni.data?.find((e) => e.stato === "completa" && e.revisione === pos.revisione) ?? null;
  const cse = useIncaricoCse(companyId || pos.company_id, pos.order_id, approvato && puoScrivere && conCse);
  const indirizzoCantiere = [bozza.opera.cantiere.via, [bozza.opera.cantiere.localita, bozza.opera.cantiere.provincia ? `(${bozza.opera.cantiere.provincia})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  /** A invio riuscito: la data entra nelle date della consegna e si salva subito (è un fatto già avvenuto, non una bozza). */
  const registraInvio = async (tipo: DestinatarioPos, quando: string) => {
    const nuovo: IterPos = { ...iter, [tipo === "cse" ? "cse_inviato_il" : "affidataria_inviato_il"]: quando };
    try {
      const aggiornato = await salva.mutateAsync({ iter: nuovo, attesa_updated_at: versioneLetta.current });
      versioneLetta.current = aggiornato.updated_at;
      setIter(nuovo);
      toast.success("Invio registrato: da oggi corrono i 15 giorni per la verifica");
    } catch {
      // Il salvataggio ha già mostrato il suo errore: la data resta nella bozza della consegna, da salvare.
      setIter(nuovo); setIterSporco(true);
    }
  };
  const invio = (tipo: DestinatarioPos) => (
    <InvioPos tipo={tipo} companyId={companyId || pos.company_id} orderId={pos.order_id} emissioneId={emissioneCorrente?.id ?? null}
      codice={pos.commessa?.order_code || "POS"} revisione={pos.revisione} impresa={bozza.impresa.ragione_sociale} cantiere={indirizzoCantiere}
      nomeIniziale={tipo === "cse" ? (cse.data?.nome ?? "") : bozza.impresa.subappalto_a} emailIniziale={tipo === "cse" ? (cse.data?.email ?? "") : ""}
      disabilitato={sporco || iterSporco || salva.isPending} onInviato={(t, q) => void registraInvio(t, q)} />
  );
  // Art. 101 c. 3: con una verifica negativa i lavori non possono iniziare, anche se il POS è approvato nell'app.
  const verificaNegativa = verificaIterNegativa(bozza, iter);
  const prossimo = prossimoPassoPos({ status: pos.status, contenuto: bozza, iter }, avvio);
  const statoTesto = approvato ? (verificaNegativa ? "Approvato, verifica negativa" : prossimo ? "PDF approvato · iter da completare" : "Iter registrato") : "Bozza";
  const baseProps = { d: bozza, modifica, ro };
  const azioneApprovazione = approva.isPending ? etichettaFasePdf(approva.fase) ?? "Approvazione…" : "Approva e prepara PDF";
  const anteprimaBozza = anteprimaAperta && !approvato && (
    <Suspense fallback={<p role="status" className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Apro il visore PDF…
    </p>}>
      <AnteprimaBozzaPos contenuto={bozza} revisione={pos.revisione} revisioni={pos.revisioni} codiceCommessa={pos.commessa?.order_code} />
    </Suspense>
  );

  return (
    <div ref={radiceEditor} className={`mx-auto space-y-4 pb-28 ${anteprimaAffiancata ? "max-w-[1500px]" : "max-w-6xl"}`}>
      {/* Su mobile la barra dei comandi usa icone per lasciare spazio al pulsante principale. */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        {!schedaCommessa && <Link to="/azienda/sicurezza-cantiere" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground max-sm:hidden">
          <ArrowLeft className="h-3.5 w-3.5" />Sicurezza cantiere
        </Link>}
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3 max-sm:mt-0 max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch max-sm:gap-2">
          <div className="min-w-0">
            {/* Stato e revisione stanno accanto al titolo: su telefono diventano testo semplice (niente riquadri), prima
                da telefono non si vedeva né bozza/approvato né la revisione. Un solo elemento per breakpoint: niente testi doppi. */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 aria-label="Piano Operativo di Sicurezza" className="text-lg font-bold sm:text-xl max-sm:leading-tight"><span aria-hidden="true" className="max-sm:hidden">Piano Operativo di Sicurezza</span><span aria-hidden="true" className="sm:hidden">POS</span></h1>
              <Badge variant="outline" className={`${approvato ? (verificaNegativa ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700") : "border-slate-200 bg-slate-50"} max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:text-xs ${approvato ? (verificaNegativa ? "max-sm:text-red-700" : "max-sm:text-emerald-700") : "max-sm:text-amber-700"}`}>
                {statoTesto}
              </Badge>
              <Badge variant="outline" className="max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:text-xs max-sm:font-semibold max-sm:text-muted-foreground max-sm:before:mr-2 max-sm:before:content-['·']">Rev. {pos.revisione}</Badge>
            </div>
            <p className="truncate text-sm text-muted-foreground max-sm:text-xs">{titoloCommessa}</p>
            {approvato && pos.approvato_da_nome && (
              <p className="mt-1 truncate text-xs text-muted-foreground">da {pos.approvato_da_nome}{pos.approvato_il ? ` il ${dataIt(pos.approvato_il)}` : ""}</p>
            )}
          </div>
          {riusoAperto && <RiusoPosDialog pos={pos} onClose={()=>setRiusoAperto(false)}/>}
          {/* Telefono: azioni secondarie a sola icona, l'azione principale occupa il resto della riga (prima
              «Approva» usciva dallo schermo e non si raggiungeva). */}
          <div className="flex flex-wrap gap-2 empty:hidden">
            {puoScrivere && !pos.daCompilare && (
              <Button variant="outline" aria-label="Riutilizza POS" className="tap-compact max-sm:h-10 max-sm:w-10 max-sm:shrink-0 max-sm:px-0" disabled={sporco||iterSporco||salva.isPending} title={sporco||iterSporco ? "Salva le modifiche prima di riutilizzare il POS" : "Duplica POS o salva modello aziendale"} onClick={()=>setRiusoAperto(true)}>
                <Copy className="h-4 w-4 sm:hidden" aria-hidden="true" /><span className="max-sm:hidden">Riutilizza POS</span>
              </Button>
            )}
            {!approvato && <Button ref={pulsanteAnteprima} type="button" variant={anteprimaAffiancata ? "secondary" : "outline"}
              aria-label={anteprimaAperta ? "Chiudi anteprima PDF dal vivo" : "Anteprima PDF dal vivo"}
              aria-expanded={anteprimaAperta} title="Guarda il PDF mentre compili la bozza"
              className="tap-compact max-sm:h-10 max-sm:w-10 max-sm:shrink-0 max-sm:px-0" onClick={() => setAnteprimaAperta(v => !v)}>
              <Eye className="size-4 sm:mr-1" aria-hidden="true" />
              <span className="max-sm:hidden">{anteprimaAperta ? "Chiudi anteprima PDF" : "Anteprima PDF dal vivo"}</span>
            </Button>}
            <Button variant="outline" className="tap-compact max-sm:h-10 max-sm:w-10 max-sm:shrink-0 max-sm:px-0"
              aria-label={anteprima.inCorso ? etichettaFasePdf(anteprima.fase) ?? "Preparazione…" : "PDF dalla versione salvata"}
              disabled={anteprima.inCorso || sporco || iterSporco || salva.isPending}
              title={sporco || iterSporco ? "Salva le modifiche prima di preparare l’anteprima" : "Anteprima del PDF con filigrana BOZZA"}
              onClick={() => void anteprima.apri(pos.company_id, pos.id)}>
              {anteprima.inCorso ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" aria-hidden /> : <FileDown className="h-4 w-4 sm:mr-1" aria-hidden />}
              <span className="max-sm:hidden">{anteprima.inCorso ? etichettaFasePdf(anteprima.fase) ?? "Preparazione…" : "PDF dalla versione salvata"}</span>
            </Button>
            <AnnullaPdf fase={anteprima.fase} onAnnulla={anteprima.annulla} />
            {!ro && (
              <Button variant="outline" size="icon" aria-label="Confronta dati dell’app" title="Confronta con i dati aggiornati dell’app"
                className="tap-compact shrink-0" onClick={() => setAggiornaAperto(true)}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
            )}
            {puoScrivere && !approvato && (
              <Button variant={vociGuida.length ? "outline" : "default"} onClick={approvaOra} disabled={approva.isPending || salva.isPending || proponendo}
                aria-label={azioneApprovazione} className="tap-compact max-sm:h-10 max-sm:min-w-0 max-sm:flex-1 max-sm:px-2">
                {approva.isPending ? <Loader2 className="size-4 animate-spin sm:mr-1" /> : <ShieldCheck className="size-4 sm:mr-1" />}
                <span className="max-sm:hidden">{azioneApprovazione}</span>
                <span className="sm:hidden">{approva.isPending ? "In corso…" : "Approva"}</span>
              </Button>
            )}
            {puoScrivere && !approvato && (
              <>
                <AnnullaPdf fase={approva.fase} onAnnulla={approva.annulla} />
                <AnnunciaFasePdf fase={approva.fase} />
              </>
            )}
            {puoScrivere && approvato && (
              <Button variant="outline" className="tap-compact max-sm:h-10 max-sm:min-w-0 max-sm:flex-1 max-sm:px-3" disabled={iterSporco || salva.isPending}
                title={iterSporco ? "Salva prima le date di firma e consegna: con la nuova revisione ripartono da capo" : undefined}
                onClick={() => { setDescrRevisione(""); setRevisioneAperta(true); }}>
                <RotateCcw className="mr-1 h-4 w-4" />Nuova revisione
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-1.5 max-lg:hidden">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Contenuti minimi dell'Allegato XV</span>
            {mancanti.length ? (
              <button type="button" className="font-medium text-amber-800 underline-offset-2 hover:underline" onClick={() => setMancantiServer(mancanti)}>
                {mancanti.length === 1 ? "Manca 1 voce" : `Mancano ${mancanti.length} voci`}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Tutti presenti</span>
            )}
          </div>
          <Progress value={percento} className="h-2" aria-label={`Completezza ${percento}%`} />
        </div>

        {approvato && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 max-sm:hidden">
            Il POS approvato si legge soltanto. Per cambiarlo apri una nuova revisione: torna in bozza e va riapprovato. L'approvazione nell'app non sostituisce le firme sul documento.
          </p>
        )}
        {!puoScrivere && <p className="mt-3 text-xs text-muted-foreground">Sei in sola lettura.</p>}
      </div>

      {guidaAttiva && !ro ? (
        <div role="region" aria-label="Compilazione guidata del POS" className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/95 p-2 backdrop-blur">
          <div className="min-w-0 text-sm" aria-live="polite">
            <p className="font-medium">{vociGuida.length ? `${vociGuida.length} ${vociGuida.length === 1 ? "voce da completare" : "voci da completare"}` : "Controlli completati"}</p>
            {indiceGuida >= 0 && <p className="max-w-lg truncate text-xs text-muted-foreground max-sm:max-w-[calc(100vw-5rem)]">{vociGuida[indiceGuida].testo}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {prossimaVoce ? <>
              <Button type="button" size="sm" onClick={() => vaiAVoce(prossimaVoce)}>Prossima voce <ArrowRight className="size-4" aria-hidden /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setMancantiServer(vociGuida)}>Elenco</Button>
            </> : <Button type="button" size="sm" onClick={() => void approvaOra()} disabled={approva.isPending || salva.isPending || proponendo}>Approva e genera PDF</Button>}
            <Button type="button" size="sm" variant="ghost" aria-label="Esci dalla compilazione guidata" onClick={() => setGuidaAttiva(false)}>Esci</Button>
          </div>
        </div>
      ) : <>
        {!ro && !!vociGuida.length && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Compila il POS</p>
            <p className="text-xs text-muted-foreground">Recupera dati e testi già disponibili, poi verifica la bozza.</p>
          </div>
          <Dialog open={preparazioneAperta} onOpenChange={setPreparazioneAperta}>
            <DialogTrigger asChild>
              <Button type="button" size="sm">Prepara la bozza POS <ArrowRight className="size-4" aria-hidden="true" /></Button>
            </DialogTrigger>
            {preparazioneAperta && <PreparaBozzaPos bozza={bozza} fonte={datiApp?.contenuto} companyId={pos.company_id} orderId={pos.order_id}
              fontiInCaricamento={fontiInCaricamento} fontiNonDisponibili={fontiNonDisponibili} rileggiFonti={rileggiFonti}
              onClose={() => setPreparazioneAperta(false)} onContinua={preparata => {
                if (preparata) {
                  modifiche.current++;
                  setBozza(prev => {
                    invalidaRiesameTecnico(prev, preparata);
                    return preparata;
                  });
                  setSporco(true);
                }
                setPreparazioneAperta(false);
              }} onVaiAllaVerifica={avviaGuida} />}
          </Dialog>
        </div>}
        <BarraSezioniPos sempreVisibile={anteprimaAffiancata} sezioni={sezioniMenu} onVai={vaiASezione} percento={percento} mancantiTotali={mancanti.length}
          onMostraMancanti={() => setMancantiServer(mancanti)}
          onComprimiComplete={() => sezioniApertura.comprimiComplete((id) => perSezione.get(id) ?? 0)} onEspandiTutto={sezioniApertura.espandiTutto} />
      </>}

      {erroreApprovazione&&<div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"><p className="font-medium">POS non approvato</p><p>{erroreApprovazione}</p></div>}

      {!ro && fontiNonDisponibili && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Le fonti aggiornate della commessa non sono disponibili.</p>
          <Button size="sm" variant="outline" onClick={() => setAggiornaAperto(true)}>Rileggi le fonti</Button>
        </div>
      )}
      <AvvioSicurezzaPos companyId={pos.company_id} orderId={pos.order_id} solaLettura={!puoScrivere || approva.isPending}
        idImpostazioni="pos-impostazioni-psc"
        vaiAllaLettura={pscAllineato ? () => vaiASezione("psc") : undefined}
        usaNelPos={!ro ? (riferimento) => {
          if (bozza.procedure_psc.psc_presente !== !!riferimento || !stessoRiferimentoPsc(bozza.procedure_psc.documento, riferimento)) {
            modifica((x) => {
              x.versione_psc = 1;
              x.procedure_psc.psc_presente = !!riferimento;
              if (riferimento) x.procedure_psc.documento = riferimento;
              else {
                delete x.procedure_psc.documento;
                x.procedure_psc.richieste = false;
              }
            });
          }
          if (riferimento) vaiASezione("psc");
        } : undefined} />
      {(erroreAvvio || (approvato && prossimo)) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {erroreAvvio || prossimo}
      </p>}

      {avvisi.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <ul className="flex-1 space-y-0.5">{avvisi.map((a) => <li key={a}>{a}</li>)}</ul>
          <button type="button" onClick={() => setAvvisi([])} aria-label="Chiudi gli avvisi" className="rounded p-1 hover:bg-amber-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      <EmissioniPos key={`${companyId}:${pos.id}`} companyId={companyId||pos.company_id} posId={pos.id} approvato={approvato}/>

      <div className={`grid gap-4 ${anteprimaAffiancata ? "grid-cols-[minmax(0,1fr)_minmax(340px,40%)]" : "lg:grid-cols-[200px_minmax(0,1fr)]"}`}>
        <div className={anteprimaAffiancata ? "hidden" : "contents"}>
          <NavSezioniPos sezioni={sezioniMenu} onVai={vaiASezione}
            onComprimiComplete={() => sezioniApertura.comprimiComplete((id) => perSezione.get(id) ?? 0)} onEspandiTutto={sezioniApertura.espandiTutto} />
        </div>

        <AperturaSezioniContext.Provider value={sezioniApertura}>
        <div className="min-w-0 space-y-4">
          <SezioneOpera {...baseProps} mancanti={perSezione.get("opera") ?? 0} />
          <SezioneImpresa {...baseProps} mancanti={perSezione.get("impresa") ?? 0} />
          <SezioneFigure {...baseProps} mancanti={perSezione.get("figure") ?? 0} />
          <SezioneEmergenze {...baseProps} lettura={contestoLetturaPsc} mancanti={perSezione.get("emergenze") ?? 0} />
          <SezioneLavoratori {...baseProps} mancanti={perSezione.get("lavoratori") ?? 0} organico={datiApp?.contesto.organico}
            confronta={() => setAggiornaAperto(true)} />
          <SezioneFormazione {...baseProps} mancanti={perSezione.get("formazione") ?? 0} />
          <SezioneRumore {...baseProps} companyId={pos.company_id} orderId={pos.order_id} posId={pos.id} salvaPrimaDellaLettura={sporco ? salvaOra : undefined} allegatiSalvati={pos.contenuto.allegati} mancanti={perSezione.get("rumore") ?? 0} />
          <SezioneLavorazioni {...baseProps} companyId={pos.company_id} orderId={pos.order_id} posId={pos.id} puoLeggereComputo={puoLeggereComputo} mancanti={perSezione.get("lavorazioni") ?? 0}
            vociDaCompletare={mancanti} contesto={datiApp?.contesto ?? null} pscVigente={avvio?.stato === "non_previsto" ? null : avvio?.psc} onProponiAi={apriProposteAi} proponendo={proponendo} />
          <SezionePsc {...baseProps} companyId={pos.company_id} orderId={pos.order_id} lettura={contestoLetturaPsc} onLetturaPronta={ro ? undefined : apriProposteAi} mancanti={perSezione.get("psc") ?? 0} />
          {companyId && <SezioneAllegati {...baseProps} mancanti={perSezione.get("allegati") ?? 0} companyId={companyId} posId={pos.id} />}

          {/* 11. Firme e consegna: si segna anche dopo l'approvazione */}
          <section id="pos-iter" className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby="pos-iter-titolo">
            <header className="border-b px-4 py-3">
              <h2 id="pos-iter-titolo" className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">11</span>
                Firme e consegna
              </h2>
              <p className="mt-0.5 pl-8 text-[11px] text-muted-foreground">Art. 101 comma 3 del D.Lgs 81/2008</p>
            </header>
            <div className="space-y-4 p-4">
              {(subappalto || conCse) && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Prima di iniziare, l'impresa esecutrice consegna il POS all'impresa affidataria, che ne verifica la congruenza e lo trasmette al coordinatore per l'esecuzione.
                  I lavori iniziano solo dopo l'esito positivo delle verifiche, che vanno fatte entro 15 giorni dalla ricezione.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo id="iter-firma" label="Firmato dal datore di lavoro il" type="date" value={iter.firma_datore_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                  onChange={(v) => modificaIter((x) => ({ ...x, firma_datore_il: v || null }))} />
                <Campo id="iter-rls" label="RLS / RLST consultato il" type="date" value={iter.consultazione_rls_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                  onChange={(v) => modificaIter((x) => ({ ...x, consultazione_rls_il: v || null }))} />
              </div>
              {approvato && (
                <CopiaFirmataSezione companyId={companyId || pos.company_id} posId={pos.id} revisione={pos.revisione} emissioneId={emissioneCorrente?.id ?? null} puoCaricare={puoScrivere}
                  onCaricata={(data) => { if (data && !iter.firma_datore_il) modificaIter((x) => ({ ...x, firma_datore_il: data })); }} />
              )}
              {subappalto && (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                    <h3 className="text-sm font-semibold">Impresa affidataria: {bozza.impresa.subappalto_a || "da indicare"}</h3>
                    {approvato && puoScrivere && !erroreAvvio && invio("affidataria")}
                  </div>
                  <Campo id="iter-aff-inv" label="Consegnato il" type="date" value={iter.affidataria_inviato_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_inviato_il: v || null }))} />
                  <Campo id="iter-aff-ricezione" label="Ricevuto il" type="date" value={iter.affidataria_ricevuto_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                    hint={iter.affidataria_ricevuto_il ? `Verifica entro il ${dataIt(piu15(iter.affidataria_ricevuto_il))}` : undefined}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_ricevuto_il: v || null }))} />
                  <EsitoSelect id="iter-aff-esito" value={iter.affidataria_esito ?? null} readOnly={!puoScrivere || approva.isPending}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_esito: v }))} />
                  <Campo id="iter-aff-data" label="Data dell'esito" type="date" value={iter.affidataria_esito_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                    onChange={(v) => modificaIter((x) => ({ ...x, affidataria_esito_il: v || null }))} />
                </div>
              )}
              {conCse && (
                <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                    <h3 className="text-sm font-semibold">Coordinatore per l'esecuzione (CSE)</h3>
                    {approvato && puoScrivere && !erroreAvvio && !subappalto && invio("cse")}
                  </div>
                  {subappalto && <p className="text-xs text-muted-foreground sm:col-span-3">Registra qui il passaggio effettuato dall’impresa affidataria e il riscontro del CSE.</p>}
                  <Campo id="iter-cse-inv" label="Trasmesso il" type="date" value={iter.cse_inviato_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_inviato_il: v || null }))} />
                  <Campo id="iter-cse-ricezione" label="Ricevuto dal CSE il" type="date" value={iter.cse_ricevuto_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                    hint={iter.cse_ricevuto_il ? `Verifica entro il ${dataIt(piu15(iter.cse_ricevuto_il))}` : undefined}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_ricevuto_il: v || null }))} />
                  <EsitoSelect id="iter-cse-esito" value={iter.cse_esito ?? null} readOnly={!puoScrivere || approva.isPending}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_esito: v }))} />
                  <Campo id="iter-cse-data" label="Data dell'esito" type="date" value={iter.cse_esito_il ?? ""} readOnly={!puoScrivere || approva.isPending}
                    onChange={(v) => modificaIter((x) => ({ ...x, cse_esito_il: v || null }))} />
                </div>
              )}
              {verificaNegativa && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  Verifica con esito negativo: i lavori non possono iniziare. Apri una nuova revisione e correggi il POS.
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="iter-note" className="text-xs font-medium text-slate-700">Note</Label>
                <Textarea id="iter-note" rows={2} value={iter.note ?? ""} disabled={!puoScrivere || approva.isPending}
                  onChange={(e) => modificaIter((x) => ({ ...x, note: e.target.value || null }))} />
              </div>
            </div>
          </section>
        </div>
        </AperturaSezioniContext.Provider>
        {anteprimaAffiancata && <aside aria-label="Anteprima PDF dal vivo" className={`sticky top-20 flex min-h-0 min-w-0 flex-col gap-2 self-start ${sporco || iterSporco ? "h-[calc(100dvh-10rem)]" : "h-[calc(100dvh-7rem)]"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Anteprima della bozza in modifica</p>
            <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Chiudi pannello PDF" onClick={() => {
              setAnteprimaAperta(false);
              pulsanteAnteprima.current?.focus({ preventScroll: true });
            }}><X className="size-4" aria-hidden="true" /></Button>
          </div>
          <div className="min-h-0 flex-1">{anteprimaBozza}</div>
        </aside>}
      </div>

      {anteprimaAperta && !anteprimaAffiancata && !approvato && <Dialog open onOpenChange={setAnteprimaAperta}>
        <DialogContent className="flex h-[100dvh] max-h-none max-w-none flex-col gap-2 overflow-hidden rounded-none p-3 sm:h-[92dvh] sm:max-w-4xl sm:rounded-xl"
          onCloseAutoFocus={event => {
            event.preventDefault();
            pulsanteAnteprima.current?.focus({ preventScroll: true });
          }}>
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>Anteprima PDF dal vivo</DialogTitle>
            <DialogDescription className="sr-only">PDF della bozza in modifica.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">{anteprimaBozza}</div>
        </DialogContent>
      </Dialog>}

      {companyId && <StoricoContenutiPos companyId={companyId} posId={pos.id} codiceCommessa={pos.commessa?.order_code} />}

      {/* Barra di salvataggio */}
      {(sporco || iterSporco) && puoScrivere && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Modifiche non salvate</span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={salva.isPending||approva.isPending} onClick={() => {
                modifiche.current++; versioneLetta.current=pos.updated_at;
                setBozza(contenutoDiPartenza()); setIter(pos.iter); setSporco(!!precompilato || aggiornaControlli); setIterSporco(false);
              }}>Annulla</Button>
              <Button onClick={() => void salvaOra()} disabled={salva.isPending||approva.isPending}>
                {salva.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salva
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Voci mancanti */}
      <Dialog open={!!mancantiServer} onOpenChange={(o) => !o && setMancantiServer(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto" onCloseAutoFocus={event => {
          const destinazione = destinazioneElenco.current;
          if (!destinazione) return;
          event.preventDefault();
          destinazioneElenco.current = null;
          if (typeof destinazione === "string") vaiASezione(destinazione);
          else vaiAVoce(destinazione);
        }}>
          <DialogHeader>
            <DialogTitle>{guidaAttiva ? "Voci da completare" : "Il POS non ha ancora tutti i contenuti minimi"}</DialogTitle>
            <DialogDescription>
              Scegli una voce per aprirla nella bozza.
            </DialogDescription>
          </DialogHeader>
          <CosaManca voci={mancantiServer ?? []} lavorazioni={bozza.lavorazioni} ro={ro}
            onVai={(sezione, voce) => {
              destinazioneElenco.current = voce ?? sezione;
              setMancantiServer(null);
            }}
            onConfermaProdotti={(ids) => {
              const applica = (x: PosContenuto) => { for (const l of x.lavorazioni) if (ids.includes(l.id)) l.prodotti_riesaminati = true; };
              modifica(applica);
              const dopo = structuredClone(bozza); applica(dopo);
              const restano = vociMancanti(dopo);
              setMancantiServer(restano.length ? restano : null);
              toast.success(ids.length === 1 ? "Elenco dei prodotti confermato" : `Elenco dei prodotti confermato per ${ids.length} lavorazioni`);
            }} />
        </DialogContent>
      </Dialog>

      {aggiornaAperto && companyId && !ro && <ConfrontoFontiPos companyId={companyId} posId={pos.id} bozza={bozza}
        onClose={()=>setAggiornaAperto(false)} onApplica={(contenuto,avvisiFonti)=>{
          modifiche.current++;setBozza(prev=>{invalidaRiesameTecnico(prev,contenuto);return contenuto;});setSporco(true);setAvvisi(avvisiFonti);setAggiornaAperto(false);
          toast.success("Modifiche applicate alla bozza: controlla e salva");
        }}/>}

      {perimetroAi && !ro && <PerimetroAiPos companyId={pos.company_id} orderId={pos.order_id} posId={pos.id} inSubappalto={subappalto} psc={contestoLetturaPsc}
        iniziale={perimetroAi} occupato={proponendo} errore={erroreProposte} onClose={() => setPerimetroAi(null)} onGenera={proponiAi} />}
      {proposte && !ro && <RevisioneProposteAiPos risultato={proposte} modalitaVuota={!bozza.opera.modalita_organizzative.trim()} destinazioneId={proposte.destinazioneId}
        preesistenti={bozza.lavorazioni} onClose={() => setProposte(null)} onApplica={(lavorazioni, modalita, aggiornamenti) => {
          modifica(d => {
            if (modalita && !d.opera.modalita_organizzative.trim()) {
              d.opera.modalita_organizzative = modalita;
              d.opera.modalita_organizzative_da_verificare = true;
            }
            for (const proposta of lavorazioni) {
              const scelta = aggiornamenti[proposta.id];
              if (!scelta) {
                if (!d.lavorazioni.some(l => stessaLavorazionePos(proposta, l))) d.lavorazioni.push(proposta);
                continue;
              }
              const esistente = d.lavorazioni.find(l => l.id === scelta.id);
              if (!esistente) continue;
              if (scelta.modo === "testi") {
                inserisciTestiLavorazione(esistente, proposta, "ai");
                continue;
              }
              if (!proposta.fonti_scheda) continue;
              const quesiti = esistente.fonti_scheda?.quesiti ?? [];
              const nuovi = (proposta.fonti_scheda.quesiti ?? []).filter(q => !quesiti.some(x => x.domanda === q.domanda));
              esistente.fonti_scheda = {
                ...esistente.fonti_scheda, ...proposta.fonti_scheda, quesiti: [...quesiti, ...nuovi].slice(0, 8),
              };
              esistente.origine = "ai";
              esistente.verificata = false;
              if (esistente.tecnica) esistente.tecnica.riesaminata = false;
            }
          });
          setProposte(null);
          vaiASezione(lavorazioni.length ? "lavorazioni" : "opera");
        }} />}

      {/* Nuova revisione */}
      <Dialog open={revisioneAperta} onOpenChange={setRevisioneAperta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova revisione (rev. {pos.revisione + 1})</DialogTitle>
            <DialogDescription>
              Il POS torna in bozza per le modifiche e va riapprovato. Le date di firma e verifica ripartono da capo. Se ne hai già consegnato copia, avvisa chi l'ha ricevuta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="descr-rev" className="text-xs font-medium">Cosa cambia in questa revisione</Label>
            <Textarea id="descr-rev" rows={2} value={descrRevisione} onChange={(e) => setDescrRevisione(e.target.value)}
              placeholder="Es.: nuova fase di lavori in quota sul tetto" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRevisioneAperta(false)}>Annulla</Button>
            <Button disabled={!descrRevisione.trim() || nuovaRevisione.isPending} onClick={async () => {
              try {
                await nuovaRevisione.mutateAsync(descrRevisione.trim());
                setRevisioneAperta(false);
              } catch {
                // l'errore lo mostra la mutation
              }
            }}>
              {nuovaRevisione.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Apri la revisione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
}

function EsitoSelect({ id, value, onChange, readOnly }: { id: string; value: "positivo" | "negativo" | null; onChange: (v: "positivo" | "negativo" | null) => void; readOnly: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-slate-700">Esito della verifica</Label>
      <UniformSelect
        id={id}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value ?? ""}
        disabled={readOnly}
        onChange={(e) => onChange((e.target.value || null) as "positivo" | "negativo" | null)}
      >
        <option value="">In attesa</option>
        <option value="positivo">Positivo</option>
        <option value="negativo">Negativo</option>
      </UniformSelect>
    </div>
  );
}
