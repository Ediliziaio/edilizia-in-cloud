import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  INFO_TIPO_FORNITORE,
  TIPI_FORNITORE,
  isTipoFornitore,
  proponiTipo,
  type PropostaTipo,
  type TipoFornitore,
} from "@/lib/fornitori/tipiFornitore";

/**
 * Tipi dei fornitori: ogni cedente delle fatture ricevute, col tipo proposto e il
 * perché. Il tipo decide se le sue fatture vanno su una commessa (materiali,
 * subappalto, noli) o nelle spese generali (TIM, luce, affitto, banca).
 * Confermare crea la scheda in anagrafica se manca e ci collega le fatture.
 */

export interface Cedente {
  chiave: string;
  piva: string | null;
  cf: string | null;
  nome: string | null;
  fatture: number;
  imponibile: number | null;
  ultima: string | null;
  fornitore_id: string | null;
  fornitore_nome: string | null;
  fornitore_tipo: string | null;
  fornitore_categoria: string | null;
  subappaltatore_id: string | null;
  reverse_charge_edile: boolean | null;
  categorie: string[] | null;
}

type Vista = "da_fare" | "fatti" | "tutti";

export function propostaPerCedente(c: Cedente): PropostaTipo | null {
  return proponiTipo({
    nome: c.nome,
    traISubappaltatori: !!c.subappaltatore_id,
    reverseChargeEdile: !!c.reverse_charge_edile,
    categoriaScheda: c.fornitore_categoria,
    categorieFatture: c.categorie ?? [],
  });
}

/** Il tipo salvato sulla scheda, se c'è. */
const tipoSalvato = (c: Cedente): TipoFornitore | null => (isTipoFornitore(c.fornitore_tipo) ? c.fornitore_tipo : null);

/**
 * Salva il tipo di un cedente: aggiorna la scheda o la crea, poi ci collega le sue
 * fatture ancora senza fornitore (collega_fornitore_ricevute, che le registra).
 */
async function salvaTipo(companyId: string, c: Cedente, tipo: TipoFornitore): Promise<void> {
  const db = supabase as any;
  const subappaltatore = tipo === "subappalto" ? c.subappaltatore_id : null;
  let supplierId = c.fornitore_id;
  if (supplierId) {
    const { error } = await db.from("suppliers")
      .update({ tipo, ...(subappaltatore ? { subappaltatore_id: subappaltatore } : {}) })
      .eq("id", supplierId).eq("company_id", companyId);
    if (error) throw error;
  } else {
    const { data: nuovo, error } = await db.from("suppliers").insert({
      company_id: companyId,
      name: (c.nome || "Fornitore").trim(),
      vat_number: c.piva || null,
      fiscal_code: c.cf || null,
      tipo,
      subappaltatore_id: subappaltatore,
    }).select("id").single();
    if (error) {
      if (error.code === "42501") throw new Error("Non hai il permesso di aggiungere fornitori: chiedi all'amministratore.");
      throw error;
    }
    supplierId = String(nuovo.id);
  }
  // Le sue fatture ancora senza fornitore si collegano alla scheda (anche quando la
  // scheda c'era già ma nessuno le aveva collegate).
  const { data: fatture, error: e2 } = await db.from("fatture_ricevute").select("id")
    .eq("company_id", companyId).is("fornitore_id", null)
    .eq(c.piva ? "cedente_piva" : "cedente_cf", c.piva || c.cf).limit(500);
  if (e2) throw e2;
  const ids = ((fatture ?? []) as Array<{ id: string }>).map((f) => f.id);
  if (ids.length) {
    const { error: e3 } = await db.rpc("collega_fornitore_ricevute", { p_company_id: companyId, p_invoice_ids: ids, p_supplier_id: supplierId });
    if (e3) throw e3;
  }
}

