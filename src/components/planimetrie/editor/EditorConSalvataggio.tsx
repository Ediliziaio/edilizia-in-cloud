/**
 * L'editor dentro una pagina dell'app: testata con «Salva», avvisi, conflitto di
 * versione. La pianta si crea al primo salvataggio (se non esiste ancora), poi ogni
 * salvataggio è una versione nuova; alla fine si torna alla scheda della pianta.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Box, Info, Loader2, Maximize2, Minimize2, RotateCcw, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { chiaviPlanimetrie, creaPlanimetria, salvaNuovaVersione, type CollegamentiPlanimetria, type OrigineVersione } from "@/lib/planimetrie/archivio";
import { percorsoProgettoAssociato, percorsoVariantePlanimetria, percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { apriComputoDaVariante } from "@/lib/planimetrie/computoDaVariante";
import { useAuth } from "@/contexts/AuthContext";
import EditorPlanimetria from "./EditorPlanimetria";
import { archivioRicalco } from "@/lib/planimetrie/ricalco";
import type { Planimetria } from "./adattatore";
import { salvaPianta } from "./salvataggio";
import { usePermissions } from "@/hooks/usePermissions";
import { EffettoPrezzo } from "../EffettoPrezzo";
import { CostoProposta } from "../CostoProposta";
import { effettoSulPrezzo, useRigheCollegate } from "@/lib/planimetrie/effettoPrezzo";
import { calcolaQuantita } from "../../../../shared/planimetrie/quantita.ts";
import type { SorgenteDocumentoPianta } from "../ConfrontoDocumentoPianta";
import { Vista3DPigra } from "../Vista3DPigra";
import { pianiDaPlanimetria, type PianoPer3D } from "@/lib/planimetrie/tred";
import type { Vista } from "./comandi";
import type { VistaChatDisegno } from "./comandiChat";

const RenderCasaDialog = lazy(() => import("./RenderCasaDialog"));

interface Props {
  companyId: string;
  titoloPagina: string;
  sottotitoloPagina?: string;
  indietro?: string;
  tornaDopoSalvataggio?: string;
  /** La pianta da aprire; senza, una pianta vuota. */
  iniziale?: Planimetria;
  livelloIniziale?: string;
  propostaIniziale?: string;
  muroIniziale?: string;
  /** Pianta già salvata: si aggiunge una versione. Senza: si crea al primo salvataggio. */
  planimetriaId?: string;
  versioneAttesa?: number;
  /** Per una pianta nuova: il nome proposto. */
  titoloProposto?: string;
  /** Per una pianta nuova: a cosa è collegata (es. la commessa di un'unità). */
  collegamenti?: CollegamentiPlanimetria;
  /** Da dove viene la pianta (per la prima versione salvata). */
  origine?: OrigineVersione;
  /** Frasi da mostrare sopra il disegno (es. «controlla le misure del bagno»). */
  avvisi?: string[];
  /** Un riquadro sopra il disegno, per esempio la conferma della scala. */
  sopra?: ReactNode;
  sorgenteDocumento?: SorgenteDocumentoPianta;
  tavoleDaRicalcare?: Readonly<Record<string, File>>;
  onSalvata?: (salvataggio: { id: string; versione: number; documento: Planimetria }) => void;
  onModificaDisegno?: (documento: Planimetria) => void;
  nelComputo?: Pick<ComponentProps<typeof EditorPlanimetria>, "ambitoComputo" | "inSilvio" | "onSelezione" | "controlli" | "onPropostaComputo" | "onRivediNelComputo" | "puoRivedereNelComputo"> & {
    modifica: boolean;
    annulla?: () => void;
    onStatoChat?: (occupata: boolean) => void;
  };
}

