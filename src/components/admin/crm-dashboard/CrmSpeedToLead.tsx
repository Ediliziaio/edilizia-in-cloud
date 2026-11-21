import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { outreachRpc } from "@/components/admin/outreach/outreachRpc";

interface Gruppo {
  sorgente: string; campagna: string | null; sequenza: string | null;
  lead: number; contattati: number; risposte: number; demo: number; vinti: number;
}
interface Risultati {
  totale: number; contattati: number; mediana_secondi: number | null;
  entro_5: number; entro_ora: number; entro_giorno: number; oltre: number;
  manuali: number; automatici: number; non_tracciati: number;
  risposte: number; demo: number; vinti: number; gruppi: Gruppo[];
}

const numero = (n: number) => n.toLocaleString("it-IT");
const decimale = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const RIGHE = 8;

function durata(secondi: number) {
  if (secondi < 60) return `${Math.round(secondi)} s`;
  if (secondi < 3600) return `${Math.round(secondi / 60)} min`;
  if (secondi < 86400) return `${decimale.format(secondi / 3600)} h`;
  return `${decimale.format(secondi / 86400)} g`;
}

export function CrmSpeedToLead({ companyId, days }: { companyId: string; days: number }) {
  const [pagina, setPagina] = useState(0);
  const q = useQuery({
    queryKey: ["crm-dash", "speed-to-lead", companyId, days],
    staleTime: 60_000,
    queryFn: () => outreachRpc<Risultati>("outreach_risultati_coorte", { p_company: companyId, p_days: days }),
  });
  const m = q.data;
  const buckets = m ? [
    { label: "0–5 min", n: m.entro_5, color: "bg-emerald-600" },
    { label: "5–60 min", n: m.entro_ora, color: "bg-emerald-400" },
    { label: "1–24 h", n: m.entro_giorno, color: "bg-amber-500" },
    { label: "Oltre 24 h", n: m.oltre, color: "bg-orange-500" },
    { label: "Da contattare", n: m.totale - m.contattati, color: "bg-muted-foreground/50" },
  ] : [];
  const entro24 = m?.totale ? Math.round(100 * (m.entro_5 + m.entro_ora + m.entro_giorno) / m.totale) : 0;
  const paginaVisibile = Math.min(pagina, Math.max(0, Math.ceil((m?.gruppi.length ?? 0) / RIGHE) - 1));

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Timer className="h-4 w-4" aria-hidden="true" /> Tempo al primo contatto riuscito
          <span className="ml-auto text-xs font-normal text-muted-foreground">Lead degli ultimi {days} giorni</span>
        </div>
        {q.isPending ? <p role="status" className="text-sm text-muted-foreground">Caricamento dei risultati…</p>
          : q.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              Risultati momentaneamente indisponibili.
              <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Riprova</Button>
            </div>
          ) : !m?.totale ? <p className="text-sm text-muted-foreground">Nessun nuovo lead nel periodo.</p>
            : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-5">
                      <div><p className="text-xs text-muted-foreground">Tempo mediano</p>
                        <p className="text-2xl font-bold">{m.mediana_secondi == null ? "—" : durata(m.mediana_secondi)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Contattati entro 24 h</p>
                        <p className="text-2xl font-bold">{entro24}%</p></div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {numero(m.manuali)} manuali · {numero(m.automatici)} automatici
                      {m.non_tracciati > 0 && ` · ${numero(m.non_tracciati)} di origine operativa non registrata`}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {buckets.map((b) => (
                      <div key={b.label} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-muted-foreground">{b.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded bg-muted" aria-hidden="true">
                          <div className={`h-full rounded ${b.color}`} style={{ width: `${100 * b.n / m.totale}%` }} />
                        </div>
                        <span className="w-9 text-right tabular-nums">{numero(b.n)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <details className="rounded-md border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Per sorgente e campagna · {numero(m.risposte)} risposte · {numero(m.demo)} demo · {numero(m.vinti)} vinti
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Lead distinti, con risposte email, demo e vittorie registrate dopo il primo contatto riuscito.
                    La sequenza indica il primo invio tracciato.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>{["Sorgente / campagna", "Sequenza", "Lead", "Contattati", "Risposte", "Demo", "Vinti"].map((nome) => (
                          <th key={nome} scope="col" className="px-2 py-1.5 font-medium">{nome}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y">
                        {m.gruppi.slice(paginaVisibile * RIGHE, (paginaVisibile + 1) * RIGHE).map((g) => (
                          <tr key={JSON.stringify([g.sorgente, g.campagna, g.sequenza])}>
                            <th scope="row" className="min-w-32 px-2 py-1.5 text-left font-medium">{g.sorgente}
                              {g.campagna && <span className="block text-xs font-normal text-muted-foreground">{g.campagna}</span>}
                            </th>
                            <td className="px-2 py-1.5">{g.sequenza ?? "—"}</td>
                            {[g.lead, g.contattati, g.risposte, g.demo, g.vinti].map((n, i) => (
                              <td key={i} className="px-2 py-1.5 tabular-nums">{numero(n)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {m.gruppi.length > RIGHE && <div className="flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="outline" disabled={!paginaVisibile} onClick={() => setPagina(paginaVisibile - 1)}>Indietro</Button>
                    <Button size="sm" variant="outline" disabled={(paginaVisibile + 1) * RIGHE >= m.gruppi.length} onClick={() => setPagina(paginaVisibile + 1)}>Avanti</Button>
                  </div>}
                </details>
              </>
            )}
      </CardContent>
    </Card>
  );
}
