import { useState } from "react";
import { FileText, Download, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TabPacchettoBancaProps {
  anno: number;
}

const CONTENUTI = [
  "Conto Economico riclassificato (12 mesi)",
  "Stato Patrimoniale riclassificato",
  "Indicatori di rating bancario",
  "Break Even Point e proiezioni",
  "Piano industriale (scenario predefinito)",
  "Note metodologiche e firma azienda",
];

export function TabPacchettoBanca({ anno }: TabPacchettoBancaProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenera = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke<Blob>(
        "cg-export-ce-pdf",
        { body: { anno } },
      );
      if (error) throw error;
      if (!data) throw new Error("Risposta vuota dal server");

      const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // libera dopo qualche secondo per dare tempo al browser di aprirlo
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("Pacchetto generato — apertura in nuova scheda");
    } catch (e) {
      toast.error((e as Error).message ?? "Errore nella generazione del pacchetto");
    } finally {
      setGenerating(false);
    }
  };

  return (
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
            Il pacchetto è pensato per essere consegnato alla banca: include un riepilogo
            sintetico delle posizioni patrimoniali, dei flussi reddituali e delle proiezioni
            del piano industriale per l'anno {anno}.
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
                Genera PDF
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            (anteprima provvisoria — pacchetto completo in arrivo)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
