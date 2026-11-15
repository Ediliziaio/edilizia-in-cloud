/**
 * Impostazioni → Automazioni: quanto lavorano da sole (§5, «misura in pagina»).
 *
 * Due numeri per ogni lavoro degli acquisti, negli ultimi 30 giorni:
 *   - quanti lavori si chiudono senza AI (da `metriche_ai_azienda`, la stessa misura della pagina
 *     «Consumo AI del team»: qui solo i flussi degli acquisti);
 *   - quanto le regole ci azzeccano: collegamenti fatti da soli, confermati, in attesa e
 *     corretti da una persona (`acquisti_misura_collegamenti`).
 * Se una lettura fallisce (permesso, rete) il riquadro lo dice e non inventa numeri.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { etichettaRegola } from "@/lib/acquisti/verificaCollegamenti";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Flusso { flusso: string; totali: number; senza_ai: number; pct_senza_ai: number | null; chiamate_ai: number }
interface Regola { regola: string; totali: number; da_soli: number; confermati: number; in_attesa: number; corretti: number; pct_corretti: number | null; con_ai: number }

/** I flussi degli acquisti nel registro dei lavori della sessione A, col nome da cantiere. */
export const FLUSSI_ACQUISTI: Record<string, string> = {
  fattura_classifica: "Commessa e categoria delle fatture ricevute",
  fattura_riconcilia_righe: "Righe della fattura con bolle e ordini",
};

export function useMisuraAutomazioni(companyId: string) {
  return useQuery({
    queryKey: ["misura-automazioni", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [ai, coll] = await Promise.all([
        db.rpc("metriche_ai_azienda", { p_company_id: companyId, p_giorni: 30 }),
        db.rpc("acquisti_misura_collegamenti", { p_company: companyId, p_giorni: 30 }),
      ]);
      return {
        flussi: ai.error ? null : ((ai.data?.flussi ?? []) as Flusso[]).filter((f) => f.flusso in FLUSSI_ACQUISTI),
        regole: coll.error ? null : ((coll.data?.regole ?? []) as Regola[]),
      };
    },
  });
}

const cella = "px-3 py-2 text-right tabular-nums";

export function MisuraAutomazioni({ companyId }: { companyId: string }) {
  const { data, isLoading } = useMisuraAutomazioni(companyId);
  return (
    <section className="space-y-3" aria-labelledby="misura-automazioni">
      <div>
        <h3 id="misura-automazioni" className="font-medium">Quanto lavorano da sole · ultimi 30 giorni</h3>
        <p className="text-sm text-muted-foreground">
          Quanti lavori si chiudono senza AI, e quanti collegamenti fatti dalle regole una persona ha dovuto correggere.
        </p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carico…</p>}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border">
            <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">Lavori chiusi senza AI</p>
            {data.flussi === null ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Non disponibile per il tuo ruolo.</p>
            ) : data.flussi.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Nessun lavoro registrato negli ultimi 30 giorni.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left font-normal">Lavoro</th><th className={cella}>Lavori</th><th className={cella}>Senza AI</th><th className={cella}>Chiamate AI</th></tr>
                </thead>
                <tbody>
                  {data.flussi.map((f) => (
                    <tr key={f.flusso} className="border-t">
                      <td className="px-3 py-2">{FLUSSI_ACQUISTI[f.flusso]}</td>
                      <td className={cella}>{f.totali}</td>
                      <td className={cella}>{f.pct_senza_ai ?? 0}%</td>
                      <td className={cella}>{f.chiamate_ai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="rounded-lg border">
            <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">Collegamenti fatti dalle regole</p>
            {data.regole === null ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Non disponibile per il tuo ruolo.</p>
            ) : data.regole.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Nessun collegamento negli ultimi 30 giorni.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">Regola</th>
                    <th className={cella}>Da soli</th>
                    <th className={cella}>Confermati</th>
                    <th className={cella}>In attesa</th>
                    <th className={cella}>Corretti</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regole.map((r) => (
                    <tr key={r.regola} className="border-t">
                      <td className="px-3 py-2">{etichettaRegola(r.regola)}</td>
                      <td className={cella}>{r.da_soli}</td>
                      <td className={cella}>{r.confermati}</td>
                      <td className={cella}>{r.in_attesa}</td>
                      <td className={`${cella} ${r.corretti > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                        {r.corretti}{r.totali ? ` (${r.pct_corretti ?? 0}%)` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
