/**
 * Anteprima di sviluppo del disegno generato delle persiane.
 *
 * Solo in sviluppo (rotta /dev/disegno-persiane in App.tsx): si sceglie la configurazione (a battente, a libro,
 * a pacchetto, scorrevole, ad angolo, con vetro fisso), il tipo (veneziana, scuro…), la forma, le lamelle, l'aletta
 * e il colore, e il disegno si rifà da solo, senza login e senza database. Le persiane si vedono sempre chiuse.
 * Lo stile di serie è quello delle schede del listino; si può passare a quello realistico con parete e davanzale.
 */
import { useMemo, useState } from "react";
import { DisegnoSerramentoSvg } from "@/components/serramenti/DisegnoSerramentoSvg";
import { disegnaPersiana, type PersianaDisegno, type TipoPersiana } from "@/lib/serramenti/disegnoPersiana";
import { CONFIGURAZIONI_PERSIANA, configurazionePersiana, persianaDaConfigurazione } from "@/lib/serramenti/assiDisegno";
import { FORME_SAGOMATE, type FormaSerramento } from "@/lib/serramenti/disegnoSerramento";
import { FINITURE_MANIGLIA, finituraDaEtichetta, type FinituraManigliaId } from "@/lib/serramenti/finituraSerramento";
import { RAL_COLORI } from "@/lib/serramenti/ralColori";

const TIPI: Array<[TipoPersiana, string]> = [
  ["veneziana", "Veneziana"], ["gelosia", "Gelosia"], ["scuro_pieno", "Scuro pieno"], ["scuro_cornice", "Scuro a cornice"],
  ["avvolgibile", "Avvolgibile"], ["griglia", "Griglia di sicurezza"], ["brise_soleil", "Brise-soleil"],
];
/** I tipi che hanno configurazioni di apertura e forme. */
const CON_CONFIGURAZIONE: TipoPersiana[] = ["veneziana", "gelosia", "scuro_pieno", "scuro_cornice"];
const NOMI_FORMA: Record<string, string> = {
  rettangolare: "Rettangolare", arco: "Ad arco", trapezio: "Trapezio", lunetta: "Lunetta (semicerchio)",
  tonda: "Tonda / ovale", triangolo: "Triangolare", ogiva: "Ogivale (arco a punta)",
};
const COLORI = [
  "Legno Chiaro", "Legno Olmo", "Legno Europa", "Legno Scuro", "Legno Rovere Dorato", "Noce K21",
  "Bianco RAL 9010", "Avorio", "Verde RAL 6005", "Marrone RAL 8017", "Bordeaux RAL 3005", "Grigio Medio",
  ...Object.entries(RAL_COLORI).map(([c, v]) => `RAL ${c} ${v.nome}`),
];
const ALETTE = [0, 28, 30, 35, 40, 60, 65];
const GRUPPI = Array.from(new Set(CONFIGURAZIONI_PERSIANA.map((c) => c.gruppo)));

