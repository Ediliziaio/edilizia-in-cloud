/**
 * «Voci impianti dalla pianta»: prese, punti luce, metri di cavo e tubi, split e linee del clima
 * contati nella pianta diventano voci del computo con un prezzo di partenza (modificabile qui e
 * dopo). Ogni voce nasce con la sua riga di misura legata alla pianta: se la pianta cambia, il
 * computo lo sa («La pianta è cambiata») e l'editor mostra l'effetto sul prezzo.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useElencoPlanimetrie, usePlanimetria } from "@/lib/planimetrie/archivio";
import { statiDellaPianta } from "@/lib/planimetrie/computo";
import { vociDallaPianta, type ProposteVoce } from "@/lib/planimetrie/listinoImpianti";
import { calcolaQuantita } from "../../../../../shared/planimetrie/quantita.ts";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
const selezione = "h-9 w-full rounded-md border bg-background px-2 text-sm";

interface DaCreare { p: ProposteVoce; prezzo: number }

function useCreaVoci(uploadId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ voci, planimetriaId, versione, ordineDa }: { voci: DaCreare[]; planimetriaId: string; versione: number; ordineDa: number }) => {
      const create: string[] = [];
      try {
        for (const [i, { p, prezzo }] of voci.entries()) {
          const numero = `IMP.${String(i + 1).padStart(2, "0")}`;
          const { data, error } = await supabase.from("computo_voci_estratte").insert({
            computo_upload_id: uploadId, company_id: companyId, numero_ordine: numero, codice_tariffa: numero,
            descrizione_breve: p.voce.descrizione.slice(0, 200), descrizione_estesa: p.voce.descrizione, unita_misura: p.voce.unita === "ml" ? "m" : p.voce.unita === "mq" ? "mq" : "n",
            quantita: p.quantita, prezzo_unitario_computo: prezzo, importo_computo: Math.round(p.quantita * prezzo * 100) / 100,
            is_sicurezza: false, nuovo_prezzo: true, quadro_voce: "lavori", ordine: ordineDa + i, super_categoria: p.voce.capitolo,
            confidence: 1, is_included: true,
          }).select("id").single();
          if (error || !data) throw new Error(error?.message?.startsWith("Computo contrattuale") ? error.message : "Voce non creata: riprova tra qualche secondo.");
          create.push(data.id);
          const { error: errRiga } = await supabase.from("computo_voci_misure").insert({
            company_id: companyId, voce_id: data.id, ordine: 1, descrizione: `Dalla pianta${p.stimata ? " (stima)" : ""}`, quantita: p.quantita,
            planimetria_id: planimetriaId, planimetria_versione: versione, planimetria_chiavi: [p.chiave],
          } as never);
          if (errRiga) throw new Error("Riga di misura non creata: riprova tra qualche secondo.");
        }
      } catch (e) {
        if (create.length) await supabase.from("computo_voci_estratte").delete().in("id", create);
        throw e;
      }
      return create.length;
    },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["computo-commessa-voci", uploadId] }),
      qc.invalidateQueries({ queryKey: ["planimetrie", "del-computo"] }),
      qc.invalidateQueries({ queryKey: ["planimetrie", "righe-collegate"] }),
    ]),
  });
}

export default function VociImpiantiDallaPianta({ uploadId, companyId, orderId, ordineDa, aperta, onChiudi }: {
  uploadId: string; companyId: string; orderId: string; ordineDa: number; aperta: boolean; onChiudi: () => void;
}) {
  const { data: piante = [] } = useElencoPlanimetrie(aperta ? companyId : null);
  const diCommessa = piante.filter((p) => p.order_id === orderId);
  const [piantaScelta, setPiantaScelta] = useState<string | null>(null);
  const piantaId = piantaScelta ?? diCommessa[0]?.id ?? (piante.length === 1 ? piante[0].id : null);
  const { data: pianta, isLoading } = usePlanimetria(piantaId);
  const documento = pianta?.versione.documento;
  const stati = documento ? statiDellaPianta(documento) : [];
  const [statoScelto, setStatoScelto] = useState<string | null>(null);
  // di partenza il progetto (il lavoro da fare), se c'è
  const stato = stati.find((s) => s.chiave === statoScelto) ?? stati.find((s) => s.proposta) ?? stati[0] ?? null;
  const proposte = useMemo(() => (documento && stato ? vociDallaPianta(calcolaQuantita(documento), stato.chiave) : []), [documento, stato]);
  const [prezzi, setPrezzi] = useState<Record<string, string>>({});
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());
  const prezzoDi = (p: ProposteVoce) => {
    const t = prezzi[p.voce.id];
    const n = t == null ? p.voce.prezzo : Number(t.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : p.voce.prezzo;
  };
  const scelte = proposte.filter((p) => !esclusi.has(p.voce.id));
  const totale = scelte.reduce((t, p) => t + p.quantita * prezzoDi(p), 0);
  const crea = useCreaVoci(uploadId, companyId);

  const conferma = () => {
    if (!pianta || !scelte.length) return;
    crea.mutate({ voci: scelte.map((p) => ({ p, prezzo: prezzoDi(p) })), planimetriaId: pianta.riga.id, versione: pianta.versione.numero, ordineDa }, {
      onSuccess: (n) => { toast.success(`${n} voci impianti aggiunte`, { description: "Sono legate alla pianta: se la cambi, il computo te lo dice." }); onChiudi(); },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Voci non create."),
    });
  };

  return (
    <Dialog open={aperta} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-amber-600" />Voci impianti dalla pianta</DialogTitle>
          <DialogDescription>
            Prese, punti luce, metri di cavo e tubi, split e linee del clima contati nella pianta. I prezzi sono di partenza (fornitura e posa): cambiali con i tuoi. Le metrature di cavi e tubi sono stimate lungo le pareti.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="vi-pianta">Pianta</label>
            <select id="vi-pianta" className={selezione} value={piantaId ?? ""} onChange={(e) => setPiantaScelta(e.target.value || null)}>
              {!piantaId && <option value="">Scegli…</option>}
              {piante.map((p) => <option key={p.id} value={p.id}>{p.titolo}{p.order_id === orderId ? " (di questa commessa)" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="vi-stato">Quale pianta</label>
            <select id="vi-stato" className={selezione} value={stato?.chiave ?? ""} onChange={(e) => setStatoScelto(e.target.value)}>
              {stati.map((s) => <option key={s.chiave} value={s.chiave}>{s.nome}</option>)}
            </select>
          </div>
        </div>
        {isLoading ? <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Carico la pianta…</p>
          : !proposte.length ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-slate-600">
              In questa pianta non ci sono impianti da contare. Nell'editor: stanza → «Impianto elettrico minimo» o «Clima», oppure posa prese, sanitari, split e le partenze (quadro, collettore, colonna di scarico, unità esterna) da Arredi → Impianti.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-slate-600">
                  <tr><th className="w-8 p-2" /><th className="p-2 text-left">Voce</th><th className="p-2 text-right">Quantità</th><th className="p-2 text-right">Prezzo</th><th className="p-2 text-right">Importo</th></tr>
                </thead>
                <tbody>
                  {proposte.map((p) => {
                    const on = !esclusi.has(p.voce.id);
                    return (
                      <tr key={p.voce.id} className="border-t align-top">
                        <td className="p-2"><Checkbox checked={on} onCheckedChange={(v) => setEsclusi((x) => { const n = new Set(x); if (v) n.delete(p.voce.id); else n.add(p.voce.id); return n; })} aria-label={p.voce.descrizione} /></td>
                        <td className="p-2"><p className="text-xs text-slate-500">{p.voce.capitolo}</p><p>{p.voce.descrizione}</p></td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">{p.quantita.toLocaleString("it-IT")} {p.voce.unita === "ml" ? "m" : p.voce.unita === "mq" ? "m²" : "n."}{p.stimata && <Badge variant="outline" className="ml-1 border-amber-300 text-amber-800">stima</Badge>}</td>
                        <td className="p-2 text-right"><Input className="h-8 w-24 text-right" inputMode="decimal" value={prezzi[p.voce.id] ?? String(p.voce.prezzo).replace(".", ",")} onChange={(e) => setPrezzi((x) => ({ ...x, [p.voce.id]: e.target.value }))} aria-label={`Prezzo di ${p.voce.descrizione}`} /></td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">{on ? euro(p.quantita * prezzoDi(p)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <DialogFooter className="items-center gap-3">
          {scelte.length > 0 && <span className="text-sm">Totale <strong>{euro(totale)}</strong></span>}
          <Button disabled={!scelte.length || crea.isPending} onClick={conferma}>
            {crea.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Aggiungi {scelte.length} voci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
