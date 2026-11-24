/**
 * Le fatture ricevute con qualcosa che non torna, in un elenco solo (23/11/2026). Ogni riga porta al
 * riepilogo della fattura, dove ci sono le azioni: «Dividi bolla per bolla» (con la registrazione delle
 * bolle mancanti), «Dividi come le bolle», «Conferma le consegne», il confronto col listino.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { riepilogoFatturaHref } from "@/lib/operazioni/operazioni";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const db = supabase as unknown as {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export interface FatturaDaSistemare {
  fattura_id: string;
  numero: string | null;
  data_fattura: string | null;
  fornitore: string | null;
  totale: number | null;
  bolle_citate: number;
  bolle_caricate: number;
  divisione_da_rifare: boolean;
}

type Filtro = "tutte" | "bolle" | "divisione";

export function FattureDaSistemare() {
  const t = useT();
  const companyId = useAuth().effectiveCompany?.id ?? null;
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const q = useQuery({
    queryKey: ["fatture-da-sistemare", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("fatture_da_sistemare", { p_company: companyId, p_limite: 500 });
      if (error) throw new Error(error.message);
      return (data ?? []) as FatturaDaSistemare[];
    },
  });
  if (q.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("Cerco le fatture da sistemare…")}</p>;
  if (q.isError) return <p role="alert" className="text-sm text-destructive">{t("Elenco non disponibile.")} <button type="button" className="underline" onClick={() => void q.refetch()}>{t("Riprova")}</button></p>;
  const tutte = q.data ?? [];
  if (tutte.length === 0) return <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("Nessuna fattura da sistemare: bolle caricate e divisioni allineate.")}</p>;
  const conBolle = tutte.filter((f) => f.bolle_caricate < f.bolle_citate);
  const daRifare = tutte.filter((f) => f.divisione_da_rifare);
  const visibili = filtro === "bolle" ? conBolle : filtro === "divisione" ? daRifare : tutte;
  const chip = (valore: Filtro, testo: string, n: number) => (
    <button key={valore} type="button" aria-pressed={filtro === valore} disabled={n === 0 && valore !== "tutte"}
      className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40 ${filtro === valore ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
      onClick={() => setFiltro(valore)}>{testo} <span className="tabular-nums">{n}</span></button>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("Fatture con bolle citate ma non caricate, o divise fra le commesse in modo diverso da come dicono le bolle. Apri la fattura per sistemarla.")}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filtra le fatture da sistemare")}>
        {chip("tutte", t("Tutte"), tutte.length)}
        {chip("bolle", t("Bolle da caricare"), conBolle.length)}
        {chip("divisione", t("Divisione da rifare"), daRifare.length)}
      </div>
      <ul className="divide-y rounded-lg border" aria-label={t("Fatture da sistemare")}>
        {visibili.map((f) => {
          const mancanti = f.bolle_citate - f.bolle_caricate;
          return (
            <li key={f.fattura_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">N. {f.numero ?? "—"} <span className="font-normal text-muted-foreground">· {f.data_fattura ? formatDateIt(f.data_fattura) : "—"} · {f.fornitore ?? t("Fornitore")}</span></p>
                <p className="flex flex-wrap gap-x-3 text-xs">
                  {mancanti > 0 && <span className="text-amber-800 dark:text-amber-300">{t(mancanti === 1 ? "{n} bolla su {tot} da caricare" : "{n} bolle su {tot} da caricare", { n: mancanti, tot: String(f.bolle_citate ?? "") })}</span>}
                  {f.divisione_da_rifare && <span className="text-amber-800 dark:text-amber-300">{t("Divisa fra le commesse diversamente dalle bolle")}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {f.totale != null && <span className="tabular-nums text-muted-foreground">{formatCurrency(Number(f.totale))}</span>}
                <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" to={riepilogoFatturaHref(f.fattura_id)}>{t("Apri")}</Link>
              </div>
            </li>
          );
        })}
      </ul>
      {tutte.length >= 500 && <p className="text-xs text-muted-foreground">{t("Mostrate le 500 più recenti.")}</p>}
    </div>
  );
}
