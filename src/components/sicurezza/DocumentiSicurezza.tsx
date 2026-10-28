import { SafetyWorkflow } from "@/components/sicurezza/SafetyWorkflow";
/**
 * L'archivio dei documenti di sicurezza: caricamento di qualunque file (PDF,
 * foto, Word, Excel, DWG…) con tipo, commessa, impresa, data e scadenza;
 * elenco con filtri e stato della scadenza. Si usa sia nella pagina Sicurezza
 * cantiere (tutte le commesse) sia nella vista Sicurezza della commessa.
 */
import { useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  Download,
  FileUp,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  apriDocumentoSicurezza,
  LIMITE_FILE_SICUREZZA,
  useCaricaDocumentiSicurezza,
  useDocumentiSicurezza,
  useEliminaDocumentoSicurezza,
} from "@/hooks/useDocumentiSicurezza";
import {
  statoScadenza,
  TIPI_SICUREZZA,
  type DocumentoSicurezza,
  type TipoDocumentoSicurezza,
} from "@/lib/sicurezza/documentiSicurezza";

const AZIENDA = "__azienda__";
const NESSUNA = "__nessuna__";
const oggiRoma = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
const dataIT = (d: string) => d.split("-").reverse().join("/");

interface Commessa {
  id: string;
  order_code: string | null;
  description: string | null;
}
interface Subappaltatore {
  id: string;
  ragione_sociale: string | null;
  order_id: string | null;
}

function useCommesseESub(companyId: string, attivo: boolean) {
  const commesse = useQuery({
    queryKey: ["sicurezza-doc-commesse", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Commessa[];
    },
    enabled: attivo,
  });
  const sub = useQuery({
    queryKey: ["sicurezza-doc-sub", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subappaltatori_sicurezza")
        .select("id, ragione_sociale, order_id")
        .eq("company_id", companyId)
        .order("ragione_sociale");
      if (error) throw error;
      return (data ?? []) as Subappaltatore[];
    },
    enabled: attivo,
  });
  return { commesse: commesse.data ?? [], subappaltatori: sub.data ?? [] };
}

export interface PresetCaricamento {
  tipo?: TipoDocumentoSicurezza;
  subappaltatoreId?: string | null;
}

interface FileInAttesa {
  file: File;
  titolo: string;
}

