/**
 * Le categorie degli attrezzi dell'azienda: si rinominano, se ne aggiungono,
 * si tolgono (gli attrezzi restano, senza categoria). Le predefinite sono un
 * punto di partenza, non un vincolo.
 */
import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEliminaCategoria, useMezziCategorie, useSalvaCategoria } from "@/hooks/useMezzi";
import type { MezzoCategoria } from "@/types/mezzi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quanti attrezzi ha ogni categoria, per dire cosa succede togliendola. */
  conteggi: Map<string, number>;
}

export function CategorieAttrezziDialog({ open, onOpenChange, conteggi }: Props) {
  const { data: categorie = [], isLoading } = useMezziCategorie();
  const salva = useSalvaCategoria();
  const elimina = useEliminaCategoria();
  const [nuova, setNuova] = useState("");
  const [daTogliere, setDaTogliere] = useState<string | null>(null);

  const attrezzi = categorie.filter((c) => c.classe === "attrezzatura");

  const aggiungi = () => {
    const nome = nuova.trim();
    if (!nome) return;
    const ordine = Math.max(0, ...attrezzi.map((c) => c.ordine)) + 10;
    salva.mutate({ nome, classe: "attrezzatura", ordine }, { onSuccess: () => setNuova("") });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categorie degli attrezzi</DialogTitle>
          <DialogDescription>Per raggruppare e filtrare l'elenco. Togliendo una categoria i suoi attrezzi restano, senza categoria.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <ul className="space-y-1.5">
            {attrezzi.map((c) => (
              <RigaCategoria
                key={c.id}
                categoria={c}
                quanti={conteggi.get(c.id) ?? 0}
                confermaTogli={daTogliere === c.id}
                onChiediTogli={() => setDaTogliere(c.id)}
                onAnnullaTogli={() => setDaTogliere(null)}
                onTogli={() => elimina.mutate(c.id, { onSettled: () => setDaTogliere(null) })}
                onRinomina={(nome) => salva.mutate({ id: c.id, nome })}
              />
            ))}
          </ul>
        )}

        <form
          className="flex gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            aggiungi();
          }}
        >
          <Input value={nuova} onChange={(e) => setNuova(e.target.value)} placeholder="Nuova categoria, es. Saldatrici" aria-label="Nuova categoria" />
          <Button type="submit" disabled={!nuova.trim() || salva.isPending} className="shrink-0">
            {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1 max-sm:hidden">Aggiungi</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RigaCategoria({
  categoria, quanti, confermaTogli, onChiediTogli, onAnnullaTogli, onTogli, onRinomina,
}: {
  categoria: MezzoCategoria;
  quanti: number;
  confermaTogli: boolean;
  onChiediTogli: () => void;
  onAnnullaTogli: () => void;
  onTogli: () => void;
  onRinomina: (nome: string) => void;
}) {
  const [nome, setNome] = useState(categoria.nome);
  const cambiato = nome.trim() !== categoria.nome && nome.trim().length > 0;

  if (confermaTogli) {
    return (
      <li className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-sm">
        <span className="min-w-0 flex-1 text-red-800">
          Togliere «{categoria.nome}»?{quanti > 0 ? ` ${quanti} ${quanti === 1 ? "attrezzo resta" : "attrezzi restano"} senza categoria.` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={onAnnullaTogli}>No</Button>
        <Button size="sm" variant="destructive" onClick={onTogli}>Togli</Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cambiato) onRinomina(nome.trim());
        }}
        aria-label={`Nome della categoria ${categoria.nome}`}
        className="h-9"
      />
      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground" title="Attrezzi in questa categoria">{quanti}</span>
      {cambiato ? (
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => onRinomina(nome.trim())} aria-label="Salva il nome">
          <Check className="h-4 w-4 text-emerald-600" />
        </Button>
      ) : (
        <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={onChiediTogli} aria-label={`Togli ${categoria.nome}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  );
}
