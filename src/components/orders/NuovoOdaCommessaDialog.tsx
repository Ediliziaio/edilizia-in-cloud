import { condizioniPagamentoFornitore } from "@/lib/documentiOperativi/fornitore";
/**
 * «Nuovo ordine» dalla commessa: un popup solo per fare l'ordine d'acquisto
 * (30/10/2026). Come si ordina, a chi, cosa (articoli della commessa ancora da
 * comprare e righe libere), quando arriva. Nasce in bozza: l'invio al
 * fornitore resta un gesto della pagina dell'ordine.
 */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileText, Loader2, Package, Plus, ScanText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle,  } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useMaterialProcurement } from "@/hooks/useMaterialProcurement";
import { pendingMaterials, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { queryKeys } from "@/lib/queryKeys";
import { ODA_ORIGINI, ODA_ORIGINE_INFO, type OdaOrigine } from "@/lib/odaOrigine";
import { formatCurrency } from "@/lib/formatters";
import { leggiImporto } from "@/lib/fatturazione/quoteOrdini";
import {
  chiaveVoce, erroreNuovoOda, rigaLibera, righeDaElenco, righeDagliArticoli, righeInOrdine, righePerDatabase, totaliNuovoOda,
  type RigaNuovoOda,
} from "@/lib/orders/nuovoOdaCommessa";
import { logger } from "@/utils/logger";
import { ArticleCombobox, type ArticleTemplateData } from "./ArticleCombobox";
import { caricaArticoliCatalogo } from "@/lib/listino/catalogoArticoli";
import { caricaVociListino } from "@/lib/listino/vociListino";
import { valoriArticoloAcquisto } from "@/lib/orders/articoloAcquisto";
import {
  confrontoTotaleDocumento, fornitoreDaDocumento, leggiDocumentoOda, propostaDaLettura, type OrdineFornitoreLetto,
} from "@/lib/orders/letturaOdaDocumento";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { ACCEPT_DOCUMENTI_DDT, erroreDocumento } from "@/lib/ddt/preparaDocumento";
import { caricaDocumentoOda, eliminaDocumentoOda, registraDocumentoOda } from "@/lib/orders/documentoOda";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderCode?: string | null;
  /** Gli articoli materiali della commessa. */
  items: ProcurementItem[];
}

const numeroTesto = (v: number) => (Number.isFinite(v) ? String(v).replace(".", ",") : "");

