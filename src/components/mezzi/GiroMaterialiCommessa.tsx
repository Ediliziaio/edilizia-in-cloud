import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ClipboardCopy, PackageCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useBolleCommessa } from "@/components/orders/OrderDocumentiFornitore";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { avanzamentoOrdine, STATI_DDT } from "@/lib/orders/materialProcurement";
import { ODA_STATUS_LABELS } from "@/lib/odaStatus";
import { formatData, oggiIso } from "@/types/mezzi";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { mezzoStradale } from "@/lib/campo/arrivoRapportino";
import type { Viaggio } from "@/lib/mezzi/viaggi";
import { ViaggioDialog } from "./ViaggioDialog";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

type Cantiere = { id: string; label: string; indirizzo: string | null };
type MezzoGiro = { id: string; nome: string; tipo: string; stato: string; contatore_unita?: string | null };
type Props = { company: string; ordine: string; mezzi?: readonly MezzoGiro[]; modifica?: boolean; acquistiVisibili?: boolean };
const dataOra = new Intl.DateTimeFormat(intlCampo(), {
  timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short",
});
const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
const statiRegistro = { bozza: "Bozza nel registro", inviato: "Da verificare", verificato: "Verificato", annullato: "Annullato" };
const lotti = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 50) }, (_, n) => ids.slice(n * 50, (n + 1) * 50));

export function GiroMaterialiCommessa(props: Props) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  return <section aria-label={t("Ritiri e consegne materiali")} className="rounded-lg border bg-card">
    <Button type="button" variant="ghost" size="sm" className="w-full justify-start px-3" aria-expanded={aperto} onClick={() => setAperto(x => !x)}>
      <PackageCheck className="size-4" /> {t("Ritiri e consegne")}
    </Button>
    {aperto && <Giro key={`${props.company}:${props.ordine}`} {...props} />}
  </section>;
}

