import { useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { ArrowUpRight, Calculator, CalendarDays, MapPin, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRiferimentiCostiPreventivo } from "@/hooks/useRiferimentiCostiPreventivo";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { useSediList } from "@/hooks/useSediAnalytics";
import { useCalendarioCantiere } from "@/hooks/useCalendarioCantiere";
import { euroAnalisi, numeroCosto, soldi, type PianoTempi, type PianoTrasferta, type RisorsaCosto, type StimaTempiSalvata, type VoceAnalisi } from "@/lib/preventivi/analisiCosti";
import {
  confrontaStorico, modalitaEsecuzione, stimaLavorazione, stimaTrasferta, unitaVerificata, verificaStimeDaiConsuntivi, type ModalitaEsecuzione,
} from "@/lib/preventivi/stimaCostiStorici";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { calendarioCantiere } from "@/lib/orders/sottofasi";
import { riferimentiTempi, stessaPrevisione, stimaTempistiche, tempisticheDaSalvare } from "@/lib/preventivi/stimaTempistiche";

import StimaTempistichePanel from "./StimaTempistichePanel";
import StimaRapidaPanel, { type ScenarioStima, type ValutazioneStima } from "./StimaRapidaPanel";

export type ContestoStima = { companyId: string; preventivoId?: string; tipoLavoro?: string; kmAndata?: number; indirizzo?: string; sedeId?: string | null };
export type VistaStima = "rapida" | "costi" | "tempi";
type Props = {
  voce: VoceAnalisi;
  contesto: ContestoStima;
  aggregati: { comuni: boolean; importo: number; piano?: PianoTrasferta };
  risorse: readonly RisorsaCosto[];
  tempistiche?: StimaTempiSalvata;
  scheda: VistaStima;
  onScheda: (scheda: VistaStima) => void;
  onSalvaTempi?: (stima: StimaTempiSalvata) => void;
  costiInBozza: boolean;
  busy: boolean;
  onProponi?: (righe: RisorsaCosto[] | null, piano: PianoTrasferta) => void;
  onRisorse: () => void;
  valuta: (righe: RisorsaCosto[], piano: PianoTrasferta, calcolaPrezzo?: boolean) => ValutazioneStima | null;
};

const campo = "grid min-w-0 content-start gap-1 text-xs font-medium text-slate-700";
const select = "h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground";
const formato = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 });
const euro = (cents: number) => euroAnalisi.format(soldi(cents));
const dataBreve = { format: (data: Date) => new Intl.DateTimeFormat(intlCampo(), { day: "numeric", month: "short", year: "numeric" }).format(data) };
const metodiTrasporto = { km: "Calcola dai chilometri", forfait: "Importo a corpo", comuni: "Già nei costi comuni", compresi: "Compresi nella fornitura / assenti" } as const;

