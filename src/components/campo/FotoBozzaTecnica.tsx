import { useMemo, useRef, useState } from "react";
import { Camera, Images, X } from "lucide-react";
import { AnteprimaFotoCampo } from "@/components/campo/AnteprimaFotoCampo";
import { Button } from "@/components/ui/button";
import { MAX_FOTO_TECNICHE, TIPI_FOTO_TECNICHE, type FotoTecnica } from "@/lib/campo/bozzaTecnica";
import { avvisiPreparazione, preparaFoto } from "@/lib/campo/preparaFoto";

export function FotoBozzaTecnica({ foto, onChange, onBusy, disabled }: {
  foto: FotoTecnica[]; onChange: (foto: FotoTecnica[]) => void; onBusy: (busy: boolean) => void; disabled: boolean;
}) {
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
        ...avvisiPreparazione(esito, MAX_FOTO_TECNICHE),
        ...(esito.pronte.length !== pronte.length ? ["Alcune foto non si aprono. Scattale di nuovo o scegli JPG, PNG o WebP."] : []),
      ]);
    } catch {
      setAvvisi(["Impossibile preparare le foto. Riprova."]);
    } finally {
      inCorso.current = false;
      onBusy(false);
      setPrepara(false);
    }
  }

  return <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      {([{ nome: "Scatta", label: "Scatta una foto", icona: Camera, scatta: true },
        { nome: "Galleria", label: "Scegli foto dalla galleria", icona: Images, scatta: false }]).map(opzione => (
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
    {foto.length > 0 && <ul aria-label="Foto da allegare" className="grid grid-cols-4 gap-2">
      {foto.map((f, i) => <li key={f.nomeFile} className="relative aspect-square min-w-0">
        <AnteprimaFotoCampo foto={anteprime[i]} etichetta={`Foto ${i + 1}`} />
        <Button type="button" size="icon" variant="secondary" className="absolute right-0 top-0 size-10"
          aria-label={`Rimuovi foto ${i + 1}`} disabled={disabled || prepara}
          onClick={() => onChange(foto.filter(presente => presente !== f))}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </li>)}
    </ul>}
    {prepara ? <p role="status" className="text-xs text-muted-foreground">Preparo le foto…</p>
      : avvisi.length > 0 && <p role="status" className="text-xs text-muted-foreground">{avvisi.join(" ")}</p>}
  </div>;
}
