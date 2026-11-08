// /azienda/fabbisogno-materiali — l'ufficio acquisti: cosa manca da ordinare in
// tutte le commesse, e entro quando. Solo i materiali delle fasi validate dal
// tecnico. Ci porta anche il promemoria del mattino (materiali_promemoria_acquisti).
// Da qui si cambia la data in cui il materiale serve (materiali_data_fabbisogno_imposta)
// e si creano le bozze d'ordine su più commesse insieme (ordinaDalFabbisogno).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarClock, Loader2, PackageSearch, ShoppingCart } from "lucide-react";
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
import { ETICHETTA_URGENZA, linkMateriali, raggruppaPerUrgenza, testoLimite, type RigaFabbisogno, type Urgenza } from "@/lib/acquisti/fabbisogno";
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

export default function FabbisognoMateriali() {
  const { data: righe = [], isLoading, isError, refetch } = useFabbisognoMateriali();
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
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [conferma, setConferma] = useState(false);
  const ordina = useOrdinaDalFabbisogno();
  // Si contano solo le righe scelte che si vedono ancora e si possono ordinare.
  const righeScelte = filtrate.filter((r) => scelti.has(r.order_item_id) && ordinabile(r));
  const bozze = gruppiDaOrdinare(righeScelte);
  const cambia = (id: string, si: boolean) => setScelti((prima) => {
    const dopo = new Set(prima);
    if (si) dopo.add(id); else dopo.delete(id);
    return dopo;
  });
  const sceltaGruppo = (rr: RigaFabbisogno[], si: boolean) => setScelti((prima) => {
    const dopo = new Set(prima);
    for (const r of rr) if (ordinabile(r)) { if (si) dopo.add(r.order_item_id); else dopo.delete(r.order_item_id); }
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

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CalendarClock className="h-5 w-5" aria-hidden /> Fabbisogno materiali</h1>
          <p className="text-sm text-muted-foreground">
            Cosa manca da ordinare nelle commesse, ed entro quando: l'inizio della fase (o la data scritta sul materiale)
            meno i giorni di consegna del fornitore. Solo i materiali validati dal tecnico.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/azienda/impostazioni/acquisti-materiali">Giorni di consegna e promemoria</Link>
        </Button>
      </header>

      <div className="flex flex-wrap gap-2" role="list" aria-label="Riepilogo">
        {(["ritardo", "settimana", "mese", "dopo", "senza_data", "da_verificare"] as Urgenza[]).map((u) => (
          <span key={u} role="listitem" className={cn("rounded-md border px-2.5 py-1 text-sm", COLORE[u])}>
            <strong className="tabular-nums">{conta(u)}</strong> {ETICHETTA_URGENZA[u].toLowerCase()}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={commessa} onValueChange={setCommessa}>
          <SelectTrigger className="h-9 w-56" aria-label="Commessa"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le commesse</SelectItem>
            {commesse.map(([id, codice]) => <SelectItem key={id} value={id}>{codice}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fornitore} onValueChange={setFornitore}>
          <SelectTrigger className="h-9 w-56" aria-label="Fornitore"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti i fornitori</SelectItem>
            {fornitori.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {puoOrdinare && righeScelte.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{righeScelte.length} selezionati</span>
            <Button size="sm" variant="ghost" onClick={() => setScelti(new Set())}>Togli</Button>
            <Button size="sm" onClick={() => setConferma(true)} disabled={ordina.isPending}>
              {ordina.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <ShoppingCart className="mr-1 h-4 w-4" aria-hidden />}
              {bozze.length === 1 ? "Crea la bozza d'ordine" : `Crea ${bozze.length} bozze d'ordine`}
            </Button>
          </div>
        )}
      </div>

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
            Qui compaiono i materiali delle fasi validate dal tecnico che non sono ancora coperti da un ordine.
          </p>
        </div>
      ) : (
        <>
          {righe.length >= 500 && (
            <Alert><AlertDescription className="text-xs">Si vedono i primi 500 materiali, i più urgenti: filtra per commessa o fornitore per gli altri.</AlertDescription></Alert>
          )}
          {gruppi.map((g) => {
            const ordinabili = g.righe.filter(ordinabile);
            const tutti = ordinabili.length > 0 && ordinabili.every((r) => scelti.has(r.order_item_id));
            return (
              <section key={g.urgenza} aria-labelledby={`fabbisogno-${g.urgenza}`} className="rounded-lg border bg-card">
                <h2 id={`fabbisogno-${g.urgenza}`} className={cn("flex items-center gap-2 rounded-t-lg border-b px-3 py-2 text-sm font-semibold", COLORE[g.urgenza])}>
                  {puoOrdinare && ordinabili.length > 0 && (
                    <Checkbox checked={tutti} onCheckedChange={(v) => sceltaGruppo(g.righe, v === true)}
                      aria-label={`Seleziona i materiali da ordinare: ${ETICHETTA_URGENZA[g.urgenza]}`} />
                  )}
                  {ETICHETTA_URGENZA[g.urgenza]} · {g.righe.length}
                </h2>
                <ul className="divide-y">
                  {g.righe.map((r) => (
                    <Riga key={r.order_item_id} r={r} oggi={oggi} puoDatare={puoDatare}
                      scelta={puoOrdinare && ordinabile(r) ? { si: scelti.has(r.order_item_id), cambia: (v) => cambia(r.order_item_id, v) } : null} />
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

function Riga({ r, oggi, puoDatare, scelta }: {
  r: RigaFabbisogno;
  oggi: string;
  puoDatare: boolean;
  scelta: { si: boolean; cambia: (v: boolean) => void } | null;
}) {
  const unita = r.unita_misura ?? "pz";
  const stato = ETICHETTA_STATO_MATERIALE[r.stato as StatoMateriale] ?? r.stato;
  return (
    <li className="grid gap-x-3 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.2fr)_auto_auto] sm:items-center">
      <div className="hidden w-4 sm:block">
        {scelta && <Checkbox checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${r.name} (${r.commessa ?? "commessa"})`} />}
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-2 truncate font-medium">
          {scelta && <Checkbox className="sm:hidden" checked={scelta.si} onCheckedChange={(v) => scelta.cambia(v === true)} aria-label={`Seleziona ${r.name}`} />}
          {r.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {r.commessa ?? "—"}{r.fase ? ` · ${r.fase}` : ""}{r.fornitore ? ` · ${r.fornitore}` : " · senza fornitore"}
        </p>
      </div>
      <div className="text-xs text-muted-foreground">
        {r.residuo > 0 ? (
          <span>Da ordinare <strong className="tabular-nums text-foreground">{numero(r.residuo)} {unita}</strong> su {numero(r.previsto)}</span>
        ) : r.eccedenza > 0 ? (
          <span className="text-violet-700 dark:text-violet-300">Ordinati {numero(r.eccedenza)} {unita} in più del previsto</span>
        ) : null}
        {r.unita_diversa && (
          <span className="flex items-center gap-1 text-violet-700 dark:text-violet-300"><AlertTriangle className="h-3 w-3" aria-hidden /> Ordine in un'altra unità: verifica</span>
        )}
      </div>
      <div className="text-xs tabular-nums sm:text-right">
        <p>Ordina entro <strong>{data(r.ordina_entro)}</strong></p>
        <p className="text-muted-foreground">{testoLimite(r.ordina_entro, oggi)}{r.giorni_consegna != null ? ` · consegna ${r.giorni_consegna} gg` : ""}</p>
        {/* La chiave fa ripartire il campo quando la data cambia dal server. */}
        <DataServe key={r.data_serve ?? ""} r={r} puoDatare={puoDatare} />
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <Badge variant="secondary" className="whitespace-nowrap font-normal">{stato}</Badge>
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <Link to={linkMateriali(r)}>Ordina <ArrowRight className="ml-1 h-3 w-3" aria-hidden /></Link>
        </Button>
      </div>
    </li>
  );
}

/**
 * «Serve il»: la data in cui il materiale serve in cantiere. Vuota = l'inizio
 * della fase. Si salva quando si esce dal campo, non a ogni tasto.
 */
function DataServe({ r, puoDatare }: { r: RigaFabbisogno; puoDatare: boolean }) {
  const imposta = useImpostaDataFabbisogno();
  const [valore, setValore] = useState(r.data_serve ?? "");
  if (!puoDatare) return <p className="text-muted-foreground">Serve il {data(r.data_serve)}</p>;
  const salva = () => {
    const nuova = valore || null;
    if (nuova === (r.data_serve ?? null)) return;
    imposta.mutate({ ids: [r.order_item_id], data: nuova }, {
      onSuccess: () => toast.success(nuova ? `${r.name}: serve il ${data(nuova)}` : `${r.name}: serve all'inizio della fase`),
      onError: (e) => { setValore(r.data_serve ?? ""); toast.error("Data non salvata", { description: e instanceof Error ? e.message : String(e) }); },
    });
  };
  return (
    <label className="mt-1 flex items-center gap-1 text-muted-foreground sm:justify-end">
      Serve il
      <Input type="date" value={valore} onChange={(e) => setValore(e.target.value)} onBlur={salva}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        disabled={imposta.isPending} className="h-7 w-[8.5rem] px-1 text-xs" aria-label={`Quando serve ${r.name} in cantiere`} />
    </label>
  );
}
