import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import { SANITARI_BAGNO, type Livello, type Locale, type Planimetria, type TipoSanitarioBagno } from "../../../shared/planimetrie/modello.ts";
import { creaVarianteSpostamentoBagno, localiPerSpostamento, NOMI_SANITARI } from "@/lib/planimetrie/spostamentoBagno";
import { leggiMisura } from "./editor/misure";
import { TavolaInterattiva } from "./TavolaInterattiva";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const nomeLocale = (l: Locale) => `${l.nome} · ${(areaPoligono(l.contorno) / 10_000).toLocaleString(intlCampo(), { maximumFractionDigits: 2 })} m²`;

export function SpostaBagnoDialog({ documento, piano, daVariante, onChiudi, onSalva }: {
  documento: Planimetria;
  piano: Livello;
  daVariante?: string;
  onChiudi: () => void;
  onSalva: (variante: ReturnType<typeof creaVarianteSpostamentoBagno>) => Promise<void>;
}) {
  const t = useT();
  const [baseId, setBaseId] = useState(daVariante);
  const { origini, destinazioni } = localiPerSpostamento(piano, baseId);
  const bagni = origini.filter(l => l.destinazione === "bagno");
  const altri = origini.filter(l => l.destinazione !== "bagno");
  const [origine, setOrigine] = useState(bagni.length === 1 ? bagni[0].id : "");
  const [destinazione, setDestinazione] = useState("");
  const [confermaBagno, setConfermaBagno] = useState(false);
  const [sanitari, setSanitari] = useState<TipoSanitarioBagno[]>(["wc", "lavabo", "doccia"]);
  const [rivestimento, setRivestimento] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const inCorso = useRef(false);
  const attuale = origini.find(l => l.id === origine);
  const nuovo = destinazioni.find(l => l.id === destinazione);
  const altezza = leggiMisura(rivestimento);
  const erroreAltezza = !!rivestimento.trim() && (altezza === null || (!!nuovo && altezza > nuovo.altezza));
  const pronta = attuale && nuovo && (attuale.destinazione === "bagno" || confermaBagno) && sanitari.length && !erroreAltezza;
  const salva = async (e: FormEvent) => {
    e.preventDefault();
    if (!pronta || inCorso.current) return;
    inCorso.current = true;
    setSalvando(true);
    setErrore("");
    try {
      await onSalva(creaVarianteSpostamentoBagno(documento, {
        livelloId: piano.id, daVariante:baseId, origineId: origine, destinazioneId: destinazione,
        confermaBagno, sanitari, altezzaRivestimentoCm: altezza ?? undefined,
      }));
    } catch (error) {
      setErrore(error instanceof Error ? error.message : t("La variante non è stata salvata."));
    } finally {
      setSalvando(false);
      inCorso.current = false;
    }
  };
  return <Dialog open onOpenChange={aperto => { if (!aperto && !inCorso.current) onChiudi(); }}>
    <DialogContent ampiezza="spazio">
      <DialogHeader>
        <DialogTitle>{t("Sposta bagno")}</DialogTitle>
        <DialogDescription>{t("{nome} · Scegli i due locali. Il vecchio bagno diventa un ripostiglio.", { nome: String(piano.nome ?? "") })}</DialogDescription>
      </DialogHeader>
      <form onSubmit={salva} className="space-y-5">
        <fieldset disabled={salvando} className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-3.5">
            {daVariante && <div className="space-y-1.5">
              <Label htmlFor="bagno-base">{t("Parti da")}</Label>
              <UniformSelect id="bagno-base" value={baseId ?? ""} onChange={e => {
                const id = e.target.value || undefined;
                setBaseId(id);
                const riconosciuti = localiPerSpostamento(piano,id).origini.filter(l => l.destinazione === "bagno");
                setOrigine(riconosciuti.length === 1 ? riconosciuti[0].id : "");
                setDestinazione("");
                setConfermaBagno(false);
              }}>
                <option value="">{t("Stato di fatto")}</option>
                {piano.proposte.filter(p => p.id === daVariante).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </UniformSelect>
            </div>}
            <div className="space-y-1.5">
              <Label htmlFor="bagno-attuale">{t("Bagno attuale")}</Label>
              <UniformSelect id="bagno-attuale" value={origine} onChange={e => {
                const id = e.target.value;
                setOrigine(id);
                setConfermaBagno(false);
                if (id === destinazione) setDestinazione("");
              }}>
                <option value="">{t("Scegli il locale")}</option>
                {!!bagni.length && <optgroup label={t("Bagni")}>{bagni.map(l => <option key={l.id} value={l.id}>{nomeLocale(l)}</option>)}</optgroup>}
                {!!altri.length && <optgroup label={t("Altri locali")}>{altri.map(l => <option key={l.id} value={l.id}>{nomeLocale(l)}</option>)}</optgroup>}
              </UniformSelect>
              {attuale && attuale.destinazione !== "bagno" && <label className="flex items-start gap-2 text-sm">
                <input className="mt-1 accent-primary" type="checkbox" checked={confermaBagno} onChange={e => setConfermaBagno(e.target.checked)} />
                {t("Confermo che il locale è il bagno attuale.")}
              </label>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bagno-destinazione">{t("Locale del nuovo bagno")}</Label>
              <UniformSelect id="bagno-destinazione" value={destinazione} onChange={e => setDestinazione(e.target.value)}>
                <option value="">{t("Scegli il locale")}</option>
                {destinazioni.filter(l => l.id !== origine).map(l => <option key={l.id} value={l.id}>{nomeLocale(l)}</option>)}
              </UniformSelect>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">{t("Sanitari previsti")}</legend>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {SANITARI_BAGNO.map(tipo => <label key={tipo} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="accent-primary" checked={sanitari.includes(tipo)} onChange={e =>
                    setSanitari(e.target.checked ? [...sanitari, tipo] : sanitari.filter(s => s !== tipo))} />
                  {NOMI_SANITARI[tipo]}
                </label>)}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="bagno-rivestimento">{t("Altezza del rivestimento")} <span className="text-muted-foreground">{t("(facoltativa)")}</span></Label>
              <Input id="bagno-rivestimento" placeholder={t("Es. 1,20 m")} value={rivestimento} onChange={e => setRivestimento(e.target.value)}
                aria-invalid={erroreAltezza} aria-describedby={erroreAltezza ? "bagno-errore-altezza" : undefined} />
              {erroreAltezza && <p id="bagno-errore-altezza" className="text-sm text-destructive">{t("Inserisci un’altezza positiva entro quella del locale.")}</p>}
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <TavolaInterattiva documento={documento} livelloId={piano.id} ambito={baseId ? `progetto:${baseId}` : "fatto"}
              selezionato={origine} evidenzaLocali={destinazione ? [destinazione] : []} comandi
              className="h-[clamp(165px,34vh,295px)] rounded-xl border" />
            <p className="text-xs text-muted-foreground">{t("Le posizioni proposte dei sanitari sono indicative. Adduzioni, scarichi e aerazione si completano dopo il rilievo.")}</p>
          </div>
        </fieldset>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={salvando} onClick={onChiudi}>{t("Annulla")}</Button>
          <Button type="submit" disabled={!pronta || salvando}>{salvando ? t("Salvataggio…") : t("Salva variante")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
