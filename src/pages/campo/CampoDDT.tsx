import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Camera, FileUp, Loader2, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
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
  const orderId = cantieri.some((c) => c.order_id === richiesto)
    ? richiesto!
    : scelta || (cantieri.length === 1 ? cantieri[0].order_id : "");
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
    if (!user?.id || !profile?.company_id || !orderId)
      throw new Error("Scegli prima il cantiere");
    await syncQueue.enqueue({
      type: "documento_ddt",
      payload: {
        files: pagine,
        fileNames: pagine.map((f) => f.name),
        fileTypes: pagine.map((f) => f.type),
        user_id: user.id,
        company_id: profile.company_id,
        order_id: orderId,
      },
    });
  };

  const salva = async () => {
    if (
      blocco.current ||
      !files.length ||
      !orderId ||
      !user?.id ||
      !profile?.company_id
    )
      return;
    blocco.current = true;
    setSalvando(true);
    try {
      // Prima IndexedDB, poi rete: la lettura AI non trattiene la pagina aperta.
      await accoda(files);
      setFiles([]);
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
          Fotografa tutte le pagine dello stesso DDT o scegli un file. L’ufficio
          controlla la lettura e conferma i materiali arrivati.
        </p>
      </header>
      <section
        className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm"
        aria-label="Nuovo documento di cantiere"
      >
        <label className="block space-y-1 text-sm font-medium">
          Cantiere
          <select
            className={campo}
            value={orderId}
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
          !cantieri.length && (
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
              if (!orderId) {
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
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
          disabled={
            !files.length ||
            !orderId ||
            salvando ||
            preparandoPdf ||
            pdfDaDividere.length > 0
          }
          onClick={() => void salva()}
        >
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}Salva e
          analizza il DDT
        </button>
        <p className="text-xs text-muted-foreground">
          Dopo il salvataggio sul server la lettura continua anche se esci.
          Senza connessione, riapri l’app per completare l’invio. Nessun prezzo
          è richiesto.
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
      <Link
        to={orderId ? `/campo/merce?order=${orderId}` : "/campo/merce"}
        className="flex min-h-11 items-center text-sm underline"
      >
        Hai pagato tu? Registra una spesa o uno scontrino
      </Link>
    </main>
  );
}
