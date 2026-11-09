/**
 * Materiali usati in cantiere che la commessa non aveva: si raccolgono in una
 * bolla di entrata. Il costo poi arriva dall'ordine o dalla fattura del fornitore.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScegliInElenco } from "@/components/orders/ScegliInElenco";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

interface Riga { rapportino_id: string; chiave: string; data_lavoro: string; nome: string; quantita: number | null; unita: string | null; fornitore: string | null; provenienza?: string | null }
const db = supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: Error | null }> };
const id = (r: Riga) => `${r.rapportino_id}/${r.chiave}`;

export function MaterialiDaRegolarizzare({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [numero, setNumero] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [scarica, setScarica] = useState(false);
  const { canEditWarehouse } = usePermissions();
  const chiave = ["materiali-da-regolarizzare", orderId];
  const { data: righe = [] } = useQuery({
    queryKey: chiave,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("materiali_da_regolarizzare", { p_order_id: orderId });
      if (error) throw error;
      return (data ?? []) as Riga[];
    },
  });
  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori-nomi", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id && righe.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("company_id", effectiveCompany!.id).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const fai = useMutation({
    mutationFn: async (azione: "bolla" | "ignora") => {
      const selezione = righe.filter((r) => scelti.has(id(r))).map((r) => ({ rapportino_id: r.rapportino_id, chiave: r.chiave }));
      const { error } = await db.rpc("materiali_regolarizza", {
        p_order_id: orderId, p_righe: selezione, p_azione: azione, p_supplier_id: azione === "bolla" && fornitore ? fornitore : null, p_numero: numero || null, p_data: null,
      });
      if (error) throw error;
      return azione;
    },
    onSuccess: (azione) => {
      toast.success(azione === "bolla" ? "Bolla di entrata creata" : "Tolti dall'elenco");
      setScelti(new Set()); setNumero(""); setFornitore("");
      void qc.invalidateQueries({ queryKey: chiave });
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && /ddt/i.test(queryKey[0]) });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Operazione non riuscita"),
  });
  if (!Array.isArray(righe) || !righe.length) return null;
  const inverti = (k: string) => setScelti((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <section aria-label="Materiali da regolarizzare" className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-[13px]">
      <h3 className="font-semibold text-slate-900">Materiali da regolarizzare ({righe.length})</h3>
      <p className="text-xs text-muted-foreground">Usati in cantiere ma non previsti in commessa. Scegli se metterli in una bolla di entrata o scaricarli dal magazzino.</p>
      <ul className="mt-2 divide-y">
        {righe.map((r) => (
          <li key={id(r)} className="flex items-center gap-2 py-1.5">
            <Checkbox checked={scelti.has(id(r))} onCheckedChange={() => inverti(id(r))} aria-label={`Scegli ${r.nome}`} />
            <span className="min-w-0 flex-1 truncate">{r.nome}{r.provenienza === "magazzino" && <Badge variant="outline" className="ml-1.5 py-0 text-[10px]">dal magazzino</Badge>}{r.fornitore ? <span className="text-muted-foreground"> · {r.fornitore}</span> : null}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{format(parseISO(r.data_lavoro), "d MMM", { locale: it })}</span>
            <span className="shrink-0 font-semibold tabular-nums">{r.quantita?.toLocaleString("it-IT") ?? "—"} {r.unita ?? ""}</span>
          </li>
        ))}
      </ul>
      {scelti.size > 0 && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <select aria-label="Fornitore" className="h-8 rounded-md border bg-background px-2 text-[13px]" value={fornitore} onChange={(e) => setFornitore(e.target.value)}>
            <option value="">Fornitore (se lo sai)</option>
            {fornitori.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Input aria-label="Numero bolla" placeholder="Numero bolla (se c'è)" className="h-8 text-[13px]" value={numero} onChange={(e) => setNumero(e.target.value)} />
          <Button size="sm" disabled={fai.isPending} onClick={() => fai.mutate("bolla")}>Crea bolla di entrata</Button>
          {canEditWarehouse && <Button size="sm" variant="outline" disabled={fai.isPending} onClick={() => setScarica(true)}>Scarica dal magazzino</Button>}
          <Button size="sm" variant="outline" disabled={fai.isPending} onClick={() => fai.mutate("ignora")}>Non serve</Button>
        </div>
      )}
      {scarica && (
        <ScaricaDalMagazzino orderId={orderId} righe={righe.filter((r) => scelti.has(id(r)))} onChiudi={(fatto) => {
          setScarica(false);
          if (!fatto) return;
          setScelti(new Set());
          void qc.invalidateQueries({ queryKey: chiave });
        }} />
      )}
    </section>
  );
}

interface Prodotto { id: string; name: string; quantity: number | null }

/** Per ogni materiale, il prodotto vero del magazzino e quanti pezzi. Il costo è quello del magazzino. */
function ScaricaDalMagazzino({ orderId, righe, onChiudi }: { orderId: string; righe: Riga[]; onChiudi: (fatto: boolean) => void }) {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [prodotti, setProdotti] = useState<Record<string, string>>({});
  const [pezzi, setPezzi] = useState<Record<string, string>>(() => Object.fromEntries(righe.map((r) => [id(r), String(Math.ceil(r.quantita ?? 1))])));
  const { data: magazzino = [] } = useQuery({
    queryKey: ["magazzino-prodotti-scarico", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_stock").select("id, name, quantity").eq("company_id", effectiveCompany!.id).gt("quantity", 0).order("name").limit(1000);
      if (error) throw error;
      return (data ?? []) as Prodotto[];
    },
  });
  const opzioni = magazzino.map((p) => ({ id: p.id, name: `${p.name} · ${(p.quantity ?? 0).toLocaleString("it-IT")} disponibili` }));
  const prodottoDi = (r: Riga): string => (prodotti[id(r)] ?? magazzino.find((p) => p.name.trim().toLowerCase() === r.nome.trim().toLowerCase())?.id ?? "").trim();
  const pronto = righe.every((r) => prodottoDi(r) && /^[1-9][0-9]*$/.test(pezzi[id(r)] ?? ""));
  const conferma = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("materiali_scarica_magazzino", {
        p_order_id: orderId,
        p_righe: righe.map((r) => ({ rapportino_id: r.rapportino_id, chiave: r.chiave, stock_item_id: prodottoDi(r), quantita: Number(pezzi[id(r)]) })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scaricato dal magazzino sulla commessa");
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && /magazzino|warehouse|material|margin/i.test(queryKey[0]) });
      onChiudi(true);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Scarico non riuscito"),
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !conferma.isPending) onChiudi(false); }}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-3 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scarica dal magazzino</DialogTitle>
          <DialogDescription>Il costo è quello del magazzino e va sulla commessa. Se il rapportino viene annullato, la merce rientra.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {righe.map((r) => (
            <li key={id(r)} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_5rem]">
              <p className="text-[13px] font-medium sm:col-span-2">{r.nome} <span className="font-normal text-muted-foreground">· {r.quantita?.toLocaleString("it-IT") ?? "—"} {r.unita ?? ""}</span></p>
              <ScegliInElenco valore={prodottoDi(r)} opzioni={opzioni} etichetta={`Cerca il prodotto per ${r.nome}`} onScegli={(v) => setProdotti((p) => ({ ...p, [id(r)]: v || " " }))} />
              <Input className="h-9" inputMode="numeric" aria-label={`Pezzi di ${r.nome}`} value={pezzi[id(r)] ?? ""} onChange={(e) => setPezzi((p) => ({ ...p, [id(r)]: e.target.value }))} />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={conferma.isPending} onClick={() => onChiudi(false)}>Annulla</Button>
          <Button disabled={!pronto || conferma.isPending} onClick={() => conferma.mutate()}>Scarica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
