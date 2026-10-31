/**
 * Condizioni del contratto di subappalto, articolo per articolo (31/10/2026).
 *
 * Due livelli:
 *  - lo standard dell'azienda (subappalto_modello_contratto), che vale per tutti i contratti;
 *  - il singolo contratto (contratti_subappalto.articoli_personalizzati), che vince sullo standard.
 * Il titolo degli articoli non cambia: serve all'approvazione specifica (artt. 1341-1342 c.c.) e alla firma.
 * Gli articoli che contengono dati del contratto (importi, date, nomi) si cambiano solo nel contratto.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  articoliConDatiDelContratto, articoliContratto, unisciArticoliPersonalizzati, type DatiContrattoSubappalto,
} from "@/lib/subappaltatori/contrattoSubappaltoHtml";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const testoDi = (paragrafi: string[]) => paragrafi.join("\n\n");

export function CondizioniContrattoDialog({
  companyId, contrattoId, dati, modello, personalizzati, bloccato, puoScrivere, onClose, onSalvato,
}: {
  companyId: string;
  contrattoId: string;
  /** I dati del contratto SENZA testi personalizzati: da qui si calcolano i testi standard. */
  dati: DatiContrattoSubappalto;
  /** Standard dell'azienda: {titolo: testo}. */
  modello: Record<string, string>;
  /** Testi del contratto: {titolo: testo}. */
  personalizzati: Record<string, string>;
  /** Firmato o in firma: il contratto non si cambia (lo standard dell'azienda sì). */
  bloccato: string | null;
  puoScrivere: boolean;
  onClose: () => void;
  onSalvato: () => void;
}) {
  const qc = useQueryClient();
  const conDati = useMemo(() => articoliConDatiDelContratto(), []);
  // Il testo di base (codice), quello con lo standard dell'azienda, e quello attuale del contratto.
  const base = useMemo(() => articoliContratto({ ...dati, articoliPersonalizzati: {} }), [dati]);
  const conModello = useMemo(() => articoliContratto({ ...dati, articoliPersonalizzati: unisciArticoliPersonalizzati(modello, {}) }), [dati, modello]);
  const attuali = useMemo(() => articoliContratto({ ...dati, articoliPersonalizzati: unisciArticoliPersonalizzati(modello, personalizzati) }), [dati, modello, personalizzati]);
  const [testi, setTesti] = useState<Record<string, string>>(() => Object.fromEntries(attuali.map((a) => [a.titolo, testoDi(a.paragrafi)])));
  const testoBase = (titolo: string) => testoDi(base.find((a) => a.titolo === titolo)?.paragrafi ?? []);
  const testoModello = (titolo: string) => testoDi(conModello.find((a) => a.titolo === titolo)?.paragrafi ?? []);
  const norm = (v: string) => v.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).join("\n\n");

  const salvaContratto = useMutation({
    mutationFn: async () => {
      if (bloccato) throw new Error(bloccato);
      // Si salva solo ciò che differisce dallo standard dell'azienda.
      const diff: Record<string, string> = {};
      for (const a of attuali) {
        const v = norm(testi[a.titolo] ?? "");
        if (v && v !== norm(testoModello(a.titolo))) diff[a.titolo] = v;
      }
      const { data, error } = await db.from("contratti_subappalto").update({ articoli_personalizzati: diff })
        .eq("id", contrattoId).eq("company_id", companyId).is("firmato_il", null).select("id");
      if (error) throw new Error("Condizioni non salvate. Riprova.");
      if (!data?.length) throw new Error("Condizioni non salvate: il contratto è firmato o non hai il permesso.");
      return Object.keys(diff).length;
    },
    onSuccess: (n) => {
      toast.success(n ? `Condizioni del contratto salvate (${n} ${n === 1 ? "articolo personalizzato" : "articoli personalizzati"})` : "Il contratto usa lo standard");
      onSalvato(); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvaStandard = useMutation({
    mutationFn: async () => {
      // Lo standard dell'azienda: solo gli articoli senza dati del contratto, e solo se diversi dal testo di base.
      const nuovo: Record<string, string> = {};
      for (const a of base) {
        if (conDati.has(a.titolo)) continue;
        const v = norm(testi[a.titolo] ?? "");
        if (v && v !== norm(testoBase(a.titolo))) nuovo[a.titolo] = v;
      }
      const { data: utente } = await supabase.auth.getUser();
      const { data, error } = await db.from("subappalto_modello_contratto")
        .upsert({ company_id: companyId, articoli: nuovo, updated_at: new Date().toISOString(), updated_by: utente.user?.id ?? null }, { onConflict: "company_id" })
        .select("company_id");
      if (error) throw new Error("Standard non salvato: serve il permesso di modificare commesse e subappalti.");
      if (!data?.length) throw new Error("Standard non salvato: non hai il permesso.");
      return Object.keys(nuovo).length;
    },
    onSuccess: (n) => {
      toast.success(`Standard dell'azienda salvato (${n} ${n === 1 ? "articolo diverso" : "articoli diversi"} dal testo di base). Vale per tutti i contratti che non hanno un testo proprio.`);
      qc.invalidateQueries({ queryKey: ["subappalto-modello-contratto", companyId] });
      onSalvato(); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const occupato = salvaContratto.isPending || salvaStandard.isPending;
  return (
    <Dialog open onOpenChange={(v) => { if (!v && !occupato) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Condizioni del contratto</DialogTitle>
          <DialogDescription>
            Ogni articolo si può riscrivere. «Salva per questo contratto» vale solo qui; «Salva come standard dell'azienda»
            vale per tutti i contratti che non hanno un testo proprio. Una riga vuota separa i paragrafi.
          </DialogDescription>
        </DialogHeader>
        {bloccato && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{bloccato}</p>}
        <div className="space-y-4">
          {attuali.map((a, i) => {
            const v = testi[a.titolo] ?? "";
            const daContratto = norm(v) !== norm(testoModello(a.titolo));
            const daModello = norm(testoModello(a.titolo)) !== norm(testoBase(a.titolo));
            return (
              <div key={a.titolo} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">Art. {i + 1} – {a.titolo}</p>
                  {daContratto && <Badge variant="outline" className="text-[11px]">Solo questo contratto</Badge>}
                  {!daContratto && daModello && <Badge variant="outline" className="text-[11px]">Standard dell'azienda</Badge>}
                  {conDati.has(a.titolo) && <span className="text-[11px] text-muted-foreground">contiene dati del contratto: si cambia solo qui</span>}
                  {(daContratto || daModello) && (
                    <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-xs" disabled={occupato}
                      title="Rimette il testo di base"
                      onClick={() => setTesti((p) => ({ ...p, [a.titolo]: testoBase(a.titolo) }))}>
                      <RotateCcw className="h-3 w-3" />Testo di base
                    </Button>
                  )}
                </div>
                <Textarea rows={Math.min(10, Math.max(3, Math.ceil(v.length / 110)))} value={v} disabled={occupato || !puoScrivere}
                  onChange={(e) => setTesti((p) => ({ ...p, [a.titolo]: e.target.value }))} />
              </div>
            );
          })}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" disabled={occupato} onClick={onClose}>Annulla</Button>
          <Button variant="outline" disabled={occupato || !puoScrivere} onClick={() => salvaStandard.mutate()}>
            {salvaStandard.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva come standard dell'azienda
          </Button>
          <Button disabled={occupato || !puoScrivere || !!bloccato} onClick={() => salvaContratto.mutate()}>
            {salvaContratto.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salva per questo contratto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
