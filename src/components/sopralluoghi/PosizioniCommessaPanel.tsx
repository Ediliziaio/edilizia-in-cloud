import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Ruler, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applicaMisure, posizioniDellaCommessa, type PosizioneCommessa, type VoceMisure } from "@/lib/api/surveys";
import {
  differenzeMisure, misureDaCampi, misureInTesto, NOME_ASSE, schedaDellaPosizione,
  valoreNelCampo, type SchedaPosizione, type TipoMisura,
} from "@/lib/surveys/misureRilievo";
import type { TemplateSchema } from "@/types/surveys";

/**
 * L'elenco delle posizioni della commessa, dentro il sopralluogo: riferimento e misura
 * provvisoria già pronti, il tecnico scrive solo le definitive.
 *
 * Quello che scrive resta sul telefono finché non è salvato: sul cantiere la rete va e viene.
 * Il tecnico non vede cifre: l'elenco arriva da una funzione che non le restituisce.
 */

interface Bozza {
  valori: Record<string, string>;
  tipo?: TipoMisura;
  scelta?: "tieni_nuovo" | "tieni_precedente";
}
type Bozze = Record<string, Bozza>;

const chiaveBozza = (surveyId: string) => `rilievo-posizioni:${surveyId}`;

function leggiBozze(surveyId: string): Bozze {
  try {
    return JSON.parse(localStorage.getItem(chiaveBozza(surveyId)) ?? "{}") as Bozze;
  } catch {
    return {};
  }
}

function scriviBozze(surveyId: string, bozze: Bozze) {
  try {
    if (Object.keys(bozze).length === 0) localStorage.removeItem(chiaveBozza(surveyId));
    else localStorage.setItem(chiaveBozza(surveyId), JSON.stringify(bozze));
  } catch {
    // Memoria piena o navigazione privata: resta quello che c'è sullo schermo.
  }
}

const STATO: Record<string, { testo: string; classe: string }> = {
  da_rilevare: { testo: "Da rilevare", classe: "border-amber-300 bg-amber-50 text-amber-800" },
  rilevato: { testo: "Rilevata", classe: "border-blue-300 bg-blue-50 text-blue-800" },
  confermato: { testo: "Confermata", classe: "border-emerald-300 bg-emerald-50 text-emerald-800" },
};

interface Props {
  surveyId: string;
  schema: TemplateSchema | null | undefined;
  canEdit: boolean;
}

