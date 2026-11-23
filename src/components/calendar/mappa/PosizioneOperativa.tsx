import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { coordinate, type Coordinate } from "../../../../shared/mappa-operativa/calcoli";
import type { VoceMappa } from "./dati";
import { servizioMappa, type Ambito, type PuntoIndirizzo } from "./servizio";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  company: string; ambito: Ambito; voce?: VoceMappa; indirizzoIniziale?: string; partenza?: boolean;
  punto: Coordinate | null; onPunto: (p: Coordinate | null) => void;
  onSalva: (p: Coordinate, indirizzo?: string) => void; onChiudi: () => void;
}

export default function PosizioneOperativa({ company, ambito, voce, indirizzoIniziale, partenza, punto, onPunto, onSalva, onChiudi }: Props) {
  const t = useT();
  const [indirizzo, setIndirizzo] = useState(voce?.indirizzo ?? indirizzoIniziale ?? "");
  const [risultati, setRisultati] = useState<PuntoIndirizzo[]>();
  const [testoCoordinate, setTestoCoordinate] = useState<{ lat: string; lng: string; punto: Coordinate | null }>();
  const [scelta, setScelta] = useState<Coordinate | null>(null);
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState("");
  const datiManuali = testoCoordinate?.punto === punto ? testoCoordinate : undefined;
  const lat = datiManuali?.lat ?? (punto ? String(punto.lat) : "");
  const lng = datiManuali?.lng ?? (punto ? String(punto.lng) : "");
  const conferma = lat.trim() && lng.trim() ? coordinate(Number(lat.replace(",", ".")), Number(lng.replace(",", "."))) : null;
  const aggiorna = (latitude: string, longitude: string) => {
    const punto = latitude.trim() && longitude.trim() ? coordinate(Number(latitude.replace(",", ".")), Number(longitude.replace(",", "."))) : null;
    setTestoCoordinate({ lat: latitude, lng: longitude, punto });
    setScelta(null);
    onPunto(punto);
  };

  const cerca = async () => {
    setAttesa(true);
    setErrore("");
    setRisultati(undefined);
    try {
      const data = await servizioMappa<{ risultati: PuntoIndirizzo[] }>(company, ambito, { azione: "indirizzo", indirizzo });
      setRisultati(data.risultati);
    } catch (e) { setErrore((e as Error).message); }
    finally { setAttesa(false); }
  };

  const salva = async () => {
    if (!conferma) return;
    if (!voce) { onSalva(conferma, indirizzo.trim()); return; }
    setAttesa(true);
    setErrore("");
    try {
      const { error } = await supabase.rpc("mappa_salva_posizione", {
        p_company: company, p_tipo: voce.tipo, p_record: voce.id, p_lat: conferma.lat, p_lng: conferma.lng,
        p_fonte: scelta?.lat === conferma.lat && scelta.lng === conferma.lng ? "geocodifica confermata" : "manuale",
        p_indirizzo: voce.indirizzo,
      });
      if (error) throw error;
      onSalva(conferma);
    } catch (e) { setErrore((e as Error).message); }
    finally { setAttesa(false); }
  };

  const titolo = partenza ? t("Partenza personale") : voce ? t("Posiziona pin") : t("Destinazione della ricerca");
  return <section aria-label={titolo} className="space-y-3 rounded-lg border bg-card p-3">
    <div className="flex items-center gap-2 font-medium"><MapPin className="size-4" />{titolo}</div>
    {!partenza && <div className="flex flex-wrap gap-2">
      <Input className="min-w-40 flex-1" aria-label={t("Via, civico, CAP e comune")}
        value={indirizzo} onChange={e => { setIndirizzo(e.target.value); setRisultati(undefined); }} maxLength={280} placeholder={t("Via, civico, CAP e comune")} />
      <Button type="button" variant="outline" onClick={() => void cerca()} disabled={attesa || indirizzo.trim().length < 7}><Search className="size-4" /> {t("Cerca indirizzo")}</Button>
    </div>}
    {risultati && <div className="grid gap-1" aria-live="polite">
      {risultati.length ? <p className="text-xs text-muted-foreground">{risultati.length > 1 ? t("Indirizzo ambiguo. Conferma il risultato corretto.") : t("Verifica il risultato prima di confermare.")}</p>
        : <p className="text-sm">{t("Indirizzo irraggiungibile. Posiziona il punto sulla mappa o inserisci le coordinate.")}</p>}
      {risultati.map(r => <Button key={`${r.lat}:${r.lng}:${r.etichetta}`} variant="ghost" type="button" className="h-auto justify-start whitespace-normal text-left"
        onClick={() => { setTestoCoordinate(undefined); onPunto(r); setScelta(r); }}>{r.etichetta}{r.civico ? "" : ` · ${t("civico non verificato")}`}</Button>)}
    </div>}
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1 text-xs">{t("Latitudine")}<Input value={lat} inputMode="decimal" onChange={e => aggiorna(e.target.value, lng)} /></label>
      <label className="space-y-1 text-xs">{t("Longitudine")}<Input value={lng} inputMode="decimal" onChange={e => aggiorna(lat, e.target.value)} /></label>
    </div>
    <p className="text-xs text-muted-foreground">{voce ? t("Puoi scegliere il punto sulla mappa. Per aggiornare l’indirizzo, apri la scheda.") : partenza ? t("Scegli il punto sulla mappa. Vale per questa giornata e questa sessione.") : t("Puoi scegliere il punto sulla mappa.")}</p>
    {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" onClick={onChiudi}>{t("Annulla")}</Button>
      <Button type="button" onClick={() => void salva()} disabled={attesa || !conferma}>{partenza ? t("Usa come partenza") : voce ? t("Salva pin") : t("Usa come destinazione")}</Button>
    </div>
  </section>;
}
