import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { STATO_DOCUMENTO } from "@/hooks/useDocumentiDDT";
import {
  leggiPersistente,
  type DocumentoPersistente,
} from "@/lib/ddt/documentiPersistenti";
import {
  bollaDaFile,
  conLettura,
  type BollaLetta,
} from "@/lib/ddt/importBolle";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";
import {
  contaPagine,
  leggiPerDividere,
  type PdfDaDividere,
} from "@/lib/ddt/dividiPdf";
import { preparaDocumento } from "@/lib/ddt/preparaDocumento";
import { BolleInBloccoDialog } from "./BolleInBloccoDialog";

export function RevisioneDocumento({
  documento,
  onClose,
}: {
  documento: DocumentoPersistente;
  onClose: () => void;
}) {
  const caricamento = useQuery<{
    bolla: BollaLetta;
    dividere: boolean;
    originale: File;
    pdf?: PdfDaDividere;
  }>({
    queryKey: [
      "ddt-documento-revisione-v2",
      documento.company_id,
      documento.id,
      documento.updated_at,
    ],
    queryFn: async () => {
      const aggiornato = await leggiPersistente(documento.id);
      const f = aggiornato.files[0];
      const { data, error } = await supabase.storage
        .from(f.bucket ?? "ddt-documenti")
        .download(f.path);
      if (error || !data) throw new Error("Originale non disponibile: riprova");
      const originale = new File([data], f.name, { type: f.mime });
      const file = (
        await preparaDocumento(originale).catch(() => ({ lettura: originale }))
      ).lettura;
      const partenza = bollaDaFile(file, crypto.randomUUID(), {
        orderId: documento.order_id,
        destinazione: documento.order_id ? "cantiere" : "magazzino",
      });
      const letta = conLettura(
        partenza,
        leggiDDTdaAI(aggiornato.result ?? {}),
        aggiornato.result ?? {},
        [],
      );
      const pagine =
        f.mime === "application/pdf" ? await contaPagine(originale) : 1;
      return {
        bolla: { ...letta, documentoJobId: documento.id },
        dividere: (pagine ?? 1) > 1,
        originale,
        pdf: (pagine ?? 1) > 1 ? await leggiPerDividere(originale) : undefined,
      };
    },
    staleTime: Infinity,
  });
  if (caricamento.isError)
    return (
      <div role="alert" className="rounded-xl border p-4">
        <p>{caricamento.error.message}</p>
        <Button variant="outline" onClick={() => void caricamento.refetch()}>
          Riprova
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Chiudi
        </Button>
      </div>
    );
  if (!caricamento.data)
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento originale…
      </p>
    );
  return (
    <BolleInBloccoDialog
      key={documento.id}
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      iniziali={
        caricamento.data.dividere ? undefined : [caricamento.data.bolla]
      }
      pdfIniziale={caricamento.data.pdf}
      fileIniziale={
        caricamento.data.dividere ? caricamento.data.originale : undefined
      }
      documentoOrigineId={caricamento.data.dividere ? documento.id : undefined}
      orderId={documento.order_id}
      destinazione={documento.order_id ? "cantiere" : "magazzino"}
    />
  );
}

/** Le letture non ancora registrate condividono l’elenco con i DDT, senza duplicare i registrati. */
export function RigaDocumentoInIngresso({
  documento: j,
  apri,
  riprova,
  riprovando,
}: {
  documento: DocumentoPersistente;
  apri: (j: DocumentoPersistente) => void;
  riprova: (j: DocumentoPersistente) => Promise<void>;
  riprovando: string | null;
}) {
  const inLettura = ["queued", "processing"].includes(j.status);
  return (
    <tr
      className="border-b bg-amber-50/30 hover:bg-amber-50/60"
      data-documento-id={j.id}
    >
      <td className="p-3">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 max-w-64">
            <p
              className="truncate text-sm font-medium"
              title={j.files.map((f) => f.name).join(", ")}
            >
              {j.files[0]?.name ?? "Documento"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {j.source === "campo"
                ? "App cantiere"
                : j.source === "whatsapp"
                  ? "WhatsApp"
                  : "Caricamento ufficio"}
            </p>
            {j.last_error && (
              <p className="mt-1 whitespace-normal text-xs text-rose-700">
                {j.last_error}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="p-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${j.status === "error" ? "bg-rose-100 text-rose-800" : inLettura ? "bg-blue-50 text-blue-800" : "bg-amber-100 text-amber-900"}`}
        >
          {inLettura && <Loader2 className="h-3 w-3 animate-spin" />}
          {STATO_DOCUMENTO[j.status]}
        </span>
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        {new Date(j.created_at).toLocaleDateString("it-IT")}
      </td>
      <td className="p-3 text-xs text-muted-foreground">Da riconoscere</td>
      <td className="p-3 text-muted-foreground">—</td>
      <td className="p-3 text-xs">
        {j.order_id ? (
          <Link
            to={`/azienda/ordini/${j.order_id}`}
            className="text-primary hover:underline"
          >
            Commessa assegnata
          </Link>
        ) : (
          <span className="text-muted-foreground">Da associare</span>
        )}
      </td>
      <td className="p-3 text-muted-foreground">—</td>
      <td className="p-3 text-xs text-muted-foreground">Da confermare</td>
      <td className="p-3 text-center text-xs">{j.files.length}</td>
      <td className="p-3 text-right text-xs text-muted-foreground">
        Da confermare
      </td>
      <td className="p-3">
        {inLettura ? (
          <span className="text-xs text-muted-foreground">
            Analisi in corso…
          </span>
        ) : (
          <div className="flex gap-2">
            {j.status === "error" && (
              <Button
                variant="outline"
                size="sm"
                disabled={riprovando === j.id}
                onClick={() => void riprova(j)}
              >
                {riprovando === j.id ? "Rilettura…" : "Rileggi"}
              </Button>
            )}
            <Button
              variant={j.status === "error" ? "outline" : "default"}
              size="sm"
              onClick={() => apri(j)}
            >
              {j.status === "error" ? "Compila a mano" : "Controlla e registra"}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
