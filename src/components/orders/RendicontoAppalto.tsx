/**
 * RendicontoAppalto — quello che hai fatto, tradotto in quello che devi fatturare.
 * ────────────────────────────────────────────────────────────────────────────
 * Vive nella scheda Finanza di una commessa `order_type='appaltatore_lavoro'`.
 * Una riga = un fatto fatturabile al committente: tre uomini per otto ore,
 * quattro viaggi, 120 m² di posa. Il prezzo NON lo decide questa pagina: lo
 * riscrive il database dalla tariffa del contratto, applicando l'eccezione di
 * cantiere se c'è (trigger `appalto_rendiconto_prepara`). Qui si scelgono la
 * tariffa, la quantità e la data; il resto arriva da sotto.
 *
 * Su una commessa a misura questo è l'unico posto che conosce il valore vero
 * della commessa: `total_amount` lì è una stima.
 *
 * Le righe nascono in BOZZA e l'ufficio le conferma. Dalla Fase 4 arrivano anche
 * da sole: un rapportino di campo approvato diventa una riga (ore × tariffa
 * della qualifica), e i rapportini che NON ci sono riusciti si vedono qui sotto
 * col motivo — un rapportino saltato in silenzio è una giornata non fatturata.
 *
 * Fasi 3 e 4 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, Loader2, CheckCircle2, Circle, AlertTriangle,
  Euro, Lock, Tags, FileWarning,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { euro } from "@/lib/clienti/schedaCliente";
import { tariffaUsabileIl, totaliRendiconto } from "@/lib/appalto/rendiconto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { SalAppalto } from "@/components/orders/SalAppalto";

/* ─── Tipi ─────────────────────────────────────────────────────────── */

interface Riga {
  id: string; data: string; tariffa_id: string | null;
  descrizione: string; unita_misura: string; prezzo_unitario: number;
  quantita: number; maggiorazione_pct: number; importo: number;
  costo_interno: number | null; margine: number | null;
  employee_id: string | null; fase_id: string | null;
  origine: string; extra_contratto: boolean; stato: string; note: string | null;
}

interface TariffaListino {
  id: string; tipo: string; codice: string | null; descrizione: string;
  unita_misura: string; prezzo_unitario: number;
  valido_dal: string | null; valido_al: string | null; attivo: boolean;
  maggiorazione_straordinario_pct: number | null;
  maggiorazione_festivo_pct: number | null;
}

interface Override { id: string; tariffa_id: string; prezzo_unitario: number; nota: string | null }
interface Fase { id: string; name: string | null }
interface Operaio { id: string; nome: string }

interface Props {
  orderId: string;
  contrattoId: string | null;
  committenteId?: string | null;
  modoFatturazione?: "per_commessa" | "mensile_cumulativa" | null;
  valorizzazione: "a_corpo" | "a_misura" | null | undefined;
  tettoImporto: number | null | undefined;
  importoCommessa: number | null | undefined;
  puoModificare: boolean;
  vedeImporti: boolean;
}

const etichettaUnita = (v: string) => ({
  ora: "ora", giornata: "giornata", uomo_giorno: "uomo/giorno", viaggio: "viaggio",
  km: "km", mq: "m²", ml: "m", mc: "m³", kg: "kg", cad: "cad", corpo: "a corpo",
}[v] ?? v);