export function PosizioniCommessaPanel({ surveyId, schema, canEdit }: Props) {
  const qc = useQueryClient();
  const chiave = ["sopralluogo-posizioni", surveyId];
  const { data, isLoading, isError } = useQuery({
    queryKey: chiave,
    queryFn: () => posizioniDellaCommessa(surveyId),
    staleTime: 15_000,
  });
  const [bozze, setBozze] = useState<Bozze>(() => leggiBozze(surveyId));
  useEffect(() => scriviBozze(surveyId, bozze), [surveyId, bozze]);

  const righe = useMemo(
    () => (data?.righe ?? []).map((riga) => ({ riga, scheda: schedaDellaPosizione(riga, schema) })),
    [data?.righe, schema],
  );

  const cambia = (id: string, modifica: Partial<Bozza>) =>
    setBozze((b) => ({ ...b, [id]: { valori: {}, ...b[id], ...modifica } }));

  const daSalvare = righe.flatMap(({ riga, scheda }) => {
    const bozza = bozze[riga.id];
    if (!bozza) return [];
    const misure = misureDaCampi(scheda.campi, bozza.valori);
    return misure ? [{ riga, scheda, bozza, misure }] : [];
  });
  const senzaScelta = daSalvare.some(({ riga, bozza }) => altroSopralluogo(riga, surveyId) && !bozza.scelta);

  // isPending arriva dopo il render: il secondo clic di un doppio clic non lo vedrebbe.
  const inCorso = useRef(false);
  const salva = useMutation({
    mutationFn: () =>
      applicaMisure(surveyId, daSalvare.map(({ riga, scheda, bozza, misure }): VoceMisure => ({
        order_item_id: riga.id,
        componente: scheda.componente,
        misure,
        misura_tipo: bozza.tipo ?? scheda.misuraTipo,
        misura_forma: scheda.forma,
        unita: scheda.forma === "LxH" || scheda.forma === "LxPxH" ? null : scheda.forma,
        scelta: bozza.scelta,
        elemento: {
          element_type: scheda.elementType,
          element_label: riga.riferimento || riga.name,
          quantity: Math.max(Math.round(Number(riga.quantity) || 1), 1),
          values: Object.fromEntries(scheda.campi.map((c) => [c.chiave, Number(bozza.valori[c.asse].replace(",", "."))])),
        },
      }))),
    onSuccess: (esito) => {
      setBozze((b) => {
        const resto = { ...b };
        for (const { riga } of daSalvare) delete resto[riga.id];
        return resto;
      });
      qc.invalidateQueries({ queryKey: chiave });
      qc.invalidateQueries({ queryKey: ["sopralluogo", surveyId] });
      qc.invalidateQueries({ queryKey: ["order-measure-items"] });
      toast.success(`Misure salvate: ${esito.applicate + esito.tenute}`);
      if (esito.con_ordine.length > 0) toast.warning("Alcune posizioni sono già in un ordine: avvisa l'ufficio.");
    },
    onError: (e) => toast.error((e as Error).message || "Misure non salvate: riprova, restano qui"),
    onSettled: () => { inCorso.current = false; },
  });
  const salvaUnaVolta = () => {
    if (inCorso.current) return;
    inCorso.current = true;
    salva.mutate();
  };

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carico le posizioni della commessa…
      </p>
    );
  }
  if (isError) return <p role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">Posizioni della commessa non disponibili.</p>;
  if (righe.length === 0) return null;

  const rilevate = righe.filter(({ riga }) => riga.measure_status !== "da_rilevare").length;
  const gioco = Number(data?.gioco_posa_mm ?? 0);

  return (
    <section aria-label="Posizioni della commessa" className="space-y-3 rounded-xl border bg-white p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Ruler className="h-4 w-4 text-orange-500" aria-hidden="true" />
          Posizioni della commessa
          <span className="text-xs font-normal text-slate-500">{rilevate} di {righe.length} rilevate</span>
        </h3>
        {data?.ruolo_misure && (
          <Badge variant="outline" className="text-[10px]">
            {data.ruolo_misure === "definitivo" ? "Misure definitive" : "Misure preliminari"}
          </Badge>
        )}
      </header>
      {gioco > 0 && (
        <p className="text-xs text-slate-500">Scrivi la misura reale: dal foro l'ufficio toglie {gioco} mm di gioco di posa.</p>
      )}

      <ul className="space-y-2">
        {righe.map(({ riga, scheda }) => (
          <Posizione
            key={riga.id}
            riga={riga}
            scheda={scheda}
            surveyId={surveyId}
            bozza={bozze[riga.id]}
            canEdit={canEdit}
            onChange={(modifica) => cambia(riga.id, modifica)}
          />
        ))}
      </ul>

      {canEdit && (
        <div className="sticky bottom-0 -mx-3 flex items-center justify-between gap-2 border-t bg-white/95 px-3 py-2 sm:-mx-4 sm:px-4">
          <span className="text-xs text-slate-500">
            {senzaScelta ? "Scegli quali misure tenere" : daSalvare.length ? `${daSalvare.length} da salvare` : "Scrivi le misure definitive"}
          </span>
          <Button className="min-h-11" disabled={daSalvare.length === 0 || senzaScelta || salva.isPending} onClick={salvaUnaVolta}>
            {salva.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Salva misure
          </Button>
        </div>
      )}
    </section>
  );
}

function altroSopralluogo(riga: PosizioneCommessa, surveyId: string) {
  return !!riga.survey_id && riga.survey_id !== surveyId && !!riga.misure_rilevate;
}

