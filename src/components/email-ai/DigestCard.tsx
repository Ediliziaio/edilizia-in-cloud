/**
 * DigestCard — MP-EMAIL-AI-14 · "La tua giornata"
 *
 * Brief sintetico (3 cose che contano oggi) generato da Sonnet su input filtrato.
 * In 30 secondi sai cosa conta, senza scorrere 600 email.
 */
import { Sun, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDigest } from "@/lib/email-ai/hooks";

export function DigestCard() {
  const { data: digest, isLoading, isError, refetch, isFetching } = useDigest();

  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5 text-amber-600" />
          <h3 className="text-base font-semibold text-amber-900">{digest?.titolo || "La tua giornata"}</h3>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => refetch()} disabled={isFetching} aria-label="Aggiorna">
          <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-amber-800"><Loader2 className="h-4 w-4 animate-spin" /> Preparo il riepilogo…</div>
      ) : isError ? (
        <p className="text-sm text-rose-700">Impossibile generare il digest ora. Riprova.</p>
      ) : (
        <ul className="space-y-2">
          {(digest?.righe ?? []).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>{r}</span>
            </li>
          ))}
          {(digest?.righe ?? []).length === 0 && <li className="text-sm text-muted-foreground">Nessuna voce per oggi.</li>}
        </ul>
      )}
    </div>
  );
}