const giornoIT = (iso: string) => {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a.slice(2)}` : iso;
};

/* ─── Componente ───────────────────────────────────────────────────── */

export function RendicontoAppalto({
  orderId, contrattoId, committenteId, modoFatturazione, valorizzazione,
  tettoImporto, importoCommessa, puoModificare, vedeImporti,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Costi e margini hanno due permessi loro, distinti da «Importi delle
  // commesse»: un commerciale può vedere i costi e non i margini.
  const permessi = usePermissions();
  const vedeCosti = permessi.canViewCosts;
  const vedeMargini = permessi.canViewMargins;

  const [form, setForm] = useState<Partial<Riga> | null>(null);
  const [qtaGrezza, setQtaGrezza] = useState("");
  const [prezzoGrezzo, setPrezzoGrezzo] = useState("");
  const [costoGrezzo, setCostoGrezzo] = useState("");
  const [daEliminare, setDaEliminare] = useState<Riga | null>(null);
  const [overrideForm, setOverrideForm] = useState<{ tariffa_id: string; prezzo: string; nota: string } | null>(null);
  const [eccezioniAperte, setEccezioniAperte] = useState(false);

  const chiaveRighe = ["appalto-rendiconto", orderId];

  const righe = useQuery({
    queryKey: chiaveRighe,
    enabled: vedeImporti,
    queryFn: async (): Promise<Riga[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_rendiconto_righe")
        .select("*")
        .eq("order_id", orderId)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Riga[];
    },
  });

  const listino = useQuery({
    queryKey: ["appalto-listino-commessa", contrattoId],
    enabled: vedeImporti && !!contrattoId,
    queryFn: async (): Promise<TariffaListino[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_tariffe")
        .select("id, tipo, codice, descrizione, unita_misura, prezzo_unitario, valido_dal, valido_al, attivo, maggiorazione_straordinario_pct, maggiorazione_festivo_pct")
        .eq("contratto_id", contrattoId)
        .order("ordine", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TariffaListino[];
    },
  });

  const eccezioni = useQuery({
    queryKey: ["appalto-eccezioni", orderId],
    enabled: vedeImporti,
    queryFn: async (): Promise<Override[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_tariffe_commessa")
        .select("id, tariffa_id, prezzo_unitario, nota")
        .eq("order_id", orderId);
      if (error) throw error;
      return (data ?? []) as Override[];
    },
  });

  /**
   * I rapportini approvati che NON sono diventati una riga, col motivo. La
   * vista li calcola col database, quindi la pagina non ripete la regola.
   */
  const daRendicontare = useQuery({
    queryKey: ["appalto-rapportini-da-rendicontare", orderId],
    enabled: vedeImporti,
    queryFn: async (): Promise<Array<{ rapportino_id: string; data_lavoro: string; ore_lavorate: number | null; motivo: string | null }>> => {
      const { data, error } = await (supabase as any)
        .from("v_appalto_rapportini_da_rendicontare")
        .select("rapportino_id, data_lavoro, ore_lavorate, motivo")
        .eq("order_id", orderId)
        .order("data_lavoro", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fasi = useQuery({
    queryKey: ["appalto-fasi", orderId],
    queryFn: async (): Promise<Fase[]> => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id, name")
        .eq("order_id", orderId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Fase[];
    },
  });

  const operai = useQuery({
    queryKey: ["appalto-operai-commessa", orderId],
    queryFn: async (): Promise<Operaio[]> => {
      const { data, error } = await supabase
        .from("order_employees")
        .select("employee_id, employees(id, first_name, last_name)")
        .eq("order_id", orderId);
      if (error) throw error;
      type Riga = { employees: { id: string; first_name: string | null; last_name: string | null } | null };
      return ((data ?? []) as unknown as Riga[])
        .map((r) => r.employees)
        .filter((e): e is NonNullable<typeof e> => !!e)
        .map((e) => ({ id: e.id, nome: [e.first_name, e.last_name].filter(Boolean).join(" ") || "Operaio" }));
    },
  });

  const mappaEccezioni = useMemo(
    () => new Map((eccezioni.data ?? []).map((o) => [o.tariffa_id, o])),
    [eccezioni.data],
  );
  const mappaFasi = useMemo(() => new Map((fasi.data ?? []).map((f) => [f.id, f.name ?? "Fase"])), [fasi.data]);
  const mappaOperai = useMemo(() => new Map((operai.data ?? []).map((o) => [o.id, o.nome])), [operai.data]);
  const mappaTariffe = useMemo(() => new Map((listino.data ?? []).map((t) => [t.id, t])), [listino.data]);

  const totali = useMemo(() => totaliRendiconto(righe.data ?? []), [righe.data]);

  const tariffaScelta = form?.tariffa_id ? mappaTariffe.get(form.tariffa_id) ?? null : null;
  const giornoForm = form?.data ?? new Date().toLocaleDateString("en-CA");
  const tariffeDisponibili = useMemo(
    () => (listino.data ?? []).filter((t) => tariffaUsabileIl(t, giornoForm)),
    [listino.data, giornoForm],
  );

  /** L'anteprima dell'importo: le stesse tre regole che applicherà il database. */
  const anteprima = useMemo(() => {
    const q = parseDecimalIT(qtaGrezza);
    if (q <= 0) return null;
    const magg = Number(form?.maggiorazione_pct ?? 0);
    const prezzo = tariffaScelta
      ? Number(mappaEccezioni.get(tariffaScelta.id)?.prezzo_unitario ?? tariffaScelta.prezzo_unitario)
      : parseDecimalIT(prezzoGrezzo);
    if (prezzo <= 0) return null;
    return { prezzo, importo: Math.round(q * prezzo * (1 + magg / 100) * 100) / 100 };
  }, [qtaGrezza, prezzoGrezzo, form?.maggiorazione_pct, tariffaScelta, mappaEccezioni]);

  /* ── Scritture ── */

  const salva = useMutation({
    mutationFn: async (f: Partial<Riga>) => {
      const riga = {
        order_id: orderId,
        data: f.data || new Date().toLocaleDateString("en-CA"),
        tariffa_id: f.tariffa_id || null,
        // Con una tariffa questi tre li riscrive il trigger dal listino: li
        // mandiamo solo perché sono NOT NULL.
        descrizione: f.tariffa_id ? "—" : (f.descrizione ?? "").trim(),
        unita_misura: f.tariffa_id ? "cad" : (f.unita_misura || "cad"),
        prezzo_unitario: f.tariffa_id ? 0 : parseDecimalIT(prezzoGrezzo),
        quantita: parseDecimalIT(qtaGrezza),
        maggiorazione_pct: Number(f.maggiorazione_pct ?? 0),
        // Con una riga libera lo mette il trigger a true: qui vale per le righe
        // a listino, dove è una scelta di chi era in cantiere.
        extra_contratto: !!f.extra_contratto,
        employee_id: f.employee_id || null,
        fase_id: f.fase_id || null,
        note: f.note || null,
        /* Il costo si scrive anche sulle righe a listino: era il buco piu'
           grosso del modulo. Il listino dice quanto INCASSI, non quanto ti
           costa, e senza costo il margine resta NULL — cioe' la pagina «quale
           committente mi conviene» non ha niente da dire. Dove la voce e'
           agganciata a una tariffa aziendale il trigger riscrive comunque il
           costo vero dell'azienda: li' questo campo non vince, e va bene cosi'.
           Vuoto = null esplicito, altrimenti svuotarlo non lo cancellerebbe. */
        costo_interno: costoGrezzo.trim() ? parseDecimalIT(costoGrezzo) : null,
      };
      if (f.id) {
        const { error } = await (supabase as any).from("appalto_rendiconto_righe").update(riga).eq("id", f.id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("appalto_rendiconto_righe").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => {
      setForm(null); setQtaGrezza(""); setPrezzoGrezzo(""); setCostoGrezzo("");
      queryClient.invalidateQueries({ queryKey: chiaveRighe });
      queryClient.invalidateQueries({ queryKey: ["appalto-rapportini-da-rendicontare", orderId] });
      toast({ title: "Riga salvata" });
    },
    onError: (e) => {
      logger.error("rendiconto salva", e);
      toast({ title: "Riga non salvata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await (supabase as any).from("appalto_rendiconto_righe").update({ stato }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chiaveRighe }),
    onError: (e) => toast({ title: "Stato non cambiato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("appalto_rendiconto_righe").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDaEliminare(null);
      queryClient.invalidateQueries({ queryKey: chiaveRighe });
      queryClient.invalidateQueries({ queryKey: ["appalto-rapportini-da-rendicontare", orderId] });
      toast({ title: "Riga eliminata" });
    },
    onError: (e) => toast({ title: "Non eliminata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const salvaEccezione = useMutation({
    mutationFn: async (x: { tariffa_id: string; prezzo: string; nota: string }) => {
      const { error } = await (supabase as any)
        .from("appalto_tariffe_commessa")
        .upsert({
          order_id: orderId, tariffa_id: x.tariffa_id,
          prezzo_unitario: parseDecimalIT(x.prezzo), nota: x.nota.trim() || null,
        }, { onConflict: "order_id,tariffa_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setOverrideForm(null);
      queryClient.invalidateQueries({ queryKey: ["appalto-eccezioni", orderId] });
      toast({ title: "Prezzo di cantiere salvato", description: "Vale per le righe nuove, non per quelle già inserite." });
    },
    onError: (e) => toast({ title: "Non salvato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const togliEccezione = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("appalto_tariffe_commessa").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appalto-eccezioni", orderId] });
      toast({ title: "Torna al prezzo di listino" });
    },
  });

  /* ── Render ── */

  if (!vedeImporti) {
    return (
      <QuoteCard title="Rendiconto" icon={<Euro className="h-4 w-4" />}>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Lock className="h-4 w-4 shrink-0" />
          Il rendiconto sono importi: lo vede chi ha il permesso «Importi delle commesse».
        </p>
      </QuoteCard>
    );
  }

  const aMisura = valorizzazione === "a_misura";
  const totaleRendicontato = totali.confermato + totali.inBozza;
  const oltreIlTetto = typeof tettoImporto === "number" && tettoImporto > 0 && totaleRendicontato > tettoImporto;

  return (
    <div className="space-y-4">
      <QuoteCard
        title="Rendiconto"
        icon={<Euro className="h-4 w-4" />}
        subtitle={aMisura ? "Qui sta il valore vero di questa commessa." : "Quello che hai fatto, oltre o dentro l'importo concordato."}
        action={puoModificare ? (
          <Button size="sm" onClick={() => { setForm({ data: new Date().toLocaleDateString("en-CA"), maggiorazione_pct: 0 }); setQtaGrezza(""); setPrezzoGrezzo(""); setCostoGrezzo(""); }}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Riga
          </Button>
        ) : undefined}
      >
        {/* Totali. Le bozze si contano a parte: non sono ancora soldi. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Totale t="Confermato" v={euro(totali.confermato, true)} forte />
          <Totale t="In bozza" v={euro(totali.inBozza, true)} nota={totali.inBozza > 0 ? "da controllare" : undefined} />
          {/* Costi e margini non si vedono con il permesso sugli importi: sono
              due permessi loro, e un commerciale può avere l'uno e non l'altro. */}
          <Totale
            t="Costo"
            v={!vedeCosti ? "riservato" : totali.costo === null ? "—" : euro(totali.costo, true)}
          />
          <Totale
            t="Margine"
            v={!vedeMargini ? "riservato" : totali.margine === null ? "—" : euro(totali.margine, true)}
            nota={
              !vedeMargini
                ? "serve il permesso «Margini»"
                : totali.margine === null
                  /* Tre motivi diversi, e dirne uno per l'altro fa cercare un
                     costo che c'e' gia'. Questi riquadri rispondono a «cosa mi
                     resta da chiudere»: a lavoro tutto rendicontato sono zero
                     per davvero, e va detto, non spacciato per un costo che
                     manca. Il margine del cantiere intero sta in testa alla
                     pagina. */
                  ? (totali.confermato === 0 && totali.inBozza === 0 && (righe.data ?? []).length > 0
                      ? "tutto in un rendiconto"
                      : totali.confermato === 0 && totali.inBozza > 0
                        ? "nessuna riga confermata"
                        : "nessun costo noto")
                  // La percentuale sul ricavo di cui si conosce il costo: sul
                  // confermato intero uscirebbe più bassa del vero.
                  : totali.marginePct !== null
                    ? `${formatDecimalIT(totali.marginePct, { minDecimals: 0, maxDecimals: 1 })} %`
                    : undefined
            }
          />
        </div>

        {totali.righeSenzaCosto > 0 && totali.margine !== null && (
          <p className="mt-2 text-xs text-muted-foreground">
            Il margine copre solo le righe di cui si conosce il costo:{" "}
            {totali.righeSenzaCosto} {totali.righeSenzaCosto === 1 ? "riga confermata non lo ha" : "righe confermate non lo hanno"}.
          </p>
        )}

        {oltreIlTetto && (
          <Alert variant="destructive" className="mt-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Rendicontato {euro(totaleRendicontato, true)} su un tetto concordato di {euro(tettoImporto!, true)}.
              Oltre il tetto il committente può rifiutare: va rinegoziato prima di fatturare.
            </AlertDescription>
          </Alert>
        )}

        {aMisura && typeof importoCommessa === "number" && importoCommessa > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Stima iniziale {euro(importoCommessa, true)} · rendicontato finora {euro(totaleRendicontato, true)}.
          </p>
        )}

        {totali.extra > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            Di cui {euro(totali.extra, true)} fuori contratto: sono le righe che si discutono a fine lavori.
          </p>
        )}

        {/* Le righe */}
        <div className="mt-4">
          {righe.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (righe.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">
              {contrattoId
                ? "Nessuna riga. Aggiungi quello che hai fatto: le giornate, i viaggi, le misure."
                : "Questa commessa non ha un contratto agganciato, quindi non ha un listino da cui prendere i prezzi. Puoi comunque inserire righe libere, che nascono fuori contratto."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Data</TableHead>
                    <TableHead>Voce</TableHead>
                    <TableHead className="text-right">Q.tà</TableHead>
                    <TableHead className="text-right">Prezzo</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead className="text-right">Margine</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(righe.data ?? []).map((r) => (
                    <TableRow key={r.id} className={cn(r.stato === "bozza" && "bg-amber-50/40")}>
                      <TableCell className="text-xs tabular-nums text-slate-600">{giornoIT(r.data)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{r.descrizione}</span>
                        <span className="block text-xs text-slate-500">
                          {[
                            r.fase_id ? mappaFasi.get(r.fase_id) : null,
                            r.employee_id ? mappaOperai.get(r.employee_id) : null,
                            r.maggiorazione_pct ? `+${formatDecimalIT(r.maggiorazione_pct, { minDecimals: 0 })}%` : null,
                            r.origine !== "manuale" ? r.origine : null,
                          ].filter(Boolean).join(" · ")}
                        </span>
                        {r.extra_contratto && <Badge variant="outline" className="mt-1 text-[10px]">fuori contratto</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimalIT(r.quantita, { minDecimals: 0, maxDecimals: 2 })}
                        <span className="ml-1 text-xs text-slate-500">{etichettaUnita(r.unita_misura)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{euro(r.prezzo_unitario, true)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{euro(r.importo, true)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">
                        {!vedeMargini
                          ? <span className="text-slate-400">riservato</span>
                          : r.margine === null ? <span className="text-slate-400">—</span> : euro(r.margine, true)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {puoModificare && r.stato !== "in_sal" ? (
                            <Button
                              variant="ghost" size="icon"
                              aria-label={r.stato === "confermata" ? "Riporta in bozza" : "Conferma la riga"}
                              onClick={() => cambiaStato.mutate({ id: r.id, stato: r.stato === "confermata" ? "bozza" : "confermata" })}
                            >
                              {r.stato === "confermata"
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                : <Circle className="h-4 w-4 text-slate-300" />}
                            </Button>
                          ) : (
                            (r.stato === "confermata" || r.stato === "in_sal") &&
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                          {puoModificare && r.stato === "in_sal" && (
                            <span title="È in un rendiconto al committente: si libera solo annullando una bozza">
                              <Lock className="h-3.5 w-3.5 text-slate-400" />
                            </span>
                          )}
                          {puoModificare && r.stato !== "in_sal" && (
                            <>
                              <Button variant="ghost" size="icon" aria-label="Modifica la riga"
                                onClick={() => {
                                  setForm(r);
                                  setQtaGrezza(formatDecimalIT(r.quantita, { minDecimals: 0, maxDecimals: 2 }));
                                  setPrezzoGrezzo(formatDecimalIT(r.prezzo_unitario));
                                  setCostoGrezzo(r.costo_interno === null ? "" : formatDecimalIT(r.costo_interno));
                                }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" aria-label="Elimina la riga" onClick={() => setDaEliminare(r)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </QuoteCard>

      {/* I rapportini che non sono diventati righe. Niente salti silenziosi:
          un rapportino approvato e non rendicontato è una giornata di lavoro
          che nessuno fattura, e senza questo elenco non lo scopri. */}
      {(daRendicontare.data ?? []).length > 0 && (
        <QuoteCard
          title="Giornate di campo non rendicontate"
          icon={<FileWarning className="h-4 w-4 text-amber-600" />}
          subtitle="Rapportini approvati che il sistema non ha potuto tradurre in un importo."
        >
          <div className="space-y-2">
            {(daRendicontare.data ?? []).map((x) => (
              <div key={x.rapportino_id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
                <p className="text-sm font-medium text-slate-900">
                  {giornoIT(x.data_lavoro)}
                  {x.ore_lavorate ? ` · ${formatDecimalIT(x.ore_lavorate, { minDecimals: 0, maxDecimals: 1 })} ore` : ""}
                </p>
                {/* Motivo vuoto non vuol dire «non si sa»: vuol dire che ADESSO
                    il listino basterebbe, e la riga non e' nata perche' quando
                    il rapportino e' stato approvato mancava qualcosa (la
                    qualifica dell'operaio, una tariffa in vigore). Si risolve
                    con la riga qui sotto, non indagando. */}
                <p className="text-xs text-amber-800">
                  {x.motivo ?? "Adesso il listino basterebbe: la riga non è nata quando il rapportino è stato approvato."}
                </p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Sistemato il listino del contratto, basta togliere e rimettere l'approvazione del
              rapportino perché la riga nasca. Oppure si scrive a mano qui sopra.
            </p>
          </div>
        </QuoteCard>
      )}

      {/* Eccezioni di prezzo di questo cantiere */}
      {contrattoId && (
        <QuoteCard
          title="Prezzi diversi su questo cantiere"
          icon={<Tags className="h-4 w-4" />}
          action={
            <Button variant="outline" size="sm" onClick={() => setEccezioniAperte((v) => !v)}>
              {eccezioniAperte ? "Chiudi" : `Apri${(eccezioni.data ?? []).length > 0 ? ` (${(eccezioni.data ?? []).length})` : ""}`}
            </Button>
          }
        >
          {!eccezioniAperte ? (
            <p className="text-sm text-slate-500">
              {(eccezioni.data ?? []).length === 0
                ? "Nessuna: si usa il listino del contratto."
                : `${(eccezioni.data ?? []).length} ${(eccezioni.data ?? []).length === 1 ? "tariffa" : "tariffe"} con un prezzo diverso solo qui.`}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                «Su questo lavoro il trasporto me lo paga 80». Vale solo per questa commessa e
                solo per le righe che inserirai da adesso: quelle già scritte tengono il prezzo
                che avevano.
              </p>
              {(eccezioni.data ?? []).map((o) => {
                const t = mappaTariffe.get(o.tariffa_id);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t?.descrizione ?? "Tariffa"}</p>
                      <p className="text-xs text-slate-500">
                        Listino {t ? euro(t.prezzo_unitario, true) : "—"} → qui{" "}
                        <strong>{euro(o.prezzo_unitario, true)}</strong>
                        {o.nota ? ` · ${o.nota}` : ""}
                      </p>
                    </div>
                    {puoModificare && (
                      <Button variant="ghost" size="icon" aria-label="Torna al prezzo di listino" onClick={() => togliEccezione.mutate(o.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {puoModificare && (
                <Button variant="outline" size="sm" onClick={() => setOverrideForm({ tariffa_id: "", prezzo: "", nota: "" })}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Prezzo diverso
                </Button>
              )}
            </div>
          )}
        </QuoteCard>
      )}

      {/* I rendiconti al committente: è qui che le righe confermate diventano
          un documento, e da quel momento si congelano. */}
      <SalAppalto
        committenteId={committenteId ?? null}
        orderId={orderId}
        modoFatturazione={modoFatturazione}
        puoModificare={puoModificare}
        vedeImporti={vedeImporti}
      />

      {/* ─── Dialogo riga ─── */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Modifica riga" : "Nuova riga di rendiconto"}</DialogTitle>
            <DialogDescription>
              Il prezzo lo prende il sistema dal listino del contratto, con l'eventuale prezzo di questo cantiere.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="r-data">Giorno</Label>
                <Input id="r-data" type="date" value={form.data ?? ""} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="r-qta">Quantità</Label>
                <Input id="r-qta" inputMode="decimal" value={qtaGrezza}
                  onChange={(e) => setQtaGrezza(e.target.value)}
                  onBlur={() => { const v = parseDecimalIT(qtaGrezza); setQtaGrezza(v > 0 ? formatDecimalIT(v, { minDecimals: 0, maxDecimals: 2 }) : ""); }}
                  placeholder="3" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="r-tariffa">Voce di listino</Label>
                <Select
                  value={form.tariffa_id ?? "libera"}
                  onValueChange={(v) => setForm({ ...form, tariffa_id: v === "libera" ? null : v })}
                >
                  <SelectTrigger id="r-tariffa"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tariffeDisponibili.map((t) => {
                      const ecc = mappaEccezioni.get(t.id);
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          {t.descrizione} · {euro(ecc?.prezzo_unitario ?? t.prezzo_unitario, true)}/{etichettaUnita(t.unita_misura)}
                          {ecc ? " (prezzo di questo cantiere)" : ""}
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="libera">Riga libera — fuori contratto</SelectItem>
                  </SelectContent>
                </Select>
                {!contrattoId && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Senza contratto agganciato si possono scrivere solo righe libere.
                  </p>
                )}
                {contrattoId && tariffeDisponibili.length === 0 && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Nessuna tariffa del listino è in vigore il giorno scelto.
                  </p>
                )}
              </div>

              {/* Riga libera: descrizione, unità e prezzo li scrive chi inserisce. */}
              {!form.tariffa_id && (
                <>
                  <div className="sm:col-span-2">
                    <Label htmlFor="r-desc">Descrizione</Label>
                    <Input id="r-desc" value={form.descrizione ?? ""} onChange={(e) => setForm({ ...form, descrizione: e.target.value })}
                      placeholder="Smaltimento non previsto" />
                  </div>
                  <div>
                    <Label htmlFor="r-um">Unità</Label>
                    <Input id="r-um" value={form.unita_misura ?? "cad"} onChange={(e) => setForm({ ...form, unita_misura: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="r-prezzo">Prezzo unitario</Label>
                    <Input id="r-prezzo" inputMode="decimal" value={prezzoGrezzo}
                      onChange={(e) => setPrezzoGrezzo(e.target.value)}
                      onBlur={() => { const v = parseDecimalIT(prezzoGrezzo); setPrezzoGrezzo(v > 0 ? formatDecimalIT(v) : ""); }}
                      placeholder="50,00" />
                  </div>
                </>
              )}

              {/* Il costo vale per TUTTE le righe, non solo per quelle libere:
                  il listino e' il prezzo del committente, il costo e' tuo. */}
              <div className="sm:col-span-2">
                <Label htmlFor="r-costo">Costo tuo (facoltativo)</Label>
                <Input id="r-costo" inputMode="decimal" value={costoGrezzo}
                  onChange={(e) => setCostoGrezzo(e.target.value)}
                  onBlur={() => { const v = parseDecimalIT(costoGrezzo); setCostoGrezzo(v > 0 ? formatDecimalIT(v) : ""); }}
                  placeholder="0,00" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Quanto ti costa questa riga <strong>in tutto</strong>, non al pezzo.
                  Senza costo il margine resta vuoto, invece di sembrare pari all'incasso.
                  {form.tariffa_id ? " Se la voce è agganciata a una tariffa aziendale, vale il costo di quella." : ""}
                </p>
              </div>

              <div>
                <Label htmlFor="r-magg">Maggiorazione %</Label>
                <Input id="r-magg" type="number" step="0.01" min={-100} max={200}
                  value={form.maggiorazione_pct ?? 0}
                  onChange={(e) => setForm({ ...form, maggiorazione_pct: Number(e.target.value) })} />
                {tariffaScelta?.maggiorazione_straordinario_pct != null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Straordinario su questa voce: +{formatDecimalIT(tariffaScelta.maggiorazione_straordinario_pct, { minDecimals: 0 })} %
                  </p>
                )}
              </div>
              {/* Un lavoro pagato a listino può comunque essere fuori
                  dall'accordo: lo smaltimento che nessuno aveva previsto si
                  paga con la giornata uomo del contratto, ma non era ordinato —
                  ed è la riga che si discute a fine lavori. */}
              {form.tariffa_id && (
                <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                  <div className="min-w-0 pr-3">
                    <Label className="cursor-pointer">Fuori contratto</Label>
                    <p className="text-xs text-slate-500">
                      Il prezzo resta quello del listino, ma la riga si vede a parte: è lavoro che il
                      committente non aveva ordinato.
                    </p>
                  </div>
                  <Switch checked={!!form.extra_contratto}
                    onCheckedChange={(v) => setForm({ ...form, extra_contratto: v })} />
                </div>
              )}

              <div>
                <Label htmlFor="r-fase">Fase</Label>
                <Select value={form.fase_id ?? "nessuna"} onValueChange={(v) => setForm({ ...form, fase_id: v === "nessuna" ? null : v })}>
                  <SelectTrigger id="r-fase"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuna">Nessuna</SelectItem>
                    {(fasi.data ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name ?? "Fase"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="r-operaio">Chi ha lavorato</Label>
                <Select value={form.employee_id ?? "nessuno"} onValueChange={(v) => setForm({ ...form, employee_id: v === "nessuno" ? null : v })}>
                  <SelectTrigger id="r-operaio"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Non specificato</SelectItem>
                    {(operai.data ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {(operai.data ?? []).length === 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Nessun operaio assegnato a questa commessa: si assegnano dalla scheda Cantiere.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="r-note">Note</Label>
                <Textarea id="r-note" rows={2} value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>

              {anteprima && (
                <div className="sm:col-span-2 rounded-lg border bg-slate-50 p-3 text-sm">
                  <span className="text-slate-500">Importo della riga: </span>
                  <strong className="tabular-nums">{euro(anteprima.importo, true)}</strong>
                  <span className="text-xs text-slate-500">
                    {" "}({formatDecimalIT(parseDecimalIT(qtaGrezza), { minDecimals: 0, maxDecimals: 2 })} × {euro(anteprima.prezzo, true)}
                    {Number(form.maggiorazione_pct ?? 0) !== 0 ? ` + ${formatDecimalIT(Number(form.maggiorazione_pct), { minDecimals: 0 })}%` : ""})
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Annulla</Button>
            <Button
              disabled={
                salva.isPending
                || parseDecimalIT(qtaGrezza) <= 0
                || (!form?.tariffa_id && (!form?.descrizione?.trim() || parseDecimalIT(prezzoGrezzo) <= 0))
              }
              onClick={() => form && salva.mutate(form)}
            >
              {salva.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialogo prezzo di cantiere ─── */}
      <Dialog open={!!overrideForm} onOpenChange={(o) => !o && setOverrideForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prezzo diverso su questo cantiere</DialogTitle>
            <DialogDescription>Il listino del contratto non cambia: cambia solo qui.</DialogDescription>
          </DialogHeader>
          {overrideForm && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="o-tariffa">Tariffa</Label>
                <Select value={overrideForm.tariffa_id} onValueChange={(v) => setOverrideForm({ ...overrideForm, tariffa_id: v })}>
                  <SelectTrigger id="o-tariffa"><SelectValue placeholder="Scegli la tariffa" /></SelectTrigger>
                  <SelectContent>
                    {(listino.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.descrizione} · listino {euro(t.prezzo_unitario, true)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="o-prezzo">Prezzo su questo cantiere</Label>
                <Input id="o-prezzo" inputMode="decimal" value={overrideForm.prezzo}
                  onChange={(e) => setOverrideForm({ ...overrideForm, prezzo: e.target.value })}
                  onBlur={() => { const v = parseDecimalIT(overrideForm.prezzo); setOverrideForm({ ...overrideForm, prezzo: v > 0 ? formatDecimalIT(v) : "" }); }}
                  placeholder="80,00" />
              </div>
              <div>
                <Label htmlFor="o-nota">Perché</Label>
                <Input id="o-nota" value={overrideForm.nota} onChange={(e) => setOverrideForm({ ...overrideForm, nota: e.target.value })}
                  placeholder="Concordato col capocantiere il 12/10" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideForm(null)}>Annulla</Button>
            <Button
              disabled={!overrideForm?.tariffa_id || parseDecimalIT(overrideForm?.prezzo ?? "") <= 0 || salvaEccezione.isPending}
              onClick={() => overrideForm && salvaEccezione.mutate(overrideForm)}
            >
              {salvaEccezione.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Conferma eliminazione ─── */}
      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa riga?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare && `${daEliminare.descrizione} — ${euro(daEliminare.importo, true)} del ${giornoIT(daEliminare.data)}.`}
              {daEliminare?.stato === "confermata" && " La riga era confermata."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Totale({ t, v, nota, forte }: { t: string; v: string; nota?: string; forte?: boolean }) {
  return (
    <div className="rounded-lg border bg-white p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t}</p>
      <p className={cn("tabular-nums", forte ? "text-lg font-bold text-slate-900" : "text-sm font-semibold text-slate-800")}>{v}</p>
      {nota && <p className="text-[11px] text-slate-500">{nota}</p>}
    </div>
  );
}

export default RendicontoAppalto;
