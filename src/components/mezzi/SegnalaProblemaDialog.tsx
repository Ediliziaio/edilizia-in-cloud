/**
 * «Segnala un problema» dal telefono: guasto, danno o altro, con le foto.
 * Arriva all'ufficio in campanella (trigger mezzi_segnalazione_avvisa). Lo può
 * mandare chi ha il mezzo in carico, e chi ne ha appena letto il QR (anche se
 * l'attrezzo è di un altro: migrazione 20281005180000).
 */
import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInviaSegnalazione } from "@/hooks/useMezzi";
import type { SegnalazioneTipo } from "@/types/mezzi";
import { cn } from "@/lib/utils";

const MAX_FOTO = 6;

interface Props {
  mezzoId: string;
  /** L'azienda del mezzo: le foto vanno nella sua cartella (chi lavora per due aziende). */
  companyId?: string;
  nome: string;
  targa?: string | null;
  onClose: () => void;
}

const TIPI_PROBLEMA: { value: SegnalazioneTipo; label: string }[] = [
  { value: "guasto", label: "Guasto" },
  { value: "danno", label: "Danno o incidente" },
  { value: "altro", label: "Altro" },
];

export function SegnalaProblemaDialog({ mezzoId, companyId, nome, targa, onClose }: Props) {
  const invia = useInviaSegnalazione(mezzoId, companyId);
  const [tipo, setTipo] = useState<SegnalazioneTipo>("guasto");
  const [descrizione, setDescrizione] = useState("");
  const [foto, setFoto] = useState<File[]>([]);

  // Anteprime: un link locale per foto, liberato quando cambiano o si chiude.
  const anteprime = useMemo(() => foto.map((f) => URL.createObjectURL(f)), [foto]);
  useEffect(() => () => anteprime.forEach((u) => URL.revokeObjectURL(u)), [anteprime]);

  const aggiungi = (lista: FileList | null) => {
    if (!lista) return;
    const immagini = [...lista].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const spazio = MAX_FOTO - foto.length;
    if (immagini.length > spazio) toast.info(`Al massimo ${MAX_FOTO} foto per segnalazione.`);
    setFoto((prev) => [...prev, ...immagini.slice(0, Math.max(0, spazio))]);
  };

  const valido = descrizione.trim().length >= 3;

  const manda = async () => {
    if (!valido) return;
    try {
      await invia.mutateAsync({ tipo, descrizione, files: foto });
      onClose();
    } catch {
      // l'errore lo mostra la mutation (anche «arrivata senza foto»)
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !invia.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Segnala un problema</DialogTitle>
          <DialogDescription>{nome}{targa ? ` · ${targa}` : ""}. Arriva subito all'ufficio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo di problema">
            {TIPI_PROBLEMA.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={tipo === t.value}
                onClick={() => setTipo(t.value)}
                className={cn(
                  "min-h-[44px] rounded-xl border px-2 text-xs font-semibold transition-colors",
                  tipo === t.value ? "border-slate-900 bg-slate-900 text-white" : "bg-background text-foreground hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="campo-segnala-testo">Cosa succede</Label>
            <Textarea
              id="campo-segnala-testo"
              rows={4}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder={tipo === "danno" ? "es. graffio sulla fiancata destra in retromarcia" : "es. spia motore accesa da stamattina"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="campo-segnala-foto">Foto ({foto.length}/{MAX_FOTO})</Label>
            {anteprime.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {anteprime.map((u, i) => (
                  <div key={u} className="relative">
                    <img src={u} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border object-cover" />
                    <button
                      type="button"
                      onClick={() => setFoto((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                      aria-label={`Togli la foto ${i + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {foto.length < MAX_FOTO && (
              <label
                htmlFor="campo-segnala-foto"
                className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-foreground hover:bg-muted"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />Scatta o scegli foto
              </label>
            )}
            <input
              id="campo-segnala-foto"
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                aggiungi(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={invia.isPending}>Annulla</Button>
          <Button onClick={manda} disabled={!valido || invia.isPending}>
            {invia.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Invia all'ufficio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
