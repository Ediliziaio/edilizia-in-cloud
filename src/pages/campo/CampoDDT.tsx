import { UniformSelect } from "@/components/ui/uniform-select";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Camera, Check, ChevronDown, CloudUpload, FileText, FileUp, HardHat, ImagePlus, Loader2, MoreVertical, Receipt, RotateCw, ScanLine, Sparkles, Trash2, Warehouse, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useCampoUfficio } from "@/hooks/campo/useCampoUfficio";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { AnteprimaFotoCampo } from "@/components/campo/AnteprimaFotoCampo";
import { cantiereBolla } from "@/lib/campo/cantiereBolla";
import { leggiByte } from "@/lib/files/leggiByte";
import { leggiScansioneBolla, scannerBolleDisponibile, scansionaBolla } from "@/lib/mobile/scannerBolle";
import { MAX_FORNITORE_DDT, MAX_NUMERO_DDT, proponiRiferimentiTelefono, riferimentiTelefonoValidi, type RiferimentiTelefono } from "@/lib/ddt/riferimentiTelefono";
import { MAX_RIGHE_VISTE, righeArticoloViste } from "@/lib/ddt/righeViste";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { compressImage } from "@/lib/campo/compressImage";
import {
  CompilaBollaTelefono,
  RevisioneBollaTelefono,
  puoCompilareSenzaAI,
  puoRegistrareBolle,
  useSalvaSoloDocumento,
} from "@/components/ddt/BollaTelefono";
import { destinazioneDocumento, type DocumentoPersistente } from "@/lib/ddt/documentiPersistenti";
import { useLetturaBolleTelefono } from "@/hooks/useImpostazioniAcquisti";
import { useDocumentiDDT, STATO_DOCUMENTO } from "@/hooks/useDocumentiDDT";
import {
  contaPagine,
  leggiPerDividere,
  type PdfDaDividere,
} from "@/lib/ddt/dividiPdf";
import { DividiPdfPannello } from "@/components/ddt/DividiPdfPannello";
import {
  syncQueue,
  syncItemScope,
  type SyncItem,
} from "@/lib/campo/sync-queue";
import {
  ACCEPT_DOCUMENTI_DDT,
  erroreDocumento,
  MAX_DOCUMENTO_BYTE,
  MAX_PAGINE_DDT,
  mimeDocumento,
} from "@/lib/ddt/preparaDocumento";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const campo = "min-h-12 w-full rounded-xl border bg-background px-3 text-base";
type PaginaBolla = { id: string; file: File };

function FotoBollaInCoda({ voce }: { voce: SyncItem }) {
  const t = useT();
  const pagine = useMemo(() => {
    const p = voce.payload as { files?: (ArrayBuffer | Blob)[]; fileTypes?: string[]; fileNames?: string[] };
    return (p.files ?? []).map((file, i) => {
      const tipo = p.fileTypes?.[i] || (file instanceof Blob ? file.type : "");
      const foto = tipo.startsWith("image/") && (file instanceof Blob || file instanceof ArrayBuffer)
        ? file instanceof Blob ? file : new Blob([file], { type: tipo }) : null;
      return { foto, nome: p.fileNames?.[i] || t("Pagina {n}", { n: i + 1 }) };
    });
  }, [voce.payload, t]);

  return <ul aria-label={t("Pagine della bolla conservata")} className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
    {pagine.map((pagina, i) => <li key={`${pagina.nome}:${i}`} className="min-w-0">
      {pagina.foto ? <AnteprimaFotoCampo foto={pagina.foto} etichetta={t("pagina in coda {n}", { n: i + 1 })} className="aspect-square h-auto" />
        : <div className="grid aspect-square place-items-center rounded-xl border bg-background" aria-label={pagina.nome}><FileText className="size-5" aria-hidden="true" /></div>}
      <p className="truncate text-xs" title={pagina.nome}>{pagina.nome}</p>
    </li>)}
  </ul>;
}

export default function CampoDDT() {
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  return <CampoDDTEditor key={`${companyId}:${user?.id}`} companyId={companyId} />;
}

/**
 * `cantiereFisso` (24/11/2026): l'editor dentro la scheda «Bolle» del cantiere. Prima «Bolla» del cantiere portava
 * alla pagina generale e la scheda «Bolle» a un'altra lista: due posti per la stessa cosa. Col cantiere fisso
 * non si chiede dove va la merce né quale cantiere, e l'elenco mostra solo i documenti di quel cantiere.
 */
