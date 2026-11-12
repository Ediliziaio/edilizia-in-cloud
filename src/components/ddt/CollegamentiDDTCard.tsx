// ============================================================================
// CollegamentiDDTCard — a che cosa è legata una bolla, e come cambiarlo
// ----------------------------------------------------------------------------
// Prima si chiamava «Dove si incastra» e si leggeva soltanto: una bolla
// caricata sulla commessa sbagliata restava lì (11/11/2026, Florin: «permetti
// di poter modificare le varie voci in caso associ più commesse»).
//
// Ordini: quello della testata più quelli legati dalle righe o a mano (la
// vista ddt_ordini_collegati, già letta dal controllo ordini: stessa chiave,
// nessuna chiamata in più). Commesse: quella della testata più quelle delle
// consegne confermate, una per riga. Fattura del fornitore: da fattura_ddt,
// col confronto dei prezzi (PrezziDaFatturaCard incorporata).
// Che cosa si può cambiare lo decide `bloccoCollegamento`.
// ============================================================================

import { useState, type ElementType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Edit3, FileText, Link2, Loader2, Receipt, Save, ShoppingCart, Truck, Warehouse, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { PrezziDaFatturaCard } from "@/components/ddt/PrezziDaFatturaCard";
import { supabase } from "@/integrations/supabase/client";
import { useConsegneDDT } from "@/hooks/useConsegneDDT";
import { useControlloOrdiniDDT } from "@/hooks/useControlloOrdiniDDT";
import { useDDTRighe, type DDTRicezione, type DDTRicezioneWithJoins } from "@/hooks/useDDTRicezione";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { bloccoCollegamento, commesseDellaBolla, nomePersona, statoCaricoMagazzino, type StatoBolla } from "@/lib/ddt/collegamentiBolla";
import { salvaCollegamentoDdt } from "@/lib/fatturazione/collegaDdt";
import { cn } from "@/lib/utils";

const NESSUNO = "__nessuno__";
const selectCls = "h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60";

interface Bozza {
  supplier_id: string | null;
  purchase_order_id: string | null;
  order_id: string | null;
  destinazione: "magazzino" | "cantiere";
  warehouse_id: string | null;
}

interface FatturaCollegata {
  id: string;
  numero_ddt: string;
  fatture_ricevute: { id: string; numero_fattura: string | null; data_fattura: string | null } | null;
}

export function CollegamentiDDTCard({
  ddt,
  ricezioni,
  onApriConsegne,
}: {
  ddt: DDTRicezioneWithJoins;
  ricezioni: number;
  /** Porta alle consegne, dove le righe si dividono fra più commesse. */
  onApriConsegne?: () => void;
}) {
  const permessi = usePermissions();
  const modificabile =
    !permessi.solaLettura &&
    (permessi.canManagePurchasing || permessi.canEditOrders || permessi.canEditWarehouse);
  const qc = useQueryClient();
  const consegne = useConsegneDDT(ddt.company_id, ddt.id);
  const righe = useDDTRighe(ddt.id);
  const controllo = useControlloOrdiniDDT(ddt);

  const po = ddt.purchase_orders;
  const commessaPrincipaleId = ddt.order_id ?? po?.orders?.id ?? null;
  const commessaPrincipaleCodice = ddt.orders?.order_code ?? po?.orders?.order_code ?? null;
  const fornitoreNome = ddt.suppliers?.name ?? po?.suppliers?.name ?? null;

  const altreCommesse = [
    ...new Set((consegne.data ?? []).map((c) => c.order_id).filter((id): id is string => !!id && id !== commessaPrincipaleId)),
  ].sort();
  const codici = useQuery({
    queryKey: ["ddt-commesse-consegne", ddt.company_id, altreCommesse],
    enabled: altreCommesse.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,order_code")
        .eq("company_id", ddt.company_id)
        .in("id", altreCommesse);
      if (error) throw error;
      return new Map((data ?? []).map((o) => [o.id, o.order_code ?? ""]));
    },
  });
  const commesse = commesseDellaBolla(
    commessaPrincipaleId ? { id: commessaPrincipaleId, codice: commessaPrincipaleCodice } : null,
    consegne.data ?? [],
    codici.data ?? new Map(),
  );

  const fatture = useQuery<FatturaCollegata[]>({
    queryKey: ["ddt-fatture-collegate", ddt.company_id, ddt.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("fattura_ddt")
        .select("id,numero_ddt,fatture_ricevute(id,numero_fattura,data_fattura)")
        .eq("company_id", ddt.company_id)
        .eq("ddt_ricezione_id", ddt.id);
      if (error) throw error;
      return (data ?? []) as FatturaCollegata[];
    },
  });

  const stato: StatoBolla = {
    stato: ddt.stato,
    consegne: consegne.data?.length ?? 0,
    ricezioni,
    arrivoRegistrato: (righe.data ?? []).some((r) => !!r.arrivo_registrato_il || !!r.movimento_id),
    caricataAMagazzino: !!ddt.caricata_a_magazzino_at,
  };
  // Finché non si sa se ci sono consegne, non si propone di cambiare niente.
  const datiPronti = !consegne.isLoading && !righe.isLoading && !consegne.isError && !righe.isError;
  const blocco = {
    ordine: bloccoCollegamento("ordine", stato),
    fornitore: bloccoCollegamento("fornitore", stato),
    commessa: bloccoCollegamento("commessa", stato),
    destinazione: bloccoCollegamento("destinazione", stato),
  };
  const giaConsegnata = new Map<string, number>();
  for (const c of consegne.data ?? []) giaConsegnata.set(c.riga_id, (giaConsegnata.get(c.riga_id) ?? 0) + Number(c.quantita));
  // Righe ancora da consegnare: lì si sceglie la commessa di ciascuna.
  const righeAperte = (righe.data ?? []).filter(
    (r) => !r.movimento_id && !(r.arrivo_registrato_il && !giaConsegnata.get(r.id)) && Number(r.quantita) > (giaConsegnata.get(r.id) ?? 0),
  ).length;
  const qualcosaModificabile = Object.values(blocco).some((b) => b == null);

  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [collegaFattura, setCollegaFattura] = useState(false);

  const ordiniDisponibili = useQuery({
    queryKey: ["ddt-collegamenti-oda", ddt.company_id, bozza?.supplier_id ?? null],
    enabled: !!bozza && blocco.ordine == null,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("purchase_orders")
        .select("id,oda_number,status,supplier_id,order_id")
        .eq("company_id", ddt.company_id)
        .neq("status", "annullato")
        .order("created_at", { ascending: false })
        .limit(200);
      if (bozza?.supplier_id) q = q.eq("supplier_id", bozza.supplier_id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const salva = useMutation({
    mutationFn: async (b: Bozza) => {
      const patch: Partial<DDTRicezione> = {};
      if (blocco.fornitore == null && b.supplier_id !== ddt.supplier_id) patch.supplier_id = b.supplier_id;
      if (blocco.ordine == null && b.purchase_order_id !== ddt.purchase_order_id) patch.purchase_order_id = b.purchase_order_id;
      if (blocco.commessa == null && b.order_id !== ddt.order_id) patch.order_id = b.order_id;
      if (blocco.destinazione == null) {
        if (b.destinazione !== ddt.destinazione) patch.destinazione = b.destinazione;
        const magazzino = b.destinazione === "magazzino" ? b.warehouse_id : null;
        if (magazzino !== ddt.warehouse_id) patch.warehouse_id = magazzino;
      }
      if (Object.keys(patch).length === 0) return false;
      const { error } = await supabase.from("ddt_ricezione").update(patch as never).eq("id", ddt.id).eq("company_id", ddt.company_id);
      if (error) throw error;
      return true;
    },
    onSuccess: (cambiato) => {
      setBozza(null);
      if (!cambiato) return;
      toast.success("Collegamenti aggiornati");
      for (const key of [["ddt-ricezione"], ["ddt-controllo-ordini"], ["ddt-righe-ordine"], ["purchase-orders"]])
        void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error("Collegamenti non salvati", { description: e.message }),
  });

  const apriModifica = () =>
    setBozza({
      supplier_id: ddt.supplier_id ?? po?.supplier_id ?? null,
      purchase_order_id: ddt.purchase_order_id,
      order_id: ddt.order_id,
      destinazione: ddt.destinazione,
      warehouse_id: ddt.warehouse_id,
    });

  const ordini = controllo.data?.ordini ?? (po ? [{ id: po.id, oda_number: po.oda_number, status: po.status, order_id: po.order_id }] : []);
  const ordinePrincipale = ddt.purchase_order_id;
  const destinazioneMista =
    new Set((consegne.data ?? []).filter((c) => c.tipo !== "servizio").map((c) => c.destinazione)).size > 1;
  const entrataInMagazzino = (consegne.data ?? []).some((c) => c.destinazione === "magazzino" && c.tipo === "ingresso");
  // 12/11/2026: lo stato del carico si legge anche dalle consegne, non solo
  // dalla data in testata che la conferma non scriveva.
  const carico = statoCaricoMagazzino({
    destinazione: ddt.destinazione,
    caricataIl: ddt.caricata_a_magazzino_at,
    consegne: consegne.data ?? [],
    righeAperte,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" /> Collegamenti
          </CardTitle>
          {modificabile && datiPronti && qualcosaModificabile && !bozza && (
            <Button size="sm" variant="ghost" onClick={apriModifica}>
              <Edit3 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Modifica</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {bozza ? (
          <FormCollegamenti
            ddt={ddt}
            bozza={bozza}
            setBozza={setBozza}
            blocco={blocco}
            ordiniDisponibili={ordiniDisponibili.data ?? []}
            ordiniInCaricamento={ordiniDisponibili.isLoading}
            puoMagazzino={permessi.canEditWarehouse}
            inCorso={salva.isPending}
            onSalva={() => salva.mutate(bozza)}
            onAnnulla={() => setBozza(null)}
          />
        ) : (
          <dl className="divide-y text-sm">
            <Voce icona={ShoppingCart} etichetta={ordini.length > 1 ? "Ordini al fornitore" : "Ordine al fornitore"}>
              {ordini.length === 0 ? (
                <Vuoto>Nessun ordine: la merce è arrivata senza</Vuoto>
              ) : (
                <ul className="space-y-0.5">
                  {ordini.map((o) => (
                    <li key={o.id} className="flex items-center gap-1.5">
                      <Link to={`/azienda/ordini-acquisto/${o.id}`} className="font-medium text-primary hover:underline">
                        {o.oda_number}
                      </Link>
                      <span className="text-xs text-muted-foreground">{o.status}</span>
                      {ordini.length > 1 && o.id === ordinePrincipale && (
                        <Badge variant="secondary" className="px-1.5 text-[10px] font-normal">principale</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Voce>
            <Voce icona={Truck} etichetta="Fornitore">
              {fornitoreNome ? <span className="font-medium">{fornitoreNome}</span> : <Vuoto>Da indicare</Vuoto>}
            </Voce>
            <Voce icona={FileText} etichetta={commesse.length > 1 ? `Commesse (${commesse.length})` : "Commessa"}>
              {commesse.length === 0 ? (
                <Vuoto>Nessuna commessa: merce per il magazzino o da assegnare</Vuoto>
              ) : (
                <ul className="space-y-0.5">
                  {commesse.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                      <Link to={`/azienda/ordini/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.codice || "Commessa"}
                      </Link>
                      {commesse.length > 1 && (
                        <span className="text-xs text-muted-foreground">
                          {c.principale ? "della bolla" : ""}
                          {c.principale && c.consegne > 0 ? " · " : ""}
                          {c.consegne > 0 ? `${c.consegne} ${c.consegne === 1 ? "riga consegnata" : "righe consegnate"}` : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {modificabile && onApriConsegne && righeAperte > 0 && (
                <button type="button" onClick={onApriConsegne} className="mt-1 text-xs text-primary hover:underline">
                  Dividi le righe su più commesse
                </button>
              )}
            </Voce>
            <Voce icona={ddt.destinazione === "cantiere" ? Truck : Warehouse} etichetta="Dove va la merce">
              <span className="font-medium">
                {destinazioneMista
                  ? "In parte in cantiere, in parte in magazzino"
                  : ddt.destinazione === "cantiere"
                    ? "Direttamente in cantiere"
                    : `Magazzino${ddt.warehouses?.name ? ` · ${ddt.warehouses.name}` : ""}`}
              </span>
              <p className="text-xs text-muted-foreground">
                {ddt.destinazione === "cantiere" && !destinazioneMista && !entrataInMagazzino ? (
                  "Non entra in giacenza."
                ) : !datiPronti ? null : carico.tipo === "caricata" ? (
                  `Caricata in magazzino il ${format(new Date(carico.il), "dd/MM/yyyy", { locale: it })}`
                ) : carico.tipo === "da_caricare" ? (
                  <>
                    {carico.righe === 1 ? "1 riga da caricare: " : `${carico.righe} righe da caricare: `}
                    {onApriConsegne ? (
                      <button type="button" onClick={onApriConsegne} className="text-primary hover:underline">
                        {carico.righe === 1 ? "confermala qui sotto" : "confermale qui sotto"}
                      </button>
                    ) : carico.righe === 1 ? (
                      "confermala qui sotto"
                    ) : (
                      "confermale qui sotto"
                    )}
                  </>
                ) : (
                  "Carico non ancora confermato da questa bolla."
                )}
              </p>
            </Voce>
            <Voce icona={Receipt} etichetta="Fattura del fornitore">
              {fatture.isError ? (
                <span className="text-xs text-destructive">Non riesco a leggere le fatture.</span>
              ) : (fatture.data ?? []).length === 0 ? (
                <Vuoto>Non ancora arrivata</Vuoto>
              ) : (
                <ul className="space-y-0.5">
                  {(fatture.data ?? []).map((f) => (
                    <li key={f.id}>
                      <Link
                        to={`/azienda/documenti/fatture-ricevute?cerca=${encodeURIComponent(f.fatture_ricevute?.numero_fattura ?? "")}`}
                        className="font-medium text-primary hover:underline"
                      >
                        n. {f.fatture_ricevute?.numero_fattura ?? "—"}
                      </Link>
                      {f.fatture_ricevute?.data_fattura && (
                        <span className="text-xs text-muted-foreground"> del {format(new Date(f.fatture_ricevute.data_fattura), "dd/MM/yyyy")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {/* «Confronta una fattura» (prezzi dalla fattura) sta qui, vicino
                  alla fattura, dall'11/11/2026: prima era una scheda a sé. */}
              <PrezziDaFatturaCard
                ddt={ddt}
                incorporato
                altreAzioni={
                  modificabile && !collegaFattura ? (
                    ddt.supplier_id ? (
                      <button type="button" onClick={() => setCollegaFattura(true)} className="text-xs text-primary hover:underline">
                        Collega una fattura
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Indica il fornitore per collegare la fattura.</span>
                    )
                  ) : null
                }
              />
              {collegaFattura && ddt.supplier_id && (
                <ScegliFattura ddt={ddt} onChiudi={() => setCollegaFattura(false)} />
              )}
            </Voce>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Voce({ icona: Icona, etichetta, children }: { icona: ElementType; etichetta: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
      <Icona className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{etichetta}</dt>
        <dd className="mt-0.5 min-w-0 break-words">{children}</dd>
      </div>
    </div>
  );
}

function Vuoto({ children }: { children: ReactNode }) {
  return <span className="text-sm italic text-muted-foreground">{children}</span>;
}

function Bloccato({ motivo }: { motivo: string | null }) {
  return motivo ? <p className="text-xs text-muted-foreground">{motivo}</p> : null;
}

function FormCollegamenti({
  ddt, bozza, setBozza, blocco, ordiniDisponibili, ordiniInCaricamento, puoMagazzino, inCorso, onSalva, onAnnulla,
}: {
  ddt: DDTRicezioneWithJoins;
  bozza: Bozza;
  setBozza: (b: Bozza) => void;
  blocco: Record<"ordine" | "fornitore" | "commessa" | "destinazione", string | null>;
  ordiniDisponibili: Array<{ id: string; oda_number: string; status: string; supplier_id: string | null; order_id: string | null }>;
  ordiniInCaricamento: boolean;
  puoMagazzino: boolean;
  inCorso: boolean;
  onSalva: () => void;
  onAnnulla: () => void;
}) {
  // L'ordine attuale resta nell'elenco anche se è di un altro fornitore.
  const opzioniOrdine = ordiniDisponibili.some((o) => o.id === bozza.purchase_order_id) || !bozza.purchase_order_id || !ddt.purchase_orders
    ? ordiniDisponibili
    : [{ id: ddt.purchase_orders.id, oda_number: ddt.purchase_orders.oda_number, status: ddt.purchase_orders.status, supplier_id: ddt.purchase_orders.supplier_id ?? null, order_id: ddt.purchase_orders.order_id }, ...ordiniDisponibili];
  return (
    <fieldset disabled={inCorso} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Fornitore</Label>
        {blocco.fornitore ? (
          <><p className="text-sm font-medium">{ddt.suppliers?.name ?? ddt.purchase_orders?.suppliers?.name ?? "—"}</p><Bloccato motivo={blocco.fornitore} /></>
        ) : (
          <SupplierSelect
            searchable
            value={bozza.supplier_id ?? undefined}
            fallbackCompanyId={ddt.company_id}
            onValueChange={(v) => setBozza({ ...bozza, supplier_id: v ?? null })}
          />
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="ddt-collega-ordine">Ordine al fornitore</Label>
        {blocco.ordine ? (
          <><p className="font-mono text-sm font-medium">{ddt.purchase_orders?.oda_number ?? "Nessuno"}</p><Bloccato motivo={blocco.ordine} /></>
        ) : (
          <>
            <select
              id="ddt-collega-ordine"
              className={selectCls}
              value={bozza.purchase_order_id ?? NESSUNO}
              disabled={ordiniInCaricamento}
              onChange={(e) => {
                const id = e.target.value === NESSUNO ? null : e.target.value;
                const o = opzioniOrdine.find((x) => x.id === id);
                setBozza({
                  ...bozza,
                  purchase_order_id: id,
                  // L'ordine porta con sé il suo fornitore e, se ce l'ha, la sua commessa.
                  ...(o?.supplier_id && blocco.fornitore == null ? { supplier_id: o.supplier_id } : {}),
                  ...(o?.order_id ? { order_id: o.order_id } : {}),
                });
              }}
            >
              <option value={NESSUNO}>Nessun ordine</option>
              {opzioniOrdine.map((o) => (
                <option key={o.id} value={o.id}>{o.oda_number} · {o.status}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Se la bolla porta più ordini, aggiungili con «Collega ordine» nel controllo ordini.</p>
          </>
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Commessa della bolla</Label>
        <OrderSelectCombobox
          companyId={ddt.company_id}
          value={bozza.order_id ?? undefined}
          filtroIniziale="all"
          ariaLabel="Commessa della bolla"
          onChange={(id) => setBozza({ ...bozza, order_id: id })}
        />
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">Vale per le righe ancora da consegnare; quelle già consegnate tengono la loro.</p>
          {bozza.order_id && (
            <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => setBozza({ ...bozza, order_id: null })}>
              Nessuna
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor="ddt-collega-destinazione">Dove va la merce</Label>
        {blocco.destinazione ? (
          <Bloccato motivo={blocco.destinazione} />
        ) : (
          <>
            <select
              id="ddt-collega-destinazione"
              className={selectCls}
              value={bozza.destinazione}
              onChange={(e) => setBozza({ ...bozza, destinazione: e.target.value as Bozza["destinazione"] })}
            >
              <option value="cantiere">Direttamente in cantiere</option>
              {(puoMagazzino || ddt.destinazione === "magazzino") && <option value="magazzino">In magazzino</option>}
            </select>
            {bozza.destinazione === "magazzino" && (
              <WarehouseSelect value={bozza.warehouse_id} onChange={(v) => setBozza({ ...bozza, warehouse_id: v ?? null })} />
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onAnnulla}>
          <X className="mr-1 h-3.5 w-3.5" /> Annulla
        </Button>
        <Button type="button" size="sm" onClick={onSalva}>
          {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="mr-1 h-3.5 w-3.5" /> Salva</>}
        </Button>
      </div>
    </fieldset>
  );
}

/** Collega una fattura già registrata del fornitore della bolla. */
function ScegliFattura({ ddt, onChiudi }: { ddt: DDTRicezioneWithJoins; onChiudi: () => void }) {
  const qc = useQueryClient();
  const [cerca, setCerca] = useState("");
  const termine = useDebounce(cerca.trim(), 300);
  const elenco = useQuery({
    queryKey: ["ddt-fatture-fornitore", ddt.company_id, ddt.id, ddt.supplier_id, termine, "collega"],
    queryFn: async () => {
      const { data, error } = await db.rpc("ddt_fatture_fornitore", { p_ddt: ddt.id, p_cerca: termine, p_limite: 20 });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; numero_fattura: string; data_fattura: string }>;
    },
  });
  const collega = useMutation({
    mutationFn: (fatturaId: string) =>
      salvaCollegamentoDdt({ companyId: ddt.company_id, fatturaId, ddtId: ddt.id, numero: ddt.numero_ddt, data: ddt.data_ricezione }),
    onSuccess: () => {
      toast.success("Fattura collegata alla bolla");
      void qc.invalidateQueries({ queryKey: ["ddt-fatture-collegate"] });
      void qc.invalidateQueries({ queryKey: ["fattura-collegamenti"] });
      onChiudi();
    },
    onError: (e: Error) => toast.error("Fattura non collegata", { description: e.message }),
  });
  return (
    <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-2">
      <Input
        aria-label="Cerca la fattura del fornitore"
        placeholder="Numero o data della fattura"
        className="h-8 text-sm"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
      />
      {elenco.isLoading ? (
        <p className="text-xs text-muted-foreground">Cerco…</p>
      ) : elenco.isError ? (
        <p className="text-xs text-destructive">Fatture non disponibili.</p>
      ) : (elenco.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessuna fattura di questo fornitore da collegare.</p>
      ) : (
        <ul className="max-h-48 divide-y overflow-y-auto rounded border bg-background">
          {(elenco.data ?? []).map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={collega.isPending}
                onClick={() => collega.mutate(f.id)}
                className={cn("flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted/50")}
              >
                <span className="font-medium">n. {f.numero_fattura}</span>
                <span className="text-xs text-muted-foreground">{f.data_fattura ? format(new Date(f.data_fattura), "dd/MM/yyyy") : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onChiudi}>
          Chiudi
        </Button>
      </div>
    </div>
  );
}

/** Quando è nata la bolla, chi l'ha registrata, quando è stata verificata. */
export function TimelineBolla({ ddt }: { ddt: DDTRicezione }) {
  const autore = useQuery({
    queryKey: ["profilo-nome", ddt.created_by],
    enabled: !!ddt.created_by,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name,last_name,email")
        .eq("id", ddt.created_by!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const nome = nomePersona(autore.data);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Storia della bolla</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ol className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
            <span>
              Registrata il {format(new Date(ddt.created_at), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}
              {nome && <span className="text-muted-foreground"> da {nome}</span>}
            </span>
          </li>
          {ddt.verified_at && (
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
              <span>Verificata il {format(new Date(ddt.verified_at), "dd/MM/yyyy 'alle' HH:mm", { locale: it })}</span>
            </li>
          )}
        </ol>
      </CardContent>
    </Card>
  );
}

