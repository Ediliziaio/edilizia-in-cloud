/**
 * Chi ha ritirato cosa, per quale cantiere (24/11/2026, richiesta del founder).
 *
 * I prelievi fatti dagli operai dall'app (`prelievi_campo`), di ogni stato: un elenco con chi, quando, per quale
 * cantiere e cosa, e i totali per materiale. Filtri per cantiere, persona e periodo. Si apre a richiesta: la
 * pagina del magazzino resta com'era finché non serve.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { totaliRitiri, type RitiroCampo } from "@/lib/magazzino/ritiriCantiere";

const STATI: Record<string, { label: string; className: string }> = {
  consegnato: { label: "Consegnato", className: "bg-emerald-100 text-emerald-800" },
  richiesto: { label: "Da approvare", className: "bg-amber-100 text-amber-900" },
  rifiutato: { label: "Rifiutato", className: "bg-red-100 text-red-800" },
};
const PERIODI = [{ giorni: 7, label: "7 giorni" }, { giorni: 30, label: "30 giorni" }, { giorni: 90, label: "90 giorni" }] as const;

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export function RitiriDalCantiere() {
  const { effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;
  const [aperto, setAperto] = useState(false);
  const [giorni, setGiorni] = useState<number>(30);
  const [cantiere, setCantiere] = useState("");
  const [persona, setPersona] = useState("");
  const [vista, setVista] = useState<"elenco" | "totali">("elenco");

  const dati = useQuery({
    queryKey: ["ritiri-dal-cantiere", companyId, giorni],
    enabled: aperto && !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const dal = subDays(new Date(), giorni).toISOString();
      const { data, error } = await supabase.from("prelievi_campo")
        .select("id, data, righe, note, order_id, operaio_id, stato, documento_numero, motivo_rifiuto")
        .eq("company_id", companyId!).gte("data", dal).order("data", { ascending: false }).limit(500);
      if (error) throw error;
      const ritiri = (data ?? []) as unknown as RitiroCampo[];
      const persone = [...new Set(ritiri.map(r => r.operaio_id).filter((x): x is string => !!x))];
      const ordini = [...new Set(ritiri.map(r => r.order_id).filter((x): x is string => !!x))];
      const [p, o] = await Promise.all([
        persone.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", persone) : Promise.resolve({ data: [] }),
        ordini.length ? supabase.from("orders").select("id, order_code, description").in("id", ordini) : Promise.resolve({ data: [] }),
      ]);
      const nomi = new Map((p.data ?? []).map((x: { id: string; first_name: string | null; last_name: string | null }) =>
        [x.id, [x.first_name, x.last_name].filter(Boolean).join(" ") || "Operaio"]));
      const cantieri = new Map((o.data ?? []).map((x: { id: string; order_code: string | null; description: string | null }) =>
        [x.id, [x.order_code, x.description?.slice(0, 40)].filter(Boolean).join(" · ") || "Commessa"]));
      return { ritiri, nomi, cantieri };
    },
  });

  const ritiri = useMemo(() => (dati.data?.ritiri ?? []).filter(r =>
    (!cantiere || r.order_id === cantiere) && (!persona || r.operaio_id === persona)), [dati.data, cantiere, persona]);
  const totali = useMemo(() => totaliRitiri(ritiri), [ritiri]);
  const nomeCantiere = (id: string | null) => id ? dati.data?.cantieri.get(id) ?? "Commessa" : "Senza cantiere";
  const nomePersona = (id: string | null) => id ? dati.data?.nomi.get(id) ?? "Operaio" : "—";

  return (
    <Card>
      <CardContent className="p-0">
        <button type="button" aria-expanded={aperto} onClick={() => setAperto(v => !v)}
          className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left sm:min-h-10 sm:px-3 sm:py-2">
          <History className="size-4 text-primary" aria-hidden="true" />
          {/* Da tablet titolo e frase sulla stessa riga (25/11/2026): la riga chiusa era alta 66px. */}
          <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
            <span className="block font-semibold sm:shrink-0 sm:text-sm">Ritiri dal cantiere</span>
            <span className="block text-xs text-muted-foreground sm:truncate">Chi ha preso cosa, per quale cantiere, dall’app degli operai</span>
          </span>
          <ChevronDown className={`size-4 text-muted-foreground ${aperto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {aperto && (
          <div className="space-y-3 border-t px-4 pb-4 pt-3">
            <div className="flex flex-wrap gap-2">
              <select aria-label="Cantiere" value={cantiere} onChange={e => setCantiere(e.target.value)}
                className="h-10 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Tutti i cantieri</option>
                {[...(dati.data?.cantieri ?? new Map()).entries()].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
              <select aria-label="Persona" value={persona} onChange={e => setPersona(e.target.value)}
                className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm">
                <option value="">Tutte le persone</option>
                {[...(dati.data?.nomi ?? new Map()).entries()].map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
              <select aria-label="Periodo" value={giorni} onChange={e => setGiorni(Number(e.target.value))}
                className="h-10 rounded-md border bg-background px-2 text-sm">
                {PERIODI.map(p => <option key={p.giorni} value={p.giorni}>Ultimi {p.label}</option>)}
              </select>
              <div className="ms-auto flex gap-1 rounded-md bg-muted p-0.5" role="radiogroup" aria-label="Vista">
                {(["elenco", "totali"] as const).map(v => (
                  <Button key={v} type="button" size="sm" role="radio" aria-checked={vista === v}
                    variant={vista === v ? "secondary" : "ghost"} onClick={() => setVista(v)}>
                    {v === "elenco" ? "Elenco" : "Totali per materiale"}
                  </Button>
                ))}
              </div>
            </div>

            {dati.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carico i ritiri…</p>}
            {dati.isError && <p role="alert" className="text-sm text-destructive">Non riesco a caricare i ritiri. <Button variant="link" className="h-auto p-0" onClick={() => void dati.refetch()}>Riprova</Button></p>}
            {dati.isSuccess && ritiri.length === 0 && <p className="text-sm text-muted-foreground">Nessun ritiro nel periodo.</p>}

            {ritiri.length > 0 && vista === "elenco" && (
              <ul className="divide-y rounded-lg border">
                {ritiri.map(r => {
                  const stato = STATI[r.stato] ?? STATI.richiesto;
                  return (
                    <li key={r.id} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{nomePersona(r.operaio_id)}</span>
                        <span className="text-muted-foreground">per</span>
                        <span className="font-medium">{nomeCantiere(r.order_id)}</span>
                        <Badge variant="secondary" className={`ms-auto ${stato.className}`}>{stato.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.data), "d MMM yyyy, HH:mm", { locale: it })}
                        {r.documento_numero ? ` · DDT ${r.documento_numero}` : ""}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                      <ul className="text-sm">
                        {(Array.isArray(r.righe) ? r.righe : []).map((riga, i) => (
                          <li key={`${riga.stock_item_id}-${i}`} className="flex justify-between gap-2">
                            <span className="min-w-0 break-words">{riga.name}</span>
                            <span className="shrink-0 font-medium tabular-nums">{nf.format(Number(riga.quantita))} {riga.unita ?? ""}</span>
                          </li>
                        ))}
                      </ul>
                      {r.motivo_rifiuto && <p className="text-xs text-red-700">Rifiutato: {r.motivo_rifiuto}</p>}
                    </li>
                  );
                })}
              </ul>
            )}

            {ritiri.length > 0 && vista === "totali" && (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2 text-left">Materiale</th><th className="px-3 py-2 text-right">Consegnato</th><th className="px-3 py-2 text-right">Da approvare</th><th className="px-3 py-2 text-left">Chi</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {totali.map(t => (
                      <tr key={t.chiave}>
                        <td className="px-3 py-2">{t.nome}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{nf.format(t.consegnato)} {t.unita ?? ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.daApprovare ? `${nf.format(t.daApprovare)} ${t.unita ?? ""}` : "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.persone.map(nomePersona).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
