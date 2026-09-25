/**
 * EsposizioneFlotta — "quali cantieri sto finanziando io?", a livello di lista.
 *
 * Legge v_ordine_esposizione (stesse regole al centesimo della card "Chi
 * finanzia il cantiere" dentro la commessa) e mostra, dentro la testata navy
 * del Riepilogo commesse, il totale che l'azienda sta anticipando e le tre
 * commesse peggiori come chip cliccabili. Le commesse completate restano
 * fuori (una chiusa in perdita non è più un anticipo: è margine andato, e lo
 * racconta il Controllo di Gestione). Se nessun cantiere è a carico
 * dell'azienda non compare niente: il blocco esiste solo quando c'è il
 * problema.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyCompact } from "@/lib/formatters";

interface RigaEsposizione {
  id: string;
  order_code: string | null;
  description: string | null;
  saldo: number;
  current_status_id: string | null;
}

export function EsposizioneFlotta({
  companyId,
  excludeStatusIds = [],
}: {
  companyId: string | undefined;
  /** Stati da escludere (tipicamente la posizione "completato"). */
  excludeStatusIds?: (string | null | undefined)[];
}) {
  const { data: righe = [] } = useQuery({
    queryKey: ["esposizione-flotta", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RigaEsposizione[]> => {
      // Vista fuori dai tipi generati (migration recente)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_ordine_esposizione")
        .select("id, order_code, description, saldo, current_status_id")
        .eq("company_id", companyId!)
        .lt("saldo", -0.5)
        .order("saldo", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as RigaEsposizione[];
    },
  });

  const exclude = new Set(excludeStatusIds.filter(Boolean) as string[]);
  const aperte = righe.filter((r) => !r.current_status_id || !exclude.has(r.current_status_id));
  if (aperte.length === 0) return null;

  const totale = aperte.reduce((s, r) => s + Math.abs(Number(r.saldo) || 0), 0);
  const peggiori = aperte.slice(0, 3);

  return (
    <div className="mt-2 sm:mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-2.5 sm:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-red-200">
          Cantieri che stai finanziando tu
        </span>
        <span className="text-lg font-bold text-white">−{formatCurrencyCompact(totale)}</span>
      </div>
      {/* Mobile: titolo, cifra e cantieri bastano; la spiegazione no. */}
      <p className="mt-0.5 text-xs text-blue-50/70 max-sm:hidden">
        {aperte.length === 1 ? "1 commessa aperta ha" : `${aperte.length} commesse aperte hanno`} pagato più di
        quanto incassato — soldi tuoi nel cantiere.
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {peggiori.map((r) => (
          <Link
            key={r.id}
            to={`/azienda/ordini/${r.id}`}
            title={r.description ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
          >
            <span className="font-medium">{r.order_code ?? "—"}</span>
            <span className="font-semibold text-red-200">−{formatCurrencyCompact(Math.abs(Number(r.saldo) || 0))}</span>
          </Link>
        ))}
        {aperte.length > peggiori.length && (
          <span className="text-[11px] text-blue-50/70">+{aperte.length - peggiori.length} altre</span>
        )}
      </div>
    </div>
  );
}
