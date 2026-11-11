import {
  useConsegneDDT,
  type ConsegnaDdt as Consegna,
} from "@/hooks/useConsegneDDT";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, PackageCheck, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { WarehouseSelect } from "@/components/warehouse/WarehouseSelect";
import { useWarehouses } from "@/hooks/useWarehouses";
import {
  destinazioneRiga,
  messaggioErroreConsegna,
  senzaMagazzini,
} from "@/lib/ddt/senzaMagazzini";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useDDTRighe, type DDTRicezione } from "@/hooks/useDDTRicezione";
import { usePermissions } from "@/hooks/usePermissions";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { queryKeys } from "@/lib/queryKeys";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { useControlloOrdiniDDT } from "@/hooks/useControlloOrdiniDDT";

interface Scelta {
  ordineAcquisto?: string;
  quantita?: string;
  destinazione?: "cantiere" | "magazzino";
  orderId?: string;
  warehouseId?: string;
  articolo?: string;
  tipo?: "ingresso" | "reso" | "servizio";
  origine?: string;
  unita?: boolean;
  eccedenza?: boolean;
}
interface Articolo {
  id: string;
  name: string;
  unita_misura: string | null;
  order_id?: string;
  warehouse_id?: string;
  product_code?: string | null;
  internal_code?: string | null;
}
const numero = (n: number) =>
  n.toLocaleString("it-IT", { maximumFractionDigits: 4 });
const input = "h-10 w-full rounded-md border bg-background px-2 text-sm";
// 11/11/2026 — Le spiegazioni erano due paragrafi fissi, sopra e sotto le
// righe: ora stanno nel suggerimento dell'icona accanto al titolo.
const SPIEGAZIONE =
  "Conferma ciò che è arrivato davvero. In cantiere aggiorna gli articoli della commessa; in magazzino aggiorna la giacenza. Ricevuto e consumato restano distinti. Per dividere una riga fra cantiere e magazzino, conferma la prima quota e poi assegna il resto. I prezzi mancanti restano da definire: la consegna non crea una nuova fattura o un secondo costo.";

