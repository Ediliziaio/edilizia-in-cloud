import { pagamentoDaMostrare } from "@/lib/fatturazione/pagamentoFatturaRicevuta";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, Download, FileText, Link2, Receipt, Sparkles } from "lucide-react";
import { ConfrontoFatturaDialog } from "./ConfrontoFatturaDialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { VerificaFatturaPill } from "@/components/fatturazione/VerificaFatturaPill";
import { PagamentoRicevutaCella, isNotaCreditoRicevuta } from "@/components/fatturazione/PagamentoRicevuta";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";
import { fatturaVerificata } from "@/lib/fatturazione/ripartizioneFattura";
import { usePermissions } from "@/hooks/usePermissions";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { CollegamentiFattura } from "@/components/fatturazione/CollegamentiFattura";
import { AllegatiFattura } from "@/components/fatturazione/AllegatiFattura";
import { NoteInterneFattura } from "@/components/fatturazione/NoteInterneFattura";
import { ContoDiCosto } from "@/components/fatturazione/ContoDiCosto";
import { ContoRigaMenu, ProposteContiRighe, useContiRighe } from "@/components/fatturazione/ContoPerRiga";
import { CespiteDaRiga, useCespitiDellaFattura } from "@/components/contabilita/CespiteDaRiga";
import {
  etichettaAliquota,
  nomeNatura,
  nomeTipoDocumento,
  riepilogoIvaLeggibile,
  righeLeggibili,
} from "@/lib/fatturazione/riepilogoRicevuta";
import { INFO_TIPO_FORNITORE, isTipoFornitore } from "@/lib/fornitori/tipiFornitore";

/**
 * La fattura ricevuta come si legge su carta: chi la manda, cosa fattura, quanto,
 * e a cosa è collegata (ordini, commessa, costo, fornitore in anagrafica,
 * subappalto). Funziona anche senza XML: prende righe e totali dal database.
 * L'XML resta dietro «Scarica il file originale» e la versione completa
 * (stampa, PDF del fornitore) quando c'è.
 */

type Riga = Record<string, unknown>;

interface Dettaglio {
  fattura: Riga;
  ordini: Array<{ id: string; oda_number: string; importo: number | null; commessa: { id: string; order_code: string } | null }>;
  costo: { id: string; amount: number | null; category: string | null; commessa: { id: string; order_code: string } | null; ripartito: boolean } | null;
  fornitore: { id: string; name: string; tipo?: string | null } | null;
  /** Senza fornitore: le schede dell'anagrafica con la stessa partita IVA (o codice fiscale). */
  candidatiFornitore: Array<{ id: string; name: string }>;
  /** Schede con la stessa partita IVA ma l'altro identificativo diverso: da correggere, non da duplicare. */
  schedeDiscordanti: Array<{ id: string; name: string }>;
  /** Le fatture dello stesso cedente ancora senza fornitore (questa compresa), fino a 500. */
  daCollegareStessoCedente: string[];
  suggerita: { id: string; order_code: string; nome: string } | null;
  subappalto: { id: string; numero_contratto: string | null } | null;
}

export interface AzioniRiepilogo {
  /** Apre la scelta degli ordini d'acquisto (uno o più, con le quote). */
  onCollegaOrdine?: () => void;
  /** Apre la scelta di una o più commesse, con le quote. */
  onCollegaCommesse?: () => void;
  /** Contabilizza: la fattura diventa un costo. */
  onContabilizza?: () => void;
  /** La versione completa dall'XML (stampa, PDF del fornitore): solo se l'XML c'è. */
  onVersioneCompleta?: () => void;
  /** Scarica l'XML originale. */
  onScaricaOriginale?: () => void;
  /** Spazio per i collegamenti che il chiamante aggiunge (commessa, fornitore). */
  extraCollegamenti?: (d: Dettaglio) => ReactNode;
}

/** Come partner_tax_key() del database: solo lettere e cifre, senza «IT» davanti alla partita IVA. */
export const chiaveFiscale = (v: unknown): string => {
  const x = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^IT\d{11}$/.test(x) ? x.slice(2) : x;
};

const commessaDi = (v: unknown): { id: string; order_code: string } | null => {
  const o = (Array.isArray(v) ? v[0] : v) as { id?: string; order_code?: string } | null | undefined;
  return o?.id ? { id: o.id, order_code: o.order_code ?? "Commessa" } : null;
};

