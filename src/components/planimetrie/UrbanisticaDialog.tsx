import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, FileText, LibraryBig, LocateFixed, MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import {
  apriElaboratoUrbanistico, caricaElaboratoUrbanistico, comuneNelRegistro, corrispondeNomeComune,
  eliminaElaboratiNonSalvati, fontiNelRegistro, oggiUrbanistica, REGIONI_URBANISTICA,
  ROMA_ISTAT, suggerisciComuniUrbanistica,
} from "@/lib/planimetrie/fontiUrbanistiche";
import { cercaCartografiaUrbanistica, cercaParticelleLombardia, riferimentiCatastali, type PosizioneParticella } from "@/lib/planimetrie/cartografiaUrbanistica";
import { riferimentoCatastale } from "@/lib/planimetrie/riferimentiUrbanistici";
import { INTERVENTO_INIZIALE, quadroIntervento } from "@/lib/planimetrie/verificaIntervento";
import { forwardGeocode } from "@/lib/geocoding";
import { cercaRegoleNellEstratto } from "@/lib/planimetrie/assistenzaStudio";
import { PratichePlanimetria } from "./PratichePlanimetria";
import { RiscontriTecnici } from "./RiscontriTecnici";
import { EsodoFascicolo } from "./EsodoFascicolo";
import { ConfrontoTavoleFascicolo } from "./ConfrontoTavoleFascicolo";
import { CampoUrbanistico as Campo, EsitoInterventoUrbanistico, FonteLink, RiscontriCartografici, SceltaInterventoUrbanistico } from "./InterventoUrbanistico";
import type { RequisitoDaEstratto } from "../../../shared/planimetrie/assistenzaStudio.ts";
import { ambitiDi, DESTINAZIONI, type Destinazione, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import {
  coordinateImmobile, CRITERI_FINESTRE, CRITERI_SUPERFICIE, DATI_URBANISTICI, esitiInquadramento, METODO_VERIFICA_URBANISTICA, nuovoFascicoloUrbanistico,
  RUOLI_TAVOLA, urbanisticaValida, urlFonteUrbanistica, valutaUrbanistica, valutazionePerVariante, type DatiUrbanistici, type FonteUrbanistica, type RuoloTavola,
  type CriterioFinestre, type CriterioSuperficie, type MetricaUrbanistica, type OriginePosizioneUrbanistica, type ParticellaIndividuata, type RegolaUrbanistica, type TipoFonteUrbanistica,
} from "../../../shared/planimetrie/urbanistica.ts";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const MappaImmobile = lazy(() => import("./MappaImmobile"));
const TIPO_FONTE: Record<TipoFonteUrbanistica,string> = { norme:"Norme o regolamento", tavola:"Tavola o planimetria", bollettino:"Avviso sul bollettino", archivio:"Altra fonte", relazione:"Relazione tecnica o schema" };
const STATO_ATTO: Record<FonteUrbanistica["stato"],string> = { da_verificare:"Da verificare", adottato:"Adottato", efficace:"Efficace", superato:"Superato" };
const nuovaFonte = () => ({ titolo:"", ente:"", url:"", tipo:"norme" as TipoFonteUrbanistica, stato:"da_verificare" as FonteUrbanistica["stato"], versione:"", efficaceDal:"", pubblicazione:"", ruoloTavola:"" as RuoloTavola | "" });
const nuovaRegola = () => ({ metrica:"superficie" as MetricaUrbanistica, fonteId:"", riferimento:"", condizione:"", soglia:"", estratto:"", confermata:false,
  criterioSuperficie:"abitativa" as CriterioSuperficie, criterioFinestre:"apribile" as CriterioFinestre, destinazione:"" as "" | Destinazione, aperturaId:"" });
const MISURA_MINIMA: Partial<Record<MetricaUrbanistica,string>> = {
  superficie:"Soglia minima (m²)", altezza:"Altezza minima (m)", accessi:"Luce netta minima (cm)", finestre:"Rapporto minimo (%)",
};

export function UrbanisticaDialog({ documento, planimetriaId, companyId, versione, varianteIniziale, livelloIniziale, solaLettura, apriPratiche, apriVerifiche, apriTavole, apriEsodo, riscontroIniziale, unita, onVersioneCorrente, onChiudi }: {
  documento: Planimetria; planimetriaId: string; companyId: string; versione: number; varianteIniziale?: string; solaLettura: boolean;
  apriPratiche?: boolean; apriVerifiche?: boolean; apriTavole?: boolean; apriEsodo?: boolean; livelloIniziale?: string; unita?: string; onVersioneCorrente?: () => void; onChiudi: () => void;
  riscontroIniziale?: "elettrico" | "scarichi";
}) {
  const t = useT();
  const uid = useId();
  const [dati,setDati] = useState<DatiUrbanistici>(() => {
    const d = documento.urbanistica ?? nuovoFascicoloUrbanistico();
    const comune = comuneNelRegistro(d.codiceIstat);
    return { ...d, regione: comune?.regione ?? d.regione,
      intervento: d.intervento ?? INTERVENTO_INIZIALE, originePosizione: d.originePosizione ?? (d.foglio && d.particella && !d.indirizzo ? "catasto" : "indirizzo") };
  });
  const [lat,setLat] = useState(() => dati.posizione ? String(dati.posizione.lat) : "");
  const [lng,setLng] = useState(() => dati.posizione ? String(dati.posizione.lng) : "");
  const [cercaComuneAperta,setCercaComuneAperta] = useState(false);
  const [testoComune,setTestoComune] = useState("");
  const [tab,setTab] = useState(apriEsodo ? "esodo" : apriPratiche ? "pratiche" : apriVerifiche ? "verifiche" : apriTavole ? "atti" : "immobile");
  const pannello = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pannello.current) pannello.current.scrollTop = 0; }, [tab]);
  const [particelle, setParticelle] = useState<PosizioneParticella[]>([]);
  const [mappaCatastale, setMappaCatastale] = useState(false);
  const [fonte,setFonte] = useState(nuovaFonte);
  const [fonteId,setFonteId] = useState<string>();
  const [file,setFile] = useState<File>();
  const [regola,setRegola] = useState(nuovaRegola);
  const [regolaId,setRegolaId] = useState<string>();
  const [testoFonte,setTestoFonte] = useState("");
  const [proposteNorma,setProposteNorma] = useState<RequisitoDaEstratto[]>([]);
  const [variante,setVariante] = useState(varianteIniziale ?? ambitiDi(documento).find(a => a.propostaId)?.propostaId ?? "");
  const [nota,setNota] = useState(() => valutazionePerVariante(dati,variante)?.notaTecnico ?? "");
  const [azione,setAzione] = useState("");
  const [errore,setErrore] = useState("");
  const varianti = useMemo(() => ambitiDi(documento).filter(v=>v.propostaId), [documento]);
  const aggiunti = useRef(new Set<string>());
  const inCorso = useRef(false);
  const salvaVersione = useSalvaVersionePlanimetria();
  const oggi = oggiUrbanistica();
  const stati = esitiInquadramento(dati,oggi);
  const storico = valutazionePerVariante(dati,variante);
  const regoleIntervento = dati.regole.filter(r=>!r.intervento || r.intervento === dati.intervento?.tipo);
  const esiti = useMemo(() => solaLettura && storico?.versione===versione && storico.metodo===METODO_VERIFICA_URBANISTICA ? storico.esiti
    : variante ? valutaUrbanistica(documento,variante,dati,solaLettura && storico?.versione===versione ? storico.data : oggi) : [],
  [solaLettura, storico, variante, documento, dati, oggi, versione]);
  const statiVariante = useMemo(()=>documento.livelli.map(piano=>({piano,stato:piano.proposte.find(v=>v.id===variante) ?? piano.fatto})),[documento,variante]);
  const quadro = useMemo(() => quadroIntervento(documento, variante, dati, esiti, oggi), [documento, variante, dati, esiti, oggi]);
  const daCatasto = dati.originePosizione === "catasto";
  const ricercaCatastale = dati.regione === "Lombardia";
  const ricercaCartografica = ricercaCatastale || dati.codiceIstat === ROMA_ISTAT;
  const comuneSelezionato = comuneNelRegistro(dati.codiceIstat);
  const catasto = riferimentoCatastale(dati.codiceIstat);
  const suggerimenti = useMemo(() => cercaComuneAperta ? suggerisciComuniUrbanistica(testoComune) : [], [cercaComuneAperta, testoComune]);
  const apriFonti = () => setTab("atti");
  const posiziona = (a: string, b: string, particellaIndividuata?: ParticellaIndividuata) => {
    setLat(a); setLng(b); setErrore("");
    const x = +a.replace(",","."), y = +b.replace(",",".");
    const posizione = a.trim() && b.trim() && coordinateImmobile(x,y) ? {lat:x,lng:y,confermata:false} : undefined;
    setDati(d=>({...d,posizione,particellaIndividuata,cartografia:undefined,zona:"",fonteZona:"",riferimentoZona:"",regole:d.regole.map(r=>({...r,confermata:false}))}));
  };
  const cambioComune = (modifica: Partial<Pick<DatiUrbanistici,"regione"|"comune"|"codiceIstat">>) => {
    posiziona("","");
    setDati(d=>({...d,indirizzo:"",foglio:"",particella:"",sezioneCatastale:"",...modifica,fonti:[],regole:[],attiDiscordanti:false}));
    setParticelle([]); setMappaCatastale(false);
    setFonte(nuovaFonte()); setFonteId(undefined); setFile(undefined); setRegola(nuovaRegola()); setRegolaId(undefined);
  };
  const cambiaIndirizzo = (modifica: Partial<Pick<DatiUrbanistici,"indirizzo"|"foglio"|"particella"|"sezioneCatastale">>) => {
    posiziona("","");
    setParticelle([]);
    setDati(d=>({...d,...modifica}));
  };
  const cambiaOrigine = (originePosizione: OriginePosizioneUrbanistica) => {
    if (originePosizione === dati.originePosizione) return;
    posiziona("","");
    setParticelle([]);
    setDati(d=>({...d,originePosizione}));
  };
  const esegui = async (nome: string, fn: () => Promise<void>) => {
    if (inCorso.current) return;
    inCorso.current = true;
    setAzione(nome); setErrore("");
    try { await fn(); }
    catch (e) { setErrore(e instanceof Error ? e.message : t("Operazione non riuscita.")); }
    finally { inCorso.current = false; setAzione(""); }
  };
  const chiudi = () => {
    if (inCorso.current) return;
    void eliminaElaboratiNonSalvati([...aggiunti.current]).catch((): void=>{});
    onChiudi();
  };
  const riconosciIndirizzo = () => esegui("indirizzo",async()=>{
    const p = await forwardGeocode(`${dati.indirizzo.trim()}, ${dati.comune.trim()}, Italia`);
    if (!p) throw new Error(t("Indirizzo non trovato. Inserisci le coordinate e controlla il punto."));
    posiziona(p.lat.toFixed(6),p.lng.toFixed(6));
  });
  const adottaParticella = (p: PosizioneParticella) => {
    const { lat: x, lng: y, ...fonte } = p;
    setParticelle([]);
    posiziona(x.toFixed(7), y.toFixed(7), fonte);
  };
  const cercaParticella = () => esegui("catasto", async () => {
    setParticelle([]);
    const candidati = await cercaParticelleLombardia(dati.codiceIstat, { foglio: dati.foglio, particella: dati.particella, sezione: dati.sezioneCatastale });
    if (!candidati.length) throw new Error(t("Particella da riscontrare. Controlla la sezione nella visura oppure individua il punto nel Geoportale catastale."));
    if (candidati.length === 1) adottaParticella(candidati[0]);
    else setParticelle(candidati);
  });
  const cerca = () => esegui("fonti",async()=>{
    if (!dati.comune.trim() || !/^\d{6}$/.test(dati.codiceIstat)) throw new Error(t("Indica il Comune e il suo codice ISTAT a sei cifre."));
    const noto = comuneNelRegistro(dati.codiceIstat);
    if (noto && (!corrispondeNomeComune(noto, dati.comune) || dati.regione !== noto.regione)) {
      throw new Error(t("Il codice {codice} identifica {comune}, {regione}. Correggi Comune o codice.", { codice: dati.codiceIstat, comune: noto.comune, regione: noto.regione }));
    }
    if (daCatasto) riferimentiCatastali({ foglio: dati.foglio, particella: dati.particella, sezione: dati.sezioneCatastale });
    setTab("verifiche");
    if (ricercaCartografica && dati.posizione?.confermata) {
      setDati(d=>({...d,cartografia:undefined}));
      const cartografia = await cercaCartografiaUrbanistica(dati.posizione,dati.codiceIstat,dati.regione,dati.comune);
      setDati(d=>({...d,cartografia}));
    }
  });
  const registraFonte = () => esegui("allegato",async()=>{
    if (!fonte.titolo.trim() || !fonte.ente.trim()) throw new Error(t("Inserisci titolo ed ente della fonte."));
    if (!fonteId && dati.fonti.length>=40) throw new Error(t("Puoi collegare fino a 40 fonti a questa versione."));
    const precedente = dati.fonti.find(f=>f.id===fonteId);
    const url = fonte.url.trim();
    if ((url && !urlFonteUrbanistica(url)) || (!url && !file && !precedente?.allegato)) throw new Error(t("Aggiungi un link HTTPS o il PDF dell’elaborato."));
    const pub = fonte.pubblicazione.trim();
    if (pub && !urlFonteUrbanistica(pub)) throw new Error(t("Inserisci un link HTTPS all’avviso ufficiale."));
    if (fonte.stato === "efficace" && (!fonte.efficaceDal || !pub || !fonte.versione.trim())) {
      throw new Error(t("Per registrare l’efficacia indica la data, la revisione dell’atto e l’avviso ufficiale."));
    }
    const allegato = file ? await caricaElaboratoUrbanistico(companyId,planimetriaId,file) : precedente?.allegato;
    if (file && allegato) aggiunti.current.add(allegato.percorso);
    const ruoloTavola = fonte.tipo==="tavola" && fonte.ruoloTavola || undefined;
    const f: FonteUrbanistica = { id:fonteId ?? crypto.randomUUID(), tipo:fonte.tipo, stato:fonte.stato, titolo:fonte.titolo.trim(),
      ente:fonte.ente.trim(), acquisitaIl:oggi, ...(url ? {url} : {}), ...(allegato ? {allegato} : {}),
      ...(fonte.versione.trim() ? {versione:fonte.versione.trim()} : {}), ...(fonte.efficaceDal ? {efficaceDal:fonte.efficaceDal} : {}), ...(pub ? {pubblicazione:pub} : {}),
      ...(ruoloTavola ? {ruoloTavola, ...(!file && precedente?.inquadramento ? {inquadramento:precedente.inquadramento} : {})} : {}),
    };
    setDati(d=>({...d,fonti:[...d.fonti.filter(x=>x.id!==f.id),f],regole:d.regole.map(r=>r.fonteId===f.id ? {...r,confermata:false} : r)}));
    setFonte(nuovaFonte()); setFonteId(undefined); setFile(undefined);
  });
  const modificaFonte = (f: FonteUrbanistica) => {
    setFonte({ titolo:f.titolo, ente:f.ente, url:f.url ?? "", tipo:f.tipo, stato:f.stato, versione:f.versione ?? "", efficaceDal:f.efficaceDal ?? "", pubblicazione:f.pubblicazione ?? "", ruoloTavola:f.ruoloTavola ?? "" });
    setFonteId(f.id); setFile(undefined); setErrore("");
  };
  const registraRegola = () => {
    if (!regola.condizione.trim()) return setErrore(t("Descrivi il requisito da controllare."));
    if (!regolaId && dati.regole.length>=40) return setErrore(t("Puoi registrare fino a 40 regole a versione."));
    const soglia = Number(regola.soglia.replace(",","."));
    const numerica = !!MISURA_MINIMA[regola.metrica];
    if (numerica && regola.soglia.trim() && (!Number.isFinite(soglia) || soglia <= 0)) return setErrore(t("Indica una soglia maggiore di zero."));
    if (regola.confermata && (!regola.fonteId || !regola.riferimento.trim())) return setErrore(t("Indica la fonte e l’articolo prima di confermare la condizione."));
    const { soglia: _, criterioSuperficie, criterioFinestre, destinazione, aperturaId, ...resto } = regola;
    const precedente = dati.regole.find(r => r.id === regolaId);
    const r: RegolaUrbanistica = { ...resto, id:regolaId ?? crypto.randomUUID(), condizione:regola.condizione.trim(), ...(numerica && soglia > 0 ? {soglia} : {}),
      ...(regola.metrica==="superficie" ? {criterioSuperficie} : {}),
      ...(regola.metrica==="finestre" ? {criterioFinestre} : {}),
      ...(destinazione && (regola.metrica==="altezza" || regola.metrica==="finestre" || (regola.metrica==="superficie" && criterioSuperficie==="locale")) ? {destinazione} : {}),
      ...(aperturaId && regola.metrica==="accessi" ? {aperturaId} : {}),
      intervento: precedente ? precedente.intervento : dati.intervento?.tipo };
    setDati(d=>({...d,regole:[...d.regole.filter(x=>x.id!==r.id),r]}));
    setRegola(nuovaRegola()); setRegolaId(undefined); setErrore(""); setProposteNorma([]); setTestoFonte("");
  };
  const analizzaEstratto = () => esegui("regole",async()=>{
    const risposte = await cercaRegoleNellEstratto(companyId,testoFonte.trim());
    setProposteNorma(risposte);
    if (!risposte.length) throw new Error(t("Nessun requisito individuato nell’estratto. Puoi inserirlo a mano."));
  });
  const apriAllegato = (percorso: string) => esegui("apri",async()=>{
    const url = await apriElaboratoUrbanistico(companyId,planimetriaId,percorso);
    const link = document.createElement("a"); link.href=url; link.target="_blank"; link.rel="noreferrer"; link.click();
  });
  const salva = () => esegui("salva",async()=>{
    const nuovo = {...dati};
    if (variante) nuovo.valutazioni = [...dati.valutazioni.filter(v=>v!==storico),{
      data:oggi, varianteId:variante, intervento:dati.intervento?.tipo, versione:versione+1, metodo:METODO_VERIFICA_URBANISTICA, esiti, notaTecnico:nota.trim(),
    }];
    if (!urbanisticaValida(nuovo)) throw new Error(t("Controlla il codice ISTAT, le date e i riferimenti alle fonti."));
    await salvaVersione.mutateAsync({ planimetriaId, documento:{...documento,urbanistica:nuovo}, versioneAttesa:versione, nota:"Fascicolo urbanistico" });
    const usati = new Set(nuovo.fonti.map(f=>f.allegato?.percorso));
    void eliminaElaboratiNonSalvati([...aggiunti.current].filter(p=>!usati.has(p))).catch((): void=>{});
    aggiunti.current.clear();
    toast.success(t("Fascicolo urbanistico salvato"));
    onChiudi();
  });

  return <Dialog open onOpenChange={v=>{if(!v) chiudi();}}>
    <DialogContent className="flex max-h-[94dvh] flex-col overflow-hidden sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary"/>{tab==="esodo" ? t("Fascicolo della planimetria") : t("Regole urbanistiche")}</DialogTitle>
        <DialogDescription>{documento.titolo || t("Immobile")} {t("· Versione")} {versione} {solaLettura && ` ${t("· Consultazione")}`}</DialogDescription>
      </DialogHeader>
      {tab !== "esodo" && <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[["Documenti",stati.documenti],["Efficacia",stati.atti],["Inquadramento",stati.zona]].map(([titolo,stato])=><div key={titolo} className="rounded-lg border bg-muted/35 p-2.5">
          <dt className="text-xs text-muted-foreground">{t(String(titolo))}</dt><dd className="break-words text-sm font-medium">{stato}</dd>
        </div>)}
      </dl>}
      <Tabs ref={pannello} value={tab} onValueChange={setTab} className="min-h-0 overflow-y-auto pr-1">
        <TabsList className="sticky top-0 z-10 flex w-full justify-start overflow-x-auto sm:grid sm:grid-cols-5">
          <TabsTrigger value="immobile">{t("Immobile")}</TabsTrigger><TabsTrigger value="verifiche">{t("Verifiche")}</TabsTrigger>
          <TabsTrigger value="esodo">{t("Vie d’esodo")}</TabsTrigger><TabsTrigger value="atti">{t("Fonti e atti")}</TabsTrigger><TabsTrigger value="pratiche">{t("Pratiche")}</TabsTrigger>
        </TabsList>
        <TabsContent value="immobile">
          <fieldset disabled={solaLettura || !!azione} className="space-y-3">
            <SceltaInterventoUrbanistico intervento={dati.intervento} onModifica={intervento=>{
              if (intervento.tipo !== dati.intervento?.tipo) setNota(valutazionePerVariante({...dati,intervento},variante)?.notaTecnico ?? "");
              setDati(d=>({...d,intervento}));
            }} />
            <section className="space-y-3 rounded-xl border bg-card p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />{t("Individua l’immobile")}</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-[1_1_16rem] space-y-1.5">
                  <Label htmlFor={uid+"scelta-comune"}>{t("Comune")}</Label>
                  <Popover open={cercaComuneAperta} onOpenChange={aperta => {
                    setCercaComuneAperta(aperta);
                    if (aperta) setTestoComune("");
                  }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" id={uid+"scelta-comune"} className="w-full justify-between font-normal" disabled={solaLettura || !!azione}>
                        <span className="min-w-0 truncate">{dati.comune || t("Seleziona un Comune")}{comuneSelezionato && ` (${comuneSelezionato.provincia})`}</span>
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverPrimitive.Content align="start" sideOffset={4} className="z-50 w-[--radix-popover-trigger-width] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover shadow-md" aria-label={t("Ricerca Comuni italiani")}>
                      <Command shouldFilter={false} label={t("Cerca Comune")}>
                        <CommandInput value={testoComune} onValueChange={setTestoComune} placeholder={t("Nome, sigla, codice ISTAT o catastale")} aria-label={t("Cerca Comune")} />
                        <CommandList>
                          {suggerimenti.map(c=><CommandItem key={c.codiceIstat} value={c.codiceIstat} onSelect={()=>{
                            if (c.codiceIstat!==dati.codiceIstat || c.comune!==dati.comune || c.regione!==dati.regione) {
                              cambioComune({comune:c.comune,codiceIstat:c.codiceIstat,regione:c.regione});
                            }
                            setCercaComuneAperta(false);
                          }}><div className="min-w-0">
                            <p className="truncate font-medium">{c.comune} ({c.provincia})</p>
                            <p className="truncate text-xs text-muted-foreground">{t("{regione} · ISTAT {codiceIstat} · Catastale {codiceCatastale}", { regione: String(c.regione ?? ""), codiceIstat: String(c.codiceIstat ?? ""), codiceCatastale: String(c.codiceCatastale ?? "") })}</p>
                          </div>{c.codiceIstat===dati.codiceIstat && <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />}</CommandItem>)}
                          {!suggerimenti.length && <p className="px-3 py-4 text-sm text-muted-foreground">
                            {testoComune.trim().length < 2 ? t("Scrivi almeno due caratteri per cercare in tutta Italia.") : t("Nessun Comune trovato. Controlla il nome o il codice.")}
                          </p>}
                        </CommandList>
                      </Command>
                    </PopoverPrimitive.Content>
                  </Popover>
                </div>
                <Button type="button" variant="outline" onClick={apriFonti}><LibraryBig className="size-4" aria-hidden="true" />{t("Fonti del Comune")}</Button>
              </div>
              {!!dati.codiceIstat && <p className="text-xs text-muted-foreground">{dati.regione} · ISTAT {dati.codiceIstat}{comuneSelezionato?.codiceCatastale && " · " + t("Catastale {codice}", { codice: comuneSelezionato.codiceCatastale })}</p>}
              {!solaLettura && <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">{t("Inserisci i dati del Comune a mano")}</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Campo nome={t("Regione")}><UniformSelect value={dati.regione} onChange={e=>cambioComune({regione:e.target.value,comune:"",codiceIstat:""})}>
                    <option value="Altra regione">{t("Seleziona regione")}</option>{REGIONI_URBANISTICA.map(r=><option key={r}>{r}</option>)}
                  </UniformSelect></Campo>
                  <Campo nome={t("Nome del Comune")}><Input maxLength={240} value={dati.comune} onChange={e=>cambioComune({comune:e.target.value,codiceIstat:""})} /></Campo>
                  <Campo nome={t("Codice ISTAT del Comune")}><Input value={dati.codiceIstat} onChange={e=>{
                    const codiceIstat = e.target.value.replace(/\D/g,"").slice(0,6), noto = comuneNelRegistro(codiceIstat);
                    cambioComune(noto ? {codiceIstat,comune:noto.comune,regione:noto.regione} : {codiceIstat});
                  }} inputMode="numeric" placeholder={t("Es. 015146")} /></Campo>
                </div>
              </details>}
              <div role="group" aria-label={t("Metodo di ricerca dell’immobile")} className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
                <Button type="button" size="sm" variant="ghost" className="aria-pressed:bg-background aria-pressed:shadow-sm" aria-pressed={!daCatasto} onClick={()=>cambiaOrigine("indirizzo")}>{t("Da indirizzo")}</Button>
                <Button type="button" size="sm" variant="ghost" className="aria-pressed:bg-background aria-pressed:shadow-sm" aria-pressed={daCatasto} onClick={()=>cambiaOrigine("catasto")}>{t("Da foglio e particella")}</Button>
              </div>
              {daCatasto ? <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo nome={t("Foglio")}><Input inputMode="numeric" maxLength={6} value={dati.foglio} onChange={e=>cambiaIndirizzo({foglio:e.target.value})} /></Campo>
                  <Campo nome={t("Particella")}><Input maxLength={22} value={dati.particella} onChange={e=>cambiaIndirizzo({particella:e.target.value})} /></Campo>
                  <Campo nome={t("Sezione catastale (facoltativa)")}><Input maxLength={8} value={dati.sezioneCatastale ?? ""} onChange={e=>cambiaIndirizzo({sezioneCatastale:e.target.value})} /></Campo>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {ricercaCatastale && <Button type="button" variant="outline" disabled={!dati.foglio.trim() || !dati.particella.trim() || !dati.codiceIstat} onClick={()=>void cercaParticella()}>
                    <LocateFixed className="mr-1.5 h-4 w-4" />{azione==="catasto" ? t("Cerco la particella…") : t("Localizza la particella")}
                  </Button>}
                  <FonteLink url={catasto.url}>{catasto.nome}</FonteLink>
                  {!ricercaCatastale && !dati.posizione && !mappaCatastale && <Button type="button" variant="outline" onClick={()=>setMappaCatastale(true)}>{t("Indica il punto sulla mappa")}</Button>}
                </div>
                {!ricercaCatastale && <p className="text-xs text-muted-foreground">{t("Cerca la particella nella cartografia catastale e indica il punto corrispondente sulla mappa o con le coordinate.")}</p>}
                {particelle.length > 1 && <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-medium">{t("Scegli il riscontro dalla visura")}</p>
                  <ul className="space-y-1">{particelle.map((p,i)=><li key={`${p.lat}:${p.lng}:${i}`}><Button type="button" variant="outline" size="sm" onClick={()=>adottaParticella(p)}>
                    {t("Foglio {foglio} · Particella {numero}", { foglio: p.foglio, numero: p.numero })}{p.sezione ? ` · ${t("Sezione {sezione}", { sezione: String(p.sezione ?? "") })}` : ` · ${t("Senza sezione")}`} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </Button></li>)}</ul>
                </div>}
                {dati.particellaIndividuata && <p className="text-sm text-primary" role="status">{t("Particella individuata nella cartografia regionale.")} <FonteLink url={dati.particellaIndividuata.fonte}>{t("Apri la fonte")}</FonteLink></p>}
              </> : <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Campo nome={t("Via e numero civico")}><Input maxLength={240} value={dati.indirizzo} onChange={e=>cambiaIndirizzo({indirizzo:e.target.value})} /></Campo>
                <Button variant="outline" disabled={!dati.indirizzo.trim() || !dati.comune.trim()} onClick={()=>void riconosciIndirizzo()}><LocateFixed className="mr-1.5 h-4 w-4" />{azione==="indirizzo" ? t("Cerco il punto…") : t("Trova sulla mappa")}</Button>
              </div>}
              <details className="rounded-lg border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">{t("Coordinate sulla mappa")}</summary>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Campo nome={t("Latitudine")}><Input value={lat} onChange={e=>posiziona(e.target.value,lng)} inputMode="decimal" /></Campo>
                  <Campo nome={t("Longitudine")}><Input value={lng} onChange={e=>posiziona(lat,e.target.value)} inputMode="decimal" /></Campo>
                </div>
              </details>
              {(dati.posizione || mappaCatastale) && <Suspense fallback={<p className="text-sm text-muted-foreground">{t("Carico la mappa…")}</p>}>
                <MappaImmobile lat={dati.posizione?.lat ?? (dati.codiceIstat === ROMA_ISTAT ? 41.903 : 42.5)} lng={dati.posizione?.lng ?? 12.483} mostraPunto={!!dati.posizione}
                  onSposta={solaLettura || azione ? undefined : (a,b)=>posiziona(a.toFixed(7),b.toFixed(7))} />
              </Suspense>}
              {dati.posizione && <div className="flex items-center gap-2"><Checkbox id={uid+"posizione"} checked={dati.posizione.confermata} onCheckedChange={v=>setDati(d=>d.posizione ? {...d,posizione:{...d.posizione,confermata:v===true}, ...(v===true ? {} : {cartografia:undefined})} : d)}/><Label htmlFor={uid+"posizione"}>{t("Confermo il punto dell’immobile")}</Label></div>}
            </section>
            {!solaLettura && <Button onClick={()=>void cerca()}><Search className="mr-1.5 h-4 w-4"/>{ricercaCartografica && dati.posizione?.confermata ? t("Cerca zona e tutele") : t("Apri verifica preliminare")}</Button>}
          </fieldset>
        </TabsContent>
        <TabsContent value="atti" className="space-y-4">
          <section className="space-y-2 rounded-xl border bg-card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><LibraryBig className="size-4 text-primary" aria-hidden="true" />{t("Archivi ufficiali")}{dati.comune && " · " + dati.comune}</h3>
            <p className="text-sm text-muted-foreground">{dati.comune ? t("Cerca sul sito del Comune lo Sportello unico per l’edilizia, il piano vigente e il regolamento edilizio.") : t("Seleziona un Comune nella scheda Immobile per trovare il suo sito istituzionale.")}</p>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">{fontiNelRegistro(dati.comune ? dati.regione : "",dati.codiceIstat).map(f=><li key={f.id}><FonteLink url={f.url!}>{f.titolo}</FonteLink></li>)}</ul>
            {!!dati.codiceIstat && !ricercaCartografica && <p className="rounded-md bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
              {t("Per questo Comune individua la zona sulle tavole ufficiali e collega l’atto vigente con data e riferimento.")}
            </p>}
          </section>
          <RiscontriCartografici cartografia={dati.cartografia} onCollega={solaLettura || !!azione || dati.fonti.length>=40 ? undefined : (a) => {
            if (!a.scheda || a.codiceIstat!==dati.codiceIstat || dati.fonti.some(f=>f.url===a.scheda)) return;
            setDati(d=>({...d,fonti:[...d.fonti,{id:crypto.randomUUID(),titolo:a.descrizione.slice(0,240),
              ente:d.regione==="Lombardia" ? "Regione Lombardia" : "Roma Capitale",tipo:"tavola",url:a.scheda,stato:"da_verificare",acquisitaIl:oggi}]}));
          }} fontiCollegate={dati.fonti.flatMap(f=>f.url ? [f.url] : [])} />
          {dati.fonti.length > 0 && <ul aria-label={t("Elaborati collegati")} className="divide-y rounded-lg border">
            {dati.fonti.map(f=><li key={f.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p>{f.url ? <FonteLink url={f.url}>{f.titolo}</FonteLink> : <strong>{f.titolo}</strong>}</p>
                <p className="text-xs text-muted-foreground">{f.ente} · {f.ruoloTavola ? t(RUOLI_TAVOLA[f.ruoloTavola]) : t(TIPO_FONTE[f.tipo])} · {t(STATO_ATTO[f.stato])}{f.versione ? ` · ${t("revisione {versione}", { versione: String(f.versione ?? "") })}` : ""}{f.efficaceDal ? ` · ${t("dal {efficaceDal}", { efficaceDal: String(f.efficaceDal ?? "") })}` : ""} · {t("acquisito {data}", { data: f.acquisitaIl })}</p>
                {f.pubblicazione && <FonteLink url={f.pubblicazione}>{t("Avviso di pubblicazione")}</FonteLink>}
              </div>
              <div className="flex items-center gap-1">
                {f.allegato && <Button size="sm" variant="outline" disabled={!!azione} onClick={()=>void apriAllegato(f.allegato!.percorso)}><FileText className="mr-1 h-3.5 w-3.5"/>PDF</Button>}
                {!solaLettura && <Button size="sm" variant="ghost" disabled={!!azione} onClick={()=>modificaFonte(f)}>{t("Modifica")}</Button>}
              </div>
            </li>)}
          </ul>}
          <ConfrontoTavoleFascicolo documento={documento} fonti={dati.fonti} companyId={companyId} planimetriaId={planimetriaId} varianteId={variante}
            apertoIniziale={apriTavole}
            onAllinea={solaLettura || !!azione ? undefined : (id,inquadramento)=>setDati(d=>({...d,fonti:d.fonti.map(f=>f.id===id ? {...f,inquadramento} : f)}))}/>
          {!solaLettura && <fieldset disabled={!!azione} className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">{fonteId ? t("Modifica elaborato") : t("Collega un elaborato")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo nome={t("Titolo dell’atto o della tavola")}><Input maxLength={240} value={fonte.titolo} onChange={e=>setFonte(f=>({...f,titolo:e.target.value}))}/></Campo>
              <Campo nome={t("Ente")}><Input maxLength={240} value={fonte.ente} onChange={e=>setFonte(f=>({...f,ente:e.target.value}))}/></Campo>
              <Campo nome={t("Tipo di elaborato")}><UniformSelect value={fonte.tipo} onChange={e=>setFonte(f=>({...f,tipo:e.target.value as TipoFonteUrbanistica}))}>{Object.entries(TIPO_FONTE).map(([v,n])=><option value={v} key={v}>{t(n)}</option>)}</UniformSelect></Campo>
              {fonte.tipo==="tavola" && <Campo nome={t("Ruolo della tavola")}><UniformSelect value={fonte.ruoloTavola} onChange={e=>setFonte(f=>({...f,ruoloTavola:e.target.value as RuoloTavola | ""}))}>
                <option value="">{t("Tavola urbanistica comunale")}</option>
                {Object.entries(RUOLI_TAVOLA).map(([v,n])=><option value={v} key={v}>{t(n)}</option>)}
              </UniformSelect></Campo>}
              <Campo nome={t("Revisione o numero dell’atto")}><Input maxLength={240} value={fonte.versione} onChange={e=>setFonte(f=>({...f,versione:e.target.value}))}/></Campo>
              <Campo nome={t("Link all’elaborato")}><Input type="url" maxLength={2000} value={fonte.url} onChange={e=>setFonte(f=>({...f,url:e.target.value}))}/></Campo>
              <Campo nome={t("Allega PDF")}><Input key={fonteId ?? file?.name ?? "nuovo"} type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files?.[0])}/>{file && <span className="text-xs text-muted-foreground">{file.name}</span>}</Campo>
              <Campo nome={t("Stato dell’atto")}><UniformSelect value={fonte.stato} onChange={e=>setFonte(f=>({...f,stato:e.target.value as FonteUrbanistica["stato"]}))}>{Object.entries(STATO_ATTO).map(([v,n])=><option value={v} key={v}>{t(n)}</option>)}</UniformSelect></Campo>
              <Campo nome={t("Data di efficacia")}><Input type="date" value={fonte.efficaceDal} onChange={e=>setFonte(f=>({...f,efficaceDal:e.target.value}))}/></Campo>
              <div className="sm:col-span-2"><Campo nome={t("Link all’avviso di pubblicazione")}><Input type="url" maxLength={2000} value={fonte.pubblicazione} onChange={e=>setFonte(f=>({...f,pubblicazione:e.target.value}))}/></Campo></div>
            </div>
            <Button variant="outline" size="sm" onClick={()=>void registraFonte()}>{azione==="allegato" ? t("Caricamento…") : fonteId ? t("Aggiorna elaborato") : t("Aggiungi elaborato")}</Button>
          </fieldset>}
          <fieldset disabled={solaLettura || !!azione} className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">{t("Zona riscontrata sul piano comunale")}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo nome={t("Zona o ambito comunale")}><Input maxLength={240} value={dati.zona} onChange={e=>setDati(d=>({...d,zona:e.target.value,regole:d.regole.map(r=>({...r,confermata:false}))}))}/></Campo>
              <Campo nome={t("Tavola ufficiale")}><UniformSelect value={dati.fonteZona} onChange={e=>setDati(d=>({...d,fonteZona:e.target.value,regole:d.regole.map(r=>({...r,confermata:false}))}))}><option value="">{t("Scegli una tavola")}</option>{dati.fonti.filter(f=>f.tipo==="tavola" && !f.ruoloTavola).map(f=><option value={f.id} key={f.id}>{f.titolo}</option>)}</UniformSelect></Campo>
              <Campo nome={t("Numero tavola o pagina")}><Input maxLength={240} value={dati.riferimentoZona} onChange={e=>setDati(d=>({...d,riferimentoZona:e.target.value,regole:d.regole.map(r=>({...r,confermata:false}))}))}/></Campo>
            </div>
            <div className="flex items-center gap-2"><Checkbox id={uid+"atti"} checked={dati.attiDiscordanti} onCheckedChange={v=>setDati(d=>({...d,attiDiscordanti:v===true}))}/><Label htmlFor={uid+"atti"}>{t("Ci sono atti discordanti o aggiornamenti da riscontrare")}</Label></div>
          </fieldset>
        </TabsContent>
        <TabsContent value="verifiche" className="space-y-4">
          {azione==="fonti" && <p role="status" className="rounded-lg bg-primary/5 p-3 text-sm">{t("Interrogo le tavole e i livelli di tutela…")}</p>}
          {varianti.length>0 && <Campo nome={t("Variante da verificare")}><UniformSelect value={variante} disabled={!!azione} onChange={e=>{
            setVariante(e.target.value);
            setNota(valutazionePerVariante(dati,e.target.value)?.notaTecnico ?? "");
          }}><option value="">{t("Scegli una variante")}</option>{varianti.map(v=><option value={v.propostaId!} key={v.chiave}>{v.nome}</option>)}</UniformSelect></Campo>}
          {!riscontroIniziale && <EsitoInterventoUrbanistico quadro={quadro} intervento={dati.intervento} cartografia={dati.cartografia} onFonti={apriFonti} />}
          {riscontroIniziale && onVersioneCorrente && <Button size="sm" variant="outline" onClick={onVersioneCorrente}>{t("Apri il fascicolo corrente")}</Button>}
          {variante && <RiscontriTecnici key={variante} documento={documento} dati={dati} oggi={oggi} varianteId={variante}
            criterioIniziale={riscontroIniziale} livelloIniziale={livelloIniziale}
            onModifica={solaLettura || !!azione ? undefined : riscontriTecnici=>setDati(d=>({...d,riscontriTecnici}))}
            onFonti={apriFonti} onPdf={p=>void apriAllegato(p)} />}
          {riscontroIniziale && <EsitoInterventoUrbanistico quadro={quadro} intervento={dati.intervento} cartografia={dati.cartografia} onFonti={apriFonti} />}
          {storico && <p className="rounded-lg border bg-muted/35 p-2 text-sm">{t("Ultima verifica registrata il {data} · versione {versione}", { data: storico.data, versione: storico.versione })}{(storico.versione<versione || storico.metodo!==METODO_VERIFICA_URBANISTICA) ? ` ${t("· Riesamina disegno e criteri aggiornati")}` : ""}</p>}
          {variante && regoleIntervento.length>0 && <ul className="divide-y rounded-lg border" aria-label={t("Requisiti registrati")}>
            {regoleIntervento.map(r=>{
              const esito = esiti.find(e=>e.regolaId===r.id), f=dati.fonti.find(f=>f.id===r.fonteId);
              return <li key={r.id} className="space-y-0.5 p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-1"><p className="font-medium">{DATI_URBANISTICI[r.metrica]}</p><strong className={esito?.stato==="Criticità rilevata" ? "text-destructive" : "text-muted-foreground"}>{esito?.stato}</strong></div>
                <p>{r.condizione}</p>
                {r.estratto && <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">{r.estratto}</blockquote>}
                <p className="text-xs text-muted-foreground">{f?.url ? <FonteLink url={f.url}>{f.titolo}</FonteLink> : f?.titolo || t("Fonte da collegare")}{f?.versione ? ` · ${f.versione}` : ""}{r.riferimento ? ` · ${r.riferimento}` : ""}</p>
                {esito && <p>{esito.dato}</p>}
                {!!esito?.riferimenti?.length && <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={t("Punti sulla tavola")}>
                  {esito.riferimenti.map(rif=>{
                    const stato = statiVariante.find(x=>x.piano.id===rif.livelloId);
                    const p = new URLSearchParams({livello:rif.livelloId,versione:String(versione),ambito:"progetto:"+variante,
                      ...(rif.tipo==="apertura" ? {sezione:"verifica",apertura:rif.oggettoId} : {locale:rif.oggettoId})});
                    const a = stato?.stato.aperture.find(a=>a.id===rif.oggettoId);
                    const nome = rif.tipo==="apertura" ? (a ? `${a.tipo.charAt(0).toUpperCase()+a.tipo.slice(1)} · ${a.larghezza} × ${a.altezza} cm` : t("Apertura"))
                      : stato?.stato.locali.find(l=>l.id===rif.oggettoId)?.nome ?? t("Locale");
                    return <li key={rif.livelloId+":"+rif.oggettoId}><FonteLink url={percorsiPlanimetrie.pianta(planimetriaId)+"?"+p}>
                      {nome} · {stato?.piano.nome}
                    </FonteLink></li>;
                  })}
                </ul>}
                {!solaLettura && <Button variant="ghost" size="sm" disabled={!!azione} onClick={()=>{
                  setRegola({...r,estratto:r.estratto ?? "",soglia:r.soglia ? String(r.soglia) : "",
                    criterioSuperficie:r.criterioSuperficie ?? "abitativa", criterioFinestre:r.criterioFinestre ?? "apribile",
                    destinazione:r.destinazione ?? "", aperturaId:r.aperturaId ?? ""}); setRegolaId(r.id); setErrore(""); setProposteNorma([]);
                }}>{t("Modifica regola")}</Button>}
              </li>;
            })}
          </ul>}
          {!solaLettura && <fieldset disabled={!!azione} className="space-y-3 rounded-lg border p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary"/>{regolaId ? t("Modifica requisito") : t("Registra un requisito")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo nome={t("Dato da verificare")}><UniformSelect value={regola.metrica} onChange={e=>setRegola(r=>({...r,metrica:e.target.value as MetricaUrbanistica,soglia:"",destinazione:"",aperturaId:"",confermata:false}))}>{Object.entries(DATI_URBANISTICI).map(([v,n])=><option value={v} key={v}>{t(n)}</option>)}</UniformSelect></Campo>
              <Campo nome={t("Fonte normativa")}><UniformSelect value={regola.fonteId} onChange={e=>{setRegola(r=>({...r,fonteId:e.target.value,estratto:"",confermata:false}));setProposteNorma([]);}}><option value="">{t("Scegli una fonte")}</option>{dati.fonti.filter(f=>f.tipo==="norme").map(f=><option value={f.id} key={f.id}>{f.titolo}</option>)}</UniformSelect></Campo>
              <Campo nome={t("Articolo o pagina")}><Input value={regola.riferimento} maxLength={240} onChange={e=>{setRegola(r=>({...r,riferimento:e.target.value,estratto:"",confermata:false}));setProposteNorma([]);}}/></Campo>
              {MISURA_MINIMA[regola.metrica] && <Campo nome={t(MISURA_MINIMA[regola.metrica]!)}><Input value={regola.soglia} inputMode="decimal" onChange={e=>setRegola(r=>({...r,soglia:e.target.value,confermata:false}))}/></Campo>}
              {regola.metrica==="superficie" && <Campo nome={t("Criterio di superficie")}><UniformSelect value={regola.criterioSuperficie}
                onChange={e=>setRegola(r=>({...r,criterioSuperficie:e.target.value as CriterioSuperficie,confermata:false}))}>
                {Object.entries(CRITERI_SUPERFICIE).map(([k,v])=><option value={k} key={k}>{v}</option>)}
              </UniformSelect></Campo>}
              {regola.metrica==="finestre" && <Campo nome={t("Superficie utile delle finestre")}><UniformSelect value={regola.criterioFinestre}
                onChange={e=>setRegola(r=>({...r,criterioFinestre:e.target.value as CriterioFinestre,confermata:false}))}>
                {Object.entries(CRITERI_FINESTRE).map(([k,v])=><option value={k} key={k}>{v}</option>)}
              </UniformSelect></Campo>}
              {(regola.metrica==="altezza" || regola.metrica==="finestre" || (regola.metrica==="superficie" && regola.criterioSuperficie==="locale")) &&
                <Campo nome={t("Destinazione del locale")}><UniformSelect value={regola.destinazione}
                  onChange={e=>setRegola(r=>({...r,destinazione:e.target.value as ""|Destinazione,confermata:false}))}>
                  <option value="">{regola.metrica==="altezza" ? t("Tutti i locali residenziali") : t("Scegli la destinazione")}</option>
                  {DESTINAZIONI.map(d=><option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                </UniformSelect></Campo>}
              {regola.metrica==="accessi" && <Campo nome={t("Porta da verificare")}><UniformSelect value={regola.aperturaId}
                onChange={e=>setRegola(r=>({...r,aperturaId:e.target.value,confermata:false}))}>
                <option value="">{t("Scegli una porta della variante")}</option>
                {statiVariante.flatMap(({piano,stato})=>stato.aperture.filter(a=>a.tipo==="porta" && a.stato!=="da_demolire")
                  .map((a,i)=><option key={a.id} value={a.id}>{t("{nome} · Porta {i} · {larghezza} cm di vano", { nome: String(piano.nome ?? ""), i: i+1, larghezza: String(a.larghezza ?? "") })}</option>))}
              </UniformSelect></Campo>}
            </div>
            <Campo nome={t("Condizione di applicabilità")}><Textarea maxLength={1000} value={regola.condizione} onChange={e=>setRegola(r=>({...r,condizione:e.target.value,confermata:false}))}/></Campo>
            {regola.estratto && <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">{regola.estratto}</blockquote>}
            <details className="rounded-md border bg-muted/25 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary"/>{t("Cerca requisiti in un estratto con l’AI")}</summary>
              <div className="mt-2 space-y-2">
                <Campo nome={t("Testo dell’articolo o della pagina")}><Textarea value={testoFonte} maxLength={12000} onChange={e=>{setTestoFonte(e.target.value);setProposteNorma([]);}} /></Campo>
                <Button size="sm" variant="outline" disabled={!regola.fonteId || !regola.riferimento.trim() || testoFonte.trim().length<30}
                  onClick={()=>void analizzaEstratto()}>{azione==="regole" ? t("Analizzo l’estratto…") : t("Cerca requisiti")}</Button>
                {!!proposteNorma.length && <ul className="space-y-2">{proposteNorma.map((p,i)=><li key={i} className="rounded border bg-card p-2">
                  <p className="font-medium">{DATI_URBANISTICI[p.metrica]}</p><p className="text-muted-foreground">{p.estratto}</p>
                  <Button variant="ghost" size="sm" onClick={()=>setRegola(r=>({...r,metrica:p.metrica,condizione:p.condizione,estratto:p.estratto,soglia:p.soglia ? String(p.soglia) : "",
                    criterioSuperficie:"abitativa",destinazione:"",aperturaId:"",confermata:false}))}>{t("Usa come proposta")}</Button>
                </li>)}</ul>}
              </div>
            </details>
            <div className="flex items-center gap-2"><Checkbox id={uid+"regola"} checked={regola.confermata} onCheckedChange={v=>setRegola(r=>({...r,confermata:v===true}))}/><Label htmlFor={uid+"regola"}>{t("Confermo l’applicabilità del requisito e il criterio di misura indicato")}</Label></div>
            <Button variant="outline" size="sm" onClick={registraRegola}>{regolaId ? t("Aggiorna requisito") : t("Aggiungi requisito")}</Button>
          </fieldset>}
          {variante && <Campo nome={t("Valutazione del tecnico")}><Textarea disabled={solaLettura || !!azione} maxLength={2000} value={nota} onChange={e=>setNota(e.target.value)} placeholder={t("Riscontri, verifiche aperte, riferimenti agli elaborati e alle pratiche.")} /></Campo>}
        </TabsContent>
        <TabsContent value="esodo" className="space-y-3">
          {!!varianti.length && <Campo nome={t("Variante d’esodo")}><UniformSelect value={variante} onChange={e=>{
            setVariante(e.target.value);
            setNota(valutazionePerVariante(dati,e.target.value)?.notaTecnico ?? "");
          }}>
            <option value="">{t("Scegli una variante")}</option>{varianti.map(v=><option key={v.chiave} value={v.propostaId!}>{v.nome}</option>)}
          </UniformSelect></Campo>}
          <EsodoFascicolo documento={documento} dati={dati} varianteId={variante} oggi={oggi} livelloIniziale={livelloIniziale}
            onModifica={solaLettura || !!azione ? undefined : riscontriTecnici=>setDati(d=>({...d,riscontriTecnici}))}
            onFonti={apriFonti} onPdf={p=>void apriAllegato(p)} />
        </TabsContent>
        <TabsContent value="pratiche">
          {onVersioneCorrente && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p>{t("Pratiche del fascicolo alla versione {versione}.", { versione: String(versione ?? "") })}</p>
            <Button size="sm" variant="outline" onClick={onVersioneCorrente}>{t("Apri il fascicolo corrente")}</Button>
          </div>}
          <PratichePlanimetria documento={documento} planimetriaId={planimetriaId} fonti={dati.fonti} pratiche={dati.pratiche ?? []} variante={variante} unita={unita}
            prossimaVersione={versione+1} solaLettura={solaLettura || !!azione} onModifica={pratiche=>setDati(d=>({...d,pratiche}))}
            onApriAllegato={percorso=>void apriAllegato(percorso)}/>
        </TabsContent>
      </Tabs>
      {errore && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{errore}</p>}
      <DialogFooter className="border-t pt-3">
        <Button variant="outline" disabled={!!azione} onClick={chiudi}>{solaLettura ? t("Chiudi") : t("Annulla")}</Button>
        {!solaLettura && <Button disabled={!!azione} onClick={()=>void salva()}>{azione==="salva" ? t("Salvataggio…") : t("Salva fascicolo urbanistico")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