export default function TipiFornitoriPage() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>("da_fare");
  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [cerca, setCerca] = useState("");
  // La scelta di chi guarda, prima di salvare (altrimenti vale la proposta).
  const [scelte, setScelte] = useState<Record<string, TipoFornitore>>({});
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [avanzamento, setAvanzamento] = useState<{ fatti: number; totale: number } | null>(null);

  const { data: cedenti = [], isLoading, error } = useQuery({
    queryKey: ["cedenti-fatture-ricevute", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("cedenti_fatture_ricevute", { p_company_id: companyId });
      if (error) throw error;
      return (data ?? []) as Cedente[];
    },
  });

  const righe = useMemo(() => cedenti.map((c) => {
    const proposta = propostaPerCedente(c);
    const salvato = tipoSalvato(c);
    return { c, proposta, salvato, scelto: scelte[c.chiave] ?? salvato ?? proposta?.tipo ?? null };
  }), [cedenti, scelte]);

  // La spesa per tipo, con quello salvato o, se manca, la proposta.
  const perTipo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of righe) {
      const k = r.salvato ?? "__da_fare";
      m.set(k, (m.get(k) ?? 0) + Number(r.c.imponibile ?? 0));
    }
    return m;
  }, [righe]);

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return righe.filter((r) => {
      if (vista === "da_fare" && r.salvato) return false;
      if (vista === "fatti" && !r.salvato) return false;
      if (filtroTipo !== "all" && r.scelto !== filtroTipo) return false;
      if (q && !`${r.c.nome ?? ""} ${r.c.piva ?? ""} ${r.c.fornitore_nome ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [righe, vista, filtroTipo, cerca]);

  const proposteSicure = righe.filter((r) => !r.salvato && r.proposta?.sicurezza === "certa");
  const daFare = righe.filter((r) => !r.salvato).length;

  const salva = useMutation({
    mutationFn: async (lista: Array<{ c: Cedente; tipo: TipoFornitore }>) => {
      let fatti = 0;
      const errori: string[] = [];
      setAvanzamento({ fatti: 0, totale: lista.length });
      for (const { c, tipo } of lista) {
        try {
          await salvaTipo(companyId!, c, tipo);
        } catch (e) {
          errori.push(`${c.nome}: ${e instanceof Error ? e.message : String(e)}`);
          // Senza permesso è inutile continuare: ogni riga darebbe lo stesso errore.
          if (/permesso/i.test(String(e instanceof Error ? e.message : e))) break;
        }
        fatti += 1;
        setAvanzamento({ fatti, totale: lista.length });
      }
      return { fatti, errori };
    },
    onSuccess: ({ fatti, errori }) => {
      setAvanzamento(null);
      setSelezionati(new Set());
      setScelte({});
      queryClient.invalidateQueries({ queryKey: ["cedenti-fatture-ricevute"] });
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute-tipi-fornitori"] });
      if (errori.length) {
        toast.error(`${fatti - errori.length} salvati, ${errori.length} non riusciti`, { description: errori.slice(0, 3).join(" · ") });
      } else {
        toast.success(fatti === 1 ? "Tipo salvato" : `${fatti} fornitori sistemati`);
      }
    },
    onError: (e: Error) => { setAvanzamento(null); toast.error("Non riuscito", { description: e.message }); },
  });

  const salvaSelezionati = () => {
    const lista = righe.filter((r) => selezionati.has(r.c.chiave) && r.scelto).map((r) => ({ c: r.c, tipo: r.scelto! }));
    if (lista.length) salva.mutate(lista);
  };

  const tutteSelezionate = visibili.length > 0 && visibili.every((r) => selezionati.has(r.c.chiave));

  return (
    <div className="space-y-5 max-sm:space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/azienda/documenti/fatture-ricevute" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Fatture ricevute
          </Link>
          <h1 className="text-2xl font-bold max-sm:text-lg">Tipi dei fornitori</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Il tipo decide dove va il costo: le fatture di materiali, subappalti e noli vanno su una commessa, quelle di
            telefonia, luce, affitto o banca nelle spese generali.
          </p>
        </div>
        {proposteSicure.length > 0 && (
          <Button
            onClick={() => salva.mutate(proposteSicure.map((r) => ({ c: r.c, tipo: r.proposta!.tipo })))}
            disabled={salva.isPending}
            title="Le proposte sicure: subappaltatori in elenco, reverse charge edile, nomi noti (TIM, Enel, banche…)"
          >
            {salva.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-2" />}
            Conferma le proposte sicure ({proposteSicure.length})
          </Button>
        )}
      </div>

      {/* Spesa per tipo: si vede subito quanto pesa ogni famiglia. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TIPI_FORNITORE.filter((t) => (perTipo.get(t) ?? 0) !== 0).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setFiltroTipo(filtroTipo === t ? "all" : t); setVista("tutti"); }}
            className={`rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50 ${filtroTipo === t ? "border-primary bg-primary/5" : ""}`}
          >
            <p className="text-xs text-muted-foreground">{INFO_TIPO_FORNITORE[t].etichetta}</p>
            <p className="text-sm font-semibold tabular-nums">{formatCurrency(perTipo.get(t) ?? 0)}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setVista("da_fare"); setFiltroTipo("all"); }}
          className={`rounded-lg border border-dashed p-2.5 text-left hover:bg-muted/50 ${vista === "da_fare" && filtroTipo === "all" ? "border-primary bg-primary/5" : ""}`}
        >
          <p className="text-xs text-muted-foreground">Da classificare · {daFare}</p>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(perTipo.get("__da_fare") ?? 0)}</p>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm">
          {([["da_fare", `Da classificare (${daFare})`], ["fatti", "Classificati"], ["tutti", "Tutti"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setVista(v)}
              className={`rounded px-2.5 py-1 ${vista === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
          ))}
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-9 w-56" aria-label="Filtra per tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            {TIPI_FORNITORE.map((t) => <SelectItem key={t} value={t}>{INFO_TIPO_FORNITORE[t].etichetta}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nome o partita IVA" className="h-9 pl-8" />
        </div>
        {selezionati.size > 0 && (
          <Button size="sm" onClick={salvaSelezionati} disabled={salva.isPending}>
            Salva i {selezionati.size} selezionati
          </Button>
        )}
        {avanzamento && <span className="text-xs text-muted-foreground">Salvo {avanzamento.fatti} di {avanzamento.totale}…</span>}
      </div>

      {error ? (
        <p className="text-sm text-destructive">Non riesco a leggere i fornitori: {(error as Error).message}</p>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : visibili.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          {vista === "da_fare" ? "Tutti i fornitori hanno un tipo." : "Nessun fornitore con questi filtri."}
        </CardContent></Card>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="hidden grid-cols-[2rem_minmax(0,1fr)_7.5rem_8rem_18rem] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground md:grid">
            <Checkbox
              aria-label="Seleziona tutti quelli visibili"
              checked={tutteSelezionate}
              onCheckedChange={(v) => setSelezionati(v ? new Set(visibili.map((r) => r.c.chiave)) : new Set())}
            />
            <span>Fornitore</span>
            <span className="text-right">Fatture</span>
            <span className="text-right">Imponibile</span>
            <span>Tipo</span>
          </div>
          <ul className="divide-y">
            {visibili.slice(0, 300).map(({ c, proposta, salvato, scelto }) => (
              <li key={c.chiave} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-2.5 md:grid-cols-[2rem_minmax(0,1fr)_7.5rem_8rem_18rem] md:items-center">
                <Checkbox
                  aria-label={`Seleziona ${c.nome ?? c.piva}`}
                  checked={selezionati.has(c.chiave)}
                  onCheckedChange={(v) => setSelezionati((s) => { const n = new Set(s); if (v) n.add(c.chiave); else n.delete(c.chiave); return n; })}
                  className="mt-0.5 md:mt-0"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={c.nome ?? undefined}>{c.nome || "Senza nome"}</p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {c.piva ? <span>P.IVA {c.piva}</span> : c.cf ? <span>C.F. {c.cf}</span> : null}
                    {c.fornitore_id ? <span>In anagrafica{c.fornitore_nome && c.fornitore_nome !== c.nome ? ` come «${c.fornitore_nome}»` : ""}</span>
                      : <span className="text-amber-700 dark:text-amber-400">Non in anagrafica: si aggiunge salvando</span>}
                    {c.subappaltatore_id ? <span>Nei subappaltatori</span> : null}
                    <span className="basis-full md:hidden">{c.fatture} fatture · {formatCurrency(Number(c.imponibile ?? 0))}</span>
                  </p>
                  {/* La proposta sta col fornitore: a destra resta una riga sola, uguale per tutti. */}
                  {!salvato && proposta && scelto === proposta.tipo ? (
                    <p className="text-[11px] text-muted-foreground">
                      {proposta.sicurezza === "certa" ? "Proposta sicura" : "Proposta"}: {proposta.motivo.toLowerCase()}
                    </p>
                  ) : null}
                </div>
                <div className="hidden text-right text-sm tabular-nums md:block">
                  {c.fatture}
                  {c.ultima ? <span className="block whitespace-nowrap text-[11px] text-muted-foreground">ultima {formatDateShort(c.ultima)}</span> : null}
                </div>
                <div className="hidden text-right text-sm tabular-nums md:block">{formatCurrency(Number(c.imponibile ?? 0))}</div>
                <div className="col-span-2 md:col-span-1">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={scelto ?? "none"}
                      onValueChange={(v) => isTipoFornitore(v) && setScelte((s) => ({ ...s, [c.chiave]: v }))}
                    >
                      <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label={`Tipo di ${c.nome ?? c.piva}`}>
                        <SelectValue placeholder="Scegli il tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>Scegli il tipo</SelectItem>
                        {TIPI_FORNITORE.map((t) => <SelectItem key={t} value={t}>{INFO_TIPO_FORNITORE[t].etichetta}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {/* Spazio fisso: con o senza «Salva» la tendina ha la stessa larghezza in ogni riga. */}
                    <div className="flex w-16 shrink-0 justify-end">
                      {scelto && scelto !== salvato ? (
                        <Button size="sm" variant="outline" className="h-8 w-full px-2 text-xs" disabled={salva.isPending}
                          onClick={() => salva.mutate([{ c, tipo: scelto }])}>
                          Salva
                        </Button>
                      ) : salvato ? <Badge variant="secondary" className="h-6 text-[11px]">Salvato</Badge> : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {visibili.length > 300 && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Ne vedi 300 su {visibili.length}: cerca o filtra per tipo per trovare gli altri.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