export function EditorConSalvataggio({
  companyId,
  titoloPagina,
  sottotitoloPagina,
  indietro,
  tornaDopoSalvataggio,
  iniziale,
  livelloIniziale,
  propostaIniziale,
  muroIniziale,
  planimetriaId,
  versioneAttesa,
  titoloProposto = "",
  collegamenti,
  origine = "manuale",
  avvisi: avvisiPassati,
  sopra,
  sorgenteDocumento,
  tavoleDaRicalcare,
  onSalvata,
  onModificaDisegno,
  nelComputo,
}: Props) {
  const navigate = useNavigate();
  const avvisi = avvisiPassati ?? [];
  const queryClient = useQueryClient();
  const ricalcoArchivio = useMemo(() => archivioRicalco(companyId), [companyId]);
  const urlTavole = useRef(new Map<string, string>());
  useEffect(() => {
    const urls = urlTavole.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); };
  }, [tavoleDaRicalcare]);
  const ricalcoEditor = useMemo(() => {
    if (!tavoleDaRicalcare) return ricalcoArchivio;
    return {
      ...ricalcoArchivio,
      url: (percorso: string) => {
        const tavola = Object.hasOwn(tavoleDaRicalcare, percorso) ? tavoleDaRicalcare[percorso] : null;
        if (!tavola) return ricalcoArchivio.url(percorso);
        const url = urlTavole.current.get(percorso) ?? URL.createObjectURL(tavola);
        urlTavole.current.set(percorso, url);
        return Promise.resolve(url);
      },
    };
  }, [ricalcoArchivio, tavoleDaRicalcare]);
  const [titolo, setTitolo] = useState(titoloProposto);
  const [salvando, setSalvando] = useState(false);
  const salvataggioInCorso = useRef(false);
  // Schermo intero: sul tablet il menu e la testata della pagina tolgono metà del disegno.
  const [intero, setIntero] = useState(false);
  useEffect(() => {
    if (!intero) return;
    const esci = (e: KeyboardEvent) => { if (e.key === "Escape") setIntero(false); };
    window.addEventListener("keydown", esci);
    return () => window.removeEventListener("keydown", esci);
  }, [intero]);
  // utente in sola lettura: la pianta si guarda, non si salva (il database lo rifiuterebbe comunque)
  const { solaLettura, canViewPreventivi, canEditPreventivi } = usePermissions();
  const puoModificareDisegno = !solaLettura && (nelComputo?.modifica ?? true);
  const { user } = useAuth();
  const [conflitto, setConflitto] = useState<string | null>(null);
  const documento = useRef<Planimetria | null>(null);
  const contesto = useRef({ livelloId: livelloIniziale, ambito: propostaIniziale ? `progetto:${propostaIniziale}` : "fatto" });
  // L'ambito serve anche a schermo, per il costo della variante: oltre al riferimento, uno stato.
  const [ambitoPrezzo, setAmbitoPrezzo] = useState(propostaIniziale ? `progetto:${propostaIniziale}` : "fatto");
  const cambiaContesto = useCallback((livelloId: string | undefined, ambito: string) => { contesto.current = { livelloId, ambito }; setAmbitoPrezzo(ambito); }, []);
  const cambi = useRef(0);
  const sorgenteCaricata = useRef<Promise<string> | null>(null);
  const tavoleCaricate = useRef(new Map<string, Promise<string>>());
  const [modificata, setModificata] = useState(!planimetriaId && !!iniziale);
  const [affiancata3D, setAffiancata3D] = useState(false);
  const bottoneAnteprima3D = useRef<HTMLButtonElement>(null);
  const [anteprima3D, setAnteprima3D] = useState<{ piani: PianoPer3D[]; vista: Vista; livelloId?: string } | null>(null);
  const [renderCasa, setRenderCasa] = useState<{ documento: Planimetria; vista: Vista; propostaId: string; modo: Exclude<VistaChatDisegno,"3d"> } | null>(null);
  const [anteprimaChat, setAnteprimaChat] = useState(false);

  const nuova = !planimetriaId;

  // Effetto sul prezzo: le quantità si ricalcolano poco dopo l'ultima modifica, non a ogni tratto.
  const collegate = useRigheCollegate(nelComputo ? undefined : planimetriaId);
  const [perPrezzo, setPerPrezzo] = useState<Planimetria | null>(null);
  // Com'era la pianta all'apertura: il costo della variante si confronta con quello.
  const [allApertura, setAllApertura] = useState<Planimetria | null>(null);
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (attesa.current) clearTimeout(attesa.current); }, []);
  const effetti = useMemo(
    () => (perPrezzo && collegate.data?.length ? effettoSulPrezzo(collegate.data, calcolaQuantita(perPrezzo)) : []),
    [perPrezzo, collegate.data],
  );
  const suCambio = useCallback((p: Planimetria) => {
    if (documento.current === p) return;
    documento.current = p;
    if (attesa.current) clearTimeout(attesa.current);
    attesa.current = setTimeout(() => setPerPrezzo(p), 400);
    setAllApertura((prima) => prima ?? p);
    // il primo arriva all'apertura: non è una modifica
    cambi.current += 1;
    if (cambi.current > 1) {
      setModificata(true);
      onModificaDisegno?.(p);
    }
  }, [onModificaDisegno]);

  // Protegge anche «Indietro» e le altre voci del menu dell'app.
  useSettingsDraftGuard(!nelComputo && modificata);
  const onStatoChat = nelComputo?.onStatoChat;
  const cambiaStatoChat = useCallback((occupata: boolean) => {
    setAnteprimaChat(occupata);
    onStatoChat?.(occupata);
  }, [onStatoChat]);

  const chiudiAffiancata3D = () => {
    setAffiancata3D(false);
    bottoneAnteprima3D.current?.focus({ preventScroll: true });
  };

  const salva = async (destinazione?: "studio" | "computo") => {
    if (!documento.current || salvataggioInCorso.current || !puoModificareDisegno || anteprimaChat) return;
    salvataggioInCorso.current = true;
    setSalvando(true);
    let daSalvare = documento.current;
    const ambitoSalvato = contesto.current;
    try {
      if (tavoleDaRicalcare) {
        const livelli = [];
        for (const piano of daSalvare.livelli) {
          const ricalco = piano.ricalco;
          const tavola = ricalco && Object.hasOwn(tavoleDaRicalcare, ricalco.percorso) ? tavoleDaRicalcare[ricalco.percorso] : null;
          if (!ricalco || !tavola) { livelli.push(piano); continue; }
          const caricamento = tavoleCaricate.current.get(ricalco.percorso) ?? ricalcoArchivio.carica(tavola);
          tavoleCaricate.current.set(ricalco.percorso, caricamento);
          try {
            livelli.push({ ...piano, ricalco: { ...ricalco, percorso: await caricamento } });
          } catch (error) {
            tavoleCaricate.current.delete(ricalco.percorso);
            throw error;
          }
        }
        daSalvare = { ...daSalvare, livelli };
      }
      if (sorgenteDocumento && daSalvare.letturaDocumento && !daSalvare.letturaDocumento.sorgente) {
        sorgenteCaricata.current ??= ricalcoArchivio.carica(new File([sorgenteDocumento.file], sorgenteDocumento.nome, { type: sorgenteDocumento.file.type }));
        let percorso: string;
        try { percorso = await sorgenteCaricata.current; } catch (e) { sorgenteCaricata.current = null; throw e; }
        daSalvare = { ...daSalvare, letturaDocumento: { ...daSalvare.letturaDocumento, sorgente: { percorso, nome: sorgenteDocumento.nome.slice(0, 250) } } };
      }
    } catch (e) { salvataggioInCorso.current = false; setSalvando(false); toast.error(e instanceof Error ? e.message : "Tavola non salvata. Riprova."); return; }
    const esito = await salvaPianta(
      { crea: creaPlanimetria, salva: salvaNuovaVersione },
      {
        companyId,
        documento: daSalvare,
        planimetriaId,
        titolo,
        versioneAttesa,
        // la prima versione dice da dove viene la pianta (a mano, dall'AI…); le successive sono modifiche a mano
        origine: nuova ? origine : "manuale",
        collegamenti,
      },
    );
    if (esito.ok === false) {
      salvataggioInCorso.current = false;
      setSalvando(false);
      if (esito.conflitto) setConflitto(esito.messaggio);
      else toast.error(esito.messaggio);
      return;
    }
    setModificata(false);
    // non si aspetta il ricaricamento: si torna subito alla scheda, che rilegge da sola i dati segnati come vecchi
    void queryClient.invalidateQueries({ queryKey: chiaviPlanimetrie.tutte });
    const differenza = effetti.reduce((t, e) => t + e.totale, 0);
    toast.success(esito.creata ? "Pianta salvata" : `Pianta salvata (versione ${esito.versione})`, effetti.length ? {
      description: `${effetti.length === 1 ? "Un computo collegato cambia" : `${effetti.length} computi collegati cambiano`} di ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", signDisplay: "exceptZero" }).format(differenza)}: aggiornalo dalla commessa («La pianta è cambiata»).`,
      duration: 10_000,
    } : undefined);
    try {
      if (onSalvata) {
        onSalvata({ id: esito.id, versione: esito.versione, documento: daSalvare });
        return;
      }
      if (destinazione && ambitoSalvato.ambito.startsWith("progetto:")) {
        const fonte = { planimetriaId: esito.id, versione: esito.versione, varianteId: ambitoSalvato.ambito.slice(9) };
        if (destinazione === "computo" && canEditPreventivi && user) {
          try {
            const { id } = await apriComputoDaVariante(companyId, user.id, fonte);
            navigate(`/azienda/marketing/preventivi/computo?${new URLSearchParams({ bozza: id, esistente: "1", fase: "3" })}`);
            return;
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Il computo della variante non è disponibile.");
          }
        }
        navigate(percorsoVariantePlanimetria(fonte, { studio: true, livello: ambitoSalvato.livelloId }));
        return;
      }
      navigate(tornaDopoSalvataggio && tornaDopoSalvataggio!==percorsiPlanimetrie.elenco
        ? percorsoProgettoAssociato(esito.id,tornaDopoSalvataggio) : percorsiPlanimetrie.pianta(esito.id, ambitoSalvato.livelloId, ambitoSalvato.ambito));
    } finally {
      salvataggioInCorso.current = false;
      setSalvando(false);
    }
  };

  const azioni = (
    <>
      {nuova && (
        <Input
          aria-label="Nome della pianta"
          disabled={salvando}
          value={titolo}
          maxLength={200}
          placeholder="Nome della planimetria"
          className="h-9 w-56 bg-muted/25 max-md:w-44"
          onChange={(e) => setTitolo(e.target.value)}
        />
      )}
      {!nelComputo && <Button variant="outline" size="icon" className="h-9 w-9 max-md:hidden" aria-label={intero ? "Esci da schermo intero" : "Schermo intero"} title={intero ? "Esci da schermo intero (Esc)" : "Schermo intero"} onClick={() => setIntero((v) => !v)}>
        {intero ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>}
      {!nelComputo && <EffettoPrezzo effetti={effetti} collegati={collegate.data?.length ?? 0} />}
      {!nelComputo && companyId && perPrezzo && allApertura && <span className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 empty:hidden dark:border-teal-900 dark:bg-teal-950/25 max-md:hidden" title="Costo dei lavori della variante, ricalcolato dopo ogni modifica"><CostoProposta documento={allApertura} proposta={perPrezzo} ambito={ambitoPrezzo} companyId={companyId} /></span>}
      {/* Sul telefono resta la sola icona: il nome della pianta ha bisogno di quello spazio. */}
      <Button ref={bottoneAnteprima3D} size="sm" variant={affiancata3D ? "secondary" : "outline"} aria-pressed={affiancata3D} aria-label="Anteprima 3D"
        onClick={() => setAffiancata3D(aperta => !aperta)} disabled={salvando} className="gap-2 max-md:px-2.5" title="Mostra la pianta e il 3D insieme">
        <Box className="h-4 w-4" aria-hidden="true" /> <span className="max-md:hidden">Anteprima 3D</span>
      </Button>
      {nelComputo?.annulla && modificata && <Button type="button" variant="ghost" size="sm" disabled={salvando || anteprimaChat} onClick={nelComputo.annulla}>Annulla modifiche</Button>}
      {puoModificareDisegno && !nelComputo?.onRivediNelComputo && <Button size="sm" onClick={() => void salva()} disabled={salvando || anteprimaChat || (!modificata && !nuova) || (nuova && !titolo.trim())}
        title={anteprimaChat ? "Applica o scarta la proposta prima di salvare" : undefined}>
        {salvando ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Save className="h-4 w-4" />}
        {nelComputo ? "Salva pianta" : "Salva"}
      </Button>}
    </>
  );
  const statoPianta = anteprimaChat ? "Anteprima della chat" : modificata ? "Modifiche da salvare" : nuova ? "" : "Versione salvata";
  return (
    <div className={nelComputo ? "quote-wizard-ai-project-editor flex min-w-0 flex-col gap-2" : intero ? "fixed inset-0 z-50 flex flex-col gap-2 bg-background p-3" : "flex h-[max(760px,calc(100dvh-7rem))] flex-col gap-3 pb-2 max-md:h-[calc(100dvh-11.5rem)] max-md:min-h-[420px] max-md:gap-2"}>
      {nelComputo ? <div className="flex flex-wrap items-center justify-between gap-2">
        {statoPianta && (!nelComputo.inSilvio || anteprimaChat || modificata) && <p role="status" className="text-xs text-muted-foreground">{statoPianta}</p>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">{azioni}</div>
      </div> : <div className="shrink-0 rounded-xl border bg-background px-2.5 py-2.5 shadow-sm sm:px-3">
        <TestataPlanimetrie compatta indietro={indietro} titolo={titoloPagina}
          sottotitolo={[sottotitoloPagina, statoPianta].filter(Boolean).join(" · ")} azioni={azioni} />
      </div>}

      {conflitto && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{conflitto}</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw className="mr-2 h-4 w-4" /> Ricarica
          </Button>
        </div>
      )}

      {avvisi.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="space-y-0.5">
            {avvisi.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {!nelComputo && iniziale?.riferimenti?.note && <details className="shrink-0 rounded-lg border bg-card px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Appunti della pianta</summary>
        <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{iniziale.riferimenti.note}</p>
      </details>}

      {sopra}

      <EditorPlanimetria companyId={companyId} className={nelComputo ? "quote-wizard-ai-project-canvas h-[min(56dvh,575px)] min-h-[440px]" : "min-h-0 flex-1"} piantaIniziale={iniziale} livelloIniziale={livelloIniziale} propostaIniziale={propostaIniziale}
        muroIniziale={muroIniziale}
        onChange={suCambio} onContesto={cambiaContesto} onAnteprimaChat={cambiaStatoChat} ricalco={ricalcoEditor} sorgenteDocumento={sorgenteDocumento}
        ambitoComputo={nelComputo?.ambitoComputo} inSilvio={nelComputo?.inSilvio} onSelezione={nelComputo?.onSelezione} controlli={nelComputo?.controlli}
        onPropostaComputo={nelComputo?.onPropostaComputo} onRivediNelComputo={nelComputo?.onRivediNelComputo} puoRivedereNelComputo={nelComputo?.puoRivedereNelComputo}
        anteprima3DAperta={affiancata3D} onChiudiAnteprima3D={chiudiAffiancata3D}
        onApri3DCompleto={(documento, vista, propostaId, livelloId) => {
          setAnteprima3D({ piani: pianiDaPlanimetria(documento, vista === "progetto" ? propostaId : undefined), vista, livelloId });
        }}
        consentiListinoChat={canViewPreventivi} consentiComputoChat={!nelComputo && canEditPreventivi && !!user}
        onSalvaDaChat={!nelComputo && (!nuova || titolo.trim()) && !salvando ? destinazione => void salva(destinazione) : undefined}
        onVisteChat={(tipo, documento, vista, propostaId) => {
          if (tipo === "3d") setAffiancata3D(true);
          else setRenderCasa({ documento, vista, propostaId, modo:tipo });
        }}
        soloVista={!puoModificareDisegno || salvando || undefined} />
      {anteprima3D?.piani.length ? (
        <Dialog open onOpenChange={(open) => { if (!open) setAnteprima3D(null); }}>
          <DialogContent className="max-h-[94dvh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Anteprima 3D della pianta</DialogTitle>
              <DialogDescription>Esplora la geometria corrente e controlla l’allineamento dei piani.</DialogDescription>
            </DialogHeader>
            <Vista3DPigra piante={(anteprima3D.piani.find(p => p.id === anteprima3D.livelloId) ?? anteprima3D.piani[0]).piante}
              piani={anteprima3D.piani} livelloIniziale={anteprima3D.livelloId} versione={modificata || anteprimaChat ? undefined : versioneAttesa} edificioIniziale
              archivioInquadrature={planimetriaId ? { planimetriaId, livelloId: anteprima3D.livelloId ?? anteprima3D.piani[0].id } : undefined}
              nomeFile={titolo.trim() || titoloPagina}
              vistaIniziale={anteprima3D.vista} />
          </DialogContent>
        </Dialog>
      ) : null}
      {renderCasa && <Suspense fallback={<p role="status" className="sr-only">Apro i render della casa…</p>}>
        <RenderCasaDialog {...renderCasa} onChiudi={() => setRenderCasa(null)} />
      </Suspense>}
    </div>
  );
}