function NumeroStima({ label, value, onChange, placeholder, riferimento }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; riferimento?: string;
}) {
  return <label className={campo}>{label}<Input className="h-8 text-xs" inputMode="decimal" maxLength={32}
    data-campo-stima={riferimento} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

export default function StimaCostiPanel({
  voce, contesto, aggregati, risorse, tempistiche, scheda, onScheda, onSalvaTempi, costiInBozza, busy, onProponi, onRisorse, valuta,
}: Props) {
  const t = useT();
  const storico = useRiferimentiCostiPreventivo(contesto.companyId, voce, contesto.preventivoId);
  const sedeOperativa = useCompanyBase();
  const { data: sedi } = useSediList();
  const sedeScelta = sedi?.find(s => s.id === contesto.sedeId);
  const [esecuzione, setEsecuzione] = useState<ModalitaEsecuzione | "">(tempistiche?.piano.esecuzione ?? "");
  const [pianoTempi, setPianoTempi] = useState<PianoTempi>(() => tempistiche?.piano ?? {
    esecuzione: "interna", partenza: format(new Date(), "yyyy-MM-dd"), operai: "2", oreGiorno: "8", oreInterne: "",
    minutiViaggio: "", attesaMateriali: "", attesaDitta: "", durataDitta: "", coordinamento: "sequenza", sabato: false, riserva: "",
  });
  const [simili, setSimili] = useState(false);
  const [costoOra, setCostoOra] = useState("");
  const [costoDitta, setCostoDitta] = useState("");
  const [percorso, setPercorso] = useState<{ attesa: boolean; messaggio?: string; minuti?: number }>({ attesa: false });
  const [piano, setPiano] = useState<PianoTrasferta>(() => aggregati.piano ?? {
    metodo: aggregati.comuni ? "comuni" : "km",
    distanza: contesto.kmAndata != null ? String(contesto.kmAndata) : "", viaggi: "", veicoli: "1",
    tariffaKm: "", consegne: "", minuti: "", persone: "", tariffaOra: "",
  });
  const [mostraScenari, setMostraScenari] = useState(false);
  const regioneStima = useRef<HTMLElement>(null);
  const destinazione = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!destinazione.current) return;
    const elemento = regioneStima.current?.querySelector<HTMLElement>(`[data-campo-stima="${destinazione.current}"]`);
    const dettaglio = elemento?.closest("details");
    if (dettaglio) dettaglio.open = true;
    elemento?.scrollIntoView({ block: "nearest" });
    elemento?.focus({ preventScroll: true });
    destinazione.current = undefined;
  }, [scheda]);

  const consuntivi = storico.isError ? [] : storico.data ?? [];
  const criteri = { tipoLavoro: contesto.tipoLavoro, simili };
  const campione = confrontaStorico(voce, consuntivi, { ...criteri, esecuzione: esecuzione || undefined });
  const verificaStorico = scheda === "costi" ? verificaStimeDaiConsuntivi(campione) : null;
  const modalita = campione[0]?.esecuzione ?? (esecuzione || "interna");
  const usaOperai = modalita === "interna" || modalita === "mista";
  const usaDitte = modalita === "subappalto" || modalita === "mista";
  const tariffaOra = usaOperai ? numeroCosto(costoOra) : null;
  const offertaDitta = usaDitte ? numeroCosto(costoDitta) : null;
  const oreIndicate = usaOperai ? numeroCosto(pianoTempi.oreInterne) : null;
  const oreManuali = oreIndicate !== null && oreIndicate > 0 && oreIndicate <= 9_999_999 ? oreIndicate : null;
  const tariffaValida = !usaOperai || !costoOra.trim() || tariffaOra !== null;
  const offertaValida = !usaDitte || !costoDitta.trim() || offertaDitta !== null;
  const pianoEffettivo = { ...pianoTempi, esecuzione: modalita };
  const { chiusure } = useCalendarioCantiere(Number(pianoTempi.partenza.slice(0, 4)) || undefined);
  const lavorativo = calendarioCantiere({ sabato: pianoTempi.sabato, chiusure });
  const fontiTempi = riferimentiTempi(campione, voce.quantita);
  const tempi = stimaTempistiche(pianoEffettivo, fontiTempi, lavorativo);
  const oreRisorse = risorse.reduce((totale, r) => {
    if (r.tipo !== "manodopera" || unitaVerificata(r.unita) !== "h" || r.base === "percentuale" || r.stima?.origine === "trasferta") return totale;
    return totale + (numeroCosto(r.quantita) ?? 0) * (numeroCosto(r.fattore || "1") ?? 0) * (r.base === "unitaria" ? voce.quantita ?? 0 : 1);
  }, 0);
  const stima = stimaLavorazione(campione, voce.quantita ?? 0, voce.unita, {
    costoOra: tariffaOra ?? undefined, offertaDitta: offertaDitta ?? undefined, oreTotali: oreManuali ?? undefined,
  });
  const oreStimaValide = !usaOperai || !pianoTempi.oreInterne.trim() || (oreManuali !== null && stima?.tariffaOraUsata != null);
  const tariffeValide = tariffaValida && offertaValida && oreStimaValide;
  const trasferta = stimaTrasferta(piano);
  const precisaCosto = !!stima?.risorse.length && !!trasferta && tariffeValide && !storico.isError && !percorso.attesa;
  const proiezione = scheda !== "tempi" && stima && precisaCosto ? valuta(stima.risorse, piano) : null;
  const daiCostiInseriti = scheda === "rapida" && !stima && (risorse.length > 0 || voce.costoUnitario !== null)
    ? valuta([...risorse], { ...piano, metodo: "comuni" }) : null;
  const cambia = (chiave: keyof PianoTrasferta) => (valore: string) => setPiano(p => ({ ...p, [chiave]: valore }));
  const mostraPercorso = !!contesto.indirizzo?.trim() && (contesto.sedeId ? !!sedeScelta : !!sedeOperativa);
  const stessoTempo = stessaPrevisione(tempistiche, voce, pianoEffettivo, tempi.previsione);
  const minutiDaPiano = percorso.minuti ?? numeroCosto(pianoTempi.minutiViaggio);
  const operaiDaPiano = numeroCosto(pianoTempi.operai);
  const tariffaDaPiano = stima?.tariffaOraUsata;
  const problemiCosto = stima ? [
    ...(!trasferta ? [{ campo: "trasferta", testo: t("Configura trasferta") }] : []),
    ...(!offertaValida ? [{ campo: "costoDitta", testo: t("Correggi l’offerta della ditta") }] : []),
    ...(!tariffaValida || (oreManuali && stima.tariffaOraUsata == null) ? [{ campo: "costoOra", testo: t("Verifica il costo orario") }] : []),
  ] : [];

  function apriCampo(prossima: "costi" | "tempi", campo?: string) {
    destinazione.current = campo;
    onScheda(prossima);
  }
  function applicaCosti() {
    if (!onProponi || !stima || !precisaCosto) return;
    const calcolataIl = new Date().toISOString();
    onProponi(stima.risorse.map(r => ({ ...r, id: crypto.randomUUID(), stima: { ...r.stima, calcolataIl } })), piano);
  }
  function salvaTempi() {
    if (!onSalvaTempi || !tempi.previsione || stessoTempo || busy) return;
    const stimaSalvabile = tempisticheDaSalvare(voce, pianoEffettivo, tempi.previsione);
    if (stimaSalvabile) onSalvaTempi(stimaSalvabile);
  }
  const puoConfrontare = scheda === "rapida" && (campione.length > 0 ||
    (esecuzione && confrontaStorico(voce, consuntivi, criteri).length > 0));
  const scenari: ScenarioStima[] = puoConfrontare && mostraScenari
    ? (["interna", "subappalto", "mista"] as const).map(modo => {
      const fonti = confrontaStorico(voce, consuntivi, { ...criteri, esecuzione: modo });
      const proposta = stimaLavorazione(fonti, voce.quantita ?? 0, voce.unita);
      const valutazione = proposta?.risorse.length && trasferta && !percorso.attesa ? valuta(proposta.risorse, piano, false) : null;
      const durata = fonti.length ? stimaTempistiche({ ...pianoEffettivo, esecuzione: modo, oreInterne: "", durataDitta: "" },
        riferimentiTempi(fonti, voce.quantita), lavorativo).previsione : null;
      return { modo, fonti: fonti.length, costo: valutazione?.costo ?? null, margine: valutazione?.margine ?? null, giorni: durata?.giorni ?? null };
    }) : [];

  async function calcolaPercorso() {
    if (!contesto.indirizzo) return;
    setPercorso({ attesa: true });
    try {
      const [{ forwardGeocode }, { getRoute }] = await Promise.all([import("@/lib/geocoding"), import("@/lib/routing")]);
      const partenza = !contesto.sedeId ? sedeOperativa
        : sedeScelta?.lat != null && sedeScelta.lng != null ? { lat: sedeScelta.lat, lng: sedeScelta.lng }
          : sedeScelta?.indirizzo ? await forwardGeocode([sedeScelta.indirizzo, sedeScelta.cap, sedeScelta.citta, sedeScelta.provincia].filter(Boolean).join(", ")) : null;
      const cantiere = partenza && await forwardGeocode(contesto.indirizzo);
      const tragitto = partenza && cantiere && await getRoute([partenza, cantiere]);
      if (!tragitto) {
        setPercorso({ attesa: false, messaggio: t("Percorso non trovato. Inserisci i chilometri dal tuo itinerario.") });
        return;
      }
      const minuti = Math.round(tragitto.durationSec / 60);
      cambia("distanza")(String(Math.round(tragitto.distanceMeters / 100) / 10));
      setPercorso({ attesa: false, minuti, messaggio: t("Percorso da {sede} · {minuti} min di andata", { sede: sedeScelta?.nome ?? t("sede operativa"), minuti }) });
    } catch {
      setPercorso({ attesa: false, messaggio: t("Servizio percorsi non disponibile. Puoi inserire la distanza a mano.") });
    }
  }

  const usaTrasferta = piano.metodo === "km" || piano.metodo === "forfait";
  const modificaSoloTrasferta = usaTrasferta || (piano.metodo === "compresi" && !!aggregati.piano);
  const nomeCosto = stima && campione.length === 1 ? t("Da 1 commessa") : t("Costo lavorazione");

  const controlloEsecuzione = <label className={campo}>{t("Chi eseguirà il lavoro")}
    <select className={scheda !== "costi" ? "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm text-foreground" : select} value={esecuzione} disabled={busy}
      onChange={e => setEsecuzione(e.target.value as ModalitaEsecuzione | "")}>
      <option value="">{scheda === "rapida" ? t("Automatico") : campione[0] && !esecuzione
        ? t("Dallo storico · {modalita}", { modalita: t(modalitaEsecuzione[campione[0].esecuzione]) }) : t("Automatico dallo storico")}</option>
      {Object.entries(modalitaEsecuzione).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
    </select>
  </label>;
  const statoStorico = storico.isPending ? <p role="status" className="text-xs text-slate-600">{t("Cerco i consuntivi della tua azienda…")}</p>
    : storico.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-xs">
      <span>{t("Storico delle commesse non disponibile.")}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => void storico.refetch()}>{t("Riprova")}</Button>
    </div> : null;
  const criteriStorico = <label className="flex items-start gap-2 text-xs text-slate-700">
    <input type="checkbox" className="mt-px" checked={simili} disabled={busy} onChange={e => setSimili(e.target.checked)} />
    {t("Includi descrizioni simili da verificare")}
  </label>;

  return <section ref={regioneStima} className="flex h-full min-h-0 flex-col text-sm" aria-label={t("Stima da commesse simili")}>
    <div className="shrink-0 border-b bg-white px-3 py-2 sm:px-4">
      <div className="grid grid-cols-[1fr_1.35fr_1fr] gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label={t("Tipo di previsione")}>
        <Button type="button" size="sm" className="h-8 gap-1 px-1.5 text-xs sm:text-sm" variant={scheda === "rapida" ? "secondary" : "ghost"}
          aria-pressed={scheda === "rapida"} onClick={() => onScheda("rapida")}><Sparkles aria-hidden="true" />{t("Riepilogo")}</Button>
        <Button type="button" size="sm" className="h-8 gap-1 px-1.5 text-xs sm:text-sm" variant={scheda === "costi" ? "secondary" : "ghost"}
          aria-pressed={scheda === "costi"} onClick={() => onScheda("costi")}><Calculator aria-hidden="true" />{t("Costi e trasporti")}</Button>
        <Button type="button" size="sm" className="h-8 gap-1 px-1.5 text-xs sm:text-sm" variant={scheda === "tempi" ? "secondary" : "ghost"}
          aria-pressed={scheda === "tempi"} onClick={() => onScheda("tempi")}><CalendarDays aria-hidden="true" />{t("Tempistiche")}</Button>
      </div>
    </div>
    {scheda === "rapida" ? <StimaRapidaPanel piano={pianoEffettivo} impostaPartenza={partenza => setPianoTempi(p => ({ ...p, partenza }))}
      esecuzione={controlloEsecuzione} statoStorico={statoStorico} stima={stima} fonti={campione.length}
      proiezione={proiezione ?? daiCostiInseriti} daiCostiInseriti={!!daiCostiInseriti} tempi={tempi}
      problemiCosto={problemiCosto} busy={busy} modifica={apriCampo} rivediRisorse={onRisorse}
      rivediStima={stima ? () => apriCampo("costi", "dettaglioCosti") : undefined}
      salvaTempi={onSalvaTempi && voce.quantita && voce.quantita > 0 ? salvaTempi : undefined}
      tempiSalvati={stessoTempo} mostraScenari={mostraScenari} confronta={puoConfrontare ? () => setMostraScenari(!mostraScenari) : undefined} scenari={scenari}
    /> : scheda === "tempi" ? <StimaTempistichePanel voce={voce} piano={pianoEffettivo} storico={fontiTempi} tempi={tempi}
      cambia={patch => setPianoTempi(p => ({ ...p, ...patch }))} campione={campione} salvata={tempistiche} busy={busy}
      oreDaRisorse={oreRisorse > 0 ? String(Number(oreRisorse.toFixed(4))) : undefined}
      minutiPercorso={piano.minuti || (percorso.minuti !== undefined ? String(percorso.minuti) : undefined)}
      controlloEsecuzione={controlloEsecuzione} statoStorico={statoStorico} criteriStorico={criteriStorico}
      costiInBozza={costiInBozza} onSalva={onSalvaTempi} onRipristina={tempistiche ? () => {
        setPianoTempi(tempistiche.piano);
        setEsecuzione(tempistiche.piano.esecuzione);
      } : undefined} /> : <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
      {controlloEsecuzione}
      {statoStorico}
      {storico.isSuccess && !stima && <p className="rounded-md border bg-slate-50 p-2.5 text-xs text-slate-700">
        {t("Nessuna commessa confrontabile per questa voce e modalità. Puoi usare il listino o compilare le risorse e calcolare qui la trasferta.")}
      </p>}
      {criteriStorico}
      {stima && <>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-[#193653] p-3 text-white">
          <div><div className="text-xs text-blue-100">{nomeCosto}</div><strong className="text-lg tabular-nums">{euro(stima.costo)}</strong></div>
          <div><div className="text-xs text-blue-100">{t("Ore operai previste")}</div><strong className="text-lg tabular-nums">{stima.ore === null ? t("Da verificare") : `${formato(stima.ore)} h`}</strong></div>
          <div className="text-xs text-blue-100">{t("Venduto storico")} <strong className="block text-sm text-white">
            {stima.vendutoStorico === null ? "—" : euroAnalisi.format(stima.vendutoStorico)}</strong></div>
          {campione.length > 1 && <div className="text-xs text-blue-100">{t("Fascia dai riferimenti")} <strong className="block text-sm text-white">{euro(stima.minimo)} – {euro(stima.massimo)}</strong></div>}
        </div>
        <ul className="divide-y rounded-md border" tabIndex={-1} data-campo-stima="dettaglioCosti" aria-label={t("Composizione della stima")}>
          {stima.risorse.map(r => <li key={r.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs">
            <span>{r.nome}</span><span className="shrink-0 font-medium">{euroAnalisi.format(Number(r.prezzo) * Number(r.quantita) * (r.base === "unitaria" ? voce.quantita ?? 0 : 1))}</span>
          </li>)}
        </ul>
        {(usaOperai || usaDitte) && <div className="grid grid-cols-2 gap-2">
          {usaOperai && <NumeroStima label={t("Costo orario interno (€)")} riferimento="costoOra" value={costoOra} onChange={setCostoOra}
            placeholder={stima.prezzoOraStorico === null ? undefined : t("{importo} dallo storico", { importo: formato(stima.prezzoOraStorico) })} />}
          {usaDitte && <NumeroStima label={t("Offerta ditta a corpo (€)")} riferimento="costoDitta" value={costoDitta} onChange={setCostoDitta} placeholder={t("Costo da storico")} />}
        </div>}
        {oreManuali !== null && oreManuali > 0 && stima.tariffaOraUsata !== null && <p className="text-xs text-slate-600">{t("Manodopera calcolata sulle {ore} h del piano.", { ore: formato(oreManuali) })}</p>}
        {(!tariffaValida || !offertaValida) && <p role="status" className="text-xs text-amber-800">{t("Inserisci importi validi per usare le tariffe attuali.")}</p>}
        {!oreStimaValide && <p role="status" className="text-xs text-amber-800">{t("Per calcolare il costo della squadra servono ore valide nel piano e un costo orario.")}</p>}
        <details className="rounded-md border px-2.5 py-2 text-xs">
          <summary data-campo-stima="fonti" className="cursor-pointer font-semibold">{t(campione.length === 1 ? "Fonti · {n} commessa · {modalita}" : "Fonti · {n} commesse · {modalita}", { n: campione.length, modalita: t(modalitaEsecuzione[modalita]) })}</summary>
          <p className="mt-2 text-slate-600">{t("Costi registrati e quantità eseguite. La fascia riguarda la lavorazione. I trasporti del nuovo cantiere si calcolano qui sotto.")}</p>
          {verificaStorico && <div className="mt-2 rounded-md bg-slate-50 p-2 text-slate-700">
            <p className="font-semibold">{t("Quanto erano vicine le stime ai consuntivi")}</p>
            {verificaStorico.costo !== null || verificaStorico.ore !== null ? <>
              {verificaStorico.costo !== null && <p>{t("Costi · scostamento tipico {percentuale}% su {n} casi", { percentuale: formato(verificaStorico.costo * 100), n: verificaStorico.casiCosto })}</p>}
              {verificaStorico.ore !== null && <p>{t("Ore · scostamento tipico {percentuale}% su {n} casi", { percentuale: formato(verificaStorico.ore * 100), n: verificaStorico.casiOre })}</p>}
              <p className="mt-1 text-muted-foreground">{t("Ogni caso è stato ricalcolato usando solo lavori conclusi in precedenza.")}</p>
            </> : <p>{t("Servono altri lavori simili già conclusi per misurare lo scostamento.")}</p>}
          </div>}
          <ul className="mt-2 divide-y border-t">
            {campione.map(r => <li key={r.id} className="space-y-0.5 py-2">
              <Link to={`/azienda/ordini/${r.commessaId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
                {r.numero || t("Apri commessa")} <ArrowUpRight className="h-3 w-3" />
              </Link>
              <p>{r.descrizione}</p>
              <p className="text-slate-600">{r.motivo} · {dataBreve.format(new Date(r.completataIl))} · {formato(r.quantita)} {r.unita}
                {r.kmAndata !== null && ` · ${t("{km} km dalla sede", { km: formato(r.kmAndata) })}`}
                {r.costi.trasporti > 0 && ` · ${t("{importo} di trasporti", { importo: euroAnalisi.format(r.costi.trasporti) })}`}</p>
            </li>)}
          </ul>
        </details>
      </>}
      <div className="space-y-3 rounded-lg border bg-slate-50 p-3">
        <h4 className="flex items-center gap-2 font-semibold"><Truck className="h-4 w-4 text-blue-700" />{t("Trasferta e trasporti")}</h4>
        <label className={campo}>{t("Come li vuoi conteggiare?")}
          <select className={select} data-campo-stima="trasferta" value={piano.metodo} onChange={e => cambia("metodo")(e.target.value)}>
            {Object.entries(metodiTrasporto).map(([key, value]) => <option key={key} value={key} disabled={key === "comuni" && !aggregati.comuni}>{t(value)}</option>)}
          </select>
        </label>
        {piano.metodo === "km" && <>
          <div className="grid grid-cols-2 gap-2">
            <NumeroStima label={t("Km di andata")} value={piano.distanza} onChange={cambia("distanza")} />
            <NumeroStima label={t("Viaggi A/R")} value={piano.viaggi} onChange={cambia("viaggi")} />
            <NumeroStima label={t("Mezzi per viaggio")} value={piano.veicoli} onChange={cambia("veicoli")} />
            <NumeroStima label={t("Costo per km (€)")} value={piano.tariffaKm} onChange={cambia("tariffaKm")} />
          </div>
          {tempi.giorniInterni != null && tempi.giorniInterni > 0 && !piano.viaggi && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
            onClick={() => cambia("viaggi")(String(tempi.giorniInterni))}>{t("Un viaggio A/R per giorno di squadra ({n})", { n: tempi.giorniInterni })}</Button>}
          {(mostraPercorso || stima?.tariffaKmStorica != null) && <div className="flex flex-wrap gap-1.5">
            {mostraPercorso && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={percorso.attesa}
              onClick={() => void calcolaPercorso()}><MapPin className="mr-1 h-3 w-3" />{percorso.attesa ? t("Calcolo…") : t("Calcola da indirizzo")}</Button>}
            {stima?.tariffaKmStorica != null && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs"
              onClick={() => cambia("tariffaKm")(String(Number(stima.tariffaKmStorica!.toFixed(4))))}>
              {t("Usa {importo}/km dai rimborsi", { importo: euroAnalisi.format(stima.tariffaKmStorica) })}
            </Button>}
          </div>}
          {percorso.messaggio && <p role="status" className="text-xs text-slate-600">{percorso.messaggio}</p>}
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">{t("Aggiungi il tempo di viaggio degli operai")}</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NumeroStima label={t("Minuti di andata")} value={piano.minuti} onChange={cambia("minuti")} />
              <NumeroStima label={t("Operai per viaggio")} value={piano.persone} onChange={cambia("persone")} />
              <NumeroStima label={t("Costo orario viaggio (€)")} value={piano.tariffaOra} onChange={cambia("tariffaOra")} />
              {percorso.minuti !== undefined && <Button type="button" size="sm" variant="ghost" className="self-end text-xs" onClick={() => cambia("minuti")(String(percorso.minuti))}>{t("Usa {minuti} min", { minuti: percorso.minuti })}</Button>}
              {tariffaDaPiano != null && operaiDaPiano && Number.isInteger(operaiDaPiano) && minutiDaPiano && minutiDaPiano > 0 &&
                <Button type="button" size="sm" variant="ghost" className="self-end text-xs" onClick={() => setPiano(p => ({
                  ...p, persone: String(operaiDaPiano), minuti: String(minutiDaPiano), tariffaOra: String(Number(tariffaDaPiano.toFixed(4))),
                }))}>{t("Usa squadra e viaggio del piano")}</Button>}
            </div>
          </details>
        </>}
        {usaTrasferta && <NumeroStima label={piano.metodo === "km" ? t("Consegne e altri trasporti (€) · facoltativo") : t("Trasporti a corpo (€)")}
          value={piano.consegne} onChange={cambia("consegne")} />}
        {piano.metodo === "comuni" && <p className="text-xs text-slate-600">{t("Mantieni i trasporti già inseriti. La relativa quota confluisce nel costo completo e nella simulazione del prezzo.")}</p>}
        {usaTrasferta && <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs"><span>{t("Trasferta e consegne proposte")}</span><strong>{trasferta ? euro(trasferta.costo) : t("Da completare")}</strong></div>}
        {usaTrasferta && aggregati.comuni && aggregati.importo > 0 && <p className="text-xs text-amber-800">{t("Restano {importo} di trasporti già inseriti a mano. Usa i costi comuni esistenti se coprono questi stessi viaggi.", { importo: euro(aggregati.importo) })}</p>}
      </div>
      {proiezione && <dl className="grid grid-cols-2 gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-slate-700">
        <div><dt>{t("Costo simulato con le quote comuni")}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{euro(proiezione.costo)}</dd></div>
        <div><dt>{t("Margine al prezzo attuale")}</dt><dd className={`mt-0.5 text-sm font-semibold tabular-nums ${(proiezione.margine ?? 0) < 0 ? "text-red-700" : ""}`}>{proiezione.margine === null ? "—" : euro(proiezione.margine)}</dd></div>
        {proiezione.venditaSuggerita !== null && <div className="col-span-2">
          <dt>{t("Vendita netta per {obiettivo}", { obiettivo: proiezione.obiettivo })}</dt><dd className="mt-0.5 text-sm font-semibold tabular-nums">{euroAnalisi.format(proiezione.venditaSuggerita)}</dd>
        </div>}
      </dl>}
      {onProponi && <>
        {stima && risorse.length > 0 && <p className="text-xs text-slate-600">{t("Usando la proposta sostituisci le {n} risorse di questa voce. Le altre voci e i costi comuni manuali restano in analisi.", { n: risorse.length })}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {modificaSoloTrasferta && <Button type="button" variant={stima ? "outline" : "default"} size="sm"
            disabled={busy || !trasferta || percorso.attesa} onClick={() => onProponi(null, piano)}>{t("Usa solo trasporti")}</Button>}
          {stima && <Button type="button" size="sm" disabled={busy || !precisaCosto}
            onClick={applicaCosti}>{risorse.length ? t("Sostituisci risorse con la stima") : t("Usa stima nelle risorse")}</Button>}
        </div>
      </>}
    </div>}
  </section>;
}
