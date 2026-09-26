/**
 * Foto del mezzo: galleria con copertina. Dal telefono si sceglie se scattare
 * o prendere dalla galleria; le foto si comprimono prima di partire. Quelle arrivate con una
 * segnalazione dal campo stanno qui insieme, con l'etichetta.
 */
import { useRef, useState } from "react";
import { Camera, ImageOff, Loader2, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useCaricaFotoMezzo, useEliminaFotoMezzo, useImpostaCopertina, useMezzoFoto, type FotoConLink,
} from "@/hooks/useMezzi";
import { formatData, giornoItaliano } from "@/types/mezzi";

interface Props {
  mezzoId: string;
  copertina: string | null;
  puoModificare: boolean;
}

export function MezzoFotoSection({ mezzoId, copertina, puoModificare }: Props) {
  const { data: foto = [], isLoading, error, refetch } = useMezzoFoto(mezzoId);
  const carica = useCaricaFotoMezzo(mezzoId);
  const impostaCopertina = useImpostaCopertina(mezzoId);
  const elimina = useEliminaFotoMezzo(mezzoId);
  const input = useRef<HTMLInputElement>(null);
  const [aperta, setAperta] = useState<FotoConLink | null>(null);
  const [daEliminare, setDaEliminare] = useState<FotoConLink | null>(null);

  const scegli = (files: FileList | null) => {
    const lista = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (lista.length) carica.mutate({ files: lista });
    if (input.current) input.current.value = "";
  };

  return (
    <div className="space-y-3 max-sm:space-y-2">
      <div className="flex items-center justify-between gap-2 max-sm:justify-end">
        <p className="text-sm text-muted-foreground max-sm:hidden">Com'è il mezzo, danni, targhette: le foto restano qui.</p>
        {puoModificare && (
          <>
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => scegli(e.target.files)}
              aria-label="Scegli le foto da caricare"
            />
            <Button size="sm" onClick={() => input.current?.click()} disabled={carica.isPending} className="shrink-0 max-sm:h-8 max-sm:text-xs">
              {carica.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
              Aggiungi foto
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare le foto.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : foto.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground max-sm:py-4">
          <Camera className="mx-auto mb-2 h-8 w-8 opacity-40 max-sm:hidden" />
          Nessuna foto<span className="max-sm:hidden">. La prima che carichi diventa la copertina del mezzo</span>.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {foto.map((f) => {
            const eCopertina = f.file_path === copertina;
            return (
              <li key={f.id} className="group relative overflow-hidden rounded-xl border bg-muted">
                <button type="button" className="block aspect-[4/3] w-full" onClick={() => setAperta(f)} aria-label="Apri la foto">
                  {f.url ? (
                    <img src={f.url} alt={f.didascalia ?? "Foto del mezzo"} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageOff className="h-6 w-6" /></span>
                  )}
                </button>
                <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-1 p-1.5">
                  {eCopertina && <Badge className="bg-orange-500 text-[10px] text-white hover:bg-orange-500">Copertina</Badge>}
                  {f.segnalazione_id && <Badge variant="secondary" className="text-[10px]">Dal campo</Badge>}
                </div>
                <p className="px-2 py-1 text-[11px] text-muted-foreground">{formatData(giornoItaliano(f.created_at))}</p>
                {puoModificare && (
                  <div className="absolute bottom-7 right-1.5 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    {!eCopertina && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 shadow"
                        onClick={() => impostaCopertina.mutate(f.file_path)}
                        aria-label="Usa come copertina"
                        title="Usa come copertina"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 text-destructive shadow"
                      onClick={() => setDaEliminare(f)}
                      aria-label="Elimina la foto"
                      title="Elimina"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!aperta} onOpenChange={(o) => !o && setAperta(null)}>
        <DialogContent className="max-w-4xl border-0 bg-black p-0">
          <DialogTitle className="sr-only">Foto del mezzo</DialogTitle>
          {aperta?.url && <img src={aperta.url} alt={aperta.didascalia ?? "Foto del mezzo"} className="max-h-[85vh] w-full object-contain" />}
          <button
            type="button"
            onClick={() => setAperta(null)}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la foto?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare?.file_path === copertina ? "È la copertina: il mezzo resterà senza finché non ne scegli un'altra." : "La foto si cancella definitivamente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
