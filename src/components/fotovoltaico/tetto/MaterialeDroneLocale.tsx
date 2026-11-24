import { useEffect, useRef, useState } from "react";
import { validaFotoDrone } from "./materialeDrone";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
type Foto = {
    id: string;
    nome: string;
    url: string;
};
/** Foto di riferimento temporanee: nessun invio a servizi esterni o uso metrico. */
export function MaterialeDroneLocale() {
  const t = useT();
    const [foto, setFoto] = useState<Foto[]>([]), [attiva, setAttiva] = useState<string | null>(null), [errore, setErrore] = useState("");
    const urls = useRef(new Set<string>());
    useEffect(() => { const attuali = urls.current; return () => { attuali.forEach(url => URL.revokeObjectURL(url)); attuali.clear(); }; }, []);
    const selezionata = foto.find(f => f.id === attiva) ?? foto[0];
    return <div className="fv-drone-panel"><strong>{t("Foto del drone · riferimento visivo")}</strong><p className="fv-roof-photo-note">{t("Carica fino a 4 immagini per controllare tegole, camini e dettagli. Restano in questa finestra di lavoro e non vengono inviate né salvate nel preventivo.")}</p>
    <label className="fv-drone-upload">{t("Aggiungi immagini del drone")}<input aria-label={t("Immagini del drone")} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={foto.length >= 4} onChange={e => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length)
                return;
            if (files.length + foto.length > 4) {
                setErrore(t("Puoi tenere al massimo 4 immagini nella sessione."));
                return;
            }
            const problema = files.map(validaFotoDrone).find(Boolean);
            if (problema) {
                setErrore(problema);
                return;
            }
            const nuove = files.map(file => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: crypto.randomUUID(), nome: file.name, url }; });
            setFoto(prev => [...prev, ...nuove]);
            setAttiva(nuove[0].id);
            setErrore("");
        }}/></label>{errore && <p role="alert" className="fv-roof-photo-note">{errore}</p>}
    {selezionata ? <><div className="fv-drone-gallery">{foto.map(f => <button type="button" key={f.id} aria-pressed={f.id === selezionata.id} onClick={() => setAttiva(f.id)}>{f.nome}</button>)}</div><img className="fv-drone-reference" src={selezionata.url} alt={t("Foto di riferimento: {nome}", { nome: String(selezionata.nome ?? "") })} onError={() => setErrore(t("Immagine non leggibile: esportala come JPG, PNG o WebP."))}/><button type="button" onClick={() => { URL.revokeObjectURL(selezionata.url); urls.current.delete(selezionata.url); setFoto(prev => prev.filter(f => f.id !== selezionata.id)); setAttiva(null); }}>{t("Rimuovi immagine selezionata")}</button></> : <div className="fv-drone-empty">{t("Le foto del drone compariranno qui, separate dalla base metrica del tetto.")}</div>}
    <p className="fv-roof-photo-note"><strong>{t("Per usarle nel disegno metrico:")}</strong> {t("serve un’ortofoto con scala e georeferenziazione, oppure l’allineamento verificato alla falda. Un rilievo fotogrammetrico con più scatti sovrapposti può fornire anche superfici e quote 3D. Il caricamento qui è solo visivo.")}</p>
  </div>;
}
