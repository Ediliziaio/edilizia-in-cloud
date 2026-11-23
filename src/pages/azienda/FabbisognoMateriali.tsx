// /azienda/fabbisogno-materiali — l'ufficio acquisti: cosa manca da ordinare in
// tutte le commesse, e entro quando. Le fasi validate dal tecnico e, dal 17/11/2026, quelle
// che la validazione non la usano (si comprano subito anche nella commessa). Ci porta anche il promemoria del mattino (materiali_promemoria_acquisti).
// Da qui si cambia la data in cui il materiale serve (materiali_data_fabbisogno_imposta)
// e si creano le bozze d'ordine su più commesse insieme (ordinaDalFabbisogno).
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Lightbulb, Loader2, PackageSearch, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFabbisognoMateriali, useImpostaDataFabbisogno, useOrdinaDalFabbisogno } from "@/hooks/useFabbisognoMateriali";
import { EccezioniOperative } from "@/components/operazioni/EccezioniOperative";
import { usePermissions } from "@/hooks/usePermissions";
import { ODA_STATI_EMESSI } from "@/lib/odaStatus";
import { ETICHETTA_LIVELLO, proponiFornitori, type AnagraficaFornitore, type FornitoreProposto, type ProvaAcquisto, type ProvaListino } from "@/lib/acquisti/fornitoriSuggeriti";
import { gruppiDaOrdinare, ordinabile } from "@/lib/acquisti/ordinaDalFabbisogno";
import { apertaFabbisogno, avanzamentoFasi, differenze, nomeBreve, ETICHETTA_URGENZA, linkMateriali, raggruppaPerFase, raggruppaPerUrgenza, selezionabile, testoLimite, urgenza, type RigaFabbisogno, type Urgenza } from "@/lib/acquisti/fabbisogno";
import { ETICHETTA_STATO_MATERIALE, type StatoMateriale } from "@/lib/distinta/statoMateriale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { VerificaDatiMaterialeDialog } from "@/components/orders/materiali/VerificaDatiMateriale";

const COLORE: Record<Urgenza, string> = {
  ritardo: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
  settimana: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  mese: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  dopo: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  senza_data: "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300",
  da_verificare: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
};

const numero = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const data = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—");

/**
 * Con `orderId` è il fabbisogno di una commessa sola, nella finestra «Fabbisogno» dei materiali della
 * commessa (17/11/2026): stesse righe e stesse azioni, senza titolo di pagina né filtro commesse.
 */
