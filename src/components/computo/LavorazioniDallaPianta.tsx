import { useMemo, useState } from "react";
import { ChevronDown, Crosshair, ListChecks, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { arrotondaDecimale, calcolaVoce, type VoceEditor } from "@/lib/computo/editorNativo";
import { gruppiMisureDallaPianta, type confrontaComputoConPianta, type MisuraPropostaDallaPianta } from "@/lib/computo/computoDallaPianta";
import type { OggettoLavoro } from "@/lib/planimetrie/primaEDopo";

const quantita = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const deltaEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", signDisplay: "exceptZero" });
const simboliUnita: Record<string, string> = { mq: "m²", mc: "m³", ml: "m" };
const unitaVisibile = (unita: string) => simboliUnita[unita] ?? unita;

interface Riga {
  id: string;
  nome: string;
  fase: string;
  misure: MisuraPropostaDallaPianta[];
  unita: string;
  prima?: number | null;
  dopo: number | null;
  importoPrima?: number | null;
  importoDopo?: number | null;
  motivo?: string;
}

const coincide = (a: OggettoLavoro | undefined, b: { tipo: string; id: string } | null) => !!a && a.tipo === b?.tipo && a.id === b.id;
const nuova = (r: Riga) => r.prima === undefined;
const cambiata = (r: Riga) => !nuova(r) && r.prima !== r.dopo;
const scriviQuantita = (n: number | null | undefined, unita: string) => n == null ? "—" : `${quantita.format(n)} ${unitaVisibile(unita)}`;

export default function LavorazioniDallaPianta({ confronto, voci, selezione, bozzaPianta, attesa, modifica, puoConfermareDisegno, novitaDisegno, inSilvio, propostaDaChat, onPunta, onRivedi }: {
  confronto: ReturnType<typeof confrontaComputoConPianta>;
  voci: readonly VoceEditor[];
  selezione: { tipo: string; id: string } | null;
  bozzaPianta: boolean;
  attesa: boolean;
  modifica: boolean;
  puoConfermareDisegno?: boolean;
  novitaDisegno?: readonly MisuraPropostaDallaPianta[];
  inSilvio?: boolean;
  propostaDaChat?: boolean;
  onPunta: (oggetto: OggettoLavoro) => void;
  onRivedi: () => void;
}) {
  const [cerca, setCerca] = useState("");
  const [soloVariazioni, setSoloVariazioni] = useState(false);
  const [soloSelezione, setSoloSelezione] = useState(false);
  const [altreMisure, setAltreMisure] = useState(false);
  const [limite, setLimite] = useState(40);
  const righe = useMemo(() => {
    const modificate = new Map(confronto.variazioni.map(r => [r.prima.id, r.dopo]));
    const daVerificare = new Map(confronto.daVerificare.map(r => [r.voce.id, r.motivo]));
    const collegate = voci.flatMap((v): Riga[] => {
      if (!v.misure.some(m => m.dallaPianta)) return [];
      const prima = calcolaVoce(v);
      const editata = modificate.get(v.id);
      const dopo = editata ? calcolaVoce(editata) : prima;
      return [{
        id: v.id, nome: v.descrizione, fase: v.capitolo, unita: v.unita, misure: confronto.misurePerVoce.get(v.id) ?? [],
        prima: prima.quantita, dopo: dopo.quantita, importoPrima: prima.importo, importoDopo: dopo.importo, motivo: daVerificare.get(v.id),
      }];
    });
    return [...collegate, ...gruppiMisureDallaPianta(novitaDisegno ?? confronto.disponibili).map(({ prima, misure, quantita }): Riga => ({
      id: prima.chiave, nome: prima.nome, fase: prima.capitolo, unita: prima.unita, misure, dopo: quantita,
    }))];
  }, [confronto, novitaDisegno, voci]);
  const esplora = !inSilvio || altreMisure;
  const inAnteprima = Boolean(novitaDisegno);
  const parole = cerca.trim().toLocaleLowerCase("it-IT").split(/\s+/).filter(Boolean);
  const filtrate = righe.filter(r => {
    if (inAnteprima) return cambiata(r) || nuova(r) || Boolean(r.motivo);
    if (!esplora && nuova(r)) return false;
    if (soloVariazioni && !cambiata(r) && !nuova(r) && !r.motivo) return false;
    if (soloSelezione && selezione && !r.misure.some(m => coincide(m.oggetto, selezione))) return false;
    const testo = [r.nome, r.fase, ...r.misure.map(m => m.riferimento)].join(" ").toLocaleLowerCase("it-IT");
    return parole.every(p => testo.includes(p));
  });
  const variazioni = righe.filter(cambiata);
  const collegate = righe.filter(r => !nuova(r)).length;
  const modificheConPrezzo = variazioni.filter(r => r.importoPrima != null && r.importoDopo != null);
  const differenza = arrotondaDecimale(variazioni.reduce((tot, r) =>
    tot + (r.importoPrima != null && r.importoDopo != null ? r.importoDopo - r.importoPrima : 0), 0));
  const importiDaDefinire = righe.filter(nuova).length + variazioni.filter(r => r.importoDopo == null).length;
  const rivedibili = puoConfermareDisegno || confronto.haMisureDaAggiornare || confronto.disponibili.length > 0 || confronto.daVerificare.length > 0;
  const contaVoci = (n: number) => n === 1 ? "1 voce collegata" : `${n} voci collegate`;

  return <section className="quote-wizard-ai-project-impact min-w-0 self-start overflow-hidden rounded-xl border bg-background" aria-label="Lavorazioni dalla planimetria">
    <header className={`space-y-3 border-b p-3.5 ${inAnteprima ? "bg-blue-50/80" : "bg-slate-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">{inSilvio ? "Impatto sul computo" : "Lavorazioni dalla pianta"}</h3>
          {inSilvio ? <div className="mt-1 text-xs text-muted-foreground" role="status">
            {inAnteprima ? <>
              <p>{variazioni.length === 1 ? "1 voce cambia" : variazioni.length ? `${variazioni.length} voci cambiano` : "Quantità delle voci collegate invariate"}</p>
              {!!modificheConPrezzo.length && <p className="mt-2 text-sm font-semibold text-blue-950">Imponibile delle voci <span className="tabular-nums">{deltaEuro.format(differenza)}</span></p>}
              {importiDaDefinire > 0 && <p className="mt-1">{importiDaDefinire === 1 ? "1 voce da valorizzare" : `${importiDaDefinire} voci da valorizzare`}</p>}
            </> : <p>{collegate ? contaVoci(collegate) : "Aggiungi le misure per creare le prime voci dalla pianta."}{variazioni.length > 0 && ` · ${variazioni.length} da aggiornare`}</p>}
          </div> : <><p className="mt-0.5 text-xs text-muted-foreground">
            {bozzaPianta ? `Anteprima del disegno${variazioni.length ? ` · ${deltaEuro.format(differenza)} sulle voci con prezzo` : ""}. ${novitaDisegno ? "Rivedi le variazioni prima di confermare." : "Salva la pianta per applicare le misure."}`
              : variazioni.length ? `${variazioni.length} da aggiornare · ${deltaEuro.format(differenza)} sulle voci con prezzo`
                : confronto.disponibili.length ? "Scegli quali lavorazioni portare nel computo." : "Seleziona una voce per vedere il punto sulla pianta."}
          </p>
          {(variazioni.length > 0 || bozzaPianta) && importiDaDefinire > 0 && <p className="text-xs text-muted-foreground">{importiDaDefinire} da valorizzare</p>}</>}
        </div>
        {rivedibili && (!inSilvio || bozzaPianta || confronto.haMisureDaAggiornare || confronto.daVerificare.length > 0) &&
          <Button type="button" size="sm" className={inSilvio && propostaDaChat ? "hidden xl:inline-flex" : undefined}
            variant={inSilvio && !bozzaPianta ? "outline" : "default"} disabled={attesa || (bozzaPianta && !puoConfermareDisegno)} onClick={onRivedi}>
            <ListChecks aria-hidden="true" className="size-4" /> {modifica ? bozzaPianta ? "Rivedi modifiche" : "Rivedi misure" : "Vedi misure"}
          </Button>}
      </div>
      {inSilvio && !bozzaPianta && confronto.disponibili.length > 0 && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" aria-expanded={altreMisure} onClick={() => {
          setAltreMisure(v => !v); setCerca(""); setSoloVariazioni(false); setSoloSelezione(false); setLimite(40);
        }}><ChevronDown aria-hidden="true" className={`size-4 ${altreMisure ? "rotate-180" : ""}`} /> Altre misure dalla pianta</Button>
        {altreMisure && modifica && <Button type="button" size="sm" disabled={attesa} onClick={onRivedi}>Scegli misure</Button>}
      </div>}
      {!inAnteprima && esplora && righe.length > 0 && <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[11rem] flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Cerca stanza, fase o voce" placeholder="Cerca stanza, fase o voce" className="h-9 bg-white pl-8" value={cerca} onChange={e => {
            setCerca(e.target.value); setLimite(40);
          }} />
        </div>
        <Button type="button" size="sm" variant={soloVariazioni ? "secondary" : "outline"} aria-pressed={soloVariazioni} onClick={() => {
          setSoloVariazioni(v => !v); setLimite(40);
        }}>Solo variazioni</Button>
        {selezione && <Button type="button" size="sm" variant={soloSelezione ? "secondary" : "ghost"} aria-pressed={soloSelezione} onClick={() => setSoloSelezione(v => !v)}>Oggetto selezionato</Button>}
      </div>}
    </header>
    {filtrate.length === 0 ? (inSilvio && !esplora) || inAnteprima ? null
      : <p className="p-4 text-sm text-muted-foreground">{righe.length ? "Nessuna lavorazione per i filtri selezionati." : "Indica i muri da demolire, disegna i nuovi divisori o aggiungi punti impianto per vedere le proposte."}</p>
      : <div className="max-h-[min(62dvh,610px)] overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs text-muted-foreground">
            <tr className="border-b"><th scope="col" className="px-3 py-2 font-medium">Lavorazione</th><th scope="col" className="w-[30%] px-3 py-2 text-right font-medium">Misure e importi</th></tr>
          </thead>
          <tbody className="divide-y">
            {filtrate.slice(0, limite).map(r => {
              const daPuntare = r.misure.find(m => coincide(m.oggetto, selezione))?.oggetto ?? r.misure.find(m => m.oggetto)?.oggetto;
              const attiva = r.misure.some(m => coincide(m.oggetto, selezione));
              const luoghi = [...new Set(r.misure.map(m => m.riferimento))].join(", ");
              return <tr key={r.id} className={attiva ? "bg-blue-50" : undefined}>
                <td className="px-3 py-2.5 align-top">
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      {daPuntare ? <button type="button" className="inline-flex items-start gap-1.5 text-left font-medium text-blue-800 hover:underline"
                        title="Mostra sulla planimetria" onClick={() => onPunta(daPuntare)}><Crosshair aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{r.nome}</button>
                        : <span className="font-medium">{r.nome}</span>}
                      <p className="break-words text-xs text-muted-foreground">{[luoghi, r.fase].filter(Boolean).join(" · ")}</p>
                      {r.misure.length === 1 && r.misure[0].calcolo && <p className="text-xs text-muted-foreground">{r.misure[0].calcolo}</p>}
                      {r.motivo ? <p className="text-xs text-amber-900">{r.motivo}</p>
                        : nuova(r) ? <p className="text-xs text-blue-800">{r.misure.some(m => m.origine === "stimata") ? "Da aggiungere · misura stimata" : "Da aggiungere"}</p>
                          : cambiata(r) && !inSilvio && <p className="text-xs text-blue-800">Quantità variata</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right align-top tabular-nums">
                  {cambiata(r) && <span className="block text-xs text-muted-foreground">{scriviQuantita(r.prima, r.unita)} →</span>}
                  <strong className="whitespace-nowrap">{scriviQuantita(r.dopo, r.unita)}</strong>
                  {cambiata(r) && r.importoPrima != null && <span className="block whitespace-nowrap text-xs text-muted-foreground">{formatCurrency(r.importoPrima)} →</span>}
                  <span className="block whitespace-nowrap text-xs text-muted-foreground">{r.importoDopo != null ? formatCurrency(r.importoDopo) : "Prezzo da definire"}</span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {filtrate.length > limite && <div className="border-t p-2 text-center"><Button type="button" size="sm" variant="outline" onClick={() => setLimite(v => v + 40)}>Mostra altre lavorazioni</Button></div>}
      </div>}
  </section>;
}
