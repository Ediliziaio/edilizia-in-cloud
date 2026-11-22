import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileImage, Layers3, Map, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { caricaPlanimetria, chiaviPlanimetrie, salvaNuovaVersione, useElencoPlanimetrie, usePlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { duplicaProposta } from "@/components/planimetrie/editor/adattatore";
import { leggiAllegatoLocale } from "@/lib/computo/allegatiLocali";
import type { AllegatoComputo } from "@/lib/computo/editorNativo";
import type { OrigineComputoPianta } from "@/lib/computo/computoDallaPianta";
import { esigiVerificaDocumento } from "../../../shared/planimetrie/verificaDocumento";

const LeggiPlanimetria = lazy(() => import("@/pages/azienda/RenderPlanimetriaNuova").then(m => ({ default: m.LeggiPlanimetria })));

export default function ProgettoPlanimetria({ companyId, scope, titolo, allegati, origine, puoCambiare, inSilvio, onCollega, onApriComputo, onApriSilvio }: {
  companyId: string;
  scope: string;
  titolo: string;
  allegati: AllegatoComputo[];
  origine?: OrigineComputoPianta;
  puoCambiare: boolean;
  inSilvio?: boolean;
  onCollega: (origine: OrigineComputoPianta) => void;
  onApriComputo: () => void;
  onApriSilvio?: () => void;
}) {
  const queryClient = useQueryClient();
  const [dialogo, setDialogo] = useState<"scegli" | "allegati" | "leggi" | null>(null);
  const [piantaId, setPiantaId] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [livelloId, setLivelloId] = useState("");
  const [scelta, setScelta] = useState("");
  const [file, setFile] = useState<File>();
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const inCorso = useRef(false);
  const dialogoCorrente = useRef(dialogo);
  useEffect(() => { dialogoCorrente.current = dialogo; }, [dialogo]);
  const attivo = useRef(true);
  useEffect(() => { attivo.current = true; return () => { attivo.current = false; }; }, []);

  const elenco = useElencoPlanimetrie(dialogo === "scegli" ? companyId : undefined);
  const pianta = usePlanimetria(dialogo === "scegli" && piantaId ? piantaId : (dialogo ? undefined : origine?.id));
  const dati = pianta.data?.riga.company_id === companyId ? pianta.data : undefined;
  const livello = dati?.versione.documento.livelli.find(l => l.id === livelloId) ?? dati?.versione.documento.livelli[0];
  const propostaPredefinita = livello?.proposte[0]?.id;
  const propostaSelezionata = scelta && (!scelta.startsWith("p:") || livello?.proposte.some(p => `p:${p.id}` === scelta))
    ? scelta : propostaPredefinita ? `p:${propostaPredefinita}` : "nuova";
  const allegatiUtili = allegati.filter(a => a.tipo !== "render");
  const parole = ricerca.trim().toLocaleLowerCase("it-IT").split(/\s+/).filter(Boolean);
  const trovate = (elenco.data ?? []).filter(p => parole.every(parola => p.titolo.toLocaleLowerCase("it-IT").includes(parola)));
  const opzioni = piantaId && !trovate.some(p => p.id === piantaId)
    ? [...(elenco.data ?? []).filter(p => p.id === piantaId), ...trovate] : trovate;

  function apriScelta(id = "") {
    setErrore("");
    setRicerca("");
    setPiantaId(id);
    setLivelloId(id && origine?.id === id ? origine.livelloId : "");
    setScelta(id && origine?.id === id ? origine.propostaId ? `p:${origine.propostaId}` : "fatto" : "");
    setDialogo("scegli");
  }

  function apriCaricamento() {
    setErrore("");
    setFile(undefined);
    setDialogo(allegatiUtili.length ? "allegati" : "leggi");
  }

  async function collega() {
    if (!dati || !livello || inCorso.current) return;
    const propostaScelta = propostaSelezionata;
    inCorso.current = true;
    setOccupato(true);
    setErrore("");
    try {
      const attuale = await caricaPlanimetria(dati.riga.id);
      if (attuale.riga.company_id !== companyId) throw new Error("Scegli una planimetria di questa azienda.");
      if (attuale.versione.numero !== dati.versione.numero) {
        void pianta.refetch();
        throw new Error("La pianta è stata aggiornata. Controlla il piano e la proposta e riprova.");
      }
      esigiVerificaDocumento(attuale.versione.documento, "computo");
      let versione = attuale.versione.numero;
      let propostaId = propostaScelta.startsWith("p:") ? propostaScelta.slice(2) : null;
      if (propostaScelta === "nuova") {
        const nuova = duplicaProposta(attuale.versione.documento, livello.id);
        versione = await salvaNuovaVersione({ planimetriaId: attuale.riga.id, documento: nuova.documento, versioneAttesa: versione });
        propostaId = nuova.id;
        void queryClient.invalidateQueries({ queryKey: chiaviPlanimetrie.tutte });
      }
      if (!attivo.current) return;
      onCollega({ id: attuale.riga.id, titolo: attuale.riga.titolo.slice(0, 160), livelloId: livello.id, propostaId, versione });
      setDialogo(null);
    } catch (e) {
      if (attivo.current) setErrore(e instanceof Error ? e.message : "Collegamento non riuscito. Riprova.");
    } finally {
      inCorso.current = false;
      if (attivo.current) setOccupato(false);
    }
  }

  async function usaAllegato(allegato: AllegatoComputo) {
    if (inCorso.current) return;
    inCorso.current = true;
    setOccupato(true); setErrore("");
    try {
      const blob = await leggiAllegatoLocale(scope, allegato.id);
      if (!blob) throw new Error("L’allegato non è disponibile qui. Carica di nuovo la tavola.");
      if (!attivo.current) return;
      setFile(new File([blob], allegato.nome, { type: allegato.mime }));
      setDialogo("leggi");
    } catch (e) {
      if (attivo.current) setErrore(e instanceof Error ? e.message : "Non riesco ad aprire l’allegato.");
    } finally {
      inCorso.current = false;
      if (attivo.current) setOccupato(false);
    }
  }

  const pianoCollegato = dati?.versione.documento.livelli.find(l => l.id === origine?.livelloId);
  const nomeProposta = pianoCollegato?.proposte.find(p => p.id === origine?.propostaId)?.nome;
  return (
    <section aria-label="Planimetria del computo" className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-white p-2 text-blue-700"><Map aria-hidden="true" className="size-5" /></div>
          <div className="min-w-0">
            <h2 className="break-words font-semibold">{origine ? origine.titolo : "Planimetria del progetto"}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {origine ? [pianoCollegato?.nome, nomeProposta ?? (pianoCollegato ? "Stato di fatto" : ""), `Versione ${origine.versione} nel computo`].filter(Boolean).join(" · ")
                : "Facoltativa. Collega una pianta per portare le misure nel computo."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {origine && <>
            {puoCambiare && <Button type="button" size="sm" variant="outline" onClick={() => apriScelta(origine.id)}>Cambia collegamento</Button>}
            <Button type="button" size="sm" variant={onApriSilvio ? "outline" : "default"} onClick={onApriComputo}>Pianta e computo <ArrowRight aria-hidden="true" className="size-4" /></Button>
            {onApriSilvio && <Button type="button" size="sm" onClick={onApriSilvio}><Sparkles aria-hidden="true" className="size-4" /> Apri progetto in Silvio</Button>}
          </>}
        </div>
      </div>
      {!origine && <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="h-auto justify-start gap-3 whitespace-normal bg-white px-3 py-2.5 text-left" onClick={() => apriScelta()}>
          <Layers3 aria-hidden="true" className="size-4 shrink-0 text-blue-700" />
          <span className="min-w-0 flex-1">Scegli dall’archivio<span className="block text-xs font-normal text-muted-foreground">Una planimetria già salvata</span></span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Button>
        <Button type="button" variant="outline" className="h-auto justify-start gap-3 whitespace-normal bg-white px-3 py-2.5 text-left" onClick={apriCaricamento}>
          <FileImage aria-hidden="true" className="size-4 shrink-0 text-blue-700" />
          <span className="min-w-0 flex-1">Carica una tavola<span className="block text-xs font-normal text-muted-foreground">PDF, foto o schizzo del lavoro</span></span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </div>}

      <Dialog open={dialogo !== null} onOpenChange={aperto => { if (!aperto && !inCorso.current) setDialogo(null); }}>
        <DialogContent className={dialogo === "leggi" ? "sm:max-w-[min(96vw,78rem)]" : "sm:max-w-lg"}>
          <DialogHeader>
            <DialogTitle>{dialogo === "scegli" ? "Collega una planimetria" : "Crea la planimetria del computo"}</DialogTitle>
            <DialogDescription>{dialogo === "scegli" ? "Scegli il disegno da cui prendere le misure del preventivo." : "Usa una tavola o uno schizzo e verifica le misure prima di collegarlo."}</DialogDescription>
          </DialogHeader>
          {dialogo === "scegli" && <div className="space-y-3">
            {elenco.isLoading && <p role="status" className="text-sm">Carico le planimetrie…</p>}
            {elenco.isError && <Button variant="outline" type="button" onClick={() => void elenco.refetch()}>Riprova a leggere le planimetrie</Button>}
            {elenco.data?.length === 0 && <p className="text-sm">Carica una tavola per creare la prima pianta di questo progetto.</p>}
            {!!elenco.data?.length && <div className="space-y-1.5">
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input aria-label="Cerca per nome della planimetria" placeholder="Cerca per nome" value={ricerca}
                  className="pl-9" disabled={occupato} onChange={e => setRicerca(e.target.value)} />
              </div>
              <Label htmlFor="computo-scegli-pianta">Planimetria</Label>
              <select id="computo-scegli-pianta" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={piantaId} disabled={occupato} onChange={e => {
                setPiantaId(e.target.value); setLivelloId(""); setScelta(""); setErrore("");
              }}>
                <option value="">Scegli una pianta</option>
                {opzioni.map(p => <option key={p.id} value={p.id}>{p.titolo}</option>)}
              </select>
              {!trovate.length && <p role="status" className="text-xs text-muted-foreground">Nessuna planimetria corrisponde alla ricerca.</p>}
            </div>}
            {piantaId && pianta.isLoading && <p role="status" className="text-sm">Leggo i piani del progetto…</p>}
            {piantaId && (pianta.isError || (pianta.data && !dati)) && <p role="alert" className="text-sm text-amber-800">Planimetria non disponibile. Scegli un’altra tavola.</p>}
            {dati && livello && <>
              {dati.versione.documento.livelli.length > 1 && <div className="space-y-1.5">
                <Label htmlFor="computo-scegli-piano">Piano</Label>
                <select id="computo-scegli-piano" className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={livello.id} disabled={occupato} onChange={e => {
                  setLivelloId(e.target.value); setScelta(""); setErrore("");
                }}>
                  {dati.versione.documento.livelli.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>}
              <div className="space-y-1.5">
                <Label htmlFor="computo-scegli-proposta">Variante da collegare</Label>
                <select id="computo-scegli-proposta" className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={propostaSelezionata} disabled={occupato} onChange={e => setScelta(e.target.value)}>
                  {livello.proposte.map(p => <option key={p.id} value={`p:${p.id}`}>{p.nome}</option>)}
                  <option value="nuova">Nuova proposta di ristrutturazione</option>
                  <option value="fatto">Stato di fatto · superfici e misure</option>
                </select>
                {propostaSelezionata === "nuova" && <p className="text-xs text-muted-foreground">Crei una variante di lavoro a partire dalla planimetria.</p>}
                <Link className="text-xs text-blue-700 underline" to={percorsiPlanimetrie.pianta(dati.riga.id, livello.id, propostaSelezionata.startsWith("p:") ? `progetto:${propostaSelezionata.slice(2)}` : undefined)} target="_blank" rel="noopener">Apri il disegno</Link>
              </div>
            </>}
          </div>}
          {dialogo === "allegati" && <div className="max-h-[48dvh] space-y-2 overflow-y-auto">
            {allegatiUtili.map(a => <Button key={a.id} type="button" variant="outline" className="h-auto w-full justify-between whitespace-normal text-left" disabled={occupato} onClick={() => void usaAllegato(a)}>
              <span className="min-w-0 break-words">{a.nome}</span><ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Button>)}
            <Button type="button" variant="ghost" disabled={occupato} onClick={() => { setFile(undefined); setDialogo("leggi"); }}>Carica un altro file</Button>
          </div>}
          {dialogo === "leggi" && <Suspense fallback={<p role="status" className="text-sm">Apro Planimetrie AI…</p>}>
            <LeggiPlanimetria companyId={companyId} per={{ titolo }} fileIniziale={file} onSalvata={id => {
              if (attivo.current && dialogoCorrente.current === "leggi") apriScelta(id);
            }} />
          </Suspense>}
          {errore && dialogo !== "leggi" && <p role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{errore}</p>}
          {dialogo === "scegli" && <DialogFooter>
            {elenco.data?.length === 0 && <Button type="button" variant="outline" onClick={apriCaricamento}>Carica una tavola</Button>}
            <Button type="button" disabled={!dati || !livello || occupato || pianta.isFetching} onClick={() => void collega()}>
              {occupato ? "Collego la planimetria…" : inSilvio ? "Collega la planimetria" : "Collega e apri il computo"}
            </Button>
          </DialogFooter>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
