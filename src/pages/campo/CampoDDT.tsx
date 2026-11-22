import { UniformSelect } from "@/components/ui/uniform-select";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Camera, Check, CloudUpload, FileText, FileUp, HardHat, ImagePlus, Loader2, MoreVertical, Receipt, RotateCw, Sparkles, Trash2, Warehouse, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useCampoUfficio } from "@/hooks/campo/useCampoUfficio";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { AnteprimaFotoCampo } from "@/components/campo/AnteprimaFotoCampo";
import { cantiereBolla } from "@/lib/campo/cantiereBolla";
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
  mimeDocumento,
} from "@/lib/ddt/preparaDocumento";

const campo = "min-h-12 w-full rounded-xl border bg-background px-3 text-base";
type PaginaBolla = { id: string; file: File };

function leggiPagina(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const lettore = new FileReader();
    lettore.onload = () => resolve(lettore.result as ArrayBuffer);
    lettore.onerror = lettore.onabort = () => reject(lettore.error ?? new Error("Pagina non leggibile"));
    lettore.readAsArrayBuffer(file);
  });
}

function FotoBollaInCoda({ voce }: { voce: SyncItem }) {
  const pagine = useMemo(() => {
    const p = voce.payload as { files?: (ArrayBuffer | Blob)[]; fileTypes?: string[]; fileNames?: string[] };
    return (p.files ?? []).map((file, i) => {
      const tipo = p.fileTypes?.[i] || (file instanceof Blob ? file.type : "");
      const foto = tipo.startsWith("image/") && (file instanceof Blob || file instanceof ArrayBuffer)
        ? file instanceof Blob ? file : new Blob([file], { type: tipo }) : null;
      return { foto, nome: p.fileNames?.[i] || `Pagina ${i + 1}` };
    });
  }, [voce.payload]);

  return <ul aria-label="Pagine della bolla conservata" className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
    {pagine.map((pagina, i) => <li key={`${pagina.nome}:${i}`} className="min-w-0">
      {pagina.foto ? <AnteprimaFotoCampo foto={pagina.foto} etichetta={`pagina in coda ${i + 1}`} className="aspect-square h-auto" />
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

function CampoDDTEditor({ companyId }: { companyId?: string | null }) {
  const { user } = useAuth();
  const assegnazioni = useCampoAssignments();
  const [params] = useSearchParams();
  const [scelta, setScelta] = useState("");
  const online = useNetworkStatus();
  const cantieri = assegnazioni.data ?? [];
  const richiesto = params.get("order");
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
  const [dove, setDove] = useState<"magazzino" | "cantiere" | null>(null);
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
    if (tipo === "magazzino") return "Magazzino";
    const c = cantieri.find((x) => x.order_id === id);
    return c
      ? [c.order.order_code, c.order.description || c.order.indirizzo_lavori].filter(Boolean).join(" · ")
      : id ? "Cantiere" : "Scegli il cantiere";
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
  const [preparando, setPreparando] = useState<"foto" | "pdf" | null>(null);
  const blocco = useRef(false);
  const bytePagine = useRef(new WeakMap<File, ArrayBuffer>());
  const camera = useRef<HTMLInputElement>(null);
  const archivio = useRef<HTMLInputElement>(null);
  const sostituzione = useRef<HTMLInputElement>(null);
  const paginaDaSostituire = useRef<File | null>(null);
  const documenti = useDocumentiDDT(true);
  const salvaSoloDocumento = useSalvaSoloDocumento();
  const occupato = salvando || preparando !== null;
  const pronto = !!files.length && cantierePronto && !occupato && !pdfDaDividere.length;

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

  useEffect(() => {
    if (dettaglioRichiesto) dettaglioInCoda.current?.scrollIntoView?.({ block: "start" });
  }, [dettaglioRichiesto]);

  const aggiungi = async (nuovi: File[]) => {
    if (!nuovi.length || blocco.current) return;
    const errore = nuovi.map(erroreDocumento).find(Boolean);
    if (errore) {
      toast.error(errore);
      return;
    }
    if (
      files.length + nuovi.length > 12 ||
      [...files, ...nuovi].reduce((s, f) => s + f.size, 0) > MAX_DOCUMENTO_BYTE
    ) {
      toast.error(
        "Un DDT può avere fino a 12 foto e pesare complessivamente 18 MB. Dividi i documenti più grandi dall’ufficio.",
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
        const byte = await leggiPagina(f).catch((): null => null);
        if (byte) bytePagine.current.set(f, byte);
        diretti.push({ id: crypto.randomUUID(), file: f });
      }
      setPagine((p) => [...p, ...diretti]);
      if (daDividere.length) setPdfDaDividere((p) => [...p, ...daDividere]);
    } catch {
      toast.error(
        "Non riesco a preparare questo PDF. L’originale resta sul dispositivo: riprova o invialo all’ufficio.",
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
      const bytes = await leggiPagina(nuova);
      bytePagine.current.set(nuova, bytes);
      setPagine(tutte => tutte.map(p => p.file === prima ? { ...p, file: nuova } : p));
    } catch (errore) {
      toast.error(errore instanceof Error && /foto|18 MB/.test(errore.message)
        ? errore.message : "Operazione non riuscita. La pagina originale è ancora qui.");
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

  const preparaInvio = async (pagine: File[]) => {
    if (!user?.id || !companyId || !cantierePronto)
      throw new Error("Scegli prima il cantiere");
    return {
      type: "documento_ddt" as const,
      payload: {
        files: await Promise.all(pagine.map((f) => bytePagine.current.get(f) ?? leggiPagina(f))),
        fileNames: pagine.map((f) => f.name),
        fileTypes: pagine.map((f) => f.type),
        user_id: user.id,
        company_id: companyId,
        order_id: orderId ?? null,
        destinazione,
        source: "campo" as const,
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
        setPagine([]);
        void documenti.refetch();
        toast.success("Bolla ricevuta dall’ufficio");
        return;
      }
      // Prima IndexedDB, poi rete: la lettura AI non trattiene la pagina aperta.
      const id = await syncQueue.enqueue(await preparaInvio(files));
      setPagine([]);
      // Chi può registrare rivede subito quello che l'AI ha letto.
      if (puoRegistrare && typeof id === "string") setAttesa(id);
      toast.success(
        online
          ? "Bolla salvata sul telefono. Invio in coda."
          : "Bolla salvata sul telefono. Partirà appena torna la connessione.",
      );
      sincronizza();
    } catch (e) {
      toast.error(
        soloDocumento
          ? "Salvataggio della bolla non completato. Le foto restano qui."
          : "Non riesco a salvare sul telefono. Le foto restano qui: riprova prima di uscire.",
        soloDocumento && e instanceof Error ? { description: e.message } : undefined,
      );
    } finally {
      blocco.current = false;
      setSalvando(false);
    }
  };

  const salvaPezzi = async (id: string, pezzi: File[]) => {
    if (!cantierePronto) {
      toast.error("Scegli prima il cantiere e ripeti la conferma");
      return;
    }
    if (blocco.current || !pezzi.length) return;
    blocco.current = true;
    setSalvando(true);
    try {
      const voci = await Promise.all(pezzi.map((pezzo) => preparaInvio([pezzo])));
      await syncQueue.enqueueBatch(voci);
      setPdfDaDividere((p) => p.filter((x) => x.id !== id));
      toast.success(`${pezzi.length} bolle salvate sul telefono. Invio in coda.`);
      sincronizza();
    } catch {
      toast.error("Non riesco a salvare le bolle sul telefono. Il PDF resta qui: riprova.");
    } finally {
      blocco.current = false;
      setSalvando(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 py-1 md:space-y-5">
      <header className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <h1 className="min-w-0 text-xl font-bold">Bolle e DDT</h1>
      </header>
      <section
        className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm sm:space-y-4 sm:p-4"
        aria-label="Nuovo documento di cantiere"
      >
        <div className="space-y-2">
          <h2 className="text-sm font-bold">Dove va la merce</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Dove va la merce">
            <button
              type="button"
              aria-pressed={destinazione === "magazzino"}
              className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-sm font-semibold disabled:opacity-50 ${destinazione === "magazzino" ? "border-primary bg-primary/10 text-primary" : ""}`}
              disabled={occupato}
              onClick={() => setDove("magazzino")}
            >
              <Warehouse className="size-4 shrink-0" aria-hidden="true" /> In magazzino
            </button>
            <button
              type="button"
              aria-pressed={destinazione === "cantiere"}
              className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-sm font-semibold disabled:opacity-50 ${destinazione === "cantiere" ? "border-primary bg-primary/10 text-primary" : ""}`}
              disabled={occupato}
              onClick={() => setDove("cantiere")}
            >
              <HardHat className="size-4 shrink-0" aria-hidden="true" /> In cantiere
            </button>
          </div>
        </div>
        {destinazione === "cantiere" && (
          <label className="block space-y-1 text-sm font-medium">
            Cantiere
            <UniformSelect
              className={campo}
              value={valoreCantiere}
              disabled={
                occupato || assegnazioni.isLoading || assegnazioni.isError ||
                cantieri.some((c) => c.order_id === richiesto)
              }
              onChange={(e) => setScelta(e.target.value)}
            >
              <option value="">Scegli il cantiere</option>
              {cantieri.map((c) => (
                <option key={c.order_id} value={c.order_id}>
                  {c.order.order_code} ·{" "}
                  {c.order.description || c.order.indirizzo_lavori}
                </option>
              ))}
            </UniformSelect>
          </label>
        )}
        {destinazione === "cantiere" && richiesto && !assegnazioni.isLoading && !assegnazioni.isError &&
          !cantieri.some((c) => c.order_id === richiesto) && (
            <p className="text-sm text-amber-800 dark:text-amber-300">Il cantiere del link non è tra quelli assegnati. Controlla la destinazione prima di inviare.</p>
          )}
        {assegnazioni.isError && (
          <button
            className="min-h-11 text-sm text-destructive underline"
            onClick={() => void assegnazioni.refetch()}
          >
            Non riesco a caricare i cantieri. Riprova
          </button>
        )}
        {!assegnazioni.isLoading &&
          !assegnazioni.isError &&
          !cantieri.length &&
          !ufficio &&
          destinazione === "cantiere" && (
            <p className="text-sm text-muted-foreground">
              L’ufficio deve prima assegnarti un cantiere. La merce per il magazzino puoi già mandarla.
            </p>
          )}
        <div className="space-y-2 border-t pt-3">
          <h2 className="text-sm font-bold">Foto della bolla</h2>
          {!files.length && <p className="text-sm text-muted-foreground">Inquadra il foglio intero. Aggiungi il retro se contiene altre righe.</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-2 text-sm font-semibold text-primary disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98]"
              onClick={() => camera.current?.click()}
              disabled={occupato || files.length >= 12}
            >
              <Camera className="size-5 shrink-0" aria-hidden="true" />
              {files.length ? "Altra foto" : "Scatta la bolla"}
            </button>
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold disabled:opacity-50"
              onClick={() => archivio.current?.click()}
              disabled={occupato || files.length >= 12}
            >
              <FileUp className="size-4 shrink-0" aria-hidden="true" />
              Foto o PDF
            </button>
          </div>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          hidden
          aria-label="Fotografa il DDT"
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
          aria-label="Scegli le pagine del DDT"
          onChange={(e) => {
            const input = e.currentTarget;
            void aggiungi(Array.from(input.files ?? [])).finally(() => { input.value = ""; });
          }}
        />
        <input ref={sostituzione} type="file" accept="image/*,.heic,.heif" hidden aria-label="Scegli una foto sostitutiva"
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
            {preparando === "pdf" ? "Controllo le pagine del PDF…" : "Preparo le foto…"}
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
                toast.success("PDF divisi e scaricati sul dispositivo");
                return;
              }
              void salvaPezzi(d.id, pezzi);
            }}
          />
        ))}
        {!!files.length && (
          <>
            <p className="text-sm font-semibold">
              Pagine dello stesso DDT ({files.length})
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
                    <AnteprimaFotoCampo foto={f} etichetta={`pagina ${i + 1}`} className="size-14 shrink-0 rounded-lg" />
                  )}
                  <span className="min-w-0 flex-1 break-words">
                    {i + 1}. {f.name}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" disabled={occupato} aria-label={`Modifica pagina ${i + 1}`}
                        className="grid size-11 shrink-0 place-items-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-50">
                        <MoreVertical className="size-5" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {mimeDocumento(f) !== "application/pdf" && <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => void ruotaPagina(f)}>
                        <RotateCw className="size-4" aria-hidden="true" />Ruota a destra
                      </DropdownMenuItem>}
                      <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => {
                        paginaDaSostituire.current = f;
                        sostituzione.current?.click();
                      }}><ImagePlus className="size-4" aria-hidden="true" />Sostituisci</DropdownMenuItem>
                      {files.length > 1 && <>
                        <DropdownMenuItem className="min-h-11 gap-2" disabled={i === 0} onSelect={() => spostaPagina(i, -1)}>
                          <ArrowUp className="size-4" aria-hidden="true" />Sposta su
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-11 gap-2" disabled={i === files.length - 1} onSelect={() => spostaPagina(i, 1)}>
                          <ArrowDown className="size-4" aria-hidden="true" />Sposta giù
                        </DropdownMenuItem>
                      </>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-11 gap-2 text-destructive" onSelect={() => setPagine(p => p.filter(pagina => pagina.id !== id))}>
                        <Trash2 className="size-4" aria-hidden="true" />Rimuovi
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{files.length === 12 ? "Hai raggiunto il limite di 12 pagine." : "Per una bolla diversa, salva questa e inizia un nuovo invio."}</p>
          </>
        )}
        {senzaAIPossibile && (
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Leggi con l'AI
            </span>
            <Switch checked={conAI} onCheckedChange={setConAI} disabled={occupato} aria-label="Leggi con l'AI" />
          </label>
        )}
        <div className="space-y-2 border-t pt-3">
          {!!files.length && (
            <div className="flex min-w-0 items-start gap-2 rounded-xl bg-muted/55 p-2.5 text-sm">
              {destinazione === "magazzino" ? <Warehouse className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /> : <HardHat className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="break-words font-semibold">{etichettaCantiere}</p>
                <p className="text-xs text-muted-foreground">{files.length === 1 ? "1 pagina da inviare" : `${files.length} pagine da inviare`}</p>
              </div>
            </div>
          )}
          {!online && (
            <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
              <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {invioInCoda ? "Salva la bolla ora. Partirà appena torna la connessione." : "Torna online per compilare o inviare senza lettura AI."}
            </p>
          )}
          {invioInCoda ? (
            <button type="button" disabled={!pronto || !user?.id || !companyId} onClick={() => void salva()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98]">
              {salvando ? <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : <CloudUpload className="size-5 shrink-0" aria-hidden="true" />}
              {salvando ? "Salvo la bolla…" : online ? "Invia la bolla" : "Salva la bolla sul telefono"}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!pronto || !online} onClick={() => setCompila(true)}
                className="min-h-12 rounded-xl bg-primary px-2 font-semibold text-primary-foreground disabled:opacity-50">Compila ora</button>
              <button type="button" disabled={!pronto || !online} onClick={() => void salva(true)}
                className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold disabled:opacity-50">
                {salvando && <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
                La compila l'ufficio
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {soloFoto
              ? "La legge e la registra l'ufficio."
              : invioInCoda ? puoRegistrare ? "Dopo la lettura puoi controllare e confermare i dati." : "Dopo la lettura, l'ufficio controlla e conferma i dati."
              : "Puoi inserire numero, fornitore e righe dalla foto."}
          </p>
        </div>
      </section>
      {!!inAttesa.length && (
        <section
          className="space-y-2"
          aria-label="Documenti conservati sul telefono"
        >
          <h2 className="font-semibold">Bolle in coda sul telefono</h2>
          {inAttesa.map((i) => {
            const p = i.payload as { fileNames?: string[]; order_id?: string | null; destinazione?: "magazzino" | "cantiere" | null } | null;
            const luogo = etichettaDestinazione(destinazioneDocumento({ destinazione: p?.destinazione, order_id: p?.order_id ?? null }), p?.order_id);
            return (
            <div
              className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
              key={i.id}
              ref={i.id === params.get("invio") ? dettaglioInCoda : undefined}
            >
              <p className="break-words font-semibold">{p?.fileNames?.[0] || "Bolla da inviare"}</p>
              <p className="break-words text-xs text-muted-foreground">{luogo}</p>
              <p role="status" className="flex items-center gap-2">
                {i.status === "syncing" && <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
                {i.status === "failed"
                  ? "Invio da riprovare"
                  : i.status === "syncing"
                    ? "Invio al sistema…"
                    : "In attesa di invio"}
              </p>
              {i.lastError && <p className="mt-1 text-xs">{i.lastError}</p>}
              <button type="button" className="mr-3 min-h-11 font-semibold text-primary underline" aria-expanded={paginaInCoda === i.id}
                onClick={() => setPaginaInCoda(p => p === i.id ? null : i.id)}>
                {paginaInCoda === i.id ? "Nascondi pagine" : "Rivedi pagine"}
              </button>
              {i.status === "failed" && (
                <button
                  type="button"
                  className="min-h-11 font-semibold text-primary underline disabled:opacity-50"
                  disabled={!online}
                  onClick={() => void syncQueue.retryFailed((x) => x.id === i.id).then(sincronizza).catch(() => toast.error("Non riesco a riprovare l'invio."))}
                >
                  Riprova l’invio
                </button>
              )}
              {paginaInCoda === i.id && <FotoBollaInCoda voce={i} />}
            </div>
            );
          })}
        </section>
      )}
      <section className="space-y-2" aria-label="Documenti inviati">
        <h2 className="font-semibold">Documenti inviati</h2>
        {documenti.isError && !documenti.data?.length ? (
          <button
            className="min-h-11 text-sm underline"
            onClick={() => void documenti.refetch()}
          >
            Elenco non disponibile. Riprova
          </button>
        ) : documenti.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : !documenti.data?.length ? (
          <p className="text-sm text-muted-foreground">
            I DDT salvati compariranno qui, anche dopo aver chiuso l’app.
          </p>
        ) : (
          documenti.data.map((j) => (
            <article key={j.id} className="rounded-xl border bg-card p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  {j.status === "registered" ? <Check className="size-4" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">{j.files[0]?.name || "Bolla ricevuta"}</p>
                  <p className="break-words text-xs text-muted-foreground">{etichettaDestinazione(destinazioneDocumento(j), j.order_id)}</p>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {j.status === "review" && puoRegistrare ? "Da controllare" : STATO_DOCUMENTO[j.status]} ·{" "}
                {new Date(j.created_at).toLocaleString("it-IT")}
              </p>
              {j.status === "review" && puoRegistrare && !j.ddt_id && (
                <button
                  type="button"
                  className="mt-2 min-h-11 rounded-lg border px-3 text-sm font-semibold"
                  onClick={() => setRevisione(j)}
                >
                  Controlla e conferma
                </button>
              )}
              {j.status === "error" && (
                <p className="mt-1 text-xs text-amber-800">
                  L’originale è al sicuro: l’ufficio può correggerlo o ripetere
                  la lettura.
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
              ? "Caricamento…"
              : documenti.isFetchNextPageError
                ? "Riprova a caricare altri DDT"
                : "Carica altri DDT"}
          </button>
        )}
      </section>
      {compila && senzaAIPossibile && companyId && (
        <CompilaBollaTelefono
          files={files}
          companyId={companyId}
          orderId={orderId}
          etichettaCantiere={etichettaCantiere}
          onChiudi={() => setCompila(false)}
          onFatto={() => {
            setCompila(false);
            setPagine([]);
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
        Hai pagato tu? Registra una spesa o uno scontrino
      </Link>
    </div>
  );
}
