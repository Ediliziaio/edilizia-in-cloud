import { useQuery } from "@tanstack/react-query";
import { Fuel, Route } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { formatCurrency } from "@/lib/formatters";

const fmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const euro = (n: number | null) => n == null ? "—" : formatCurrency(n);

export function PercorrenzeMezzi({ ordine, mezzo, dal, al, costi, distanza = true }: {
  ordine?: string; mezzo?: string; dal?: string; al?: string; costi: boolean; distanza?: boolean;
}) {
  const company = useEffectiveCompanyId();
  const actor = useAuth().user?.id;
  const query = useQuery({
    queryKey: [...viaggiKey(company ?? ""), actor, "quadro-percorrenze", ordine, mezzo, dal, al],
    enabled: Boolean(company && actor && (ordine || mezzo)),
    staleTime: 30_000, retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc("mezzi_quadro_percorrenze", {
        p_company: company!, p_ordine: ordine, p_mezzo: mezzo, p_dal: dal, p_al: al,
      }).abortSignal(signal);
      if (error) throw error;
      return data;
    },
  });
  const t = query.data?.totali;
  if (query.isPending) return <p role="status" className="text-xs text-muted-foreground">Caricamento percorrenze…</p>;
  if (query.isError) return <p role="alert" className="text-xs text-amber-800">Percorrenze non disponibili. <button type="button" onClick={() => void query.refetch()} className="underline">Riprova</button></p>;
  if (!t?.viaggi) return null;
  const valori = [
    ...(distanza ? [["Km verificati", fmt.format(t.km_verificati)], ["Km dichiarati", fmt.format(t.km_dichiarati)], ["Km stimati", fmt.format(t.km_stimati)]] : []),
    ...(costi ? [["Litri stimati", t.litri == null ? "—" : `${fmt.format(t.litri)} L`], ["Stima carburante", euro(t.costo_carburante)]] : []),
    ...(costi && t.costo_tariffa != null ? [["Stima a tariffa km", euro(t.costo_tariffa)]] : []),
  ];
  return <section aria-label="Percorrenze e carburante" className="space-y-1.5 rounded-lg bg-muted/35 p-2.5">
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      {costi ? <Fuel className="size-4 text-primary" /> : <Route className="size-4 text-primary" />}
      {costi ? "Percorrenze e carburante" : "Percorrenze"}
      {ordine && !dal && !al && <span className="text-xs font-normal text-muted-foreground">Intera commessa</span>}
    </h3>
    <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
      {valori.map(([label, valore], indice) => <div key={label}
        className={`min-w-0 rounded-md border bg-background px-2 py-1 ${valori.length % 2 && indice === valori.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold tabular-nums">{valore}</dd>
      </div>)}
    </dl>
    {ordine && query.data?.mezzi.length ? <ul className="divide-y text-xs">
      {query.data.mezzi.map(m => <li key={m.mezzo_id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-1.5">
        <Link className="font-medium text-primary hover:underline" to={`/azienda/mezzi/${m.mezzo_id}?tab=viaggi&vista=mappa`}>
          {m.nome}{m.targa ? ` · ${m.targa}` : ""}
        </Link>
        <span className="tabular-nums text-muted-foreground">
          {fmt.format(m.km_verificati + m.km_dichiarati + m.km_stimati)} km
          {costi && m.costo_carburante != null ? ` · ${euro(m.costo_carburante)} carburante` : ""}
          {costi && m.costo_tariffa != null ? ` · ${euro(m.costo_tariffa)} a tariffa km` : ""}
        </span>
      </li>)}
    </ul> : null}
    {(t.tratte_senza_km > 0 || (costi && (t.km_senza_parametri ?? 0) > 0)) && <p className="text-xs text-amber-800">
      {t.tratte_senza_km > 0 && `${t.tratte_senza_km} ${t.tratte_senza_km === 1 ? "tratta senza km" : "tratte senza km"}.`}
      {costi && (t.km_senza_parametri ?? 0) > 0 && ` ${fmt.format(t.km_senza_parametri!)} km con consumo o prezzo al litro da impostare.`}
    </p>}
    {costi && <p className="text-xs text-muted-foreground">{t.mimit ? "La stima usa anche i prezzi giornalieri MIMIT al netto dell’IVA ordinaria." : "Stima gestionale."} Il consuntivo usa spese e fatture registrate.</p>}
  </section>;
}
