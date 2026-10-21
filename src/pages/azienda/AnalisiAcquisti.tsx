/**
 * AnalisiAcquisti — da chi compri, per quale commessa, quanto devi pagare e
 * se paghi lo stesso articolo a prezzi diversi.
 *
 * Una barra filtri comune (periodo, fornitore, commessa, categoria, tutto
 * nell'URL) e cinque schede: Panoramica, Fornitori, Commesse, Prezzi,
 * Scadenze. Importi senza IVA, tranne le rate da pagare (IVA compresa: è il
 * bonifico che parte). I conti stanno in `@/lib/procurement/spendAnalysis`
 * e nella funzione SQL `analisi_acquisti`.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useProcurementAnalysis } from "@/hooks/useProcurementAnalysis";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { KpiCard } from "@/components/costi/KpiCard";
import { formatCurrency, formatCurrencyCompact, formatDateIt } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  formatVariazione,
  periodoDaScelta,
  variazione,
  type AnalisiAcquistiDati,
  type FiltriAnalisi,
  type FornitoreAnalisi,
  type SceltaPeriodo,
} from "@/lib/procurement/spendAnalysis";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronsUpDown,
  PiggyBank,
  Receipt,
  RefreshCw,
  ShoppingCart,
  X,
} from "lucide-react";

const eur0 = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(v);

const SCHEDE = ["panoramica", "fornitori", "commesse", "prezzi", "scadenze"] as const;
type Scheda = (typeof SCHEDE)[number];

const PERIODI: Array<{ id: SceltaPeriodo; label: string }> = [
  { id: "anno", label: "Anno in corso" },
  { id: "12mesi", label: "Ultimi 12 mesi" },
  { id: "annoScorso", label: "Anno scorso" },
  { id: "personalizzato", label: "Personalizzato" },
];

const NESSUNA = "nessuna";

// ───────────────────────── Pezzi comuni ─────────────────────────

function Errore({ onRiprova }: { onRiprova: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1">Non sono riuscito a leggere i dati. Controlla la connessione e riprova.</span>
      <Button size="sm" variant="outline" onClick={onRiprova}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Riprova
      </Button>
    </div>
  );
}

function Vuoto({ titolo, guida }: { titolo: string; guida: string }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-sm font-medium">{titolo}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{guida}</p>
    </div>
  );
}

function Sezione({ titolo, destra, children, className }: { titolo: string; destra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{titolo}</h2>
        {destra}
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

/** Tabella che scorre dentro il suo riquadro (mai la pagina) sul telefono. */
function Scorre({ children }: { children: React.ReactNode }) {
  return <div className="-mx-3 overflow-x-auto sm:mx-0">{children}</div>;
}

