/**
 * Impostazioni → Automazioni, riquadro «Da fare»: il lavoro che le regole lasciano a una persona.
 * Un numero per cosa, con dove si fa. I numeri a zero non si mostrano; se la lettura fallisce lo dice.
 * Conteggi da `acquisti_da_fare` (migrazione 20290404307000).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DaFare {
  proposte: number;
  da_ricontrollare: number;
  fornitori_senza_tipo: number;
  fatture_senza_fornitore: number;
  fatture_senza_identificativo: number;
}

export function useDaFareAcquisti(companyId: string) {
  return useQuery({
    queryKey: ["acquisti-da-fare", companyId],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DaFare> => {
      const { data, error } = await db.rpc("acquisti_da_fare", { p_company: companyId });
      if (error) throw error;
      return data as DaFare;
    },
  });
}

interface Voce {
  chiave: string;
  numero: number;
  testo: string;
  dove: string;
  link?: string;
}

/** Le voci da mostrare, nell'ordine in cui conviene farle. Esportata per i test. */
export function vociDaFare(d: DaFare): Voce[] {
  const conId = d.fatture_senza_fornitore - d.fatture_senza_identificativo;
  const voci: Voce[] = [
    {
      chiave: "proposte",
      numero: d.proposte,
      testo: d.proposte === 1 ? "collegamento proposto da confermare" : "collegamenti proposti da confermare",
      dove: "«Verifica collegamenti», qui sopra",
    },
    {
      chiave: "da_ricontrollare",
      numero: d.da_ricontrollare,
      testo: d.da_ricontrollare === 1 ? "fattura agganciata a un ordine per solo importo, da ricontrollare" : "fatture agganciate a un ordine per solo importo, da ricontrollare",
      dove: "«Verifica collegamenti» → Da ricontrollare",
    },
    {
      chiave: "fornitori_senza_tipo",
      numero: d.fornitori_senza_tipo,
      testo: d.fornitori_senza_tipo === 1 ? "fornitore senza tipo" : "fornitori senza tipo",
      dove: "Tipi dei fornitori",
      link: "/azienda/documenti/tipi-fornitori",
    },
    {
      chiave: "fatture_con_identificativo",
      numero: conId,
      testo: conId === 1 ? "fattura senza fornitore (estero, P.IVA non valida o doppione in rubrica)" : "fatture senza fornitore (estero, P.IVA non valida o doppione in rubrica)",
      dove: "Fornitori → fornitori dalle fatture",
      link: "/azienda/impostazioni/fornitori",
    },
    {
      chiave: "fatture_senza_identificativo",
      numero: d.fatture_senza_identificativo,
      testo:
        d.fatture_senza_identificativo === 1
          ? "fattura senza P.IVA né codice fiscale del fornitore: va scelto a mano"
          : "fatture senza P.IVA né codice fiscale del fornitore: va scelto a mano",
      dove: "Fatture ricevute",
      link: "/azienda/documenti/fatture-ricevute",
    },
  ];
  return voci.filter((v) => v.numero > 0);
}

const numero = new Intl.NumberFormat("it-IT");

export function DaFareAcquisti({ companyId }: { companyId: string }) {
  const { data, isLoading, isError } = useDaFareAcquisti(companyId);
  const voci = data ? vociDaFare(data) : [];
  return (
    <section className="space-y-2" aria-labelledby="da-fare-acquisti">
      <h3 id="da-fare-acquisti" className="font-medium">Da fare</h3>
      {isLoading && <p className="text-sm text-muted-foreground">Carico…</p>}
      {isError && <p className="text-sm text-muted-foreground">Non riesco a leggere il lavoro da fare (permesso o rete).</p>}
      {data && !voci.length && <p className="text-sm text-muted-foreground">Niente da fare: le regole hanno chiuso tutto.</p>}
      {voci.length > 0 && (
        <ul className="rounded-lg border divide-y">
          {voci.map((v) => (
            <li key={v.chiave} className="grid gap-1 px-4 py-2 text-sm md:grid-cols-[5rem_minmax(0,1fr)_16rem] md:items-center">
              <span className="font-semibold tabular-nums">{numero.format(v.numero)}</span>
              <span>{v.testo}</span>
              {v.link ? (
                <Link to={v.link} className="text-primary hover:underline md:text-right">{v.dove}</Link>
              ) : (
                <span className="text-muted-foreground md:text-right">{v.dove}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