const ODA_CAMPI = "id,order_id,oda_number,status,supplier_id,expected_delivery_date,suppliers(name,ritiro_indirizzo,ritiro_citta),righe:purchase_order_items(quantity,quantity_received)" as const;
function Giro({ company, ordine, mezzi = [], modifica = false, acquistiVisibili = true }: Props) {
  const tr = useT();
  const oggi = oggiIso();
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAdesso(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const [data, setData] = useState(oggi);
  const [scelti, setScelti] = useState<string[]>([]);
  const [base, setBase] = useState("Sede / magazzino");
  const [rientro, setRientro] = useState(true);
  const formId = useId();
  const [bozzaAperta, setBozzaAperta] = useState(false);
  const [mezzo, setMezzo] = useState("");
  const [autista, setAutista] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [ricercaAutista, setRicercaAutista] = useState("");
  const [aggiunti, setAggiunti] = useState<Cantiere[]>([]);
  const [inizio, setInizio] = useState("07:00");
  const [fine, setFine] = useState("17:00");
  const [giornoArrivo, setGiornoArrivo] = useState("");
  const [viaggio, setViaggio] = useState<Viaggio | null>(null);
  const [inApertura, setInApertura] = useState<string | null>(null);
  const [inAnnullamento, setInAnnullamento] = useState<string | null>(null);
  const tentativo = useRef<{ firma: string; id: string } | null>(null);
  const actor = useAuth().user?.id;
  const client = useQueryClient();
  const veicoli = mezzi.filter(m => m.stato === "in_servizio" && mezzoStradale(m));
  const qCantiere = useDeferredValue(ricerca.trim());
  const qAutista = useDeferredValue(ricercaAutista.trim());
  const contesto = useQuery({
    queryKey: [...viaggiKey(company), actor, "opzioni-giro", mezzo, qCantiere, qAutista],
    enabled: Boolean(actor && mezzo && modifica), staleTime: 15000, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mezzi_giro_contesto", {
        p_company: company, p_mezzo: mezzo, p_cantiere: qCantiere, p_autista: qAutista,
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
  const commesse = [ordine, ...aggiunti.map(c => c.id)];
  const bolle = useBolleCommessa(ordine, acquistiVisibili);
  const giri = useQuery({
    queryKey: [...viaggiKey(company), actor, "giri-salvati", ordine],
    enabled: Boolean(actor), retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mezzi_giri_elenco", { p_company: company, p_order: ordine }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
  const aggiorna = (): void => { void client.invalidateQueries({ queryKey: viaggiKey(company) }); };
  const apri = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("mezzi_giro_registra", { p_company: company, p_giro: id });
      if (error) throw error;
      return data;
    },
    onSuccess: v => { setViaggio(v); aggiorna(); },
    onError: e => toast.error(e.message || tr("Impossibile aprire il viaggio")),
    onSettled: (): void => { setInApertura(null); },
  });
  const annulla = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("mezzi_giro_annulla", { p_company: company, p_giro: id });
      if (error) throw error;
    },
    onSuccess: () => { setInAnnullamento(null); aggiorna(); toast.success(tr("Giro annullato")); },
    onError: e => toast.error(e.message || tr("Impossibile annullare il giro")),
  });
  const acquisti = useQuery({
    queryKey: ["linked-purchase-orders", ordine, company, actor, "giro-materiali", [...commesse].sort()],
    enabled: Boolean(actor && acquistiVisibili),
    staleTime: 30_000, retry: false,
    queryFn: () => allPaymentRows((da, a) => supabase.from("purchase_orders")
      .select(ODA_CAMPI).eq("company_id", company).in("order_id", commesse)
      .in("status", ["inviato", "confermato", "parziale", "ricevuto"]).order("expected_delivery_date").order("id").range(da, a)),
  });
  const odaIds = (acquisti.data ?? []).map(a => a.id).sort();
  const ddt = useQuery({
    queryKey: ["commessa-bolle-ddt", company, ordine, actor, "oda-del-giro", odaIds],
    enabled: acquistiVisibili && odaIds.length > 0, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const legami = (await Promise.all(lotti(odaIds).map(ids => allPaymentRows((da, a) =>
        supabase.from("ddt_ordini_collegati").select("id,ddt_id,purchase_order_id")
          .eq("company_id", company).in("purchase_order_id", ids).order("id").range(da, a))))).flat();
      const idBolle = Array.from(new Set(legami.flatMap(l => l.ddt_id ? [l.ddt_id] : [])));
      const righe = (await Promise.all(lotti(idBolle).map(ids => allPaymentRows((da, a) =>
        supabase.from("ddt_ricezione").select("id,numero_ddt,stato")
          .eq("company_id", company).in("id", ids).order("id").range(da, a))))).flat();
      const perId = new Map(righe.map(b => [b.id, b]));
      const perOda = new Map<string, typeof righe>();
      for (const legame of legami) {
        const bolla = legame.ddt_id ? perId.get(legame.ddt_id) : undefined;
        if (!legame.purchase_order_id || !bolla) continue;
        const documenti = perOda.get(legame.purchase_order_id) ?? [];
        documenti.push(bolla);
        perOda.set(legame.purchase_order_id, documenti);
      }
      return perOda;
    },
  });
  const cantiere = useQuery({
    queryKey: ["giro-materiali-commessa", company, actor, ordine],
    enabled: Boolean(actor), retry: false, staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from("orders").select("order_code,description,work_address,indirizzo_lavori")
        .eq("company_id", company).eq("id", ordine).abortSignal(signal).single();
      if (error) throw error;
      return data;
    },
  });
  const riga = (acquisti.data ?? []).map(oda => {
    const avanzamento = avanzamentoOrdine(oda, oggi);
    const indirizzo = oda.suppliers?.ritiro_indirizzo ? [oda.suppliers.ritiro_indirizzo, oda.suppliers.ritiro_citta].filter(Boolean).join(", ") : null;
    return { ...oda, avanzamento, indirizzo, selezionabile: avanzamento.aperto && Boolean(indirizzo) &&
      (!avanzamento.righeTotali || avanzamento.righeTotali > avanzamento.righeArrivate) };
  });
  const perFornitore = new Map<string, { nome: string; indirizzo: string; ordini: string[] }>();
  for (const id of scelti) {
    const oda = riga.find(x => x.id === id && x.selezionabile);
    if (!oda?.indirizzo) continue;
    const tappa = perFornitore.get(oda.supplier_id);
    if (tappa) tappa.ordini.push(oda.oda_number);
    else perFornitore.set(oda.supplier_id, { nome: oda.suppliers?.name ?? "Fornitore", indirizzo: oda.indirizzo, ordini: [oda.oda_number] });
  }
  const sceltaValida = scelti.filter(id => riga.some(oda => oda.id === id && oda.selezionabile));
  const partenza = `${data}T${inizio}`;
  const arrivo = `${giornoArrivo || data}T${fine}`;
  const durata = Date.parse(arrivo + "Z") - Date.parse(partenza + "Z");
  const salva = useMutation({
    mutationFn: async () => {
      const payload = { p_company: company, p_mezzo: mezzo, p_autista: autista, p_partenza: partenza,
        p_arrivo: arrivo, p_commesse: commesse, p_oda: sceltaValida, p_luogo: base.trim(), p_rientro: rientro };
      const firma = JSON.stringify({ actor, ...payload });
      if (tentativo.current?.firma !== firma) tentativo.current = { firma, id: crypto.randomUUID() };
      const { error } = await supabase.rpc("mezzi_giro_salva", { ...payload, p_id: tentativo.current.id });
      if (error) throw error;
    },
    onSuccess: () => {
      tentativo.current = null;
      setBozzaAperta(false);
      setScelti([]); setAggiunti([]); setMezzo(""); setAutista(""); setRicerca(""); setRicercaAutista(""); aggiorna();
      toast.success(tr("Giro salvato"));
    },
    onError: e => toast.error(e.message || tr("Impossibile salvare il giro")),
  });
  function sposta(indice: number, direzione: -1 | 1) {
    setAggiunti(tappeCorrenti => {
      const tappeNuove = [...tappeCorrenti];
      const destinazione = indice + direzione;
      [tappeNuove[indice], tappeNuove[destinazione]] = [tappeNuove[destinazione], tappeNuove[indice]];
      return tappeNuove;
    });
  }
  const cantieri = contesto.data?.cantieri ?? [];
  const indirizzoCantiere = cantiere.data?.work_address || cantiere.data?.indirizzo_lavori;
  const tappe = [
    `Partenza · ${base.trim() || "Sede / magazzino"}`,
    ...Array.from(perFornitore.values(), t => `Ritiro · ${t.nome} · ${t.indirizzo} · ${t.ordini.join(", ")}`),
    `Consegna · ${cantiere.data?.order_code ?? "Cantiere"}${indirizzoCantiere ? ` · ${indirizzoCantiere}` : " · indirizzo da confermare"}`,
    ...aggiunti.map(c => `Consegna · ${c.label}${c.indirizzo ? ` · ${c.indirizzo}` : " · indirizzo da confermare"}`),
    ...(rientro ? [`Rientro · ${base.trim() || "Sede / magazzino"}`] : []),
  ];
  const errore = acquisti.isError || bolle.isError || ddt.isError || cantiere.isError;
  return <div className="space-y-2 border-t px-3 pb-3 pt-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      {acquistiVisibili && riga.some(r => r.selezionabile) && <p className="text-xs text-muted-foreground">{tr("Seleziona gli ODA pronti per il ritiro.")}</p>}
      {modifica && <Button type="button" variant="outline" size="sm" className="ml-auto h-8" aria-expanded={bozzaAperta}
        onClick={() => setBozzaAperta(v => !v)}>{bozzaAperta ? tr("Chiudi bozza") : tr("Nuovo giro")}</Button>}
    </div>
    {errore && <p role="alert" className="text-xs text-amber-800">{tr("Alcuni dati di consegna sono indisponibili.")} <button className="underline" type="button"
      onClick={() => void Promise.all([cantiere.refetch(), ...(acquistiVisibili ? [acquisti.refetch(), bolle.refetch()] : []), ...(odaIds.length ? [ddt.refetch()] : [])])}>{tr("Riprova")}</button></p>}
    {acquistiVisibili && acquisti.isPending && <p role="status" className="text-xs">{tr("Caricamento ordini d’acquisto…")}</p>}
    {acquisti.isSuccess && !riga.length && <p className="text-xs text-muted-foreground">{tr("Nessun ordine d’acquisto emesso per questa commessa.")}</p>}
    <div className={cn("grid min-w-0 items-start gap-2.5", riga.length > 0 && bozzaAperta && "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]")}>
      {riga.length > 0 && <ul className="min-w-0 divide-y overflow-hidden rounded-lg border">
        {riga.map(oda => {
          const registrati = (ddt.data?.get(oda.id) ?? []).map(b => ({
            id: b.id, numero: b.numero_ddt, stato: STATI_DDT[b.stato] ?? b.stato, link: `/azienda/ddt/${b.id}`,
          }));
          const numeriRegistrati = new Set(registrati.flatMap(b => b.numero?.trim() ? [b.numero.trim().toLowerCase()] : []));
          const altri = (bolle.data ?? []).filter(b => b.purchaseOrderId === oda.id && b.origine !== "cliente" &&
            !(b.origine === "cantiere" && b.numero && numeriRegistrati.has(b.numero.trim().toLowerCase())));
          const documenti = [...new Map([...altri, ...registrati].map(b => [b.id, b])).values()];
          return <li key={oda.id} className={cn("grid min-w-0 gap-x-3 gap-y-0.5 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_auto]", scelti.includes(oda.id) && "bg-primary/5")}>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link to={`/azienda/ordini-acquisto/${oda.id}`} className="font-medium text-primary hover:underline">{oda.oda_number}</Link>
              <span>{oda.suppliers?.name ?? tr("Fornitore")}</span>
              <span className="text-xs text-muted-foreground">{ODA_STATUS_LABELS[oda.status] ?? oda.status}
                {oda.avanzamento.righeTotali > 0 && tr(" · {righeArrivate}/{righeTotali} righe ricevute", { righeArrivate: String(oda.avanzamento.righeArrivate ?? ""), righeTotali: String(oda.avanzamento.righeTotali ?? "") })}
                {oda.expected_delivery_date && tr(" · arrivo previsto {expected_delivery_date}", { expected_delivery_date: formatData(oda.expected_delivery_date) })}</span>
            </div>
            {oda.selezionabile && <label className="flex min-h-8 w-fit items-center gap-2 text-xs sm:col-start-2 sm:row-start-1 sm:row-end-3">
              <Checkbox checked={scelti.includes(oda.id)} onCheckedChange={x => {
                if (x === true) setBozzaAperta(true);
                setScelti(s => x === true ? [...s, oda.id] : s.filter(k => k !== oda.id));
              }} />
              {tr("Includi nel giro")}<span className="sr-only"> {oda.oda_number}</span>
            </label>}
            {(oda.avanzamento.aperto || documenti.length > 0) && <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:col-start-1 sm:row-start-2">
              {oda.avanzamento.aperto && <span>{oda.indirizzo ?? tr("Indirizzo di ritiro da impostare")}</span>}
              {documenti.map(b => <span key={b.id}>
                {b.link ? <Link className="font-medium text-primary underline" to={b.link}>DDT {b.numero ?? ""}</Link> : <span>DDT {b.numero ?? ""}</span>} · {b.stato}
              </span>)}
            </div>}
          </li>;
        })}
      </ul>}
      {bozzaAperta && (modifica || perFornitore.size > 0) && <section aria-label={tr("Bozza giro materiali")} className="min-w-0 space-y-2 rounded-lg bg-muted/45 p-2.5">
        <h4 className="text-sm font-semibold">{tr("Bozza giro")}</h4>
        <div className="grid grid-cols-2 items-end gap-1.5">
          <label className="min-w-0 space-y-1 text-xs">{tr("Giorno del giro")} <Input className="h-9 min-w-0" type="date" value={data} onChange={e => setData(e.target.value)} /></label>
          <label className="min-w-0 space-y-1 text-xs">{tr("Partenza")} <Input className="h-9 min-w-0" value={base} onChange={e => setBase(e.target.value)} maxLength={150} /></label>
        </div>
        {modifica && <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="min-w-0 space-y-1 text-xs">
              <label htmlFor={`${formId}-mezzo`}>{tr("Mezzo")}</label>
              <select id={`${formId}-mezzo`} className={selectClass} value={mezzo} onChange={e => {
                setMezzo(e.target.value); setAutista(""); setRicercaAutista("");
              }}>
                <option value="">{tr("Scegli il mezzo")}</option>
                {veicoli.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="min-w-0 space-y-1 text-xs">
              <label htmlFor={`${formId}-autista`}>{tr("Autista")}</label>
              <select id={`${formId}-autista`} className={selectClass} value={autista} disabled={!mezzo} onChange={e => setAutista(e.target.value)}>
                <option value="">{tr("Scegli l’autista")}</option>
                {contesto.data?.autisti.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          </div>
          {!veicoli.length && <p className="text-xs text-muted-foreground">{tr("Serve un mezzo stradale in servizio.")}</p>}
          {mezzo && <label className="block space-y-1 text-xs">{tr("Cerca autista")}
            <Input className="h-9" placeholder={tr("Nome o cognome")} value={ricercaAutista} onChange={e => {
              setRicercaAutista(e.target.value); setAutista("");
            }} />
          </label>}
          <div className="grid grid-cols-2 gap-1.5">
            <label className="min-w-0 space-y-1 text-xs">{tr("Ora di partenza")} <Input className="h-9" type="time" value={inizio} onChange={e => setInizio(e.target.value)} /></label>
            <label className="min-w-0 space-y-1 text-xs">{tr("Ora di arrivo")} <Input className="h-9" type="time" value={fine} onChange={e => setFine(e.target.value)} /></label>
            <label className="col-span-2 min-w-0 space-y-1 text-xs">{tr("Giorno di arrivo, se diverso")}
              <Input className="h-9" type="date" min={data || undefined} value={giornoArrivo} onChange={e => setGiornoArrivo(e.target.value)} />
            </label>
          </div>
          {mezzo && <div className="space-y-1.5">
            <label className="block space-y-1 text-xs">{tr("Cerca altri cantieri")}
              <Input className="h-9" placeholder={tr("Codice o indirizzo")} value={ricerca} onChange={e => setRicerca(e.target.value)} />
            </label>
            <select aria-label={tr("Aggiungi cantiere")} className={selectClass} value="" disabled={aggiunti.length >= 14}
              onChange={e => {
                const c = cantieri.find(c => c.id === e.target.value);
                if (c && !commesse.includes(c.id)) setAggiunti(v => [...v, c]);
              }}>
              <option value="">{tr("Aggiungi cantiere")}</option>
              {cantieri.filter(c => !commesse.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {contesto.isError && <p className="text-xs text-amber-800">{tr("Autisti o cantieri non disponibili.")} <button type="button" className="underline"
              onClick={() => void contesto.refetch()}>{tr("Riprova")}</button></p>}
          </div>}
        </div>}
        <ol className="list-decimal space-y-1 break-words pl-5 text-xs">{tappe.map((t, i) => {
          const indice = i - perFornitore.size - 2;
          const c = aggiunti[indice];
          return <li key={`${i}:${t}`}>{t} {modifica && c && <span className="inline-flex items-center align-middle">
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={indice === 0} aria-label={tr("Anticipa {label}", { label: String(c.label ?? "") })} onClick={() => sposta(indice, -1)}><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={indice === aggiunti.length - 1} aria-label={tr("Posticipa {label}", { label: String(c.label ?? "") })} onClick={() => sposta(indice, 1)}><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={tr("Rimuovi {label}", { label: String(c.label ?? "") })} onClick={() => {
              setAggiunti(x => x.filter(a => a.id !== c.id));
              setScelti(x => x.filter(id => !riga.some(o => o.id === id && o.order_id === c.id)));
            }}><Trash2 /></Button>
          </span>}</li>;
        })}</ol>
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <label className="flex min-h-8 items-center gap-2 text-xs"><Checkbox checked={rientro} onCheckedChange={v => setRientro(v === true)} /> {tr("Includi rientro")}</label>
          <Button type="button" size="sm" variant="outline" disabled={!data}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText([`Giro materiali · ${formatData(data)}`, ...tappe].join("\n"));
                toast.success(tr("Giro copiato"));
              } catch { toast.error(tr("Impossibile copiare il giro")); }
            }}><ClipboardCopy className="size-4" /> {tr("Copia il giro")}</Button>
          {modifica && <Button type="button" size="sm" disabled={salva.isPending || !mezzo || !autista || !base.trim() ||
            !Number.isFinite(durata) || durata <= 0 || durata > 48 * 3600000 ||
            sceltaValida.length !== scelti.length || perFornitore.size + commesse.length + Number(rientro) > 30}
            onClick={() => salva.mutate()}>{salva.isPending ? tr("Salvataggio…") : tr("Salva giro")}</Button>}
        </div>
        {!acquisti.isFetching && sceltaValida.length !== scelti.length && <p role="status" className="text-xs">
          {tr("Alcuni ordini selezionati sono cambiati.")} <button type="button" className="underline" onClick={() => setScelti(sceltaValida)}>{tr("Aggiorna selezione")}</button>
        </p>}
      </section>}
    </div>
    {giri.isError && <p role="alert" className="text-xs text-amber-800">{tr("Giri salvati non disponibili.")} <button type="button" className="underline"
      onClick={() => void giri.refetch()}>{tr("Riprova")}</button></p>}
    {Boolean(giri.data?.length) && <section aria-label={tr("Giri salvati")} className="space-y-1.5">
      <h4 className="text-sm font-semibold">{tr("Giri salvati")}</h4>
      <ul className="divide-y rounded-lg border">
        {giri.data?.map(g => <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2">
          <div>
            <p className="font-medium">{g.mezzo} · {g.autista}</p>
            <p className="text-xs text-muted-foreground">{dataOra.format(new Date(g.partenza))} – {dataOra.format(new Date(g.arrivo))} · {g.commesse.length} {g.commesse.length === 1 ? tr("cantiere") : tr("cantieri")} · {tr("{n} tratte", { n: g.tratte.length })} · {g.annullato_il ? tr("Annullato") : g.stato_viaggio ? tr(statiRegistro[g.stato_viaggio]) : tr("Pianificato")}</p>
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer">{tr("Vedi tappe")}</summary>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                {g.tratte.map(t => <li key={t.id}>{t.da} → {t.a}</li>)}
              </ol>
            </details>
          </div>
          {modifica && !g.annullato_il && <div className="flex flex-wrap gap-1">
            {!g.viaggio_id && inAnnullamento === g.id && <Button type="button" size="sm" variant="outline" disabled={annulla.isPending}
              onClick={() => annulla.mutate(g.id)}>{tr("Conferma annullamento")}</Button>}
            {!g.viaggio_id && inAnnullamento !== g.id && <Button type="button" size="sm" variant="ghost"
              onClick={() => setInAnnullamento(g.id)}>{tr("Annulla giro")}</Button>}
            <Button type="button" size="sm" variant="outline" disabled={Boolean(inApertura) || annulla.isPending || (!g.viaggio_id && Date.parse(g.partenza) > adesso)}
              title={!g.viaggio_id && Date.parse(g.partenza) > adesso ? tr("Disponibile dopo la partenza prevista") : undefined}
              onClick={() => { setInApertura(g.id); apri.mutate(g.id); }}>
              {inApertura === g.id ? tr("Apertura…") : g.viaggio_id ? tr("Apri viaggio") : tr("Compila nel registro")}
            </Button>
          </div>}
        </li>)}
      </ul>
    </section>}
    {viaggio && <ViaggioDialog companyId={company} mezzoId={viaggio.mezzo_id} viaggio={viaggio} onClose={() => setViaggio(null)} />}
  </div>;
}