export default function DisegnoPersianeAnteprima() {
  const [larghezza, setLarghezza] = useState(1200);
  const [altezza, setAltezza] = useState(1500);
  const [config, setConfig] = useState("2_ante");
  const [tipo, setTipo] = useState<TipoPersiana>("veneziana");
  const [lamelle, setLamelle] = useState<"fisse" | "orientabili">("fisse");
  const [fessura, setFessura] = useState<0 | 10 | 16>(10);
  const [aperturaLamelle, setAperturaLamelle] = useState(40);
  const [aletta, setAletta] = useState(0);
  const [colore, setColore] = useState("Bianco RAL 9010");
  const [metallo, setMetallo] = useState<FinituraManigliaId>("nero");
  const [forma, setForma] = useState<FormaSerramento>("rettangolare");
  const [freccia, setFreccia] = useState(0);
  const [altezzaMinore, setAltezzaMinore] = useState(900);
  const [latoMinore, setLatoMinore] = useState<"dx" | "sx">("dx");
  const [abbassata, setAbbassata] = useState(100);
  const [realistico, setRealistico] = useState(false);
  const [contesto, setContesto] = useState<boolean | undefined>(undefined);

  const conConfigurazione = CON_CONFIGURAZIONE.includes(tipo);
  const parti = useMemo(() => (conConfigurazione ? persianaDaConfigurazione(config, larghezza, altezza) : {}), [conConfigurazione, config, larghezza, altezza]);
  const strutturale = conConfigurazione ? configurazionePersiana(config)?.tipo : undefined; // a libro, pacchetto, scorrevole, angolo
  const sagomabile = conConfigurazione && !strutturale;
  const formaEffettiva: FormaSerramento = sagomabile ? forma : "rettangolare";

  const persiana: PersianaDisegno = useMemo(
    () => ({
      larghezzaMm: larghezza,
      altezzaMm: altezza,
      ante: 2,
      tipo,
      lamelle: tipo === "veneziana" || strutturale ? lamelle : undefined,
      fessuraMm: fessura,
      aperturaLamellePct: aperturaLamelle,
      alettaMm: aletta,
      abbassataPct: abbassata,
      stile: realistico ? "realistico" : "scheda",
      contesto,
      ...parti,
      ...(strutturale ? { tipo: strutturale } : {}),
      ...(formaEffettiva !== "rettangolare"
        ? {
            forma: formaEffettiva,
            ante: Math.min(2, (parti.ante as number | undefined) ?? 2),
            proporzioni: undefined,
            cerniere: undefined,
            frecciaMm: (formaEffettiva === "arco" || formaEffettiva === "ogiva") && freccia > 0 ? freccia : undefined,
            altezzaMinoreMm: formaEffettiva === "trapezio" ? altezzaMinore : undefined,
            latoMinore: formaEffettiva === "trapezio" ? latoMinore : undefined,
          }
        : {}),
    }),
    [larghezza, altezza, tipo, lamelle, fessura, aperturaLamelle, aletta, abbassata, realistico, contesto, parti, strutturale, formaEffettiva, freccia, altezzaMinore, latoMinore],
  );
  const scena = useMemo(() => disegnaPersiana(persiana), [persiana]);
  const finitura = useMemo(() => finituraDaEtichetta(colore), [colore]);
  const conLamelle = tipo === "veneziana" || !!strutturale;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <nav className="flex gap-2 text-sm">
        <a href="/dev/disegno-serramenti" className="rounded border px-3 py-1 hover:bg-muted">← Serramenti</a>
        <span className="rounded bg-primary px-3 py-1 font-medium text-primary-foreground">Persiane</span>
      </nav>
      <div>
        <h1 className="text-xl font-semibold">Disegno delle persiane</h1>
        <p className="text-sm text-muted-foreground">
          Sempre chiuse, viste da fuori. Stile delle schede del listino; il colore scelto tinge tutto il disegno.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3 rounded-lg border p-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="font-medium">Larghezza (mm)</span><input type="number" min={400} className="w-full rounded border bg-background px-2 py-1.5" value={larghezza} onChange={(e) => setLarghezza(Number(e.target.value) || 400)} /></label>
            <label className="space-y-1"><span className="font-medium">Altezza (mm)</span><input type="number" min={400} className="w-full rounded border bg-background px-2 py-1.5" value={altezza} onChange={(e) => setAltezza(Number(e.target.value) || 400)} /></label>
          </div>

          <label className="block space-y-1">
            <span className="font-medium">Tipo</span>
            <select className="w-full rounded border bg-background px-2 py-1.5" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPersiana)}>
              {TIPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="font-medium">Configurazione di apertura</span>
            <select className="w-full rounded border bg-background px-2 py-1.5 disabled:opacity-50" disabled={!conConfigurazione} value={config} onChange={(e) => setConfig(e.target.value)}>
              {GRUPPI.map((g) => (
                <optgroup key={g} label={g}>
                  {CONFIGURAZIONI_PERSIANA.filter((c) => c.gruppo === g).map((c) => <option key={c.codice} value={c.codice}>{c.nome}</option>)}
                </optgroup>
              ))}
            </select>
            {!conConfigurazione && <span className="text-xs text-muted-foreground">Avvolgibile, griglia e brise-soleil non hanno ante da configurare.</span>}
          </label>

          {sagomabile && (
            <div className="space-y-2 rounded border p-2">
              <label className="block space-y-1">
                <span className="font-medium">Forma</span>
                <select className="w-full rounded border bg-background px-2 py-1.5" value={forma} onChange={(e) => setForma(e.target.value as FormaSerramento)}>
                  {["rettangolare", ...FORME_SAGOMATE].map((f) => <option key={f} value={f}>{NOMI_FORMA[f]}</option>)}
                </select>
              </label>
              {(forma === "arco" || forma === "ogiva") && (
                <label className="flex items-center gap-2"><span>Altezza dell'arco (mm)</span>
                  <input type="number" min={0} placeholder="0 = di serie" className="w-28 rounded border bg-background px-2 py-1" value={freccia || ""} onChange={(e) => setFreccia(Number(e.target.value) || 0)} />
                </label>
              )}
              {forma === "trapezio" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Lato basso</span>
                  <select className="rounded border bg-background px-1.5 py-1" value={latoMinore} onChange={(e) => setLatoMinore(e.target.value as "dx" | "sx")}>
                    <option value="dx">destro</option><option value="sx">sinistro</option>
                  </select>
                  <input type="number" min={150} className="w-24 rounded border bg-background px-2 py-1" value={altezzaMinore} onChange={(e) => setAltezzaMinore(Number(e.target.value) || 150)} />
                  <span>mm</span>
                </div>
              )}
              {forma !== "rettangolare" && <p className="text-xs text-muted-foreground">Le sagomate hanno una o due ante.</p>}
            </div>
          )}

          {conLamelle && (
            <div className="space-y-2 rounded border p-2">
              <label className="block space-y-1">
                <span className="font-medium">Lamelle</span>
                <select className="w-full rounded border bg-background px-2 py-1.5" value={lamelle} onChange={(e) => setLamelle(e.target.value as "fisse" | "orientabili")}>
                  <option value="fisse">Fisse</option>
                  <option value="orientabili">Orientabili (con l'asta)</option>
                </select>
              </label>
              {lamelle === "fisse" && (
                <label className="flex items-center gap-2">
                  <span>Fessura</span>
                  <select className="rounded border bg-background px-1.5 py-1" value={fessura} onChange={(e) => setFessura(Number(e.target.value) as 0 | 10 | 16)}>
                    <option value={0}>chiuse (0 mm)</option><option value={10}>10 mm</option><option value={16}>16 mm</option>
                  </select>
                </label>
              )}
              {lamelle === "orientabili" && (
                <label className="flex items-center gap-2">
                  <span>Lamelle aperte</span>
                  <input type="range" min={0} max={100} step={10} value={aperturaLamelle} onChange={(e) => setAperturaLamelle(Number(e.target.value))} />
                  <span className="w-10 text-right">{aperturaLamelle}%</span>
                </label>
              )}
            </div>
          )}

          {tipo === "avvolgibile" && (
            <label className="flex items-center gap-2">
              <span className="font-medium">Abbassata</span>
              <input type="range" min={0} max={100} step={10} value={abbassata} onChange={(e) => setAbbassata(Number(e.target.value))} />
              <span className="w-10 text-right">{abbassata}%</span>
            </label>
          )}

          <label className="block space-y-1">
            <span className="font-medium">Aletta</span>
            <select className="w-full rounded border bg-background px-2 py-1.5" value={aletta} onChange={(e) => setAletta(Number(e.target.value))}>
              {ALETTE.map((v) => <option key={v} value={v}>{v === 0 ? "Senza aletta" : `${v} mm`}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Colore</span>
            <select className="w-full rounded border bg-background px-2 py-1.5" value={colore} onChange={(e) => setColore(e.target.value)}>
              {COLORI.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="font-medium">Ferramenta (cerniere)</span>
            <select className="w-full rounded border bg-background px-2 py-1.5" value={metallo} onChange={(e) => setMetallo(e.target.value as FinituraManigliaId)}>
              {Object.entries(FINITURE_MANIGLIA).map(([k, f]) => <option key={k} value={k}>{f.nome}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={realistico} onChange={(e) => setRealistico(e.target.checked)} /> Stile realistico (volume e ombre)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={contesto ?? realistico} onChange={(e) => setContesto(e.target.checked)} /> Parete e davanzale</label>
          {!finitura && <p className="text-xs text-amber-600">Colore non riconosciuto: grigio neutro.</p>}
        </div>
        <figure className="rounded-lg border bg-white p-4">
          <figcaption className="mb-2 text-sm font-medium">
            {conConfigurazione ? configurazionePersiana(config)?.nome : TIPI.find(([v]) => v === tipo)?.[1]} · {colore}
          </figcaption>
          <DisegnoSerramentoSvg scena={scena} vista="esterna" finituraEsterna={finitura} finituraTapparella={finitura} finituraManiglia={metallo} />
        </figure>
      </div>
    </div>
  );

}
