import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import {
  createPdfPreviewUrl,
  readPdfPreviewBlob,
  revokePdfPreviewUrl,
} from "@/lib/pdfPreviewSource";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SALSubappaltatore } from "@/types/subappaltatori";

type Allegato = {
  id: string;
  titolo: string;
  file_name: string | null;
  stato: string;
  tipo: string;
};
type Originale = {
  id: string;
  created_at: string;
  pdf_url: string;
  zip_url: string | null;
  sha256: string;
};
type Storico = { id: string; created_at: string; pdf_sha256: string; accettato_il?: string | null; accettato_da?: string | null; accettazione_modo?: string | null };
const MODI_ACCETTAZIONE: Record<string, string> = { carta: "firmato su carta", email: "per email", pec: "per PEC", portale: "dal portale" };
const euro = (v: number) =>
  Number(v).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
async function invoca(body: Record<string, unknown>) {
  const r = await supabase.functions.invoke("genera-verbale-sal-sub", { body });
  if (r.error) {
    let messaggio = "Generazione non riuscita. Riprova.";
    try {
      const dettaglio = await r.error.context?.json();
      if (dettaglio?.error) messaggio = dettaglio.error;
    } catch {
      /* La risposta può essere priva di JSON. */
    }
    throw new Error(messaggio);
  }
  if (r.data?.error) throw new Error(r.data.error);
  return r.data;
}
async function scarica(url: string, nome: string) {
  const r = await fetch(url);
  if (!r.ok)
    throw new Error("Il link è scaduto: riapri l'originale e riprova.");
  const blob = await r.blob();
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function VerbaleSalSubDialog({
  companyId,
  sal,
  onClose,
}: {
  companyId: string;
  sal: SALSubappaltatore;
  onClose: () => void;
}) {
  const p = usePermissions();
  const qc = useQueryClient();
  const consentito = p.canViewSubappaltatoriAmministrazione && p.canViewCosts;
  const [pannello, setPannello] = useState<"dati" | "pdf">("dati");
  const [periodo, setPeriodo] = useState<{ dal: string; al: string } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [allegati, setAllegati] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const bloccato = useRef(false);
  const richiesta = useRef(crypto.randomUUID());
  const [errore, setErrore] = useState("");
  const [anteprima, setAnteprima] = useState<{
    url: string;
    fonte: string;
    avvisi: string[];
  } | null>(null);
  const [originale, setOriginale] = useState<Originale | null>(null);
  const [confermaUscita, setConfermaUscita] = useState(false);
  const [archiviatoDaForm, setArchiviatoDaForm] = useState(false);
  const dirty = !!(periodo || note || allegati.length) && !archiviatoDaForm;
  const invalida = () => {
    richiesta.current = crypto.randomUUID();
    setAnteprima(null);
    setOriginale(null);
    setArchiviatoDaForm(false);
    setErrore("");
  };
  useEffect(
    () => () => {
      if (anteprima?.url.startsWith("blob:"))
        revokePdfPreviewUrl(anteprima.url);
    },
    [anteprima],
  );
  const docs = useQuery({
    queryKey: [
      "verbale-sal-sub-allegati",
      companyId,
      sal.subappaltatore_id,
      sal.order_id,
    ],
    enabled: consentito && p.canViewSicurezzaCantiere,
    queryFn: async () => {
      const r = await supabase
        .from("sicurezza_fascicolo" as never)
        .select("id,titolo,file_name,stato,tipo")
        .eq("company_id", companyId)
        .eq("subappaltatore_id", sal.subappaltatore_id)
        .eq("order_id", sal.order_id)
        .is("operaio_id", null)
        .is("incarico_id", null)
        .in("tipo", ["contratto", "sal", "verbale", "altro"])
        .not("file_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(101);
      if (r.error) throw r.error;
      const righe = (r.data ?? []) as unknown as Allegato[];
      if (righe.length > 100)
        throw new Error(
          "Troppi documenti: usa il fascicolo per selezionare quelli pertinenti.",
        );
      return righe;
    },
  });
  const dateMisure = useQuery({
    queryKey: ["verbale-sal-sub-date-misure", companyId, sal.id],
    enabled: consentito,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappalto_misure" as never)
        .select("data_rilievo")
        .eq("company_id", companyId)
        .eq("sal_id", sal.id)
        .order("data_rilievo")
        .limit(101);
      if (error) throw error;
      const righe = (data ?? []) as unknown as { data_rilievo: string }[];
      if (righe.length > 100)
        throw Error("Rilevazioni oltre il limite del verbale");
      return righe;
    },
  });
  const dal = periodo?.dal ?? dateMisure.data?.[0]?.data_rilievo ?? "";
  const al = periodo?.al ?? dateMisure.data?.at(-1)?.data_rilievo ?? "";
  const storico = useQuery({
    queryKey: ["verbali-sal-sub", companyId, sal.id],
    enabled: consentito,
    queryFn: async () => {
      const r = await supabase
        .from("sal_sub_verbali" as never)
        .select("id,created_at,pdf_sha256,accettato_il,accettato_da,accettazione_modo")
        .eq("company_id", companyId)
        .eq("sal_id", sal.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (r.error) throw r.error;
      return (r.data ?? []) as Storico[];
    },
  });
  const azione = async (fn: () => Promise<void>) => {
    if (bloccato.current) return;
    bloccato.current = true;
    setBusy(true);
    setErrore("");
    try {
      await fn();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Operazione non riuscita");
    } finally {
      bloccato.current = false;
      setBusy(false);
    }
  };
  const prepara = async (archivia = false) =>
    azione(async () => {
      if (!dal || !al || dal > al)
        throw new Error("Indica un periodo valido per questo verbale.");
      const d = await invoca({
        mode: archivia ? "archivia" : "anteprima",
        company_id: companyId,
        sal_id: sal.id,
        richiesta_id: richiesta.current,
        periodo_dal: dal,
        periodo_al: al,
        nota_verbale: note,
        allegati,
        anteprima_sha256: anteprima?.fonte,
      });
      if (archivia) {
        if (!d.id || !d.pdf_url || !d.sha256)
          throw new Error("Originale non confermato dal server");
        setOriginale(d);
        setArchiviatoDaForm(true);
        await qc.invalidateQueries({
          queryKey: ["verbali-sal-sub", companyId, sal.id],
        });
        toast.success("Verbale e originali archiviati");
      } else {
        if (!d.pdf_base64 || !d.anteprima_sha256)
          throw new Error("Anteprima non disponibile");
        const bytes = Uint8Array.from(atob(d.pdf_base64), (c: string) =>
          c.charCodeAt(0),
        );
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
          throw new Error("Risposta PDF non valida");
        setPannello("pdf");
        setAnteprima({
          url: createPdfPreviewUrl(
            new Blob([bytes], { type: "application/pdf" }),
          ),
          fonte: d.anteprima_sha256,
          avvisi: Array.isArray(d.avvisi)
            ? d.avvisi.filter(
                (v: unknown): v is string => typeof v === "string",
              )
            : [],
        });
      }
    });
  const apri = async (id: string) =>
    azione(async () => {
      const r = await invoca({
        mode: "apri",
        company_id: companyId,
        verbale_id: id,
      });
      if (!r.pdf_url || !r.id) throw new Error("Originale non disponibile");
      setOriginale(r);
      setPannello("pdf");
    });
  const chiudi = () => {
    if (busy) return;
    if (dirty) setConfermaUscita(true);
    else onClose();
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(v) => {
          if (!v) chiudi();
        }}
      >
        <DialogContent
          className="flex h-[92dvh] max-h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b p-4 pr-12">
            <DialogTitle>Verbale SAL #{sal.numero_sal}</DialogTitle>
            <DialogDescription>
              Periodo, riepilogo e documenti del subappalto. Il SAL e i
              pagamenti restano invariati.
            </DialogDescription>
          </DialogHeader>
          {!consentito ? (
            <p role="alert" className="p-6">
              Non hai il permesso di consultare questo documento economico.
            </p>
          ) : (
            <>
              <div
                className="flex shrink-0 gap-2 border-b px-4 py-2 lg:hidden"
                aria-label="Sezioni del verbale"
              >
                <Button
                  size="sm"
                  variant={pannello === "dati" ? "default" : "outline"}
                  onClick={() => setPannello("dati")}
                >
                  Dati e documenti
                </Button>
                <Button
                  size="sm"
                  variant={pannello === "pdf" ? "default" : "outline"}
                  onClick={() => setPannello("pdf")}
                >
                  Anteprima PDF
                </Button>
              </div>
              <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[350px_1fr]">
                <div
                  className={`${pannello === "dati" ? "block" : "hidden"} space-y-4 border-r p-4 lg:block`}
                >
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p>
                      Lordo del periodo{" "}
                      <strong>{euro(sal.importo_lordo)}</strong>
                    </p>
                    <p>
                      Ritenuta <strong>{euro(sal.ritenuta_importo)}</strong>
                    </p>
                    <p>
                      Netto registrato{" "}
                      <strong>{euro(sal.importo_netto)}</strong>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stato attuale: {sal.stato}. Quantità e misure non presenti
                      nel SAL storico non saranno inventate.
                    </p>
                  </div>
                  {!!anteprima?.avvisi.length && (
                    <details className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                      <summary className="cursor-pointer font-medium">
                        Garanzie da riconciliare ({anteprima.avvisi.length})
                      </summary>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {anteprima.avvisi.map((v, i) => (
                          <li key={i}>{v}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {!!dateMisure.data?.length && (
                    <p className="text-xs text-muted-foreground">
                      Date proposte dalle rilevazioni collegate: verifica il
                      periodo prima di generare il verbale.
                    </p>
                  )}
                  {dateMisure.isError && (
                    <p className="text-xs text-amber-800">
                      Date delle rilevazioni non disponibili.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void dateMisure.refetch()}
                      >
                        Riprova
                      </button>
                    </p>
                  )}
                  <fieldset disabled={busy} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="verbale-dal">Periodo dal</Label>
                        <Input
                          id="verbale-dal"
                          type="date"
                          value={dal}
                          onChange={(e) => {
                            invalida();
                            setPeriodo({ dal: e.target.value, al });
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor="verbale-al">Al</Label>
                        <Input
                          id="verbale-al"
                          type="date"
                          value={al}
                          onChange={(e) => {
                            invalida();
                            setPeriodo({ dal, al: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="verbale-note">
                        Osservazioni e riserve
                      </Label>
                      <Textarea
                        id="verbale-note"
                        value={note}
                        maxLength={6000}
                        onChange={(e) => {
                          invalida();
                          setNote(e.target.value);
                        }}
                        placeholder="Solo le integrazioni pertinenti a questo verbale"
                      />
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        Documenti da includere ({allegati.length}/10)
                      </summary>
                      <p className="my-2 text-xs text-muted-foreground">
                        Seleziona solo documenti pertinenti al destinatario. Le
                        copie sono accodate al PDF e gli originali conservati
                        nel pacchetto.
                      </p>
                      {!p.canViewSicurezzaCantiere ? (
                        <p className="text-xs">
                          Non hai accesso ai documenti del fascicolo.
                        </p>
                      ) : docs.isLoading ? (
                        <p role="status">Caricamento documenti…</p>
                      ) : docs.isError ? (
                        <p role="alert">
                          Documenti non disponibili.{" "}
                          <Button
                            size="sm"
                            variant="link"
                            onClick={() => void docs.refetch()}
                          >
                            Riprova
                          </Button>
                        </p>
                      ) : !docs.data?.length ? (
                        <p className="text-xs text-muted-foreground">
                          Nessun documento aziendale pertinente restituito dal
                          fascicolo della commessa. I documenti personali degli
                          operai sono esclusi.
                        </p>
                      ) : (
                        docs.data.map((a) => (
                          <label
                            key={a.id}
                            className="my-2 flex items-start gap-2 rounded border p-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={allegati.includes(a.id)}
                              disabled={
                                !allegati.includes(a.id) &&
                                allegati.length >= 10
                              }
                              onChange={(e) => {
                                invalida();
                                setAllegati((prev) =>
                                  e.target.checked
                                    ? [...prev, a.id]
                                    : prev.filter((x) => x !== a.id),
                                );
                              }}
                            />
                            <span>
                              {a.titolo}
                              <span className="block text-muted-foreground">
                                {a.file_name} · {a.stato}
                              </span>
                            </span>
                          </label>
                        ))
                      )}
                    </details>
                  </fieldset>
                  <div>
                    <h3 className="text-sm font-medium">
                      Originali già archiviati
                    </h3>
                    {storico.isError ? (
                      <p role="alert" className="text-xs">
                        Archivio non disponibile.{" "}
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => void storico.refetch()}
                        >
                          Riprova
                        </Button>
                      </p>
                    ) : storico.isLoading ? (
                      <p role="status" className="text-xs">
                        Caricamento archivio…
                      </p>
                    ) : !storico.data?.length ? (
                      <p className="text-xs text-muted-foreground">
                        Nessun verbale archiviato per questo SAL.
                      </p>
                    ) : (
                      storico.data.map((r) => (
                        <div key={r.id} className="mt-2 space-y-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-auto w-full justify-start whitespace-normal text-left"
                            disabled={busy}
                            onClick={() => void apri(r.id)}
                          >
                            <FileText className="mr-2 h-4 w-4 shrink-0" />
                            <span>
                              {new Date(r.created_at).toLocaleString("it-IT")}
                              <span className="block text-xs text-muted-foreground">
                                Rif. {r.id.slice(0, 8)}
                              </span>
                            </span>
                          </Button>
                          <AccettazioneVerbale
                            verbale={r}
                            puoRegistrare={consentito && p.canEditOrders}
                            onSalvata={() => void storico.refetch()}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div
                  className={`${pannello === "pdf" ? "flex" : "hidden"} min-h-0 flex-col p-3 lg:flex`}
                >
                  {originale && (
                    <p className="mb-2 shrink-0 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      Originale archiviato · Rif. {originale.id.slice(0, 8)}. Il
                      PDF conserva i dati acquisiti alla generazione;
                      modificando il modulo prepari un nuovo verbale.
                    </p>
                  )}
                  {originale || anteprima ? (
                    <div
                      title="PDF verbale SAL subappalto"
                      className="h-full min-h-[260px] flex-1"
                    >
                      <PdfVerbale
                        fonte={originale?.pdf_url || anteprima!.url}
                        numero={sal.numero_sal}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-[350px] flex-1 flex-col items-center justify-center gap-3 rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p>
                        Indica il periodo e prepara l’anteprima.
                        <br />
                        Parti, contratto e importi vengono recuperati dal
                        server.
                      </p>
                      <p className="text-xs">
                        I SAL ricevuti o contestati riportano la filigrana
                        BOZZA. Nessuna firma viene aggiunta automaticamente.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {errore && (
                <p
                  role="alert"
                  className="shrink-0 border-t bg-red-50 px-4 py-2 text-sm text-red-700"
                >
                  {errore}
                </p>
              )}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-background p-3">
                <Button variant="outline" disabled={busy} onClick={chiudi}>
                  Torna ai SAL
                </Button>
                <div className="flex flex-wrap gap-2">
                  {originale ? (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void azione(() =>
                            scarica(
                              originale.pdf_url,
                              `verbale-sal-${sal.numero_sal}.pdf`,
                            ),
                          )
                        }
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Scarica PDF
                      </Button>
                      {originale.zip_url && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            void azione(() =>
                              scarica(
                                originale.zip_url!,
                                `verbale-sal-${sal.numero_sal}-originali.zip`,
                              ),
                            )
                          }
                        >
                          Pacchetto con originali
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        disabled={busy || !dal || !al}
                        onClick={() => void prepara()}
                      >
                        {busy && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Anteprima
                      </Button>
                      <Button
                        disabled={
                          busy ||
                          !anteprima ||
                          p.solaLettura ||
                          !p.canEditOrders
                        }
                        onClick={() => void prepara(true)}
                      >
                        Archivia originale
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confermaUscita} onOpenChange={setConfermaUscita}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chiudere senza archiviare?</AlertDialogTitle>
            <AlertDialogDescription>
              Il periodo, le osservazioni e la selezione dei documenti di questa
              prova non sono archiviati. Gli originali già presenti restano
              conservati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua modifica</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>
              Chiudi senza archiviare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PdfVerbale({ fonte, numero }: { fonte: string; numero: number }) {
  const render = useCallback(
    async () => createPdfPreviewUrl(await readPdfPreviewBlob(fonte)),
    [fonte],
  );
  return (
    <PdfBlobLivePreviewPanel
      renderBlobUrl={render}
      depsKey={fonte}
      debounceMs={0}
      allowOpenInNewTab={false}
      headerLabel="Verbale SAL · PDF"
      downloadFileName={`verbale-sal-${numero}.pdf`}
      showDownloadOnMobile
    />
  );
}

/**
 * Il subappaltatore ha accettato il verbale: chi, quando, come. Si registra
 * sull'originale archiviato (sal_sub_verbale_accettazione); il PDF non cambia.
 * Dopo l'accettazione il subappaltatore emette la fattura, che si collega al
 * SAL dalla scheda del contratto.
 */
function AccettazioneVerbale({ verbale, puoRegistrare, onSalvata }: { verbale: Storico; puoRegistrare: boolean; onSalvata: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [data, setData] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }));
  const [nome, setNome] = useState("");
  const [modo, setModo] = useState("carta");
  const [salvando, setSalvando] = useState(false);
  const salva = async (togli = false) => {
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("sal_sub_verbale_accettazione", {
        p_verbale: verbale.id, p_data: togli ? null : data, p_nome: togli ? null : nome, p_modo: togli ? null : modo,
      });
      if (error) throw new Error(error.message);
      toast.success(togli ? "Accettazione tolta" : "Accettazione registrata: il subappaltatore può emettere la fattura");
      setAperto(false);
      onSalvata();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Accettazione non registrata");
    } finally {
      setSalvando(false);
    }
  };
  if (verbale.accettato_il) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
        Accettato da {verbale.accettato_da} il {verbale.accettato_il.split("-").reverse().join("/")}
        {verbale.accettazione_modo ? ` · ${MODI_ACCETTAZIONE[verbale.accettazione_modo] ?? verbale.accettazione_modo}` : ""}
        {puoRegistrare && <button type="button" className="ml-auto underline" disabled={salvando} onClick={() => void salva(true)}>Togli</button>}
      </p>
    );
  }
  if (!puoRegistrare) return <p className="text-xs text-muted-foreground">Non ancora accettato dal subappaltatore.</p>;
  if (!aperto) {
    return (
      <button type="button" className="text-xs font-medium text-primary underline" onClick={() => setAperto(true)}>
        Registra l’accettazione del subappaltatore
      </button>
    );
  }
  return (
    <div className="space-y-1.5 rounded border p-2 text-xs">
      <div className="grid grid-cols-2 gap-1.5">
        <Input aria-label="Chi ha accettato" placeholder="Nome di chi firma" value={nome} onChange={(e) => setNome(e.target.value)} className="h-8 text-xs" />
        <Input aria-label="Data dell'accettazione" type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 text-xs" />
      </div>
      <select aria-label="Come è arrivata l'accettazione" value={modo} onChange={(e) => setModo(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
        {Object.entries(MODI_ACCETTAZIONE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAperto(false)}>Annulla</Button>
        <Button size="sm" className="h-7 text-xs" disabled={salvando || nome.trim().length < 2 || !data} onClick={() => void salva()}>Registra</Button>
      </div>
    </div>
  );
}
