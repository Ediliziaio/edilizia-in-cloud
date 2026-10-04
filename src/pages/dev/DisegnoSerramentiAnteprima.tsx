/**
 * Anteprima di sviluppo del disegno generato dei serramenti.
 *
 * Solo in sviluppo (rotta /dev/disegno-serramenti in App.tsx): si sceglie la
 * tipologia, si cambiano misure, aperture, vetro, telaio, monoblocco e colori e il
 * disegno si rifà da solo, senza login e senza database. I colori si scelgono dalle
 * etichette che il listino ha davvero («RAL 1000 Beige verdastro», «Legno Rovere
 * Dorato»); vetro e telaio dalle etichette delle scelte («Triplo vetro stratificato»,
 * «Telaio a Z 35»).
 */
import { useMemo, useState } from "react";
import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";
import {
  maniglieDiSerie,
  TIPOLOGIE_DISEGNO,
  type AntaDisegno,
  type FormaSerramento,
  type Lato,
  type SerramentoDisegno,
  type TipoAnta,
} from "@/lib/serramenti/disegnoSerramento";
import { FINITURE_MANIGLIA, finituraDaEtichetta, type FinituraManigliaId } from "@/lib/serramenti/finituraSerramento";
import { RAL_COLORI } from "@/lib/serramenti/ralColori";
import { telaioDaEtichetta } from "@/lib/serramenti/telaioSerramento";
import { anteDaApertura, apertureDellaTipologia } from "@/lib/serramenti/assiDisegno";
import { controllaMisure, type LimitiProdotto } from "@/lib/serramenti/limitiSerramento";
import { vetroDaEtichette } from "@/lib/serramenti/vetroSerramento";

const TIPI_ANTA: Array<[TipoAnta, string]> = [
  ["battente", "Battente"],
  ["anta_ribalta", "Anta-ribalta"],
  ["vasistas", "Vasistas"],
  ["scorrevole", "Scorrevole"],
  ["alzante_scorrevole", "Alzante scorrevole"],
  ["fisso", "Fisso"],
];

const COLORI_SPECIALI = [
  "Bianco RAL 9010", "Avorio", "Sabbia", "Ocra", "Grigio Medio", "Titanio", "Bronzo", "Salmone", "Celeste",
  "Verde Acqua", "Grigio Raffaello", "Verde Raffaello", "Rosso Raffaello", "Marrone Raffaello",
];
const LEGNI = [
  "Effetto legno", "Legno Chiaro", "Legno Olmo", "Legno Europa", "Legno Scuro", "Legno Rovere Dorato", "Legno Pino",
  "Noce K21", "Mogano", "Frassino K51", "Bianco Renolit",
];
const COLORI_RAL = Object.entries(RAL_COLORI).map(([codice, c]) => `RAL ${codice} ${c.nome}`);

/** Le scelte di vetro e di telaio come le scriverebbe il listino. */
const VETRI = ["Vetro Standard", "Vetro Satinato", "Vetro Fumé", "Vetro Serigrafato", "Vetro Antisonoro", "Vetro Antisfondamento"];
const VETROCAMERA = ["Doppio vetro stratificato", "Triplo vetro stratificato"];
const TELAI = ["Telaio a L", "Telaio a Z 28", "Telaio a Z 30", "Telaio a Z 35", "Telaio a Z 40", "Telaio a Z 60", "Telaio a Z 65"];

function SelezioneColore({ valore, onChange }: { valore: string; onChange: (v: string) => void }) {
  return (
    <select className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={valore} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Legni">{LEGNI.map((c) => <option key={c}>{c}</option>)}</optgroup>
      <optgroup label="Colori">{COLORI_SPECIALI.map((c) => <option key={c}>{c}</option>)}</optgroup>
      <optgroup label="RAL">{COLORI_RAL.map((c) => <option key={c}>{c}</option>)}</optgroup>
    </select>
  );
}

