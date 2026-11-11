/**
 * Rimanenze finali al 31/12 nella contabilità generale (11/11/2026, docs/piano-assestamenti-fine-anno.md, lotto 1).
 *
 * Lavori in corso su ordinazione (proposti dalle commesse: maturato meno fatturato, gli stessi del
 * Controllo di gestione) e materiali di magazzino (giacenza × costo medio). «Registra» salva i valori
 * e scrive la scrittura al 31/12: chiude le iniziali e apre le finali sulla variazione
 * (contabilita_rimanenze). I conti li sceglie l'azienda, una volta, fra quelli del suo piano.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leggiImportoItaliano } from "@/lib/orders/salCertificato";
import { ContiPerRuolo, type RuoloConto } from "./ContiPerRuolo";

const euro = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions).format(n);

/** I conti che servono alle rimanenze: il ruolo, cosa fa, e la natura dei conti fra cui sceglierlo. */
export const RUOLI_RIMANENZE: readonly RuoloConto[] = [
  { ruolo: "04.02", etichetta: "Rimanenze di lavori in corso su ordinazione (stato patrimoniale)", natura: "attivo" },
  { ruolo: "20.03", etichetta: "Variazione dei lavori in corso su ordinazione (conto economico, A.3)", natura: "ricavo" },
  { ruolo: "04.01", etichetta: "Rimanenze di materiali (stato patrimoniale)", natura: "attivo" },
  { ruolo: "30.30", etichetta: "Variazione delle rimanenze di materiali (conto economico, B.11)", natura: "costo" },
];

interface Parte { iniziali: number; finali: number | null; proposta: number }
export interface EsitoRimanenze { lavori: Parte; materiali: Parte; registrata: boolean; da_aggiornare: boolean; conti_mancanti: string[] }

/** La risposta della funzione, letta in modo sicuro. */
export function leggiEsitoRimanenze(j: Json): EsitoRimanenze {
  const o = (j ?? {}) as Record<string, unknown>;
  const parte = (x: unknown): Parte => {
    const p = (x ?? {}) as Record<string, unknown>;
    return { iniziali: Number(p.iniziali) || 0, finali: p.finali == null ? null : Number(p.finali), proposta: Number(p.proposta) || 0 };
  };
  return {
    lavori: parte(o.lavori),
    materiali: parte(o.materiali),
    registrata: o.registrata === true,
    da_aggiornare: o.da_aggiornare === true,
    conti_mancanti: Array.isArray(o.conti_mancanti) ? o.conti_mancanti.map(String) : [],
  };
}

export function RimanenzeFineAnno({ companyId, anno, chiuso }: { companyId: string; anno: number; chiuso: boolean }) {
  const qc = useQueryClient();
  // Le stesse chiavi della contabilità generale: registrare aggiorna scritture e bilancio.
  const chiaveRim = ["contabilita-generale", companyId, "rimanenze", anno];
  const [lavori, setLavori] = useState<string | null>(null);
  const [materiali, setMateriali] = useState<string | null>(null);

  const anteprima = useQuery({
    queryKey: chiaveRim,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_rimanenze", { p_company: companyId, p_anno: anno, p_anteprima: true });
      if (error) throw error;
      return leggiEsitoRimanenze(data);
    },
  });
  const aggiorna = () => { void qc.invalidateQueries({ queryKey: ["contabilita-generale", companyId] }); };

  const a = anteprima.data;
  // Il valore registrato, o quello scritto; la proposta solo col suo pulsante (un clic su «Registra» non
  // deve scrivere un numero che nessuno ha guardato). Senza niente da contare, zero.
  const valore = (testo: string | null, p: Parte | undefined): string =>
    testo ?? (p?.finali != null ? String(p.finali) : p && p.proposta === 0 && p.iniziali === 0 ? "0" : "");
  const numLavori = leggiImportoItaliano(valore(lavori, a?.lavori));
  const numMateriali = leggiImportoItaliano(valore(materiali, a?.materiali));
  const validi = valore(lavori, a?.lavori).trim() !== "" && valore(materiali, a?.materiali).trim() !== ""
    && Number.isFinite(numLavori) && numLavori >= 0 && Number.isFinite(numMateriali) && numMateriali >= 0;

  const registra = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("contabilita_rimanenze", {
        p_company: companyId, p_anno: anno, p_anteprima: false, p_lavori: numLavori, p_materiali: numMateriali,
      });
      if (error) throw error;
      return leggiEsitoRimanenze(data);
    },
    onSuccess: (r) => {
      toast.success(r.registrata ? `Rimanenze registrate al 31/12/${anno}` : "Nessuna rimanenza da registrare");
      setLavori(null); setMateriali(null);
      aggiorna();
    },
    onError: (e) => toast.error("Rimanenze non registrate", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (anteprima.isLoading) return <p role="status" className="text-sm text-muted-foreground">Carico le rimanenze…</p>;
  if (anteprima.isError || !a) return <p role="alert" className="text-sm text-destructive">Rimanenze non disponibili. <Button variant="link" className="h-auto p-0" onClick={() => void anteprima.refetch()}>Riprova</Button></p>;

  const mancanti = RUOLI_RIMANENZE.filter((r) => a.conti_mancanti.includes(r.ruolo));
  const riga = (titolo: string, p: Parte, testo: string | null, setTesto: (v: string) => void, id: string, nota: string) => (
    <tr className="border-t">
      <td className="p-2">{titolo}<p className="text-xs text-muted-foreground">{nota}</p></td>
      <td className="p-2 text-right tabular-nums text-muted-foreground">{euro(p.iniziali)}</td>
      <td className="p-2 text-right">
        <Input id={id} aria-label={`Rimanenze finali: ${titolo}`} inputMode="decimal" placeholder="Da contare" className="ml-auto h-8 w-36 text-right tabular-nums"
          disabled={chiuso} value={valore(testo, p)} onChange={(e) => setTesto(e.target.value)} />
        {p.finali == null || Math.abs(p.proposta - (p.finali ?? 0)) >= 0.005 ? (
          <button type="button" className="mt-1 text-xs text-primary underline disabled:opacity-50" disabled={chiuso}
            onClick={() => setTesto(String(p.proposta))}>Proposta: {euro(p.proposta)}</button>
        ) : null}
      </td>
    </tr>
  );

  return (
    <div className="space-y-3">
      <ContiPerRuolo companyId={companyId} ruoli={mancanti} chiuso={chiuso} />
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Rimanenze</th><th className="p-2 text-right">Iniziali (dal giornale)</th><th className="p-2 text-right">Finali al 31/12/{anno}</th></tr>
          </thead>
          <tbody>
            {riga("Lavori in corso su ordinazione", a.lavori, lavori, setLavori, "rim-lavori", "Proposta: maturato delle commesse meno fatturato (Controllo di gestione).")}
            {riga("Materiali di magazzino", a.materiali, materiali, setMateriali, "rim-materiali", "Proposta: giacenza di oggi × costo medio. A fine anno contala davvero.")}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {a.da_aggiornare ? <strong className="text-amber-700">Da aggiornare: i valori di oggi non sono quelli registrati. Premi «Registra».</strong>
            : a.registrata ? "Registrate: se cambi un valore, la scrittura si storna e si rifà." : "Non ancora registrate."}
          {" "}La scrittura chiude le iniziali e apre le finali sulla variazione del conto economico.
        </p>
        <Button size="sm" variant="outline" disabled={chiuso || !validi || mancanti.length > 0 || registra.isPending} onClick={() => registra.mutate()}>
          {registra.isPending ? "Registrazione…" : "Registra le rimanenze"}
        </Button>
      </div>
    </div>
  );
}
