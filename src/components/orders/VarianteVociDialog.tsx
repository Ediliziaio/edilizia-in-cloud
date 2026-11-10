/**
 * «Variante sulle voci» di un contratto firmato (10/11/2026, lotto 8 di docs/piano-subappalto-computo-listino.md).
 *
 * Le voci affidate alla ditta: quelle nel contratto (si cambia la quantità, e il prezzo se non sono ancora
 * misurate; a 0 escono) e le quote in bozza della stessa ditta (entrano). Il database fa tutto in un passaggio
 * con `subappalto_variante_voci`: quote, importo del contratto, nuova revisione del quadro lavori con le
 * stesse voci (le misure restano valide), registro delle varianti. Qui solo la scelta e il conto.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { parseAssignmentAmount } from "@/lib/orders/assignmentAmounts";
import type { AffidamentoChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface VoceVariante { id: string; descrizione: string; unita: string | null; quantita: number }

const cent = (n: number) => Math.round(n * 100) / 100;
const qt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
const inCasella = (n: number | null, dec: number) => (n == null ? "" : n.toLocaleString("it-IT", { maximumFractionDigits: dec, useGrouping: false }));

/** Le righe cambiate da mandare al database, e la differenza d'importo (al centesimo, riga per riga). */
export function righeVariante(
  quote: ReadonlyArray<Pick<AffidamentoChiFaCosa, "id" | "quantita" | "prezzo_unitario" | "stato">>,
  scritte: Readonly<Record<string, { quantita: string; prezzo: string }>>,
): { righe: Array<{ affidamento_id: string; quantita: number; prezzo: number }>; differenza: number; errori: string[] } {
  const righe: Array<{ affidamento_id: string; quantita: number; prezzo: number }> = [];
  const errori: string[] = [];
  let differenza = 0;
  for (const a of quote) {
    const s = scritte[a.id];
    if (!s) continue;
    const q = s.quantita.trim() === "" ? null : parseAssignmentAmount(s.quantita, 3);
    const p = s.prezzo.trim() === "" ? null : parseAssignmentAmount(s.prezzo, 2);
    if (q == null || q < 0 || p == null || p < 0) { errori.push(a.id); continue; }
    const nelContratto = a.stato === "a_contratto";
    const prima = nelContratto ? cent(a.quantita * (a.prezzo_unitario ?? 0)) : 0;
    const dopo = cent(q * p);
    const cambiata = nelContratto ? (Math.abs(q - a.quantita) > 0.0005 || Math.abs(p - (a.prezzo_unitario ?? 0)) > 0.005) : q > 0;
    if (!cambiata) continue;
    righe.push({ affidamento_id: a.id, quantita: q, prezzo: p });
    differenza = cent(differenza + dopo - prima);
  }
  return { righe, differenza, errori };
}

