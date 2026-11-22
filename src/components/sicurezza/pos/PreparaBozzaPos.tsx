import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFasiFascicolo } from "@/hooks/useFascicoloCantiere";
import { applicaConfrontoPos, confrontaPos, gruppiVuotiPos, testoConfrontoPos } from "@/lib/sicurezza/confrontoPos";
import {
  CAMPI_TESTO_LAVORAZIONE, inserisciTestiLavorazione, modelloSuggeritoPos, stessaLavorazionePos, testiMancantiDaProposta,
} from "@/lib/sicurezza/testiLavorazionePos";
import type { PosContenuto } from "../../../../supabase/functions/_shared/posModello";
import { nuovaDaSchedaStandard } from "../../../../supabase/functions/_shared/posSchedeStandard";

interface Props {
  bozza: PosContenuto;
  fonte?: PosContenuto;
  fontiInCaricamento: boolean;
  fontiNonDisponibili: boolean;
  rileggiFonti: () => void;
  companyId: string;
  orderId: string;
  onClose: () => void;
  onContinua: (preparata: PosContenuto | null) => void;
  onVaiAllaVerifica: (preparata: PosContenuto) => void;
}

export function PreparaBozzaPos({ bozza, fonte, fontiInCaricamento, fontiNonDisponibili, rileggiFonti, companyId, orderId,
  onClose, onContinua, onVaiAllaVerifica }: Props) {
  const confermata = useRef<PosContenuto | null>(null);
  const puoAggiungereFasi = bozza.impresa.ruolo !== "affidataria";
  const fasi = useFasiFascicolo(companyId, puoAggiungereFasi ? orderId : undefined);
  const [scelte, setScelte] = useState<Record<string, boolean>>({});
  const selezione = (id: string, iniziale = true) => ({
    checked: scelte[id] ?? iniziale,
    onChange: (valore: boolean) => setScelte(prev => ({ ...prev, [id]: valore })),
  });
  const dati = useMemo(() => {
    if (!fonte) return [];
    const differenze = confrontaPos(bozza, fonte);
    const vuoti = new Set(gruppiVuotiPos(differenze));
    // In una bozza con personale già scelto, il collegamento con le qualifiche e la formazione richiede un confronto esplicito.
    if (bozza.lavoratori.length || bozza.formazione.length) {
      vuoti.delete("lavoratori");
      vuoti.delete("formazione");
    }
    return differenze.filter(d => vuoti.has(d.campo));
  }, [bozza, fonte]);
  const testi = useMemo(() => bozza.lavorazioni.flatMap(lavorazione => {
    if (CAMPI_TESTO_LAVORAZIONE.every(campo => lavorazione[campo.id].trim())) return [];
    const modello = modelloSuggeritoPos(lavorazione.titolo || lavorazione.descrizione, lavorazione.fonti_scheda?.standard?.id);
    if (!modello) return [];
    const proposta = nuovaDaSchedaStandard(modello, lavorazione.id);
    const campi = testiMancantiDaProposta(lavorazione, proposta);
    return campi.length ? [{ lavorazione, modello, proposta, campi }] : [];
  }), [bozza.lavorazioni]);
  const nuoveFasi = useMemo(() => {
    if (!puoAggiungereFasi || fasi.isError) return [];
    const idCollegate = new Set(bozza.lavorazioni.map(l => l.fase_id));
    return (fasi.data ?? []).flatMap(fase => {
      if (idCollegate.has(fase.id) ||
        bozza.lavorazioni.some(l => stessaLavorazionePos({ titolo: fase.name, descrizione: "", fase_id: fase.id }, l))) return [];
      const modello = modelloSuggeritoPos(fase.name);
      return modello ? [{ fase, modello }] : [];
    });
  }, [bozza.lavorazioni, fasi.data, fasi.isError, puoAggiungereFasi]);

  const datiScelti = dati.filter(d => selezione(`dato:${d.campo}`).checked).map(d => d.campo);
  const testiScelti = testi.filter(t => selezione(`testo:${t.lavorazione.id}`).checked);
  const fasiScelte = nuoveFasi.filter(t => selezione(`fase:${t.fase.id}`, false).checked);
  const daInserire = datiScelti.length + testiScelti.length + fasiScelte.length;

  function continua() {
    if (!daInserire) {
      confermata.current = bozza;
      onContinua(null);
      return;
    }
    const preparata = fonte && datiScelti.length ? applicaConfrontoPos(bozza, fonte, datiScelti) : structuredClone(bozza);
    for (const { lavorazione, proposta } of testiScelti) {
      const corrente = preparata.lavorazioni.find(l => l.id === lavorazione.id);
      if (corrente) inserisciTestiLavorazione(corrente, proposta, "modello");
    }
    for (const { fase, modello } of fasiScelte) {
      const nuova = { ...nuovaDaSchedaStandard(modello, crypto.randomUUID()), titolo: fase.name, fase_id: fase.id };
      preparata.lavorazioni.push(nuova);
    }
    confermata.current = preparata;
    onContinua(preparata);
  }

  return (
    <DialogContent onCloseAutoFocus={event => {
      if (!confermata.current) return;
      event.preventDefault();
      const contenuto = confermata.current;
      confermata.current = null;
      onVaiAllaVerifica(contenuto);
    }} className="flex max-h-[88dvh] min-w-0 max-w-2xl flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 space-y-1 px-4 pb-3 pt-5 pr-10 sm:px-6 sm:pr-10">
        <DialogTitle>Prepara la bozza POS</DialogTitle>
        <DialogDescription>Scegli cosa inserire e passa alla prima voce da verificare.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto border-y px-4 py-3 sm:px-6">
        <section aria-label="Dati della commessa" className="space-y-2">
          <h3 className="text-sm font-semibold">Dati della commessa</h3>
          {fontiInCaricamento ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Recupero i dati…
          </p> : fontiNonDisponibili ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
            Dati della commessa non disponibili.
            <Button type="button" size="sm" variant="outline" onClick={rileggiFonti}>Riprova a leggere i dati</Button>
          </div> : !dati.length ? <p className="text-sm text-muted-foreground">Nessun nuovo dato da inserire nei campi vuoti.</p> : null}
          {!!dati.length && <ul className="divide-y rounded-md border">
            {dati.map(d => <Suggerimento key={d.campo} titolo={d.titolo} {...selezione(`dato:${d.campo}`)}>
              <p className="whitespace-pre-wrap break-words">{testoConfrontoPos(d.rilevato)}</p>
            </Suggerimento>)}
          </ul>}
        </section>

        <section aria-label="Testi standard suggeriti" className="space-y-2">
          <h3 className="text-sm font-semibold">Testi standard suggeriti</h3>
          {!testi.length ? <p className="text-sm text-muted-foreground">Nessun testo per le schede già presenti.</p> :
            <ul className="divide-y rounded-md border">
              {testi.map(({ lavorazione, modello, campi }) =>
                <Suggerimento key={lavorazione.id} titolo={lavorazione.titolo || modello.titolo}
                  dettaglio={modello.titolo} {...selezione(`testo:${lavorazione.id}`)}>
                  {campi.map(campo => <div key={campo.id}>
                    <p className="font-medium">{campo.titolo}</p>
                    <p className="whitespace-pre-wrap break-words">{campo.testo}</p>
                  </div>)}
                </Suggerimento>)}
            </ul>}
        </section>

        {puoAggiungereFasi && (fasi.isLoading || fasi.isError || !!nuoveFasi.length) && <section aria-label="Fasi della commessa" className="space-y-2">
          <h3 className="text-sm font-semibold">Fasi della commessa</h3>
          {fasi.isLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento delle fasi…</p>}
          {fasi.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
            Fasi non disponibili.
            <Button type="button" size="sm" variant="outline" onClick={() => void fasi.refetch()}>Riprova a leggere le fasi</Button>
          </div>}
          {!!nuoveFasi.length && <>
            <p className="text-sm text-muted-foreground">Seleziona le fasi che esegue l’impresa di questo POS.</p>
            <ul className="divide-y rounded-md border">
              {nuoveFasi.map(({ fase, modello }) => <Suggerimento key={fase.id} titolo={fase.name}
                dettaglio={modello.titolo} {...selezione(`fase:${fase.id}`, false)}>
                <p className="break-words">{modello.descrizione}</p>
                <p className="whitespace-pre-wrap break-words">{[modello.prima, modello.durante, modello.dopo].join("\n")}</p>
              </Suggerimento>)}
            </ul>
          </>}
        </section>}
      </div>
      <DialogFooter className="shrink-0 gap-2 px-4 py-3 sm:px-6">
        <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
        <Button type="button" onClick={continua}>
          {daInserire ? "Applica e vai alla verifica" : "Vai alla verifica"} <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Suggerimento({ titolo, dettaglio, checked, onChange, children }: {
  titolo: string;
  dettaglio?: string;
  checked: boolean;
  onChange: (valore: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2 text-sm font-medium">
        <Checkbox id={id} aria-label={titolo} className="mt-0.5 shrink-0" checked={checked} onCheckedChange={v => onChange(v === true)} />
        <label htmlFor={id} className="min-w-0 cursor-pointer break-words">{titolo}{dettaglio && <span className="block text-xs font-normal text-muted-foreground">{dettaglio}</span>}</label>
      </div>
      <details className="ml-6 text-xs text-muted-foreground">
        <summary aria-label={`Mostra anteprima per ${titolo}`} className="w-fit cursor-pointer font-medium text-primary">Mostra anteprima</summary>
        <div className="mt-1.5 space-y-2 rounded bg-muted/50 p-2">{children}</div>
      </details>
    </li>
  );
}
