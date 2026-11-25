/**
 * Caricare un file per l'assistente AI (25/11/2026).
 *
 * Il file allegato in Claude o ChatGPT resta nella chat: gli strumenti del server
 * MCP ricevono solo testo. Lo strumento `link_caricamento` crea un caricamento
 * firmato (un solo percorso, 2 ore) e manda l'utente qui: trascina il file, che
 * finisce nell'archivio dell'azienda, poi torna nella chat.
 *
 * Non serve l'accesso: il permesso è il token firmato nell'indirizzo, valido per
 * quel percorso soltanto. Accetta solo i contenitori previsti.
 */
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CONTENITORI = ["planimetrie", "computi"] as const;
const MASSIMO_MB = 50;

export default function CaricaFile() {
  const [params] = useSearchParams();
  const bucket = params.get("b") ?? "";
  const percorso = params.get("p") ?? "";
  const token = params.get("t") ?? "";
  const nomeAtteso = params.get("n") ?? "";
  const valido = (CONTENITORI as readonly string[]).includes(bucket) && !!percorso && !!token;

  const [stato, setStato] = useState<"attesa" | "invio" | "fatto" | "errore">("attesa");
  const [errore, setErrore] = useState<string | null>(null);
  const [sopra, setSopra] = useState(false);

  const carica = useCallback(async (file: File | undefined) => {
    if (!file || !valido) return;
    if (file.size > MASSIMO_MB * 1024 * 1024) {
      setErrore(`Il file supera ${MASSIMO_MB} MB.`);
      setStato("errore");
      return;
    }
    setStato("invio");
    setErrore(null);
    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(percorso, token, file, {
      contentType: file.type || undefined,
    });
    if (error) {
      setErrore(/expired|exp|invalid|signature/i.test(error.message)
        ? "Il link è scaduto o già usato: chiedi all'assistente un link nuovo."
        : `Caricamento non riuscito: ${error.message}`);
      setStato("errore");
      return;
    }
    setStato("fatto");
  }, [bucket, percorso, token, valido]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div className="flex items-center gap-2">
        <FileUp className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Carica il file per l'assistente</h1>
      </div>

      {!valido ? (
        <p className="text-sm text-muted-foreground">Link non valido. Chiedi all'assistente un link nuovo.</p>
      ) : stato === "fatto" ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:bg-emerald-950/20">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Caricato
          </p>
          <p className="text-xs text-muted-foreground">Torna nella chat e scrivi all'assistente che il file è caricato.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {nomeAtteso ? <>L'assistente aspetta <strong>{nomeAtteso}</strong>. </> : null}
            Il file va nell'archivio della tua azienda in Edilizia in Cloud.
          </p>
          <label
            onDragOver={(e) => { e.preventDefault(); setSopra(true); }}
            onDragLeave={() => setSopra(false)}
            onDrop={(e) => { e.preventDefault(); setSopra(false); void carica(e.dataTransfer.files?.[0]); }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              sopra ? "border-primary bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            {stato === "invio" ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <FileUp className="h-6 w-6 text-muted-foreground" />}
            <span className="text-sm font-medium">{stato === "invio" ? "Caricamento…" : "Trascina qui il file o tocca per sceglierlo"}</span>
            <span className="text-xs text-muted-foreground">Fino a {MASSIMO_MB} MB</span>
            <input
              type="file"
              className="sr-only"
              disabled={stato === "invio"}
              onChange={(e) => void carica(e.target.files?.[0])}
            />
          </label>
          {stato === "errore" && errore && (
            <p className="flex items-start gap-2 text-xs text-destructive"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {errore}</p>
          )}
          {stato === "errore" && (
            <Button variant="outline" size="sm" onClick={() => setStato("attesa")}>Riprova</Button>
          )}
        </>
      )}
    </div>
  );
}
