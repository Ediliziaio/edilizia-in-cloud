import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { GRUPPI_CONFIGURAZIONI } from "@/lib/serramenti/catalogoConfigurazioni";
import { leggiConfigurazioneFornitore, type ConfigurazioneListinoFornitore } from "@/lib/serramenti/fornitureConfigurazione";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Props = {
  nomeVoce: string;
  corrente?: ConfigurazioneListinoFornitore | null;
  onChiudi: () => void;
  onSalva: (valore: ConfigurazioneListinoFornitore | null) => void;
};

export function ConfigurazioneVoceSerramento({ nomeVoce, corrente, onChiudi, onSalva }: Props) {
  const t = useT();
  const [tipologia, setTipologia] = useState(corrente?.tipologia ?? "");
  const [serie, setSerie] = useState(corrente?.serie ?? "");
  const [specifiche, setSpecifiche] = useState(corrente?.specifiche ?? "");
  const [vendita, setVendita] = useState(corrente?.vendita.toString() ?? "");
  const [iva, setIva] = useState(corrente?.iva_acquisto.toString() ?? "22");
  const [larghezza, setLarghezza] = useState(corrente?.larghezza_mm?.toString() ?? "");
  const [altezza, setAltezza] = useState(corrente?.altezza_mm?.toString() ?? "");
  const numero = (valore: string) => valore.trim() ? Number(valore.replace(",", ".")) : null;
  const dati = leggiConfigurazioneFornitore({
    tipologia, serie, specifiche, vendita: numero(vendita), iva_acquisto: numero(iva),
    larghezza_mm: numero(larghezza), altezza_mm: numero(altezza),
  });

  return (
    <Dialog open onOpenChange={(aperto) => { if (!aperto) onChiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Collega al disegno")}</DialogTitle>
          <DialogDescription>{t("{nome} · Il prezzo di acquisto e il codice arrivano dalla riga fornitore.", { nome: nomeVoce || t("Voce del listino") })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="listino-fornitore-tipologia">{t("Configurazione dell’editor")}</Label>
            <UniformSelect id="listino-fornitore-tipologia" className="h-9 w-full rounded-md border bg-background px-2"
              value={tipologia} onChange={(e) => setTipologia(e.target.value)}>
              <option value="">{t("Scegli una configurazione")}</option>
              {GRUPPI_CONFIGURAZIONI.map((gruppo) => (
                <optgroup key={gruppo.titolo} label={gruppo.titolo}>
                  {gruppo.voci.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                </optgroup>
              ))}
            </UniformSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="listino-fornitore-serie">{t("Serie o modello")}</Label>
            <Input id="listino-fornitore-serie" value={serie} maxLength={160} onChange={(e) => setSerie(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="listino-fornitore-vendita">{t("Vendita netta per unità €")}</Label>
              <Input id="listino-fornitore-vendita" inputMode="decimal" value={vendita} onChange={(e) => setVendita(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="listino-fornitore-iva">{t("IVA acquisto %")}</Label>
              <Input id="listino-fornitore-iva" inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="listino-fornitore-larghezza">{t("Larghezza esatta (mm)")}</Label>
              <Input id="listino-fornitore-larghezza" inputMode="numeric" value={larghezza} onChange={(e) => setLarghezza(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="listino-fornitore-altezza">{t("Altezza esatta (mm)")}</Label>
              <Input id="listino-fornitore-altezza" inputMode="numeric" value={altezza} onChange={(e) => setAltezza(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("Lascia le due misure vuote per una tariffa a pezzo o a m². Compilale entrambe per un prezzo riservato a quella misura.")}</p>
          <div className="space-y-1">
            <Label htmlFor="listino-fornitore-specifiche">{t("Specifiche tecniche")}</Label>
            <Textarea id="listino-fornitore-specifiche" value={specifiche} rows={3} maxLength={1200}
              onChange={(e) => setSpecifiche(e.target.value)} placeholder={t("Profilo, vetro, finitura e dotazione compresi nel prezzo")} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {corrente && <Button variant="ghost" className="sm:mr-auto" onClick={() => onSalva(null)}>{t("Scollega")}</Button>}
          <Button variant="outline" onClick={onChiudi}>{t("Annulla")}</Button>
          <Button disabled={!dati} onClick={() => { if (dati) onSalva(dati); }}>{t("Collega configurazione")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