export default function FabbisognoMateriali({ orderId, inFinestra = false }: { orderId?: string; inFinestra?: boolean } = {}) {
  const { data: tutteLeRighe = [], isLoading, isError, refetch } = useFabbisognoMateriali(orderId);
  // Nella commessa arrivano anche le righe già coperte (per l'avanzamento delle fasi): qui le aperte.
  const righe = useMemo(() => (orderId ? tutteLeRighe.filter(apertaFabbisogno) : tutteLeRighe), [orderId, tutteLeRighe]);
  const [commessa, setCommessa] = useState("tutte");
  const [fornitore, setFornitore] = useState("tutti");
  // La data di oggi nel fuso dell'utente (en-CA = AAAA-MM-GG), non in UTC.
  const oggi = new Date().toLocaleDateString("en-CA");

  const commesse = useMemo(() => [...new Map(righe.map((r) => [r.order_id, r.commessa ?? "—"])).entries()], [righe]);
  const fornitori = useMemo(() => [...new Map(righe.map((r) => [r.supplier_id ?? "_nessuno", r.fornitore ?? "Senza fornitore"])).entries()], [righe]);
  const filtrate = righe.filter((r) =>
    (commessa === "tutte" || r.order_id === commessa)
    && (fornitore === "tutti" || (r.supplier_id ?? "_nessuno") === fornitore));
  const gruppi = raggruppaPerUrgenza(filtrate, oggi);
  const conta = (u: Urgenza) => gruppi.find((g) => g.urgenza === u)?.righe.length ?? 0;

  const { canManagePurchasing, canEditOrders, canViewCosts } = usePermissions();
  const puoOrdinare = canManagePurchasing;
  const puoDatare = canManagePurchasing || canEditOrders;
  // Si spunta anche senza fornitore (17/11/2026): prima si assegna il fornitore, poi si ordina.
  const puoScegliere = canManagePurchasing || canEditOrders;
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  // Telefono: 30 righe per gruppo, poi «Mostra tutti». Con 500 materiali la pagina era alta
  // 90.000px (collaudo 23/11/2026). Da tablet in su si vede tutto come prima.
  const telefono = useIsMobile(640);
  const [gruppiAperti, setGruppiAperti] = useState<Set<string>>(new Set());
  const RIGHE_TELEFONO = 30;
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const fornitoriAzienda = useQuery({
    queryKey: ["fornitori-azienda-elenco", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && puoScegliere,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name, tipo, lead_time_days, min_order_amount, is_active").eq("company_id", effectiveCompany!.id).order("name").limit(2000);
      if (error) throw error;
      return (data ?? []) as AnagraficaFornitore[];
    },
  });
  // Per proporre il fornitore ai materiali che non l'hanno: cosa l'azienda ha già comprato e da chi, e i listini attivi.
  const storicoFornitori = useQuery({
    queryKey: ["fornitori-prove-materiali", effectiveCompany?.id, canViewCosts],
    enabled: !!effectiveCompany?.id && !!orderId && puoScegliere,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [acq, lis, oda] = await Promise.all([
        db.from("order_items").select("name, product_code, unita_misura, purchase_price, article_template_id, created_at, supplier_id, orders!inner(company_id)")
          .eq("orders.company_id", effectiveCompany!.id).not("supplier_id", "is", null).order("created_at", { ascending: false }).limit(1500),
        // I prezzi di listino si chiedono solo per chi vede i costi: a chi non li vede non devono nemmeno arrivare al browser.
        db.from("listino_fornitore_voci").select(`codice, descrizione, unita, ${canViewCosts ? "prezzo, sconto_pct, " : ""}listini_fornitore!inner(supplier_id, attivo, valido_dal, valido_al)`)
          .eq("company_id", effectiveCompany!.id).eq("listini_fornitore.attivo", true).limit(3000),
        // Gli ordini emessi: la prova più forte, col prezzo pagato davvero.
        db.from("purchase_order_items").select("description, sku, unit_of_measure, unit_price, discount_percent, article_template_id, created_at, purchase_orders!inner(supplier_id, status, sent_at)")
          .eq("company_id", effectiveCompany!.id).in("purchase_orders.status", ODA_STATI_EMESSI).order("created_at", { ascending: false }).limit(1500),
      ]);
      // Una lettura fallita non deve passare per «nessun fornitore da proporre».
      for (const r of [acq, lis, oda]) if (r.error) throw r.error;
      // I prezzi si mostrano solo a chi vede i costi: agli altri resta chi vende l'articolo, non a quanto.
      const prezzo = (n: number | null | undefined) => (canViewCosts ? n ?? null : null);
      const acquisti: ProvaAcquisto[] = ((acq.data ?? []) as { name: string; product_code: string | null; unita_misura: string | null; purchase_price: number | null; article_template_id: string | null; created_at: string | null; supplier_id: string }[])
        .map((r) => ({ origine: "commessa" as const, supplier_id: r.supplier_id, descrizione: r.name, codice: r.product_code, unita: r.unita_misura, prezzo: prezzo(r.purchase_price), data: r.created_at, article_template_id: r.article_template_id }));
      const listini: ProvaListino[] = ((lis.data ?? []) as { codice: string | null; descrizione: string; unita: string | null; prezzo: number | null; sconto_pct: number | null; listini_fornitore: { supplier_id: string; attivo: boolean; valido_dal: string | null; valido_al: string | null } }[])
        .map((v) => ({ supplier_id: v.listini_fornitore.supplier_id, descrizione: v.descrizione, codice: v.codice, unita: v.unita, prezzo: prezzo(v.prezzo), sconto_pct: v.sconto_pct,
          valido_dal: v.listini_fornitore.valido_dal, valido_al: v.listini_fornitore.valido_al, attivo: v.listini_fornitore.attivo }));
      for (const r of (oda.data ?? []) as { description: string; sku: string | null; unit_of_measure: string | null; unit_price: number | null; discount_percent: number | null; article_template_id: string | null; created_at: string; purchase_orders: { supplier_id: string; sent_at: string | null } }[]) {
        const netto = r.unit_price != null ? Number(r.unit_price) * (1 - (Number(r.discount_percent) || 0) / 100) : null;
        acquisti.push({ origine: "ordine", supplier_id: r.purchase_orders.supplier_id, descrizione: r.description, codice: r.sku, unita: r.unit_of_measure,
          prezzo: prezzo(netto), data: r.purchase_orders.sent_at ?? r.created_at, article_template_id: r.article_template_id });
      }
      return { acquisti, listini };
    },
  });
  // Per ogni materiale senza fornitore: da chi comprarlo, con la prova (listino, acquisto) e che cosa manca.
  const suggeriti = (() => {
    const esito = new Map<string, FornitoreProposto[]>();
    if (!puoScegliere || !storicoFornitori.data) return esito;
    const dati = { ...storicoFornitori.data, fornitori: fornitoriAzienda.data ?? [] };
    for (const r of filtrate) {
      if (r.supplier_id) continue;
      const proposti = proponiFornitori({ nome: r.name, unita: r.unita_misura }, dati, { oggi, quanti: 3 });
      if (proposti.length) esito.set(r.order_item_id, proposti);
    }
    return esito;
  })();
  const assegna = useMutation({
    mutationFn: async ({ ids, supplierId }: { ids: string[]; supplierId: string }) => {
      // Come nei materiali della commessa: chi modifica le commesse scrive la riga, l'ufficio acquisti
      // passa dalla sua funzione (vale per i materiali validati).
      const { error } = canEditOrders
        ? await supabase.from("order_items").update({ supplier_id: supplierId }).in("id", ids)
        : await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
          .rpc("acquisti_assegna_fornitore", { p_items: ids, p_fornitore: supplierId });
      if (error) throw error;
    },
    onSuccess: (_d, { ids, supplierId }) => {
      const nome = fornitoriAzienda.data?.find((f) => f.id === supplierId)?.name ?? "fornitore";
      toast.success(`${nome}: assegnato a ${ids.length} ${ids.length === 1 ? "materiale" : "materiali"}`, { description: "Le righe con dati confermati possono entrare nella bozza d'ordine." });
      void qc.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
      void qc.invalidateQueries({ queryKey: ["materiali-per-fase"] });
      void qc.invalidateQueries({ queryKey: ["piano-acquisti-computo"] });
    },
    onError: (e) => toast.error("Fornitore non assegnato", { description: e instanceof Error ? e.message : String(e) }),
  });
  const [conferma, setConferma] = useState(false);
  const ordina = useOrdinaDalFabbisogno();
  // Si contano solo le righe scelte che si vedono ancora e si possono ordinare.
  const righeScelte = filtrate.filter((r) => scelti.has(r.order_item_id) && ordinabile(r));
  const tutteScelte = filtrate.filter((r) => scelti.has(r.order_item_id) && selezionabile(r));
  const senzaFornitoreScelte = tutteScelte.filter((r) => !r.supplier_id).length;
  const bozze = gruppiDaOrdinare(righeScelte);
  const cambia = (id: string, si: boolean) => setScelti((prima) => {
    const dopo = new Set(prima);
    if (si) dopo.add(id); else dopo.delete(id);
    return dopo;
  });
  const sceltaGruppo = (rr: RigaFabbisogno[], si: boolean) => setScelti((prima) => {
    const dopo = new Set(prima);
    for (const r of rr) if (selezionabile(r)) { if (si) dopo.add(r.order_item_id); else dopo.delete(r.order_item_id); }
    return dopo;
  });

  const creaBozze = async () => {
    setConferma(false);
    try {
      const esiti = await ordina.mutateAsync(righeScelte);
      const fatte = esiti.filter((e) => e.ok);
      const ferme = esiti.filter((e): e is Extract<typeof e, { ok: false }> => !e.ok);
      if (fatte.length) toast.success(fatte.length === 1 ? "Creata 1 bozza d'ordine" : `Create ${fatte.length} bozze d'ordine`, {
        description: "Le trovi negli ordini fornitore: controllale e inviale.",
      });
      for (const e of ferme) toast.error(`${e.commessa ?? "Commessa"} · ${e.fornitore ?? "fornitore"}: bozza non creata`, { description: e.errore, duration: 12_000 });
      setScelti(new Set());
    } catch (e) {
      toast.error("Bozze non create", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const barraScelta = puoScegliere && tutteScelte.length > 0 ? (
    <div className={cn("flex flex-wrap items-center gap-2", !orderId && "ml-auto")}>
            <span className="text-sm text-muted-foreground">{tutteScelte.length} selezionati{senzaFornitoreScelte ? ` · ${senzaFornitoreScelte} senza fornitore` : ""}</span>
            {tutteScelte.some(r => r.verifica_acquisto?.stato === "da_verificare") && <span className="text-xs text-amber-800">{tutteScelte.filter(r => r.verifica_acquisto?.stato === "da_verificare").length} da completare · escluse dall'ordine</span>}
            <Button size="sm" variant="ghost" onClick={() => setScelti(new Set())}>Togli</Button>
            <Select value="" onValueChange={(id) => assegna.mutate({ ids: tutteScelte.map((r) => r.order_item_id), supplierId: id })} disabled={assegna.isPending}>
              <SelectTrigger className="h-9 w-52" aria-label="Assegna il fornitore ai materiali selezionati">
                <SelectValue placeholder={assegna.isPending ? "Assegno…" : "Assegna fornitore…"} />
              </SelectTrigger>
              <SelectContent>
                {(fornitoriAzienda.data ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {puoOrdinare && (
              <Button size="sm" onClick={() => setConferma(true)} disabled={ordina.isPending || righeScelte.length === 0}
                title={righeScelte.length === 0 ? "Completa i dati tecnici e assegna il fornitore alle righe da ordinare" : undefined}>
                {ordina.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="mr-1 h-4 w-4" aria-hidden />}
                {righeScelte.length === 0 ? "Crea la bozza d'ordine" : bozze.length === 1 ? "Crea la bozza d'ordine" : `Crea ${bozze.length} bozze d'ordine`}
              </Button>
            )}
          </div>
  ) : null;

  // Dal telefono il fabbisogno non si usa (decisione del founder, 23/11/2026): chi arriva qui da
  // un link vede dove trovarlo da tablet o computer.
  if (telefono && !inFinestra) {
    return (
      <div className="space-y-3 p-4">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold"><CalendarClock className="h-5 w-5" aria-hidden /> Fabbisogno materiali</h1>
        <p className="text-sm text-muted-foreground">
          Si usa da tablet o computer: lo trovi in <strong className="text-foreground">Acquisti → Fabbisogno</strong>, in alto a destra,
          oppure dentro la commessa, scheda <strong className="text-foreground">Materiali → Fabbisogno</strong>.
        </p>
        <Button asChild variant="outline" size="sm"><Link to="/azienda/ordini?tab=acquisto">Vai agli acquisti</Link></Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", !inFinestra && "mx-auto max-w-6xl p-3 sm:p-6")}>
      {!inFinestra && <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold max-sm:text-[17px]"><CalendarClock className="h-5 w-5" aria-hidden /> Fabbisogno materiali</h1>
          <p className="text-sm text-muted-foreground max-lg:hidden">
            Cosa manca da ordinare nelle commesse, ed entro quando: l'inizio della fase (o la data scritta sul materiale)
            meno i giorni di consegna del fornitore. Se usi la validazione del tecnico, solo le fasi validate.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="max-sm:h-8 max-sm:px-2.5 max-sm:text-xs">
          <Link to="/azienda/impostazioni/acquisti-materiali"><span className="sm:hidden">Consegne</span><span className="max-sm:hidden">Giorni di consegna e promemoria</span></Link>
        </Button>
      </header>}

      {effectiveCompany?.id && <EccezioniOperative key={effectiveCompany.id + (orderId ?? "")}
        companyId={effectiveCompany.id} tipo="cantiere" commessaId={orderId} />}

      {!orderId && <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
      <div className="flex flex-wrap gap-2" role="list" aria-label="Riepilogo">
        {(["ritardo", "settimana", "mese", "dopo", "senza_data", "da_verificare"] as Urgenza[]).map((u) => (
          <span key={u} role="listitem" className={cn("rounded-md border px-2.5 py-1 text-sm", COLORE[u], conta(u) === 0 && "hidden")}>
            <strong className="tabular-nums">{conta(u)}</strong> {ETICHETTA_URGENZA[u].toLowerCase()}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2">
        {<Select value={commessa} onValueChange={setCommessa}>
          <SelectTrigger className="h-9 w-56 max-sm:w-full" aria-label="Commessa"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le commesse</SelectItem>
            {commesse.map(([id, codice]) => <SelectItem key={id} value={id}>{codice}</SelectItem>)}
          </SelectContent>
        </Select>}
        <Select value={fornitore} onValueChange={setFornitore}>
          <SelectTrigger className="h-9 w-56 max-sm:w-full" aria-label="Fornitore"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i fornitori</SelectItem>
            {fornitori.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {barraScelta}
      </div>
      </div>}

      <AlertDialog open={conferma} onOpenChange={setConferma}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bozze.length === 1 ? "Una bozza d'ordine" : `${bozze.length} bozze d'ordine`}</AlertDialogTitle>
            <AlertDialogDescription>
              Un ordine per ogni commessa e fornitore, con quanto manca adesso (ricalcolato al momento). Restano bozze: niente parte
              al fornitore finché non le invii.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
            {bozze.map((b) => (
              <li key={`${b.orderId}:${b.supplierId}`} className="flex justify-between gap-3">
                <span className="truncate">{b.commessa ?? "—"} · {b.fornitore ?? "—"}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{b.ids.length} {b.ids.length === 1 ? "materiale" : "materiali"}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={creaBozze}>Crea</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calcolo il fabbisogno…</p>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-2">
            Non riesco a leggere il fabbisogno. <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
          </AlertDescription>
        </Alert>
      ) : gruppi.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">Niente da ordinare</p>
          <p className="text-xs text-muted-foreground">
            Qui compaiono i materiali delle commesse non ancora coperti da un ordine (con la validazione del tecnico, solo delle fasi validate).
          </p>
        </div>
      ) : orderId ? (
        <>
        {puoScegliere && storicoFornitori.isError && (
          <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Non riesco a leggere listini e ordini: i fornitori proposti non sono disponibili.{" "}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => storicoFornitori.refetch()}>Riprova</button>
          </p>
        )}
        <VistaPerFasi righe={filtrate} tutte={tutteLeRighe} oggi={oggi} scelti={scelti} cambia={cambia} sceltaGruppo={sceltaGruppo}
          puoScegliere={puoScegliere} puoDatare={puoDatare} barra={barraScelta}
          suggeriti={suggeriti}
          assegnaSuggerito={(ids, supplierId) => assegna.mutate({ ids, supplierId })} assegnando={assegna.isPending} />
        </>
      ) : (
        <>
          {righe.length >= 500 && (
            <p className="text-xs text-muted-foreground">Si vedono i primi 500 materiali, i più urgenti: filtra per commessa o fornitore per gli altri.</p>
          )}
          {(orderId ? raggruppaPerFase(filtrate, oggi).map((g) => ({ chiave: `fase-${g.fase}`, titolo: g.fase, righe: g.righe, ritardo: g.ritardo, settimana: g.settimana, colore: "" }))
            : gruppi.map((g) => ({ chiave: g.urgenza, titolo: ETICHETTA_URGENZA[g.urgenza], righe: g.righe, ritardo: 0, settimana: 0, colore: COLORE[g.urgenza] })))
            .map((g) => {
            const sceglibili = g.righe.filter(selezionabile);
            const tutti = sceglibili.length > 0 && sceglibili.every((r) => scelti.has(r.order_item_id));
            return (
              <section key={g.chiave} aria-labelledby={`fabbisogno-${g.chiave}`} className="rounded-lg border bg-card">
                <h2 id={`fabbisogno-${g.chiave}`} className={cn("flex flex-wrap items-center gap-2 rounded-t-lg border-b px-3 py-2 text-sm font-semibold", g.colore || "bg-muted/40")}>
                  {puoScegliere && sceglibili.length > 0 && (
                    <Checkbox checked={tutti} onCheckedChange={(v) => sceltaGruppo(g.righe, v === true)}
                      aria-label={`Seleziona i materiali da ordinare: ${g.titolo}`} />
                  )}
                  {g.titolo} · {g.righe.length}
                  {g.ritardo > 0 && <span className="rounded-full bg-red-100 px-2 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">{g.ritardo} in ritardo</span>}
                  {g.settimana > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{g.settimana} entro 7 giorni</span>}
                </h2>
                <ul className="divide-y">
                  {(telefono && !gruppiAperti.has(g.chiave) ? g.righe.slice(0, RIGHE_TELEFONO) : g.righe).map((r) => (
                    <Riga key={r.order_item_id} r={r} oggi={oggi} puoDatare={puoDatare} inCommessa={!!orderId}
                      scelta={puoScegliere && selezionabile(r) ? { si: scelti.has(r.order_item_id), cambia: (v) => cambia(r.order_item_id, v) } : null} />
                  ))}
                </ul>
                {telefono && !gruppiAperti.has(g.chiave) && g.righe.length > RIGHE_TELEFONO && (
                  <button type="button" onClick={() => setGruppiAperti((a) => new Set(a).add(g.chiave))}
                    className="w-full border-t px-3 py-2.5 text-sm font-medium text-primary">
                    Mostra tutti ({g.righe.length})
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

const COLORE_DATA: Record<Urgenza, string> = {
  ritardo: "text-red-700 dark:text-red-300", settimana: "text-amber-700 dark:text-amber-300", mese: "text-foreground",
  dopo: "text-muted-foreground", senza_data: "text-muted-foreground", da_verificare: "text-violet-700 dark:text-violet-300",
};
const piuGiorni = (iso: string, g: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + g); return d.toLocaleDateString("en-CA"); };

/**
 * Il fabbisogno di una commessa, una fase alla volta (17/11/2026): a sinistra le fasi con quello che
 * urge, a destra i materiali della fase divisi per fornitore («senza fornitore» per primo), un solo
 * avviso per i ritardi, righe asciutte (i dettagli si aprono dalla data) e la barra delle azioni in fondo.
 */
function VistaPerFasi({ righe, tutte, oggi, scelti, cambia, sceltaGruppo, puoScegliere, puoDatare, barra, suggeriti, assegnaSuggerito, assegnando }: {
  righe: RigaFabbisogno[];
  /** Anche le righe già coperte: per «ordinati X su Y». */
  tutte: RigaFabbisogno[];
  oggi: string;
  scelti: Set<string>;
  cambia: (id: string, si: boolean) => void;
  sceltaGruppo: (rr: RigaFabbisogno[], si: boolean) => void;
  puoScegliere: boolean;
  puoDatare: boolean;
  barra: ReactNode;
  suggeriti: Map<string, FornitoreProposto[]>;
  assegnaSuggerito: (ids: string[], supplierId: string) => void;
  assegnando: boolean;
}) {
  const fasi = raggruppaPerFase(righe, oggi);
  const avanzamento = avanzamentoFasi(tutte);
  // Le fasi già tutte ordinate restano in fondo all'elenco, spuntate: si vede che ci sono e che sono a posto.
  const complete = [...avanzamento.entries()].filter(([f, a]) => a.totale > 0 && !fasi.some((x) => x.fase === f)).map(([f]) => f);
  const [faseScelta, setFaseScelta] = useState<string | null>(null);
  const attiva = fasi.find((f) => f.fase === faseScelta) ?? (faseScelta && complete.includes(faseScelta) ? { fase: faseScelta, righe: [] as RigaFabbisogno[], ritardo: 0, settimana: 0 } : fasi[0]);
  if (!attiva) return null;
  const primaScadenza = (rr: RigaFabbisogno[]) => rr.map((r) => r.ordina_entro).filter((d): d is string => !!d).sort()[0] ?? null;
  const sottotitolo = (f: typeof attiva) => {
    const mancanti = f.righe.filter(r => r.verifica_acquisto?.stato === "da_verificare").length;
    const quanti = (f.righe.length - mancanti) + " da ordinare" + (mancanti ? " · " + mancanti + " da completare" : "");
    if (f.ritardo) return { testo: `${f.ritardo} in ritardo · ${quanti}`, colore: "text-red-700 dark:text-red-300" };
    const p = primaScadenza(f.righe);
    const quando = !p ? "senza data" : p <= oggi ? "entro oggi" : `entro ${data(p)}`;
    return { testo: `${quando} · ${quanti}`, colore: f.settimana ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground" };
  };
  const inizio = attiva.righe.map((r) => r.data_serve).filter((d): d is string => !!d).sort()[0] ?? null;
  const ritardo = attiva.righe.filter((r) => urgenza(r, oggi) === "ritardo");
  // Per non essere in ritardo la fase dovrebbe partire dopo l'arrivo del più lento fra quelli in ritardo.
  const spostaAl = ritardo.length ? piuGiorni(oggi, Math.max(...ritardo.map((r) => r.giorni_consegna ?? 7))) : null;
  const sceglibili = attiva.righe.filter(selezionabile);
  const tuttaScelta = sceglibili.length > 0 && sceglibili.every((r) => scelti.has(r.order_item_id));
  const perFornitore = [...attiva.righe.reduce((m, r) => m.set(r.fornitore ?? "", [...(m.get(r.fornitore ?? "") ?? []), r]), new Map<string, RigaFabbisogno[]>()).entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "it")));
  const diverse = differenze(attiva.righe);
  const totRitardo = fasi.reduce((t, f) => t + f.ritardo, 0);
  const totSettimana = fasi.reduce((t, f) => t + f.settimana, 0);
  const Barretta = ({ fase }: { fase: string }) => {
    const a = avanzamento.get(fase);
    if (!a?.totale) return null;
    return (
      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground" title={`${a.coperti} materiali su ${a.totale} già ordinati`}>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((a.coperti / a.totale) * 100)}%` }} />
        </span>
        <span className="tabular-nums">{a.coperti}/{a.totale}</span>
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">{righe.length} materiali</strong> da gestire in {fasi.length} {fasi.length === 1 ? "fase" : "fasi"}
        {righe.some(r => r.verifica_acquisto?.stato === "da_verificare") && <span className="ml-2 text-amber-800">· {righe.filter(r => r.verifica_acquisto?.stato === "da_verificare").length} da completare prima dell'acquisto</span>}
        {totRitardo > 0 && <> · <span className="text-red-700 dark:text-red-300">{totRitardo} in ritardo</span></>}
        {totSettimana > 0 && <> · <span className="text-amber-700 dark:text-amber-300">{totSettimana} entro 7 giorni</span></>}
        {complete.length > 0 && <> · <span className="text-emerald-700 dark:text-emerald-300">{complete.length} {complete.length === 1 ? "fase già ordinata" : "fasi già ordinate"}</span></>}
      </p>
      <div className="grid gap-3 rounded-lg border sm:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Fasi" className="flex gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
          {fasi.map((f) => {
            const sel = f.fase === attiva.fase;
            const st = sottotitolo(f);
            return (
              <button key={f.fase} type="button" onClick={() => setFaseScelta(f.fase)} aria-current={sel ? "true" : undefined}
                className={cn("w-48 shrink-0 rounded-md px-2.5 py-2 text-left text-sm transition-colors sm:w-full", sel ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted")}>
                <span className={cn("block font-medium", sel && "text-primary")}>{f.fase}</span>
                <span className={cn("block text-[11px]", st.colore)}>{st.testo}</span>
                <Barretta fase={f.fase} />
              </button>
            );
          })}
          {complete.map((f) => (
            <button key={f} type="button" onClick={() => setFaseScelta(f)} aria-current={f === attiva.fase ? "true" : undefined}
              className={cn("w-48 shrink-0 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors sm:w-full", f === attiva.fase ? "bg-muted" : "hover:bg-muted")}>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> {f}</span>
              <span className="block pl-5 text-[11px]">tutto ordinato</span>
            </button>
          ))}
        </nav>

        <section aria-label={`Materiali della fase ${attiva.fase}`} className="min-w-0 space-y-3 p-3 sm:pl-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold">{attiva.fase}</h3>
            {attiva.righe.length > 0 && <span className="text-xs text-muted-foreground">
              {inizio ? `inizio fase ${data(inizio)}` : "fase senza date"}{primaScadenza(attiva.righe) ? ` · ordina entro ${data(primaScadenza(attiva.righe))}` : ""}
            </span>}
            {puoScegliere && sceglibili.length > 0 && (
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => sceltaGruppo(attiva.righe, !tuttaScelta)}>
                {tuttaScelta ? "Togli la fase" : "Seleziona la fase"}
              </Button>
            )}
          </div>

          {attiva.righe.length === 0 && (
            <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-emerald-600" aria-hidden /> Tutti i materiali di questa fase sono già ordinati.
            </p>
          )}

          {ritardo.length > 0 && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {ritardo.length === 1 ? "1 materiale è già in ritardo" : `${ritardo.length} materiali sono già in ritardo`}: ordina oggi
              {spostaAl ? <>, oppure sposta l'inizio della fase al <strong>{data(spostaAl)}</strong> (in Cantiere → Lavorazioni)</> : null}.
            </p>
          )}

          {perFornitore.map(([fornitore, rr]) => {
            const sc = rr.filter(selezionabile);
            const tutti = sc.length > 0 && sc.every((r) => scelti.has(r.order_item_id));
            // Senza fornitore: le proposte raggruppate per fornitore, da assegnare con un clic.
            const proposte = fornitore ? [] : [...sc.reduce((m, r) => {
              const s = suggeriti.get(r.order_item_id)?.[0];
              if (s) m.set(s.supplier_id, { fornitore: s.fornitore, ids: [...(m.get(s.supplier_id)?.ids ?? []), r.order_item_id] });
              return m;
            }, new Map<string, { fornitore: string; ids: string[] }>()).entries()].sort((a, b) => b[1].ids.length - a[1].ids.length);
            return (
              <div key={fornitore || "_nessuno"} className="space-y-1">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {puoScegliere && sc.length > 0 && (
                    <Checkbox checked={tutti} onCheckedChange={(v) => sceltaGruppo(rr, v === true)} aria-label={`Seleziona: ${fornitore || "senza fornitore"}`} />
                  )}
                  <span className={fornitore ? "" : "text-amber-700 dark:text-amber-300"}>{fornitore || "Senza fornitore"} · {rr.length}</span>
                </p>
                {proposte.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                    <span className="text-muted-foreground">Da chi comprarli:</span>
                    {proposte.slice(0, 4).map(([id, p]) => (
                      <Button key={id} size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={assegnando}
                        onClick={() => assegnaSuggerito(p.ids, id)} title={`Assegna ${p.fornitore} a ${p.ids.length} materiali di questa fase`}>
                        {p.fornitore} · {p.ids.length} <ArrowRight className="ml-1 h-3 w-3" aria-hidden /> Assegna
                      </Button>
                    ))}
                  </div>
                )}
                <ul className="divide-y rounded-md border">
                  {rr.map((r) => (
                    <RigaCompatta key={r.order_item_id} r={r} oggi={oggi} puoDatare={puoDatare} differenza={diverse.get(r.order_item_id) ?? null}
                      proposti={fornitore ? [] : suggeriti.get(r.order_item_id) ?? []}
                      assegna={assegnando ? null : (supplierId) => assegnaSuggerito([r.order_item_id], supplierId)}
                      scelta={puoScegliere && selezionabile(r) ? { si: scelti.has(r.order_item_id), cambia: (v) => cambia(r.order_item_id, v) } : null} />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      {/* La barra delle azioni resta in fondo alla finestra mentre si scorre. */}
      <div className="sticky -bottom-6 -mx-6 -mb-6 border-t bg-background px-6 py-2.5">
        {barra ?? <p className="text-xs text-muted-foreground">Spunta i materiali per assegnare il fornitore o creare la bozza d'ordine.</p>}
      </div>
    </div>
  );
}

function RigaCompatta({ r, oggi, puoDatare, scelta, differenza, proposti = [], assegna = null }: {
  r: RigaFabbisogno;
  oggi: string;
  puoDatare: boolean;
  scelta: { si: boolean; cambia: (v: boolean) => void } | null;
  /** Il pezzo di descrizione che la distingue da righe col nome uguale. */
  differenza: string | null;
  /** I fornitori proposti, dal più adatto, ognuno con la prova e che cosa manca. */
  proposti?: FornitoreProposto[];
  assegna?: ((supplierId: string) => void) | null;
}) {
  const proposto = proposti[0] ?? null;
  const [aperta, setAperta] = useState(false);
  const u = urgenza(r, oggi);
  const unita = r.unita_misura ?? "pz";
  const stato = r.stato === "da_ordinare" ? null : (ETICHETTA_STATO_MATERIALE[r.stato as StatoMateriale] ?? r.stato);
  const { titolo, accorciato } = nomeBreve(r.name);
  return (
    <li className="px-3 py-2 text-sm">
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_6.5rem] items-center gap-2">
        <span>{scelta && <Checkbox checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${titolo}`} />}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium" title={r.name}>{titolo}</span>
          {(differenza || stato) && (
            <span className="block truncate text-[11px] text-muted-foreground">{[differenza, stato].filter(Boolean).join(" · ")}</span>
          )}
          {proposto && (
            <span className="block truncate text-[11px] text-muted-foreground"
              title={[`${proposto.fornitore}: ${proposto.motivo}`, proposto.mancano.length ? `Manca: ${proposto.mancano.join("; ")}` : null].filter(Boolean).join("\n")}>
              <span className={proposto.livello === "stesso_articolo" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>{proposto.fornitore}</span>
              {" · "}{proposto.motivo}{proposto.mancano.length > 0 && ` · manca: ${proposto.mancano[0]}`}{proposti.length > 1 && ` · +${proposti.length - 1} ${proposti.length === 2 ? "altro" : "altri"}`}
            </span>
          )}
          {r.unita_diversa && <span className="flex items-center gap-1 text-[11px] text-violet-700 dark:text-violet-300"><AlertTriangle className="h-3 w-3" aria-hidden /> Ordine in un'altra unità</span>}
          <VerificaNelFabbisogno r={r} />
        </span>
        <span className="whitespace-nowrap text-right tabular-nums text-xs">{r.residuo > 0 ? `${numero(r.residuo)} ${unita}` : r.eccedenza > 0 ? `+${numero(r.eccedenza)} ${unita}` : ""}</span>
        <button type="button" onClick={() => setAperta((v) => !v)} aria-expanded={aperta}
          className={cn("whitespace-nowrap rounded px-1 text-right text-xs tabular-nums underline-offset-2 hover:underline", COLORE_DATA[u])}
          aria-label={`Dettagli di ${titolo}: ordina entro ${data(r.ordina_entro)}`}>
          {r.ordina_entro ? data(r.ordina_entro) : "senza data"}
        </button>
      </div>
      {aperta && (
        <div className="mt-1.5 space-y-1 pl-7 text-xs text-muted-foreground">
          {accorciato && <p className="whitespace-pre-line text-foreground/80">{r.name}</p>}
          {proposti.length > 0 && (
            <ul aria-label={`Fornitori proposti per ${titolo}`} className="divide-y rounded-md border bg-background">
              {proposti.map((p) => (
                <li key={p.supplier_id} className="flex items-start justify-between gap-3 px-2 py-1.5">
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{p.fornitore}</span>
                    <span className={cn("ml-2", p.livello === "stesso_articolo" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{ETICHETTA_LIVELLO[p.livello]}</span>
                    <span className="block">{p.motivo}{p.consegna_giorni != null ? ` · consegna ${p.consegna_giorni} gg` : ""}{p.ordine_minimo ? ` · ordine minimo ${numero(p.ordine_minimo)} €` : ""}</span>
                    {p.mancano.length > 0 && <span className="block text-amber-800 dark:text-amber-300">Manca: {p.mancano.join("; ")}</span>}
                  </span>
                  {assegna && <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" onClick={() => assegna(p.supplier_id)}>Assegna</Button>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span>{testoLimite(r.ordina_entro, oggi)}{r.giorni_consegna != null ? ` · consegna ${r.giorni_consegna} gg` : ""}</span>
            <DataServe key={r.data_scritta ?? ""} r={r} puoDatare={puoDatare} />
          </div>
        </div>
      )}
    </li>
  );
}

const BORDO_URGENZA: Record<Urgenza, string> = {
  ritardo: "border-l-red-500", settimana: "border-l-amber-400", mese: "border-l-sky-300", dopo: "border-l-transparent",
  senza_data: "border-l-transparent", da_verificare: "border-l-violet-300",
};

function VerificaNelFabbisogno({ r }: { r: RigaFabbisogno }) {
  const [aperta, setAperta] = useState(false);
  const { canEditOrders } = usePermissions();
  if (r.verifica_acquisto?.stato !== "da_verificare") return null;
  return <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-800">
    <span>Quantità o prodotto da confermare</span>
    {canEditOrders && r.dati_verifica && <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-amber-800" onClick={() => setAperta(true)} aria-label={"Completa dati di " + r.name}>Completa i dati</Button>}
    {aperta && r.dati_verifica && <VerificaDatiMaterialeDialog m={r.dati_verifica} aperto onAperto={setAperta} />}
  </span>;
}

function Riga({ r, oggi, puoDatare, scelta, inCommessa }: {
  r: RigaFabbisogno;
  oggi: string;
  puoDatare: boolean;
  scelta: { si: boolean; cambia: (v: boolean) => void } | null;
  /** Nella finestra della commessa: niente commessa nella riga, niente rimando ai materiali. */
  inCommessa: boolean;
}) {
  const unita = r.unita_misura ?? "pz";
  const stato = ETICHETTA_STATO_MATERIALE[r.stato as StatoMateriale] ?? r.stato;
  const u = urgenza(r, oggi);
  return (
    <li className={cn("grid gap-x-3 gap-y-1 border-l-4 px-3 py-2 text-sm max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:items-center lg:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.1fr)_auto_auto] lg:items-center", BORDO_URGENZA[u])}>
      <div className="hidden w-4 lg:block">
        {scelta && <Checkbox checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${r.name} (${r.commessa ?? "commessa"})`} />}
      </div>
      {/* Telefono: nome e quantità a tutta larghezza, poi «Ordina entro» con stato e «Apri» sulla stessa riga. */}
      <div className="min-w-0 max-lg:col-span-2">
        <p className="flex items-start gap-2 font-medium">
          {scelta && <Checkbox className="mt-0.5 lg:hidden" checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${r.name}`} />}
          <span className="line-clamp-2" title={r.name}>{r.name}</span>
        </p>
        <VerificaNelFabbisogno r={r} />
        <p className="truncate text-xs text-muted-foreground">
          {inCommessa ? "" : `${r.commessa ?? "—"}${r.fase ? ` · ${r.fase}` : ""} · `}
          {r.fornitore ? r.fornitore : <span className="text-amber-700 dark:text-amber-300">senza fornitore</span>}
        </p>
      </div>
      <div className="text-xs text-muted-foreground max-lg:col-span-2 max-lg:empty:hidden">
        {r.residuo > 0 ? (
          <span>Da ordinare <strong className="tabular-nums text-foreground">{numero(r.residuo)} {unita}</strong>{r.residuo !== r.previsto ? <> su {numero(r.previsto)}</> : null}</span>
        ) : r.eccedenza > 0 ? (
          <span className="text-violet-700 dark:text-violet-300">Ordinati {numero(r.eccedenza)} {unita} in più del previsto</span>
        ) : null}
        {r.unita_diversa && (
          <span className="flex items-center gap-1 text-violet-700 dark:text-violet-300"><AlertTriangle className="h-3 w-3" aria-hidden /> Ordine in un'altra unità: verifica</span>
        )}
      </div>
      <div className="text-xs tabular-nums lg:text-right">
        <p>
          {u === "ritardo" && <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Ordina subito</span>}
          Ordina entro <strong>{data(r.ordina_entro)}</strong>
        </p>
        <p className="text-muted-foreground max-sm:hidden">{testoLimite(r.ordina_entro, oggi)}{r.giorni_consegna != null ? ` · consegna ${r.giorni_consegna} gg` : ""}</p>
        {/* La chiave fa ripartire il campo quando la data cambia dal server. Telefono: la data
            «serve il» si cambia da tablet o dalla commessa; qui resta la scadenza dell'ordine. */}
        <div className="max-sm:hidden"><DataServe key={r.data_scritta ?? ""} r={r} puoDatare={puoDatare} /></div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <Badge variant="secondary" className="whitespace-nowrap font-normal">{stato}</Badge>
        {!inCommessa && (
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Link to={linkMateriali(r)}>Apri <ArrowRight className="ml-1 h-3 w-3" aria-hidden /></Link>
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * «Serve il»: la data in cui il materiale serve in cantiere. Il campo mostra
 * solo la data scritta a mano: vuoto vuol dire che il materiale segue l'inizio
 * della fase, e lo dice accanto. Si salva quando si esce dal campo, non a ogni
 * tasto.
 */
function DataServe({ r, puoDatare }: { r: RigaFabbisogno; puoDatare: boolean }) {
  const imposta = useImpostaDataFabbisogno();
  const scritta = r.data_scritta ?? null;
  const [valore, setValore] = useState(scritta ?? "");
  const [aperto, setAperto] = useState(false);
  if (!puoDatare) return <p className="text-muted-foreground">Serve il {data(r.data_serve)}</p>;
  const salva = () => {
    const nuova = valore || null;
    if (nuova === scritta) return;
    imposta.mutate({ ids: [r.order_item_id], data: nuova }, {
      onSuccess: () => toast.success(nuova ? `${r.name}: serve il ${data(nuova)}` : `${r.name}: serve all'inizio della fase`),
      onError: (e) => { setValore(scritta ?? ""); toast.error("Data non salvata", { description: e instanceof Error ? e.message : String(e) }); },
    });
  };
  // Chiuso è una riga: «serve il 15 dic (inizio fase)»; si apre il campo solo per cambiarla.
  if (!aperto) {
    return (
      <button type="button" onClick={() => setAperto(true)} className="mt-0.5 text-muted-foreground underline-offset-2 hover:underline sm:text-right"
        aria-label={`Cambia quando serve ${r.name} in cantiere`}>
        Serve il {data(scritta ?? r.data_serve)}{scritta ? "" : " (inizio fase)"}
      </button>
    );
  }
  return (
    <div className="mt-1 text-muted-foreground sm:text-right">
      <label className="flex items-center gap-1 sm:justify-end">
        Serve il
        <Input type="date" value={valore} autoFocus onChange={(e) => setValore(e.target.value)} onBlur={() => { salva(); setAperto(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          disabled={imposta.isPending} className="h-7 w-[8.5rem] px-1 text-xs" aria-label={`Quando serve ${r.name} in cantiere`} />
      </label>
      {!scritta && r.data_serve && <p className="text-[11px]">Vuoto: segue l'inizio fase ({data(r.data_serve)})</p>}
    </div>
  );
}
