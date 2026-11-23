import { ArrowUpRight, Construction, Route, Truck, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MezzoGiornoMappa, PuntoMezzoMappa } from "@/integrations/supabase/appDatabase";
import { TIPI_MEZZO } from "@/types/mezzi";
import { coordinate, partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";
import { formatoKm } from "./servizio";
import type { FiltriMezzi, FiltroMezzi } from "./useMezziMappa";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const dataIt = (valore: string) => valore.split("-").reverse().join("/");
function dataOra(iso: string) {
  const { giorno, ora } = partiNelFuso(iso);
  return `${dataIt(giorno)} alle ${ora}`;
}

function Luogo({ titolo, luogo }: { titolo: string; luogo: PuntoMezzoMappa }) {
  const t = useT();
  return <div className="space-y-1 rounded-md border bg-background p-2">
    <p className="font-medium text-foreground">{titolo}</p>
    <p className="break-words">{luogo.nome}</p>
    <p className="text-muted-foreground">{luogo.fonte}{luogo.quando ? ` · ${dataOra(luogo.quando)}` : luogo.dal ? ` · ${t("dal {data}", { data: dataIt(luogo.dal) })}` : ""}</p>
    {luogo.order_id && <Link className="inline-flex items-center gap-1 font-medium text-primary underline" to={`/azienda/ordini/${luogo.order_id}`}>{t("Apri cantiere")} <ArrowUpRight className="size-3" /></Link>}
  </div>;
}

type Props = FiltriMezzi & {
  mezzi: MezzoGiornoMappa[]; selezione: string | null; giorno: string; personale: boolean;
  caricamento: boolean; aggiornamento: boolean; errore: boolean; nonDisponibile?: string | null; onRiprova: () => void; onFiltri: (patch: Partial<FiltriMezzi>) => void;
  onSeleziona: (id: string | null) => void; haPercorso: (id: string) => boolean; onPercorso: (id: string) => void; registraRiga: (id: string, el: HTMLButtonElement | null) => void;
};

export default function MezziMappa({ mezzi, selezione, giorno, personale, tipoMezzi, cercaMezzi, caricamento, aggiornamento, errore,
  nonDisponibile, onRiprova, onFiltri, onSeleziona, haPercorso, onPercorso, registraRiga }: Props) {
  const t = useT();
  return <section aria-label={t("Mezzi sulla mappa")} className="divide-y">
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap gap-2">
        <select aria-label={t("Tipo di mezzo")} className="h-9 max-w-full rounded-md border bg-background px-2 text-sm" value={tipoMezzi}
          onChange={e => onFiltri({ tipoMezzi: e.target.value as FiltroMezzi })}>
          <option value="tutti">{t("Mezzi e attrezzature")}</option><option value="stradali">{t("Veicoli stradali")}</option><option value="cantiere">{t("Mezzi da cantiere")}</option>
          <option value="attrezzature">{t("Attrezzature")}</option>
        </select>
        <Input aria-label={t("Cerca un mezzo")} className="min-w-28 flex-1" placeholder={t("Nome, targa, cantiere o persona")} value={cercaMezzi}
          onChange={e => onFiltri({ cercaMezzi: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-2"><span className="size-2 rounded-sm bg-sky-800" aria-hidden="true" /> {t("Posizione di riferimento")}
          <span className="size-2 rounded-sm bg-teal-700" aria-hidden="true" /> {t("Attrezzatura")}
          <span className="size-2 rounded-sm bg-amber-700" aria-hidden="true" /> {t("Destinazione prevista")}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRiprova} disabled={aggiornamento}>{t("Aggiorna mezzi")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{personale ? `${t("Mezzi collegati alle tue assegnazioni, ai tuoi viaggi e ai piani di cui sei responsabile.")} ` : ""}
        {tipoMezzi === "attrezzature" ? t("Ubicazioni da assegnazioni, rapportini e scansioni QR.") :
          t("Posizioni da assegnazioni e arrivi registrati. I chilometri fanno riferimento al giorno di partenza.")}</p>
    </div>
    {caricamento && <p role="status" className="p-3 text-sm text-muted-foreground">{t("Caricamento mezzi…")}</p>}
    {errore && <p role="alert" className="p-3 text-sm">{t("Mezzi temporaneamente indisponibili.")} <button className="underline" onClick={onRiprova}>{t("Riprova")}</button></p>}
    {nonDisponibile && <p role="status" className="p-3 text-sm text-muted-foreground">
      {t("{cosa} temporaneamente indisponibili.", { cosa: nonDisponibile })} <button type="button" className="underline" onClick={onRiprova}>{t("Riprova")}</button>
    </p>}
    {!caricamento && !errore && !nonDisponibile && !mezzi.length && <p className="p-3 text-sm text-muted-foreground">{t("Nessun mezzo per il giorno e i filtri selezionati.")}</p>}
    {mezzi.map(m => {
      const attivo = selezione === m.id;
      const etichettaTipo = TIPI_MEZZO.find(x => x.value === m.tipo)?.label;
      const tipo = etichettaTipo ? t(etichettaTipo) : m.tipo;
      const Icona = m.attrezzatura ? Wrench : m.stradale ? Truck : Construction;
      const misure = m.stradale ? [
        m.metri_registrati != null ? t("{km} registrati", { km: formatoKm(m.metri_registrati) }) : null,
        m.metri_stimati != null ? t("{km} stimati", { km: formatoKm(m.metri_stimati) }) : null,
      ].filter(Boolean) : [];
      return <article key={m.id} className={attivo ? "bg-primary/5" : undefined}>
        <button type="button" ref={el => registraRiga(m.id, el)} aria-expanded={attivo}
          className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/60"
          onClick={() => onSeleziona(attivo ? null : m.id)}>
          <Icona aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold">{m.nome}</span>
            <span className="block text-xs text-muted-foreground">{[tipo, m.targa].filter(Boolean).join(" · ")}</span>
            <span className="block text-xs">{m.attrezzatura ? [m.attrezzatura.quantita != null ? [m.attrezzatura.quantita.toLocaleString("it-IT"), m.unita].filter(Boolean).join(" ") : null,
              m.attrezzatura.custode ? t("In carico a {nome}", { nome: m.attrezzatura.custode }) : null].filter(Boolean).join(" · ") : m.stradale ? misure.join(" · ") || t("Km da registrare") :
              m.contaore != null ? t("{ore} h · lettura contaore", { ore: m.contaore.toLocaleString("it-IT") }) : m.unita === "ore" ? t("Lettura contaore da registrare") : t("Assegnazione operativa")}</span>
            <span className="block break-words text-xs text-muted-foreground">{m.posizione ? [m.posizione.nome, m.attrezzatura && m.posizione.quando ? dataOra(m.posizione.quando) : null].filter(Boolean).join(" · ")
              : m.attrezzatura?.quantita != null ? t("Quantità senza ubicazione registrata") : t("Posizione da documentare")}</span>
            {m.destinazione && m.destinazione.order_id !== m.posizione?.order_id &&
              <span className="block break-words text-xs text-primary">{t("Destinazione prevista")} · {m.destinazione.nome}</span>}
            {m.destinazioni > 1 && <span className="block text-xs text-amber-800 dark:text-amber-300">{t("{n} destinazioni previste · da verificare", { n: m.destinazioni })}</span>}
          </span>
        </button>
        {attivo && <div className="space-y-2 px-3 pb-3 text-xs">
          {m.posizione && <Luogo titolo={m.attrezzatura ? t("Ultima ubicazione registrata") : t("Posizione di riferimento")} luogo={m.posizione} />}
          {m.posizioneVeicolo && <Luogo titolo={t("Posizione di riferimento del mezzo")} luogo={m.posizioneVeicolo} />}
          {m.destinazione && <Luogo titolo={t("Destinazione prevista")} luogo={m.destinazione} />}
          {!coordinate(m.posizione?.lat, m.posizione?.lng) && m.posizione && <p className="text-muted-foreground">{t("Coordinate della posizione da verificare.")}</p>}
          {m.fonti_registrate.length > 0 && <p className="text-muted-foreground">{m.fonti_registrate.join(" · ")}</p>}
          {m.contaore_aggiornato && <p className="text-muted-foreground">{t("Lettura del {data}", { data: dataOra(m.contaore_aggiornato) })}</p>}
          {m.metri_stimati != null && <p className="text-muted-foreground">{t("Stime salvate nel registro viaggi.")}</p>}
          <div className="flex flex-wrap gap-1">
            <Button asChild size="sm" variant="outline">
              <Link to={`/azienda/mezzi/${m.attrezzatura?.scheda_id ?? m.id}${m.stradale ? `?tab=viaggi&giorno=${giorno}` : ""}`}>{m.attrezzatura ? t("Apri scheda attrezzatura") : t("Apri scheda mezzo")}</Link>
            </Button>
            {m.stradale && <Button asChild size="sm" variant="outline">
              <Link to={`/azienda/mezzi/${m.id}?tab=viaggi&vista=mappa&giorno=${giorno}`}>{t("Storico su mappa")}</Link>
            </Button>}
            {m.stradale && haPercorso(m.id) && <Button type="button" size="sm" variant="outline" onClick={() => onPercorso(m.id)}>
              <Route className="size-3.5" /> {t("Percorso del mezzo")}
            </Button>}
          </div>
        </div>}
      </article>;
    })}
  </section>;
}
