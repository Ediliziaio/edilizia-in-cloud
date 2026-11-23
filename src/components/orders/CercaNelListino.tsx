/**
 * Cerca nel listino generale dell'azienda, col prezzo già deciso dalla regola per quella commessa
 * (eccezione di cantiere → listino del committente → listino generale → da definire). 14/11/2026.
 * Dal quadro del rapportino si cerca per rapportino; dal popup dell'ufficio, che il rapportino non
 * l'ha ancora, per commessa e giorno.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { etichettaPrezzo, type FontePrezzo, type VoceListino } from "@/lib/campo/prezzoVoceRapportino";

export const COLORE_FONTE: Record<FontePrezzo, string> = {
  cantiere: "text-violet-700", committente: "text-blue-800", generale: "text-slate-600", mancante: "text-amber-700",
};

// Le funzioni nuove non sono ancora nei tipi generati.
const rpc = (f: string, a: object) =>
  (supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: Error | null }> }).rpc(f, a);

type Dove = { rapportinoId: string } | { orderId: string; data: string | null };

export function CercaNelListino({ dove, onScegli, segnaposto, className }: {
  dove: Dove; onScegli: (v: VoceListino) => void; segnaposto?: string; className?: string;
}) {
  const tr = useT();
  const [testo, setTesto] = useState("");
  const [cercato, setCercato] = useState("");
  useEffect(() => { const t = setTimeout(() => setCercato(testo.trim()), 250); return () => clearTimeout(t); }, [testo]);
  const chiave = "rapportinoId" in dove ? ["r", dove.rapportinoId] : ["c", dove.orderId, dove.data];
  const { data, isFetching, error } = useQuery({
    queryKey: ["listino-cerca", ...chiave, cercato],
    enabled: cercato.length >= 2,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = "rapportinoId" in dove
        ? await rpc("rapportino_listino_cerca", { p_rapportino_id: dove.rapportinoId, p_testo: cercato, p_limite: 20 })
        : await rpc("commessa_listino_cerca", { p_order_id: dove.orderId, p_data: dove.data || null, p_testo: cercato, p_limite: 20 });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as VoceListino[];
    },
  });
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <Input aria-label={tr("Cerca nel listino")} placeholder={segnaposto ?? tr("Cerca nel listino: codice, descrizione, categoria")} className="h-8 pl-7 text-[13px]"
          value={testo} onChange={(e) => setTesto(e.target.value)} />
      </div>
      {cercato.length >= 2 && (
        <ul aria-label={tr("Voci del listino")} className="max-h-48 divide-y overflow-y-auto rounded-md border bg-background">
          {error && <li className="px-2 py-1.5 text-xs text-destructive">{error instanceof Error ? error.message : tr("Ricerca non riuscita")}</li>}
          {!error && !isFetching && (data ?? []).length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">{tr("Nessuna voce del listino con «{testo}»", { testo: cercato })}</li>}
          {(data ?? []).map((v) => (
            <li key={v.tariffa_id}>
              <button type="button" onClick={() => { onScegli(v); setTesto(""); setCercato(""); }}
                className="tap-compact grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-2 py-1.5 text-left hover:bg-muted/50">
                <span className="min-w-0 truncate text-[13px] font-medium">{v.codice ? <span className="mr-1 font-mono text-xs text-muted-foreground">{v.codice}</span> : null}{v.descrizione}</span>
                <span className="text-right text-[13px] tabular-nums">{"prezzo" in v ? (v.prezzo == null ? "—" : `${formatCurrency(Number(v.prezzo))}/${v.unita}`) : v.unita}</span>
                <span className="truncate text-[11px] text-muted-foreground">{v.categoria ?? ""}</span>
                <span className={`text-right text-[11px] ${COLORE_FONTE[v.fonte]}`}>{etichettaPrezzo(v.fonte).replace("Prezzo applicato: ", "")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Avviso quando il committente prezza la voce in un'altra unità del listino generale. */
export function avvisoUnita(v: VoceListino | null | undefined): string | null {
  if (!v?.unita_diverse) return null;
  return `Il committente la prezza a ${v.unita}, il listino generale a ${v.unita_generale}: scrivi la quantità in ${v.unita}.`;
}
