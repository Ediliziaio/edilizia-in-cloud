/**
 * Correggere un rapportino dall'ufficio, e vedere chi ha cambiato cosa.
 * La regola sta nel database (`rapportino_correggi`): su un approvato toglie ore,
 * costi e fasi vecchi e rimette i nuovi in un colpo solo.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";

type Voce = Record<string, unknown>;
interface Bozza {
  descrizione: string; note: string; ore: string; straordinario: string; conPresenze: boolean;
  presenze: Voce[]; fasi: Voce[]; materiali: Voce[]; mezzi: Voce[]; motivo: string;
}
const lista = (v: unknown): Voce[] => (Array.isArray(v) ? (v as Voce[]) : []);
const numero = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const db = supabase as unknown as {
  from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: Voce | null; error: Error | null }>; order: (c: string, o: object) => Promise<{ data: Voce[] | null; error: Error | null }> } } };
  rpc: (f: string, a: object) => Promise<{ error: Error | null }>;
};
const titolo = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

// Fuori dal componente: dentro, ogni tasto ricreerebbe il campo e toglierebbe il cursore.
const Riga = ({ nome, valore, onValore, unita, onTogli }: { nome: string; valore: unknown; onValore: (v: string) => void; unita: string; onTogli?: () => void }) => (
  <li className="flex items-center gap-2 py-1">
    <span className="min-w-0 flex-1 truncate">{nome}</span>
    <Input aria-label={`${nome}: ${unita}`} inputMode="decimal" className="h-8 w-20 text-right text-[13px]" value={String(valore ?? "")} onChange={(e) => onValore(e.target.value)} />
    <span className="w-8 text-xs text-muted-foreground">{unita}</span>
    {onTogli && <button type="button" aria-label={`Togli ${nome}`} onClick={onTogli} className="tap-compact p-1 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>}
  </li>
);

export function CorreggiRapportino({ rapportinoId, orderId, onCorretto }: { rapportinoId: string; orderId: string; onCorretto?: () => void }) {
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [b, setB] = useState<Bozza | null>(null);
  const riga = useQuery({
    queryKey: ["rapportino-da-correggere", rapportinoId],
    enabled: aperto,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await db.from("campo_rapportini").select("*").eq("id", rapportinoId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const r = riga.data;
    if (!aperto || !r) return;
    setB({
      descrizione: String(r.descrizione_lavori ?? ""), note: String(r.note ?? ""),
      ore: String(r.ore_lavorate ?? 0), straordinario: String(r.ore_straordinario ?? 0),
      conPresenze: lista(r.presenze).length > 0,
      presenze: lista(r.presenze), fasi: lista(r.fasi_lavorate), materiali: lista(r.materiali_usati), mezzi: lista(r.mezzi_usati), motivo: "",
    });
  }, [aperto, riga.data]);

  const approvato = !!riga.data?.approvato;
  const salva = useMutation({
    mutationFn: async () => {
      if (!b || !riga.data) return;
      const campi: Voce = {
        descrizione_lavori: b.descrizione, note: b.note,
        presenze: b.presenze.map((p) => ({ ...p, ore: numero(p.ore) })),
        fasi_lavorate: b.fasi.map((f) => ({ ...f, percentuale: numero(f.percentuale) })),
        materiali_usati: b.materiali.map((m) => ({ ...m, quantita: numero(m.quantita) })),
        mezzi_usati: b.mezzi.map((m) => (m.ore === "" || m.ore == null ? m : { ...m, ore: numero(m.ore) })),
      };
      if (!b.conPresenze) { campi.ore_lavorate = numero(b.ore); campi.ore_straordinario = numero(b.straordinario); }
      const { error } = await db.rpc("rapportino_correggi", { p_id: rapportinoId, p_updated_at: riga.data.updated_at, p_campi: campi, p_motivo: b.motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapportino corretto");
      refreshWorkQueries(qc, orderId);
      void qc.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === "string" && /rappor|appalto-rendiconto/.test(queryKey[0]) });
      setAperto(false);
      onCorretto?.();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Correzione non salvata"),
  });

  const modifica = (k: "presenze" | "fasi" | "materiali" | "mezzi", i: number, campo: string, v: string) =>
    setB((s) => (s ? { ...s, [k]: s[k].map((x, n) => (n === i ? { ...x, [campo]: v } : x)) } : s));
  const togli = (k: "presenze" | "materiali" | "mezzi", i: number) =>
    setB((s) => (s ? { ...s, [k]: s[k].filter((_, n) => n !== i) } : s));

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => { setB(null); setAperto(true); }}>
        <PenLine className="mr-1 h-3.5 w-3.5" />Correggi
      </Button>
      {aperto && (
        <Dialog open onOpenChange={(o) => { if (!o && !salva.isPending) setAperto(false); }}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto text-[13px] sm:max-w-2xl">
            <DialogHeader><DialogTitle className="max-md:text-base">Correggi il rapportino</DialogTitle></DialogHeader>
            {!b ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carico…</p> : (
              <div className="space-y-3">
                {approvato && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">È già approvato: ore, costi, fasi e rendiconto si aggiornano da soli.</p>}
                <div><p className={titolo}>Cosa si è fatto</p><Textarea rows={3} className="mt-1 text-[13px]" value={b.descrizione} onChange={(e) => setB({ ...b, descrizione: e.target.value })} /></div>
                {b.conPresenze ? (
                  <div><p className={titolo}>Chi ha lavorato</p><ul className="divide-y">
                    {b.presenze.map((p, i) => <Riga key={i} nome={String(p.nome ?? "Senza nome")} valore={p.ore} unita="ore" onValore={(v) => modifica("presenze", i, "ore", v)} onTogli={() => togli("presenze", i)} />)}
                  </ul></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className={titolo}>Ore</span><Input inputMode="decimal" className="mt-1 h-8 text-[13px]" value={b.ore} onChange={(e) => setB({ ...b, ore: e.target.value })} /></label>
                    <label><span className={titolo}>Straordinario</span><Input inputMode="decimal" className="mt-1 h-8 text-[13px]" value={b.straordinario} onChange={(e) => setB({ ...b, straordinario: e.target.value })} /></label>
                  </div>
                )}
                {b.fasi.length > 0 && <div><p className={titolo}>Fasi</p><ul className="divide-y">
                  {b.fasi.map((f, i) => <Riga key={i} nome={String(f.nome ?? `Fase ${i + 1}`)} valore={f.percentuale} unita="%" onValore={(v) => modifica("fasi", i, "percentuale", v)} />)}
                </ul></div>}
                {b.materiali.length > 0 && <div><p className={titolo}>Materiali</p><ul className="divide-y">
                  {b.materiali.map((m, i) => <Riga key={i} nome={String(m.nome ?? m.descrizione ?? "Materiale")} valore={m.quantita} unita={String(m.unita ?? m.unita_misura ?? "")} onValore={(v) => modifica("materiali", i, "quantita", v)} onTogli={() => togli("materiali", i)} />)}
                </ul></div>}
                {b.mezzi.length > 0 && <div><p className={titolo}>Mezzi</p><ul className="divide-y">
                  {b.mezzi.map((m, i) => <Riga key={i} nome={String(m.nome ?? "Mezzo")} valore={m.ore} unita="ore" onValore={(v) => modifica("mezzi", i, "ore", v)} onTogli={() => togli("mezzi", i)} />)}
                </ul></div>}
                <div><p className={titolo}>Note</p><Textarea rows={2} className="mt-1 text-[13px]" value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} /></div>
                <div><p className={titolo}>Motivo della correzione{approvato ? " *" : ""}</p><Input className="mt-1 h-8 text-[13px]" value={b.motivo} onChange={(e) => setB({ ...b, motivo: e.target.value })} placeholder="Es. ore sbagliate" /></div>
              </div>
            )}
            <DialogFooter className="flex-row justify-end gap-2">
              <Button variant="outline" disabled={salva.isPending} onClick={() => setAperto(false)}>Annulla</Button>
              <Button disabled={!b || salva.isPending || (approvato && !b.motivo.trim())} onClick={() => salva.mutate()}>
                {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const ETICHETTE: Record<string, string> = {
  descrizione_lavori: "Lavoro svolto", note: "Note", meteo: "Meteo", ore_lavorate: "Ore", ore_straordinario: "Straordinario",
  presenze: "Persone e ore", fasi_lavorate: "Fasi", materiali_usati: "Materiali", mezzi_usati: "Mezzi",
  percentuale_avanzamento: "Avanzamento", campi_extra: "Campi", foto_urls: "Foto", data_lavoro: "Data",
};

function descrivi(k: string, v: unknown): string {
  if (k === "presenze") return lista(v).map((p) => `${p.nome ?? "?"} ${p.ore ?? 0} h`).join(", ") || "nessuno";
  if (k === "materiali_usati") return lista(v).map((m) => `${m.nome ?? m.descrizione ?? "?"} ${m.quantita ?? ""}`).join(", ") || "nessuno";
  if (k === "mezzi_usati") return lista(v).map((m) => `${m.nome ?? "?"}${m.ore != null ? ` ${m.ore} h` : ""}`).join(", ") || "nessuno";
  if (k === "fasi_lavorate") return lista(v).map((f) => `${f.nome ?? "fase"} ${f.percentuale ?? 0}%`).join(", ") || "nessuna";
  if (Array.isArray(v) || (v && typeof v === "object")) return "modificati";
  return v == null || v === "" ? "vuoto" : String(v);
}

export function StoricoRapportino({ rapportinoId }: { rapportinoId: string }) {
  const { data } = useQuery({
    queryKey: ["rapportino-modifiche", rapportinoId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from("rapportino_modifiche").select("id, fatta_da_nome, fatta_il, motivo, prima, dopo").eq("rapportino_id", rapportinoId).order("fatta_il", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const modifiche = (data ?? []).filter((m) => typeof m.fatta_il === "string");
  if (!modifiche.length) return null;
  return (
    <details className="rounded-lg border px-3 py-1.5 text-[13px]">
      <summary className="cursor-pointer text-xs font-medium text-slate-600">Modifiche ({modifiche.length})</summary>
      <ul className="mt-1.5 space-y-2">
        {modifiche.map((m) => (
          <li key={String(m.id)} className="text-xs">
            <p className="font-medium text-slate-800">{String(m.fatta_da_nome || "Sistema")} · {format(parseISO(String(m.fatta_il)), "d MMM yyyy HH:mm", { locale: it })}</p>
            {m.motivo ? <p className="text-slate-600">Motivo: {String(m.motivo)}</p> : null}
            {Object.keys((m.dopo ?? {}) as Voce).map((k) => (
              <p key={k} className="text-muted-foreground">{ETICHETTE[k] ?? k}: {descrivi(k, (m.prima as Voce)?.[k])} → {descrivi(k, (m.dopo as Voce)?.[k])}</p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
