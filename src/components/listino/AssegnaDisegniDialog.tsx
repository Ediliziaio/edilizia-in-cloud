/**
 * «Assegna i disegni dai nomi»: dà a ogni articolo del listino il suo tipo di disegno automatico guardando il nome
 * («Finestra 2 Ante» → finestra a 2 ante). Prima mostra la proposta, riga per riga, e non scrive finché non si conferma.
 * Non tocca gli articoli che hanno già un tipo, né quelli che non riconosce (restano con la foto). Si può annullare.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { proponiDisegniDaNomi } from "@/lib/serramenti/assegnaDisegniDaNomi";
import type { FamilyWithAxes } from "@/types/articleFamily";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  articoli: FamilyWithAxes[];
  onFatto: () => void;
}

const LOTTO = 20;

export function AssegnaDisegniDialog({ open, onOpenChange, companyId, articoli, onFatto }: Props) {
  const proposte = useMemo(() => proponiDisegniDaNomi(articoli), [articoli]);
  const daAssegnare = proposte.filter((p) => p.esito === "proposto");
  const nonRiconosciuti = proposte.filter((p) => p.esito === "non_riconosciuto");
  const giaAssegnati = proposte.filter((p) => p.esito === "gia_assegnato").length;

  const [escluse, setEscluse] = useState<Set<string>>(new Set());
  const [inCorso, setInCorso] = useState(false);
  const [applicati, setApplicati] = useState<Array<{ id: string; tipo: string }>>([]);

  const scelte = daAssegnare.filter((p) => !escluse.has(p.id));

  const alterna = (id: string) =>
    setEscluse((prima) => {
      const dopo = new Set(prima);
      if (dopo.has(id)) dopo.delete(id);
      else dopo.add(id);
      return dopo;
    });

  /** Scrive a lotti piccoli; solo dove il tipo è ancora vuoto (mai sopra a una scelta fatta a mano). */
  const scrivi = async (righe: Array<{ id: string; tipo: string | null }>, vuoto: boolean) => {
    if (!companyId) throw new Error("Azienda non identificata");
    let fatte = 0;
    for (let i = 0; i < righe.length; i += LOTTO) {
      for (const r of righe.slice(i, i + LOTTO)) {
        let q = supabase.from("article_families" as never).update({ disegno_tipologia: r.tipo } as never).eq("id", r.id).eq("company_id", companyId);
        q = vuoto ? q.is("disegno_tipologia", null) : q.eq("disegno_tipologia", applicati.find((a) => a.id === r.id)?.tipo ?? "");
        const { error } = await q;
        if (error) throw new Error(error.message);
        fatte += 1;
      }
    }
    return fatte;
  };

  const applica = async () => {
    setInCorso(true);
    try {
      const righe = scelte.map((p) => ({ id: p.id, tipo: p.tipo as string }));
      const fatte = await scrivi(righe, true);
      setApplicati(righe);
      toast.success(`Disegno assegnato a ${fatte} articoli`, { description: "Puoi annullare da questa finestra." });
      onFatto();
    } catch (e) {
      toast.error("Assegnazione non riuscita", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setInCorso(false);
    }
  };

  const annulla = async () => {
    setInCorso(true);
    try {
      const fatte = await scrivi(applicati.map((a): { id: string; tipo: string | null } => ({ id: a.id, tipo: null })), false);
      setApplicati([]);
      toast.success(`Annullato: ${fatte} articoli tornati senza disegno`);
      onFatto();
    } catch (e) {
      toast.error("Annullamento non riuscito", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setInCorso(false);
    }
  };

  const fatto = applicati.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" aria-hidden="true" /> Assegna i disegni dai nomi
          </DialogTitle>
          <DialogDescription>
            Il sistema legge il nome di ogni articolo e propone il tipo di disegno. Togli la spunta dove non sei d&apos;accordo: non cambia nulla finché non confermi.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {daAssegnare.length} da assegnare · {giaAssegnati} già con un tipo · {nonRiconosciuti.length} non riconosciuti (restano con la foto)
        </p>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-md border p-2">
          {daAssegnare.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nessun articolo da assegnare.</p>}
          {daAssegnare.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
              <Checkbox checked={!escluse.has(p.id)} onCheckedChange={() => alterna(p.id)} disabled={fatto || inCorso} />
              <span className="min-w-0 flex-1 truncate">{p.nome}</span>
              <span className="shrink-0 text-xs text-muted-foreground">→ {p.etichetta}</span>
            </label>
          ))}
          {nonRiconosciuti.length > 0 && (
            <details className="px-2 pt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Non riconosciuti ({nonRiconosciuti.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {nonRiconosciuti.map((p) => (
                  <li key={p.id} className="truncate">{p.nome}</li>
                ))}
              </ul>
              <p className="mt-1">Il tipo si sceglie aprendo l&apos;articolo, nel campo «Tipo di disegno».</p>
            </details>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {fatto && (
            <Button variant="outline" onClick={annulla} disabled={inCorso}>
              Annulla l&apos;assegnazione
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            {fatto ? "Chiudi" : "Non ora"}
          </Button>
          {!fatto && (
            <Button onClick={applica} disabled={inCorso || scelte.length === 0}>
              {inCorso ? "Assegno…" : `Assegna a ${scelte.length} articoli`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
