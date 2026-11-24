import { useQuery } from "@tanstack/react-query";
import { Fuel, Route } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { formatCurrency } from "@/lib/formatters";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const fmt = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 2 });
const euro = (n: number | null) => n == null ? "—" : formatCurrency(n);

export function PercorrenzeMezzi({ ordine, mezzo, dal, al, costi, distanza = true, compatto = false, filtraMezzo }: {
  ordine?: string; mezzo?: string; dal?: string; al?: string; costi: boolean; distanza?: boolean; compatto?: boolean; filtraMezzo?: string;
}) {
  const tr = useT();
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
  const mezzi = query.data?.mezzi ?? [];
  const visibili = filtraMezzo ? mezzi.filter(m => m.mezzo_id === filtraMezzo) : mezzi;
  const t = filtraMezzo ? visibili[0] : query.data?.totali;
  if (query.isPending) return <p role="status" className="text-xs text-muted-foreground">{tr("Caricamento percorrenze…")}</p>;
  if (query.isError) return <p role="alert" className="text-xs text-amber-800">{tr("Percorrenze non disponibili.")} <button type="button" onClick={() => void query.refetch()} className="underline">{tr("Riprova")}</button></p>;
  if (!t?.viaggi) return null;
  if (compatto) return <section aria-label={tr("Percorrenze e carburante")} className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Fuel className="size-4 text-primary" aria-hidden="true" />
      <h3 className="font-semibold">{dal ? tr("Totali del periodo") : tr("Carburante e percorrenze")}</h3>
      {!dal && <span className="text-xs text-muted-foreground">{tr("Intera commessa")}</span>}
    </div>
    <p className="text-muted-foreground">{t.viaggi} {t.viaggi === 1 ? tr("viaggio") : tr("viaggi")}</p>
    <p><strong className="tabular-nums">{tr("{km_verificati} km", { km_verificati: String(fmt.format(t.km_verificati) ?? "") })}</strong> {tr("verificati")}</p>
    {t.km_dichiarati > 0 && <p className="text-muted-foreground">{tr("{km_dichiarati} km da verificare", { km_dichiarati: String(fmt.format(t.km_dichiarati) ?? "") })}</p>}
    {t.km_stimati > 0 && <p className="text-muted-foreground">{tr("{km_stimati} km stimati", { km_stimati: String(fmt.format(t.km_stimati) ?? "") })}</p>}
    {costi && <p><strong className="tabular-nums">{euro(t.costo_carburante)}</strong> {tr("stima carburante")}{t.litri == null ? "" : ` · ${fmt.format(t.litri)} L`}</p>}
    {costi && t.costo_tariffa != null && <p>{tr("{costo_tariffa} a tariffa km", { costo_tariffa: euro(t.costo_tariffa) })}</p>}
    {t.tratte_senza_km > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{tr("{tratte_senza_km} tratte senza km", { tratte_senza_km: String(t.tratte_senza_km ?? "") })}</p>}
    {costi && (t.km_senza_parametri ?? 0) > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{tr("{fmt} km con consumo o prezzo da definire", { fmt: String(fmt.format(t.km_senza_parametri!) ?? "") })}</p>}
    {costi && ordine && !dal && visibili.length > 0 && <details className="basis-full text-xs">
      <summary className="cursor-pointer font-medium text-primary">{tr("Fatture per mezzo")}</summary>
      <ul className="mt-1 divide-y">
        {visibili.map(m => <li key={m.mezzo_id} className="flex flex-wrap items-center justify-between gap-1 py-1.5">
          <Link className="text-primary underline-offset-2 hover:underline" to={`/azienda/mezzi/${m.mezzo_id}?tab=fatture`}>
            {m.nome}{m.targa ? ` · ${m.targa}` : ""}
          </Link>
          <span className="tabular-nums text-muted-foreground">{tr("{costo_carburante} stima carburante", { costo_carburante: euro(m.costo_carburante) })}</span>
        </li>)}
      </ul>
    </details>}
    {costi && <p className="basis-full text-xs text-muted-foreground">{t.mimit ? `${tr("Stima con prezzi MIMIT al netto IVA ·")} ` : ""}{tr("Il consuntivo si aggiorna dalle spese e dalle fatture imputate.")}</p>}
  </section>;
  const valori = [
    ...(distanza ? [["Km verificati", fmt.format(t.km_verificati)], ["Km dichiarati", fmt.format(t.km_dichiarati)], ["Km stimati", fmt.format(t.km_stimati)]] : []),
    ...(costi ? [["Litri stimati", t.litri == null ? "—" : `${fmt.format(t.litri)} L`], ["Stima carburante", euro(t.costo_carburante)]] : []),
    ...(costi && t.costo_tariffa != null ? [["Stima a tariffa km", euro(t.costo_tariffa)]] : []),
  ];
  return <section aria-label={tr("Percorrenze e carburante")} className="space-y-1.5 rounded-lg bg-muted/35 p-2.5">
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      {costi ? <Fuel className="size-4 text-primary" /> : <Route className="size-4 text-primary" />}
      {costi ? tr("Percorrenze e carburante") : tr("Percorrenze")}
      {ordine && !dal && !al && <span className="text-xs font-normal text-muted-foreground">{tr("Intera commessa")}</span>}
    </h3>
    <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
      {valori.map(([label, valore], indice) => <div key={label}
        className={`min-w-0 rounded-md border bg-background px-2 py-1 ${valori.length % 2 && indice === valori.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold tabular-nums">{valore}</dd>
      </div>)}
    </dl>
    {ordine && visibili.length ? <ul className="divide-y text-xs">
      {visibili.map(m => <li key={m.mezzo_id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-1.5">
        <Link className="font-medium text-primary hover:underline" to={`/azienda/mezzi/${m.mezzo_id}?tab=viaggi&vista=mappa`}>
          {m.nome}{m.targa ? ` · ${m.targa}` : ""}
        </Link>
        <span className="tabular-nums text-muted-foreground">
          {fmt.format(m.km_verificati + m.km_dichiarati + m.km_stimati)} {tr("km")}
          {costi && m.costo_carburante != null ? tr(" · {costo_carburante} carburante", { costo_carburante: euro(m.costo_carburante) }) : ""}
          {costi && m.costo_tariffa != null ? tr(" · {costo_tariffa} a tariffa km", { costo_tariffa: euro(m.costo_tariffa) }) : ""}
        </span>
      </li>)}
    </ul> : null}
    {(t.tratte_senza_km > 0 || (costi && (t.km_senza_parametri ?? 0) > 0)) && <p className="text-xs text-amber-800">
      {t.tratte_senza_km > 0 && `${t.tratte_senza_km} ${t.tratte_senza_km === 1 ? "tratta senza km" : "tratte senza km"}.`}
      {costi && (t.km_senza_parametri ?? 0) > 0 && tr(" {fmt} km con consumo o prezzo al litro da impostare.", { fmt: String(fmt.format(t.km_senza_parametri!) ?? "") })}
    </p>}
    {costi && <p className="text-xs text-muted-foreground">{t.mimit ? tr("La stima usa anche i prezzi giornalieri MIMIT al netto dell’IVA ordinaria.") : tr("Stima gestionale.")} {tr("Il consuntivo usa spese e fatture registrate.")}</p>}
  </section>;
}