async function leggiDettaglio(fatturaId: string, companyId: string): Promise<Dettaglio | null> {
  const db = supabase as any;
  const { data: f, error } = await db
    .from("fatture_ricevute")
    .select(
      "id, prima_nota_id, verifica_manuale, rettifica_motivo, note_interne, pagata_il, cedente_ragione_sociale, cedente_piva, cedente_cf, cedente_indirizzo, cedente_cap, cedente_comune, cedente_provincia, cedente_paese, tipo_documento, numero_fattura, data_fattura, data_ricezione_sdi, imponibile_totale, iva_totale, totale_documento, pdf_url, pdf_storage_bucket, pdf_storage_path, righe, conti_righe, riepilogo_iva, stato, xml_url, xml_bytes, purchase_order_id, company_cost_id, fornitore_id, order_id_suggerito, order_match_confidenza, contratto_subappalto_id, sal_subappaltatore_id, categoria_ai, sottocategoria_ai, ai_riassunto, anomalie_rilevate, note, piano_pagamento, condizioni_pagamento, ritenuta_importo, ritenuta_aliquota, ritenuta_tipo, cassa_previdenziale, bollo_importo, trattenuta_garanzia, netto_a_pagare",
    )
    .eq("id", fatturaId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!f) return null;

  const [quote, oda, costo, fornitore, suggerita, subappalto] = await Promise.all([
    db.from("fattura_ricevuta_ordini").select("importo, purchase_orders(id, oda_number, orders(id, order_code))").eq("fattura_id", fatturaId).eq("company_id", companyId),
    f.purchase_order_id
      ? db.from("purchase_orders").select("id, oda_number, orders(id, order_code)").eq("id", f.purchase_order_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    f.company_cost_id
      ? db.from("company_costs").select("id, amount, category, allocations, orders(id, order_code)").eq("id", f.company_cost_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    f.fornitore_id
      ? db.from("suppliers").select("id, name, tipo").eq("id", f.fornitore_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    f.order_id_suggerito
      ? db.from("orders").select("id, order_code, client_name, description").eq("id", f.order_id_suggerito).eq("company_id", companyId).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
    f.contratto_subappalto_id
      ? db.from("contratti_subappalto").select("id, numero_contratto").eq("id", f.contratto_subappalto_id).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Il fornitore dell'anagrafica, se non è collegato: stessa partita IVA o stesso codice
  // fiscale, e l'altro identificativo che non contraddice la fattura (come
  // receipt_supplier_check, che altrimenti rifiuta il collegamento).
  let candidatiFornitore: Dettaglio["candidatiFornitore"] = [];
  const schedeDiscordanti: Dettaglio["schedeDiscordanti"] = [];
  let daCollegareStessoCedente: string[] = [];
  const piva = chiaveFiscale(f.cedente_piva);
  const cf = chiaveFiscale(f.cedente_cf);
  // Senza codici si riconosce dal nome, se è di un fornitore solo: niente doppioni con «Aggiungi ai fornitori».
  if (!f.fornitore_id && !piva && !cf && f.cedente_ragione_sociale) {
    const { data: idNome } = await db.rpc("fornitore_per_nome", { p_company_id: companyId, p_nome: String(f.cedente_ragione_sociale) });
    if (idNome) {
      const { data: scheda } = await db.from("suppliers").select("id, name").eq("id", idNome).eq("company_id", companyId).maybeSingle();
      if (scheda) candidatiFornitore = [{ id: String(scheda.id), name: String(scheda.name ?? "Fornitore") }];
    }
  }
  if (!f.fornitore_id && (piva || cf)) {
    const filtri = [piva && `vat_number.ilike.%${piva}%`, cf && `fiscal_code.ilike.%${cf}%`].filter(Boolean).join(",");
    const [sup, stesse] = await Promise.all([
      db.from("suppliers").select("id, name, vat_number, fiscal_code").eq("company_id", companyId).or(filtri).limit(20),
      db.from("fatture_ricevute").select("id").eq("company_id", companyId).is("fornitore_id", null)
        .eq(f.cedente_piva ? "cedente_piva" : "cedente_cf", f.cedente_piva || f.cedente_cf).limit(500),
    ]);
    const compatibile = (a: string, b: string) => !a || !b || a === b;
    for (const x of (sup.data ?? []) as Riga[]) {
      const sp = chiaveFiscale(x.vat_number), sc = chiaveFiscale(x.fiscal_code);
      if (!((piva && sp === piva) || (cf && sc === cf))) continue;
      const scheda = { id: String(x.id), name: String(x.name ?? "Fornitore") };
      (compatibile(piva, sp) && compatibile(cf, sc) ? candidatiFornitore : schedeDiscordanti).push(scheda);
    }
    daCollegareStessoCedente = ((stesse.data ?? []) as Riga[]).map((x) => String(x.id));
    if (!daCollegareStessoCedente.includes(fatturaId)) daCollegareStessoCedente.push(fatturaId);
  }

  const ordini: Dettaglio["ordini"] = [];
  for (const q of (quote.data ?? []) as Riga[]) {
    const po = (Array.isArray(q.purchase_orders) ? q.purchase_orders[0] : q.purchase_orders) as Riga | null;
    if (po?.id) ordini.push({ id: String(po.id), oda_number: String(po.oda_number ?? "ODA"), importo: Number(q.importo) || null, commessa: commessaDi(po.orders) });
  }
  if (oda.data && !ordini.some((o) => o.id === oda.data.id)) {
    ordini.push({ id: oda.data.id, oda_number: oda.data.oda_number ?? "ODA", importo: null, commessa: commessaDi(oda.data.orders) });
  }
  const allocazioni = Array.isArray(costo.data?.allocations) ? costo.data.allocations : [];
  return {
    fattura: f,
    ordini,
    costo: costo.data
      ? { id: costo.data.id, amount: costo.data.amount ?? null, category: costo.data.category ?? null, commessa: commessaDi(costo.data.orders), ripartito: allocazioni.length > 1 }
      : null,
    fornitore: fornitore.data ?? null,
    candidatiFornitore,
    schedeDiscordanti,
    daCollegareStessoCedente,
    suggerita: suggerita.data
      ? { id: suggerita.data.id, order_code: suggerita.data.order_code, nome: suggerita.data.client_name || suggerita.data.description || "" }
      : null,
    subappalto: subappalto.data ?? null,
  };
}

export function riepilogoQueryKey(fatturaId: string | null, companyId?: string | null) {
  return ["fattura-ricevuta-riepilogo", companyId, fatturaId] as const;
}

interface PropsRiepilogo {
  fatturaId: string | null;
  companyId: string | null | undefined;
  onClose: () => void;
  azioni?: AzioniRiepilogo;
}

export function RiepilogoFatturaRicevuta(props: PropsRiepilogo) {
  return <ContenutoRiepilogo key={`${props.companyId}-${props.fatturaId}`} {...props} />;
}

function ContenutoRiepilogo({
  fatturaId,
  companyId,
  onClose,
  azioni = {},
}: PropsRiepilogo) {
  const isMobile = useIsMobile();
  // In mezzo allo schermo come gli altri documenti; da telefono resta il foglio dal basso.
  const Radice = isMobile ? Sheet : Dialog;
  const Contenuto = (isMobile ? SheetContent : DialogContent) as typeof DialogContent;
  const { data: d, isLoading, error } = useQuery({
    queryKey: riepilogoQueryKey(fatturaId, companyId),
    enabled: !!fatturaId && !!companyId,
    queryFn: () => leggiDettaglio(fatturaId!, companyId!),
  });

  const permessi = usePermissions();
  const [confronto, setConfronto] = useState(false);
  const [pagamenti, setPagamenti] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const aggiorna = () => {
    queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
    queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
  };
  // Collega al fornitore questa fattura e le altre dello stesso cedente ancora senza.
  const collegaFornitore = useMutation({
    mutationFn: async (supplierId: string) => {
      const ids = d!.daCollegareStessoCedente;
      const { data, error } = await (supabase as any).rpc("collega_fornitore_ricevute", {
        p_company_id: companyId, p_invoice_ids: ids, p_supplier_id: supplierId,
      });
      if (error) throw error;
      return Number(data) || ids.length;
    },
    onSuccess: (n) => {
      aggiorna();
      toast.success(n > 1 ? `Collegate al fornitore ${n} fatture` : "Fattura collegata al fornitore");
    },
    onError: (e: Error) => toast.error("Collegamento non riuscito", { description: e.message }),
  });
  // Il cedente non è in anagrafica: la scheda nasce dai dati della fattura.
  const aggiungiFornitore = useMutation({
    mutationFn: async () => {
      const x = d!.fattura;
      const { data, error } = await (supabase as any).from("suppliers").insert({
        company_id: companyId,
        name: String(x.cedente_ragione_sociale || "Fornitore"),
        vat_number: x.cedente_piva || null,
        fiscal_code: x.cedente_cf || null,
        address: x.cedente_indirizzo || null,
        postal_code: x.cedente_cap || null,
        city: x.cedente_comune || null,
        province: x.cedente_provincia || null,
        country: x.cedente_paese || null,
      }).select("id").single();
      if (error) {
        if (error.code === "42501") throw new Error("Non hai il permesso di aggiungere fornitori: chiedi all'amministratore.");
        throw error;
      }
      return String(data.id);
    },
    onSuccess: (id) => collegaFornitore.mutate(id),
    onError: (e: Error) => toast.error("Fornitore non aggiunto", { description: e.message }),
  });
  // La commessa senza ordine d'acquisto: commessa_collega_fattura_ricevuta (la stessa
  // della scheda commessa) contabilizza se serve e porta il costo sulla commessa.
  const [scegliCommessa, setScegliCommessa] = useState(false);
  const collegaCommessa = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await (supabase as any).rpc("commessa_collega_fattura_ricevuta", { p_fattura_id: fatturaId, p_order_id: orderId });
      if (error) throw error;
      return data as { esito: string };
    },
    onSuccess: (esito) => {
      setScegliCommessa(false);
      aggiorna();
      queryClient.invalidateQueries({ queryKey: ["oda-contabilita"] });
      toast.success(esito?.esito === "contabilizzata_e_collegata" ? "Fattura contabilizzata e messa sulla commessa" : "Fattura messa sulla commessa");
    },
    onError: (e: Error) => toast.error("Commessa non collegata", { description: e.message }),
  });
  const occupato = collegaFornitore.isPending || aggiungiFornitore.isPending || collegaCommessa.isPending;

  const f = d?.fattura;
  const righe = useMemo(() => righeLeggibili(f?.righe), [f?.righe]);
  const aliquote = useMemo(() => riepilogoIvaLeggibile(f?.riepilogo_iva, righe), [f?.riepilogo_iva, righe]);
  // Il conto di costo riga per riga: dove una fattura mette insieme costi diversi.
  const contiSalvati = useMemo(() => {
    const c = f?.conti_righe;
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, string>) : {};
  }, [f?.conti_righe]);
  const contiRighe = useContiRighe({ companyId: companyId ?? "", fatturaId: String(f?.id ?? ""), salvati: contiSalvati, righe, onCambiato: aggiorna });
  const contiPerRiga = !!f && permessi.canViewCosts && !permessi.solaLettura && f.stato !== "rifiutata" && righe.length > 1;
  const nota = String(f?.tipo_documento ?? "") === "TD04";
  // Con la contabilità generale accesa una riga può diventare un cespite (registro dei beni ammortizzabili).
  const cespitiPerRiga = !!f && contiRighe.modo === "piano" && permessi.canViewCosts && !permessi.solaLettura && f.stato !== "rifiutata" && !nota;
  const cespitiFattura = useCespitiDellaFattura(companyId ?? "", String(f?.id ?? ""), cespitiPerRiga);
  const haXml = !!f && (Number(f.xml_bytes) > 0 || !!f.xml_url);
  const imponibile = f?.imponibile_totale != null ? Number(f.imponibile_totale) : aliquote.reduce((s, a) => s + a.imponibile, 0);
  const iva = f?.iva_totale != null ? Number(f.iva_totale) : aliquote.reduce((s, a) => s + a.imposta, 0);
  const totale = f?.totale_documento != null ? Number(f.totale_documento) : imponibile + iva;
  const anomalie = Array.isArray(f?.anomalie_rilevate)
    ? (f!.anomalie_rilevate as unknown[])
        .map((a) => (typeof a === "string" ? a : String((a as Riga | null)?.messaggio ?? (a as Riga | null)?.descrizione ?? "")))
        .filter(Boolean)
    : [];
  const indirizzo = f
    ? [f.cedente_indirizzo, [f.cedente_cap, f.cedente_comune, f.cedente_provincia ? `(${f.cedente_provincia})` : ""].filter(Boolean).join(" ")]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <>
    {pagamenti && <ExpensePaymentDialog key={pagamenti} costId={pagamenti} onClose={() => { setPagamenti(null); aggiorna(); }} />}
    {confronto && f && companyId && <ConfrontoFatturaDialog key={`${companyId}-${fatturaId}`} fattura={f} companyId={companyId} ordineIds={d.ordini.map((o) => o.id)} puoModificare={!!permessi.canViewCosts && !permessi.solaLettura} onClose={() => setConfronto(false)} onVersioneCompleta={azioni.onVersioneCompleta} />}
    <Radice open={!!fatturaId && !confronto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Contenuto
        {...(isMobile ? { side: "bottom" as const } : { onOpenAutoFocus: (e: Event) => e.preventDefault() })}
        className={`${isMobile ? "max-h-[90dvh] overflow-y-auto rounded-t-2xl px-4 pb-6" : "block max-h-[92dvh] max-w-3xl overflow-y-auto"} [&_dl_a]:min-h-0 [&_dl_a]:min-w-0`}
      >
        {isLoading || !f ? (
          <div className="space-y-3 pt-6">
            {error ? (
              <p className="text-sm text-destructive">Non riesco a leggere la fattura: {(error as Error).message}</p>
            ) : (
              <>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-40 w-full" />
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <SheetHeader className="text-left space-y-1">
              <SheetTitle className="pr-6 text-lg leading-tight">{String(f.cedente_ragione_sociale || "Fornitore senza nome")}</SheetTitle>
              <SheetDescription className="text-sm">
                {nomeTipoDocumento(String(f.tipo_documento ?? ""))} n. {String(f.numero_fattura ?? "—")} del {formatDateShort(String(f.data_fattura ?? ""))}
                {f.data_ricezione_sdi ? ` · arrivata dallo SDI il ${formatDateShort(String(f.data_ricezione_sdi))}` : ""}
              </SheetDescription>
            </SheetHeader>

            {permessi.canViewCosts && <Button variant="outline" className="w-full justify-start border-blue-200 bg-blue-50/50 text-blue-900 hover:bg-blue-50" onClick={() => setConfronto(true)}><ArrowLeftRight className="mr-2 h-4 w-4" />Confronta con DDT e ordini</Button>}

            {/* Fornitore: senza dati non resta un riquadro vuoto. */}
            {(f.cedente_piva || f.cedente_cf || indirizzo || f.ai_riassunto || f.categoria_ai) ? (
            <section className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {f.cedente_piva ? <span>P.IVA {String(f.cedente_piva)}</span> : null}
                {f.cedente_cf && f.cedente_cf !== f.cedente_piva ? <span>C.F. {String(f.cedente_cf)}</span> : null}
                {indirizzo ? <span>{indirizzo}</span> : null}
              </div>
              {f.ai_riassunto ? (
                <p className="flex gap-1.5 pt-1"><Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />{String(f.ai_riassunto)}</p>
              ) : null}
              {f.categoria_ai ? (
                <div className="pt-1"><Badge variant="secondary">{String(f.categoria_ai)}{f.sottocategoria_ai ? ` · ${String(f.sottocategoria_ai)}` : ""}</Badge></div>
              ) : null}
            </section>
            ) : null}

            {anomalie.length > 0 && (
              <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> Da controllare</p>
                <ul className="mt-1 list-disc pl-5">{anomalie.map((a) => <li key={a}>{a}</li>)}</ul>
              </section>
            )}

            {/* Collegamenti */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="h-4 w-4" /> A cosa è collegata</h3>
              <dl className="grid grid-cols-[6.5rem_1fr] items-baseline gap-x-3 gap-y-2 text-sm sm:grid-cols-[8.5rem_1fr]">
                <dt className="text-muted-foreground">Fornitore</dt>
                <dd>
                  {d.fornitore ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {d.fornitore.name}
                      {isTipoFornitore(d.fornitore.tipo) ? (
                        <Badge variant="secondary" className="text-[11px]">{INFO_TIPO_FORNITORE[d.fornitore.tipo].etichetta}</Badge>
                      ) : (
                        <Link to="/azienda/documenti/tipi-fornitori" className="text-xs text-primary underline-offset-2 hover:underline">Dai un tipo</Link>
                      )}
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-muted-foreground">Non in anagrafica</span>
                      {d.candidatiFornitore.length === 1 ? (
                        <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" disabled={occupato}
                          onClick={() => collegaFornitore.mutate(d.candidatiFornitore[0].id)}>
                          Collega a {d.candidatiFornitore[0].name}
                          {d.daCollegareStessoCedente.length > 1 ? ` (con le altre ${d.daCollegareStessoCedente.length - 1})` : ""}
                        </Button>
                      ) : d.candidatiFornitore.length === 0 && d.schedeDiscordanti.length > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          C'è già «{d.schedeDiscordanti[0].name}» con questa partita IVA ma un codice fiscale diverso: correggi la scheda in Anagrafiche
                        </span>
                      ) : d.candidatiFornitore.length > 1 ? (
                        <span className="text-xs text-muted-foreground">{d.candidatiFornitore.length} schede con questa partita IVA: scegli in Anagrafiche</span>
                      ) : (
                        <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" disabled={occupato}
                          onClick={() => aggiungiFornitore.mutate()}>
                          Aggiungi ai fornitori
                          {d.daCollegareStessoCedente.length > 1 ? ` (e collega le sue ${d.daCollegareStessoCedente.length} fatture)` : ""}
                        </Button>
                      )}
                    </span>
                  )}
                </dd>

                <dt className="text-muted-foreground">Ordine d'acquisto</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {d.ordini.length === 0 ? <span className="text-muted-foreground">Nessuno</span> : d.ordini.map((o) => (
                    <Link key={o.id} to={`/azienda/ordini-acquisto/${o.id}`} className="underline-offset-2 hover:underline">
                      <Badge variant="outline">{o.oda_number}{o.importo != null ? ` · ${formatCurrency(o.importo)}` : ""}</Badge>
                    </Link>
                  ))}
                  {azioni.onCollegaOrdine && f.stato !== "contabilizzata" ? (
                    <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" onClick={azioni.onCollegaOrdine}>
                      {d.ordini.length ? "Cambia" : "Collega"}
                    </Button>
                  ) : null}
                </dd>

                <dt className="text-muted-foreground">Commessa</dt>
                <dd className="space-y-1.5">
                  {(() => {
                    const commesse = [d.costo?.commessa, ...d.ordini.map((o) => o.commessa)].filter((c): c is { id: string; order_code: string } => !!c);
                    const uniche = [...new Map(commesse.map((c) => [c.id, c])).values()];
                    // Si sceglie qui solo senza ordine d'acquisto (con l'ordine la commessa viene
                    // da lì) e se il costo non è ripartito su più commesse.
                    // Spese generali (telefonia, luce, banca…): non vanno su una commessa.
                    const generale = isTipoFornitore(d.fornitore?.tipo) && INFO_TIPO_FORNITORE[d.fornitore!.tipo as keyof typeof INFO_TIPO_FORNITORE].commessa === "no";
                    if (generale && !uniche.length) {
                      return <span className="text-muted-foreground">Non serve: {INFO_TIPO_FORNITORE[d.fornitore!.tipo as keyof typeof INFO_TIPO_FORNITORE].etichetta.toLowerCase()}</span>;
                    }
                    const sceglibile = d.ordini.length === 0 && !d.costo?.ripartito && f.stato !== "rifiutata";
                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {d.costo?.ripartito ? (
                            <>
                              <span>Ripartita su più commesse</span>
                              {azioni.onCollegaCommesse && d.ordini.length === 0 ? <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" onClick={azioni.onCollegaCommesse}>Cambia</Button> : null}
                            </>
                          )
                            : uniche.length ? uniche.map((c) => (
                              <Link key={c.id} to={`/azienda/ordini/${c.id}`} className="underline-offset-2 hover:underline"><Badge variant="outline">{c.order_code}</Badge></Link>
                            )) : <span className="text-muted-foreground">Nessuna</span>}
                          {sceglibile && !scegliCommessa ? (
                            <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" disabled={occupato} onClick={() => (azioni.onCollegaCommesse ? azioni.onCollegaCommesse() : setScegliCommessa(true))}>
                              {uniche.length ? "Cambia" : "Scegli commessa"}
                            </Button>
                          ) : null}
                        </div>
                        {sceglibile && !uniche.length && d.suggerita && !scegliCommessa ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span className="text-muted-foreground">L'AI suggerisce</span>
                            <Badge variant="outline" className="border-dashed">{d.suggerita.order_code}{d.suggerita.nome ? ` · ${d.suggerita.nome}` : ""}</Badge>
                            <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" disabled={occupato} onClick={() => collegaCommessa.mutate(d.suggerita!.id)}>
                              Collega
                            </Button>
                          </div>
                        ) : null}
                        {sceglibile && scegliCommessa ? (
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <OrderSelectCombobox
                                filtroIniziale="all"
                                companyId={companyId ?? undefined}
                                value={undefined}
                                disabled={occupato}
                                placeholder="Cerca la commessa…"
                                onChange={(id) => collegaCommessa.mutate(id)}
                              />
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setScegliCommessa(false)}>Annulla</Button>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </dd>

                {permessi.canViewCosts && (
                  <CollegamentiFattura fatturaId={String(f.id)} companyId={companyId} puoModificare={!permessi.solaLettura} fornitoreId={d.fornitore?.id}
                    numeroContratto={d.subappalto?.numero_contratto} contrattoId={f.contratto_subappalto_id ? String(f.contratto_subappalto_id) : null}
                    salId={f.sal_subappaltatore_id ? String(f.sal_subappaltatore_id) : null} cedentePiva={f.cedente_piva ? String(f.cedente_piva) : null}
                    notaDiCredito={isNotaCreditoRicevuta(String(f.tipo_documento ?? ""))}
                    primaNotaId={f.prima_nota_id ? String(f.prima_nota_id) : null} costoId={f.company_cost_id ? String(f.company_cost_id) : null}
                    vaiPrimaNota={permessi.canViewPrimaNota} vaiTesoreria={permessi.canViewTesoreria} vaiEmail={permessi.canViewMarketingEmail} />
                )}
                <dt className="text-muted-foreground">Verifica</dt>
                <dd>
                  <VerificaFatturaPill id={String(f.id)} numero={f.numero_fattura ? String(f.numero_fattura) : null} puoCambiare={!!permessi.canViewCosts && !permessi.solaLettura}
                    verificata={fatturaVerificata({ stato: String(f.stato ?? ""), verifica_manuale: f.verifica_manuale ? String(f.verifica_manuale) : null })}
                    daRettificare={f.verifica_manuale === "da_rettificare"} motivoRettifica={f.rettifica_motivo ? String(f.rettifica_motivo) : null} />
                  {f.verifica_manuale === "da_rettificare" && f.rettifica_motivo ? <p className="mt-1 text-xs text-muted-foreground">{String(f.rettifica_motivo)}</p> : null}
                </dd>

                <dt className="text-muted-foreground">Pagamento</dt>
                <dd>
                  {d.costo && permessi.canViewCosts ? (
                    <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" onClick={() => setPagamenti(d.costo!.id)}>Pagamenti e residuo</Button>
                  ) : (
                    <PagamentoRicevutaCella forma="pulsante" id={String(f.id)} numero={String(f.numero_fattura ?? "")} tipo={String(f.tipo_documento ?? "")} pagataIl={f.pagata_il ? String(f.pagata_il) : null} />
                  )}
                </dd>

                {permessi.canViewCosts && f.stato !== "rifiutata" && !isNotaCreditoRicevuta(String(f.tipo_documento ?? "")) ? (
                  <>
                    <dt className="text-muted-foreground">Conto di costo</dt>
                    <dd>
                      <ContoDiCosto
                        companyId={companyId!}
                        fatturaId={String(f.id)}
                        costoId={d.costo?.id ?? null}
                        attuale={d.costo ? d.costo.category : (f.categoria_ai ? String(f.categoria_ai) : null)}
                        onCambiato={aggiorna}
                      />
                    </dd>
                  </>
                ) : null}

                <dt className="text-muted-foreground">Nei costi</dt>
                <dd>
                  {d.costo ? (
                    <span>Sì, contabilizzata{d.costo.amount != null ? ` (${formatCurrency(d.costo.amount)})` : ""}</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Non ancora contabilizzata</span>
                      {azioni.onContabilizza && f.stato !== "rifiutata" ? (
                        <Button variant="link" size="sm" className="h-auto min-h-0 min-w-0 p-0 text-xs" onClick={azioni.onContabilizza}>Contabilizza</Button>
                      ) : null}
                    </span>
                  )}
                </dd>

              </dl>
              {azioni.extraCollegamenti?.(d)}
            </section>

            {/* Righe */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><Receipt className="h-4 w-4" /> Cosa fattura</h3>
              {righe.length === 0 ? (
                <p className="text-sm text-muted-foreground">Il dettaglio delle righe non è arrivato con questa fattura: ci sono solo i totali.</p>
              ) : (
                <>
                {contiPerRiga ? <ProposteContiRighe conti={contiRighe} /> : null}
                {/* Sul telefono un elenco: in tabella la descrizione finiva su una colonna di tre parole. */}
                <ul className="divide-y rounded-lg border sm:hidden">
                  {righe.map((r, i) => (
                    <li key={i} className="px-3 py-2 text-sm">
                      <p className="whitespace-pre-line">{r.descrizione || "—"}</p>
                      <p className="mt-0.5 flex justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {r.quantita != null && r.prezzoUnitario != null
                            ? `${r.quantita.toLocaleString("it-IT", { maximumFractionDigits: 3 })} × ${formatCurrency(r.prezzoUnitario)}`
                            : ""}
                          {` · ${r.aliquota ? `IVA ${String(r.aliquota).replace(".", ",")}%` : nomeNatura(r.natura) ?? "IVA 0%"}`}
                        </span>
                        <span className="font-medium text-foreground tabular-nums">{formatCurrency(r.imponibile)}</span>
                      </p>
                      {contiPerRiga && r.imponibile !== 0 ? <div className="mt-1.5"><ContoRigaMenu chiave={r.chiave} conti={contiRighe} /></div> : null}
                      {cespitiPerRiga && r.imponibile > 0 ? (
                        <div className="mt-1"><CespiteDaRiga companyId={companyId!} fatturaId={String(f.id)} chiave={r.chiave} descrizione={r.descrizione ?? ""} gia={cespitiFattura.data?.get(r.chiave)} /></div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto rounded-lg border sm:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Descrizione</th>
                        <th className="px-2 py-1.5 text-right font-medium">Q.tà</th>
                        <th className="px-2 py-1.5 text-right font-medium">Prezzo</th>
                        <th className="px-2 py-1.5 text-right font-medium">Importo</th>
                        <th className="px-2 py-1.5 text-right font-medium">IVA</th>
                        {contiPerRiga ? <th className="px-2 py-1.5 text-left font-medium">Conto di costo</th> : null}
                        {cespitiPerRiga ? <th className="px-2 py-1.5" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {righe.map((r, i) => (
                        <tr key={i} className="border-t align-baseline">
                          <td className="px-2 py-1.5 whitespace-pre-line">{r.descrizione || "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.quantita != null ? r.quantita.toLocaleString("it-IT", { maximumFractionDigits: 3 }) : ""}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.prezzoUnitario != null ? formatCurrency(r.prezzoUnitario) : ""}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.imponibile)}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground" title={nomeNatura(r.natura) ?? undefined}>
                            {r.aliquota ? `${String(r.aliquota).replace(".", ",")}%` : r.natura?.toUpperCase().startsWith("N6") ? "RC" : r.natura ? r.natura : "0%"}
                          </td>
                          {contiPerRiga ? <td className="px-2 py-1">{r.imponibile !== 0 ? <ContoRigaMenu chiave={r.chiave} conti={contiRighe} /> : null}</td> : null}
                          {cespitiPerRiga ? (
                            <td className="px-2 py-1 text-right">{r.imponibile > 0 ? <CespiteDaRiga companyId={companyId!} fatturaId={String(f.id)} chiave={r.chiave} descrizione={r.descrizione ?? ""} gia={cespitiFattura.data?.get(r.chiave)} /> : null}</td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>

            {/* Totali */}
            <section className="ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Imponibile</span><span className="tabular-nums">{formatCurrency(imponibile)}</span></div>
              {aliquote.map((a, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>{etichettaAliquota(a)} su {formatCurrency(a.imponibile)}</span>
                  <span className="tabular-nums">{formatCurrency(a.imposta)}</span>
                </div>
              ))}
              {aliquote.length === 0 ? (
                <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="tabular-nums">{formatCurrency(iva)}</span></div>
              ) : null}
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>{nota ? "Totale nota di credito" : "Totale"}</span>
                <span className="tabular-nums">{formatCurrency(totale)}</span>
              </div>
            </section>

            {/* Pagamento (01/11/2026): rate, metodo e quello che cambia quanto si paga al fornitore. */}
            {(() => {
              const p = nota ? null : pagamentoDaMostrare(f as Record<string, unknown>);
              if (!p) return null;
              const giorno = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "senza data");
              return (
                <section aria-label="Pagamento" className="space-y-2 rounded-lg border p-3 text-sm">
                  <p className="font-semibold">Pagamento{p.condizioni ? <span className="font-normal text-muted-foreground"> · {p.condizioni}</span> : null}</p>
                  {p.rate.length > 0 && (
                    <ul className="divide-y">
                      {p.rate.map((r, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-x-3 py-1">
                          <span>{p.rate.length > 1 ? `Rata ${i + 1} · ` : ""}{giorno(r.scadenza)}{r.metodo ? ` · ${r.metodo}` : ""}{r.pagataIl ? <span className="text-emerald-700"> · pagata il {giorno(r.pagataIl)}</span> : null}</span>
                          <span className="tabular-nums">{r.importo != null ? formatCurrency(r.importo) : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.cassa ? <p className="flex justify-between text-muted-foreground"><span>Cassa previdenziale (nell'imponibile)</span><span className="tabular-nums">{formatCurrency(p.cassa)}</span></p> : null}
                  {p.bollo ? <p className="flex justify-between text-muted-foreground"><span>Bollo</span><span className="tabular-nums">{formatCurrency(p.bollo)}</span></p> : null}
                  {p.ritenuta ? (
                    <p className="flex justify-between text-amber-800">
                      <span>Ritenuta d'acconto{p.ritenuta.aliquota ? ` ${p.ritenuta.aliquota.toLocaleString("it-IT")}%` : ""}: la versi tu con F24 (1040) il 16 del mese dopo il pagamento</span>
                      <span className="tabular-nums">− {formatCurrency(p.ritenuta.importo)}</span>
                    </p>
                  ) : null}
                  {p.garanzia ? (
                    <p className="flex justify-between text-amber-800"><span>Trattenuta a garanzia: si paga allo svincolo</span><span className="tabular-nums">{formatCurrency(p.garanzia)}</span></p>
                  ) : null}
                  {p.netto != null && (p.ritenuta || p.rate.length > 1) ? (
                    <p className="flex justify-between border-t pt-1 font-semibold"><span>Da pagare al fornitore</span><span className="tabular-nums">{formatCurrency(p.netto)}</span></p>
                  ) : null}
                </section>
              );
            })()}

            {/* La contabile del bonifico, il DDT, il contratto: si ritrovano dalla fattura. */}
            <AllegatiFattura companyId={companyId} madre={{ fatturaRicevutaId: String(f.id) }} />

            {f.note ? <p className="text-sm"><span className="text-muted-foreground">Note: </span>{String(f.note)}</p> : null}
            <NoteInterneFattura tabella="fatture_ricevute" id={String(f.id)} companyId={companyId} valore={f.note_interne ? String(f.note_interne) : null}
              puoModificare={!permessi.solaLettura} chiaviDaAggiornare={["fatture-ricevute", "fattura-ricevuta-riepilogo"]} />

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {haXml && azioni.onVersioneCompleta ? (
                <Button variant="outline" size="sm" onClick={azioni.onVersioneCompleta}>
                  <FileText className="h-4 w-4 mr-1.5" /> Versione completa e stampa
                </Button>
              ) : null}
              {haXml && azioni.onScaricaOriginale ? (
                <Button variant="ghost" size="sm" onClick={azioni.onScaricaOriginale}>
                  <Download className="h-4 w-4 mr-1.5" /> Scarica il file originale
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Contenuto>
    </Radice>
    </>
  );
}