export function CampoDDTEditor({ companyId, cantiereFisso }: { companyId?: string | null; cantiereFisso?: string }) {
  const t = useT();
  const { user } = useAuth();
  const assegnazioni = useCampoAssignments();
  const [params] = useSearchParams();
  const [scelta, setScelta] = useState("");
  const online = useNetworkStatus();
  const cantieri = assegnazioni.data ?? [];
  const richiesto = cantiereFisso ?? params.get("order");
  // 12/11/2026 — L'unica scelta è dove va la merce: in magazzino o in cantiere.
  // «In magazzino» vuol dire senza commessa, anche per l'operaio: la destinazione
  // arriva a `ddt_documento_accoda`. «In cantiere» vuole un cantiere suo.
  const ufficio = useCampoUfficio().data === true;
  const permessi = usePermissions();
  // Impostazioni → Acquisti e materiali → «Bolle dal telefono». Con «solo la foto»
  // chi non è ufficio invia e basta: l'AI la avvia l'ufficio (la regola è nel server).
  const letturaBolle = useLetturaBolleTelefono(companyId);
  const soloFoto = !ufficio && letturaBolle.data === "solo_foto";
  const puoRegistrare = puoRegistrareBolle(permessi) && !soloFoto && !letturaBolle.isLoading;
  const senzaAIPossibile = puoCompilareSenzaAI(permessi) && !soloFoto && !letturaBolle.isLoading;
  const [dove, setDove] = useState<"magazzino" | "cantiere" | null>(cantiereFisso ? "cantiere" : null);
  const destinazione =
    dove ?? (!richiesto && !assegnazioni.isLoading && !assegnazioni.isError && !cantieri.length ? "magazzino" : "cantiere");
  const [conAI, setConAI] = useState(true);
  const [compila, setCompila] = useState(false);
  const [attesa, setAttesa] = useState<string | null>(null);
  const [revisione, setRevisione] = useState<DocumentoPersistente | null>(null);
  const sceltaCantiere = cantiereBolla({
    richiesto,
    scelta: cantieri.some((c) => c.order_id === scelta) ? scelta : "",
    cantieri: cantieri.map((c) => c.order_id),
    ufficio: false,
  });
  const orderId = destinazione === "magazzino" ? null : sceltaCantiere.orderId;
  const valoreCantiere = sceltaCantiere.valore;
  const cantierePronto = destinazione === "magazzino" || (!assegnazioni.isError && sceltaCantiere.pronto);
  const etichettaDestinazione = (tipo: "magazzino" | "cantiere", id?: string | null) => {
    if (tipo === "magazzino") return t("Magazzino");
    const c = cantieri.find((x) => x.order_id === id);
    return c
      ? [c.order.order_code, c.order.description || c.order.indirizzo_lavori].filter(Boolean).join(" · ")
      : id ? t("Cantiere") : t("Scegli il cantiere");
  };
  const etichettaCantiere = etichettaDestinazione(destinazione, orderId);
  const [pagine, setPagine] = useState<PaginaBolla[]>([]);
  const files = useMemo(() => pagine.map(p => p.file), [pagine]);
  const [locali, setLocali] = useState<SyncItem[]>([]);
  const [paginaInCoda, setPaginaInCoda] = useState(() => params.get("invio"));
  const dettaglioInCoda = useRef<HTMLDivElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [pdfDaDividere, setPdfDaDividere] = useState<
    Array<{ id: string; pdf: PdfDaDividere }>
  >([]);
  const [preparando, setPreparando] = useState<"foto" | "pdf" | "scanner" | null>(null);
  const [scannerFuoriUso, setScannerFuoriUso] = useState(false);
  // Il testo che il telefono ha letto da ogni pagina scansionata: `null` finché l'OCR lavora.
  const [testiPagine, setTestiPagine] = useState<Map<File, string | null>>(() => new Map());
  const [correzioni, setCorrezioni] = useState<RiferimentiTelefono>({});
  const [riferimentiConfermati, setRiferimentiConfermati] = useState<RiferimentiTelefono>();
  const [mostraDati, setMostraDati] = useState(false);
  const idDati = useId();
  const comandoDati = useRef<HTMLButtonElement>(null);
  const blocco = useRef(false);
  const bytePagine = useRef(new WeakMap<File, ArrayBuffer>());
  const camera = useRef<HTMLInputElement>(null);
  const archivio = useRef<HTMLInputElement>(null);
  const sostituzione = useRef<HTMLInputElement>(null);
  const paginaDaSostituire = useRef<File | null>(null);
  const documenti = useDocumentiDDT(true, cantiereFisso);
  const salvaSoloDocumento = useSalvaSoloDocumento();
  const occupato = salvando || preparando !== null;
  const pronto = !!files.length && cantierePronto && !occupato && !pdfDaDividere.length;
  const usaScanner = scannerBolleDisponibile() && !scannerFuoriUso;
  const pagineDisponibili = MAX_PAGINE_DDT - files.length;
  const byteDisponibili = MAX_DOCUMENTO_BYTE - files.reduce((totale, file) => totale + file.size, 0);

  useEffect(() => {
    let richiesta = 0;
    const aggiorna = () => {
      const corrente = ++richiesta;
      void syncQueue
        .getAll()
        .then((items) => {
          if (corrente === richiesta)
            setLocali(
              items.filter(
                (i) =>
                  i.type === "documento_ddt" &&
                  i.status !== "done" &&
                  syncItemScope(i).owner === user?.id &&
                  syncItemScope(i).companyId === companyId && (i.payload as { source?: string }).source !== "desktop",
              ).sort((a, b) => b.createdAt - a.createdAt),
            );
        })
        .catch(() => {});
    };
    aggiorna();
    const off = syncQueue.on("change", aggiorna);
    const offInviati = syncQueue.on("processed", () => void documenti.refetch());
    return () => {
      richiesta++;
      off();
      offInviati();
    };
    // Il cambio identità rimonta l'editor e non mostra bozze di altre persone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, companyId]);

  // Letta la bolla appena inviata, si apre la finestra per confermarla.
  const appenaLetta = attesa
    ? (documenti.data ?? []).find((j) => j.id === attesa && j.status === "review") ?? null
    : null;
  const daRivedere = puoRegistrare ? revisione ?? appenaLetta : null;
  const inAttesa = locali.filter((i) => !(documenti.data ?? []).some((j) => j.id === (i.operationId ?? i.id)));
  const invioInCoda = conAI || !senzaAIPossibile;
  const dettaglioRichiesto = !!params.get("invio") && inAttesa.some(i => i.id === params.get("invio"));
  const haScansione = files.some(f => testiPagine.has(f));
  const ocrInCorso = files.some(f => testiPagine.get(f) === null);
  // Quello che il telefono ha letto, con sopra le correzioni scritte a mano.
  const testiLetti = useMemo(
    () => haScansione ? files.map(f => testiPagine.get(f) ?? "") : [],
    [haScansione, files, testiPagine],
  );
  const letti = useMemo(() => haScansione ? proponiRiferimentiTelefono(testiLetti) : {}, [haScansione, testiLetti]);
  // Le righe di merce che si vedevano sul foglio: servono all'ufficio per accorgersi
  // se l'AI ne perde una e per aggiungerla senza richiamare il modello.
  const righeViste = useMemo(
    () => haScansione && !ocrInCorso ? righeArticoloViste(testiLetti) : [],
    [haScansione, ocrInCorso, testiLetti],
  );
  const riferimenti: RiferimentiTelefono = haScansione ? { ...letti, ...correzioni } : {};
  const riferimentiValidi = riferimentiTelefonoValidi(riferimenti);
  const statoDati = riferimentiConfermati
    ? t("Inclusi")
    : ocrInCorso ? t("Lettura…") : riferimentiValidi ? t("Da verificare") : t("Facoltativi");

  useEffect(() => {
    if (dettaglioRichiesto) dettaglioInCoda.current?.scrollIntoView?.({ block: "start" });
  }, [dettaglioRichiesto]);

  const scordaTesti = (daTogliere: readonly File[]) => {
    if (!daTogliere.length) return;
    setTestiPagine(prima => {
      if (!daTogliere.some(file => prima.has(file))) return prima;
      const dopo = new Map(prima);
      for (const file of daTogliere) dopo.delete(file);
      return dopo;
    });
    setRiferimentiConfermati(undefined);
  };

  const svuotaBolla = () => {
    setPagine([]);
    setTestiPagine(new Map());
    setCorrezioni({});
    setRiferimentiConfermati(undefined);
    setMostraDati(false);
  };

  /**
   * Scanner del telefono (VisionKit su iOS, ML Kit su Android): raddrizza il foglio,
   * salva le pagine come JPEG dentro il budget della bolla e ne legge il testo sul
   * dispositivo. Il testo serve solo a proporre numero, data e fornitore: l'invio
   * delle foto è già possibile mentre l'OCR lavora.
   */
  const usaScansione = useCallback(async () => {
    if (blocco.current || !usaScanner || pagineDisponibili < 1 || byteDisponibili < 1) return;
    blocco.current = true;
    setPreparando("scanner");
    try {
      const scansione = await scansionaBolla(pagineDisponibili, byteDisponibili);
      if (!scansione) return;
      const foto = scansione.pagine.map(pagina => pagina.file);
      for (const pagina of scansione.pagine) bytePagine.current.set(pagina.file, pagina.byte);
      setPagine(prima => [...prima, ...foto.map(file => ({ id: crypto.randomUUID(), file }))]);
      setRiferimentiConfermati(undefined);
      setTestiPagine(prima => {
        const dopo = new Map(prima);
        for (const file of foto) dopo.set(file, null);
        return dopo;
      });
      void leggiScansioneBolla(scansione).then(lette => {
        setTestiPagine(prima => {
          const dopo = new Map(prima);
          for (const { file, testo } of lette) if (dopo.has(file)) dopo.set(file, testo);
          return dopo;
        });
      });
    } catch (errore) {
      if ((errore as { code?: string } | null)?.code === "UNAVAILABLE") setScannerFuoriUso(true);
      const messaggio = typeof errore === "object" && errore !== null && "message" in errore && typeof errore.message === "string"
        ? errore.message
        : t("Scanner non disponibile. Riprova, o scegli Foto o PDF.");
      toast.error(messaggio);
    } finally {
      blocco.current = false;
      setPreparando(null);
    }
    // `t` cambia con la lingua scelta e non deve ricreare la richiamata a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byteDisponibili, pagineDisponibili, usaScanner]);

  const aggiungi = async (nuovi: File[]) => {
    if (!nuovi.length || blocco.current) return;
    const errore = nuovi.map(erroreDocumento).find(Boolean);
    if (errore) {
      toast.error(t(errore));
      return;
    }
    if (
      files.length + nuovi.length > 12 ||
      [...files, ...nuovi].reduce((s, f) => s + f.size, 0) > MAX_DOCUMENTO_BYTE
    ) {
      toast.error(
        t("Un DDT può avere fino a 12 foto e pesare complessivamente 18 MB. Dividi i documenti più grandi dall’ufficio."),
      );
      return;
    }
    blocco.current = true;
    setPreparando(nuovi.some((file) => mimeDocumento(file) === "application/pdf") ? "pdf" : "foto");
    try {
      const diretti: PaginaBolla[] = [];
      const daDividere: typeof pdfDaDividere = [];
      for (const f of nuovi) {
        if (mimeDocumento(f) === "application/pdf") {
          const pagine = await contaPagine(f);
          if ((pagine ?? 1) > 1) {
            const pdf = await leggiPerDividere(f);
            daDividere.push({ id: crypto.randomUUID(), pdf });
            continue;
          }
        }
        // Il file della fotocamera può diventare illeggibile durante la sospensione
        // della pagina. I byte letti qui sono anche clonabili in IndexedDB su WebKit.
        const byte = await leggiByte(f).catch((): null => null);
        if (byte) bytePagine.current.set(f, byte);
        diretti.push({ id: crypto.randomUUID(), file: f });
      }
      setPagine((p) => [...p, ...diretti]);
      if (daDividere.length) setPdfDaDividere((p) => [...p, ...daDividere]);
    } catch {
      toast.error(
        t("Non riesco a preparare questo PDF. L’originale resta sul dispositivo: riprova o invialo all’ufficio."),
      );
    } finally {
      blocco.current = false;
      setPreparando(null);
    }
  };

  const spostaPagina = (indice: number, passo: -1 | 1) => {
    if (blocco.current) return;
    setPagine(prima => {
      const arrivo = indice + passo;
      if (!prima[indice] || !prima[arrivo]) return prima;
      const pagine = [...prima];
      [pagine[indice], pagine[arrivo]] = [pagine[arrivo], pagine[indice]];
      return pagine;
    });
  };

  const cambiaPagina = async (prima: File, prepara: () => Promise<File>) => {
    if (blocco.current || !files.includes(prima)) return;
    blocco.current = true;
    setPreparando("foto");
    try {
      const nuova = await prepara();
      const errore = erroreDocumento(nuova);
      if (errore) throw new Error(errore);
      if (!mimeDocumento(nuova).startsWith("image/")) throw new Error("Scegli una foto per sostituire la pagina.");
      if (files.reduce((totale, f) => totale + (f === prima ? nuova.size : f.size), 0) > MAX_DOCUMENTO_BYTE) {
        throw new Error("La bolla completa supererebbe 18 MB. Scegli una foto più leggera.");
      }
      const bytes = await leggiByte(nuova);
      bytePagine.current.set(nuova, bytes);
      setPagine(tutte => tutte.map(p => p.file === prima ? { ...p, file: nuova } : p));
      scordaTesti([prima]);
    } catch (errore) {
      toast.error(errore instanceof Error && /foto|18 MB/.test(errore.message)
        ? t(errore.message) : t("Operazione non riuscita. La pagina originale è ancora qui."));
    } finally {
      blocco.current = false;
      setPreparando(null);
    }
  };

  const ruotaPagina = (pagina: File) => cambiaPagina(pagina, async () => {
    const bytes = bytePagine.current.get(pagina);
    const origine = bytes ? new File([bytes], pagina.name, { type: mimeDocumento(pagina) }) : pagina;
    const foto = await compressImage(origine, 2800, 0.93, true).catch(() => { throw new Error("Non riesco a ruotare questa foto. Puoi sostituirla."); });
    return new File([foto], `${pagina.name.replace(/\.[^.]+$/, "")}.jpg`, { type: foto.type });
  });

  const preparaInvio = async (pagine: File[], dati?: RiferimentiTelefono, viste?: readonly string[]) => {
    if (!user?.id || !companyId || !cantierePronto)
      throw new Error("Scegli prima il cantiere");
    return {
      type: "documento_ddt" as const,
      payload: {
        files: await Promise.all(pagine.map((f) => bytePagine.current.get(f) ?? leggiByte(f))),
        fileNames: pagine.map((f) => f.name),
        fileTypes: pagine.map((f) => f.type),
        user_id: user.id,
        company_id: companyId,
        order_id: orderId ?? null,
        destinazione,
        source: "campo" as const,
        ...(dati && { riferimenti_telefono: dati }),
        ...(viste && viste.length > 0 && {
          righe_telefono: viste.length,
          righe_viste_telefono: viste.slice(0, MAX_RIGHE_VISTE),
        }),
      },
    };
  };

  const sincronizza = () => {
    void syncQueue.processQueue().catch(() => {});
  };

  const salva = async (soloDocumento = false) => {
    if (
      blocco.current ||
      !pronto ||
      !user?.id ||
      !companyId
    )
      return;
    blocco.current = true;
    setSalvando(true);
    try {
      if (soloDocumento) {
        await salvaSoloDocumento(files, orderId);
        svuotaBolla();
        void documenti.refetch();
        toast.success(t("Bolla ricevuta dall’ufficio"));
        return;
      }
      // Prima IndexedDB, poi rete: la lettura AI non trattiene la pagina aperta.
      const id = await syncQueue.enqueue(await preparaInvio(files, riferimentiConfermati, righeViste));
      svuotaBolla();
      // Chi può registrare rivede subito quello che l'AI ha letto.
      if (puoRegistrare && typeof id === "string") setAttesa(id);
      toast.success(
        online
          ? t("Bolla salvata sul telefono. Invio in coda.")
          : t("Bolla salvata sul telefono. Partirà appena torna la connessione."),
      );
      sincronizza();
    } catch (e) {
      toast.error(
        soloDocumento
          ? t("Salvataggio della bolla non completato. Le foto restano qui.")
          : t("Non riesco a salvare sul telefono. Le foto restano qui: riprova prima di uscire."),
        soloDocumento && e instanceof Error ? { description: e.message } : undefined,
      );
    } finally {
      blocco.current = false;
      setSalvando(false);
    }
  };

  const salvaPezzi = async (id: string, pezzi: File[]) => {
    if (!cantierePronto) {
      toast.error(t("Scegli prima il cantiere e ripeti la conferma"));
      return;
    }
    if (blocco.current || !pezzi.length) return;
    blocco.current = true;
    setSalvando(true);
    try {
      const voci = await Promise.all(pezzi.map((pezzo) => preparaInvio([pezzo])));
      await syncQueue.enqueueBatch(voci);
      setPdfDaDividere((p) => p.filter((x) => x.id !== id));
      toast.success(t("{n} bolle salvate sul telefono. Invio in coda.", { n: pezzi.length }));
      sincronizza();
    } catch {
      toast.error(t("Non riesco a salvare le bolle sul telefono. Il PDF resta qui: riprova."));
    } finally {
      blocco.current = false;
      setSalvando(false);
    }
  };

  return (
    <div className={cn("mx-auto w-full max-w-3xl space-y-4 md:space-y-5", !cantiereFisso && "py-1")}>
      {!cantiereFisso && <header className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <h1 className="min-w-0 text-xl font-bold">{t("Bolle e DDT")}</h1>
      </header>}
      <section
        className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:space-y-4 sm:p-4"
        aria-label={t("Nuovo documento di cantiere")}
      >
        {!cantiereFisso && <div className="space-y-2">
          <h2 className="text-[15px] font-bold md:text-sm">{t("Dove va la merce")}</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Dove va la merce")}>
            <button
              type="button"
              aria-pressed={destinazione === "magazzino"}
              className={`flex min-h-12 items-center justify-center gap-1.5 rounded-full border px-1.5 text-sm font-semibold disabled:opacity-50 ${destinazione === "magazzino" ? "border-primary bg-primary/10 text-primary" : ""}`}
              disabled={occupato}
              onClick={() => setDove("magazzino")}
            >
              <Warehouse className="size-4 shrink-0" aria-hidden="true" /> {t("In magazzino")}
            </button>
            <button
              type="button"
              aria-pressed={destinazione === "cantiere"}
              className={`flex min-h-12 items-center justify-center gap-1.5 rounded-full border px-1.5 text-sm font-semibold disabled:opacity-50 ${destinazione === "cantiere" ? "border-primary bg-primary/10 text-primary" : ""}`}
              disabled={occupato}
              onClick={() => setDove("cantiere")}
            >
              <HardHat className="size-4 shrink-0" aria-hidden="true" /> {t("In cantiere")}
            </button>
          </div>
        </div>}
        {destinazione === "cantiere" && !cantiereFisso && (
          <label className="block space-y-1 text-sm font-medium">
            {t("Cantiere")}
            <UniformSelect
              className={campo}
              value={valoreCantiere}
              disabled={
                occupato || assegnazioni.isLoading || assegnazioni.isError ||
                cantieri.some((c) => c.order_id === richiesto)
              }
              onChange={(e) => setScelta(e.target.value)}
            >
              <option value="">{t("Scegli il cantiere")}</option>
              {cantieri.map((c) => (
                <option key={c.order_id} value={c.order_id}>
                  {c.order.order_code} ·{" "}
                  {c.order.description || c.order.indirizzo_lavori}
                </option>
              ))}
            </UniformSelect>
          </label>
        )}
        {/* Dentro la scheda del cantiere non si avvisa: ci si è già dentro, e l'elenco degli assegnati ha solo i
            cantieri in corso (su un cantiere completato l'avviso compariva a torto, 26/11/2026). */}
        {destinazione === "cantiere" && richiesto && !cantiereFisso && !assegnazioni.isLoading && !assegnazioni.isError &&
          !cantieri.some((c) => c.order_id === richiesto) && (
            <p className="text-sm text-amber-800 dark:text-amber-300">{t("Il cantiere del link non è tra quelli assegnati. Controlla la destinazione prima di inviare.")}</p>
          )}
        {assegnazioni.isError && (
          <button
            className="min-h-11 text-sm text-destructive underline"
            onClick={() => void assegnazioni.refetch()}
          >
            {t("Non riesco a caricare i cantieri. Riprova")}
          </button>
        )}
        {!assegnazioni.isLoading &&
          !assegnazioni.isError &&
          !cantieri.length &&
          !ufficio &&
          destinazione === "cantiere" && (
            <p className="text-sm text-muted-foreground">
              {t("L’ufficio deve prima assegnarti un cantiere. La merce per il magazzino puoi già mandarla.")}
            </p>
          )}
        <div className={cn("space-y-2", !cantiereFisso && "border-t pt-3")}>
          <h2 className="text-[15px] font-bold md:text-sm">{t("Foto della bolla")}</h2>
          {!files.length && <p className="text-sm text-muted-foreground">{t("Inquadra il foglio intero. Aggiungi il retro se contiene altre righe.")}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 text-sm font-semibold text-primary disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
              onClick={() => usaScanner ? void usaScansione() : camera.current?.click()}
              disabled={occupato || pagineDisponibili < 1 || byteDisponibili < 1}
            >
              {usaScanner
                ? <ScanLine className="size-5 shrink-0" aria-hidden="true" />
                : <Camera className="size-5 shrink-0" aria-hidden="true" />}
              {usaScanner
                ? (files.length ? t("Altre pagine") : t("Scansiona la bolla"))
                : (files.length ? t("Altra foto") : t("Scatta la bolla"))}
            </button>
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border px-2 text-sm font-semibold disabled:opacity-50"
              onClick={() => archivio.current?.click()}
              disabled={occupato || pagineDisponibili < 1 || byteDisponibili < 1}
            >
              <FileUp className="size-4 shrink-0" aria-hidden="true" />
              {t("Foto o PDF")}
            </button>
          </div>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          hidden
          aria-label={t("Fotografa il DDT")}
          onChange={(e) => {
            const input = e.currentTarget;
            void aggiungi(Array.from(input.files ?? [])).finally(() => { input.value = ""; });
          }}
        />
        <input
          ref={archivio}
          type="file"
          accept={ACCEPT_DOCUMENTI_DDT}
          multiple
          hidden
          aria-label={t("Scegli le pagine del DDT")}
          onChange={(e) => {
            const input = e.currentTarget;
            void aggiungi(Array.from(input.files ?? [])).finally(() => { input.value = ""; });
          }}
        />
        <input ref={sostituzione} type="file" accept="image/*,.heic,.heif" hidden aria-label={t("Scegli una foto sostitutiva")}
          onChange={e => {
            const input = e.currentTarget;
            const nuova = input.files?.[0];
            const prima = paginaDaSostituire.current;
            paginaDaSostituire.current = null;
            if (prima && nuova) void cambiaPagina(prima, () => Promise.resolve(nuova)).finally(() => { input.value = ""; });
          }} />
        {preparando && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            {preparando === "scanner" ? t("Scansione in corso…") : preparando === "pdf" ? t("Controllo le pagine del PDF…") : t("Preparo le foto…")}
          </p>
        )}
        {pdfDaDividere.map((d) => (
          <DividiPdfPannello
            key={d.id}
            pdf={d.pdf}
            onTogli={() =>
              setPdfDaDividere((p) => p.filter((x) => x.id !== d.id))
            }
            onDiviso={(pezzi, leggi = true) => {
              if (!leggi) {
                toast.success(t("PDF divisi e scaricati sul dispositivo"));
                return;
              }
              void salvaPezzi(d.id, pezzi);
            }}
          />
        ))}
        {!!files.length && (
          <>
            <p className="text-sm font-semibold">
              {t("Pagine dello stesso DDT ({n})", { n: files.length })}
            </p>
            <ul className="space-y-2">
              {pagine.map(({ file: f, id }, i) => (
                <li
                  key={id}
                  className="flex min-w-0 items-center gap-2 rounded-xl border bg-background p-1.5 text-sm sm:gap-3"
                >
                  {mimeDocumento(f) === "application/pdf" ? (
                    <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground" aria-label="PDF">
                      <FileText className="size-5" aria-hidden="true" />
                    </span>
                  ) : (
                    <AnteprimaFotoCampo foto={f} etichetta={t("pagina {n}", { n: i + 1 })} className="size-14 shrink-0 rounded-lg" />
                  )}
                  <span className="min-w-0 flex-1 break-words">
                    {i + 1}. {f.name}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" disabled={occupato} aria-label={t("Modifica pagina {n}", { n: i + 1 })}
                        className="grid size-11 shrink-0 place-items-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-50">
                        <MoreVertical className="size-5" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {mimeDocumento(f) !== "application/pdf" && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => void ruotaPagina(f)}>
                        <RotateCw className="size-4" aria-hidden="true" />{t("Ruota a destra")}
                      </DropdownMenuItem>}
                      <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => {
                        paginaDaSostituire.current = f;
                        sostituzione.current?.click();
                      }}><ImagePlus className="size-4" aria-hidden="true" />{t("Sostituisci")}</DropdownMenuItem>
                      {files.length > 1 && <>
                        <DropdownMenuItem className="min-h-11 gap-2" disabled={i === 0} onSelect={() => spostaPagina(i, -1)}>
                          <ArrowUp className="size-4" aria-hidden="true" />{t("Sposta su")}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11 gap-2" disabled={i === files.length - 1} onSelect={() => spostaPagina(i, 1)}>
                          <ArrowDown className="size-4" aria-hidden="true" />{t("Sposta giù")}
                        </DropdownMenuItem>
                      </>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-11 gap-2 text-destructive" onSelect={() => {
                        setPagine(p => p.filter(pagina => pagina.id !== id));
                        scordaTesti([f]);
                      }}>
                        <Trash2 className="size-4" aria-hidden="true" />{t("Rimuovi")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{files.length === 12 ? t("Hai raggiunto il limite di 12 pagine.") : t("Per una bolla diversa, salva questa e inizia un nuovo invio.")}</p>
          </>
        )}
        {haScansione && invioInCoda && (
          <div className="rounded-xl border">
            <button ref={comandoDati} type="button" aria-expanded={mostraDati} aria-controls={idDati}
              aria-label={t("Dati DDT")} aria-describedby={`${idDati}-stato`}
              onClick={() => setMostraDati(prima => !prima)}
              className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary">
              <span className="flex-1">{t("Dati DDT")}</span>
              <span id={`${idDati}-stato`} className={cn("flex items-center gap-1 text-xs", riferimentiConfermati ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                {riferimentiConfermati && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                {statoDati}
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground", mostraDati && "rotate-180")} aria-hidden="true" />
            </button>
            <fieldset id={idDati} hidden={!mostraDati} disabled={occupato} aria-label={t("Dati facoltativi del DDT")}
              className="min-w-0 space-y-2 border-t p-2.5">
              <p className="text-xs text-muted-foreground">
                {t("Letti dal telefono: correggili se sbagliano. Servono all'ufficio a riconoscere la bolla prima dell'AI.")}
              </p>
              <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2 sm:grid-cols-2">
                {([
                  ["numero", t("Numero"), "text", MAX_NUMERO_DDT],
                  ["data", t("Data"), "date", undefined],
                  ["fornitore", t("Fornitore"), "text", MAX_FORNITORE_DDT],
                ] as const).map(([campoDdt, etichetta, tipo, max]) => (
                  <label key={campoDdt} className={campoDdt === "fornitore" ? "col-span-2 min-w-0" : "min-w-0"}>
                    <span className="mb-0.5 block text-xs font-medium">{etichetta}</span>
                    <input type={tipo} maxLength={max} value={riferimenti[campoDdt] ?? ""}
                      className="block h-12 w-full min-w-0 rounded-xl border bg-background px-2 text-base"
                      onChange={e => {
                        setCorrezioni(prima => ({ ...prima, [campoDdt]: e.target.value }));
                        setRiferimentiConfermati(undefined);
                      }} />
                  </label>
                ))}
              </div>
              <button type="button" className="min-h-12 w-full rounded-xl border px-2 text-sm font-semibold disabled:opacity-50"
                disabled={!riferimentiConfermati && (ocrInCorso || !riferimentiValidi)}
                onClick={() => {
                  setRiferimentiConfermati(riferimentiConfermati ? undefined : riferimentiValidi);
                  setMostraDati(false);
                  comandoDati.current?.focus();
                }}>
                {riferimentiConfermati ? t("Escludi i dati") : t("Allega i dati")}
              </button>
            </fieldset>
          </div>
        )}
        {senzaAIPossibile && (
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> {t("Leggi con l'AI")}
            </span>
            <Switch checked={conAI} onCheckedChange={setConAI} disabled={occupato} aria-label={t("Leggi con l'AI")} />
          </label>
        )}
        <div className="space-y-2 border-t pt-3">
          {!!files.length && (
            <div className="flex min-w-0 items-start gap-2 rounded-xl bg-muted/55 p-2.5 text-sm">
              {destinazione === "magazzino" ? <Warehouse className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> : <HardHat className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="break-words font-semibold">{etichettaCantiere}</p>
                <p className="text-xs text-muted-foreground">{files.length === 1 ? t("1 pagina da inviare") : t("{n} pagine da inviare", { n: files.length })}</p>
              </div>
            </div>
          )}
          {!online && (
            <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
              <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {invioInCoda ? t("Salva la bolla ora. Partirà appena torna la connessione.") : t("Torna online per compilare o inviare senza lettura AI.")}
            </p>
          )}
          {invioInCoda ? (
            <button type="button" disabled={!pronto || !user?.id || !companyId} onClick={() => void salva()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98]">
              {salvando ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <CloudUpload className="size-5 shrink-0" aria-hidden="true" />}
              {salvando ? t("Salvo la bolla…") : online ? t("Invia la bolla") : t("Salva la bolla sul telefono")}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!pronto || !online} onClick={() => setCompila(true)}
                className="min-h-12 rounded-xl bg-primary px-2 font-semibold text-primary-foreground disabled:opacity-50">{t("Compila ora")}</button>
              <button type="button" disabled={!pronto || !online} onClick={() => void salva(true)}
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-full border px-2 text-sm font-semibold disabled:opacity-50">
                {salvando && <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
                {t("La compila l'ufficio")}
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {soloFoto
              ? t("La legge e la registra l'ufficio.")
              : invioInCoda ? puoRegistrare ? t("Dopo la lettura puoi controllare e confermare i dati.") : t("Dopo la lettura, l'ufficio controlla e conferma i dati.")
              : t("Puoi inserire numero, fornitore e righe dalla foto.")}
          </p>
        </div>
      </section>
      {!!inAttesa.length && (
        <section
          className="space-y-2"
          aria-label={t("Documenti conservati sul telefono")}
        >
          <h2 className="text-[15px] font-semibold md:text-base">{t("Bolle in coda sul telefono")}</h2>
          {inAttesa.map((i) => {
            const p = i.payload as { fileNames?: string[]; order_id?: string | null; destinazione?: "magazzino" | "cantiere" | null } | null;
            const luogo = etichettaDestinazione(destinazioneDocumento({ destinazione: p?.destinazione, order_id: p?.order_id ?? null }), p?.order_id);
            return (
            <div
              className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
              key={i.id}
              ref={i.id === params.get("invio") ? dettaglioInCoda : undefined}
            >
              <p className="break-words font-semibold">{p?.fileNames?.[0] || t("Bolla da inviare")}</p>
              <p className="break-words text-xs text-muted-foreground">{luogo}</p>
              <p role="status" className="flex items-center gap-2">
                {i.status === "syncing" && <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
                {i.status === "failed"
                  ? t("Invio da riprovare")
                  : i.status === "syncing"
                    ? t("Invio al sistema…")
                    : t("In attesa di invio")}
              </p>
              {i.lastError && <p className="mt-1 text-xs">{i.lastError}</p>}
              <button type="button" className="mr-3 min-h-11 font-semibold text-primary underline" aria-expanded={paginaInCoda === i.id}
                onClick={() => setPaginaInCoda(p => p === i.id ? null : i.id)}>
                {paginaInCoda === i.id ? t("Nascondi pagine") : t("Rivedi pagine")}
              </button>
              {i.status === "failed" && (
                <button
                  type="button"
                  className="min-h-11 font-semibold text-primary underline disabled:opacity-50"
                  disabled={!online}
                  onClick={() => void syncQueue.retryFailed((x) => x.id === i.id).then(sincronizza).catch(() => toast.error(t("Non riesco a riprovare l'invio.")))}
                >
                  {t("Riprova l’invio")}
                </button>
              )}
              {paginaInCoda === i.id && <FotoBollaInCoda voce={i} />}
            </div>
            );
          })}
        </section>
      )}
      <section className="space-y-2" aria-label={t("Documenti inviati")}>
        <h2 className="text-[15px] font-semibold md:text-base">{cantiereFisso ? t("Documenti inviati per questo cantiere") : t("Documenti inviati")}</h2>
        {documenti.isError && !documenti.data?.length ? (
          <button
            className="min-h-11 text-sm underline"
            onClick={() => void documenti.refetch()}
          >
            {t("Elenco non disponibile. Riprova")}
          </button>
        ) : documenti.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("Caricamento…")}</p>
        ) : !documenti.data?.length ? (
          <p className="text-sm text-muted-foreground">
            {t("I DDT salvati compariranno qui, anche dopo aver chiuso l’app.")}
          </p>
        ) : (
          documenti.data.map((j) => (
            <article key={j.id} className="rounded-xl border bg-card p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {j.status === "registered" ? <Check className="size-4" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">{j.files[0]?.name || t("Bolla ricevuta")}</p>
                  <p className="break-words text-xs text-muted-foreground">{etichettaDestinazione(destinazioneDocumento(j), j.order_id)}</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {j.status === "review" && puoRegistrare ? t("Da controllare") : t(STATO_DOCUMENTO[j.status])} ·{" "}
                {new Date(j.created_at).toLocaleString(intlCampo())}
              </p>
              {j.status === "review" && puoRegistrare && !j.ddt_id && (
                <button
                  type="button"
                  className="mt-2 min-h-11 rounded-lg border px-3 text-sm font-semibold"
                  onClick={() => setRevisione(j)}
                >
                  {t("Controlla e conferma")}
                </button>
              )}
              {j.status === "error" && (
                <p className="mt-1 text-xs text-amber-800">
                  {t("L’originale è al sicuro: l’ufficio può correggerlo o ripetere la lettura.")}
                </p>
              )}
            </article>
          ))
        )}
        {documenti.hasNextPage && (
          <button
            type="button"
            className="min-h-12 w-full rounded-xl border text-sm font-medium"
            disabled={documenti.isFetchingNextPage}
            onClick={() => void documenti.fetchNextPage()}
          >
            {documenti.isFetchingNextPage
              ? t("Caricamento…")
              : documenti.isFetchNextPageError
                ? t("Riprova a caricare altri DDT")
                : t("Carica altri DDT")}
          </button>
        )}
      </section>
      {compila && senzaAIPossibile && companyId && (
        <CompilaBollaTelefono
          files={files}
          companyId={companyId}
          orderId={orderId}
          riferimenti={riferimentiValidi}
          etichettaCantiere={etichettaCantiere}
          onChiudi={() => setCompila(false)}
          onFatto={() => {
            setCompila(false);
            svuotaBolla();
            void documenti.refetch();
          }}
        />
      )}
      {daRivedere && (
        <RevisioneBollaTelefono
          documento={daRivedere}
          etichettaCantiere={etichettaDestinazione(destinazioneDocumento(daRivedere), daRivedere.order_id)}
          onChiudi={() => {
            setRevisione(null);
            setAttesa(null);
          }}
        />
      )}
      <Link
        to={orderId ? `/campo/merce?order=${orderId}` : "/campo/merce"}
        className="flex min-h-11 items-center text-sm underline"
      >
        {t("Hai pagato tu? Registra una spesa o uno scontrino")}
      </Link>
    </div>
  );
}