export function VarianteVociDialog({ companyId, contrattoId, nomeDitta, importo, quote, voci, onChiudi, onFatto }: {
  companyId: string; contrattoId: string; nomeDitta: string; importo: number;
  /** Le quote della ditta: nel contratto (a_contratto) e in bozza. */
  quote: AffidamentoChiFaCosa[];
  voci: VoceVariante[];
  onChiudi: () => void; onFatto: () => void;
}) {
  const voce = useMemo(() => new Map(voci.map((v) => [v.id, v])), [voci]);
  const [scritte, setScritte] = useState<Record<string, { quantita: string; prezzo: string }>>({});
  const [motivo, setMotivo] = useState("");
  const ordinate = useMemo(() => [...quote].sort((a, b) => Number(b.stato === "a_contratto") - Number(a.stato === "a_contratto")), [quote]);
  const valore = (a: AffidamentoChiFaCosa) => scritte[a.id] ?? { quantita: a.stato === "a_contratto" ? inCasella(a.quantita, 3) : "", prezzo: inCasella(a.prezzo_unitario, 2) };
  const scrivi = (a: AffidamentoChiFaCosa, campo: "quantita" | "prezzo", testo: string) => setScritte((s) => ({ ...s, [a.id]: { ...valore(a), [campo]: testo } }));
  const { righe, differenza, errori } = useMemo(() => righeVariante(quote, scritte), [quote, scritte]);

  const salva = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("subappalto_variante_voci", { p_company: companyId, p_contratto: contrattoId, p_righe: righe, p_motivo: motivo.trim() });
      if (error) throw new Error(error.message);
      return data as { importo: number; differenza: number; revisione: number };
    },
    onSuccess: (r) => { toast.success(`Variante registrata: il contratto ora vale ${formatCurrency(Number(r.importo))} (revisione ${r.revisione} delle voci).`); onFatto(); },
    onError: (e: Error) => toast.error(e.message || "Variante non registrata."),
  });

  const pronta = righe.length > 0 && !errori.length && motivo.trim().length >= 5;
  return (
    <Dialog open onOpenChange={(o) => !o && !salva.isPending && onChiudi()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Variante sulle voci · {nomeDitta}</DialogTitle>
          <DialogDescription>
            Cambia le quantità (e i prezzi delle voci non ancora misurate) o aggiungi voci già affidate alla ditta. Le misure fatte restano valide;
            una voce non scende sotto quanto già misurato. Il contratto firmato resta com'è: la variante si aggiunge.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Voce</th>
                <th className="w-28 px-1 py-1.5 text-right font-medium">Quantità</th>
                <th className="w-24 px-1 py-1.5 text-right font-medium">Prezzo €</th>
                <th className="w-24 px-2 py-1.5 text-right font-medium">Importo</th>
              </tr>
            </thead>
            <tbody>
              {ordinate.map((a) => {
                const v = voce.get(a.voce_id);
                const s = valore(a);
                const q = parseAssignmentAmount(s.quantita, 3) ?? 0;
                const p = parseAssignmentAmount(s.prezzo, 2) ?? 0;
                const nel = a.stato === "a_contratto";
                return (
                  <tr key={a.id} className={`border-t align-top ${errori.includes(a.id) ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1.5">
                      <p>{v?.descrizione ?? "Voce"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {nel ? `nel contratto: ${qt(a.quantita)} ${v?.unita ?? ""} × ${formatCurrency(a.prezzo_unitario ?? 0)}` : "affidata, non ancora nel contratto"}
                        {v ? ` · voce della commessa ${qt(v.quantita)} ${v.unita ?? ""}` : ""}
                      </p>
                    </td>
                    <td className="px-1 py-1.5"><Input aria-label={`Quantità di ${v?.descrizione ?? "voce"}`} inputMode="decimal" value={s.quantita} placeholder={nel ? "" : "0"}
                      onChange={(e) => scrivi(a, "quantita", e.target.value)} className="h-8 text-right tabular-nums" /></td>
                    <td className="px-1 py-1.5"><Input aria-label={`Prezzo di ${v?.descrizione ?? "voce"}`} inputMode="decimal" value={s.prezzo}
                      onChange={(e) => scrivi(a, "prezzo", e.target.value)} className="h-8 text-right tabular-nums" /></td>
                    <td className="whitespace-nowrap px-2 pt-3 text-right tabular-nums">{formatCurrency(cent(q * p))}</td>
                  </tr>
                );
              })}
              {!ordinate.length && <tr><td colSpan={4} className="px-2 py-4 text-center text-sm text-muted-foreground">Nessuna voce affidata a questa ditta.</td></tr>}
            </tbody>
          </table>
        </div>
        <Textarea aria-label="Motivo della variante" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo della variante (es. muri in più al piano terra)" rows={2} />
        <p className="text-sm" role="status">
          Contratto {formatCurrency(importo)} → <strong>{formatCurrency(cent(importo + differenza))}</strong>
          {righe.length > 0 && <span className={differenza >= 0 ? "text-emerald-700" : "text-amber-800"}> ({differenza >= 0 ? "+" : ""}{formatCurrency(differenza)}, {righe.length} {righe.length === 1 ? "voce" : "voci"})</span>}
          {errori.length > 0 && <span className="text-red-800"> · {errori.length === 1 ? "una riga ha" : `${errori.length} righe hanno`} un numero che non si legge</span>}
        </p>
        <DialogFooter>
          <Button variant="ghost" disabled={salva.isPending} onClick={onChiudi}>Annulla</Button>
          <Button disabled={!pronta || salva.isPending} onClick={() => salva.mutate()}>
            {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Registra la variante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
