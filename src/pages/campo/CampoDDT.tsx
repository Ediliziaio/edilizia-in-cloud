import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Camera, FileUp, HardHat, Loader2, Receipt, Sparkles, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { useCampoUfficio } from "@/hooks/campo/useCampoUfficio";
import { cantiereBolla } from "@/lib/campo/cantiereBolla";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import {
  CompilaBollaTelefono,
  RevisioneBollaTelefono,
  puoCompilareSenzaAI,
  puoRegistrareBolle,
  useSalvaSoloDocumento,
} from "@/components/ddt/BollaTelefono";
import type { DocumentoPersistente } from "@/lib/ddt/documentiPersistenti";
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
} from "@/lib/ddt/preparaDocumento";

const campo = "min-h-12 w-full rounded-xl border bg-background px-3 text-base";

export default function CampoDDT() {
  const { user, profile } = useAuth();
  return <CampoDDTEditor key={`${profile?.company_id}:${user?.id}`} />;
}

function CampoDDTEditor() {
  const { user, profile } = useAuth();
  const assegnazioni = useCampoAssignments();
  const [params] = useSearchParams();
  const [scelta, setScelta] = useState("");
  const cantieri = assegnazioni.data ?? [];
  const richiesto = params.get("order");
  // 12/11/2026 — L'unica scelta è dove va la merce: in magazzino o in cantiere.
  // «In magazzino» vuol dire senza commessa, e `ddt_documento_accoda` lo accetta
  // solo da chi è ufficio: per gli operai il cantiere resta obbligatorio (11/11).
  const ufficio = useCampoUfficio().data === true;
  const permessi = usePermissions();
  const puoRegistrare = puoRegistrareBolle(permessi);
  const senzaAIPossibile = puoCompilareSenzaAI(permessi);
  const [dove, setDove] = useState<"magazzino" | "cantiere" | null>(null);
  const destinazione = dove ?? (ufficio && !richiesto && !cantieri.length ? "magazzino" : "cantiere");
  const [conAI, setConAI] = useState(true);
  const [compila, setCompila] = useState(false);
  const [attesa, setAttesa] = useState<string | null>(null);
  const [revisione, setRevisione] = useState<DocumentoPersistente | null>(null);
  const sceltaCantiere = cantiereBolla({
    richiesto,
    scelta,
    cantieri: cantieri.map((c) => c.order_id),
    ufficio: false,
  });
  const orderId = destinazione === "magazzino" ? null : sceltaCantiere.orderId;
  const valoreCantiere = sceltaCantiere.valore;
  const cantierePronto = destinazione === "magazzino" ? ufficio : sceltaCantiere.pronto;
  const etichettaCantiere = (() => {
    if (!orderId) return "In magazzino (senza commessa)";
    const c = cantieri.find((x) => x.order_id === orderId);
    return c ? `${c.order.order_code} · ${c.order.description || c.order.indirizzo_lavori || ""}` : "Cantiere";
  })();
  const [files, setFiles] = useState<File[]>([]);
  const [locali, setLocali] = useState<SyncItem[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [pdfDaDividere, setPdfDaDividere] = useState<
    Array<{ id: string; pdf: PdfDaDividere }>
  >([]);
  const [preparandoPdf, setPreparandoPdf] = useState(false);
  const blocco = useRef(false);
  const camera = useRef<HTMLInputElement>(null);
  const archivio = useRef<HTMLInputElement>(null);
  const documenti = useDocumentiDDT(true);

  useEffect(() => {
    let vivo = true;
    const aggiorna = () => {
      void syncQueue
        .getAll()
        .then((items) => {
          if (vivo)
            setLocali(
              items.filter(
                (i) =>
                  i.type === "documento_ddt" &&
                  syncItemScope(i).owner === user?.id &&
                  syncItemScope(i).companyId === profile?.company_id,
              ),
            );
        })
        .catch(() => {});
      void documenti.refetch();
    };
    aggiorna();
    const off = syncQueue.on("change", aggiorna);
    return () => {
      vivo = false;
      off();
    };
    // Il cambio identità rimonta l'editor e non mostra bozze di altre persone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.company_id]);

  // Letta la bolla appena inviata, si apre la finestra per confermarla.
  const appenaLetta = attesa
    ? (documenti.data ?? []).find((j) => j.id === attesa && j.status === "review") ?? null
    : null;
  const daRivedere = revisione ?? appenaLetta;

  const aggiungi = async (nuovi: File[]) => {
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
    setPreparandoPdf(true);
    try {
      const diretti: File[] = [];
      for (const f of nuovi) {
        if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
          const pagine = await contaPagine(f);
          if ((pagine ?? 1) > 1) {
            const pdf = await leggiPerDividere(f);
            setPdfDaDividere((p) => [...p, { id: crypto.randomUUID(), pdf }]);
            continue;
          }
        }
        diretti.push(f);
      }
      setFiles((p) => [...p, ...diretti]);
    } catch {
      toast.error(
        "Non riesco a preparare questo PDF. L’originale resta sul dispositivo: riprova o invialo all’ufficio.",
      );
    } finally {
      setPreparandoPdf(false);
    }
  };

  const accoda = async (pagine: File[]) => {
    if (!user?.id || !profile?.company_id || !cantierePronto)
      throw new Error("Scegli prima il cantiere");
    return syncQueue.enqueue({
      type: "documento_ddt",
      payload: {
        files: pagine,
        fileNames: pagine.map((f) => f.name),
        fileTypes: pagine.map((f) => f.type),
        user_id: user.id,
        company_id: profile.company_id,
        order_id: orderId ?? null,
      },
    });
  };

  const salva = async () => {
    if (
      blocco.current ||
      !files.length ||
      !cantierePronto ||
      !user?.id ||
      !profile?.company_id
    )
      return;
    blocco.current = true;
    setSalvando(true);
    try {
      // Prima IndexedDB, poi rete: la lettura AI non trattiene la pagina aperta.
      const id = await accoda(files);
      setFiles([]);
      // Chi può registrare rivede subito quello che l'AI ha letto.
      if (puoRegistrare && typeof id === "string") setAttesa(id);
      toast.success(
        navigator.onLine
          ? "Documento salvato: invio e lettura continuano in background"
          : "Salvato su questo telefono: verrà inviato quando torna la connessione",
      );
      void syncQueue.processQueue();
    } catch {
      toast.error(
        "Non riesco a salvare sul telefono. Le foto restano qui: riprova prima di uscire.",
      );
    } finally {
      blocco.current = false;
      setSalvando(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-3 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Receipt className="h-6 w-6 text-orange-600" />
          Bolle e DDT
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scegli dove va la merce, fotografa la bolla e inviala.
        </p>
      </header>
      <section
        className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm"
        aria-label="Nuovo documento di cantiere"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium">Dove va la merce</p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Dove va la merce">
            <button
              type="button"
              aria-pressed={destinazione === "magazzino"}
              disabled={!ufficio}
              title={ufficio ? undefined : "Le bolle del magazzino le carica l'ufficio"}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border font-semibold disabled:opacity-40 ${destinazione === "magazzino" ? "border-primary bg-primary/10 text-primary" : ""}`}
              onClick={() => setDove("magazzino")}
            >
              <Warehouse className="h-5 w-5" aria-hidden="true" /> In magazzino
            </button>
            <button
              type="button"
              aria-pressed={destinazione === "cantiere"}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border font-semibold ${destinazione === "cantiere" ? "border-primary bg-primary/10 text-primary" : ""}`}
              onClick={() => setDove("cantiere")}
            >
              <HardHat className="h-5 w-5" aria-hidden="true" /> In cantiere
            </button>
          </div>
        </div>
        {destinazione === "cantiere" && (
          <label className="block space-y-1 text-sm font-medium">
            Cantiere
            <select
              className={campo}
              value={valoreCantiere}
              disabled={
                assegnazioni.isLoading ||
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
            </select>
          </label>
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
          !ufficio && (
            <p className="text-sm text-muted-foreground">
              L’ufficio deve prima assegnarti un cantiere.
            </p>
          )}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="flex min-h-16 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 font-semibold text-orange-900"
            onClick={() => camera.current?.click()}
            disabled={salvando || preparandoPdf}
          >
            <Camera className="h-5 w-5" />
            Scatta foto
          </button>
          <button
            type="button"
            className="flex min-h-16 items-center justify-center gap-2 rounded-xl border font-semibold"
            onClick={() => archivio.current?.click()}
            disabled={salvando || preparandoPdf}
          >
            <FileUp className="h-5 w-5" />
            Foto o PDF
          </button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          hidden
          aria-label="Fotografa il DDT"
          onChange={(e) => {
            void aggiungi(Array.from(e.target.files ?? []));
            e.target.value = "";
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
            void aggiungi(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {preparandoPdf && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Controllo le pagine del PDF…
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
              if (!cantierePronto) {
                toast.error("Scegli prima il cantiere e ripeti la conferma");
                return;
              }
              if (blocco.current) return;
              blocco.current = true;
              setSalvando(true);
              void (async () => {
                let salvate = 0;
                try {
                  for (const pezzo of pezzi) {
                    await accoda([pezzo]);
                    salvate++;
                  }
                  setPdfDaDividere((p) => p.filter((x) => x.id !== d.id));
                  toast.success(
                    `${salvate} bolle salvate: la lettura continua in background`,
                  );
                  void syncQueue.processQueue();
                } catch {
                  toast.error(
                    `${salvate} bolle salvate sul telefono. Conserva il PDF e riprova per completare l’invio.`,
                  );
                } finally {
                  blocco.current = false;
                  setSalvando(false);
                }
              })();
            }}
          />
        ))}
        {!!files.length && (
          <>
            <p className="text-sm font-medium">
              Pagine dello stesso DDT ({files.length})
            </p>
            <ul className="divide-y">
              {files.map((f, i) => (
                <li
                  key={`${f.name}:${i}`}
                  className="flex items-center gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 break-all">
                    {i + 1}. {f.name}
                  </span>
                  <button
                    type="button"
                    className="min-h-11 min-w-11 rounded-lg border"
                    aria-label={`Rimuovi pagina ${i + 1}`}
                    disabled={salvando}
                    onClick={() => setFiles((p) => p.filter((_, k) => i !== k))}
                  >
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Per una bolla diversa, salva questa e inizia un nuovo invio. Sono
              accettati anche PDF e foto HEIC dell’iPhone.
            </p>
          </>
        )}
        {senzaAIPossibile && (
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Leggi con l'AI
            </span>
            <Switch checked={conAI} onCheckedChange={setConAI} aria-label="Leggi con l'AI" />
          </label>
        )}
        {conAI || !senzaAIPossibile ? (
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
            disabled={
              !files.length ||
              !cantierePronto ||
              salvando ||
              preparandoPdf ||
              pdfDaDividere.length > 0
            }
            onClick={() => void salva()}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}Invia la bolla
          </button>
        ) : (
          <SenzaAI
            files={files}
            orderId={orderId}
            pronto={!!files.length && cantierePronto && !salvando && !preparandoPdf && !pdfDaDividere.length}
            onCompila={() => setCompila(true)}
            onSalvata={() => setFiles([])}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {conAI || !senzaAIPossibile
            ? puoRegistrare
              ? "L'AI legge la bolla: appena finisce ti mostra cosa ha letto da confermare. Senza connessione l'invio riparte da solo."
              : "L'AI legge la bolla e l'ufficio la conferma. Senza connessione l'invio riparte da solo."
            : "Senza AI: scrivi tu numero, fornitore e righe guardando la foto, oppure lasciala all'ufficio."}
        </p>
      </section>
      {!!locali.length && (
        <section
          className="space-y-2"
          aria-label="Documenti conservati sul telefono"
        >
          <h2 className="font-semibold">Su questo telefono</h2>
          {locali.map((i) => (
            <div
              className="rounded-xl border bg-amber-50 p-3 text-sm"
              key={i.id}
            >
              <p>
                {i.status === "failed"
                  ? "Invio da riprovare"
                  : i.status === "syncing"
                    ? "Salvataggio sul server…"
                    : "Conservato sul telefono, in attesa di invio"}
              </p>
              {i.lastError && <p className="mt-1 text-xs">{i.lastError}</p>}
              {i.status === "failed" && (
                <button
                  className="min-h-11 font-semibold underline"
                  onClick={async () => {
                    await syncQueue.retryFailed((x) => x.id === i.id);
                    void syncQueue.processQueue();
                  }}
                >
                  Riprova l’invio
                </button>
              )}
            </div>
          ))}
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
              <p className="break-all text-sm font-medium">
                {j.files[0]?.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {STATO_DOCUMENTO[j.status]} ·{" "}
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
      {compila && profile?.company_id && (
        <CompilaBollaTelefono
          files={files}
          companyId={profile.company_id}
          orderId={orderId}
          etichettaCantiere={etichettaCantiere}
          onChiudi={() => setCompila(false)}
          onFatto={() => {
            setCompila(false);
            setFiles([]);
          }}
        />
      )}
      {daRivedere && (
        <RevisioneBollaTelefono
          documento={daRivedere}
          etichettaCantiere={
            daRivedere.order_id
              ? (() => {
                  const c = cantieri.find((x) => x.order_id === daRivedere.order_id);
                  return c ? `${c.order.order_code} · ${c.order.description || ""}` : "Cantiere";
                })()
              : "In magazzino (senza commessa)"
          }
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
    </main>
  );
}

/** Senza AI: «Compila ora» apre la finestra; «La compila l'ufficio» salva il solo documento. */
function SenzaAI({
  files,
  orderId,
  pronto,
  onCompila,
  onSalvata,
}: {
  files: File[];
  orderId: string | null;
  pronto: boolean;
  onCompila: () => void;
  onSalvata: () => void;
}) {
  const salvaSoloDocumento = useSalvaSoloDocumento();
  const [salvando, setSalvando] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        className="min-h-12 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
        disabled={!pronto || salvando}
        onClick={onCompila}
      >
        Compila ora
      </button>
      <button
        type="button"
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border font-semibold disabled:opacity-50"
        disabled={!pronto || salvando}
        onClick={async () => {
          setSalvando(true);
          try {
            await salvaSoloDocumento(files, orderId);
            toast.success("Bolla salvata: la compila l'ufficio");
            onSalvata();
          } catch (e) {
            toast.error("Bolla non salvata: le foto restano qui", {
              description: (e as { message?: string })?.message,
            });
          } finally {
            setSalvando(false);
          }
        }}
      >
        {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
        La compila l'ufficio
      </button>
    </div>
  );
}
