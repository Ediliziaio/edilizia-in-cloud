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
import { usePermissions } from "@/hooks/usePermissions";
import { gruppiDaOrdinare, ordinabile } from "@/lib/acquisti/ordinaDalFabbisogno";
import { apertaFabbisogno, avanzamentoFasi, differenze, nomeBreve, suggerisciFornitori, ETICHETTA_URGENZA, linkMateriali, raggruppaPerFase, raggruppaPerUrgenza, selezionabile, testoLimite, urgenza, type FornitoreStorico, type RigaFabbisogno, type Urgenza } from "@/lib/acquisti/fabbisogno";
import { ETICHETTA_STATO_MATERIALE, type StatoMateriale } from "@/lib/distinta/statoMateriale";
import { cn } from "@/lib/utils";

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

  const { canManagePurchasing, canEditOrders } = usePermissions();
  const puoOrdinare = canManagePurchasing;
  const puoDatare = canManagePurchasing || canEditOrders;
  // Si spunta anche senza fornitore (17/11/2026): prima si assegna il fornitore, poi si ordina.
  const puoScegliere = canManagePurchasing || canEditOrders;
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const fornitoriAzienda = useQuery({
    queryKey: ["fornitori-azienda-elenco", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && puoScegliere,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("company_id", effectiveCompany!.id).order("name").limit(2000);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  // Per proporre il fornitore ai materiali che non l'hanno: cosa l'azienda ha già comprato e da chi, e i listini attivi.
  const storicoFornitori = useQuery({
    queryKey: ["fornitori-storico-materiali", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && !!orderId && puoScegliere,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const nomi = new Map((fornitoriAzienda.data ?? []).map((f) => [f.id, f.name]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [acq, lis] = await Promise.all([
        db.from("order_items").select("name, supplier_id, suppliers(name), orders!inner(company_id)")
          .eq("orders.company_id", effectiveCompany!.id).not("supplier_id", "is", null).order("created_at", { ascending: false }).limit(1500),
        db.from("listino_fornitore_voci").select("descrizione, listini_fornitore!inner(supplier_id, attivo, suppliers(name))")
          .eq("company_id", effectiveCompany!.id).eq("listini_fornitore.attivo", true).limit(3000),
      ]);
      const storico: FornitoreStorico[] = [];
      for (const r of (acq.data ?? []) as { name: string; supplier_id: string; suppliers: { name: string } | null }[]) {
        storico.push({ nome: r.name, supplier_id: r.supplier_id, fornitore: r.suppliers?.name ?? nomi.get(r.supplier_id) ?? "Fornitore" });
      }
      // Una voce di listino vale più di un acquisto passato: è il fornitore che quel materiale lo vende.
      for (const v of (lis.data ?? []) as { descrizione: string; listini_fornitore: { supplier_id: string; suppliers: { name: string } | null } }[]) {
        storico.push({ nome: v.descrizione, supplier_id: v.listini_fornitore.supplier_id, fornitore: v.listini_fornitore.suppliers?.name ?? "Fornitore", peso: 3 });
      }
      return storico;
    },
  });
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
      toast.success(`${nome}: assegnato a ${ids.length} ${ids.length === 1 ? "materiale" : "materiali"}`, { description: "Ora puoi creare la bozza d'ordine." });
      void qc.invalidateQueries({ queryKey: ["fabbisogno-materiali"] });
      void qc.invalidateQueries({ queryKey: ["materiali-per-fase"] });
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
                title={righeScelte.length === 0 ? "Assegna prima il fornitore" : undefined}>
                {ordina.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="mr-1 h-4 w-4" aria-hidden />}
                {righeScelte.length === 0 ? "Crea la bozza d'ordine" : bozze.length === 1 ? "Crea la bozza d'ordine" : `Crea ${bozze.length} bozze d'ordine`}
              </Button>
            )}
          </div>
  ) : null;

  return (
    <div className={cn("space-y-4", !inFinestra && "mx-auto max-w-6xl p-3 sm:p-6")}>
      {!inFinestra && <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarClock className="h-5 w-5" aria-hidden /> Fabbisogno materiali</h1>
          <p className="text-sm text-muted-foreground">
            Cosa manca da ordinare nelle commesse, ed entro quando: l'inizio della fase (o la data scritta sul materiale)
            meno i giorni di consegna del fornitore. Se usi la validazione del tecnico, solo le fasi validate.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/azienda/impostazioni/acquisti-materiali">Giorni di consegna e promemoria</Link>
        </Button>
      </header>}

      {!orderId && <div className="flex flex-wrap gap-2" role="list" aria-label="Riepilogo">
        {(["ritardo", "settimana", "mese", "dopo", "senza_data", "da_verificare"] as Urgenza[]).map((u) => (
          <span key={u} role="listitem" className={cn("rounded-md border px-2.5 py-1 text-sm", COLORE[u])}>
            <strong className="tabular-nums">{conta(u)}</strong> {ETICHETTA_URGENZA[u].toLowerCase()}
          </span>
        ))}
      </div>}

      {!orderId && <div className="flex flex-wrap items-center gap-2">
        {<Select value={commessa} onValueChange={setCommessa}>
          <SelectTrigger className="h-9 w-56" aria-label="Commessa"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le commesse</SelectItem>
            {commesse.map(([id, codice]) => <SelectItem key={id} value={id}>{codice}</SelectItem>)}
          </SelectContent>
        </Select>}
        <Select value={fornitore} onValueChange={setFornitore}>
          <SelectTrigger className="h-9 w-56" aria-label="Fornitore"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i fornitori</SelectItem>
            {fornitori.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {barraScelta}
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
        <VistaPerFasi righe={filtrate} tutte={tutteLeRighe} oggi={oggi} scelti={scelti} cambia={cambia} sceltaGruppo={sceltaGruppo}
          puoScegliere={puoScegliere} puoDatare={puoDatare} barra={barraScelta}
          suggeriti={puoScegliere ? suggerisciFornitori(filtrate, storicoFornitori.data ?? []) : new Map()}
          assegnaSuggerito={(ids, supplierId) => assegna.mutate({ ids, supplierId })} assegnando={assegna.isPending} />
      ) : (
        <>
          {righe.length >= 500 && (
            <Alert><AlertDescription className="text-xs">Si vedono i primi 500 materiali, i più urgenti: filtra per commessa o fornitore per gli altri.</AlertDescription></Alert>
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
                  {g.righe.map((r) => (
                    <Riga key={r.order_item_id} r={r} oggi={oggi} puoDatare={puoDatare} inCommessa={!!orderId}
                      scelta={puoScegliere && selezionabile(r) ? { si: scelti.has(r.order_item_id), cambia: (v) => cambia(r.order_item_id, v) } : null} />
                  ))}
                </ul>
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
  suggeriti: Map<string, { supplier_id: string; fornitore: string }>;
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
    if (f.ritardo) return { testo: `${f.ritardo} in ritardo · ${f.righe.length} da ordinare`, colore: "text-red-700 dark:text-red-300" };
    const p = primaScadenza(f.righe);
    const quando = !p ? "senza data" : p <= oggi ? "entro oggi" : `entro ${data(p)}`;
    return { testo: `${quando} · ${f.righe.length} da ordinare`, colore: f.settimana ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground" };
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
        <strong className="text-foreground">{righe.length} materiali</strong> da ordinare in {fasi.length} {fasi.length === 1 ? "fase" : "fasi"}
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
              const s = suggeriti.get(r.order_item_id);
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
                    <span className="text-muted-foreground">Di solito li prendi da:</span>
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
                      proposto={fornitore ? null : suggeriti.get(r.order_item_id)?.fornitore ?? null}
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

function RigaCompatta({ r, oggi, puoDatare, scelta, differenza, proposto }: {
  r: RigaFabbisogno;
  oggi: string;
  puoDatare: boolean;
  scelta: { si: boolean; cambia: (v: boolean) => void } | null;
  /** Il pezzo di descrizione che la distingue da righe col nome uguale. */
  differenza: string | null;
  proposto: string | null;
}) {
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
          {(differenza || stato || proposto) && (
            <span className="block truncate text-[11px] text-muted-foreground">
              {[differenza, stato, proposto ? `di solito da ${proposto}` : null].filter(Boolean).join(" · ")}
            </span>
          )}
          {r.unita_diversa && <span className="flex items-center gap-1 text-[11px] text-violet-700 dark:text-violet-300"><AlertTriangle className="h-3 w-3" aria-hidden /> Ordine in un'altra unità</span>}
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
    <li className={cn("grid gap-x-3 gap-y-1 border-l-4 px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.1fr)_auto_auto] sm:items-center", BORDO_URGENZA[u])}>
      <div className="hidden w-4 sm:block">
        {scelta && <Checkbox checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${r.name} (${r.commessa ?? "commessa"})`} />}
      </div>
      <div className="min-w-0">
        <p className="flex items-start gap-2 font-medium">
          {scelta && <Checkbox className="mt-0.5 sm:hidden" checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${r.name}`} />}
          <span className="line-clamp-2" title={r.name}>{r.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {inCommessa ? "" : `${r.commessa ?? "—"}${r.fase ? ` · ${r.fase}` : ""} · `}
          {r.fornitore ? r.fornitore : <span className="text-amber-700 dark:text-amber-300">senza fornitore</span>}
        </p>
      </div>
      <div className="text-xs text-muted-foreground">
        {r.residuo > 0 ? (
          <span>Da ordinare <strong className="tabular-nums text-foreground">{numero(r.residuo)} {unita}</strong>{r.residuo !== r.previsto ? <> su {numero(r.previsto)}</> : null}</span>
        ) : r.eccedenza > 0 ? (
          <span className="text-violet-700 dark:text-violet-300">Ordinati {numero(r.eccedenza)} {unita} in più del previsto</span>
        ) : null}
        {r.unita_diversa && (
          <span className="flex items-center gap-1 text-violet-700 dark:text-violet-300"><AlertTriangle className="h-3 w-3" aria-hidden /> Ordine in un'altra unità: verifica</span>
        )}
      </div>
      <div className="text-xs tabular-nums sm:text-right">
        <p>
          {u === "ritardo" && <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Ordina subito</span>}
          Ordina entro <strong>{data(r.ordina_entro)}</strong>
        </p>
        <p className="text-muted-foreground">{testoLimite(r.ordina_entro, oggi)}{r.giorni_consegna != null ? ` · consegna ${r.giorni_consegna} gg` : ""}</p>
        {/* La chiave fa ripartire il campo quando la data cambia dal server. */}
        <DataServe key={r.data_scritta ?? ""} r={r} puoDatare={puoDatare} />
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
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
