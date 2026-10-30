// src/components/orders/generali/rendiconto/StoricoDossier.tsx
// Lo storico dei dossier mandati: quando, a chi, con quali sezioni, com'è andata, e il file
// partito da riaprire. È l'unica parte del rendiconto che si usa anche da telefono.
// Ognuno vede solo i dossier che il suo permesso gli lascia riaprire (RLS su `livello`).
import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { linkFileDossier, useStoricoDossier, type DossierInviato } from "@/hooks/useGeneraleRendiconto";
import { MODELLI_DOSSIER, NOMI_SEZIONE, giornoIt } from "@/lib/orders/generali/rendiconto";

const STATO: Record<DossierInviato["stato"], { testo: string; variante: "secondary" | "destructive" | "outline" }> = {
  inviato: { testo: "Inviato", variante: "secondary" },
  parziale: { testo: "Inviato in parte", variante: "outline" },
  fallito: { testo: "Non partito", variante: "destructive" },
  in_invio: { testo: "In invio", variante: "outline" },
};

export function StoricoDossier({ generaleId }: { generaleId: string }) {
  const storico = useStoricoDossier(generaleId);
  const [apro, setApro] = useState<string | null>(null);
  const elenco = Array.isArray(storico.data) ? storico.data : [];

  const apri = async (chiave: string, path: string) => {
    // La finestra si apre subito, al clic: dopo l'attesa del link il browser la bloccherebbe.
    const finestra = window.open("", "_blank");
    setApro(chiave);
    try {
      const url = await linkFileDossier(path);
      if (finestra) finestra.location.href = url;
      else window.location.assign(url);
    } catch {
      finestra?.close();
      toast.error("Non riesco ad aprire il file. Riprova tra poco.");
    } finally {
      setApro(null);
    }
  };

  if (storico.isLoading) return <Skeleton className="h-24 w-full" />;
  if (storico.isError) {
    return (
      <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
        <p>Non riesco a leggere lo storico dei rendiconti.</p>
        <Button size="sm" variant="outline" onClick={() => void storico.refetch()}>Riprova</Button>
      </div>
    );
  }
  if (elenco.length === 0) {
    return <p className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">Nessun rendiconto inviato finora.</p>;
  }
  return (
    <ul className="divide-y rounded-md border" aria-label="Rendiconti inviati">
      {elenco.map((d) => (
        <li key={d.id} className="space-y-1.5 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {d.modello === "personalizzato" ? "Su misura" : MODELLI_DOSSIER[d.modello].nome} · {giornoIt((d.inviatoIl ?? d.creatoIl).slice(0, 10))}
              </p>
              <p className="break-words text-muted-foreground">A {d.destinatari.join(", ")}</p>
            </div>
            <Badge variant={STATO[d.stato].variante} className="shrink-0 font-normal">{STATO[d.stato].testo}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{d.oggetto} · {d.sezioni.map((s) => NOMI_SEZIONE[s]?.nome ?? s).join(", ")}</p>
          {d.stato !== "inviato" && d.errore && <p className="text-xs text-destructive">{d.errore}</p>}
          <div className="flex flex-wrap gap-2">
            {d.pdfPath && (
              <Button size="sm" variant="outline" disabled={apro === `${d.id}-pdf`} onClick={() => void apri(`${d.id}-pdf`, d.pdfPath!)}>
                {apro === `${d.id}-pdf` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />} Apri il PDF
              </Button>
            )}
            {d.xlsxPath && (
              <Button size="sm" variant="ghost" disabled={apro === `${d.id}-xlsx`} onClick={() => void apri(`${d.id}-xlsx`, d.xlsxPath!)}>
                {apro === `${d.id}-xlsx` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />} Excel
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
