import { useState } from "react";
import { FileText, Download, Loader2, CheckCircle2, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCGExports, getCGExportSignedUrl } from "@/hooks/controlloGestione/useCGExports";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";

interface TabPacchettoBancaProps {
  anno: number;
}

const CONTENUTI = [
  "Copertina con denominazione e P.IVA",
  "Conto Economico riclassificato anno corrente",
  "Confronto CE 4 anni (storico se disponibile)",
  "Stato Patrimoniale riclassificato + quadratura",
  "Rating bancario con indicatori e punteggi",
  "Piano Industriale 5 anni con proiezioni",
];

const fmtBytes = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const fmtData = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function TabPacchettoBanca({ anno }: TabPacchettoBancaProps) {
  const [generating, setGenerating] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const exports = useCGExports();
  const qc = useQueryClient();

  const handleGenera = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        signed_url?: string;
        path?: string;
        size?: number;
      }>("cg-export-pacchetto-banca", { body: { anno } });
      if (error) throw error;
      if (!data?.signed_url) throw new Error("Nessun URL restituito dal server");

      window.open(data.signed_url, "_blank", "noopener,noreferrer");
      toast.success("Pacchetto Banca generato — apertura in nuova scheda");
      qc.invalidateQueries({ queryKey: ["cg", "exports"] });
    } catch (e) {
      toast.error((e as Error).message ?? "Errore nella generazione del pacchetto");
    } finally {
      setGenerating(false);
    }
  };

  const handleApri = async (id: string, filePath: string) => {
    setOpeningId(id);
    try {
      const url = await getCGExportSignedUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message ?? "Impossibile aprire l'export");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contenuti del pacchetto</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {CONTENUTI.map((c) => (
                <li key={c} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Il pacchetto è pensato per essere consegnato in filiale: riepilogo sintetico
              delle posizioni patrimoniali, flussi reddituali e proiezioni del piano industriale
              per l'esercizio {anno}. Generazione tipica: 3-6 secondi.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Genera PDF</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Pacchetto banca {anno}
            </p>
            <Button
              className="w-full gap-2"
              disabled={generating}
              onClick={handleGenera}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generazione…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Genera Pacchetto Banca
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Lista esportazioni storiche */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Esportazioni recenti</CardTitle>
        </CardHeader>
        <CardContent>
          {exports.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : exports.data && exports.data.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {exports.data.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {row.tipo === "pacchetto_banca" ? "Pacchetto Banca" : row.tipo} · {row.anno}
                    </p>
                    <p className="text-xs text-slate-500">
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
              Nessun pacchetto generato finora. Clicca <strong>Genera Pacchetto Banca</strong> per crearne uno.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Acknowledge formatCurrency è disponibile per future estensioni della lista esportazioni
void formatCurrency;
