import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Download, Loader2, CheckCircle2, FileDown, AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCGExports, getCGExportSignedUrl } from "@/hooks/controlloGestione/useCGExports";
import { useRating } from "@/hooks/controlloGestione/useStatoPatrimoniale";
import { Skeleton } from "@/components/ui/skeleton";

interface TabPacchettoBancaProps {
  anno: number;
}

const CONTENUTI = [
  "Copertina con ragione sociale e partita IVA",
  "Conto economico riclassificato dell'anno",
  "Confronto con i 3 anni precedenti (se ci sono i dati)",
  "Stato patrimoniale riclassificato con la verifica di quadratura",
  "Indici per la banca: giorni di incasso e pagamento, Z-score, copertura delle rate",
  "Rating bancario con indicatori e punteggi",
  "Piano industriale dello scenario base",
];

const fmtBytes = (b: number | null) => {
  if (!b) return "—";
  const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: b < 1024 * 1024 ? 0 : 1 });
  return b < 1024 * 1024 ? `${nf.format(b / 1024)} KB` : `${nf.format(b / (1024 * 1024))} MB`;
};

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Il messaggio vero della funzione, non «Edge Function returned a non-2xx status code». */
async function messaggioErrore(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo non JSON */
    }
  }
  return "Non sono riuscito a generare il pacchetto. Riprova tra qualche secondo.";
}

export function TabPacchettoBanca({ anno }: TabPacchettoBancaProps) {
  const [generating, setGenerating] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<{ url: string; provvisorio: boolean } | null>(null);
  const exports = useCGExports();
  const rating = useRating(anno);
  const qc = useQueryClient();

  const annoFuturo = anno > new Date().getFullYear();
  const provvisorio = rating.data ? rating.data.attendibile !== true : false;

  const handleGenera = async () => {
    setGenerating(true);
    setUltimo(null);
    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        signed_url?: string | null;
        provvisorio?: boolean;
      }>("cg-export-pacchetto-banca", { body: { anno } });
      if (error) throw new Error(await messaggioErrore(error));
      if (!data?.signed_url) throw new Error("Il PDF è stato creato ma non riesco ad aprirlo: lo trovi nell'elenco qui sotto.");

      setUltimo({ url: data.signed_url, provvisorio: !!data.provvisorio });
      // Su alcuni browser l'apertura dopo l'attesa viene bloccata: resta il pulsante «Apri».
      window.open(data.signed_url, "_blank", "noopener,noreferrer");
      if (data.provvisorio) {
        toast.warning("Pacchetto generato come BOZZA: i dati non sono ancora riconciliati, non consegnarlo alla banca.");
      } else {
        toast.success("Pacchetto banca generato");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore nella generazione del pacchetto");
    } finally {
      setGenerating(false);
      qc.invalidateQueries({ queryKey: ["cg", "exports"] });
    }
  };

  const handleApri = async (id: string, filePath: string) => {
    setOpeningId(id);
    try {
      const url = await getCGExportSignedUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Non riesco ad aprire il file. Riprova tra qualche secondo.");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Pacchetto banca {anno}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Un PDF da portare in filiale quando chiedi un fido o un mutuo: conti, patrimonio, indici e piano in un unico
            documento. Si genera in pochi secondi e resta nell'elenco qui sotto.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ul className="space-y-2.5 lg:col-span-2">
            {CONTENUTI.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3">
            {provvisorio && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Uscirà come BOZZA
                </p>
                <p className="mt-1">
                  Lo Stato patrimoniale non quadra o il rating non è validato: il PDF lo scrive in copertina e non va
                  consegnato alla banca.
                </p>
                <Link to="/azienda/controllo-gestione/health" className="mt-1 inline-block font-medium underline">
                  Sistema i dati
                </Link>
              </div>
            )}
            <Button className="w-full gap-2" disabled={generating || annoFuturo} onClick={handleGenera}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generazione in corso…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Genera il pacchetto banca
                </>
              )}
            </Button>
            {annoFuturo && <p className="text-xs text-muted-foreground">Il {anno} non è ancora iniziato.</p>}
            {ultimo && (
              <Button asChild variant="outline" className="w-full gap-2">
                <a href={ultimo.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Apri il pacchetto{ultimo.provvisorio ? " (bozza)" : ""}
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pacchetti generati</CardTitle>
        </CardHeader>
        <CardContent>
          {exports.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : exports.isError ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Non riesco a caricare l'elenco.{" "}
              <button type="button" className="underline" onClick={() => exports.refetch()}>Riprova</button>
            </p>
          ) : exports.data && exports.data.length > 0 ? (
            <ul className="divide-y">
              {exports.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {row.tipo === "pacchetto_banca" ? "Pacchetto banca" : "Esportazione"} {row.anno}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtData(row.created_at)} · {fmtBytes(row.pdf_size_bytes)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={openingId === row.id}
                    onClick={() => handleApri(row.id, row.file_path)}
                  >
                    {openingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                    Apri
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nessun pacchetto generato finora.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
