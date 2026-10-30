/**
 * «Nuovo ordine» dalla commessa: un popup solo per fare l'ordine d'acquisto
 * (30/10/2026). Come si ordina, a chi, cosa (articoli della commessa ancora da
 * comprare e righe libere), quando arriva. Nasce in bozza: l'invio al
 * fornitore resta un gesto della pagina dell'ordine.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
  erroreNuovoOda, rigaLibera, righeDagliArticoli, righeInOrdine, righePerDatabase, totaliNuovoOda,
  type RigaNuovoOda,
} from "@/lib/orders/nuovoOdaCommessa";
import { logger } from "@/utils/logger";

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
    }
    onOpenChange(v);
  };

  const cambia = (key: string, patch: Partial<RigaNuovoOda>) => {
    if (key.startsWith("art:")) setModifiche((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
    else setLibere((rr) => rr.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const errore = erroreNuovoOda({ fornitore, origine, righe });
  const totali = totaliNuovoOda(righe);
  const quante = righeInOrdine(righe).length;

  const crea = async () => {
    if (errore || !companyId || !fornitore || !origine || salvando) return;
    setSalvando(true);
    try {
      const { data: po, error } = await supabase.from("purchase_orders").insert({
        company_id: companyId,
        supplier_id: fornitore,
        order_id: orderId,
        status: "bozza",
        // Il numero lo dà il trigger, unico per azienda.
        oda_number: "",
        origine,
        expected_delivery_date: consegna || null,
        supplier_reference: riferimento.trim() || null,
        notes: [note.trim(), `Generato da commessa ${orderCode || ""}`.trim()].filter(Boolean).join(" · "),
        created_by: user?.id,
      } as never).select("id, oda_number").single();
      if (error) throw error;
      const nuovo = po as unknown as { id: string; oda_number: string };
      const { error: errRighe } = await supabase.from("purchase_order_items")
        .insert(righePerDatabase(righe, companyId, nuovo.id) as never);
      if (errRighe) {
        // Mai cancellare un ordine forse salvato: si apre e si controlla.
        toast.error("Ordine creato, ma le righe non sono confermate", {
          description: "Apri la bozza e controlla le righe prima di inviarla.",
          action: { label: "Apri", onClick: () => navigate(`/azienda/ordini-acquisto/${nuovo.id}`) },
        });
      } else {
        toast.success(`Bozza ${nuovo.oda_number || "d'ordine"} creata`, {
          description: `${quante} ${quante === 1 ? "riga" : "righe"} · ${formatCurrency(totali.imponibile)} + IVA. Inviala dalla pagina dell'ordine.`,
          action: { label: "Apri", onClick: () => navigate(`/azienda/ordini-acquisto/${nuovo.id}`) },
        });
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
      toast.error("Ordine non creato", { description: e instanceof Error ? e.message : String(e) });
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={chiudi}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-orange-500" />
            Nuovo ordine d'acquisto
          </DialogTitle>
          <DialogDescription>
            Per la commessa {orderCode || ""}. Nasce in bozza: lo invii al fornitore dalla pagina dell'ordine.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <Label>Come lo ordini</Label>
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
                  <span className="font-medium">{info.titoloBreve}</span>
                </button>
              );
            })}
          </div>
          {origine && <p className="text-xs text-muted-foreground">{ODA_ORIGINE_INFO[origine].descrizione}</p>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-fornitore">Fornitore</Label>
            <Select value={fornitore ?? undefined} onValueChange={setFornitore}>
              <SelectTrigger id="nuovo-oda-fornitore"><SelectValue placeholder="Scegli il fornitore" /></SelectTrigger>
              <SelectContent>{attivi.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-consegna">Consegna prevista</Label>
            <Input id="nuovo-oda-consegna" type="date" value={consegna} onChange={(e) => setConsegna(e.target.value)} />
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>Articoli della commessa da comprare</Label>
            <span className="text-xs text-muted-foreground">
              {coverage.isPending ? "Controllo cosa è già ordinato…" : `${articoli.length} da comprare`}
            </span>
          </div>
          {articoli.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {coverage.isPending ? "…" : "Nessun articolo della commessa resta da comprare. Aggiungi le righe qui sotto."}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {articoli.map((r) => (
                <RigaModificabile
                  key={r.key}
                  riga={r}
                  conSpunta
                  nota={r.fornitore_articolo && r.fornitore_articolo !== fornitore ? `di solito da ${nomeFornitore.get(r.fornitore_articolo) ?? "un altro fornitore"}` : null}
                  onCambia={(p) => cambia(r.key, p)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>Altre righe</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => { setLibere((rr) => [...rr, rigaLibera(`libera:${contatore}`)]); setContatore((c) => c + 1); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi riga
            </Button>
          </div>
          {libere.length > 0 && (
            <div className="divide-y rounded-md border">
              {libere.map((r) => (
                <RigaModificabile
                  key={r.key}
                  riga={r}
                  onCambia={(p) => cambia(r.key, p)}
                  onTogli={() => setLibere((rr) => rr.filter((x) => x.key !== r.key))}
                />
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-rif">Riferimento del fornitore</Label>
            <Input id="nuovo-oda-rif" placeholder="N. ordine sul sito, preventivo, scontrino…" value={riferimento} onChange={(e) => setRiferimento(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nuovo-oda-note">Note</Label>
            <Textarea id="nuovo-oda-note" rows={1} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span>{quante} {quante === 1 ? "riga" : "righe"}</span>
          <span className="tabular-nums">
            {formatCurrency(totali.imponibile)} + IVA {formatCurrency(totali.iva)} = <strong>{formatCurrency(totali.totale)}</strong>
          </span>
        </div>
        {errore && (fornitore || origine || quante > 0) && <p role="alert" className="text-sm text-red-600">{errore}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => chiudi(false)} disabled={salvando}>Annulla</Button>
          <Button onClick={() => void crea()} disabled={!!errore || salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Crea la bozza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RigaModificabile({
  riga, conSpunta, nota, onCambia, onTogli,
}: {
  riga: RigaNuovoOda;
  conSpunta?: boolean;
  nota?: string | null;
  onCambia: (p: Partial<RigaNuovoOda>) => void;
  onTogli?: () => void;
}) {
  const [qta, setQta] = useState(numeroTesto(riga.quantity));
  const [prezzo, setPrezzo] = useState(numeroTesto(riga.unit_price));
  const spenta = conSpunta && !riga.scelta;
  return (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${spenta ? "opacity-60" : ""}`}>
      {conSpunta && (
        <Checkbox
          checked={riga.scelta}
          aria-label={`Ordina ${riga.description}`}
          onCheckedChange={(v) => onCambia({ scelta: v === true })}
        />
      )}
      <div className="min-w-[10rem] flex-1">
        {conSpunta ? (
          <p className="font-medium">{riga.description}</p>
        ) : (
          <Input aria-label="Descrizione" placeholder="Cosa ordini" value={riga.description} onChange={(e) => onCambia({ description: e.target.value })} />
        )}
        {nota && <p className="text-xs text-amber-700">{nota}</p>}
      </div>
      <Input
        aria-label={`Quantità di ${riga.description || "riga"}`}
        inputMode="decimal"
        className="h-8 w-20 text-right tabular-nums"
        value={qta}
        onChange={(e) => { setQta(e.target.value); onCambia({ quantity: leggiImporto(e.target.value) }); }}
      />
      <Input
        aria-label={`Unità di ${riga.description || "riga"}`}
        className="h-8 w-16"
        value={riga.unit_of_measure}
        onChange={(e) => onCambia({ unit_of_measure: e.target.value })}
      />
      <span className="text-xs text-muted-foreground">×</span>
      <Input
        aria-label={`Prezzo di ${riga.description || "riga"}`}
        inputMode="decimal"
        className="h-8 w-24 text-right tabular-nums"
        value={prezzo}
        onChange={(e) => { setPrezzo(e.target.value); onCambia({ unit_price: leggiImporto(e.target.value) }); }}
      />
      <span className="text-xs text-muted-foreground">€</span>
      {onTogli && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Togli la riga" onClick={onTogli}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