function Selezione({ valore, opzioni, onChange }: { valore: string; opzioni: string[]; onChange: (v: string) => void }) {
  return (
    <select className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={valore} onChange={(e) => onChange(e.target.value)}>
      {opzioni.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

export default function DisegnoSerramentiAnteprima() {
  const [tipologiaId, setTipologiaId] = useState(TIPOLOGIE_DISEGNO[1].id);
  const tipologia = TIPOLOGIE_DISEGNO.find((t) => t.id === tipologiaId) ?? TIPOLOGIE_DISEGNO[0];
  const [larghezza, setLarghezza] = useState(tipologia.larghezzaMm);
  const [altezza, setAltezza] = useState(tipologia.altezzaMm);
  const [ante, setAnte] = useState<AntaDisegno[]>(tipologia.ante);
  const [soglia, setSoglia] = useState(!!tipologia.soglia);
  const [forma, setForma] = useState<FormaSerramento>(tipologia.forma ?? "rettangolare");
  const [freccia, setFreccia] = useState(tipologia.frecciaMm ?? 0); // 0 = tutto sesto
  const [altezzaMinore, setAltezzaMinore] = useState(tipologia.altezzaMinoreMm ?? 800);
  const [latoMinore, setLatoMinore] = useState<Lato>(tipologia.latoMinore ?? "dx");
  const [sopraluce, setSopraluce] = useState(false);
  const [altezzaSopraluce, setAltezzaSopraluce] = useState(400);
  const [sopraluceApribile, setSopraluceApribile] = useState(false);
  const [conTraverso, setConTraverso] = useState(false);
  const [traversoDaBasso, setTraversoDaBasso] = useState(1000);
  const [conInglesine, setConInglesine] = useState(false);
  const [inglColonne, setInglColonne] = useState(2);
  const [inglRighe, setInglRighe] = useState(3);
  const [limAntaL, setLimAntaL] = useState("");
  const [limAntaH, setLimAntaH] = useState("");
  const [limAntaM2, setLimAntaM2] = useState("");

  const [monoblocco, setMonoblocco] = useState(!!tipologia.monoblocco);
  const [cassonetto, setCassonetto] = useState(tipologia.monoblocco?.cassonettoMm ?? 200);
  const [conTapparella, setConTapparella] = useState(true);
  const [motore, setMotore] = useState(false);
  const [abbassata, setAbbassata] = useState(0);
  const [zanzariera, setZanzariera] = useState(false);

  const [vetroEtichetta, setVetroEtichetta] = useState(VETRI[0]);
  const [vetrocameraEtichetta, setVetrocameraEtichetta] = useState(VETROCAMERA[0]);
  const [telaioEtichetta, setTelaioEtichetta] = useState(TELAI[0]);

  const [coloreInterno, setColoreInterno] = useState("Bianco RAL 9010");
  const [coloreEsterno, setColoreEsterno] = useState("RAL 7016 Grigio antracite");
  const [coloreCassonetto, setColoreCassonetto] = useState("come il serramento");
  const [coloreTapparella, setColoreTapparella] = useState("RAL 9006 Alluminio brillante");
  const [maniglia, setManiglia] = useState<FinituraManigliaId>("argento");

  function scegliTipologia(id: string) {
    const t = TIPOLOGIE_DISEGNO.find((x) => x.id === id);
    if (!t) return;
    setTipologiaId(id);
    setLarghezza(t.larghezzaMm);
    setAltezza(t.altezzaMm);
    setAnte(t.ante);
    setSoglia(!!t.soglia);
    setForma(t.forma ?? "rettangolare");
    setFreccia(t.frecciaMm ?? 0);
    setAltezzaMinore(t.altezzaMinoreMm ?? 800);
    setLatoMinore(t.latoMinore ?? "dx");
    setMonoblocco(!!t.monoblocco);
    setCassonetto(t.monoblocco?.cassonettoMm ?? 200);
    setMotore(!!(t.monoblocco && t.monoblocco.tapparella && t.monoblocco.tapparella.motore));
  }

  function cambiaAnta(i: number, patch: Partial<AntaDisegno>) {
    setAnte((cur) => cur.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  }

  const sagomato = forma !== "rettangolare";
  const conMonoblocco = monoblocco && !sagomato;
  const manigliePerAnta = useMemo(() => maniglieDiSerie(sagomato ? ante.slice(0, 1) : ante), [ante, sagomato]);
  const telaio = useMemo(() => telaioDaEtichetta(telaioEtichetta), [telaioEtichetta]);
  const vetro = useMemo(() => vetroDaEtichette(vetroEtichetta, vetrocameraEtichetta), [vetroEtichetta, vetrocameraEtichetta]);

  const base: SerramentoDisegno = useMemo(
    () => ({
      larghezzaMm: larghezza,
      altezzaMm: altezza,
      // arco e trapezio hanno un solo campo
      ante: sagomato ? ante.slice(0, 1) : ante,
      soglia,
      forma,
      frecciaMm: forma === "arco" && freccia > 0 ? freccia : undefined,
      altezzaMinoreMm: forma === "trapezio" ? altezzaMinore : undefined,
      latoMinore: forma === "trapezio" ? latoMinore : undefined,
      sopraluce: sopraluce && !sagomato ? { altezzaMm: altezzaSopraluce, apribile: sopraluceApribile } : undefined,
      telaio: telaio ?? undefined,
      vetro,
      traversi: conTraverso && !sagomato ? [{ daBassoMm: traversoDaBasso }] : undefined,
      inglesine: conInglesine && !sagomato ? { colonne: inglColonne, righe: inglRighe } : undefined,
      monoblocco: conMonoblocco
        ? { cassonettoMm: cassonetto, tapparella: conTapparella ? { motore, abbassataPct: abbassata } : false, zanzariera }
        : undefined,
    }),
    [larghezza, altezza, ante, soglia, forma, freccia, altezzaMinore, latoMinore, sagomato, sopraluce, altezzaSopraluce, sopraluceApribile, telaio, vetro, conMonoblocco, cassonetto, conTapparella, motore, abbassata, zanzariera, conTraverso, traversoDaBasso, conInglesine, inglColonne, inglRighe],
  );
  const limiti: LimitiProdotto = useMemo(() => {
    const n = (t: string) => (t.trim() === "" ? undefined : Number(t.replace(",", ".")) || undefined);
    return { anta: { larghezzaMaxMm: n(limAntaL), altezzaMaxMm: n(limAntaH), superficieMaxM2: n(limAntaM2) } };
  }, [limAntaL, limAntaH, limAntaM2]);
  const avvisi = useMemo(() => controllaMisure(base, limiti), [base, limiti]);
  const apertureListino = useMemo(() => apertureDellaTipologia(tipologiaId), [tipologiaId]);
  const interno = useMemo(() => finituraDaEtichetta(coloreInterno), [coloreInterno]);
  const esterno = useMemo(() => finituraDaEtichetta(coloreEsterno), [coloreEsterno]);
  const finCass = useMemo(() => (coloreCassonetto === "come il serramento" ? null : finituraDaEtichetta(coloreCassonetto)), [coloreCassonetto]);
  const finTap = useMemo(() => finituraDaEtichetta(coloreTapparella), [coloreTapparella]);

  const comuni = { finituraInterna: interno, finituraEsterna: esterno, finituraCassonetto: finCass, finituraTapparella: finTap, finituraManiglia: maniglia } as const;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <nav className="flex gap-2 text-sm">
        <span className="rounded bg-primary px-3 py-1 font-medium text-primary-foreground">Serramenti</span>
        <a href="/dev/disegno-persiane" className="rounded border px-3 py-1 hover:bg-muted">Persiane →</a>
      </nav>
      <div>
        <h1 className="text-xl font-semibold">Disegno dei serramenti</h1>
        <p className="text-sm text-muted-foreground">
          Destra e sinistra sono viste dall'interno. Il disegno segue misure, aperture, vetro, telaio, monoblocco e colori scelti qui sotto.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 rounded-lg border p-4 text-sm">
          <label className="block space-y-1">
            <span className="font-medium">Tipologia</span>
            <select className="w-full rounded border bg-background px-2 py-1.5" value={tipologiaId} onChange={(e) => scegliTipologia(e.target.value)}>
              {TIPOLOGIE_DISEGNO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="font-medium">Larghezza (mm)</span>
              <input type="number" min={300} max={6000} className="w-full rounded border bg-background px-2 py-1.5" value={larghezza} onChange={(e) => setLarghezza(Number(e.target.value) || 300)} />
            </label>
            <label className="space-y-1">
              <span className="font-medium">Altezza totale (mm)</span>
              <input type="number" min={300} max={3500} className="w-full rounded border bg-background px-2 py-1.5" value={altezza} onChange={(e) => setAltezza(Number(e.target.value) || 300)} />
            </label>
          </div>

          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="font-medium">Forma</span>
              <select className="w-full rounded border bg-background px-2 py-1.5" value={forma} onChange={(e) => setForma(e.target.value as FormaSerramento)}>
                <option value="rettangolare">Rettangolare</option>
                <option value="arco">Ad arco</option>
                <option value="trapezio">Trapezio</option>
              </select>
            </label>
            {forma === "arco" && (
              <label className="flex items-center gap-2">
                <span>Altezza arco (mm)</span>
                <input type="number" min={0} max={3000} placeholder="0 = tutto sesto" className="w-32 rounded border bg-background px-2 py-1" value={freccia || ""} onChange={(e) => setFreccia(Number(e.target.value) || 0)} />
              </label>
            )}
            {forma === "trapezio" && (
              <div className="flex flex-wrap items-center gap-2">
                <span>Lato basso</span>
                <select className="rounded border bg-background px-1.5 py-1" value={latoMinore} onChange={(e) => setLatoMinore(e.target.value as Lato)}>
                  <option value="dx">destro</option>
                  <option value="sx">sinistro</option>
                </select>
                <input type="number" min={150} max={3000} className="w-24 rounded border bg-background px-2 py-1" value={altezzaMinore} onChange={(e) => setAltezzaMinore(Number(e.target.value) || 150)} />
                <span>mm</span>
              </div>
            )}
            {sagomato && <p className="text-xs text-muted-foreground">Arco e trapezio hanno un solo campo: una sola anta, niente sopraluce, niente monoblocco.</p>}
          </div>

          {!sagomato && apertureListino.length > 0 && (
            <label className="block space-y-1">
              <span className="font-medium">Apertura (come nel listino)</span>
              <select
                className="w-full rounded border bg-background px-2 py-1.5"
                value=""
                onChange={(e) => {
                  const nuove = anteDaApertura(tipologiaId, e.target.value);
                  if (nuove) setAnte(nuove);
                }}
              >
                <option value="">Scegli per applicarla…</option>
                {apertureListino.map((a) => <option key={a.codice} value={a.codice}>{a.nome}</option>)}
              </select>
            </label>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Ante ({sagomato ? 1 : ante.length})</span>
              <div className="flex gap-2">
                <button type="button" className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={sagomato || ante.length <= 1} onClick={() => setAnte((c) => c.slice(0, -1))}>− anta</button>
                <button type="button" className="rounded border px-2 py-0.5 disabled:opacity-40" disabled={sagomato || ante.length >= 5} onClick={() => setAnte((c) => [...c, { tipo: "battente", lato: "dx" }])}>+ anta</button>
              </div>
            </div>
            {(sagomato ? ante.slice(0, 1) : ante).map((a, i) => (
              <div key={i} className="grid grid-cols-[28px_1fr_auto_64px] items-center gap-2 rounded border p-2">
                <span className="text-muted-foreground">{i + 1}</span>
                <div className="grid grid-cols-2 gap-2">
                  <select className="rounded border bg-background px-1.5 py-1" value={a.tipo} onChange={(e) => cambiaAnta(i, { tipo: e.target.value as TipoAnta })}>
                    {TIPI_ANTA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select className="rounded border bg-background px-1.5 py-1 disabled:opacity-40" disabled={a.tipo === "fisso" || a.tipo === "vasistas"} value={a.lato ?? "dx"} onChange={(e) => cambiaAnta(i, { lato: e.target.value as Lato })}>
                    {a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole" ? (
                      <><option value="dx">scorre a DX</option><option value="sx">scorre a SX</option></>
                    ) : (
                      <><option value="dx">cerniere DX</option><option value="sx">cerniere SX</option></>
                    )}
                  </select>
                </div>
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={a.maniglia ?? manigliePerAnta[i] ?? false} onChange={(e) => cambiaAnta(i, { maniglia: e.target.checked })} /> maniglia
                </label>
                <input
                  type="number"
                  min={200}
                  placeholder="mm"
                  title="Larghezza dell'anta in mm; vuoto = automatica"
                  className="rounded border bg-background px-1.5 py-1 text-xs"
                  value={a.larghezzaMm ?? ""}
                  onChange={(e) => cambiaAnta(i, { larghezzaMm: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })}
                />
              </div>
            ))}
          </div>

          <fieldset className="space-y-2 rounded border p-3">
            <legend className="px-1 font-medium">Divisori del vetro</legend>
            <label className="flex flex-wrap items-center gap-2">
              <input type="checkbox" disabled={sagomato} checked={conTraverso} onChange={(e) => setConTraverso(e.target.checked)} /> Traverso orizzontale a
              <input type="number" min={150} className="w-20 rounded border bg-background px-2 py-1" value={traversoDaBasso} onChange={(e) => setTraversoDaBasso(Number(e.target.value) || 150)} />
              <span>mm dal basso</span>
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="checkbox" disabled={sagomato} checked={conInglesine} onChange={(e) => setConInglesine(e.target.checked)} /> Inglesine
              <input type="number" min={1} max={8} className="w-14 rounded border bg-background px-2 py-1" value={inglColonne} onChange={(e) => setInglColonne(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
              <span>colonne ×</span>
              <input type="number" min={1} max={8} className="w-14 rounded border bg-background px-2 py-1" value={inglRighe} onChange={(e) => setInglRighe(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
              <span>righe</span>
            </label>
          </fieldset>

          <fieldset className="space-y-2 rounded border p-3">
            <legend className="px-1 font-medium">Limiti del produttore e controlli</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1 text-xs"><span>Anta, largh. max (mm)</span><input className="w-full rounded border bg-background px-2 py-1" value={limAntaL} onChange={(e) => setLimAntaL(e.target.value)} placeholder="nessuno" /></label>
              <label className="space-y-1 text-xs"><span>Anta, alt. max (mm)</span><input className="w-full rounded border bg-background px-2 py-1" value={limAntaH} onChange={(e) => setLimAntaH(e.target.value)} placeholder="nessuno" /></label>
              <label className="space-y-1 text-xs"><span>Anta, max m²</span><input className="w-full rounded border bg-background px-2 py-1" value={limAntaM2} onChange={(e) => setLimAntaM2(e.target.value)} placeholder="nessuno" /></label>
            </div>
            {avvisi.length === 0 ? (
              <p className="text-xs text-emerald-700">Misure in regola.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {avvisi.map((a) => (
                  <li key={a.codice + a.testo} className={a.gravita === "errore" ? "text-red-600" : "text-amber-600"}>
                    {a.gravita === "errore" ? "✕" : "!"} {a.testo}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className="space-y-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={soglia} onChange={(e) => setSoglia(e.target.checked)} /> Soglia a terra</label>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={sagomato} checked={sopraluce} onChange={(e) => setSopraluce(e.target.checked)} /> Sopraluce</label>
            {sopraluce && !sagomato && (
              <div className="ml-6 flex items-center gap-3">
                <input type="number" min={150} max={1200} className="w-24 rounded border bg-background px-2 py-1" value={altezzaSopraluce} onChange={(e) => setAltezzaSopraluce(Number(e.target.value) || 150)} />
                <span>mm</span>
                <label className="flex items-center gap-1"><input type="checkbox" checked={sopraluceApribile} onChange={(e) => setSopraluceApribile(e.target.checked)} /> apribile</label>
              </div>
            )}
          </div>

          <fieldset className="space-y-2 rounded border p-3">
            <legend className="px-1 font-medium">Monoblocco</legend>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={sagomato} checked={monoblocco && !sagomato} onChange={(e) => setMonoblocco(e.target.checked)} /> Con cassonetto</label>
            {conMonoblocco && (
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <span>Altezza cassonetto</span>
                  <select className="rounded border bg-background px-1.5 py-1" value={cassonetto} onChange={(e) => setCassonetto(Number(e.target.value))}>
                    {[150, 200, 250, 300].map((v) => <option key={v} value={v}>{v} mm</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">finestra: {Math.max(0, altezza - cassonetto)} mm</span>
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={conTapparella} onChange={(e) => setConTapparella(e.target.checked)} /> Tapparella</label>
                {conTapparella && (
                  <div className="ml-6 space-y-2">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={motore} onChange={(e) => setMotore(e.target.checked)} /> Motorizzata (altrimenti cintino)</label>
                    <label className="block space-y-1"><span>Colore tapparella</span><SelezioneColore valore={coloreTapparella} onChange={setColoreTapparella} /></label>
                    <label className="flex items-center gap-2">
                      <span>Abbassata</span>
                      <input type="range" min={0} max={100} step={10} value={abbassata} onChange={(e) => setAbbassata(Number(e.target.value))} />
                      <span className="w-10 text-right">{abbassata}%</span>
                    </label>
                  </div>
                )}
                <label className="flex items-center gap-2"><input type="checkbox" checked={zanzariera} onChange={(e) => setZanzariera(e.target.checked)} /> Zanzariera</label>
                <label className="block space-y-1">
                  <span>Colore cassonetto</span>
                  <select className="w-full rounded border bg-background px-2 py-1.5" value={coloreCassonetto} onChange={(e) => setColoreCassonetto(e.target.value)}>
                    <option>come il serramento</option>
                    <optgroup label="Legni">{LEGNI.map((c) => <option key={c}>{c}</option>)}</optgroup>
                    <optgroup label="Colori">{COLORI_SPECIALI.map((c) => <option key={c}>{c}</option>)}</optgroup>
                    <optgroup label="RAL">{COLORI_RAL.map((c) => <option key={c}>{c}</option>)}</optgroup>
                  </select>
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2 rounded border p-3">
            <legend className="px-1 font-medium">Vetro e telaio</legend>
            <label className="block space-y-1"><span>Tipologia vetro</span><Selezione valore={vetroEtichetta} opzioni={VETRI} onChange={setVetroEtichetta} /></label>
            <label className="block space-y-1"><span>Vetrocamera</span><Selezione valore={vetrocameraEtichetta} opzioni={VETROCAMERA} onChange={setVetrocameraEtichetta} /></label>
            <label className="block space-y-1"><span>Telaio</span><Selezione valore={telaioEtichetta} opzioni={TELAI} onChange={setTelaioEtichetta} /></label>
            {telaio?.tipo === "Z" && (sagomato || conMonoblocco) && (
              <p className="text-xs text-muted-foreground">L'aletta a Z si vede solo sul serramento rettangolare senza cassonetto.</p>
            )}
          </fieldset>

          <div className="space-y-2">
            <label className="block space-y-1"><span className="font-medium">Colore interno</span><SelezioneColore valore={coloreInterno} onChange={setColoreInterno} /></label>
            <label className="block space-y-1"><span className="font-medium">Colore esterno</span><SelezioneColore valore={coloreEsterno} onChange={setColoreEsterno} /></label>
            <label className="block space-y-1">
              <span className="font-medium">Finitura maniglia</span>
              <select className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={maniglia} onChange={(e) => setManiglia(e.target.value as FinituraManigliaId)}>
                {Object.entries(FINITURE_MANIGLIA).map(([k, f]) => <option key={k} value={k}>{f.nome}</option>)}
              </select>
            </label>
            {(!interno || !esterno) && <p className="text-xs text-amber-600">Un colore non è stato riconosciuto: il disegno usa un grigio neutro.</p>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <figure className="rounded-lg border p-4">
            <figcaption className="mb-2 text-sm font-medium">Vista interna · {coloreInterno}</figcaption>
            <DisegnoSerramentoSvg disegno={{ ...base, vista: "interna" }} {...comuni} />
          </figure>
          <figure className="rounded-lg border p-4">
            <figcaption className="mb-2 text-sm font-medium">Vista esterna · {coloreEsterno}</figcaption>
            <DisegnoSerramentoSvg disegno={{ ...base, vista: "esterna" }} {...comuni} />
          </figure>
        </div>
      </div>
    </div>
  );
}
