import { useMemo, useRef, useState } from "react";
import { Camera, Images, X } from "lucide-react";
import { AnteprimaFotoCampo } from "@/components/campo/AnteprimaFotoCampo";
import { Button } from "@/components/ui/button";
import { MAX_FOTO_TECNICHE, TIPI_FOTO_TECNICHE, type FotoTecnica } from "@/lib/campo/bozzaTecnica";
import { preparaFoto } from "@/lib/campo/preparaFoto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function FotoBozzaTecnica({ foto, onChange, onBusy, disabled }: {
  foto: FotoTecnica[]; onChange: (foto: FotoTecnica[]) => void; onBusy: (busy: boolean) => void; disabled: boolean;
}) {
  const t = useT();
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const inCorso = useRef(false);
  const [prepara, setPrepara] = useState(false);
  const pieno = disabled || prepara || foto.length >= MAX_FOTO_TECNICHE;
  const anteprime = useMemo(() => foto.map(f => new Blob([f.bytes], { type: f.contentType })), [foto]);

  async function scegli(files: File[]) {
    if (!files.length || inCorso.current) return;
    inCorso.current = true;
    onBusy(true);
    setPrepara(true);
    setAvvisi([]);
    try {
      const esito = await preparaFoto(files, { giaPresenti: foto.length, massimo: MAX_FOTO_TECNICHE });
      const pronte = esito.pronte.filter(f => f.blob.size > 0 && TIPI_FOTO_TECNICHE.includes(f.contentType));
      const aggiunte: FotoTecnica[] = [];
      // Memorizza i byte, come per i rapportini, anche nelle WebView che non clonano i Blob.
      for (const { blob, ...file } of pronte) aggiunte.push({ ...file, bytes: await blob.arrayBuffer() });
      if (aggiunte.length) onChange([...foto, ...aggiunte]);
      setAvvisi([
        // Gli stessi avvisi di avvisiPreparazione (lib/campo/preparaFoto), nella lingua dell'operaio.
        ...(esito.oltreLimite > 0 ? [t(esito.oltreLimite === 1 ? "Massimo {max} foto: {n} foto non è stata aggiunta." : "Massimo {max} foto: {n} foto non sono state aggiunte.", { max: MAX_FOTO_TECNICHE, n: esito.oltreLimite })] : []),
        ...(esito.troppoPesanti > 0 ? [t(esito.troppoPesanti === 1 ? "{n} foto è troppo pesante anche dopo la compressione: scattala di nuovo dall'app." : "{n} foto sono troppo pesanti anche dopo la compressione: scattale di nuovo dall'app.", { n: esito.troppoPesanti })] : []),
        ...(esito.nonImmagini > 0 ? [t(esito.nonImmagini === 1 ? "{n} file non è una foto." : "{n} file non sono foto.", { n: esito.nonImmagini })] : []),
        ...(esito.pronte.length !== pronte.length ? [t("Alcune foto non si aprono. Scattale di nuovo o scegli JPG, PNG o WebP.")] : []),
      ]);
    } catch {
      setAvvisi([t("Impossibile preparare le foto. Riprova.")]);
    } finally {
      inCorso.current = false;
      onBusy(false);
      setPrepara(false);
    }
  }

  return <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      {([{ nome: t("Scatta"), label: t("Scatta una foto"), icona: Camera, scatta: true },
        { nome: t("Galleria"), label: t("Scegli foto dalla galleria"), icona: Images, scatta: false }]).map(opzione => (
        <label key={opzione.nome} className="flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-1 text-sm font-medium focus-within:ring-2 focus-within:ring-primary has-[:disabled]:opacity-60">
          <opzione.icona className="size-4 shrink-0" aria-hidden="true" /> {opzione.nome}
          <input aria-label={opzione.label} type="file" className="sr-only" accept="image/*"
            capture={opzione.scatta ? "environment" : undefined} multiple={!opzione.scatta}
            disabled={pieno} onChange={event => {
              void scegli(Array.from(event.target.files ?? []));
              event.target.value = "";
            }} />
        </label>
      ))}
    </div>
    {foto.length > 0 && <ul aria-label={t("Foto da allegare")} className="grid grid-cols-4 gap-2">
      {foto.map((f, i) => <li key={f.nomeFile} className="relative aspect-square min-w-0">
        <AnteprimaFotoCampo foto={anteprime[i]} etichetta={t("Foto {n}", { n: i + 1 })} />
        <Button type="button" size="icon" variant="secondary" className="absolute right-0 top-0 size-10"
          aria-label={t("Rimuovi foto {n}", { n: i + 1 })} disabled={disabled || prepara}
          onClick={() => onChange(foto.filter(presente => presente !== f))}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </li>)}
    </ul>}
    {prepara ? <p role="status" className="text-xs text-muted-foreground">{t("Preparo le foto…")}</p>
      : avvisi.length > 0 && <p role="status" className="text-xs text-muted-foreground">{avvisi.join(" ")}</p>}
  </div>;
}
