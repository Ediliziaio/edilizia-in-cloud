/**
 * Prezzi dal costo, in blocco.
 *
 *  - «Applica ricarico»: le voci selezionate passano a «dal costo» con un
 *    ricarico (o un margine) unico; il prezzo si calcola dal costo pieno.
 *  - «Ricalcola dai costi»: le voci «dal costo» il cui costo è cambiato dopo
 *    l'ultimo salvataggio tornano al prezzo del loro ricarico.
 *
 * Prima si vede cosa cambia, voce per voce; poi si applica. Le voci senza un
 * costo non si toccano: un prezzo «dal costo» senza costo sarebbe inventato.
 * Il prezzo salvato è quello che leggono preventivatori e computi; i
 * preventivi già fatti hanno il loro prezzo copiato dentro e non cambiano.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invalidateAllTariffe } from "@/lib/tariffeQueryKeys";
import { testoErrore } from "@/lib/impostazioni/testoErrore";
import { costoTariffaConosciuto, formatPrezzoUnitario } from "@/lib/tariffe/economiaTariffa";
import {
  arrotondaPercento, arrotondaRicarico, costoPieno, RICARICO_MASSIMO, formatRicarico, margineDaRicarico, marginePrezzo,
  prezzoAttesoDalCosto, prezzoDaRiallineare, prezzoDaRicarico, ricaricoDaMargine,
} from "@/lib/tariffe/prezzoDalCosto";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";

export type ModoPrezzoDalCosto = "applica" | "ricalcola";

interface Props {
  open: boolean;
  onClose: () => void;
  modo: ModoPrezzoDalCosto;
  items: Tariffa[];
  companyId: string;
  speseGenerali: number;
  sogliaMinima: number;
  ricaricoObiettivo: number;
  onApplied: () => void;
}

interface Riga {
  t: Tariffa;
  prima: number;
  dopo: number;
  margine: number | null;
}

const MOSTRATE = 8;

export function PrezzoDalCostoDialog({ open, onClose, modo, items, companyId, speseGenerali, sogliaMinima, ricaricoObiettivo, onApplied }: Props) {
  const queryClient = useQueryClient();
  const [ricaricoTesto, setRicaricoTesto] = useState(String(arrotondaPercento(ricaricoObiettivo)));
  const [margineTesto, setMargineTesto] = useState(String(arrotondaPercento(margineDaRicarico(ricaricoObiettivo) ?? 0)));
  const [salvate, setSalvate] = useState<Set<string>>(new Set());
  // il ricarico esatto per il calcolo (dal margine 40% è 66,666…%); il campo ne mostra due decimali
  const [ricaricoEsatto, setRicaricoEsatto] = useState<number | null>(ricaricoObiettivo);
  const ricarico = ricaricoEsatto != null ? arrotondaRicarico(ricaricoEsatto) : NaN;
  // il database accetta ricarichi sotto il 10000% (un margine del 99%)
  const ricaricoValido = ricaricoEsatto != null && Number.isFinite(ricaricoEsatto) && ricaricoEsatto >= 0 && ricaricoEsatto <= RICARICO_MASSIMO;

  const cambiaRicarico = (v: string) => {
    setRicaricoTesto(v);
    const r = v.trim() === "" ? null : Number(v.replace(",", "."));
    setRicaricoEsatto(r != null && Number.isFinite(r) ? r : null);
    const m = r != null ? margineDaRicarico(r) : null;
    setMargineTesto(m != null ? String(arrotondaPercento(m)) : "");
  };
  const cambiaMargine = (v: string) => {
    setMargineTesto(v);
    const r = v.trim() === "" ? null : ricaricoDaMargine(Number(v.replace(",", ".")));
    setRicaricoEsatto(r);
    setRicaricoTesto(r != null ? String(arrotondaPercento(r)) : "");
  };

  const { righe, senzaCosto } = useMemo(() => {
    const out: Riga[] = [];
    let senza = 0;
    for (const t of items) {
      const costo = costoTariffaConosciuto(t);
      const prima = Number(t.prezzo_vendita ?? 0);
      let dopo: number | null = null;
      if (modo === "applica") {
        if (costo == null || costo <= 0) { senza += 1; continue; }
        if (!ricaricoValido) continue;
        dopo = prezzoDaRicarico(costoPieno(costo, speseGenerali), ricarico);
      } else {
        if (!prezzoDaRiallineare(t, costo, speseGenerali)) continue;
        dopo = prezzoAttesoDalCosto(t, costo, speseGenerali);
      }
      // prezzo_vendita è numeric(12,4): oltre, l'aggiornamento fallirebbe a metà lotto
      if (dopo == null || dopo >= 1e8) continue;
      out.push({ t, prima, dopo, margine: marginePrezzo(dopo, costoPieno(costo, speseGenerali)) });
    }
    return { righe: out, senzaCosto: senza };
  }, [items, modo, ricarico, ricaricoValido, speseGenerali]);

  const rimanenti = righe.filter((r) => !salvate.has(r.t.id));

  const mutation = useMutation({
    mutationFn: async () => {
      const fatte = new Set(salvate);
      for (const r of rimanenti) {
        const payload: Record<string, unknown> = { prezzo_vendita: r.dopo };
        if (modo === "applica") {
          payload.prezzo_modo = "dal_costo";
          payload.ricarico_pct = ricarico;
        }
        const { data, error } = await supabase
          .from("tariffe_aziendali")
          .update(payload as never)
          .eq("id", r.t.id)
          .eq("company_id", companyId)
          .select("id")
          .single();
        if (error) throw error;
        if (!data) throw new Error(`Voce non aggiornata: ${r.t.nome}. Verifica i permessi e riprova.`);
        fatte.add(r.t.id);
        setSalvate(new Set(fatte));
      }
      return fatte.size;
    },
    onSuccess: (n) => {
      invalidateAllTariffe(queryClient);
      toast.success(`Prezzi aggiornati su ${n} ${n === 1 ? "voce" : "voci"}`);
      onApplied();
      onClose();
    },
    onError: (err) => {
      // le voci già salvate restano salvate: riprovando si riparte dalle altre
      invalidateAllTariffe(queryClient);
      toast.error(testoErrore(err, "Prezzi non aggiornati."));
    },
  });

  const sottoMinimo = righe.filter((r) => r.margine != null && r.margine < sogliaMinima).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !mutation.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modo === "applica" ? "Prezzo dal costo con un ricarico" : "Ricalcola i prezzi dai costi"}</DialogTitle>
          <DialogDescription>
            {modo === "applica"
              ? "Le voci selezionate passano a «dal costo»: prezzo = costo pieno × (1 + ricarico). Da qui in poi seguono il costo."
              : "Le voci «dal costo» il cui costo è cambiato tornano al prezzo del loro ricarico."}
            {speseGenerali > 0 ? ` Costo pieno = costo + spese generali (${speseGenerali.toLocaleString("it-IT")}%).` : ""}
          </DialogDescription>
        </DialogHeader>

        {modo === "applica" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pdc-ricarico">Ricarico sul costo %</Label>
              <Input id="pdc-ricarico" type="number" min="0" step="0.01" value={ricaricoTesto} onChange={(e) => cambiaRicarico(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="pdc-margine">oppure margine %</Label>
              <Input id="pdc-margine" type="number" min="0" max="99.99" step="0.01" value={margineTesto} onChange={(e) => cambiaMargine(e.target.value)} className="mt-1.5" />
            </div>
          </div>
        )}

        {righe.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {modo === "applica"
              ? senzaCosto > 0 ? "Nessuna delle voci selezionate ha un costo: scrivilo prima, il prezzo nasce da lì." : ricaricoEsatto != null && ricaricoEsatto > RICARICO_MASSIMO ? "Il ricarico è troppo alto: al massimo 9.999% (un margine del 99%)." : "Scrivi il ricarico, o un margine sotto il 100%."
              : "Tutte le voci «dal costo» hanno già il prezzo del loro ricarico."}
          </p>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs">
                  <th className="p-2 font-medium">Voce</th>
                  <th className="p-2 text-right font-medium">Prezzo ora</th>
                  <th className="p-2 text-right font-medium">Nuovo</th>
                  <th className="p-2 text-right font-medium">Margine</th>
                </tr>
              </thead>
              <tbody>
                {righe.slice(0, MOSTRATE).map((r) => (
                  <tr key={r.t.id} className={`border-b last:border-0 ${salvate.has(r.t.id) ? "opacity-50" : ""}`}>
                    <td className="max-w-[240px] truncate p-2">{r.t.nome}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{formatPrezzoUnitario(r.prima)}</td>
                    <td className="p-2 text-right font-medium tabular-nums">{formatPrezzoUnitario(r.dopo)}</td>
                    <td className={`p-2 text-right tabular-nums ${r.margine != null && r.margine < sogliaMinima ? "text-amber-700" : ""}`}>
                      {r.margine != null ? `${r.margine.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {righe.length > MOSTRATE && (
              <p className="border-t px-3 py-1.5 text-center text-xs text-muted-foreground">e altre {righe.length - MOSTRATE} voci</p>
            )}
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          {modo === "applica" && ricaricoValido && righe.length > 0 && (
            <p>Ricarico {formatRicarico(ricarico)} = margine {(margineDaRicarico(ricarico) ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% su {righe.length} {righe.length === 1 ? "voce" : "voci"}.</p>
          )}
          {senzaCosto > 0 && modo === "applica" && <p>{senzaCosto} {senzaCosto === 1 ? "voce senza costo resta" : "voci senza costo restano"} com'è.</p>}
          {sottoMinimo > 0 && <p className="text-amber-700">{sottoMinimo} {sottoMinimo === 1 ? "voce resta" : "voci restano"} sotto il margine minimo del {sogliaMinima}%.</p>}
          <p>I preventivi già fatti non cambiano: hanno il loro prezzo copiato dentro.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Annulla</Button>
          <Button onClick={() => mutation.mutate()} disabled={rimanenti.length === 0 || mutation.isPending}>
            {mutation.isPending ? "Aggiorno…" : `Aggiorna ${rimanenti.length} ${rimanenti.length === 1 ? "prezzo" : "prezzi"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