export function NuovoOdaCommessaDialog({ open, onOpenChange, orderId, orderCode, items }: Props) {
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const { suppliers } = useOperationalSuppliers();
  const coverage = useMaterialProcurement(items);
  const daComprare = useMemo(() => pendingMaterials(items, coverage.data ?? []), [items, coverage.data]);

  const [origine, setOrigine] = useState<OdaOrigine | null>(null);
  const [fornitore, setFornitore] = useState<string | null>(null);
  // Le righe degli articoli si ricavano da cosa resta da comprare; qui solo
  // quello che la persona ha cambiato (spunta, quantità, prezzo).
  const [modifiche, setModifiche] = useState<Record<string, Partial<RigaNuovoOda>>>({});
  const [libere, setLibere] = useState<RigaNuovoOda[]>([]);
  const [consegna, setConsegna] = useState("");
  const [riferimento, setRiferimento] = useState("");
  const [note, setNote] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [contatore, setContatore] = useState(1);
  // «Incolla un elenco»: una cosa per riga, diventano righe dell'ordine.
  const [elencoAperto, setElencoAperto] = useState(false);
  const [elenco, setElenco] = useState("");
  // «Su documento» (24/11/2026): il modulo del fornitore o l'ordine firmato. Si legge e
  // precompila il popup; alla creazione diventa l'allegato dell'ordine e della commessa.
  const [documento, setDocumento] = useState<File | null>(null);
  const [lettura, setLettura] = useState<"no" | "leggo" | "letto" | "errore">("no");
  const [esitoLettura, setEsitoLettura] = useState<{ righe: number; abbinate: number; fornitoreLetto: string | null; fornitoreTrovato: boolean; avvisi: string[]; errore?: string } | null>(null);
  // Cambia a ogni lettura: le righe ripartono dai valori letti (i campi tengono il testo scritto).
  const [versione, setVersione] = useState(0);
  // La lettura intera: serve al confronto dei totali e a creare il fornitore che non c'è.
  const [documentoLetto, setDocumentoLetto] = useState<OrdineFornitoreLetto | null>(null);
  const [creoFornitore, setCreoFornitore] = useState(false);
  const inputDocumento = useRef<HTMLInputElement>(null);
  // Una lettura che arriva dopo «Togli», un altro file o la chiusura non tocca più il popup.
  const letturaInCorso = useRef(0);

  // Catalogo e listino prodotti, con le stesse chiavi di cache del menu delle righe:
  // servono a riconoscere le voci dell'elenco incollato.
  const catalogo = useQuery({
    queryKey: ["article-templates", companyId],
    queryFn: () => caricaArticoliCatalogo(companyId!),
    enabled: open && !!companyId,
  });
  const listino = useQuery({
    queryKey: ["article-combobox-listino", companyId, "acquisto"],
    queryFn: () => caricaVociListino(companyId!, { uso: "acquisto" }),
    enabled: open && !!companyId,
  });
  const perNome = useMemo(() => {
    const m = new Map<string, ArticleTemplateData>();
    for (const t of [...(listino.data ?? []), ...(catalogo.data ?? [])]) m.set(chiaveVoce(t.name), t);
    return m;
  }, [catalogo.data, listino.data]);
  const daElenco = useMemo(() => righeDaElenco(elenco), [elenco]);
  const aggiungiElenco = () => {
    const nuove = daElenco.map((r, i) => {
      const t = perNome.get(chiaveVoce(r.description));
      const base = rigaLibera(`libera:${contatore + i}`);
      if (!t) return { ...base, ...r };
      const v = valoriArticoloAcquisto(t);
      return { ...base, ...r, description: t.name, unit_of_measure: r.unit_of_measure !== "pz" ? r.unit_of_measure : v.unit_of_measure,
        unit_price: v.unit_price, price_pending: !(v.unit_price > 0), vat_rate: v.vat_rate };
    });
    setLibere((rr) => [...rr, ...nuove]);
    setContatore((c) => c + nuove.length);
    setElenco("");
    setElencoAperto(false);
  };

  const attivi = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers]);
  const nomeFornitore = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  // Spuntati in partenza gli articoli del fornitore scelto.
  const articoli = useMemo(
    () => righeDagliArticoli(daComprare, fornitore).map((r) => ({ ...r, ...modifiche[r.key] })),
    [daComprare, fornitore, modifiche],
  );
  const righe = useMemo(() => [...articoli, ...libere], [articoli, libere]);

  const chiudi = (v: boolean) => {
    if (salvando) return;
    if (!v) {
      setOrigine(null); setFornitore(null); setModifiche({}); setLibere([]); setConsegna(""); setRiferimento(""); setNote("");
      setElenco(""); setElencoAperto(false);
      setDocumento(null); setLettura("no"); setEsitoLettura(null); setDocumentoLetto(null); letturaInCorso.current++;
    }
    onOpenChange(v);
  };

  const cambia = (key: string, patch: Partial<RigaNuovoOda>) => {
    if (key.startsWith("art:")) setModifiche((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
    else setLibere((rr) => rr.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const leggi = async (file: File) => {
    if (!companyId) return;
    const turno = ++letturaInCorso.current;
    setLettura("leggo");
    setEsitoLettura(null);
    setDocumentoLetto(null);
    try {
      const letto = await leggiDocumentoOda(file, companyId);
      if (turno !== letturaInCorso.current) return;
      const p = propostaDaLettura(letto, attivi, righeDagliArticoli(daComprare, null));
      if (p.fornitore) setFornitore(p.fornitore.id);
      if (p.consegna) setConsegna(p.consegna);
      if (p.riferimento) setRiferimento(p.riferimento);
      setModifiche(p.modificheArticoli);
      // Una seconda lettura sostituisce le righe della prima, non le raddoppia.
      const nuove = p.libere.map((r, i) => ({ ...r, key: `doc:${contatore + i}` }));
      setLibere((rr) => [...rr.filter((r) => !r.key.startsWith("doc:")), ...nuove]);
      setContatore((c) => c + nuove.length);
      setVersione((v) => v + 1);
      setDocumentoLetto(letto);
      setEsitoLettura({ righe: letto.righe.length, abbinate: p.abbinate, fornitoreLetto: p.fornitoreLetto, fornitoreTrovato: !!p.fornitore, avvisi: p.avvisi });
      setLettura("letto");
    } catch (e) {
      if (turno !== letturaInCorso.current) return;
      setEsitoLettura({ righe: 0, abbinate: 0, fornitoreLetto: null, fornitoreTrovato: false, avvisi: [], errore: messaggioErrore(e) });
      setLettura("errore");
    }
  };

  const scegliDocumento = (file: File | undefined) => {
    if (inputDocumento.current) inputDocumento.current.value = "";
    if (!file) return;
    const problema = erroreDocumento(file);
    if (problema) { toast.error(tr("Documento non caricato"), { description: problema }); return; }
    setDocumento(file);
    void leggi(file);
  };

  const aggiungiFornitore = async () => {
    const nuovo = documentoLetto && companyId ? fornitoreDaDocumento(documentoLetto, companyId) : null;
    if (!nuovo || creoFornitore) return;
    setCreoFornitore(true);
    try {
      const { data, error } = await supabase.from("suppliers").insert(nuovo as never).select("id").single();
      if (error) {
        if (error.code === "42501") throw new Error(tr("Non hai il permesso di aggiungere fornitori: chiedi all'amministratore."));
        throw error;
      }
      await invalidaFornitori(qc);
      setFornitore(String((data as { id: string }).id));
      setEsitoLettura((e) => (e ? { ...e, fornitoreTrovato: true } : e));
      toast.success(tr("{nome} aggiunto ai fornitori", { nome: nuovo.name }), { description: tr("Completa la scheda (indirizzo, pagamento) dalla rubrica quando serve.") });
    } catch (e) {
      toast.error(tr("Fornitore non aggiunto"), { description: messaggioErrore(e) });
    } finally {
      setCreoFornitore(false);
    }
  };

  const errore = erroreNuovoOda({ fornitore, origine, righe });
  const totali = totaliNuovoOda(righe);
  const confronto = documentoLetto ? confrontoTotaleDocumento(documentoLetto, totali) : null;
  const quante = righeInOrdine(righe).length;

  const crea = async () => {
    if (errore || !companyId || !fornitore || !origine || salvando) return;
    setSalvando(true);
    let caricato: string | null = null;
    try {
      // Prima il file, così il percorso entra nell'ordine già alla creazione.
      if (documento) {
        // Un file che non sale non ferma l'ordine: si dice, e si allega poi dalla pagina dell'ordine.
        try { caricato = await caricaDocumentoOda(orderId, documento); }
        catch (e) { toast.warning(tr("Il documento non è stato caricato: l'ordine nasce senza allegato"), { description: messaggioErrore(e) }); }
      }
      const datiFornitore = suppliers.find(s => s.id === fornitore);
      const condizioni = condizioniPagamentoFornitore(datiFornitore || {});
      const { data: po, error } = await supabase.from("purchase_orders").insert({
        company_id: companyId,
        supplier_id: fornitore,
        payment_terms: condizioni === "Da definire con il fornitore" ? null : condizioni,
        payment_method: datiFornitore?.payment_method || null,
        order_id: orderId,
        status: "bozza",
        // Il numero lo dà il trigger, unico per azienda.
        oda_number: "",
        origine,
        expected_delivery_date: consegna || null,
        supplier_reference: riferimento.trim() || null,
        attachment_url: caricato,
        notes: [note.trim(), `Generato da commessa ${orderCode || ""}`.trim()].filter(Boolean).join(" · "),
        created_by: user?.id,
      } as never).select("id, oda_number").single();
      if (error) {
        if (caricato) await eliminaDocumentoOda(caricato);
        throw error;
      }
      const nuovo = po as unknown as { id: string; oda_number: string };
      const { error: errRighe } = await supabase.from("purchase_order_items")
        .insert(righePerDatabase(righe, companyId, nuovo.id) as never);
      if (errRighe) {
        // Mai cancellare un ordine forse salvato: si apre e si controlla.
        toast.error(tr("Ordine creato, ma le righe non sono confermate"), {
          description: tr("Apri la bozza e controlla le righe prima di inviarla."),
          action: { label: tr("Apri"), onClick: () => navigate(`/azienda/ordini-acquisto/${nuovo.id}`) },
        });
      } else {
        toast.success(nuovo.oda_number ? tr("Bozza {numero} creata", { numero: nuovo.oda_number }) : tr("Bozza d'ordine creata"), {
          description: tr(quante === 1 ? "{n} riga · {importo} + IVA. Inviala dalla pagina dell'ordine." : "{n} righe · {importo} + IVA. Inviala dalla pagina dell'ordine.", { n: quante, importo: formatCurrency(totali.imponibile) }),
          action: { label: tr("Apri"), onClick: () => navigate(`/azienda/ordini-acquisto/${nuovo.id}`) },
        });
      }
      if (caricato && documento && user?.id) {
        // Tra i documenti della commessa, visibile a chi vede i costi: ha i prezzi d'acquisto.
        const errAllegato = await registraDocumentoOda({ commessaId: orderId, percorso: caricato, file: documento, userId: user.id });
        if (errAllegato) toast.warning(tr("Ordine creato, ma il documento non è registrato tra quelli della commessa"), { description: errAllegato });
      }
      try {
        const { error: diario } = await supabase.from("order_events" as never).insert({
          company_id: companyId, order_id: orderId, event_type: "ordine_fornitore_creato",
          payload: { po_id: nuovo.id, supplier_id: fornitore, order_code: orderCode, status: "bozza" },
        } as never);
        if (diario) logger.error("[NuovoOdaCommessaDialog] diario non salvato", diario);
      } catch (e) { logger.error("[NuovoOdaCommessaDialog] diario non disponibile", e); }
      refreshMaterialQueries(qc);
      qc.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
      setSalvando(false);
      chiudi(false);
    } catch (e) {
      toast.error(tr("Ordine non creato"), { description: messaggioErrore(e) });
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent struttura="scorrevole" className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-orange-500" />
            {tr("Nuovo ordine d'acquisto")}
          </DialogTitle>
          <DialogDescription>
            {tr("Per la commessa {codice}. Nasce in bozza: lo invii al fornitore dalla pagina dell'ordine.", { codice: orderCode || "" })}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <Label>{tr("Come lo ordini")}</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ODA_ORIGINI.map((o) => {
              const info = ODA_ORIGINE_INFO[o];
              const Icona = info.icona;
              const scelto = origine === o;
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={scelto}
                  onClick={() => setOrigine(o)}
                  className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${scelto ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <Icona className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">{tr(info.titoloBreve)}</span>
                </button>
              );
            })}
          </div>
          {origine && <p className="text-xs text-muted-foreground">{tr(ODA_ORIGINE_INFO[origine].descrizione)}</p>}
        </section>

        {origine && ODA_ORIGINE_INFO[origine].vuoleDocumento && (
          <section className="space-y-2 rounded-md border border-dashed p-3" aria-label={tr("Documento dell'ordine")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{tr(ODA_ORIGINE_INFO[origine].documentoLabel ?? "Documento")}</Label>
              <div className="flex gap-2">
                {documento && lettura !== "leggo" && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void leggi(documento)}>
                    <ScanText className="h-3.5 w-3.5 mr-1" /> {tr("Rileggi")}
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" disabled={lettura === "leggo" || salvando} onClick={() => inputDocumento.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" /> {documento ? tr("Cambia file") : tr("Carica PDF o foto")}
                </Button>
              </div>
            </div>
            <input ref={inputDocumento} type="file" accept={ACCEPT_DOCUMENTI_DDT} className="hidden" aria-label={tr("File del documento d'ordine")}
              onChange={(e) => scegliDocumento(e.target.files?.[0])} />
            {!documento ? (
              <p className="text-xs text-muted-foreground">
                {tr("Carica l'ordine firmato o il modulo del fornitore: lo leggiamo e compiliamo fornitore, righe, prezzi, IVA e consegna. Controlli tutto prima di creare la bozza; il file resta allegato all'ordine.")}
              </p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-1.5 min-w-0">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{documento.name}</span>
                  <button type="button" className="ml-auto text-xs text-muted-foreground underline" disabled={lettura === "leggo"}
                    onClick={() => { setDocumento(null); setLettura("no"); setEsitoLettura(null); setDocumentoLetto(null); letturaInCorso.current++; }}>{tr("Togli")}</button>
                </p>
                {lettura === "leggo" && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {tr("Leggo il documento…")}</p>}
                {lettura === "errore" && esitoLettura?.errore && (
                  <p role="alert" className="text-xs text-red-600">{tr("Lettura non riuscita: {errore} Il file resta allegato: compila i campi a mano.", { errore: esitoLettura.errore })}</p>
                )}
                {lettura === "letto" && esitoLettura && (
                  <div className="text-xs text-muted-foreground space-y-0.5" role="status">
                    <p>
                      {tr(esitoLettura.righe === 1 ? "Letto: {n} riga" : "Letto: {n} righe", { n: esitoLettura.righe })}
                      {esitoLettura.abbinate > 0 ? tr(", {n} abbinate agli articoli della commessa", { n: esitoLettura.abbinate }) : ""}{tr(". Controlla i campi qui sotto.")}
                    </p>
                    {esitoLettura.fornitoreLetto && !esitoLettura.fornitoreTrovato && (
                      <div className="flex flex-wrap items-center gap-2 text-amber-700">
                        <span>{tr("Fornitore sul documento: {nome}. Non l'ho trovato con certezza in rubrica: sceglilo dall'elenco.", { nome: esitoLettura.fornitoreLetto })}</span>
                        {documentoLetto?.fornitore.nome && (
                          <Button type="button" size="sm" variant="outline" className="h-7" disabled={creoFornitore} onClick={() => void aggiungiFornitore()}>
                            {creoFornitore ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                            {tr("Aggiungi ai fornitori")}
                          </Button>
                        )}
                      </div>
                    )}
                    {esitoLettura.avvisi.map((a) => <p key={a} className="text-amber-700">{a}</p>)}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-fornitore">{tr("Fornitore")}</Label>
            <Select value={fornitore ?? undefined} onValueChange={setFornitore}>
              <SelectTrigger id="nuovo-oda-fornitore"><SelectValue placeholder={tr("Scegli il fornitore")} /></SelectTrigger>
              <SelectContent>{attivi.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-consegna">{tr("Consegna prevista")}</Label>
            <Input id="nuovo-oda-consegna" type="date" value={consegna} onChange={(e) => setConsegna(e.target.value)} />
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>{tr("Articoli della commessa da comprare")}</Label>
            <span className="text-xs text-muted-foreground">
              {coverage.isPending ? tr("Controllo cosa è già ordinato…") : tr("{n} da comprare", { n: articoli.length })}
            </span>
          </div>
          {articoli.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {coverage.isPending ? "…" : tr("Nessun articolo della commessa resta da comprare. Aggiungi le righe qui sotto.")}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {articoli.map((r) => (
                <RigaModificabile
                  key={`${r.key}:${versione}`}
                  riga={r}
                  conSpunta
                  nota={r.fornitore_articolo && r.fornitore_articolo !== fornitore ? tr("di solito da {fornitore}", { fornitore: nomeFornitore.get(r.fornitore_articolo) ?? tr("un altro fornitore") }) : null}
                  onCambia={(p) => cambia(r.key, p)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>{tr("Altre righe")}</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setElencoAperto((v) => !v)} aria-expanded={elencoAperto}>
                <ClipboardList className="h-3.5 w-3.5 mr-1" /> {tr("Incolla un elenco")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setLibere((rr) => [...rr, rigaLibera(`libera:${contatore}`)]); setContatore((c) => c + 1); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {tr("Aggiungi riga")}
              </Button>
            </div>
          </div>
          {elencoAperto && (
            <div className="space-y-2 rounded-md border bg-slate-50 p-3">
              <Label htmlFor="nuovo-oda-elenco" className="text-xs text-muted-foreground">
                {tr("Una cosa per riga, con la quantità davanti o in fondo: «10 sacchi cemento», «tubo 32 x 5», «2,5 mq rete». Le voci con lo stesso nome di un prodotto del listino prendono unità e prezzo da lì.")}
              </Label>
              <Textarea id="nuovo-oda-elenco" rows={5} value={elenco} onChange={(e) => setElenco(e.target.value)}
                placeholder={"10 sacchi cemento 32,5\n5 pz tubo pvc 32\nsilicone trasparente x 6"} />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{tr(daElenco.length === 1 ? "{n} riga" : "{n} righe", { n: daElenco.length })}{daElenco.length > 0 ? ` · ${tr("{n} dal listino", { n: daElenco.filter((r) => perNome.has(chiaveVoce(r.description))).length })}` : ""}</span>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setElenco(""); setElencoAperto(false); }}>{tr("Annulla")}</Button>
                  <Button type="button" size="sm" onClick={aggiungiElenco} disabled={daElenco.length === 0}>
                    {daElenco.length ? tr(daElenco.length === 1 ? "Aggiungi {n} riga" : "Aggiungi {n} righe", { n: daElenco.length }) : tr("Aggiungi righe")}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {libere.length > 0 && (
            <div className="divide-y rounded-md border">
              {libere.map((r) => (
                <RigaModificabile
                  key={r.key}
                  riga={r}
                  fornitore={fornitore}
                  onCambia={(p) => cambia(r.key, p)}
                  onTogli={() => setLibere((rr) => rr.filter((x) => x.key !== r.key))}
                />
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-rif">{tr("Riferimento del fornitore")}</Label>
            <Input id="nuovo-oda-rif" placeholder={tr("N. ordine sul sito, preventivo, scontrino…")} value={riferimento} onChange={(e) => setRiferimento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-note">{tr("Note")}</Label>
            <Textarea id="nuovo-oda-note" rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span>{tr(quante === 1 ? "{n} riga" : "{n} righe", { n: quante })}</span>
          <span className="tabular-nums">{righeInOrdine(righe).some(r => r.price_pending && r.unit_price === 0) && <span className="mr-2 text-amber-700">{tr("Totale parziale · prezzi da confermare")}</span>}
            {tr("{imponibile} + IVA {iva} =", { imponibile: formatCurrency(totali.imponibile), iva: formatCurrency(totali.iva) })} <strong>{formatCurrency(totali.totale)}</strong>
          </span>
        </div>
        {confronto && (
          <p role="status" className={`text-xs ${confronto.torna ? "text-emerald-700" : "text-amber-700"}`}>
            {confronto.torna
              ? tr(confronto.voce === "imponibile" ? "L'imponibile torna con il documento ({importo})." : "Il totale torna con il documento ({importo}).", { importo: formatCurrency(confronto.documento) })
              : tr(confronto.voce === "imponibile"
                ? "Sul documento l'imponibile è {documento}, le righe fanno {righe}: controlla quantità, prezzi o righe mancanti."
                : "Sul documento il totale è {documento}, le righe fanno {righe}: controlla quantità, prezzi o righe mancanti.",
                { documento: formatCurrency(confronto.documento), righe: formatCurrency(confronto.righe) })}
          </p>
        )}
        {errore && (fornitore || origine || quante > 0) && <p role="alert" className="text-sm text-red-600">{errore}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => chiudi(false)} disabled={salvando}>{tr("Annulla")}</Button>
          <Button onClick={() => void crea()} disabled={!!errore || salvando || lettura === "leggo"}>
            {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {tr("Crea la bozza")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RigaModificabile({
  riga, conSpunta, nota, fornitore, onCambia, onTogli,
}: {
  riga: RigaNuovoOda;
  conSpunta?: boolean;
  nota?: string | null;
  /** Per le righe libere: il fornitore scelto, i suoi articoli in cima al menu. */
  fornitore?: string | null;
  onCambia: (p: Partial<RigaNuovoOda>) => void;
  onTogli?: () => void;
}) {
  const tr = useT();
  const [qta, setQta] = useState(numeroTesto(riga.quantity));
  const [prezzo, setPrezzo] = useState(riga.price_pending ? "" : numeroTesto(riga.unit_price));
  const spenta = conSpunta && !riga.scelta;
  // Riga libera: si cerca nel listino prodotti e nel catalogo, oppure si scrive la voce.
  const scegli = (nome: string, t?: ArticleTemplateData) => {
    if (!t) { onCambia({ description: nome }); return; }
    const v = valoriArticoloAcquisto(t);
    const attesa = !(v.unit_price > 0);
    setPrezzo(attesa ? "" : numeroTesto(v.unit_price));
    onCambia({ description: nome, unit_of_measure: v.unit_of_measure, unit_price: v.unit_price, price_pending: attesa, vat_rate: v.vat_rate });
  };
  const campi = (
    <>
      <Input
        aria-label={tr("Quantità di {voce}", { voce: riga.description || tr("riga") })}
        inputMode="decimal"
        className="h-8 w-20 text-right tabular-nums"
        value={qta}
        onChange={(e) => { setQta(e.target.value); onCambia({ quantity: leggiImporto(e.target.value) }); }}
      />
      <Input
        aria-label={tr("Unità di {voce}", { voce: riga.description || tr("riga") })}
        className="h-8 w-16"
        value={riga.unit_of_measure}
        onChange={(e) => onCambia({ unit_of_measure: e.target.value })}
      />
      <span className="text-xs text-muted-foreground">×</span>
      <Input
        aria-label={tr("Prezzo di {voce}", { voce: riga.description || tr("riga") })}
        inputMode="decimal"
        className="h-8 w-28 text-right tabular-nums"
        value={prezzo}
        placeholder={tr("Da confermare")}
        onChange={(e) => { setPrezzo(e.target.value); onCambia({ unit_price: leggiImporto(e.target.value), price_pending: e.target.value.trim() === "" }); }}
      />
      <span className="text-xs text-muted-foreground">€</span>
      {onTogli && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={tr("Togli la riga")} onClick={onTogli}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  );
  if (!conSpunta) {
    // Riga libera su due piani: la descrizione intera sopra (va a capo, si legge tutta), i numeri sotto.
    return (
      <div className="space-y-2 px-3 py-2 text-sm">
        <ArticleCombobox
          value={riga.description}
          modalita="acquisto"
          includeListino
          salvaNuoviNelCatalogo={false}
          preferredSupplierId={fornitore ?? undefined}
          onValueChange={scegli}
          placeholder={tr("Cerca nel listino prodotti o scrivi cosa ordini…")}
        />
        {nota && <p className="text-xs text-amber-700">{nota}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">{campi}</div>
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${spenta ? "opacity-60" : ""}`}>
      <Checkbox
        checked={riga.scelta}
        aria-label={tr("Ordina {voce}", { voce: riga.description })}
        onCheckedChange={(v) => onCambia({ scelta: v === true })}
      />
      <div className="min-w-[10rem] flex-1">
        <p className="font-medium break-words">{riga.description}</p>
        {riga.dettaglio_fornitura && <p className="text-xs text-muted-foreground">{riga.dettaglio_fornitura}</p>}
        {nota && <p className="text-xs text-amber-700">{nota}</p>}
      </div>
      {campi}
    </div>
  );
}