/** Scelta da un elenco lungo, con ricerca (fornitori, commesse). */
function SceltaConRicerca({
  valore,
  onCambia,
  opzioni,
  tutti,
  segnaposto,
  extra,
}: {
  valore: string | null;
  onCambia: (v: string | null) => void;
  opzioni: Array<{ id: string; label: string; sotto?: string | null }>;
  tutti: string;
  segnaposto: string;
  extra?: { id: string; label: string };
}) {
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const scelta = valore === extra?.id ? extra?.label : opzioni.find((o) => o.id === valore)?.label;
  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const l = q ? opzioni.filter((o) => `${o.label} ${o.sotto ?? ""}`.toLowerCase().includes(q)) : opzioni;
    return l.slice(0, 60);
  }, [opzioni, cerca]);
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={aperto} className="h-9 w-full justify-between font-normal sm:w-[200px]">
          <span className={cn("truncate", !scelta && "text-muted-foreground")}>{scelta ?? tutti}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={segnaposto} value={cerca} onValueChange={setCerca} />
          <CommandList>
            <CommandEmpty>Nessun risultato.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__tutti" onSelect={() => { onCambia(null); setAperto(false); }}>
                <Check className={cn("mr-2 h-3.5 w-3.5", valore ? "opacity-0" : "opacity-100")} /> {tutti}
              </CommandItem>
              {extra && !cerca.trim() && (
                <CommandItem value={extra.id} onSelect={() => { onCambia(extra.id); setAperto(false); }}>
                  <Check className={cn("mr-2 h-3.5 w-3.5", valore === extra.id ? "opacity-100" : "opacity-0")} /> {extra.label}
                </CommandItem>
              )}
              {filtrate.map((o) => (
                <CommandItem key={o.id} value={o.id} onSelect={() => { onCambia(o.id); setAperto(false); }}>
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", valore === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0">
                    <span className="block truncate">{o.label}</span>
                    {o.sotto && <span className="block truncate text-[11px] text-muted-foreground">{o.sotto}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function nomeCommessa(codice: string | null, cliente: string | null): string {
  return [codice, cliente].filter(Boolean).join(" · ") || "Commessa senza codice";
}

function linkFornitore(supplierId: string | null): string | null {
  return supplierId ? `/azienda/impostazioni/fornitori?tab=operativo&fornitore=${encodeURIComponent(supplierId)}` : null;
}

// ───────────────────────── Schede ─────────────────────────

function GraficoMesi({ dati }: { dati: AnalisiAcquistiDati }) {
  const [serie, setSerie] = useState<"ordinato" | "fatturato">("ordinato");
  const righe = dati.mesi.map((m) => {
    const [a, mm] = m.mese.split("-").map(Number);
    return {
      etichetta: new Date(a, mm - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "2-digit" }),
      questo: serie === "ordinato" ? m.ordinato : m.fatturato,
      prima: serie === "ordinato" ? m.ordinatoAnnoPrima : m.fatturatoAnnoPrima,
    };
  });
  const vuoto = righe.every((r) => r.questo === 0 && r.prima === 0);
  return (
    <Sezione
      titolo="Spesa mese per mese (senza IVA)"
      destra={
        <div className="flex rounded-md border p-0.5 text-xs">
          {(["ordinato", "fatturato"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSerie(s)}
              className={cn("rounded px-2 py-0.5", serie === s ? "bg-muted font-medium" : "text-muted-foreground")}
            >
              {s === "ordinato" ? "Ordinato" : "Fatturato"}
            </button>
          ))}
        </div>
      }
    >
      {vuoto ? (
        <Vuoto titolo="Nessuna spesa nel periodo" guida="Il grafico si riempie con gli ordini d'acquisto e le fatture ricevute." />
      ) : (
        <>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={righe} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="etichetta" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} stroke="hsl(var(--muted-foreground))" tickFormatter={(v: number) => formatCurrencyCompact(v)} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, nome: string) => [formatCurrency(v), nome === "questo" ? "Periodo scelto" : "Anno prima"]}
                />
                <Bar dataKey="prima" fill="hsl(var(--chart-1))" fillOpacity={0.25} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="questo" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: "hsl(var(--chart-1))" }} /> Periodo scelto</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm opacity-25" style={{ background: "hsl(var(--chart-1))" }} /> Stesso mese, anno prima</span>
          </div>
        </>
      )}
    </Sezione>
  );
}

type Colonna = "nome" | "ordinato" | "fatturato" | "ordinatoNonFatturato" | "scaduto" | "ultimoAcquisto";

