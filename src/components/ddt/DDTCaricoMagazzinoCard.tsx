/**
 * Scheda bolla → «Carica in magazzino»: le righe che non sono entrate da sole. Per ognuna si sceglie
 * l'articolo o si dice di crearne uno nuovo; il sistema propone il più simile, non decide.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  articoloCerto, articoloSimile, quantitaAPezzi, type ArticoloMagazzino, type RigaDaCaricare, type SceltaCarico,
} from "@/lib/ddt/importBolle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const NUOVO = "__nuovo__";

interface RigaBolla extends RigaDaCaricare { movimento_id: string | null }
// Fissi: un `[]` nuovo a ogni giro farebbe ripartire l'effetto delle proposte mentre i dati caricano.
const NESSUNA_RIGA: RigaBolla[] = [];
const NESSUN_ARTICOLO: ArticoloMagazzino[] = [];

export function DDTCaricoMagazzinoCard({ ddtId, companyId, warehouseId, puoCaricare }: {
  ddtId: string; companyId: string; warehouseId: string | null; puoCaricare: boolean;
}) {
  const qc = useQueryClient();
  const { data: righe = NESSUNA_RIGA } = useQuery<RigaBolla[]>({
    queryKey: ["ddt-righe-carico", ddtId],
    queryFn: async () => {
      const { data, error } = await db.from("ddt_righe").select("id, codice_articolo, descrizione, unita_misura, quantita, movimento_id")
        .eq("ddt_ricezione_id", ddtId).order("posizione");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: articoli = NESSUN_ARTICOLO } = useQuery<ArticoloMagazzino[]>({
    queryKey: ["ddt-articoli-carico", companyId, warehouseId],
    enabled: !!warehouseId,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_stock").select("id, name, internal_code, barcode")
        .eq("company_id", companyId).eq("warehouse_id", warehouseId!).order("name").limit(2000);
      if (error) throw error;
      return (data ?? []) as ArticoloMagazzino[];
    },
  });
  const aperte = useMemo(() => righe.filter((r) => !r.movimento_id), [righe]);
  const entrate = righe.length - aperte.length;
  const [scelte, setScelte] = useState<Record<string, string>>({});

  // Proposta di partenza: il certo, poi il simile. Quello che la persona ha già scelto non si tocca.
  useEffect(() => {
    setScelte((prima) => {
      let dopo = prima;
      for (const r of aperte) {
        if (dopo[r.id]) continue;
        const a = articoloCerto(r, articoli) ?? articoloSimile(r, articoli);
        if (a) dopo = { ...dopo, [r.id]: a.id };
      }
      return dopo;
    });
  }, [aperte, articoli]);

  const pronte: SceltaCarico[] = aperte.flatMap((r) => {
    const v = scelte[r.id];
    if (!v || !Number.isInteger(Number(r.quantita)) || Number(r.quantita) <= 0) return [];
    return [v === NUOVO ? { riga_id: r.id, nuovo: true } : { riga_id: r.id, stock_item_id: v }];
  });

  const carica = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("bolla_carica_magazzino", { p_ddt: ddtId, p_scelte: pronte });
      if (error) throw error;
      return data as { caricate: number; restano: number };
    },
    onSuccess: (e) => {
      toast.success(`${e.caricate} ${e.caricate === 1 ? "riga entrata" : "righe entrate"} in magazzino`, e.restano ? { description: `Ne restano ${e.restano}.` } : undefined);
      void qc.invalidateQueries({ queryKey: ["ddt-righe-carico", ddtId] });
      void qc.invalidateQueries({ queryKey: queryKeys.ddtRicezione.all });
      void qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      void qc.invalidateQueries({ queryKey: ["ddt-articoli-carico", companyId, warehouseId] });
    },
    onError: (e: Error) => toast.error("Carico non riuscito", { description: e.message }),
  });

  if (righe.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Warehouse aria-hidden="true" className="h-4 w-4" />Carica in magazzino</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {aperte.length === 0 ? (
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />Tutte le righe sono in giacenza.</p>
        ) : (
          <>
            {entrate > 0 && <p className="text-xs text-muted-foreground">{entrate} {entrate === 1 ? "riga è già entrata" : "righe sono già entrate"}.</p>}
            <ul className="space-y-2">
              {aperte.map((r) => {
                const intera = Number.isInteger(Number(r.quantita)) && Number(r.quantita) > 0;
                return (
                  <li key={r.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
                    <div className="min-w-0">
                      <p className="truncate font-medium" title={r.descrizione}>{r.descrizione}</p>
                      <p className="text-xs text-muted-foreground">{r.quantita ?? "—"} {r.unita_misura ?? ""}{r.codice_articolo ? ` · ${r.codice_articolo}` : ""}</p>
                      {!intera && <p className="text-xs text-amber-700 dark:text-amber-400">Il magazzino conta a pezzi interi: correggi la quantità nelle righe qui sopra.</p>}
                      {intera && !quantitaAPezzi(r) && <p className="text-xs text-amber-700 dark:text-amber-400">Sulla bolla è in {r.unita_misura}: entrerà come {r.quantita} pezzi, senza toccare il costo medio.</p>}
                    </div>
                    <Select value={scelte[r.id] ?? ""} disabled={!puoCaricare || !intera} onValueChange={(v) => setScelte((p) => ({ ...p, [r.id]: v }))}>
                      <SelectTrigger aria-label={`Articolo per ${r.descrizione}`} className="h-8"><SelectValue placeholder="Scegli l'articolo…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NUOVO}>Crea un articolo nuovo</SelectItem>
                        {articoli.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.internal_code ? ` · ${a.internal_code}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
            {puoCaricare && (
              <Button size="sm" disabled={pronte.length === 0 || carica.isPending} onClick={() => carica.mutate()}>
                Carica {pronte.length} {pronte.length === 1 ? "riga" : "righe"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
