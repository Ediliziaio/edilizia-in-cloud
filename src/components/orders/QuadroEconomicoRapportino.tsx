/**
 * I soldi del rapportino: per persona ore, costo orario e costo; nei lavori in
 * appalto anche vendita, ricavo e margine. Il permesso lo controlla il database.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCatalogoVociRapportino } from "@/hooks/useCatalogoVociRapportino";
import { formatCurrency } from "@/lib/formatters";

interface Riga {
  emp: string | null; nome: string; ditta: boolean; ore: number; costo_orario: number | null; costo: number | null;
  unita: string | null; quantita: number | null; prezzo: number | null; ricavo: number | null;
}
interface Voce { id: string; descrizione: string; quantita: number; unita: string; costo_unitario: number | null; vendita_unitaria: number | null }
interface Mezzo { mezzo_id: string; nome: string | null; noleggio: boolean; ore: number; ore_stimate: boolean; costo_orario: number | null; importo: number | null }
interface Quadro { persone: Riga[]; voci?: Voce[]; mezzi?: Mezzo[]; appalto: boolean; a_corpo: boolean; registrato: boolean }

const ore = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
const euro = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(Number(n)));
const UNITA: Record<string, string> = { ora: "/h", giornata: "/giorno", uomo_giorno: "/giorno" };

const numero = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const VUOTA = { descrizione: "", quantita: "1", unita: "cad", costo: "", vendita: "" };

export function QuadroEconomicoRapportino({ rapportinoId, puoModificare = false }: { rapportinoId: string; puoModificare?: boolean }) {
  const qc = useQueryClient();
  const [nuova, setNuova] = useState<typeof VUOTA | null>(null);
  const chiave = ["rapportino-quadro-economico", rapportinoId];
  const db = supabase as unknown as { from: (t: string) => { insert: (r: object) => Promise<{ error: Error | null }>; delete: () => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } } };
  const aggiorna = () => { void qc.invalidateQueries({ queryKey: chiave }); void qc.invalidateQueries({ queryKey: ["appalto-rendiconto"] }); };
  const aggiungi = useMutation({
    mutationFn: async (v: typeof VUOTA) => {
      const { error } = await db.from("rapportino_voci_libere").insert({
        rapportino_id: rapportinoId, descrizione: v.descrizione.trim(), quantita: numero(v.quantita) || 1, unita: v.unita.trim() || "cad",
        costo_unitario: v.costo.trim() ? numero(v.costo) : null, vendita_unitaria: v.vendita.trim() ? numero(v.vendita) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setNuova(null); aggiorna(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Voce non salvata"),
  });
  const togli = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("rapportino_voci_libere").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Voce non tolta"),
  });
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data: catalogo } = useCatalogoVociRapportino(companyId, puoModificare);
  const vociPronte = Array.isArray(catalogo?.voci) ? catalogo!.voci : [];
  const aMano = catalogo?.aMano ?? true;
  const puoAggiungere = puoModificare && (vociPronte.length > 0 || aMano);
  const { data } = useQuery({
    queryKey: chiave,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { rpc: (f: string, a: object) => Promise<{ data: Quadro | null; error: Error | null }> })
        .rpc("rapportino_quadro_economico", { p_rapportino_id: rapportinoId });
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  if (!data || !Array.isArray(data.persone) || (!data.persone.length && !data.voci?.length && !puoModificare)) return null;

  const voci = data.voci ?? [];
  const conVendita = (data.appalto && !data.a_corpo) || voci.some((v) => Number(v.vendita_unitaria ?? 0) > 0);
  const costoVoce = (v: Voce) => Number(v.quantita) * Number(v.costo_unitario ?? 0);
  const ricavoVoce = (v: Voce) => Number(v.quantita) * Number(v.vendita_unitaria ?? 0);
  const totCosto = data.persone.reduce((s, r) => s + Number(r.costo ?? 0), 0) + voci.reduce((s, v) => s + costoVoce(v), 0);
  const totRicavo = data.persone.reduce((s, r) => s + Number(r.ricavo ?? 0), 0) + voci.reduce((s, v) => s + ricavoVoce(v), 0);
  const mezzi = Array.isArray(data.mezzi) ? data.mezzi : [];
  const totOre = data.persone.reduce((s, r) => s + Number(r.ore), 0);
  const margine = (r: Riga) => (r.ricavo == null || r.costo == null ? null : Number(r.ricavo) - Number(r.costo));

  return (
    <section aria-label="Costi del rapportino" className="rounded-lg border text-[13px]">
      <h3 className="border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {data.registrato ? "Costi registrati" : "Costi stimati"}
      </h3>
      <ul className="divide-y">
        {data.persone.map((r, i) => (
          <li key={`${r.emp ?? r.nome}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">{r.nome}</span>
            <span className="text-right tabular-nums font-semibold">{r.ditta ? "Da contratto" : euro(r.costo)}</span>
            <span className="text-xs text-muted-foreground">
              {ore(Number(r.ore))}{r.costo_orario ? ` · ${euro(r.costo_orario)}/h` : r.ditta ? "" : " · tariffa da completare"}
            </span>
            <span className="text-right text-xs text-muted-foreground">costo</span>
            {conVendita && (
              <>
                <span className="text-xs text-blue-800">
                  {r.prezzo != null ? `Vendita ${euro(r.prezzo)}${UNITA[r.unita ?? ""] ?? ""} · ricavo ${euro(r.ricavo)}` : "Vendita da impostare"}
                </span>
                <span className={`text-right text-xs font-semibold tabular-nums ${(margine(r) ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {margine(r) == null ? "" : `margine ${euro(margine(r))}`}
                </span>
              </>
            )}
          </li>
        ))}
        {mezzi.map((m) => (
          <li key={m.mezzo_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">{m.nome ?? "Mezzo"}</span>
            <span className="text-right tabular-nums font-semibold">{m.noleggio ? "Da fattura" : euro(m.importo)}</span>
            <span className="text-xs text-muted-foreground">
              {ore(Number(m.ore))}{m.ore_stimate ? " stimate" : ""}{m.noleggio ? " · noleggio" : m.costo_orario != null ? ` · ${euro(m.costo_orario)}/h` : " · costo orario da completare"}
            </span>
            <span className="text-right text-xs text-muted-foreground">{m.noleggio ? "" : "quota interna"}</span>
          </li>
        ))}
        {voci.map((v) => (
          <li key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
            <span className="min-w-0 truncate font-medium text-slate-900">{v.descrizione}</span>
            <span className="flex items-center justify-end gap-1 tabular-nums font-semibold">
              {euro(costoVoce(v))}
              {puoModificare && (
                <button type="button" aria-label={`Togli ${v.descrizione}`} disabled={togli.isPending} onClick={() => togli.mutate(v.id)}
                  className="tap-compact rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{Number(v.quantita).toLocaleString("it-IT")} {v.unita}{v.costo_unitario != null ? ` · ${euro(v.costo_unitario)}` : ""}</span>
            <span className="text-right text-xs text-blue-800">{Number(v.vendita_unitaria ?? 0) > 0 ? `ricavo ${euro(ricavoVoce(v))}` : ""}</span>
          </li>
        ))}
      </ul>
      {puoAggiungere && (nuova ? (
        <form className="grid grid-cols-6 gap-1.5 border-t p-2" onSubmit={(e) => { e.preventDefault(); if (nuova.descrizione.trim()) aggiungi.mutate(nuova); }}>
          {vociPronte.length > 0 && (
            <select aria-label="Scegli la voce" className="col-span-6 h-8 rounded-md border bg-background px-2 text-[13px]" value={vociPronte.find((v) => v.nome === nuova.descrizione)?.id ?? ""}
              onChange={(e) => { const v = vociPronte.find((x) => x.id === e.target.value); setNuova(v ? { ...nuova, descrizione: v.nome, unita: v.unita, costo: v.costo_unitario?.toString() ?? "", vendita: v.vendita_unitaria?.toString() ?? "" } : { ...nuova, descrizione: "" }); }}>
              <option value="">{aMano ? "Scegli una voce o scrivila sotto" : "Scegli una voce"}</option>
              {vociPronte.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          )}
          {aMano && <Input aria-label="Descrizione voce" placeholder="Voce (es. trasporto, nolo)" className="col-span-6 h-8 text-[13px]" value={nuova.descrizione} onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value })} />}
          <Input aria-label="Quantità" inputMode="decimal" placeholder="Q.tà" className="col-span-1 h-8 px-1.5 text-[13px]" value={nuova.quantita} onChange={(e) => setNuova({ ...nuova, quantita: e.target.value })} />
          <Input aria-label="Unità" placeholder="Unità" className="col-span-1 h-8 px-1.5 text-[13px]" value={nuova.unita} onChange={(e) => setNuova({ ...nuova, unita: e.target.value })} />
          <Input aria-label="Costo unitario" inputMode="decimal" placeholder="Costo €" className="col-span-2 h-8 text-[13px]" value={nuova.costo} onChange={(e) => setNuova({ ...nuova, costo: e.target.value })} />
          <Input aria-label="Vendita unitaria" inputMode="decimal" placeholder="Vendita €" className="col-span-2 h-8 text-[13px]" value={nuova.vendita} onChange={(e) => setNuova({ ...nuova, vendita: e.target.value })} />
          <div className="col-span-6 flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setNuova(null)}>Annulla</Button>
            <Button type="submit" size="sm" className="h-7" disabled={aggiungi.isPending || !nuova.descrizione.trim()}>Aggiungi</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setNuova({ ...VUOTA })} className="tap-compact flex w-full items-center gap-1 border-t px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-muted/40">
          <Plus className="h-3.5 w-3.5" /> Aggiungi voce
        </button>
      ))}
      <dl className={`grid gap-2 border-t bg-muted/40 px-3 py-1.5 tabular-nums ${conVendita ? "grid-cols-4" : "grid-cols-2"}`}>
        <div><dt className="text-[11px] text-muted-foreground">Ore</dt><dd className="font-semibold">{ore(totOre)}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">Costo</dt><dd className="font-semibold">{euro(totCosto)}</dd></div>
        {conVendita && <div><dt className="text-[11px] text-muted-foreground">Ricavo</dt><dd className="font-semibold">{euro(totRicavo)}</dd></div>}
        {conVendita && <div><dt className="text-[11px] text-muted-foreground">Margine</dt><dd className={`font-semibold ${totRicavo - totCosto < 0 ? "text-red-700" : "text-emerald-700"}`}>{euro(totRicavo - totCosto)}</dd></div>}
      </dl>
    </section>
  );
}
