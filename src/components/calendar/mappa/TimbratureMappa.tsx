import type { AppDatabase } from "@/integrations/supabase/appDatabase";
import { partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";
import { dettagliTimbratura, type VoceMappa } from "./dati";

type EventoGps = AppDatabase["public"]["Functions"]["mappa_timbrature_gps"]["Returns"][number];

const esiti: Record<string, string> = {
  dentro: "Dentro il raggio",
  fuori: "Fuori dal raggio",
  riferimento_senza_coordinate: "Sede senza coordinate",
  nessun_riferimento: "Luogo previsto assente",
  senza_gps: "Posizione non verificata",
};

interface Props {
  eventi: EventoGps[];
  cantieri: VoceMappa[];
  selezione: string | null;
  persone: Map<string, string>;
  persona: string;
  onPersona: (id: string) => void;
  caricamento: boolean;
  errore: boolean;
  limite: boolean;
  onRiprova: () => void;
  onSeleziona: (id: string) => void;
  registraRiga: (id: string, el: HTMLButtonElement | null) => void;
}

export function TimbratureMappa({
  eventi, cantieri, selezione, persone, persona, onPersona, caricamento, errore, limite, onRiprova, onSeleziona, registraRiga,
}: Props) {
  const titoli = new Map(cantieri.map(v => [v.id, v.titolo]));

  return <section aria-label="Posizioni delle timbrature">
    <div className="space-y-2 border-b px-3 py-2.5">
      <p className="text-xs text-muted-foreground">Posizioni rilevate al momento di entrate, uscite e pause.</p>
      {persone.size > 1 && <label className="grid w-fit max-w-full gap-1 text-xs font-medium">
        Persona
        <select aria-label="Persona" className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm font-normal" value={persona}
          onChange={e => onPersona(e.target.value)}>
          <option value="">Tutte le persone</option>
          {[...persone].sort(([, a], [, b]) => a.localeCompare(b, "it")).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
      </label>}
      {limite && <p className="text-xs text-muted-foreground">Mostrate le prime 500 timbrature con coordinate.</p>}
    </div>
    {caricamento && <p role="status" className="p-3 text-sm text-muted-foreground">Caricamento timbrature…</p>}
    {errore && <p role="alert" className="p-3 text-sm">Timbrature GPS temporaneamente indisponibili.{" "}
      <button type="button" className="underline" onClick={onRiprova}>Riprova</button>
    </p>}
    {!caricamento && !errore && !eventi.length && <p className="p-3 text-sm text-muted-foreground">Nessuna timbratura con coordinate per questa selezione.</p>}
    <ul className="divide-y">
      {eventi.map(t => {
        const { label, simbolo } = dettagliTimbratura(t.tipo);
        const riferimento = t.sede ?? (t.order_id ? titoli.get(t.order_id) ?? "Cantiere" : "Luogo previsto assente");
        const esito = esiti[t.esito ?? ""];
        return <li key={t.id}>
          <button type="button" ref={el => registraRiga(t.id, el)} aria-pressed={selezione === t.id} onClick={() => onSeleziona(t.id)}
            className="flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50 aria-pressed:bg-primary/5">
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-violet-100 text-xs font-semibold text-violet-900">{simbolo}</span>
            <span className="min-w-0 flex-1 space-y-0.5 break-words text-sm">
              <span className="block font-medium">{partiNelFuso(t.ora).ora} · {label} · {t.nome ?? "Operaio"}</span>
              <span className="block text-xs text-muted-foreground">{riferimento} · {t.fonte}
                {t.precisione != null && ` · GPS ±${Math.round(t.precisione)} m`}</span>
              {esito && esito !== riferimento && <span className={t.esito === "fuori"
                ? "block text-xs font-medium text-amber-800 dark:text-amber-300" : "block text-xs text-muted-foreground"}>{esito}</span>}
            </span>
          </button>
        </li>;
      })}
    </ul>
  </section>;
}
