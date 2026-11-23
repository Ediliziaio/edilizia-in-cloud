import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Armchair, DoorOpen, Focus, Layers2, PaintRoller, Plus, RotateCw, Save, ScanLine, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { anteprimaModificheCasa3D, type ModificaCasa3D } from "@/lib/planimetrie/modificheCasa3D";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { apertureDelLocale, pianiDaPlanimetria, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { ingombriArrediSovrapposti, ingombroDentroLocale } from "@/lib/planimetrie/tred/ingombroArredo";
import { CAMPIONI_FINITURE, RIVESTIMENTI_STANZA, campioneFinitura, campioneRivestimento } from "../../../shared/planimetrie/finiture";
import { puntoNelPoligono } from "../../../shared/planimetrie/geometria";
import { ambitoGeometriaDelPiano, COLORI_INFISSI_PROGETTO, materialiDelProgetto, PROFILI_PROGETTO, type InfissiProgetto } from "../../../shared/planimetrie/materialiProgetto";
import { eAmbienteInterno, type Elemento, type Finiture, type Livello, type Locale, type Planimetria, type PosaPavimento, type StatoPianta } from "../../../shared/planimetrie/modello";
import { modelliArredo, modelloArredo, richiedeAltezzaComplemento } from "../../../shared/planimetrie/modelliArredo";
import { anteDi } from "../../../shared/planimetrie/serramenti";
import { controlloPrimaDellUso } from "../../../shared/planimetrie/verificaDocumento";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli";
import type { InquadraturaVista3D, PuntoVista3D, SelezioneVista3D, Vista3DHandle } from "./Vista3D";
import { Vista3DPigra } from "./Vista3DPigra";
import { daPlanimetria, elementoAModello } from "./editor/adattatore";
import { arredaStanza, destinazioneArredabile } from "./editor/arreda";
import { CATALOGO_ARREDI_3D as ARREDI, TIPI_ARREDO_3D as ID_ARREDI, nomeDelTipo } from "./editor/catalogo";
import { CatalogoArredi3D, MiniaturaArredo } from "./tred/CatalogoArredi3D";
import { CampioneSuperficie } from "./tred/CampioneSuperficie";
import { leggiMisureArredo, MisureArredo3D, quotaArredo, testoMisureArredo, type TestoMisureArredo } from "./tred/MisureArredo3D";
import { COLORI_ARREDO, ModificheRapide3D, riepilogoModificheCasa } from "./tred/ModificheRapide3D";
const SUPERFICI = { pavimento: "Pavimento", pareti: "Pareti", soffitto: "Soffitto", rivestimento: "Rivestimento" } as const;
type Superficie = keyof typeof SUPERFICI;
export type PannelloInterni3D = "superfici" | "infissi" | "arredi";

interface Props {
  documento: Planimetria;
  bozza: Planimetria | null;
  onBozza: (doc: Planimetria | null) => void;
  livello: Livello;
  ambito: string;
  planimetriaId: string;
  titolo: string;
  versione: number;
  localeIniziale?: string;
  esplosoIniziale?: boolean;
  puoScrivere: boolean;
  onSalvata: (localeId: string) => void;
  onVerifica: () => void;
  pannello: PannelloInterni3D;
  onPannello: (pannello: PannelloInterni3D) => void;
  onLocaleCambiato: (id: string) => void;
  onVediInPianta: (punto: PuntoVista3D) => void;
  inVisita: boolean;
  onVisita: (inVisita: boolean) => void;
  torna?: string | null;
}

const appartieneA = (e: Elemento, l: Locale) => e.localeId ? e.localeId === l.id : puntoNelPoligono(e.posizione, l.contorno);
const misureArredo = (e: Elemento) => ({ larghezza: e.larghezza, profondita: e.profondita,
  altezza: (e.altezza === 0 && richiedeAltezzaComplemento(e.tipo) ? undefined : e.altezza)
    ?? ARREDI.find(a => a.tipo === e.tipo)?.altezza ?? 0 });
const baseInCm = (e: Pick<Elemento, "larghezza" | "profondita">) => `${quotaArredo(e.larghezza)} × ${quotaArredo(e.profondita)} cm`;

function ModificaMisure({ elemento, onApplica }: { elemento: Elemento; onApplica: (e: Elemento) => void }) {
  const iniziali = misureArredo(elemento);
  const [testo, setTesto] = useState(() => testoMisureArredo(iniziali));
  const nuove = leggiMisureArredo(testo, elemento.tipo);
  const modificate = !!nuove && (nuove.larghezza !== iniziali.larghezza || nuove.profondita !== iniziali.profondita || nuove.altezza !== iniziali.altezza);
  return <form className="w-full space-y-2" onSubmit={e => { e.preventDefault(); if (nuove && modificate) onApplica({ ...elemento, ...nuove }); }}>
    <MisureArredo3D tipo={elemento.tipo} valore={testo} onChange={setTesto} />
    <Button type="submit" variant="outline" size="sm" className="w-full" disabled={!modificate}>Applica misure</Button>
  </form>;
}

function SceltaModello({ tipo, valore, misto, label, onChange }: { tipo: string; valore?: string; misto?: boolean; label: string; onChange: (id?: string) => void }) {
  const opzioni = modelliArredo(tipo);
  if (!opzioni.length) return null;
  const scelta = modelloArredo(tipo, valore);
  return <div className="w-full space-y-1.5">
    <label className="block text-xs font-medium">{label}
      <UniformSelect value={misto ? "__misto__" : valore ?? ""} onChange={e => onChange(e.target.value || undefined)} className="mt-1 h-9 w-full">
        {misto && <option value="__misto__" disabled>Modelli diversi</option>}
        <option value="">Modello di base</option>
        {opzioni.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </UniformSelect>
    </label>
    {scelta && <p className="text-xs text-muted-foreground">{scelta.descrizione}</p>}
  </div>;
}

export function StudioInterni3D({ documento, bozza, onBozza, livello, ambito, planimetriaId, titolo, versione,
  localeIniziale, esplosoIniziale, puoScrivere, onSalvata, onVerifica, torna, pannello, onPannello, onLocaleCambiato, onVediInPianta, inVisita, onVisita }: Props) {
  const navigate = useNavigate();
  const visore = useRef<Vista3DHandle>(null);
  const areaVisore = useRef<HTMLDivElement>(null);
  const areaRapide = useRef<HTMLDivElement>(null);
  const attuale = bozza ?? documento;
  const [rapide, setRapide] = useState(false);
  const [pianoRapido, setPianoRapido] = useState("");
  const [modificaRapida, setModificaRapida] = useState<ModificaCasa3D | null>(null);
  const [prima, setPrima] = useState(false);
  const [ultimaRapida, setUltimaRapida] = useState<{ prima: Planimetria | null; dopo: Planimetria }>();
  const [statoRapido, setStatoRapido] = useState("");
  const rapideAperte = puoScrivere && rapide;
  useEffect(() => {
    if (rapideAperte && window.matchMedia("(max-width: 1279px)").matches) areaRapide.current?.scrollIntoView({ block: "nearest" });
  }, [rapideAperte]);
  const anteprimaRapida = useMemo(() => rapideAperte && modificaRapida
    ? anteprimaModificheCasa3D(attuale, ambito, modificaRapida, pianoRapido || undefined) : undefined,
    [rapideAperte, modificaRapida, attuale, ambito, pianoRapido]);
  const anteprimaAttiva = !!anteprimaRapida?.piani.length;
  const documentoVisore = anteprimaAttiva && !prima ? anteprimaRapida!.documento : attuale;
  const ambitoGeometria = ambitoGeometriaDelPiano(attuale, livello.id, ambito);
  const propostaId = ambitoGeometria.startsWith("progetto:") ? ambitoGeometria.slice(9) : undefined;
  const vista = propostaId ? "progetto" : "fatto";
  const stato = statoPerAmbito(attuale, livello.id, ambitoGeometria) ?? livello.fatto;
  const [localeId, setLocaleId] = useState(localeIniziale ?? stato.locali[0]?.id ?? "");
  const locale = stato.locali.find(l => l.id === localeId) ?? stato.locali[0];
  const [piuStanze, setPiuStanze] = useState(false);
  const [selezioneStanze, setSelezioneStanze] = useState<string[]>([]);
  const stanzeInterne = stato.locali.filter(eAmbienteInterno);
  const stanze = piuStanze ? stato.locali.filter(l => selezioneStanze.includes(l.id)) : locale ? [locale] : [];
  const tutteSelezionate = stanzeInterne.length > 0 && stanzeInterne.every(l => selezioneStanze.includes(l.id));
  const ambitoVisore = ambitoGeometriaDelPiano(documentoVisore, livello.id, ambito);
  const vistaVisore = ambitoVisore === "fatto" ? "fatto" : "progetto";
  const piante = useMemo(() => pianteDaPlanimetria(documentoVisore, {
    livelloId: livello.id, propostaId: ambitoVisore === "fatto" ? undefined : ambitoVisore.slice(9), materialiAmbito: ambito,
  }), [documentoVisore, livello.id, ambitoVisore, ambito]);
  const piani = useMemo(() => pianiDaPlanimetria(documentoVisore, ambito.startsWith("progetto:") ? ambito.slice(9) : undefined), [documentoVisore, ambito]);
  const [vistaAmpia, setVistaAmpia] = useState(false);
  const [superficie, setSuperficie] = useState<Superficie>("pavimento");
  const [selezionato, setSelezionato] = useState("");
  const [aggiungiArredo, setAggiungiArredo] = useState(false);
  const [tipo, setTipo] = useState("");
  const [modelloNuovo, setModelloNuovo] = useState<string>();
  const [misureNuove, setMisureNuove] = useState<TestoMisureArredo | null>(null);
  const [rotazioneNuova, setRotazioneNuova] = useState(0);
  const [posa, setPosa] = useState<"aggiungi" | "sposta" | null>(null);
  const [messaggio, setMessaggio] = useState("");
  const salvataggio = useSalvaVersionePlanimetria();
  const occupato = useRef(false);
  const sceltaModificabile = puoScrivere && !salvataggio.isPending;
  const puoModificareStanza = sceltaModificabile && ambitoGeometria === ambito;
  const infissi = materialiDelProgetto(attuale, ambito).infissi;
  const verifica = useMemo(() => controlloPrimaDellUso(documento, "3d"), [documento]);
  const elemento = stato.elementi.find(e => e.id === selezionato && ID_ARREDI.has(e.tipo));
  const apertura = stato.aperture.find(a => a.id === selezionato);
  const serramenti = useMemo(() => {
    const locali = piante[vista].locali;
    const attivo = locali.find(l => l.id === localeId) ?? locali[0];
    return attivo ? apertureDelLocale(piante[vista], attivo.id, vista)
      .filter(a => a.tipo === "finestra" || a.tipo === "portafinestra") : [];
  }, [piante, vista, localeId]);
  const catalogo = ARREDI.find(a => a.tipo === tipo);
  const testoNuovo = catalogo && (misureNuove ?? testoMisureArredo(catalogo));
  const nuove = testoNuovo && leggiMisureArredo(testoNuovo, tipo);
  const mostraCatalogo = !elemento || aggiungiArredo;
  const elementi = stato.elementi.filter(e => e.stato !== "da_demolire" && ID_ARREDI.has(e.tipo) && !!locale && appartieneA(e, locale));
  const oggettiConLoStessoTipo = elemento
    ? piuStanze ? stato.elementi.filter(e => e.tipo === elemento.tipo && e.stato !== "da_demolire" && stanze.some(l => appartieneA(e, l))) : [elemento]
    : [];
  const arrediDaAggiornare = new Set(oggettiConLoStessoTipo.map(e => e.id));
  const primoArredo = oggettiConLoStessoTipo[0];
  const statoColore = oggettiConLoStessoTipo.every(e => e.colore === primoArredo?.colore) ? primoArredo?.colore : undefined;
  const modelliDiversi = oggettiConLoStessoTipo.some(e => e.modello !== primoArredo?.modello);
  const campioni = superficie === "rivestimento" ? RIVESTIMENTI_STANZA : CAMPIONI_FINITURE[superficie];
  const valori = stanze.map(l => superficie === "rivestimento" ? l.finiture?.rivestimento?.materiale : l.finiture?.[superficie]);
  const finitureDiverse = valori.some(v => v !== valori[0]);
  const valore = finitureDiverse ? undefined : valori[0];
  const altezze = stanze.flatMap(l => l.finiture?.rivestimento ? [l.finiture.rivestimento.altezza] : []);
  const altezzaComune = altezze.length && altezze.every(h => h === altezze[0]) ? altezze[0] : "";
  const campioneAttuale = superficie === "rivestimento" ? campioneRivestimento(valore)?.campione : campioneFinitura(valore, superficie);
  const pose = stanze.map(l => l.finiture?.posaPavimento ?? "dritta");
  const posaComune = pose.every(p => p === pose[0]) ? pose[0] : undefined;
  const nomeElemento = elemento ? nomeDelTipo(elemento.tipo) : "";
  const daPosare: Elemento | undefined = posa === "sposta" ? elemento : posa === "aggiungi" && catalogo && nuove ? {
    id: "", tipo: catalogo.tipo, posizione: { x: 0, y: 0 }, rotazione: rotazioneNuova,
    ...nuove,
    localeId: locale?.id, modello: modelloNuovo, stato: vista === "fatto" ? "esistente" : "nuovo", origine: "stimata",
  } : undefined;
  const istruzione = daPosare && (messaggio || `${nomeDelTipo(daPosare.tipo)} · ${baseInCm(daPosare)}. Tocca il pavimento per ${posa === "sposta" ? "spostare" : "posizionare"}.`);

  const scegliModificaRapida = (scelta: ModificaCasa3D | null) => {
    setModificaRapida(scelta);
    setPrima(false);
    setStatoRapido("");
  };
  const mostraRapide = (aperte: boolean) => {
    setRapide(aperte);
    scegliModificaRapida(null);
    setPosa(null);
    setMessaggio("");
  };
  const applicaModificaRapida = () => {
    if (!sceltaModificabile || !anteprimaRapida?.piani.length) return;
    setUltimaRapida({ prima: bozza, dopo: anteprimaRapida.documento });
    onBozza(anteprimaRapida.documento);
    scegliModificaRapida(null);
    setStatoRapido(`Applicato alla bozza · ${riepilogoModificheCasa(anteprimaRapida)}`);
  };

  const modificaStato = (cambia: (s: StatoPianta) => StatoPianta) => {
    if (!puoModificareStanza) return;
    onBozza({ ...attuale, livelli: attuale.livelli.map(l => l.id !== livello.id ? l : propostaId
      ? { ...l, proposte: l.proposte.map(p => p.id === propostaId ? { ...p, ...cambia(p) } : p) }
      : { ...l, fatto: cambia(l.fatto) }) });
  };

  const modificaFiniture = (cambia: (f: Finiture, l: Locale) => Finiture) => modificaStato(s => ({
    ...s,
    locali: s.locali.map(l => stanze.some(dest => dest.id === l.id) ? { ...l, finiture: cambia(l.finiture ?? {}, l) } : l),
  }));
  const scegliFinitura = (descrizione?: string) => {
    if (!stanze.length) return;
    if (superficie === "rivestimento") {
      modificaFiniture((f, l) => ({ ...f, rivestimento: descrizione ? { materiale: descrizione, altezza: f.rivestimento?.altezza ?? Math.min(l.altezza, 210) } : undefined }));
    } else {
      modificaFiniture(f => ({ ...f, [superficie]: descrizione, ...(superficie === "pavimento" ? { pavimentoSpecifico: descrizione ? true : undefined } : {}) }));
    }
  };

  const modificaInfissi = (scelta?: InfissiProgetto) => {
    if (!sceltaModificabile) return;
    const materiali = materialiDelProgetto(attuale, ambito);
    onBozza({ ...attuale, materialiProgetto: { ...attuale.materialiProgetto, [ambito]: { ...materiali, infissi: scelta } } });
  };

  const selezionaArredo = (id: string) => {
    setSelezionato(id); setAggiungiArredo(false); setPosa(null); setMessaggio("");
  };

  const cambiaLocale = (id: string) => {
    setLocaleId(id); onLocaleCambiato(id); selezionaArredo("");
  };
  const ingombroVicino = (e: Elemento) => elementi.find(a => a.id !== e.id && ingombriArrediSovrapposti(e, a));

  const aggiornaElemento = (e: Elemento, l: Locale, conferma = "") => {
    if (!ingombroDentroLocale(e, l.contorno)) {
      setMessaggio(daPosare ? "L’ingombro esce dalla stanza. Scegli un punto più interno." : "L’ingombro esce dalla stanza. Riduci le misure o sposta l’arredo.");
      return;
    }
    modificaStato(s => ({ ...s, elementi: s.elementi.some(a => a.id === e.id) ? s.elementi.map(a => a.id === e.id ? e : a) : [...s.elementi, e] }));
    const vicino = ingombroVicino(e);
    selezionaArredo(e.id);
    setMessaggio(vicino ? `Controlla lo spazio rispetto a ${nomeDelTipo(vicino.tipo).toLowerCase()}.` : conferma);
  };

  const avviaPosa = (azione: NonNullable<typeof posa>) => {
    setPosa(azione);
    setMessaggio("");
    visore.current?.preparaPosa();
    if (areaVisore.current && areaVisore.current.getBoundingClientRect().bottom < 200) {
      areaVisore.current.scrollIntoView({ block: "start" });
    }
  };

  const modificaAspettoArredo = (scelta: Pick<Elemento, "colore" | "modello">) => {
    if (!arrediDaAggiornare.size) return;
    modificaStato(s => ({ ...s, elementi: s.elementi.map(a => arrediDaAggiornare.has(a.id) ? { ...a, ...scelta } : a) }));
  };

  const selezionaScena = ({ riferimento, genere, modo, punto }: SelezioneVista3D) => {
    if (rapideAperte) return;
    if (posa) {
      if (!daPosare) return;
      if (!locale || genere !== "pavimento" || riferimento !== locale.id) {
        setMessaggio("Scegli un punto sul pavimento dell’ambiente selezionato.");
        return;
      }
      aggiornaElemento({ ...daPosare, id: daPosare.id || crypto.randomUUID(), posizione: punto, localeId: locale.id }, locale);
      return;
    }
    const e = stato.elementi.find(a => a.id === riferimento && ID_ARREDI.has(a.tipo));
    if (e) {
      const l = stato.locali.find(a => a.id === e.localeId) ?? stato.locali.find(a => puntoNelPoligono(e.posizione, a.contorno));
      if (l && l.id !== locale?.id) cambiaLocale(l.id);
      selezionaArredo(e.id); onPannello("arredi"); setVistaAmpia(false);
    } else if (stato.aperture.some(a => a.id === riferimento && a.tipo !== "porta" && a.tipo !== "varco")) {
      setSelezionato(riferimento); onPannello("infissi"); setVistaAmpia(false);
    } else if (genere === "pavimento" && stato.locali.some(l => l.id === riferimento)) {
      // In orbita è utile indicare il locale; dentro si cambia ambiente dal selettore.
      if (modo === "dentro" && riferimento !== locale?.id) return;
      if (riferimento !== locale?.id) cambiaLocale(riferimento);
      onPannello("superfici");
    }
  };

  const suggerisciArredi = () => {
    if (!puoModificareStanza || !stanze.length) return;
    let pianta = daPlanimetria(attuale, livello.id, propostaId);
    const aggiunti: Elemento[] = [], saltati = new Set<string>();
    for (const l of stanze.filter(s => destinazioneArredabile(s.destinazione))) {
      const esito = arredaStanza(pianta, l.id, vista, l.destinazione);
      pianta = esito.pianta;
      const ids = new Set(esito.aggiunti);
      for (const e of pianta.elementi ?? []) {
        if (ids.has(e.id)) aggiunti.push({ ...elementoAModello(e, vista === "fatto" ? "esistente" : "nuovo"), localeId: l.id });
      }
      esito.saltati.forEach(e => saltati.add(e));
    }
    if (!aggiunti.length) {
      setMessaggio(saltati.size ? "Spazio insufficiente per gli arredi proposti." : "Gli arredi proposti sono già presenti.");
      return;
    }
    modificaStato(s => ({ ...s, elementi: [...s.elementi, ...aggiunti] }));
    setPosa(null);
    setMessaggio(saltati.size ? "Aggiunti " + aggiunti.length + " arredi. Da posizionare " + [...saltati].join(", ") + "." : "Arredi posizionati negli ambienti selezionati.");
  };

  const salva = async (restaNelVisore: boolean) => {
    if (anteprimaAttiva) return;
    if (!bozza) return versione;
    if (!puoScrivere || occupato.current) return;
    occupato.current = true;
    try {
      const numero = await salvataggio.mutateAsync({ planimetriaId, versioneAttesa: versione, documento: bozza, nota: "Finiture, infissi e arredi dal 3D" });
      onBozza(null);
      if (restaNelVisore) {
        toast.success("Modifiche 3D salvate");
        onSalvata(locale?.id ?? "");
      }
      return numero;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modifiche 3D non salvate.");
    } finally { occupato.current = false; }
  };

  const preparaRender = async (inquadratura: InquadraturaVista3D) => {
    if (!inquadratura.localeId) return;
    const numero = await salva(false);
    if (!numero) return;
    navigate(percorsiPlanimetrie.renderStanza(planimetriaId, inquadratura.localeId, {
      livelloId: livello.id, ambito: ambitoGeometria, materialiAmbito: ambito, versione: numero, torna,
    }), { state: { inquadratura3D: inquadratura } });
  };

  const mostraPannello = !inVisita && !vistaAmpia && !rapideAperte;
  const azioniBozza = puoScrivere && <div className="flex flex-wrap items-center justify-end gap-2">
    {ultimaRapida && bozza === ultimaRapida.dopo && !anteprimaAttiva && <Button type="button" variant="ghost" size="sm" className="mr-auto gap-1.5"
      disabled={salvataggio.isPending} onClick={() => {
        onBozza(ultimaRapida.prima);
        setUltimaRapida(undefined);
        setStatoRapido("Ultima modifica annullata.");
      }}><Undo2 className="size-4" />Annulla ultima modifica</Button>}
    {bozza && <Button variant="ghost" size="sm" disabled={salvataggio.isPending || anteprimaAttiva} onClick={() => {
      onBozza(null);
      setUltimaRapida(undefined);
      scegliModificaRapida(null);
      setSelezionato("");
      setPosa(null);
      setMessaggio("");
    }}>Annulla modifiche</Button>}
    <Button size="sm" className="gap-1.5" variant={rapideAperte ? "outline" : "default"}
      disabled={!bozza || salvataggio.isPending || anteprimaAttiva} onClick={() => void salva(true)}>
      <Save className="h-4 w-4" />{salvataggio.isPending ? "Salvataggio…" : "Salva modifiche"}
    </Button>
  </div>;
  return <div className={cn("grid items-start gap-4 p-3 sm:p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150",
    (mostraPannello || rapideAperte) && "xl:grid-cols-[minmax(0,1fr)_340px]")}
    onKeyDown={e => { if (e.key === "Escape" && posa) { setPosa(null); setMessaggio(""); } }}>
    <div ref={areaVisore} className="min-w-0 space-y-3 scroll-mt-20">
      <Vista3DPigra ref={visore} piante={piante} piani={piani} livelloIniziale={livello.id} versione={bozza || anteprimaAttiva ? undefined : versione}
        archivioRender={bozza || anteprimaAttiva ? undefined : { planimetriaId, ambito, versione }}
        archivioInquadrature={{ planimetriaId, livelloId: livello.id }}
        vistaEdificioIniziale={ambito === "fatto" ? "fatto" : "progetto"}
        nomeFile={titolo} vistaIniziale={vistaVisore} modoIniziale={localeIniziale ? "dentro" : "giro"} esplosoIniziale={esplosoIniziale}
        onVediInPianta={onVediInPianta} onVisita={onVisita}
        studio={{ localeId: locale?.id ?? "", onLocale: cambiaLocale, onSelezione: selezionaScena, selezionato, istruzione,
          rapide: puoScrivere ? { aperte: rapideAperte, onCambia: mostraRapide } : undefined,
          vistaAmpia, onVistaAmpia: () => { setVistaAmpia(v => !v); setPosa(null); setMessaggio(""); },
          posa: daPosare && locale ? { tipo: daPosare.tipo, ...misureArredo(daPosare), rotazione: daPosare.rotazione, verifica: punto => {
            const e = { ...daPosare, posizione: punto };
            return !ingombroDentroLocale(e, locale.contorno) ? "fuori" : ingombroVicino(e) ? "vicino" : "libero";
          } } : undefined,
          onRender: preparaRender,
          renderLabel: bozza ? "Salva e prepara il render" : "Usa questa vista per il render", renderDisabilitato: salvataggio.isPending || anteprimaAttiva }} />
      {!verifica.ok && <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><ScanLine className="h-3.5 w-3.5" />Anteprima con misure da verificare. <button type="button" onClick={onVerifica} className="font-semibold text-primary underline-offset-2 hover:underline">Verifica la tavola</button></p>}
    </div>
    {rapideAperte && <div ref={areaRapide} className="min-w-0 scroll-mt-3"><ModificheRapide3D documento={attuale} ambito={ambito} livelloId={pianoRapido}
      onLivello={id => { setPianoRapido(id); setPrima(false); if (modificaRapida?.tipo === "arredo") scegliModificaRapida(null); }}
      modifica={modificaRapida} onModifica={scegliModificaRapida} anteprima={anteprimaRapida} prima={prima} onPrima={setPrima}
      onApplica={applicaModificaRapida} onChiudi={() => mostraRapide(false)} stato={statoRapido} occupato={salvataggio.isPending} azioniBozza={azioniBozza} /></div>}
    <aside aria-label="Materiali e arredi del 3D" hidden={!mostraPannello} className="min-w-0 rounded-xl border bg-card shadow-sm xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto">
      <div className="space-y-2 border-b px-3.5 py-3">
        <label htmlFor="ambiente-studio-3d" className="text-xs font-medium text-muted-foreground">Ambiente</label>
        <UniformSelect id="ambiente-studio-3d" value={locale?.id ?? ""} onChange={e => cambiaLocale(e.target.value)} className="h-9 w-full">
          {!stato.locali.length && <option value="">Nessuna stanza</option>}
          {stato.locali.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </UniformSelect>
        {puoModificareStanza && stanzeInterne.length > 1 && <div className="space-y-2 pt-1">
          <div role="group" aria-label="Applica modifiche a" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <Button variant={piuStanze ? "ghost" : "outline"} size="sm" className="h-8 px-2 text-xs" aria-pressed={!piuStanze} onClick={() => setPiuStanze(false)}>Questa stanza</Button>
            <Button variant={piuStanze ? "outline" : "ghost"} size="sm" className="h-8 gap-1 px-2 text-xs" aria-pressed={piuStanze} onClick={() => {
              if (!selezioneStanze.length && locale && eAmbienteInterno(locale)) setSelezioneStanze([locale.id]);
              setPiuStanze(true);
            }}><Layers2 className="h-3.5 w-3.5" />Più stanze</Button>
          </div>
          {piuStanze && <fieldset className="space-y-1.5 rounded-lg border p-2">
            <legend className="sr-only">Stanze del piano da modificare</legend>
            <div className="flex items-center justify-between gap-2">
              <span role="status" className="text-xs font-medium">{stanze.length} {stanze.length === 1 ? "stanza selezionata" : "stanze selezionate"}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelezioneStanze(tutteSelezionate ? [] : stanzeInterne.map(l => l.id))}>
                {tutteSelezionate ? "Deseleziona tutte" : "Seleziona tutte"}
              </Button>
            </div>
            <div className="max-h-32 space-y-1 overflow-auto pr-1">
              {stanzeInterne.map(l => <label key={l.id} className="flex min-h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-xs hover:bg-muted">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={selezioneStanze.includes(l.id)} onChange={e => {
                  const checked = e.currentTarget.checked;
                  setSelezioneStanze(ids => checked ? [...ids, l.id] : ids.filter(id => id !== l.id));
                }} />
                <span>{l.nome}</span>
              </label>)}
            </div>
          </fieldset>}
        </div>}
      </div>
      <Tabs value={pannello} onValueChange={v => { onPannello(v as PannelloInterni3D); setSelezionato(""); setPosa(null); setMessaggio(""); }} className="px-3.5 py-3">
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="superfici" className="gap-1 px-1.5 py-1.5 text-xs"><PaintRoller className="h-3.5 w-3.5" />Superfici</TabsTrigger>
          <TabsTrigger value="infissi" className="gap-1 px-1.5 py-1.5 text-xs"><DoorOpen className="h-3.5 w-3.5" />Infissi</TabsTrigger>
          <TabsTrigger value="arredi" className="gap-1 px-1.5 py-1.5 text-xs"><Armchair className="h-3.5 w-3.5" />Arredi</TabsTrigger>
        </TabsList>
        <TabsContent value="superfici" className="mt-3 space-y-3">
          {locale ? <fieldset disabled={!puoModificareStanza || !stanze.length} className="space-y-2 disabled:opacity-65">
            <label className="block text-xs font-medium">Superficie
              <UniformSelect className="mt-1 h-8 w-full" value={superficie} onChange={e => setSuperficie(e.target.value as Superficie)}>
                {Object.entries(SUPERFICI).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </UniformSelect>
            </label>
            {finitureDiverse && <p className="text-xs text-muted-foreground">Le stanze selezionate hanno finiture diverse.</p>}
            <div className="grid grid-cols-2 gap-2">
              {campioni.map(c => <CampioneSuperficie key={c.id} campione={c} attivo={c.id === campioneAttuale?.id} onClick={() => scegliFinitura(c.descrizione)} />)}
            </div>
            {superficie === "pavimento" && <label className="flex items-center justify-between gap-2 text-xs">Posa
              <UniformSelect aria-label="Posa del pavimento" className="h-8 w-36" value={posaComune ?? ""}
                onChange={e => { const posa = e.target.value as PosaPavimento; modificaFiniture(f => ({ ...f, posaPavimento: posa === "dritta" ? undefined : posa })); }}>
                {!posaComune && <option value="">Mista</option>}
                <option value="dritta">Dritta</option>
                <option value="traversa">Di traverso</option>
                <option value="diagonale">In diagonale</option>
              </UniformSelect>
            </label>}
            {(superficie === "pareti" || superficie === "soffitto") && <label className="flex items-center justify-between gap-2 text-xs">Colore personalizzato
              <input type="color" aria-label={"Colore personalizzato " + SUPERFICI[superficie].toLowerCase()} value={valore && /^#[a-f0-9]{6}$/i.test(valore) ? valore : campioneAttuale?.colore ?? "#f5f1e9"}
                onInput={e => scegliFinitura(e.currentTarget.value)} onChange={e => scegliFinitura(e.currentTarget.value)}
                className="h-8 w-12 cursor-pointer rounded border bg-background p-0.5" />
            </label>}
            {superficie === "rivestimento" && altezze.length > 0 && <label className="flex items-center justify-between gap-2 text-xs">Altezza rivestimento (cm)
              <Input key={stanze.map(l => l.id).join(",") + ":" + altezze.join(",")} aria-label="Altezza rivestimento" type="number" min={1} max={Math.max(...stanze.map(l => l.altezza))} defaultValue={altezzaComune} placeholder="Mista" className="h-8 w-20"
                onBlur={e => {
                  const n = Number(e.currentTarget.value);
                  if (n > 0 && n !== altezzaComune) modificaFiniture((f, l) => f.rivestimento ? { ...f, rivestimento: { ...f.rivestimento, altezza: Math.min(n, l.altezza) } } : f);
                }} />
            </label>}
            {valori.some(Boolean) && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => scegliFinitura()}>{superficie === "pavimento" ? "Usa pavimento comune" : "Ripristina finitura di base"}</Button>}
          </fieldset> : <p className="text-xs text-muted-foreground">Seleziona una stanza per scegliere le finiture.</p>}
        </TabsContent>
        <TabsContent value="infissi" className="mt-3 space-y-3">
          <fieldset disabled={!sceltaModificabile} className="space-y-3 disabled:opacity-65">
            <label className="block text-xs font-medium">Profilo dei serramenti del progetto
              <UniformSelect value={infissi?.profilo ?? ""} onChange={e => modificaInfissi(e.target.value ? { profilo: e.target.value as InfissiProgetto["profilo"], colore: infissi?.colore ?? "antracite" } : undefined)} className="mt-1 h-9 w-full">
                <option value="">Profilo del modello</option>
                {Object.entries(PROFILI_PROGETTO).map(([id,nome]) => <option key={id} value={id}>{nome}</option>)}
              </UniformSelect>
            </label>
            <div>
              <p className="mb-1.5 text-xs font-medium">Finitura del profilo</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(COLORI_INFISSI_PROGETTO).map(([id,c]) => <button key={id} type="button" title={c.nome} aria-label={c.nome} aria-pressed={infissi?.colore === id} onClick={() => modificaInfissi({ profilo: infissi?.profilo ?? "alluminio", colore: id as InfissiProgetto["colore"] })}
                  className={cn("h-8 w-8 rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", infissi?.colore === id && "ring-2 ring-primary ring-offset-2")} style={{ backgroundColor: c.hex }} />)}
              </div>
            </div>
          </fieldset>
          <p className="text-xs leading-relaxed text-muted-foreground">Il profilo scelto si applica a finestre e portefinestre di questa variante.</p>
          {serramenti.length > 0 && <div className="space-y-2 border-t pt-3">
            <label className="block text-xs font-medium">Serramento nell’ambiente
              <UniformSelect value={serramenti.some(s => s.id === selezionato) ? selezionato : ""} onChange={e => setSelezionato(e.target.value)} className="mt-1 h-9 w-full">
                <option value="">Scegli un serramento</option>
                {serramenti.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </UniformSelect>
            </label>
            {apertura && <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
              <span>{apertura.larghezza} × {apertura.altezza} cm</span>
              <label className="flex items-center gap-2">Ante
                <UniformSelect aria-label="Ante del serramento" className="h-8" disabled={!puoModificareStanza} value={anteDi(apertura)}
                  onChange={e => modificaStato(s => ({ ...s, aperture: s.aperture.map(a => a.id === apertura.id ? { ...a, ante: Number(e.target.value) } : a) }))}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </UniformSelect>
              </label>
            </div>}
          </div>}
        </TabsContent>
        <TabsContent value="arredi" className="mt-3 space-y-3">
          <label className="block text-xs font-medium">Arredi nell’ambiente ({elementi.length})
            <UniformSelect value={elemento?.id ?? ""} onChange={e => selezionaArredo(e.target.value)} className="mt-1 h-9 w-full">
              <option value="">{elementi.length ? "Seleziona arredo" : "Nessun arredo"}</option>
              {elementi.map((e, i) => <option key={e.id} value={e.id}>{i + 1}. {e.etichetta?.trim() || modelloArredo(e.tipo, e.modello)?.nome || nomeDelTipo(e.tipo)}</option>)}
            </UniformSelect>
          </label>
          {elemento && puoModificareStanza && <Button variant="ghost" size="sm" className="w-full gap-1.5 border"
            aria-expanded={mostraCatalogo} onClick={() => { setAggiungiArredo(v => !v); setPosa(null); setMessaggio(""); }}>
            {!mostraCatalogo && <Plus className="size-3.5" />}
            {mostraCatalogo ? "Torna all’arredo" : "Aggiungi un arredo"}
          </Button>}
          {mostraCatalogo && <fieldset className="space-y-2 disabled:opacity-65" disabled={!puoModificareStanza || !locale}>
            <CatalogoArredi3D key={locale?.id} destinazione={locale?.destinazione ?? ""} tipo={tipo}
              onScegli={id => {
                if (id === tipo) return;
                setTipo(id); setModelloNuovo(ARREDI.find(v => v.tipo === id)?.modello); setMisureNuove(null); setRotazioneNuova(0); setPosa(null); setMessaggio("");
              }} />
            {catalogo && testoNuovo && <div className="space-y-2 border-t pt-2">
              <div className="flex items-center gap-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><MiniaturaArredo voce={{ ...catalogo, ...nuove }} /></span>
                <p className="min-w-0 flex-1 text-xs font-semibold">{catalogo.nome}</p>
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" aria-label={`Ruota arredo di 90 gradi. Rotazione attuale ${rotazioneNuova} gradi`}
                  onClick={() => { setRotazioneNuova(r => (r + 90) % 360); setMessaggio(""); }}><RotateCw className="size-3.5" />{rotazioneNuova}°</Button>
              </div>
              <SceltaModello tipo={tipo} valore={modelloNuovo} label="Modello da inserire" onChange={id => {
                setModelloNuovo(id);
                const taglia = modelloArredo(tipo, id)?.misure;
                if (taglia) setMisureNuove(testoMisureArredo(taglia));
              }} />
              <MisureArredo3D tipo={tipo} valore={testoNuovo} onChange={v => { setMisureNuove(v); setMessaggio(""); }} />
              {posa !== "aggiungi" && <Button className="w-full gap-1.5" size="sm" disabled={!nuove} onClick={() => avviaPosa("aggiungi")}>
                <Plus className="size-3.5" />Posiziona in 3D
              </Button>}
            </div>}
            {stanze.some(l => destinazioneArredabile(l.destinazione)) && <Button size="sm" variant={catalogo ? "ghost" : "outline"} className="w-full" onClick={suggerisciArredi}>
              {piuStanze ? "Arreda le stanze selezionate" : "Proponi arredi"}
            </Button>}
          </fieldset>}
          {elemento && !mostraCatalogo && <>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-card"><MiniaturaArredo voce={elemento}/></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{elemento.etichetta?.trim() || modelloArredo(elemento.tipo, elemento.modello)?.nome || nomeElemento}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{baseInCm(elemento)}</p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => {
                setPosa(null); setMessaggio("");
                visore.current?.inquadraArredo(elemento.id);
              }}><Focus className="h-3.5 w-3.5" />Inquadra</Button>
            </div>
            <fieldset disabled={!puoModificareStanza} className="flex flex-wrap gap-1.5">
              <ModificaMisure key={`${elemento.id}:${Object.values(misureArredo(elemento)).join(":")}`} elemento={elemento}
                onApplica={e => locale && aggiornaElemento(e, locale, "Misure aggiornate.")} />
              {!posa && <Button variant="outline" size="sm" onClick={() => avviaPosa("sposta")}>Sposta</Button>}
              <Button variant="outline" size="sm" disabled={!!posa} className="gap-1" onClick={() => locale && aggiornaElemento({ ...elemento, rotazione: (elemento.rotazione + 90) % 360 }, locale)}><RotateCw className="h-3.5 w-3.5" />Ruota</Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label={"Rimuovi " + nomeElemento} onClick={() => {
                modificaStato(s => ({ ...s, elementi: s.elementi.flatMap(e => e.id !== elemento.id ? [e] : propostaId && e.stato !== "nuovo" ? [{ ...e, stato: "da_demolire" as const }] : []) }));
                selezionaArredo("");
              }}><Trash2 className="h-4 w-4" /></Button>
            {piuStanze && <p className="w-full text-xs text-muted-foreground">{arrediDaAggiornare.size
              ? `Modello e colore si applicano a ${arrediDaAggiornare.size} ${arrediDaAggiornare.size === 1 ? "arredo" : "arredi"} dello stesso tipo.`
              : "Seleziona almeno una stanza con questo tipo di arredo per applicare modello e colore."}</p>}
            {!!arrediDaAggiornare.size && <div className="mt-1 w-full space-y-1.5 border-t pt-2.5">
              <SceltaModello tipo={elemento.tipo} valore={modelliDiversi ? undefined : primoArredo?.modello} misto={modelliDiversi} label="Modello dell’arredo" onChange={modello => modificaAspettoArredo({ modello })} />
              <p className="text-xs font-medium">Colore arredo</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {COLORI_ARREDO.map(c => <button key={c.hex} type="button" title={c.nome} aria-label={"Colore arredo " + c.nome}
                  aria-pressed={statoColore === c.hex} onClick={() => modificaAspettoArredo({ colore: c.hex })}
                  className={cn("h-7 w-7 rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", statoColore === c.hex && "ring-2 ring-primary ring-offset-1")}
                  style={{ backgroundColor: c.hex }} />)}
                <input type="color" aria-label={"Colore di " + nomeElemento} value={statoColore ?? "#d4c4af"}
                  onInput={e => modificaAspettoArredo({ colore: e.currentTarget.value })} onChange={e => modificaAspettoArredo({ colore: e.currentTarget.value })}
                  className="h-7 w-9 cursor-pointer rounded border bg-background p-0.5" />
              </div>
              {oggettiConLoStessoTipo.some(e => e.colore) && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => modificaAspettoArredo({ colore: undefined })}>Colore di base</Button>}
            </div>}
            </fieldset>
          </>}
          {posa && <Button size="sm" variant="outline" className="w-full" onClick={() => { setPosa(null); setMessaggio(""); }}>Annulla posizionamento</Button>}
          {messaggio && <p role="status" className="text-xs text-muted-foreground">{messaggio}</p>}
        </TabsContent>
      </Tabs>
      {puoScrivere && <div className="sticky bottom-0 z-10 rounded-b-xl border-t bg-card px-3.5 py-3">{!rapideAperte && azioniBozza}</div>}
    </aside>
  </div>;
}
