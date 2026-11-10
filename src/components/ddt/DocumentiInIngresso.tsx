import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentiDDT, STATO_DOCUMENTO } from "@/hooks/useDocumentiDDT";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import {
  documentiDb,
  avviaLetturaPersistente,
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

function RevisioneDocumento({
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

export function DocumentiInIngresso() {
  const { effectiveCompany } = useAuth();
  const ripresaLocale = useOfflineSync({
    companyId: effectiveCompany?.id ?? null,
  });
  const [mostraTutti, setMostraTutti] = useState(false);
  const query = useDocumentiDDT(false, undefined, mostraTutti);
  const qc = useQueryClient();
  const [aperto, setAperto] = useState<DocumentoPersistente | null>(null);
  const [riprovando, setRiprovando] = useState<string | null>(null);
  const documenti = query.data ?? [];
  const inAttesa = documenti.filter(
    (j) => !["registered", "split"].includes(j.status),
  );
  const daMostrare = mostraTutti ? documenti : inAttesa;
  const riprova = async (j: DocumentoPersistente) => {
    setRiprovando(j.id);
    try {
      const { error } = await documentiDb.rpc("ddt_documento_ritenta", {
        p_id: j.id,
      });
      if (error) throw error;
      void avviaLetturaPersistente(j.id).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["ddt-documenti"] });
      toast.success("Lettura rimessa in coda");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Non riesco a riprovare");
    } finally {
      setRiprovando(null);
    }
  };
  return (
    <section
      className="overflow-hidden rounded-2xl border bg-card shadow-sm"
      aria-label="Documenti in ingresso"
    >
      {ripresaLocale.queueCount > 0 && (
        <p className="border-b bg-amber-50 p-3 text-xs text-amber-900">
          {ripresaLocale.queueCount} invii conservati su questo dispositivo.
          Lascia aperta questa pagina per completarli.{" "}
          {ripresaLocale.failedCount > 0 && (
            <button
              type="button"
              className="underline"
              onClick={() => void ripresaLocale.retry()}
            >
              Riprova
            </button>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 p-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Smartphone className="h-4 w-4 text-orange-600" />
            Documenti in ingresso{" "}
            <span className="rounded-full bg-orange-100 px-2 text-xs text-orange-900">
              {daMostrare.length}
              {query.hasNextPage ? "+" : ""}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Da app, caricamento e WhatsApp. Controlla il documento, poi conferma
            separatamente i materiali consegnati.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMostraTutti((v) => !v)}
          >
            {mostraTutti ? "Solo da gestire" : "Anche registrati"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Aggiorna documenti in ingresso"
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
          </Button>
        </div>
      </div>
      {query.isError && !documenti.length ? (
        <p role="alert" className="p-4 text-sm text-destructive">
          Elenco non disponibile. Riprova ad aggiornare.
        </p>
      ) : query.isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Caricamento…</p>
      ) : !daMostrare.length ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nessun documento in attesa. Le letture continuano anche quando chiudi
          la pagina.
        </p>
      ) : (
        <ul className="max-h-96 divide-y overflow-y-auto">
          {daMostrare.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-3 p-4">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  title={j.files.map((f) => f.name).join(", ")}
                >
                  {j.files[0]?.name}
                  {j.files.length > 1 ? ` · ${j.files.length} allegati` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {j.source === "campo"
                    ? "App cantiere"
                    : j.source === "whatsapp"
                      ? "WhatsApp"
                      : "Caricamento ufficio"}{" "}
                  · {STATO_DOCUMENTO[j.status]} ·{" "}
                  {new Date(j.created_at).toLocaleString("it-IT")}
                </p>
                {j.last_error && (
                  <p className="mt-1 text-xs text-amber-800">{j.last_error}</p>
                )}
              </div>
              {["queued", "processing"].includes(j.status) ? (
                <Loader2
                  aria-label="Lettura in corso"
                  className="h-4 w-4 animate-spin text-muted-foreground"
                />
              ) : j.status === "split" ? (
                <span className="text-xs text-muted-foreground">
                  {j.split_ids?.length ?? 0} bolle separate
                </span>
              ) : j.status === "registered" && j.ddt_id ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/azienda/ddt/${j.ddt_id}`}>Apri DDT</Link>
                </Button>
              ) : (
                <div className="flex gap-2">
                  {j.status === "error" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={riprovando === j.id}
                      onClick={() => void riprova(j)}
                    >
                      Rileggi
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setAperto(j)}>
                    {j.status === "error"
                      ? "Compila a mano"
                      : "Controlla e registra"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {query.isError && !!documenti.length && (
        <p role="alert" className="px-4 py-2 text-sm text-amber-800">
          Aggiornamento non riuscito. I documenti già caricati restano
          disponibili.
        </p>
      )}
      {query.hasNextPage && (
        <div className="border-t p-3">
          <Button
            variant="outline"
            className="w-full"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage
              ? "Caricamento…"
              : query.isFetchNextPageError
                ? "Riprova a caricare altri documenti"
                : "Carica altri documenti"}
          </Button>
        </div>
      )}
      {aperto && (
        <RevisioneDocumento
          documento={aperto}
          onClose={() => {
            setAperto(null);
            void query.refetch();
          }}
        />
      )}
    </section>
  );
}