function Intestazione({
  col,
  children,
  destra = true,
  compatta,
  ordine,
  onOrdina,
}: {
  col: Colonna;
  children: React.ReactNode;
  destra?: boolean;
  compatta: boolean;
  ordine: { col: Colonna; giu: boolean };
  onOrdina: (col: Colonna) => void;
}) {
  return (
    <TableHead className={cn(destra && "text-right")}>
      {compatta ? (
        children
      ) : (
        <button
          type="button"
          className={cn("inline-flex items-center gap-1 hover:text-foreground", ordine.col === col && "text-foreground")}
          onClick={() => onOrdina(col)}
        >
          {children}
          {ordine.col === col && (ordine.giu ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
        </button>
      )}
    </TableHead>
  );
}

function TabellaFornitori({ righe, compatta = false }: { righe: FornitoreAnalisi[]; compatta?: boolean }) {
  const navigate = useNavigate();
  const [ordine, setOrdine] = useState<{ col: Colonna; giu: boolean }>({ col: "ordinato", giu: true });
  const [cerca, setCerca] = useState("");
  const [tutti, setTutti] = useState(false);

  const ordinate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    const l = q ? righe.filter((r) => `${r.nome} ${r.piva ?? ""}`.toLowerCase().includes(q)) : righe;
    const segno = ordine.giu ? -1 : 1;
    return [...l].sort((a, b) => {
      const va = a[ordine.col] ?? "";
      const vb = b[ordine.col] ?? "";
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * segno;
      return String(va).localeCompare(String(vb), "it") * segno;
    });
  }, [righe, cerca, ordine]);
  const visibili = compatta ? ordinate.slice(0, 5) : tutti ? ordinate : ordinate.slice(0, 10);

  const intestazione = { compatta, ordine, onOrdina: (col: Colonna) => setOrdine((o) => ({ col, giu: o.col === col ? !o.giu : col !== "nome" })) };

  return (
    <>
      {!compatta && (
        <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca fornitore o partita IVA" className="mb-3 h-9 sm:max-w-xs" />
      )}
      <Scorre>
        <Table className="min-w-[640px] [&_td]:px-3 [&_th]:px-3">
          <TableHeader>
            <TableRow>
              <Intestazione {...intestazione} col="nome" destra={false}>Fornitore</Intestazione>
              <Intestazione {...intestazione} col="ordinato">Ordinato</Intestazione>
              <Intestazione {...intestazione} col="fatturato">Fatturato</Intestazione>
              {!compatta && <Intestazione {...intestazione} col="ordinatoNonFatturato">Ordinato non fatturato</Intestazione>}
              <Intestazione {...intestazione} col="scaduto">Scaduto</Intestazione>
              {!compatta && <Intestazione {...intestazione} col="ultimoAcquisto">Ultimo acquisto</Intestazione>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibili.map((r) => {
              const link = linkFornitore(r.supplierId);
              return (
                <TableRow
                  key={r.chiave}
                  className={cn(link && "cursor-pointer")}
                  onClick={link ? () => navigate(link) : undefined}
                  title={link ? "Apri la scheda del fornitore: ordini, scadenze e pagamenti" : undefined}
                >
                  <TableCell className="max-w-[260px]">
                    <span className="block truncate font-medium">{r.nome}</span>
                    {!compatta && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.supplierId ? r.categoria ?? `${r.numeroOrdini} ordini · ${r.numeroFatture} fatture` : "Non in anagrafica fornitori"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.ordinato ? formatCurrency(r.ordinato) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.fatturato ? formatCurrency(r.fatturato) : "—"}</TableCell>
                  {!compatta && <TableCell className="text-right tabular-nums">{r.ordinatoNonFatturato > 0.5 ? formatCurrency(r.ordinatoNonFatturato) : "—"}</TableCell>}
                  <TableCell className={cn("text-right tabular-nums", r.scaduto > 0 && "font-medium text-red-600")}>{r.scaduto > 0 ? formatCurrency(r.scaduto) : "—"}</TableCell>
                  {!compatta && <TableCell className="text-right text-xs text-muted-foreground">{r.ultimoAcquisto ? formatDateIt(r.ultimoAcquisto) : "—"}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Scorre>
      {!compatta && ordinate.length > 10 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTutti((t) => !t)}>
          {tutti ? "Mostra solo i primi 10" : `Mostra tutti (${ordinate.length})`}
        </Button>
      )}
    </>
  );
}

function TabellaCommesse({ dati, compatta = false }: { dati: AnalisiAcquistiDati; compatta?: boolean }) {
  const righe = compatta ? dati.commesse.filter((c) => c.orderId).slice(0, 5) : dati.commesse;
  return (
    <Scorre>
      <Table className="min-w-[520px] [&_td]:px-3 [&_th]:px-3">
        <TableHeader>
          <TableRow>
            <TableHead>Commessa</TableHead>
            <TableHead className="text-right">Ordinato</TableHead>
            <TableHead className="text-right">Fatturato</TableHead>
            {!compatta && <TableHead className="text-right">Ordini</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {righe.map((c) => (
            <TableRow key={c.orderId ?? NESSUNA} className={cn(!c.orderId && "bg-amber-50 dark:bg-amber-950/30")}>
              <TableCell className="max-w-[280px]">
                {c.orderId ? (
                  <Link to={`/azienda/ordini/${c.orderId}`} className="block truncate font-medium hover:underline">
                    {nomeCommessa(c.codice, c.cliente)}
                  </Link>
                ) : (
                  <>
                    <span className="block font-medium text-amber-800 dark:text-amber-300">Senza commessa</span>
                    <span className="block text-[11px] text-muted-foreground">Ordini senza commessa e fatture non collegate a un ordine</span>
                  </>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.ordinato ? formatCurrency(c.ordinato) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{c.fatturato ? formatCurrency(c.fatturato) : "—"}</TableCell>
              {!compatta && <TableCell className="text-right tabular-nums">{c.numeroOrdini}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Scorre>
  );
}

// ───────────────────────── Pagina ─────────────────────────

export default function AnalisiAcquisti() {
  const [params, setParams] = useSearchParams();
  const permessi = usePermissions();

  const scheda: Scheda = (SCHEDE as readonly string[]).includes(params.get("scheda") ?? "") ? (params.get("scheda") as Scheda) : "panoramica";
  const sceltaPeriodo: SceltaPeriodo = PERIODI.some((p) => p.id === params.get("periodo")) ? (params.get("periodo") as SceltaPeriodo) : "anno";
  const dalUrl = params.get("dal") ?? "";
  const alUrl = params.get("al") ?? "";
  const periodo = useMemo(() => periodoDaScelta(sceltaPeriodo, new Date(), { dal: dalUrl, al: alUrl }), [sceltaPeriodo, dalUrl, alUrl]);
  const filtri: FiltriAnalisi = {
    fornitoreId: params.get("fornitore"),
    commessaId: params.get("commessa"),
    categoria: params.get("categoria"),
  };
  const filtriAttivi = sceltaPeriodo !== "anno" || !!filtri.fornitoreId || !!filtri.commessaId || !!filtri.categoria;

  const imposta = (modifiche: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(modifiche)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );

  const { analisiQuery, anagraficheQuery, prezziQuery, firmaQuery } = useProcurementAnalysis(periodo, filtri);
  const dati = analisiQuery.data?.analisi;
  const t = dati?.totali;
  const benchmarks = prezziQuery.data?.benchmarks ?? [];
  const firma = firmaQuery.data ?? null;

  const opzioniFornitori = useMemo(
    () =>
      (anagraficheQuery.data?.fornitori ?? [])
        .map((f) => ({ id: f.id, label: (f.name ?? "").trim() || "Fornitore senza nome", sotto: f.product_category }))
        .sort((a, b) => a.label.localeCompare(b.label, "it")),
    [anagraficheQuery.data],
  );
  const opzioniCommesse = useMemo(
    () =>
      (anagraficheQuery.data?.commesse ?? [])
        .map((c) => ({ id: c.id, label: c.order_code || c.client_name || "Commessa senza codice", sotto: c.order_code ? c.client_name : null }))
        .sort((a, b) => b.label.localeCompare(a.label, "it", { numeric: true })),
    [anagraficheQuery.data],
  );
  const categorie = useMemo(
    () => [...new Set((anagraficheQuery.data?.fornitori ?? []).map((f) => (f.product_category ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it")),
    [anagraficheQuery.data],
  );

  // «Sola lettura» solo per chi davvero non può cambiare ordini né fornitori.
  const solaLettura = !permessi.canEditOrders && !permessi.canEditSettingsSuppliers;

  const caricaAnalisi = (contenuto: (d: AnalisiAcquistiDati) => React.ReactNode, altezza = "h-48") =>
    analisiQuery.isError ? (
      <Errore onRiprova={() => analisiQuery.refetch()} />
    ) : analisiQuery.isLoading || !dati ? (
      <Skeleton className={cn("w-full rounded-xl", altezza)} />
    ) : (
      contenuto(dati)
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analisi Acquisti"
        description="Da chi compri, per quale commessa e quanto devi pagare. Importi senza IVA."
        badge={solaLettura ? <Badge variant="secondary" className="font-normal">Sola lettura</Badge> : undefined}
      />

      {/* Barra filtri: vale per tutte le schede. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
        <Select value={sceltaPeriodo} onValueChange={(v) => imposta({ periodo: v === "anno" ? null : v, ...(v === "personalizzato" ? { dal: periodo.dal, al: periodo.al } : { dal: null, al: null }) })}>
          <SelectTrigger className="h-9 w-full sm:w-[170px]" aria-label="Periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODI.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sceltaPeriodo === "personalizzato" && (
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
            <Input type="date" aria-label="Dal" value={periodo.dal} onChange={(e) => e.target.value && imposta({ dal: e.target.value })} className="h-9 flex-1 sm:w-[150px]" />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" aria-label="Al" value={periodo.al} onChange={(e) => e.target.value && imposta({ al: e.target.value })} className="h-9 flex-1 sm:w-[150px]" />
          </div>
        )}
        <SceltaConRicerca
          valore={filtri.fornitoreId ?? null}
          onCambia={(v) => imposta({ fornitore: v })}
          opzioni={opzioniFornitori}
          tutti="Tutti i fornitori"
          segnaposto="Cerca fornitore"
        />
        <SceltaConRicerca
          valore={filtri.commessaId ?? null}
          onCambia={(v) => imposta({ commessa: v })}
          opzioni={opzioniCommesse}
          tutti="Tutte le commesse"
          segnaposto="Cerca commessa o cliente"
          extra={{ id: NESSUNA, label: "Senza commessa" }}
        />
        {categorie.length > 0 && (
          <Select value={filtri.categoria ?? "__tutte"} onValueChange={(v) => imposta({ categoria: v === "__tutte" ? null : v })}>
            <SelectTrigger className="h-9 w-full sm:w-[170px]" aria-label="Categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__tutte">Tutte le categorie</SelectItem>
              {categorie.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filtriAttivi && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => imposta({ periodo: null, dal: null, al: null, fornitore: null, commessa: null, categoria: null })}>
            <X className="mr-1 h-3.5 w-3.5" /> Azzera filtri
          </Button>
        )}
        <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
          {formatDateIt(periodo.dal)} – {formatDateIt(periodo.al)}
        </span>
      </div>

      <Tabs value={scheda} onValueChange={(v) => imposta({ scheda: v === "panoramica" ? null : v })}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="panoramica">Panoramica</TabsTrigger>
          <TabsTrigger value="fornitori">Fornitori</TabsTrigger>
          <TabsTrigger value="commesse">Commesse</TabsTrigger>
          <TabsTrigger value="prezzi">Prezzi</TabsTrigger>
          <TabsTrigger value="scadenze">
            Scadenze
            {t && t.scadutoConteggio > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{t.scadutoConteggio}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Panoramica ── */}
        <TabsContent value="panoramica" className="mt-4 space-y-4">
          {analisiQuery.isError ? (
            <Errore onRiprova={() => analisiQuery.refetch()} />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              {analisiQuery.isLoading || !t ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
              ) : (
                <>
                  <KpiCard label="Ordinato" value={eur0(t.ordinato)} sub={formatVariazione(variazione(t.ordinato, t.annoPrima.ordinato)) ?? `${t.numeroOrdini} ordini`} icon={ShoppingCart} accent="bg-orange-500" />
                  <KpiCard label="Fatturato" value={eur0(t.fatturato)} sub={formatVariazione(variazione(t.fatturato, t.annoPrima.fatturato)) ?? `${t.numeroFatture} fatture`} icon={Receipt} accent="bg-blue-500" />
                  <KpiCard
                    label="Scaduto"
                    value={eur0(t.scaduto)}
                    sub={t.scadutoConteggio > 0 ? `${t.scadutoConteggio} rate · IVA compresa` : "Nessuna rata scaduta"}
                    icon={AlertTriangle}
                    accent={t.scaduto > 0 ? "bg-red-500" : "bg-emerald-500"}
                    onClick={() => imposta({ scheda: "scadenze" })}
                  />
                  <KpiCard
                    label="In scadenza 30 gg"
                    value={eur0(t.inScadenza30)}
                    sub={t.inScadenza30Conteggio > 0 ? `${t.inScadenza30Conteggio} rate · IVA compresa` : "Niente in arrivo"}
                    icon={CalendarClock}
                    accent="bg-amber-500"
                    onClick={() => imposta({ scheda: "scadenze" })}
                  />
                </>
              )}
            </div>
          )}

          {t && t.senzaCommessa > 0.5 && !filtri.commessaId && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="flex-1">
                <strong className="tabular-nums">{formatCurrency(t.senzaCommessa)}</strong> di acquisti senza commessa: non finiscono nel margine di nessun lavoro.
              </span>
              <Button size="sm" variant="outline" onClick={() => imposta({ scheda: "commesse" })}>Vedi</Button>
            </div>
          )}

          {firma && (
            <p className="text-sm text-muted-foreground">
              {firma.base === "firma" ? "Dalla firma del preventivo" : "Dalla creazione della commessa"} al primo ordine d'acquisto passano in media{" "}
              <strong className={firma.mediaGiorni > 7 ? "text-orange-700" : "text-foreground"}>{firma.mediaGiorni} giorni</strong> (su {firma.commesse} commesse degli ultimi 12 mesi).
              {firma.mediaGiorni > 7 && " Ogni giorno di attesa è materiale che arriva tardi e cantiere fermo."}
            </p>
          )}

          {caricaAnalisi((d) => <GraficoMesi dati={d} />, "h-72")}

          <div className="grid gap-4 lg:grid-cols-2">
            <Sezione titolo="Primi 5 fornitori" destra={<Button variant="link" size="sm" className="h-auto p-0" onClick={() => imposta({ scheda: "fornitori" })}>Tutti</Button>}>
              {caricaAnalisi((d) =>
                d.fornitori.length === 0 ? (
                  <Vuoto titolo="Nessun fornitore nel periodo" guida="Crea un ordine d'acquisto o importa le fatture ricevute." />
                ) : (
                  <TabellaFornitori righe={d.fornitori} compatta />
                ),
              )}
            </Sezione>
            <Sezione titolo="Prime 5 commesse" destra={<Button variant="link" size="sm" className="h-auto p-0" onClick={() => imposta({ scheda: "commesse" })}>Tutte</Button>}>
              {caricaAnalisi((d) =>
                d.commesse.some((c) => c.orderId) ? (
                  <TabellaCommesse dati={d} compatta />
                ) : (
                  <Vuoto titolo="Nessun acquisto collegato a una commessa" guida="Quando crei un ordine d'acquisto, scegli la commessa: così la spesa entra nel suo margine." />
                ),
              )}
            </Sezione>
          </div>
        </TabsContent>

        {/* ── Fornitori ── */}
        <TabsContent value="fornitori" className="mt-4">
          <Sezione titolo="Fornitori (senza IVA)" destra={<span className="text-xs text-muted-foreground">Clicca un fornitore per aprire la sua scheda</span>}>
            {caricaAnalisi((d) =>
              d.fornitori.length === 0 ? (
                <Vuoto titolo="Nessun fornitore nel periodo" guida="Prova un periodo più lungo, oppure crea un ordine d'acquisto o importa le fatture ricevute." />
              ) : (
                <TabellaFornitori righe={d.fornitori} />
              ),
            )}
          </Sezione>
        </TabsContent>

        {/* ── Commesse ── */}
        <TabsContent value="commesse" className="mt-4">
          <Sezione titolo="Spesa per commessa (senza IVA)">
            {caricaAnalisi((d) =>
              d.commesse.length === 0 ? (
                <Vuoto titolo="Nessun acquisto nel periodo" guida="Gli ordini d'acquisto collegati a una commessa compaiono qui, con quelli senza commessa in cima." />
              ) : (
                <TabellaCommesse dati={d} />
              ),
            )}
          </Sezione>
        </TabsContent>

        {/* ── Prezzi ── */}
        <TabsContent value="prezzi" className="mt-4">
          <Sezione
            titolo="Confronto prezzi dello stesso articolo"
            destra={
              prezziQuery.data && prezziQuery.data.totalSaving > 0 ? (
                <span className="flex items-center gap-1.5 text-sm">
                  <PiggyBank className="h-4 w-4 text-emerald-600" />
                  Risparmio potenziale <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">{eur0(prezziQuery.data.totalSaving)}</strong>
                </span>
              ) : undefined
            }
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Risparmio potenziale: quanto avresti risparmiato se avessi pagato il prezzo migliore degli ultimi 12 mesi. Prezzi netti di sconto, stesso articolo e stessa unità di misura; le voci «a corpo» e le righe generiche non entrano. Questa scheda guarda sempre gli ultimi 12 mesi.
            </p>
            {prezziQuery.isError ? (
              <Errore onRiprova={() => prezziQuery.refetch()} />
            ) : prezziQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : benchmarks.length === 0 ? (
              <Vuoto
                titolo="Nessun articolo comprato a prezzi diversi"
                guida="Serve lo stesso articolo, con la stessa unità di misura, comprato da almeno due fornitori o almeno tre volte negli ultimi 12 mesi."
              />
            ) : (
              <Scorre>
                <Table className="min-w-[680px] [&_td]:px-3 [&_th]:px-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Articolo</TableHead>
                      <TableHead className="text-right">Acquisti</TableHead>
                      <TableHead className="text-right">Migliore</TableHead>
                      <TableHead className="text-right">Medio</TableHead>
                      <TableHead className="text-right">Più alto</TableHead>
                      <TableHead className="text-right">Ultimo</TableHead>
                      <TableHead className="text-right">Risparmio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benchmarks.map((b) => (
                      <TableRow key={b.key}>
                        <TableCell className="max-w-[280px]">
                          <span className="block truncate font-medium" title={b.label}>{b.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {b.supplierCount} fornitor{b.supplierCount === 1 ? "e" : "i"}
                            {b.bestSupplierName ? ` · migliore: ${b.bestSupplierName}` : ""}
                            {b.unitOfMeasure ? ` · prezzo al ${b.unitOfMeasure}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{b.purchaseCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(b.minPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(b.avgPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(b.maxPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(b.lastPrice)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatCurrency(b.potentialSaving)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Scorre>
            )}
          </Sezione>
        </TabsContent>

        {/* ── Scadenze ── */}
        <TabsContent value="scadenze" className="mt-4">
          <Sezione
            titolo="Da pagare ai fornitori (IVA compresa)"
            destra={t ? <span className="text-xs text-muted-foreground tabular-nums">Scaduto {formatCurrency(t.scaduto)} · prossimi 30 giorni {formatCurrency(t.inScadenza30)}</span> : undefined}
          >
            {caricaAnalisi((d) =>
              d.scadenze.length === 0 ? (
                <Vuoto titolo="Nessuna rata scaduta o in scadenza nei prossimi 30 giorni" guida="Le rate ai fornitori nascono dalle fatture ricevute e dagli ordini con termini di pagamento." />
              ) : (
                <Scorre>
                  <Table className="min-w-[560px] [&_td]:px-3 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scadenza</TableHead>
                        <TableHead>Fornitore</TableHead>
                        <TableHead>Descrizione</TableHead>
                        <TableHead className="text-right">Da pagare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.scadenze.map((s) => {
                        const link = linkFornitore(s.supplierId);
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="whitespace-nowrap">
                              <span className={cn("tabular-nums", s.scaduta && "font-medium text-red-600")}>{formatDateIt(s.scadenza)}</span>
                              {s.scaduta && <Badge variant="destructive" className="ml-2 px-1.5 py-0 text-[10px]">Scaduta</Badge>}
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              {link ? (
                                <Link to={link} className="block truncate font-medium hover:underline">{s.fornitore}</Link>
                              ) : (
                                <span className="block truncate font-medium">{s.fornitore}</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate text-muted-foreground">{s.descrizione ?? "—"}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.residuo)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Scorre>
              ),
            )}
          </Sezione>
        </TabsContent>
      </Tabs>
    </div>
  );
}
