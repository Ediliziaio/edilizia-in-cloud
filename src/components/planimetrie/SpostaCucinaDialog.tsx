import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { localiPerSpostareCucina, spostaCucina } from "@/lib/planimetrie/spostamentoCucina";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { Livello, Locale, Planimetria } from "../../../shared/planimetrie/modello.ts";
import { TavolaInterattiva } from "./TavolaInterattiva";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const nomeLocale = (l: Locale) => `${l.nome} · ${(areaPoligono(l.contorno) / 10_000).toLocaleString(intlCampo(), { maximumFractionDigits: 2 })} m²`;

export function SpostaCucinaDialog({ documento, piano, varianteId, onChiudi, onSalva }: {
  documento: Planimetria;
  piano: Livello;
  varianteId?: string;
  onChiudi: () => void;
  onSalva: (esito: ReturnType<typeof spostaCucina>) => Promise<void>;
}) {
  const t = useT();
  const { origini, destinazioni } = localiPerSpostareCucina(piano,varianteId);
  const [origine, setOrigine] = useState(origini.length === 1 ? origini[0].id : "");
  const [destinazione, setDestinazione] = useState("");
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  const inCorso = useRef(false);

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    if (!origine || !destinazione || inCorso.current) return;
    inCorso.current = true;
    setOccupato(true);
    setErrore("");
    try {
      await onSalva(spostaCucina(documento,{ livelloId:piano.id,varianteId,origineId:origine,destinazioneId:destinazione }));
    } catch (error) {
      setErrore(error instanceof Error ? error.message : t("Revisione della cucina non salvata."));
    } finally {
      inCorso.current = false;
      setOccupato(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !inCorso.current) onChiudi(); }}>
    <DialogContent ampiezza="spazio">
      <DialogHeader>
        <DialogTitle>{t("Sposta cucina")}</DialogTitle>
        <DialogDescription>{t("{nome} · Il locale attuale diventa una zona pranzo.", { nome: String(piano.nome ?? "") })}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={salva}>
        <fieldset disabled={occupato} className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cucina-attuale">{t("Cucina attuale")}</Label>
              <UniformSelect id="cucina-attuale" value={origine} onChange={e=>setOrigine(e.target.value)}>
                <option value="">{t("Scegli la cucina")}</option>
                {origini.map(l=><option key={l.id} value={l.id}>{nomeLocale(l)}</option>)}
              </UniformSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cucina-destinazione">{t("Locale della nuova cucina")}</Label>
              <UniformSelect id="cucina-destinazione" value={destinazione} onChange={e=>setDestinazione(e.target.value)}>
                <option value="">{t("Scegli il locale")}</option>
                {destinazioni.map(l=><option key={l.id} value={l.id}>{nomeLocale(l)}</option>)}
              </UniformSelect>
            </div>
            <p className="text-xs text-muted-foreground">{t("Il progetto propone una cucina lineare e ricava le superfici dal disegno. I tracciati di acqua, scarico e ventilazione si completano nel computo.")}</p>
          </div>
          <TavolaInterattiva documento={documento} livelloId={piano.id} ambito={varianteId ? `progetto:${varianteId}` : "fatto"}
            selezionato={origine} evidenzaLocali={destinazione ? [destinazione] : []} comandi className="h-56 rounded-xl border" />
        </fieldset>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={occupato} onClick={onChiudi}>{t("Annulla")}</Button>
          <Button type="submit" disabled={!origine || !destinazione || occupato}>{occupato ? t("Salvataggio…") : varianteId ? t("Salva revisione") : t("Salva variante")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