function Posizione({
  riga, scheda, surveyId, bozza, canEdit, onChange,
}: {
  riga: PosizioneCommessa;
  scheda: SchedaPosizione;
  surveyId: string;
  bozza: Bozza | undefined;
  canEdit: boolean;
  onChange: (m: Partial<Bozza>) => void;
}) {
  const altro = altroSopralluogo(riga, surveyId);
  // Le misure di questo stesso sopralluogo si ritrovano; quelle di un altro vanno riscritte.
  const salvate = altro ? null : riga.misure_rilevate;
  const valori = bozza?.valori ?? {};
  const unita = riga.unita_misura ?? (scheda.forma === "LxH" || scheda.forma === "LxPxH" ? null : scheda.forma);
  const stato = STATO[riga.measure_status ?? "da_rilevare"] ?? STATO.da_rilevare;
  const misure = altro && bozza ? misureDaCampi(scheda.campi, valori) : null;
  const differenze = misure ? differenzeMisure(riga.misure_rilevate, misure).filter((d) => d.delta) : [];
  const lati = scheda.forma === "LxH" || scheda.forma === "LxPxH";

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{riga.riferimento || riga.name}</p>
          {riga.riferimento && <p className="truncate text-xs text-slate-500">{riga.name}</p>}
        </div>
        <Badge variant="outline" className={`text-[10px] ${stato.classe}`}>{stato.testo}</Badge>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Provvisoria: <span className="tabular-nums">{misureInTesto(riga.misure_preventivo, unita)}</span>
        {altro && <> · Altro sopralluogo: <span className="tabular-nums">{misureInTesto(riga.misure_rilevate, unita)}</span></>}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {scheda.campi.map((c) => {
          const id = `pos-${riga.id}-${c.asse}`;
          return (
            <div key={c.asse} className="min-w-0">
              <Label htmlFor={id} className="text-xs">{c.etichetta} ({c.unita})</Label>
              <Input
                id={id}
                inputMode="decimal"
                className="mt-1 h-11 tabular-nums"
                disabled={!canEdit}
                placeholder={valoreNelCampo(riga.misure_preventivo, c)}
                value={valori[c.asse] ?? valoreNelCampo(salvate, c)}
                onChange={(e) => onChange({
                  valori: {
                    ...Object.fromEntries(scheda.campi.map((x) => [x.asse, valori[x.asse] ?? valoreNelCampo(salvate, x)])),
                    [c.asse]: e.target.value,
                  },
                })}
              />
            </div>
          );
        })}
        {lati && (
          <div className="min-w-0">
            <Label htmlFor={`pos-${riga.id}-tipo`} className="text-xs">È la misura del</Label>
            <select
              id={`pos-${riga.id}-tipo`}
              className="mt-1 h-11 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-60"
              disabled={!canEdit}
              value={bozza?.tipo ?? scheda.misuraTipo}
              onChange={(e) => onChange({ tipo: e.target.value as TipoMisura })}
            >
              <option value="foro">Foro</option>
              <option value="telaio">Telaio</option>
              <option value="finita">Prodotto finito</option>
            </select>
          </div>
        )}
      </div>

      {altro && misure && (
        <fieldset className="mt-2 rounded-md bg-amber-50 p-2 text-xs">
          <legend className="font-medium text-amber-900">
            {differenze.length
              ? differenze.map((d) => `${NOME_ASSE[d.asse]} ${d.delta! > 0 ? "+" : ""}${d.delta}`).join(" · ")
              : "Uguali all'altro sopralluogo"}
          </legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {([["tieni_nuovo", "Tieni le nuove"], ["tieni_precedente", "Tieni le precedenti"]] as const).map(([v, t]) => (
              <label key={v} className="flex min-h-9 items-center gap-1.5">
                <input type="radio" name={`scelta-${riga.id}`} checked={bozza?.scelta === v} onChange={() => onChange({ scelta: v })} />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </li>
  );
}
