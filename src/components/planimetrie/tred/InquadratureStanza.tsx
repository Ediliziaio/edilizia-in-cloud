import { useEffect, useId, useState } from "react";
import { Bookmark, Focus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { eliminaInquadratura, leggiInquadrature, salvaInquadratura, type InquadraturaSalvata, type StanzaDaInquadrare } from "@/lib/planimetrie/renderVisitaArchivio";

type CameraSalvata = Pick<InquadraturaSalvata, "telecamera" | "proporzioni">;

export function InquadratureStanza({ stanza, nomeStanza, onLeggiCamera, onRiprendi, onRender }: {
  stanza: StanzaDaInquadrare;
  nomeStanza: string;
  onLeggiCamera: () => CameraSalvata | null;
  onRiprendi: (vista: InquadraturaSalvata) => boolean;
  onRender?: (vista: InquadraturaSalvata) => boolean;
}) {
  const [aperte, setAperte] = useState(false);
  const [nome, setNome] = useState("");
  const [viste, setViste] = useState<InquadraturaSalvata[]>([]);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState("");
  const idNome = useId();
  const { planimetriaId, livelloId, localeId } = stanza;
  useEffect(() => {
    if (!aperte) return;
    let chiuso = false;
    void leggiInquadrature({ planimetriaId, livelloId, localeId }).then(v => {
      if (!chiuso) { setViste(v); setErrore(""); }
    }).catch(() => { if (!chiuso) setErrore("Archivio del browser da riprovare."); });
    return () => { chiuso = true; };
  }, [aperte, planimetriaId, livelloId, localeId]);

  const aggiorna = async (lavoro: () => Promise<void>) => {
    if (occupato) return;
    setOccupato(true);
    setErrore("");
    try {
      await lavoro();
      setViste(await leggiInquadrature(stanza));
    } catch {
      setErrore("Archivio del browser da riprovare.");
    } finally {
      setOccupato(false);
    }
  };

  return <Popover open={aperte} onOpenChange={aperto => { setErrore(""); setAperte(aperto); }}>
    <PopoverTrigger asChild><Button type="button" size="sm" variant="outline"><Bookmark aria-hidden="true" />Inquadrature</Button></PopoverTrigger>
    <PopoverContent className="w-80 space-y-3">
      <h3 className="text-sm font-semibold">{nomeStanza}</h3>
      <form className="space-y-1.5" onSubmit={e => {
        e.preventDefault();
        const camera = onLeggiCamera();
        if (!camera) { setErrore("Porta la camera dentro questa stanza per salvare la vista."); return; }
        if (!nome.trim()) return;
        void aggiorna(async () => {
          await salvaInquadratura(stanza, { id: crypto.randomUUID(), nome: nome.trim(), ...camera });
          setNome("");
        });
      }}>
        <Label htmlFor={idNome}>Nome dell’inquadratura</Label>
        <div className="flex items-center gap-1.5">
          <Input id={idNome} className="h-8" value={nome} onChange={e => setNome(e.target.value)} maxLength={60} placeholder="Es. Verso il balcone" />
          <Button type="submit" size="sm" disabled={!nome.trim() || occupato}>Salva</Button>
        </div>
      </form>
      {errore && <p role="alert" className="text-xs text-destructive">{errore}</p>}
      {!!viste.length && <ul className="max-h-48 divide-y overflow-y-auto border-t">
        {viste.map(v => <li key={v.id} className="flex items-center gap-1 py-1">
          <span className="min-w-0 flex-1 truncate text-sm" title={v.nome}>{v.nome}</span>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Riprendi ${v.nome}`} title="Riprendi in 3D" onClick={() => {
            if (onRiprendi(v)) setAperte(false);
            else setErrore("La camera è fuori dal locale nella versione aperta.");
          }}><Focus aria-hidden="true" /></Button>
          {onRender && <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Render di ${v.nome}`} title="Render dalla stessa camera" onClick={() => {
            if (onRender(v)) setAperte(false);
            else setErrore("La camera è fuori dal locale nella versione aperta.");
          }}><Sparkles aria-hidden="true" /></Button>}
          <Button type="button" variant="ghost" size="icon" className="size-8" disabled={occupato} aria-label={`Elimina ${v.nome}`}
            onClick={() => void aggiorna(() => eliminaInquadratura(stanza, v.id))}><Trash2 aria-hidden="true" /></Button>
        </li>)}
      </ul>}
    </PopoverContent>
  </Popover>;
}