export function ConsegneDDTCard({ ddt }: { ddt: DDTRicezione }) {
  const permessi = usePermissions();
  const puoConfermare =
    !permessi.solaLettura &&
    (permessi.canEditOrders ||
      permessi.canManagePurchasing ||
      permessi.canEditWarehouse);
  const righe = useDDTRighe(ddt.id);
  const controlloOrdini = useControlloOrdiniDDT(ddt);
  // Senza magazzini (11/11/2026) le righe partono per il cantiere: la commessa
  // della bolla se c'è, altrimenti si sceglie. Il magazzino non si propone.
  const elencoMagazzini = useWarehouses();
  const nessunMagazzino = senzaMagazzini({
    magazzini: elencoMagazzini.warehouses,
    caricamento: elencoMagazzini.isLoading || !elencoMagazzini.isFetched,
    errore: elencoMagazzini.error,
  });
  const destinazioneDi = (s: Scelta) =>
    destinazioneRiga({
      sceltaRiga: s.destinazione,
      destinazioneBolla: ddt.destinazione,
      nessunMagazzino,
    });
  const qc = useQueryClient();
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [scelte, setScelte] = useState<Record<string, Scelta>>({});
  const [confermo, setConfermo] = useState(false);
  const operazione = useRef<{ json: string; id: string } | null>(null);
  const cambia = (id: string, patch: Scelta) => {
    setScelte((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
    setConfermo(false);
  };
  const consegne = useConsegneDDT(ddt.company_id, ddt.id);
  const fatte = useMemo(
    () =>
      new Map(
        (righe.data ?? []).map((r) => [
          r.id,
          (consegne.data ?? [])
            .filter((c) => c.riga_id === r.id)
            .reduce((s, c) => s + Number(c.quantita), 0),
        ]),
      ),
    [righe.data, consegne.data],
  );
  const aperte = (righe.data ?? []).filter(
    (r) =>
      !(r.arrivo_registrato_il && !fatte.get(r.id)) &&
      !r.movimento_id &&
      Number(r.quantita) > Number(fatte.get(r.id) ?? 0),
  );
  const ordini = [
    ...new Set(
      [ddt.order_id, ...Object.values(scelte).map((s) => s.orderId)].filter(
        Boolean,
      ),
    ),
  ].sort() as string[];
  const magazzini = [
    ...new Set(
      [
        ddt.warehouse_id,
        ...Object.values(scelte).map((s) => s.warehouseId),
      ].filter(Boolean),
    ),
  ].sort() as string[];
  const catalogo = useQuery<{
    commessa: Articolo[];
    stock: Articolo[];
    poi: Record<string, string | null>;
  }>({
    queryKey: [
      "ddt-consegna-articoli",
      ddt.company_id,
      ordini,
      magazzini,
      righe.data?.map((r) => r.purchase_order_item_id).filter(Boolean),
      Object.values(scelte).map((s) => s.ordineAcquisto).filter(Boolean),
    ],
    enabled: puoConfermare,
    queryFn: async () => {
      const ids = [...new Set([...(righe.data ?? []).map((r) => r.purchase_order_item_id), ...Object.values(scelte).map((s) => s.ordineAcquisto).filter((v) => v !== "__fuori__")].filter(Boolean))];
      const [commessa, stock, poi] = await Promise.all([
        ordini.length
          ? loadCatalogPages<Articolo>((a, b) =>
              db
                .from("order_items")
                .select(
                  "id,name,order_id,unita_misura,product_code,orders!inner(company_id)",
                )
                .in("order_id", ordini)
                .eq("orders.company_id", ddt.company_id)
                .order("id")
                .range(a, b),
            )
          : [],
        magazzini.length
          ? loadCatalogPages<Articolo>((a, b) =>
              db
                .from("warehouse_stock")
                .select("id,name,warehouse_id,unita_misura,internal_code")
                .eq("company_id", ddt.company_id)
                .in("warehouse_id", magazzini)
                .order("id")
                .range(a, b),
            )
          : [],
        ids.length
          ? db
              .from("purchase_order_items")
              .select("id,order_item_id")
              .eq("company_id", ddt.company_id)
              .in("id", ids)
          : { data: [], error: null },
      ]);
      if (poi.error) throw poi.error;
      return {
        commessa,
        stock,
        poi: Object.fromEntries(
          (poi.data ?? []).map(
            (p: { id: string; order_item_id: string | null }) => [
              p.id,
              p.order_item_id,
            ],
          ),
        ),
      };
    },
  });
  const origini = useQuery<Consegna[]>({
    queryKey: ["ddt-consegne-origini", ddt.company_id, ddt.supplier_id],
    enabled: Object.values(scelte).some((s) => s.tipo === "reso"),
    queryFn: async () => {
      const { data, error } = await db
        .from("ddt_consegne")
        .select("*,ddt_ricezione!inner(supplier_id)")
        .eq("company_id", ddt.company_id)
        .eq("tipo", "ingresso")
        .eq("ddt_ricezione.supplier_id", ddt.supplier_id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const righeDaInviare = aperte
    .filter((r) => selezione.has(r.id))
    .map((r) => {
      const s = scelte[r.id] ?? {};
      const dest = destinazioneDi(s);
      const poiScelto = s.ordineAcquisto === "__fuori__" ? null : s.ordineAcquisto ?? r.purchase_order_item_id;
      const articolo =
        s.articolo ??
        (poiScelto ? catalogo.data?.poi[poiScelto] : s.ordineAcquisto ? null : r.order_item_id) ??
        "";
      return {
        riga_id: r.id,
        ...(s.ordineAcquisto !== undefined ? { purchase_order_item_id: poiScelto } : {}),
        quantita: Number(
          (
            s.quantita ??
            String(Number(r.quantita) - Number(fatte.get(r.id) ?? 0))
          ).replace(",", "."),
        ),
        destinazione: dest,
        order_id: s.orderId ?? ddt.order_id,
        warehouse_id:
          dest === "magazzino" ? (s.warehouseId ?? ddt.warehouse_id) : null,
        tipo: s.tipo ?? "ingresso",
        crea_articolo: articolo === "__nuovo__",
        order_item_id:
          dest === "cantiere" && articolo && articolo !== "__nuovo__"
            ? articolo
            : null,
        stock_item_id:
          dest === "magazzino" && articolo && articolo !== "__nuovo__"
            ? articolo
            : null,
        consegna_origine_id: s.origine ?? null,
        conferma_unita: !!s.unita,
        accetta_eccedenza: !!s.eccedenza,
      };
    });
  const salva = useMutation({
    mutationFn: async () => {
      if (
        !confermo ||
        !righeDaInviare.length ||
        righeDaInviare.some(
          (r) => !Number.isFinite(r.quantita) || r.quantita <= 0,
        )
      )
        throw new Error(
          "Seleziona le righe e controlla le quantità effettivamente arrivate",
        );
      if (
        righeDaInviare.some(
          (r) => r.destinazione === "cantiere" && !r.order_id,
        )
      )
        throw new Error(
          "Scegli la commessa di destinazione delle righe che vanno in cantiere",
        );
      const json = JSON.stringify(righeDaInviare);
      if (operazione.current?.json !== json)
        operazione.current = { json, id: crypto.randomUUID() };
      const { error } = await db.rpc("ddt_conferma_consegna", {
        p_id: operazione.current.id,
        p_ddt: ddt.id,
        p_righe: righeDaInviare,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      operazione.current = null;
      setSelezione(new Set());
      setScelte({});
      setConfermo(false);
      toast.success("Consegna confermata: aggiornate solo le quantità scelte");
      for (const key of [
        ["ddt-consegne"],
        ["ddt-controllo-ordini"],
        ["ddt-righe-ordine"],
        ["ddt-ricezione"],
        ["fattura-confronto"],
        queryKeys.ddtRicezione.all,
        ["purchase-orders"],
        ["purchase-order-items"],
        ["order-items"],
        ["order_items"],
        ["materiali"],
        queryKeys.warehouse.all,
      ])
        void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => {
      toast.error("Consegna non confermata", {
        description: messaggioErroreConsegna(e.message, nessunMagazzino),
      });
      void consegne.refetch();
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageCheck className="h-4 w-4 text-orange-600" />
            Consegne e materiali
            <span
              title={SPIEGAZIONE}
              aria-label={SPIEGAZIONE}
              role="img"
              className="cursor-help text-muted-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </CardTitle>
          {puoConfermare && aperte.length > 0 && !righe.isLoading && !consegne.isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={salva.isPending}
              onClick={() => {
                setSelezione((p) =>
                  p.size === aperte.length
                    ? new Set()
                    : new Set(aperte.map((r) => r.id)),
                );
                setConfermo(false);
              }}
            >
              {selezione.size === aperte.length
                ? "Deseleziona"
                : "Seleziona tutte"}
            </Button>
          )}
        </div>
        {puoConfermare && aperte.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Spunta le righe arrivate davvero per confermarle.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {righe.isLoading || consegne.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento consegne…</p>
        ) : consegne.isError || righe.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Non riesco a controllare le consegne precedenti.{" "}
            <button
              className="underline"
              onClick={() => void consegne.refetch()}
            >
              Riprova
            </button>
          </p>
        ) : (
          <>
            {!!consegne.data?.length && (
              <ul
                className="divide-y rounded-md border bg-emerald-50/30"
                aria-label="Consegne confermate"
              >
                {consegne.data.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
                      <span className="font-medium tabular-nums">
                        {numero(Number(c.quantita))} {c.unita_misura}
                      </span>
                      <span className="min-w-0 truncate">
                        {righe.data?.find((r) => r.id === c.riga_id)
                          ?.descrizione ?? ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.tipo === "reso"
                          ? "Reso"
                          : c.tipo === "servizio"
                            ? "Servizio / noleggio, nessuna giacenza"
                            : c.destinazione === "cantiere"
                              ? "Consegnato in cantiere"
                              : `Caricato in ${c.warehouses?.name || "magazzino"}`}
                        {c.order_id && (
                          <>
                            {" "}
                            ·{" "}
                            <Link
                              className="underline"
                              to={`/azienda/ordini/${c.order_id}`}
                            >
                              Commessa
                            </Link>
                          </>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {puoConfermare && aperte.length > 0 && (
              <>
                <ul className="space-y-2">
                  {aperte.map((r) => {
                    const s = scelte[r.id] ?? {};
                    const dest = destinazioneDi(s);
                    const oid = s.orderId ?? ddt.order_id;
                    const wid = s.warehouseId ?? ddt.warehouse_id;
                    const tipo = s.tipo ?? "ingresso";
                    const poiScelto = s.ordineAcquisto === "__fuori__" ? null : s.ordineAcquisto ?? r.purchase_order_item_id;
                    const articoli =
                      (dest === "cantiere"
                        ? catalogo.data?.commessa.filter(
                            (a) => a.order_id === oid,
                          )
                        : catalogo.data?.stock.filter(
                            (a) => a.warehouse_id === wid,
                          )) ?? [];
                    const valore =
                      s.articolo ??
                      (dest === "cantiere"
                        ? poiScelto
                          ? catalogo.data?.poi[poiScelto]
                          : r.order_item_id
                        : null) ??
                      "";
                    return (
                      <li
                        className={`space-y-3 rounded-md border px-2.5 py-2 ${selezione.has(r.id) ? "border-primary/40 bg-primary/5" : ""}`}
                        key={r.id}
                      >
                        <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4"
                            checked={selezione.has(r.id)}
                            disabled={salva.isPending}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelezione((p) => {
                                const n = new Set(p);
                                if (checked) n.add(r.id);
                                else n.delete(r.id);
                                return n;
                              });
                              setConfermo(false);
                            }}
                          />
                          <span>
                            {r.descrizione}
                            <span className="block text-xs font-normal text-muted-foreground">
                              Da confermare:{" "}
                              {numero(
                                Number(r.quantita) -
                                  Number(fatte.get(r.id) ?? 0),
                              )}{" "}
                              {r.unita_misura || "· unità da correggere"}
                              {r.prezzo_unitario == null
                                ? " · Prezzo da definire"
                                : ""}
                            </span>
                          </span>
                        </label>
                        {selezione.has(r.id) && (
                          <fieldset
                            className="space-y-3"
                            disabled={salva.isPending}
                          >
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <label className="space-y-1 text-xs">
                                Quantità accettata
                                <Input
                                  aria-label={`Quantità consegnata ${r.descrizione}`}
                                  inputMode="decimal"
                                  value={
                                    s.quantita ??
                                    String(
                                      Number(r.quantita) -
                                        Number(fatte.get(r.id) ?? 0),
                                    )
                                  }
                                  onChange={(e) =>
                                    cambia(r.id, { quantita: e.target.value })
                                  }
                                />
                              </label>
                              <label className="space-y-1 text-xs">
                                Operazione
                                <select
                                  className={input}
                                  value={tipo}
                                  onChange={(e) =>
                                    cambia(r.id, {
                                      tipo: e.target.value as Scelta["tipo"],
                                    })
                                  }
                                >
                                  <option value="ingresso">
                                    Merce ricevuta
                                  </option>
                                  <option value="reso">
                                    Reso al fornitore
                                  </option>
                                  <option value="servizio">
                                    Servizio / noleggio
                                  </option>
                                </select>
                              </label>
                              <label className="space-y-1 text-xs">
                                Destinazione
                                <select
                                  className={input}
                                  value={dest}
                                  onChange={(e) =>
                                    cambia(r.id, {
                                      destinazione: e.target
                                        .value as Scelta["destinazione"],
                                      articolo: "",
                                    })
                                  }
                                >
                                  <option value="cantiere">Cantiere</option>
                                  {permessi.canEditWarehouse &&
                                    (!nessunMagazzino ||
                                      dest === "magazzino") && (
                                      <option value="magazzino">
                                        Magazzino
                                      </option>
                                    )}
                                </select>
                              </label>
                            </div>
                            {tipo === "ingresso" && !!controlloOrdini.data?.righe.length && <label className="block space-y-1 text-xs">Riga dell’ordine a cui attribuire questo arrivo
                              <select className={input} aria-label={`Ordine per ${r.descrizione}`} value={poiScelto ?? "__fuori__"} onChange={(e) => {
                                const item = controlloOrdini.data?.righe.find((i) => i.id === e.target.value);
                                const po = controlloOrdini.data?.ordini.find((o) => o.id === item?.purchase_order_id);
                                cambia(r.id, { ordineAcquisto: e.target.value, ...(po?.order_id ? { orderId: po.order_id } : {}), articolo: "" });
                              }}>
                                <option value="__fuori__">Articolo fuori ordine</option>
                                {controlloOrdini.data.righe.map((i) => <option key={i.id} value={i.id}>{i.oda_number} · {i.description} · residuo {numero(Math.max(0, Number(i.quantity) - Number(i.quantity_received ?? 0)))} {i.unit_of_measure}</option>)}
                              </select><span className="block text-muted-foreground">Puoi confermare una parte su un ordine e attribuire il residuo a un altro, senza duplicare la bolla.</span>
                            </label>}
                            {tipo === "ingresso" && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Inserisci solo la merce accettata: quantità mancanti o danneggiate restano da gestire. I servizi e i resi si registrano con l’operazione dedicata.</p>}
                            {dest === "cantiere" ? (
                              <OrderSelectCombobox
                                companyId={ddt.company_id}
                                value={oid ?? undefined}
                                filtroIniziale="all"
                                onChange={(id) =>
                                  cambia(r.id, { orderId: id, articolo: "" })
                                }
                              />
                            ) : (
                              <WarehouseSelect
                                value={wid}
                                onChange={(id) =>
                                  cambia(r.id, {
                                    warehouseId: id ?? "",
                                    articolo: "",
                                  })
                                }
                              />
                            )}
                            {tipo === "reso" ? (
                              <label className="block space-y-1 text-xs">
                                Consegna originale
                                <select
                                  className={input}
                                  value={s.origine ?? ""}
                                  onChange={(e) =>
                                    cambia(r.id, { origine: e.target.value })
                                  }
                                >
                                  <option value="">
                                    Scegli la consegna da rendere
                                  </option>
                                  {(origini.data ?? [])
                                    .filter(
                                      (c) =>
                                        c.destinazione === dest &&
                                        (dest === "cantiere"
                                          ? c.order_id === oid
                                          : c.warehouse_id === wid),
                                    )
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {new Date(
                                          c.created_at,
                                        ).toLocaleDateString("it-IT")}{" "}
                                        · {numero(Number(c.quantita))}{" "}
                                        {c.unita_misura} · {c.id.slice(0, 8)}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            ) : (
                              tipo !== "servizio" && (
                                <label className="block space-y-1 text-xs">
                                  {dest === "cantiere"
                                    ? "Articolo della commessa"
                                    : "Articolo di magazzino"}
                                  <select
                                    className={input}
                                    value={valore}
                                    disabled={catalogo.isLoading}
                                    onChange={(e) =>
                                      cambia(r.id, { articolo: e.target.value })
                                    }
                                  >
                                    <option value="">
                                      Scegli un articolo o creane uno nuovo
                                    </option>
                                    <option value="__nuovo__">
                                      + Crea nuovo articolo dalla bolla
                                    </option>
                                    {articoli.map((a) => (
                                      <option value={a.id} key={a.id}>
                                        {a.name} ·{" "}
                                        {a.unita_misura ||
                                          "unità da confermare"}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )
                            )}
                            {catalogo.isError && (
                              <p
                                role="alert"
                                className="text-xs text-destructive"
                              >
                                Articoli non disponibili.{" "}
                                <button
                                  type="button"
                                  className="underline"
                                  onClick={() => void catalogo.refetch()}
                                >
                                  Riprova
                                </button>
                              </p>
                            )}
                            {tipo !== "servizio" && (
                              <label className="flex items-start gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={!!s.unita}
                                  onChange={(e) =>
                                    cambia(r.id, { unita: e.target.checked })
                                  }
                                />
                                Se l’articolo non ha un’unità registrata,
                                confermo che è{" "}
                                {r.unita_misura ||
                                  "quella da correggere sulla bolla"}
                                .
                              </label>
                            )}
                            {r.purchase_order_item_id &&
                              tipo === "ingresso" && (
                                <label className="flex items-start gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={!!s.eccedenza}
                                    onChange={(e) =>
                                      cambia(r.id, {
                                        eccedenza: e.target.checked,
                                      })
                                    }
                                  />
                                  Accetto l’eventuale quantità in più rispetto
                                  all’OdA.
                                </label>
                              )}
                          </fieldset>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {/* Le azioni compaiono quando c'è qualcosa da confermare. */}
                {selezione.size > 0 && (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={confermo}
                        disabled={!righeDaInviare.length || salva.isPending}
                        onChange={(e) => setConfermo(e.target.checked)}
                      />
                      Ho controllato quantità, destinazione e articoli delle
                      righe selezionate.
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          !confermo ||
                          !righeDaInviare.length ||
                          salva.isPending ||
                          catalogo.isError
                        }
                        onClick={() => salva.mutate()}
                      >
                        {salva.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Conferma {righeDaInviare.length}{" "}
                        {righeDaInviare.length === 1 ? "consegna" : "consegne"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={salva.isPending}
                        onClick={() => {
                          setScelte((p) => ({
                            ...p,
                            ...Object.fromEntries(
                              [...selezione].map((id) => [
                                id,
                                { ...p[id], articolo: "__nuovo__" },
                              ]),
                            ),
                          }));
                          setConfermo(false);
                        }}
                      >
                        Crea nuovi articoli per le selezionate
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {!aperte.length && !consegne.data?.length && (
              <p className="text-sm text-muted-foreground">
                Le righe non hanno quantità da confermare, oppure sono già state
                ricevute con la procedura precedente.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
