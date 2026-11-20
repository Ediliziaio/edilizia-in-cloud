import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { percorsoDocumentoGenerale, useAspettoOperativo } from "@/components/orders/generali/design/ContestoOperativo";
import { messaggioSalvataggio } from "@/lib/fatturazione/salvataggioFattura";

const db = supabase as unknown as {
  rpc(nome: string, args: { p_fattura: string }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export interface RiepilogoDdt {
  ddt: Array<{ id: string | null; numero: string; data: string | null; ddt_id: string | null;
    esito: "mancante" | "non_disponibile" | "fornitore_da_verificare" | "senza_destinazione" | "piu_destinazioni" | "collegato";
    destinazioni: Array<{ tipo: "commessa" | "magazzino"; id: string; codice: string | null; valida: boolean }> }>;
  completo: boolean; motivo: string; automatico: boolean; senza_costo: boolean; allineata: boolean; manuale: boolean; gestita_altrove: boolean;
}

export function RiepilogoDdtFattura({ companyId, fatturaId, puoModificare }: { companyId: string; fatturaId: string; puoModificare: boolean }) {
  const qc = useQueryClient();
  const aspetto = useAspettoOperativo();
  const q = useQuery({
    queryKey: ["fattura-ddt-riepilogo", companyId, fatturaId],
    queryFn: async () => {
      // RPC con controllo dell'azienda e dei permessi, anche quando il documento originale non è leggibile.
      const { data, error } = await db.rpc("fattura_ddt_riepilogo", { p_fattura: fatturaId });
      if (error) throw error;
      return data as unknown as RiepilogoDdt | null;
    },
  });
  const allinea = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("fattura_ddt_allinea_commesse", { p_fattura: fatturaId });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: esito => {
      if (esito === "allineata") toast.success("Commesse aggiornate dai DDT");
      else toast.info("Controlla le destinazioni e le quote della fattura");
      refreshFinancialQueries(qc);
    },
    onError: e => toast.error("Commesse non aggiornate", { description: messaggioSalvataggio(e) }),
  });
  if (q.isError) return <p role="alert" className="basis-full text-xs text-destructive">Verifica DDT non disponibile. <button className="underline" onClick={() => void q.refetch()}>Riprova</button></p>;
  const p = q.data;
  if (!p?.ddt?.length) return null;
  const mancanti = p.ddt.filter(d => d.esito === "mancante");
  const senzaDestinazione = p.ddt.filter(d => d.esito === "senza_destinazione");
  const daVerificare = p.ddt.filter(d => ["non_disponibile", "fornitore_da_verificare", "piu_destinazioni"].includes(d.esito));
  const trovati = p.ddt.filter(d => d.ddt_id && d.esito !== "non_disponibile").length;
  const destinazioni = [...new Map(p.ddt.flatMap(d => d.destinazioni).map(d => [`${d.tipo}:${d.id}`, d])).values()];
  const nomi = (righe: RiepilogoDdt["ddt"]) => righe.map(d => `${d.numero}${d.data ? ` (${d.data.split("-").reverse().join("/")})` : ""}`).join(", ");
  return <div className="basis-full space-y-1.5 pt-1 text-xs [overflow-wrap:anywhere]" aria-label="Verifica DDT e commesse">
    <p className="text-muted-foreground">{trovati} di {p.ddt.length} DDT collegati</p>
    {mancanti.length > 0 && <p role="alert" className="text-amber-800 dark:text-amber-300">{mancanti.length} DDT da collegare: {nomi(mancanti)}.</p>}
    {senzaDestinazione.length > 0 && <p role="alert" className="text-amber-800 dark:text-amber-300">{senzaDestinazione.length} DDT senza cantiere o magazzino: {nomi(senzaDestinazione)}.</p>}
    {daVerificare.length > 0 && <p role="alert" className="text-amber-800 dark:text-amber-300">Verifica fornitore e destinazione dei DDT: {nomi(daVerificare)}.</p>}
    {destinazioni.length > 0 && <p className="flex flex-wrap gap-x-3 gap-y-1"><span className="text-muted-foreground">Destinazioni DDT:</span>{destinazioni.map(d =>
      d.tipo === "commessa" && d.valida ? <Link key={d.id} className="underline underline-offset-2" to={percorsoDocumentoGenerale(`/azienda/ordini/${d.id}`, aspetto?.generaleId)}>{d.codice || "Commessa"}</Link>
        : <span key={`${d.tipo}:${d.id}`}>{d.tipo === "magazzino" ? "Magazzino" : "Commessa non disponibile"}</span>)}</p>}
    {!p.completo && !mancanti.length && !senzaDestinazione.length && !daVerificare.length && <p role="alert" className="text-amber-800 dark:text-amber-300">{p.motivo}</p>}
    {p.completo && <>
      {p.allineata ? <p className="text-muted-foreground">Costi assegnati alle destinazioni dei DDT.</p>
        : p.gestita_altrove ? <p className="text-muted-foreground">Il costo è gestito separatamente: verifica le quote nella sezione Commesse.</p>
          : p.manuale ? <p role="alert" className="text-amber-800 dark:text-amber-300">Le commesse sono state scelte manualmente: controlla che le quote corrispondano ai DDT.</p>
            : p.senza_costo ? <p className="text-muted-foreground">Destinazioni riconosciute. Il costo verrà ripartito dopo la contabilizzazione.</p>
              : !p.automatico ? <p className="text-muted-foreground">Collegamento automatico disattivato: assegna le quote da Commesse.</p>
                : puoModificare && <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={allinea.isPending} onClick={() => allinea.mutate()}>{allinea.isPending ? "Aggiornamento…" : "Aggiorna commesse dai DDT"}</Button>}
    </>}
  </div>;
}
