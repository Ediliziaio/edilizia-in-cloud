/**
 * ServiziFatturatoTab — tab "Servizi" di /admin/fatturato (Fase 3).
 *
 * Fatturato + incassato dei servizi (consulenze, agenzia, performance…) — SEPARATO
 * da Edilizia in Cloud (SaaS/Stripe). Aggrega public.aedix_service_billings per
 * servizio, categoria, società e mese, e stima il ricorrente attivo dai
 * clienti-servizio. Fonte del "voglio vedere fatturato e incassato dei servizi".
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandTrendChart } from "@/components/admin/BrandTrendChart";
import { Loader2, Package, TrendingUp, Wallet, Building2, Repeat, Users, PiggyBank, AlertTriangle } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;
const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n || 0));
const monthKey = (d: string) => d.slice(0, 7);
const monthShort = (k: string) => new Date(k + "-01T00:00:00").toLocaleDateString("it-IT", { month: "short", year: "2-digit" });

interface Billing { id: string; service_client_id: string; periodo: string; importo_dovuto: number; importo_incassato: number; societa: string | null; provvigione_importo: number; provvigione_stato: string; provvigione_commerciale: string | null; righe_provvigione: { base: string; importo: number }[] | null; }
interface Client { id: string; product_line_id: string; importo: number; ricorrenza: string; stato: string; cliente_nome: string; }
interface Line { id: string; nome: string; categoria: string; colore: string | null; }
const CAT_LABEL: Record<string, string> = { saas: "SaaS", consulenza: "Consulenza", agenzia: "Agenzia", performance: "Performance", una_tantum: "Una-tantum" };

export function ServiziFatturatoTab() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "servizi-fatturato"],
    queryFn: async () => {
      const [b, c, l] = await Promise.all([
        sb().from("aedix_service_billings").select("id,service_client_id,periodo,importo_dovuto,importo_incassato,societa,provvigione_importo,provvigione_stato,provvigione_commerciale,righe_provvigione"),
        sb().from("aedix_service_clients").select("id,product_line_id,importo,ricorrenza,stato,cliente_nome"),
        sb().from("aedix_product_lines").select("id,nome,categoria,colore"),
      ]);
      return {
        billings: (b.data ?? []) as Billing[],
        clients: (c.data ?? []) as Client[],
        lines: (l.data ?? []) as Line[],
      };
    },
  });

  const agg = useMemo(() => {
    const billings = data?.billings ?? [];
    const clients = data?.clients ?? [];
    const lines = data?.lines ?? [];
    const lineMap = new Map(lines.map((l) => [l.id, l]));
    const clientMap = new Map(clients.map((c) => [c.id, c]));

    let dovuto = 0, incassato = 0, provTot = 0, provDaPagare = 0;
    const perServizio = new Map<string, { nome: string; colore: string | null; dovuto: number; incassato: number }>();
    const perCategoria = new Map<string, { dovuto: number; incassato: number }>();
    const perSocieta = new Map<string, { dovuto: number; incassato: number }>();
    const perMese = new Map<string, { dovuto: number; incassato: number }>();
    const perCommerciale = new Map<string, { tot: number; daPagare: number }>();
    const perCliente = new Map<string, { nome: string; dovuto: number; incassato: number }>();
    const perBase = new Map<string, number>();

    for (const b of billings) {
      const d = Number(b.importo_dovuto) || 0, i = Number(b.importo_incassato) || 0;
      dovuto += d; incassato += i;
      const cl = clientMap.get(b.service_client_id);
      const line = cl ? lineMap.get(cl.product_line_id) : undefined;
      const sKey = line?.id ?? "—";
      const s = perServizio.get(sKey) ?? { nome: line?.nome ?? "Senza servizio", colore: line?.colore ?? null, dovuto: 0, incassato: 0 };
      s.dovuto += d; s.incassato += i; perServizio.set(sKey, s);
      const cat = line?.categoria ?? "—";
      const cc = perCategoria.get(cat) ?? { dovuto: 0, incassato: 0 }; cc.dovuto += d; cc.incassato += i; perCategoria.set(cat, cc);
      const soc = b.societa?.trim() || "Non indicata";
      const sc = perSocieta.get(soc) ?? { dovuto: 0, incassato: 0 }; sc.dovuto += d; sc.incassato += i; perSocieta.set(soc, sc);
      const mk = monthKey(b.periodo);
      const mm = perMese.get(mk) ?? { dovuto: 0, incassato: 0 }; mm.dovuto += d; mm.incassato += i; perMese.set(mk, mm);
      const pcl = perCliente.get(b.service_client_id) ?? { nome: cl?.cliente_nome ?? "Senza nome", dovuto: 0, incassato: 0 };
      pcl.dovuto += d; pcl.incassato += i; perCliente.set(b.service_client_id, pcl);
      for (const rg of b.righe_provvigione ?? []) { const bk = rg.base === "incassato" ? "incassato" : "fatturato"; perBase.set(bk, (perBase.get(bk) ?? 0) + (Number(rg.importo) || 0)); }
      const prov = Number(b.provvigione_importo) || 0;
      if (prov > 0) {
        provTot += prov;
        if (b.provvigione_stato !== "pagata") provDaPagare += prov;
        const comm = b.provvigione_commerciale?.trim() || "Non assegnato";
        const pc = perCommerciale.get(comm) ?? { tot: 0, daPagare: 0 };
        pc.tot += prov; if (b.provvigione_stato !== "pagata") pc.daPagare += prov;
        perCommerciale.set(comm, pc);
      }
    }

    // Ricorrente attivo (stima MRR servizi) dai clienti-servizio attivi
    const mrr = clients.filter((c) => c.stato === "attivo").reduce((s, c) => s + (c.ricorrenza === "mensile" ? Number(c.importo) : c.ricorrenza === "annuale" ? Number(c.importo) / 12 : 0), 0);

    const trend = Array.from(perMese.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([k, v]) => ({ mese: monthShort(k), dovuto: v.dovuto, incassato: v.incassato }));

    return {
      dovuto, incassato, mrr,
      provTot, provDaPagare, margineNetto: incassato - provTot,
      servizi: Array.from(perServizio.values()).sort((a, b) => b.dovuto - a.dovuto),
      societa: Array.from(perSocieta.entries()).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.incassato - a.incassato),
      commerciali: Array.from(perCommerciale.entries()).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.tot - a.tot),
      categorie: Array.from(perCategoria.entries()).map(([k, v]) => ({ nome: CAT_LABEL[k] ?? (k === "—" ? "Senza categoria" : k), ...v })).sort((a, b) => b.dovuto - a.dovuto),
      clienti: Array.from(perCliente.values()).sort((a, b) => b.incassato - a.incassato).slice(0, 8),
      provBaseFatturato: perBase.get("fatturato") ?? 0,
      provBaseIncassato: perBase.get("incassato") ?? 0,
      trend,
      hasData: billings.length > 0,
    };
  }, [data]);

  if (isLoading) {
    return <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <AlertTriangle className="h-9 w-9 text-amber-500/60" />
          <p className="text-sm text-muted-foreground">Errore nel caricamento del fatturato servizi.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    { l: "Fatturato servizi", v: eur(agg.dovuto), icon: TrendingUp, grad: "from-blue-500 to-indigo-500" },
    { l: "Incassato", v: eur(agg.incassato), icon: Wallet, grad: "from-emerald-500 to-teal-400" },
    { l: "Da incassare", v: eur(Math.max(0, agg.dovuto - agg.incassato)), icon: Package, grad: "from-orange-500 to-amber-400" },
    { l: "Provvigioni da pagare", v: eur(agg.provDaPagare), icon: Users, grad: "from-rose-500 to-red-400" },
    { l: "Margine netto", v: eur(agg.margineNetto), icon: PiggyBank, grad: "from-teal-500 to-emerald-400" },
    { l: "Ricorrente ~mese", v: eur(agg.mrr), icon: Repeat, grad: "from-violet-500 to-purple-400" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.l} className="relative overflow-hidden">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${k.grad}`} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.l}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{k.v}</div>
                </div>
                <div className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${k.grad} text-white shadow-sm`}><k.icon className="h-4 w-4" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!agg.hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nessun incasso servizi registrato.<br />Registra gli incassi dai Clienti-Servizio per popolare questa vista.</p>
            <a href="/admin/marketing/clienti-servizio" className="text-sm font-medium text-primary underline">Vai ai Clienti-Servizio →</a>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4" /> Andamento servizi · dovuto vs incassato</div>
              <BrandTrendChart
                data={agg.trend as unknown as Record<string, unknown>[]}
                xKey="mese"
                height={220}
                bars={[{ key: "dovuto", name: "Fatturato", color: "hsl(217 91% 60%)" }]}
                line={{ key: "incassato", name: "Incassato", color: "hsl(160 84% 39%)" }}
                yFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
                valueFormatter={(v) => eur(v)}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Top clienti · per incassato</div>
                <div className="space-y-2.5">
                  {agg.clienti.map((c) => {
                    const pct = agg.incassato > 0 ? Math.round((c.incassato / agg.incassato) * 100) : 0;
                    return (
                      <div key={c.nome}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{c.nome}</span>
                          <span className="tabular-nums text-muted-foreground">{eur(c.incassato)} / <span className="text-foreground">{eur(c.dovuto)}</span></span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><PiggyBank className="h-4 w-4" /> Per categoria</div>
                <div className="space-y-2">
                  {agg.categorie.map((c) => (
                    <div key={c.nome} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                      <span>{c.nome}</span>
                      <span className="tabular-nums text-muted-foreground">{eur(c.incassato)} / <span className="font-medium text-foreground">{eur(c.dovuto)}</span></span>
                    </div>
                  ))}
                </div>
                {(agg.provBaseFatturato > 0 || agg.provBaseIncassato > 0) && (
                  <div className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                    Provvigioni per base · <span className="font-medium text-foreground tabular-nums">{eur(agg.provBaseFatturato)}</span> su fatturato · <span className="font-medium text-foreground tabular-nums">{eur(agg.provBaseIncassato)}</span> su incassato
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4" /> Per servizio</div>
                <div className="space-y-2.5">
                  {agg.servizi.map((s) => {
                    const pct = agg.dovuto > 0 ? Math.round((s.dovuto / agg.dovuto) * 100) : 0;
                    return (
                      <div key={s.nome}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.colore ?? "hsl(var(--chart-1))" }} />{s.nome}</span>
                          <span className="tabular-nums text-muted-foreground">{eur(s.incassato)} / <span className="font-medium text-foreground">{eur(s.dovuto)}</span></span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.colore ?? "hsl(var(--chart-1))" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4" /> Incassato per società</div>
                <div className="space-y-2">
                  {agg.societa.map((s) => (
                    <div key={s.nome} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                      <span>{s.nome}</span>
                      <span className="tabular-nums font-medium">{eur(s.incassato)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> Provvigioni per commerciale</div>
                {agg.commerciali.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nessuna provvigione registrata.<br />Assegna un commerciale e la % negli Incassi.</p>
                ) : (
                  <div className="space-y-2">
                    {agg.commerciali.map((c) => (
                      <div key={c.nome} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                        <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" />{c.nome}</span>
                        <span className="text-right tabular-nums">
                          <span className="font-medium">{eur(c.tot)}</span>
                          {c.daPagare > 0 && <span className="ml-1.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-600">{eur(c.daPagare)} da pagare</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
