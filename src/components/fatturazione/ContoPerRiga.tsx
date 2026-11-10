/**
 * Il conto di costo di ogni riga di una fattura ricevuta, nella sua scheda (10/11/2026).
 *
 * Il menu della riga mostra il conto scelto, oppure quello proposto dalla descrizione
 * (calcestruzzo → materie prime, pompaggio → noli, cubiere → consumo…), da confermare. «Conto
 * della fattura» = la riga segue il «Conto di costo» della fattura. Ogni cambio rifà la scrittura
 * contabile della fattura (contabilita_riregistra_documento), che divide l'imponibile per conto.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CATEGORIE_DI_BASE, contoPropostoRiga, etichettaCategoria } from "@/lib/fatturazione/contoPerRiga";

const DELLA_FATTURA = "__fattura";

export interface RigaPerConto { chiave: string; descrizione: string }

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export function useContiRighe({ companyId, fatturaId, salvati, righe, onCambiato }: {
  companyId: string;
  fatturaId: string;
  salvati: Record<string, string>;
  righe: RigaPerConto[];
  onCambiato: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const { data: proprie = [] } = useQuery({
    queryKey: queryKeys.costCategories.list(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cost_categories").select("*").eq("company_id", companyId).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ name: string }>;
    },
  });
  const categorie = useMemo(() => {
    const nomi = proprie.map((c) => c.name).filter(Boolean);
    return Array.from(new Set([...(nomi.length > 0 ? nomi : CATEGORIE_DI_BASE), ...Object.values(salvati)]));
  }, [proprie, salvati]);
  const proposte = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of righe) {
      if (salvati[r.chiave]) continue;
      const p = contoPropostoRiga(r.descrizione, categorie);
      if (p) m[r.chiave] = p;
    }
    return m;
  }, [righe, salvati, categorie]);

  const salva = async (nuovi: Record<string, string>, messaggio: string) => {
    setSalvando(true);
    try {
      const { error } = await supabase.from("fatture_ricevute").update({ conti_righe: nuovi } as never).eq("id", fatturaId).eq("company_id", companyId);
      if (error) throw error;
      // La contabilità generale segue; niente da fare se la fattura non c'è ancora.
      const { error: errGiornale } = await (supabase as unknown as Rpc).rpc("contabilita_riregistra_documento", {
        p_company: companyId, p_documento: fatturaId, p_motivo: "Conto di costo per riga cambiato",
      });
      toast.success(messaggio, errGiornale && !/Accesso negato/.test(errGiornale.message)
        ? { description: `Contabilità generale non aggiornata: ${errGiornale.message}` } : undefined);
      onCambiato();
    } catch (e) {
      toast.error("Conto della riga non salvato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  return {
    categorie,
    salvando,
    /** Il conto da mostrare: quello scelto, altrimenti la proposta. */
    valore: (chiave: string): string | null => salvati[chiave] ?? proposte[chiave] ?? null,
    proposto: (chiave: string): boolean => !salvati[chiave] && !!proposte[chiave],
    quanteProposte: Object.keys(proposte).length,
    cambia: (chiave: string, categoria: string | null): void => {
      const nuovi = { ...salvati };
      if (categoria) nuovi[chiave] = categoria; else delete nuovi[chiave];
      void salva(nuovi, "Conto della riga salvato");
    },
    confermaProposte: (): void => void salva({ ...proposte, ...salvati }, "Conti proposti confermati"),
  };
}

export function ContoRigaMenu({ chiave, conti }: { chiave: string; conti: ReturnType<typeof useContiRighe> }) {
  const v = conti.valore(chiave);
  const proposto = conti.proposto(chiave);
  return (
    <Select value={v ?? DELLA_FATTURA} disabled={conti.salvando}
      onValueChange={(x) => conti.cambia(chiave, x === DELLA_FATTURA ? null : x)}>
      <SelectTrigger aria-label="Conto di costo della riga" title={proposto ? "Proposto dalla descrizione: conferma o cambia" : undefined}
        className={`h-7 w-full min-w-[9rem] text-xs ${proposto ? "border-dashed italic text-muted-foreground" : ""}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DELLA_FATTURA}>Conto della fattura</SelectItem>
        {conti.categorie.map((c) => <SelectItem key={c} value={c}>{etichettaCategoria(c)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Sopra le righe: quante hanno un conto proposto, e il pulsante per confermarle tutte. */
export function ProposteContiRighe({ conti }: { conti: ReturnType<typeof useContiRighe> }) {
  if (conti.quanteProposte === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
      <span>{conti.quanteProposte} {conti.quanteProposte === 1 ? "riga ha" : "righe hanno"} un conto proposto dalla descrizione (in corsivo).</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={conti.salvando} onClick={conti.confermaProposte}>Conferma le proposte</Button>
    </div>
  );
}
