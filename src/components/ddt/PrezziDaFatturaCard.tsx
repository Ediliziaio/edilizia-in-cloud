import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useDDTRighe, type DDTRicezione } from "@/hooks/useDDTRicezione";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { queryKeys } from "@/lib/queryKeys";
import { useDebounce } from "@/hooks/useDebounce";

interface Fattura {
  id: string;
  numero_fattura: string;
  data_fattura: string;
  cedente_ragione_sociale: string;
}
interface Valore {
  id: string;
  riga_id: string;
  fattura_id: string;
  quantita: number;
  prezzo_unitario: number;
  fatture_ricevute?: { numero_fattura: string };
}
export function PrezziDaFatturaCard({ ddt }: { ddt: DDTRicezione }) {
  const p = usePermissions();
  const qc = useQueryClient();
  const visibile = p.canViewCosts || p.canManagePurchasing;
  const modificabile = p.canManagePurchasing && !p.solaLettura;
  const righe = useDDTRighe(ddt.id);
  const [aperto, setAperto] = useState(false);
  const [fattura, setFattura] = useState("");
  const [ricerca, setRicerca] = useState("");
  const ricercaFattura = useDebounce(ricerca.trim(), 300);
  const [bozze, setBozze] = useState<
    Record<string, { q: string; prezzo: string }>
  >({});
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set());
  const [confermo, setConfermo] = useState(false);
  const valori = useQuery<Valore[]>({
    queryKey: ["ddt-valorizzazioni", ddt.company_id, ddt.id],
    enabled: visibile,
    queryFn: async () => {
      const { data, error } = await db
        .from("ddt_valorizzazioni")
        .select("*,fatture_ricevute(numero_fattura)")
        .eq("company_id", ddt.company_id)
        .eq("ddt_id", ddt.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const fatture = useQuery<Fattura[]>({
    queryKey: [
      "ddt-fatture-fornitore",
      ddt.company_id,
      ddt.id,
      ddt.supplier_id,
      ricercaFattura,
    ],
    enabled: visibile && aperto && !!ddt.supplier_id,
    queryFn: async () => {
      const { data, error } = await db.rpc("ddt_fatture_fornitore", {
        p_ddt: ddt.id,
        p_cerca: ricercaFattura,
        p_limite: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const salva = useMutation({
    mutationFn: async () => {
      if (!confermo || !fattura || !selezionate.size)
        throw new Error("Scegli la fattura e controlla i prezzi");
      const v = [...selezionate].map((id) => ({
        riga_id: id,
        quantita: Number(
          (
            bozze[id]?.q ??
            String(righe.data?.find((r) => r.id === id)?.quantita ?? "")
          ).replace(",", "."),
        ),
        prezzo_unitario: bozze[id]?.prezzo?.trim()
          ? Number(bozze[id].prezzo.replace(",", "."))
          : null,
      }));
      if (
        v.some(
          (r) =>
            !Number.isFinite(r.quantita) ||
            r.quantita <= 0 ||
            r.prezzo_unitario == null ||
            !Number.isFinite(r.prezzo_unitario) ||
            r.prezzo_unitario < 0,
        )
      )
        throw new Error(
          "Inserisci quantità e prezzo presenti nella fattura, IVA esclusa",
        );
      const { error } = await db.rpc("ddt_valorizza_da_fattura", {
        p_ddt: ddt.id,
        p_fattura: fattura,
        p_righe: v,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSelezionate(new Set());
      setBozze({});
      setConfermo(false);
      toast.success(
        "Prezzi confrontati con la fattura, nessun nuovo arrivo registrato",
      );
      for (const key of [
        ["ddt-valorizzazioni"],
        queryKeys.ddtRicezione.all,
        ["order-items"],
        ["materiali"],
        queryKeys.warehouse.stockAll,
        queryKeys.warehouse.itemsAll,
        ["fattura-collegamenti"],
      ])
        void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) =>
      toast.error("Prezzi non aggiornati", { description: e.message }),
  });
  if (!visibile) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-orange-600" />
          Prezzi e fattura del fornitore
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          La bolla può rimanere senza prezzi. Quando arriva la fattura,
          confronta le quantità e completa i prezzi degli articoli della
          commessa e dei carichi di magazzino. La contabilizzazione e la
          ripartizione del costo restano nella fattura.
        </p>
        {!!valori.data?.length && (
          <ul className="divide-y rounded-xl border px-3">
            {valori.data.map((v) => (
              <li key={v.id} className="py-2 text-xs">
                {righe.data?.find((r) => r.id === v.riga_id)?.descrizione} ·{" "}
                {Number(v.quantita).toLocaleString("it-IT")} ×{" "}
                {Number(v.prezzo_unitario).toLocaleString("it-IT", {
                  style: "currency",
                  currency: "EUR",
                })}{" "}
                ·{" "}
                <Link
                  className="underline"
                  to={`/azienda/documenti/fatture-ricevute?cerca=${encodeURIComponent(v.fatture_ricevute?.numero_fattura ?? "")}`}
                >
                  Fattura
                </Link>
              </li>
            ))}
          </ul>
        )}
        {valori.isError && (
          <p role="alert" className="text-destructive">
            Confronti precedenti non disponibili.{" "}
            <button className="underline" onClick={() => void valori.refetch()}>
              Riprova
            </button>
          </p>
        )}
        {modificabile && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAperto((v) => !v)}
          >
            {aperto ? "Chiudi confronto" : "Confronta una fattura"}
          </Button>
        )}
        {aperto && (
          <fieldset
            disabled={salva.isPending || valori.isError}
            className="space-y-3"
          >
            <label className="block space-y-1 text-xs">
              Cerca per numero o data
              <Input
                value={ricerca}
                onChange={(e) => {
                  setRicerca(e.target.value);
                  setFattura("");
                  setConfermo(false);
                }}
                placeholder="Numero della fattura"
              />
            </label>
            <label className="block space-y-1 text-xs">
              Fattura dello stesso fornitore
              <select
                className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={fattura}
                onChange={(e) => {
                  setFattura(e.target.value);
                  setConfermo(false);
                }}
              >
                <option value="">
                  {fatture.isLoading ? "Caricamento…" : "Seleziona la fattura"}
                </option>
                {fatture.data?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.numero_fattura} · {f.data_fattura} ·{" "}
                    {f.cedente_ragione_sociale}
                  </option>
                ))}
              </select>
            </label>
            {(fatture.data?.length ?? 0) >= 100 && (
              <p className="text-xs text-muted-foreground">
                Mostrate le prime 100 fatture del fornitore. Cerca il numero o
                la data per trovare quelle precedenti.
              </p>
            )}
            {fatture.isError && (
              <p className="text-destructive">
                Fatture non disponibili.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void fatture.refetch()}
                >
                  Riprova
                </button>
              </p>
            )}
            {!ddt.supplier_id && (
              <p className="text-amber-800">
                Associa prima il fornitore della bolla.
              </p>
            )}
            {fatture.isSuccess && !fatture.data?.length && (
              <p className="text-muted-foreground">
                Nessuna fattura trovata per questo fornitore. Importa prima
                l’originale nella sezione Fatture ricevute.
              </p>
            )}
            <ul className="space-y-2">
              {righe.data?.map((r) => {
                const v = bozze[r.id];
                return (
                  <li className="space-y-2 rounded-lg border p-3" key={r.id}>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selezionate.has(r.id)}
                        onChange={(e) => {
                          const c = e.target.checked;
                          setSelezionate((p) => {
                            const n = new Set(p);
                            if (c) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          });
                          setConfermo(false);
                        }}
                      />
                      {r.descrizione}
                    </label>
                    {selezionate.has(r.id) && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs">
                          Quantità fatturata ({r.unita_misura})
                          <Input
                            aria-label={`Quantità fatturata ${r.descrizione}`}
                            inputMode="decimal"
                            value={v?.q ?? String(r.quantita ?? "")}
                            onChange={(e) => {
                              setBozze((p) => ({
                                ...p,
                                [r.id]: {
                                  q: e.target.value,
                                  prezzo: p[r.id]?.prezzo ?? "",
                                },
                              }));
                              setConfermo(false);
                            }}
                          />
                        </label>
                        <label className="text-xs">
                          Prezzo unitario IVA esclusa
                          <Input
                            aria-label={`Prezzo in fattura ${r.descrizione}`}
                            inputMode="decimal"
                            value={v?.prezzo ?? ""}
                            placeholder="Da fattura"
                            onChange={(e) => {
                              setBozze((p) => ({
                                ...p,
                                [r.id]: {
                                  q: p[r.id]?.q ?? String(r.quantita ?? ""),
                                  prezzo: e.target.value,
                                },
                              }));
                              setConfermo(false);
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={confermo}
                onChange={(e) => setConfermo(e.target.checked)}
              />
              Ho confrontato le righe con la fattura originale. I prezzi sono
              unitari e al netto dell’IVA.
            </label>
            <Button
              disabled={
                !confermo || !fattura || !selezionate.size || salva.isPending
              }
              onClick={() => salva.mutate()}
            >
              {salva.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salva il confronto prezzi
            </Button>
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
