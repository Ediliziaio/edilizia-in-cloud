/**
 * Scheda cliente → Documenti: i file di tutte le commesse del cliente,
 * divisi per commessa e poi per cartella. Sola consultazione: si caricano,
 * spostano ed eliminano dalla commessa.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, Download, ExternalLink, Folder, FolderOpen, Loader2 } from "lucide-react";
import { FileThumb } from "@/components/orders/filePreview";
import {
  KIND_LABEL,
  fileKind,
  fmtBytes,
  openAttachmentInTab,
  scaricaAllegato,
  useUrlMiniature,
} from "@/components/orders/filePreviewUtils";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { useDocumentiCommesseCliente } from "@/hooks/useDocumentiCommesseCliente";
import {
  raggruppaDocumentiCommesse,
  type CommessaDelCliente,
  type DocumentoCommessaRiga,
} from "@/lib/clienti/documentiCommesseCliente";

function dataBreve(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function DocumentiCommesseCliente({
  customerId,
  commesse,
}: {
  customerId: string;
  commesse: CommessaDelCliente[];
}) {
  const navigate = useNavigate();
  // Anche le cartelle archiviate: un file rimasto dentro mostra il nome vero.
  const { cartelle, isLoading: caricoCartelle } = useCartelleDocumenti({ tutte: true });
  const {
    data: documenti = [],
    isLoading: caricoDocumenti,
    error,
    refetch,
    isRefetching,
  } = useDocumentiCommesseCliente(customerId, commesse.map((c) => c.id));

  const gruppi = useMemo(
    () => raggruppaDocumentiCommesse(documenti, commesse, cartelle),
    [documenti, commesse, cartelle],
  );
  const { data: miniature = {} } = useUrlMiniature(documenti.map((d) => d.thumb_path), documenti.length > 0);

  const intestazione = (
    <div>
      <p className="text-sm font-semibold">Documenti delle commesse</p>
      <p className="text-xs text-muted-foreground">
        I file caricati nelle commesse del cliente, per cartella. Si gestiscono dalla commessa.
      </p>
    </div>
  );

  let contenuto: React.ReactNode;
  if (commesse.length > 0 && (caricoDocumenti || caricoCartelle)) {
    contenuto = (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carico i documenti delle commesse…
      </div>
    );
  } else if (error) {
    contenuto = (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">Documenti delle commesse non caricati</p>
          <p className="mt-0.5 text-xs">{error instanceof Error ? error.message : "Riprova tra poco."}</p>
          <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => void refetch()} disabled={isRefetching}>
            {isRefetching && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Riprova
          </Button>
        </div>
      </div>
    );
  } else if (gruppi.length === 0) {
    contenuto = (
      <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
        Nessun documento nelle commesse di questo cliente
      </p>
    );
  } else {
    contenuto = (
      <div className="space-y-2">
        {gruppi.map(({ commessa, totale, cartelle: perCartella }) => (
          <Collapsible key={commessa.id} defaultOpen className="rounded-md border">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {commessa.order_code || commessa.description || "Commessa senza codice"}
                  </span>
                  {commessa.order_code && commessa.description && (
                    <span className="block truncate text-[11px] text-muted-foreground">{commessa.description}</span>
                  )}
                </span>
              </CollapsibleTrigger>
              {commessa.fase && (
                <Badge variant="outline" className="hidden shrink-0 gap-1 text-[11px] font-normal sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: commessa.fase.color }} />
                  {commessa.fase.name}
                </Badge>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{totale}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                aria-label="Apri la commessa"
                title="Apri la commessa"
                onClick={() => navigate(`/azienda/ordini/${commessa.id}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            <CollapsibleContent className="space-y-2 border-t px-2 py-2">
              {commessa.fase && (
                <Badge variant="outline" className="gap-1 text-[11px] font-normal sm:hidden">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: commessa.fase.color }} />
                  {commessa.fase.name}
                </Badge>
              )}
              {perCartella.map((gruppo) => (
                <div key={gruppo.folderId ?? "senza-cartella"} className="space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    {gruppo.folderId ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                    <span className="truncate">{gruppo.nome}</span>
                    <span className="tabular-nums">({gruppo.documenti.length})</span>
                  </p>
                  <ul className="space-y-1">
                    {gruppo.documenti.map((doc) => (
                      <RigaDocumento
                        key={doc.id}
                        doc={doc}
                        thumbUrl={doc.thumb_path ? miniature[doc.thumb_path] : undefined}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {intestazione}
      {contenuto}
    </div>
  );
}

function RigaDocumento({ doc, thumbUrl }: { doc: DocumentoCommessaRiga; thumbUrl?: string }) {
  const peso = fmtBytes(doc.file_size);
  const tipo = KIND_LABEL[fileKind(doc)];
  return (
    <li className="flex items-center gap-2 rounded-md bg-muted/30 p-1.5">
      <FileThumb file={doc} thumbUrl={thumbUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="block max-w-full truncate text-left text-xs font-medium hover:underline"
          title={`Apri ${doc.file_name}`}
          onClick={() => void openAttachmentInTab(doc.file_url)}
        >
          {doc.file_name}
        </button>
        <span className="block truncate text-[11px] text-muted-foreground">
          {tipo}
          {peso ? ` · ${peso}` : ""} · {dataBreve(doc.created_at)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label={`Scarica ${doc.file_name}`}
        title="Scarica"
        onClick={() => void scaricaAllegato(doc.file_url, doc.file_name)}
      >
        <Download className="h-4 w-4" />
      </Button>
    </li>
  );
}
