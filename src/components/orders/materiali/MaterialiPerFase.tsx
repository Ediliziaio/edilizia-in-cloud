/**
 * Materiali della commessa divisi per fase di lavoro: ogni fase con il suo
 * avanzamento acquisti (da ordinare, in corso, ordinati, consegnati, importo),
 * lo stato della validazione del tecnico e le righe con quantità, unità,
 * specifiche, fornitore e stato. Azioni in blocco sulla selezione o sulla
 * fase: fornitore, fase, richiesta d'offerta, ordine.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, FileSearch, Layers, Library, Send, ShoppingCart, Sparkles, Undo2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useAzioniMateriali, useMaterialiPerFase, type FaseMateriali, type MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { ETICHETTA_STATO_ACQUISTO, riepilogoFase, type StatoAcquistoMateriale } from "@/lib/distinta/fasiMateriali";
import {
  acquistabile, azioniFase, ETICHETTA_AZIONE_FASE, ETICHETTA_STATO_FASE, puoModificareMateriali, spiegazioneFase,
  type AzioneFase, type PermessiMateriali,
} from "@/lib/distinta/statiFase";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const GeneraMaterialiDialog = lazy(() => import("./GeneraMaterialiDialog"));
const PlanimetrieDialog = lazy(() => import("./PlanimetrieDialog"));

const COLORE_STATO: Record<StatoAcquistoMateriale, string> = {
  da_ordinare: "bg-slate-100 text-slate-700 border-slate-200",
  in_offerta: "bg-amber-50 text-amber-800 border-amber-200",
  in_bozza_oda: "bg-amber-50 text-amber-800 border-amber-200",
  ordinato: "bg-sky-50 text-sky-800 border-sky-200",
  consegnato: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

const COLORE_FASE = {
  bozza: "bg-slate-100 text-slate-700",
  da_validare: "bg-amber-100 text-amber-900",
  validata: "bg-emerald-100 text-emerald-900",
} as const;

const numero = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 });

function BarraAvanzamento({ r }: { r: ReturnType<typeof riepilogoFase> }) {
  if (!r.totale) return null;
  const pct = (n: number) => `${(n / r.totale) * 100}%`;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      <div className="bg-emerald-500" style={{ width: pct(r.consegnati) }} />
      <div className="bg-sky-500" style={{ width: pct(r.ordinati) }} />
      <div className="bg-amber-400" style={{ width: pct(r.inCorso) }} />
    </div>
  );
}

function Provenienza({ m }: { m: MaterialeFase }) {
  if (!m.origine_materiale || m.origine_materiale === "manuale") return null;
  const origini = m.origini ?? [];
  const titolo = origini.map((o) =>
    o.tipo === "computo"
      ? `${o.codice ? o.codice + " · " : ""}${o.descrizione} (${numero(o.quantita_voce)} ${o.unita_voce ?? ""}) → ${numero(o.quantita)}`
      : `${o.documento ?? "Tavola"} · ${o.simbolo}${o.locale ? " · " + o.locale : ""} (${numero(o.quantita_simbolo)}) → ${numero(o.quantita)}`,
  ).join("\n");
  const etichetta = m.origine_materiale === "planimetria"
    ? `Tavola${m.locale ? " · " + m.locale : ""}`
    : origini.length > 1 ? `Computo · ${origini.length} voci` : `Computo${origini[0]?.tipo === "computo" && origini[0].codice ? " · " + origini[0].codice : ""}`;
  return (
    <span title={titolo} className="inline-flex max-w-full items-center gap-1 truncate rounded border border-violet-200 bg-violet-50 px-1.5 py-0 text-[11px] text-violet-800">
      {m.origine_materiale === "planimetria" ? <Layers className="h-3 w-3 shrink-0" aria-hidden /> : <FileSearch className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">{etichetta}</span>
    </span>
  );
}

function RigaMateriale({
  m, selezionato, onSeleziona, modificabile, tecnico, nomeFornitore, onQuantita,
}: {
  m: MaterialeFase;
  selezionato: boolean;
  onSeleziona: (v: boolean) => void;
  modificabile: boolean;
  tecnico: boolean;
  nomeFornitore: string | null;
  onQuantita: (q: number) => void;
}) {
  const [bozza, setBozza] = useState<string | null>(null);
  const calcolata = m.quantita_calcolata != null && Math.abs(Number(m.quantita_calcolata) - m.quantity) > 0.005 ? Number(m.quantita_calcolata) : null;
  const salva = () => {
    if (bozza == null) return;
    const q = Math.round(Number(bozza.replace(",", ".")));
    setBozza(null);
    if (Number.isFinite(q) && q > 0 && q !== m.quantity) onQuantita(q);
  };
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_8rem_10rem_8rem] sm:items-center">
      <Checkbox checked={selezionato} onCheckedChange={(v) => onSeleziona(!!v)} aria-label={`Seleziona ${m.name}`} className="mt-1 sm:mt-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900" title={m.name}>{m.name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {m.specifiche && <span className="truncate" title={m.specifiche}>{m.specifiche}</span>}
          <Provenienza m={m} />
          {m.avviso && <span className="inline-flex items-center gap-1 text-amber-700" title={m.avviso}><AlertTriangle className="h-3 w-3" aria-hidden />{m.avviso}</span>}
        </div>
      </div>
      <div className="text-right sm:text-left">
        {modificabile ? (
          <label className="flex items-center justify-end gap-1 sm:justify-start">
            <span className="sr-only">Quantità di {m.name}</span>
            <Input
              inputMode="numeric"
              className="h-8 w-20 text-right tabular-nums"
              value={bozza ?? String(m.quantity)}
              onChange={(e) => setBozza(e.target.value)}
              onBlur={salva}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              title={tecnico ? "Correzione del tecnico" : undefined}
            />
            <span className="w-8 text-xs text-slate-500">{m.unita_misura ?? "pz"}</span>
          </label>
        ) : (
          <span className="text-sm tabular-nums">{numero(m.quantity)} <span className="text-xs text-slate-500">{m.unita_misura ?? "pz"}</span></span>
        )}
        {calcolata != null && <p className="text-[11px] text-slate-400 tabular-nums">calcolata {numero(calcolata)}</p>}
      </div>
      <p className="col-start-2 truncate text-xs text-slate-600 sm:col-start-auto sm:text-sm" title={nomeFornitore ?? ""}>
        {nomeFornitore ?? <span className="text-slate-400">Fornitore da scegliere</span>}
      </p>
      <span className={cn("col-start-3 justify-self-end rounded border px-1.5 py-0.5 text-[11px] font-medium sm:col-start-auto sm:justify-self-start", COLORE_STATO[m.stato])}>
        {ETICHETTA_STATO_ACQUISTO[m.stato]}
      </span>
    </li>
  );
}

function SezioneFase({
  fase, permessi, canViewCosts, selezione, setSelezione, nomeFornitore, onAzione, onQuantita, aperta, onApri,
}: {
  fase: FaseMateriali;
  permessi: PermessiMateriali;
  canViewCosts: boolean;
  selezione: Set<string>;
  setSelezione: (s: Set<string>) => void;
  nomeFornitore: (id: string | null) => string | null;
  onAzione: (azione: AzioneFase) => void;
  onQuantita: (m: MaterialeFase, q: number, tecnico: boolean) => void;
  aperta: boolean;
  onApri: () => void;
}) {
  const stato = fase.validazione?.stato ?? null;
  const r = riepilogoFase(fase.materiali);
  const inAcquisto = fase.materiali.filter((m) => m.stato !== "da_ordinare").length;
  const azioni = fase.id
    ? azioniFase(stato, permessi, { totale: fase.materiali.length, senzaQuantita: fase.materiali.filter((m) => !(m.quantity > 0)).length, inAcquisto })
    : [];
  const modificabile = puoModificareMateriali(stato, permessi);
  const tecnico = stato === "da_validare" && permessi.canValidateBom && !permessi.canEditOrders;
  const ids = fase.materiali.map((m) => m.id);
  const tutti = ids.length > 0 && ids.every((id) => selezione.has(id));
  const spiegazione = spiegazioneFase(stato, permessi);
  const rimandata = stato === "bozza" && fase.validazione?.note_validazione;

  const seleziona = (id: string, v: boolean) => {
    const s = new Set(selezione);
    if (v) s.add(id); else s.delete(id);
    setSelezione(s);
  };

  return (
    <section aria-label={`Fase ${fase.nome}`} className="overflow-hidden rounded-lg border bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <Checkbox
          checked={tutti}
          onCheckedChange={(v) => {
            const s = new Set(selezione);
            for (const id of ids) { if (v) s.add(id); else s.delete(id); }
            setSelezione(s);
          }}
          aria-label={`Seleziona tutti i materiali di ${fase.nome}`}
          disabled={!ids.length}
        />
        <button type="button" onClick={onApri} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={aperta}>
          {aperta ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          <span className="truncate font-semibold text-slate-900">{fase.nome}</span>
          {stato && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", COLORE_FASE[stato])}>{ETICHETTA_STATO_FASE[stato]}</span>}
        </button>
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <BarraAvanzamento r={r} />
          <p className="text-[11px] text-slate-500 tabular-nums">
            {r.totale} materiali · {r.daOrdinare} da ordinare · {r.inCorso > 0 ? `${r.inCorso} in corso · ` : ""}{r.ordinati} ordinati · {r.consegnati} consegnati
            {canViewCosts && r.importo > 0 ? ` · ${formatCurrency(r.importo)}` : ""}
          </p>
        </div>
        {azioni.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {azioni.map((a) => (
              <Button key={a} size="sm" variant={a === "rimanda" ? "outline" : "default"} className="h-8" onClick={() => onAzione(a)}>
                {a === "invia_validazione" ? <Send className="mr-1.5 h-3.5 w-3.5" /> : a === "valida" ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
                {ETICHETTA_AZIONE_FASE[a]}
              </Button>
            ))}
          </div>
        )}
      </header>
      {aperta && (
        <>
          {(spiegazione || rimandata) && (
            <p className={cn("border-t px-3 py-1.5 text-xs", rimandata ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600")}>
              {rimandata ? <>Rimandati indietro dal tecnico: «{fase.validazione?.note_validazione}»</> : spiegazione}
            </p>
          )}
          {fase.materiali.length ? (
            <ul className="divide-y border-t">
              {fase.materiali.map((m) => (
                <RigaMateriale
                  key={m.id}
                  m={m}
                  selezionato={selezione.has(m.id)}
                  onSeleziona={(v) => seleziona(m.id, v)}
                  modificabile={modificabile && m.stato === "da_ordinare"}
                  tecnico={tecnico}
                  nomeFornitore={nomeFornitore(m.supplier_id)}
                  onQuantita={(q) => onQuantita(m, q, tecnico)}
                />
              ))}
            </ul>
          ) : (
            <p className="border-t px-3 py-3 text-sm text-slate-500">Nessun materiale in questa fase.</p>
          )}
        </>
      )}
    </section>
  );
}

export function MaterialiPerFase({ orderId, orderCode }: { orderId: string; orderCode?: string | null }) {
  const perm = usePermissions();
  const permessi: PermessiMateriali = {
    canEditOrders: !!perm.canEditOrders, canValidateBom: !!perm.canValidateBom, canManagePurchasing: !!perm.canManagePurchasing,
  };
  const { fasi, isLoading, isError, refetch } = useMaterialiPerFase(orderId);
  const azioni = useAzioniMateriali(orderId, orderCode);
  const { suppliers } = useOperationalSuppliers();
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [chiuse, setChiuse] = useState<Set<string>>(new Set());
  const [rimando, setRimando] = useState<{ phaseId: string; nome: string } | null>(null);
  const [nota, setNota] = useState("");
  const [offerta, setOfferta] = useState(false);
  const [titoloOfferta, setTitoloOfferta] = useState("");
  const [fornitoriOfferta, setFornitoriOfferta] = useState<Set<string>>(new Set());
  const [genera, setGenera] = useState(false);
  const [tavole, setTavole] = useState(false);

  const nomeFornitore = (id: string | null) => (id ? suppliers.find((s: { id: string }) => s.id === id)?.name ?? "Fornitore" : null);
  const tuttiMateriali = useMemo(() => fasi.flatMap((f) => f.materiali), [fasi]);
  const scelti = tuttiMateriali.filter((m) => selezione.has(m.id));
  const faseDi = (m: MaterialeFase) => fasi.find((f) => f.materiali.includes(m));
  const sceltiAcquistabili = scelti.filter((m) => acquistabile(faseDi(m)?.validazione?.stato ?? null));
  const bloccati = scelti.length - sceltiAcquistabili.length;
  const totale = riepilogoFase(tuttiMateriali);
  const puoComprare = permessi.canEditOrders || permessi.canManagePurchasing;

  if (isLoading) return <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Carico i materiali…</p>;
  if (isError) {
    return (
      <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        Materiali non caricati. <button type="button" className="underline" onClick={() => refetch()}>Riprova</button>
      </p>
    );
  }

  return (
    <div className="space-y-3" id="materiali-per-fase">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2.5">
        <div>
          <h3 className="font-semibold text-slate-900">Materiali per fase</h3>
          <p className="text-xs text-slate-500 tabular-nums">
            {totale.totale} materiali · {totale.daOrdinare} da ordinare · {totale.ordinati} ordinati · {totale.consegnati} consegnati
            {perm.canViewCosts && totale.importo > 0 ? ` · ${formatCurrency(totale.importo)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {permessi.canEditOrders && (
            <Button size="sm" className="h-8" onClick={() => setGenera(true)}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Genera dal computo e dalle tavole
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8" onClick={() => setTavole(true)}>
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Tavole e conteggi
          </Button>
          <Button size="sm" variant="ghost" className="h-8" asChild>
            <Link to="/azienda/scomposizioni"><Library className="mr-1.5 h-3.5 w-3.5" /> Scomposizioni</Link>
          </Button>
        </div>
      </div>

      {scelti.length > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <strong className="tabular-nums">{scelti.length} selezionati</strong>
          {bloccati > 0 && <span className="text-xs text-amber-800">{bloccati} di fasi non validate: non si ordinano</span>}
          {puoComprare && (
            <Select onValueChange={(v) => azioni.assegnaFornitore.mutate({ ids: scelti.map((m) => m.id), supplierId: v === "_nessuno" ? null : v, diretto: permessi.canEditOrders })}>
              <SelectTrigger className="h-8 w-48 bg-white"><SelectValue placeholder="Assegna fornitore" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_nessuno">Nessun fornitore</SelectItem>
                {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {permessi.canEditOrders && (
            <Select onValueChange={(v) => azioni.spostaInFase.mutate({ ids: scelti.map((m) => m.id), phaseId: v === "_senza" ? null : v })}>
              <SelectTrigger className="h-8 w-44 bg-white"><SelectValue placeholder="Sposta in fase" /></SelectTrigger>
              <SelectContent>
                {fasi.filter((f) => f.id).map((f) => <SelectItem key={f.id!} value={f.id!}>{f.nome}</SelectItem>)}
                <SelectItem value="_senza">Senza fase</SelectItem>
              </SelectContent>
            </Select>
          )}
          {puoComprare && (
            <>
              <Button size="sm" variant="outline" className="h-8 bg-white" disabled={!sceltiAcquistabili.length}
                onClick={() => {
                  setTitoloOfferta(`Materiali ${orderCode ?? ""}`.trim());
                  setFornitoriOfferta(new Set(sceltiAcquistabili.flatMap((m) => (m.supplier_id ? [m.supplier_id] : []))));
                  setOfferta(true);
                }}>
                Richiedi offerta
              </Button>
              <Button size="sm" className="h-8" disabled={!sceltiAcquistabili.length || azioni.creaOrdini.isPending}
                onClick={() => azioni.creaOrdini.mutate({ materiali: sceltiAcquistabili.filter((m) => m.ordinabile) }, { onSuccess: () => setSelezione(new Set()) })}>
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Crea ordine
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelezione(new Set())}>Annulla</Button>
        </div>
      )}

      {fasi.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-6 text-center">
          <p className="font-medium text-slate-800">Nessun materiale ancora</p>
          <p className="mt-1 text-sm text-slate-500">
            Generali dal computo metrico e dalle tavole: il sistema prepara la lista dei materiali con quantità e specifiche, divisa per fase. Il tecnico la valida e l'ufficio acquisti ordina.
          </p>
        </div>
      ) : (
        fasi.map((f) => {
          const chiave = f.id ?? "_senza";
          return (
            <SezioneFase
              key={chiave}
              fase={f}
              permessi={permessi}
              canViewCosts={!!perm.canViewCosts}
              selezione={selezione}
              setSelezione={setSelezione}
              nomeFornitore={nomeFornitore}
              aperta={!chiuse.has(chiave)}
              onApri={() => { const s = new Set(chiuse); if (s.has(chiave)) s.delete(chiave); else s.add(chiave); setChiuse(s); }}
              onAzione={(a) => {
                if (!f.id) return;
                if (a === "rimanda") { setNota(""); setRimando({ phaseId: f.id, nome: f.nome }); return; }
                azioni.cambiaStato.mutate({ phaseId: f.id, azione: a });
              }}
              onQuantita={(m, q, tecnico) => azioni.aggiornaMateriale.mutate({ id: m.id, tecnico, modifica: { quantity: q } })}
            />
          );
        })
      )}

      <Dialog open={!!rimando} onOpenChange={(o) => !o && setRimando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rimanda indietro i materiali di «{rimando?.nome}»</DialogTitle>
            <DialogDescription>Scrivi cosa va corretto: chi li ha preparati riceve la nota in campanella.</DialogDescription>
          </DialogHeader>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} placeholder="Es. mancano le cassette 294×152×75 del piano primo" aria-label="Nota per chi ha preparato i materiali" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRimando(null)}>Annulla</Button>
            <Button disabled={!nota.trim() || azioni.cambiaStato.isPending}
              onClick={() => rimando && azioni.cambiaStato.mutate({ phaseId: rimando.phaseId, azione: "rimanda", nota }, { onSuccess: () => setRimando(null) })}>
              Rimanda indietro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={offerta} onOpenChange={setOfferta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Richiedi offerta ai fornitori</DialogTitle>
            <DialogDescription>{sceltiAcquistabili.length} materiali con quantità, unità e specifiche. Poi la mandi dalla richiesta d'offerta.</DialogDescription>
          </DialogHeader>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Titolo</span>
            <Input value={titoloOfferta} onChange={(e) => setTitoloOfferta(e.target.value)} />
          </label>
          <fieldset className="max-h-56 space-y-1 overflow-auto rounded border p-2">
            <legend className="px-1 text-sm font-medium">Fornitori a cui chiederla</legend>
            {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={fornitoriOfferta.has(s.id)} onCheckedChange={(v) => {
                  const n = new Set(fornitoriOfferta);
                  if (v) n.add(s.id); else n.delete(s.id);
                  setFornitoriOfferta(n);
                }} />
                {s.name}
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOfferta(false)}>Annulla</Button>
            <Button disabled={azioni.richiediOfferta.isPending}
              onClick={() => azioni.richiediOfferta.mutate(
                { ids: sceltiAcquistabili.map((m) => m.id), titolo: titoloOfferta, fornitori: [...fornitoriOfferta] },
                { onSuccess: () => { setOfferta(false); setSelezione(new Set()); } },
              )}>
              Crea richiesta d'offerta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        {genera && <GeneraMaterialiDialog orderId={orderId} open={genera} onOpenChange={setGenera} />}
        {tavole && <PlanimetrieDialog orderId={orderId} open={tavole} onOpenChange={setTavole} />}
      </Suspense>
    </div>
  );
}

export default MaterialiPerFase;