/** Finestra di caricamento: uno o più file con gli stessi dati (tipo, commessa, scadenza). */
export function CaricaDocumentoSicurezzaDialog({
  companyId,
  orderId,
  open,
  onOpenChange,
  preset,
}: {
  companyId: string;
  /** Commessa fissa (vista della commessa); senza, si sceglie. */
  orderId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset?: PresetCaricamento;
}) {
  const { commesse, subappaltatori } = useCommesseESub(companyId, open);
  const carica = useCaricaDocumentiSicurezza(companyId);
  const [file, setFile] = useState<FileInAttesa[]>([]);
  const [tipo, setTipo] = useState<TipoDocumentoSicurezza>(
    preset?.tipo ?? "altro",
  );
  const [commessa, setCommessa] = useState<string>(orderId ?? NESSUNA);
  const [sub, setSub] = useState<string>(preset?.subappaltatoreId ?? NESSUNA);
  const [dataDoc, setDataDoc] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [note, setNote] = useState("");

  // La finestra si riapre coi dati del punto da cui la si apre (es. «Carica il PSC»).
  const [ultimoPreset, setUltimoPreset] = useState<string>("");
  const chiavePreset = `${open}|${preset?.tipo}|${preset?.subappaltatoreId}|${orderId}`;
  if (!open && ultimoPreset) setUltimoPreset("");
  else if (open && chiavePreset !== ultimoPreset) {
    setUltimoPreset(chiavePreset);
    setFile([]);
    setTipo(preset?.tipo ?? "altro");
    setCommessa(orderId ?? NESSUNA);
    setSub(preset?.subappaltatoreId ?? NESSUNA);
    setDataDoc("");
    setScadenza("");
    setNote("");
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // Qualunque formato: PDF, foto, Word, Excel, disegni. Il limite è la dimensione.
    maxSize: LIMITE_FILE_SICUREZZA,
    onDrop: (accettati, rifiutati) => {
      if (rifiutati.length)
        toast.error(
          `${rifiutati.length} file superano i 50 MB e sono rimasti fuori.`,
        );
      setFile((f) => [
        ...f,
        ...accettati.map((x) => ({
          file: x,
          titolo: x.name.replace(/\.[^.]+$/, ""),
        })),
      ]);
    },
  });

  const subVisibili = subappaltatori.filter(
    (s) =>
      commessa === NESSUNA ||
      commessa === AZIENDA ||
      !s.order_id ||
      s.order_id === commessa,
  );
  const conScadenza = TIPI_SICUREZZA[tipo]?.scade;

  const salva = () => {
    if (tipo === "psc" && (commessa === NESSUNA || commessa === AZIENDA || sub !== NESSUNA)) {
      toast.error("Il PSC deve riferirsi a una commessa precisa, senza associarlo alla sola anagrafica di un subappaltatore.");
      return;
    }
    if (!file.length) {
      toast.error("Aggiungi almeno un file");
      return;
    }
    carica.mutate(
      file.map((f) => ({
        file: f.file,
        tipo,
        titolo: f.titolo,
        orderId: commessa === NESSUNA || commessa === AZIENDA ? null : commessa,
        subappaltatoreId: sub === NESSUNA ? null : sub,
        dataDocumento: dataDoc || null,
        dataScadenza: scadenza || null,
        note: note.trim() || null,
      })),
      {
        onSuccess: () => {
          toast.success(
            file.length === 1
              ? "Documento caricato"
              : `${file.length} documenti caricati`,
          );
          onOpenChange(false);
        },
        onError: (e) =>
          toast.error(
            e instanceof Error ? e.message : "Caricamento non riuscito",
          ),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!carica.isPending) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carica documenti di sicurezza</DialogTitle>
          <DialogDescription>
            Qualunque formato (PDF, foto, Word, Excel…), fino a 50 MB per file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div
            {...getRootProps()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:bg-muted/40",
            )}
          >
            <input {...getInputProps()} />
            <FileUp className="h-6 w-6 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium">
              Trascina qui i file, o clicca per sceglierli
            </p>
          </div>
          {file.length > 0 && (
            <div className="space-y-1.5">
              {file.map((f, i) => (
                <div
                  key={`${f.file.name}-${i}`}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={f.titolo}
                    aria-label="Titolo del documento"
                    className="h-8 text-sm"
                    onChange={(e) =>
                      setFile((x) =>
                        x.map((y, j) =>
                          j === i ? { ...y, titolo: e.target.value } : y,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Togli il file"
                    onClick={() => setFile((x) => x.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <Label>Tipo di documento</Label>
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as TipoDocumentoSicurezza)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPI_SICUREZZA) as TipoDocumentoSicurezza[]).map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {TIPI_SICUREZZA[t].label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TIPI_SICUREZZA[tipo]?.aiuto}
            </p>
          </div>
          {!orderId && (
            <div className="space-y-1">
              <Label>Commessa</Label>
              <Select value={commessa} onValueChange={setCommessa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>
                    Tutta l'azienda (vale per ogni cantiere)
                  </SelectItem>
                  {commesse.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.order_code ? `${c.order_code} · ` : ""}
                      {c.description ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {orderId && (
            <div className="space-y-1">
              <Label>Vale per</Label>
              <Select value={commessa} onValueChange={setCommessa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={orderId}>Solo questa commessa</SelectItem>
                  <SelectItem value={AZIENDA}>
                    Tutta l'azienda (es. patente a crediti, DURC)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Impresa</Label>
            <Select value={sub} onValueChange={setSub}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUNA}>La tua impresa</SelectItem>
                {subVisibili.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.ragione_sociale ?? "Subappaltatore"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sub !== NESSUNA && (
              <p className="text-xs text-muted-foreground">
                Va nella scheda del subappaltatore: lo vedi lì e qui, senza
                caricarlo due volte.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Data del documento</Label>
              <Input
                type="date"
                value={dataDoc}
                onChange={(e) => setDataDoc(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Scadenza{conScadenza ? " (consigliata)" : ""}</Label>
              <Input
                type="date"
                value={scadenza}
                onChange={(e) => setScadenza(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Facoltative"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={carica.isPending}
          >
            Annulla
          </Button>
          <Button onClick={salva} disabled={carica.isPending || !file.length}>
            {carica.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-1.5 h-4 w-4" />
            )}
            Carica {file.length > 1 ? `${file.length} file` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Elenco dei documenti con filtri; con `orderId` mostra quelli della commessa e quelli di tutta l'azienda. */
export function DocumentiSicurezza({
  companyId,
  orderId,
  sola,
  workflow = false,
}: {
  companyId: string;
  orderId?: string | null;
  sola?: boolean;
  workflow?: boolean;
}) {
  const {
    data: documenti = [],
    isLoading,
    isError,
  } = useDocumentiSicurezza(companyId, orderId);
  const { commesse, subappaltatori } = useCommesseESub(companyId, true);
  const elimina = useEliminaDocumentoSicurezza();
  const confirm = useConfirm();
  const [carica, setCarica] = useState(false);
  const [cerca, setCerca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("tutti");
  const [filtroCommessa, setFiltroCommessa] = useState<string>("tutte");
  const [soloScadenze, setSoloScadenze] = useState(false);
  const oggi = oggiRoma();

  const nomeCommessa = useMemo(
    () =>
      new Map(
        commesse.map((c) => [
          c.id,
          c.order_code ?? c.description ?? "Commessa",
        ]),
      ),
    [commesse],
  );
  const nomeSub = useMemo(
    () =>
      new Map(
        subappaltatori.map((s) => [
          s.id,
          s.ragione_sociale ?? "Subappaltatore",
        ]),
      ),
    [subappaltatori],
  );

  const visibili = documenti.filter((d) => {
    if (filtroTipo !== "tutti" && d.tipo !== filtroTipo) return false;
    if (
      !orderId &&
      filtroCommessa !== "tutte" &&
      (filtroCommessa === AZIENDA
        ? d.order_id != null
        : d.order_id !== filtroCommessa)
    )
      return false;
    if (soloScadenze && statoScadenza(d.data_scadenza, oggi) === "ok")
      return false;
    const t = cerca.trim().toLowerCase();
    return (
      !t ||
      `${d.titolo} ${d.file_name} ${d.note ?? ""}`.toLowerCase().includes(t)
    );
  });
  const daGuardare = documenti.filter(
    (d) => statoScadenza(d.data_scadenza, oggi) !== "ok",
  ).length;

  const apri = (d: DocumentoSicurezza) =>
    apriDocumentoSicurezza(d).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Documento non disponibile"),
    );
  const togli = async (d: DocumentoSicurezza) => {
    if (sola) return;
    if (
      !(await confirm({
        title: "Eliminare il documento?",
        description: `«${d.titolo}» verrà eliminato insieme al file.`,
        confirmLabel: "Elimina",
        variant: "destructive",
      }))
    )
      return;
    elimina.mutate(d, {
      onSuccess: () => toast.success("Documento eliminato"),
      onError: (e) =>
        toast.error(
          e instanceof Error ? e.message : "Eliminazione non riuscita",
        ),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!workflow && (
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca documento"
              className="h-8 w-44 pl-7 text-sm"
            />
          </div>
        )}
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i tipi</SelectItem>
            {(Object.keys(TIPI_SICUREZZA) as TipoDocumentoSicurezza[]).map(
              (t) => (
                <SelectItem key={t} value={t}>
                  {TIPI_SICUREZZA[t].label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        {!workflow && !orderId && (
          <Select value={filtroCommessa} onValueChange={setFiltroCommessa}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le commesse</SelectItem>
              <SelectItem value={AZIENDA}>Tutta l'azienda</SelectItem>
              {commesse.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.order_code ? `${c.order_code} · ` : ""}
                  {c.description ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant={soloScadenze ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1"
          onClick={() => setSoloScadenze((v) => !v)}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Scaduti o in scadenza{daGuardare ? ` (${daGuardare})` : ""}
        </Button>
        {!sola && (
          <Button
            size="sm"
            className="ml-auto h-8"
            onClick={() => setCarica(true)}
          >
            <FileUp className="mr-1 h-4 w-4" />
            Carica documenti
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-destructive">
          Non riesco a leggere i documenti. Ricarica la pagina.
        </p>
      ) : workflow ? (
        <SafetyWorkflow<DocumentoSicurezza>
          namespace="documenti"
          onOpen={apri}
          defaultView="elenco"
          label="Documenti"
          items={visibili}
          stages={[
            {
              id: "scaduto",
              label: "Scaduti",
              hint: "Data di scadenza superata",
              accent: "border-t-rose-500",
            },
            {
              id: "in_scadenza",
              label: "Entro 30 giorni",
              hint: "Scadenza vicina",
              accent: "border-t-amber-500",
            },
            {
              id: "ok",
              label: "Data non scaduta",
              hint: "Scadenza registrata oltre 30 giorni",
              accent: "border-t-emerald-500",
            },
            {
              id: "senza_scadenza",
              label: "Senza scadenza",
              hint: "Nessuna scadenza registrata",
              accent: "border-t-slate-400",
            },
          ]}
          getStage={(d) =>
            d.data_scadenza
              ? statoScadenza(d.data_scadenza, oggi)
              : "senza_scadenza"
          }
          orders={commesse}
          getOrderId={(d) => d.order_id}
          getTitle={(d) => d.titolo}
          getSearch={(d) =>
            [
              d.titolo,
              d.file_name,
              d.note,
              nomeCommessa.get(d.order_id ?? ""),
              nomeSub.get(d.subappaltatore_id ?? ""),
            ].join(" ")
          }
          canWrite={!sola}
          note="Le fasi seguono la scadenza registrata sul file. Per rinnovare un documento carica la versione aggiornata con la sua data effettiva."
          onTransition={(d) => ({
            title: "Aggiorna il documento",
            description:
              "Trascinare un file non cambia la sua scadenza. Controlla il documento e carica la versione aggiornata.",
            label: "Apri il documento",
            run: () => apri(d),
          })}
          renderCard={(d) => (
            <>
              <p className="text-xs text-muted-foreground">
                {TIPI_SICUREZZA[d.tipo]?.label ?? d.tipo}
              </p>
              <p className="text-xs text-muted-foreground">
                {d.subappaltatore_id
                  ? nomeSub.get(d.subappaltatore_id)
                  : "Documento di cantiere"}
              </p>
              <p className="text-xs text-muted-foreground">
                Scadenza:{" "}
                {d.data_scadenza ? dataIT(d.data_scadenza) : "non indicata"}
              </p>
            </>
          )}
          renderActions={(d) => (
            <>
              {!sola && (!d.fonte || d.fonte === "sicurezza") && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  aria-label="Elimina il documento"
                  onClick={() => togli(d)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
          columns={[
            {
              label: "Documento",
              render: (d) => (
                <button
                  type="button"
                  className="block max-w-72 truncate font-medium text-primary hover:underline"
                  title={d.titolo}
                  onClick={() => apri(d)}
                >
                  {d.titolo}
                </button>
              ),
            },
            {
              label: "Tipo",
              render: (d) => TIPI_SICUREZZA[d.tipo]?.label ?? d.tipo,
            },
            {
              label: "Commessa",
              render: (d) =>
                d.order_id
                  ? nomeCommessa.get(d.order_id) || "Commessa"
                  : "Tutta l’azienda",
            },
            {
              label: "Impresa",
              render: (d) =>
                d.subappaltatore_id
                  ? nomeSub.get(d.subappaltatore_id) || "—"
                  : "—",
            },
            {
              label: "Data documento",
              render: (d) =>
                d.data_documento ? dataIT(d.data_documento) : "—",
            },
            {
              label: "Scadenza",
              render: (d) => (d.data_scadenza ? dataIT(d.data_scadenza) : "—"),
            },
          ]}
        />
      ) : visibili.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {documenti.length
            ? "Nessun documento con questi filtri."
            : "Nessun documento ancora. Carica PSC, notifica, PiMUS, DURC, attestati…"}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {visibili.map((d) => {
            const stato = statoScadenza(d.data_scadenza, oggi);
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() => apri(d)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{d.titolo}</span>
                    <Badge variant="outline" className="text-[11px]">
                      {TIPI_SICUREZZA[d.tipo]?.label ?? d.tipo}
                    </Badge>
                    {stato === "scaduto" && (
                      <Badge className="bg-red-100 text-[11px] text-red-800 hover:bg-red-100">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Scaduto
                      </Badge>
                    )}
                    {stato === "in_scadenza" && (
                      <Badge className="bg-amber-100 text-[11px] text-amber-800 hover:bg-amber-100">
                        In scadenza
                      </Badge>
                    )}
                    {d.fonte && d.fonte !== "sicurezza" && (
                      <Badge variant="secondary" className="text-[11px]">
                        Dalla scheda del subappaltatore
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      d.order_id
                        ? orderId
                          ? null
                          : nomeCommessa.get(d.order_id)
                        : "Tutta l'azienda",
                      d.subappaltatore_id
                        ? nomeSub.get(d.subappaltatore_id)
                        : null,
                      d.data_documento
                        ? `del ${dataIT(d.data_documento)}`
                        : null,
                      d.data_scadenza
                        ? `scade il ${dataIT(d.data_scadenza)}`
                        : null,
                      d.note,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Apri il documento"
                  onClick={() => apri(d)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {!sola && (!d.fonte || d.fonte === "sicurezza") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Elimina il documento"
                    onClick={() => togli(d)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CaricaDocumentoSicurezzaDialog
        companyId={companyId}
        orderId={orderId}
        open={carica && !sola}
        onOpenChange={setCarica}
      />
    </div>
  );
}
