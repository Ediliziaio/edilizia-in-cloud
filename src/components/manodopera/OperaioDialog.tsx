/**
 * Nuovo operaio / modifica operaio (Manodopera e Mezzi, 26/09/2026).
 *
 * Una scheda sola: si scrive la persona; la scheda per le commesse la crea il
 * database. Il costo orario sta nel Personale (non lo vede chi organizza i
 * cantieri). Una persona che è già nel Personale con la stessa email diventa
 * operaio invece di essere doppiata.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { messaggioErroreOperai, useSalvaOperaio, type DatiOperaio } from "@/hooks/useOperai";

const MANSIONI = [
  "Muratore", "Manovale", "Carpentiere", "Capocantiere", "Elettricista", "Idraulico",
  "Serramentista", "Piastrellista", "Imbianchino", "Cartongessista", "Gruista", "Autista",
];

const CONTRATTI = [
  { value: "indeterminato", label: "Tempo indeterminato" },
  { value: "determinato", label: "Tempo determinato" },
  { value: "apprendistato", label: "Apprendistato" },
  { value: "stagionale", label: "Stagionale" },
  { value: "part_time", label: "Part time" },
  { value: "interinale", label: "Interinale" },
  { value: "partita_iva", label: "Partita IVA" },
];

export interface ValoriOperaio {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  mansione: string;
  data_assunzione: string;
  tipo_contratto: string;
}

const VUOTO: ValoriOperaio = {
  nome: "", cognome: "", telefono: "", email: "", mansione: "", data_assunzione: "",
  tipo_contratto: "indeterminato",
};

export function OperaioDialog({
  aperto,
  onAperto,
  operaioId = null,
  iniziali,
  onSalvato,
}: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  /** null = nuovo operaio. */
  operaioId?: string | null;
  iniziali?: Partial<ValoriOperaio>;
  onSalvato?: (id: string) => void;
}) {
  const salva = useSalvaOperaio();
  const [v, setV] = useState<ValoriOperaio>(VUOTO);

  useEffect(() => {
    if (!aperto) return;
    setV({ ...VUOTO, ...iniziali });
  }, [aperto, iniziali]);

  const campo = (k: keyof ValoriOperaio) => ({
    id: `operaio-${k}`,
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value })),
  });

  const nuovo = operaioId === null;

  const invia = (e: FormEvent) => {
    e.preventDefault();
    if (!v.nome.trim() || !v.cognome.trim()) {
      toast.error("Scrivi nome e cognome dell'operaio.");
      return;
    }
    const dati: DatiOperaio = {
      nome: v.nome,
      cognome: v.cognome,
      telefono: v.telefono,
      email: v.email,
      mansione: v.mansione,
      data_assunzione: v.data_assunzione,
      tipo_contratto: v.tipo_contratto,
    };
    salva.mutate(
      { id: operaioId, dati },
      {
        onSuccess: (id) => {
          toast.success(nuovo ? `${v.nome} ${v.cognome} è fra gli operai` : "Operaio aggiornato");
          onAperto(false);
          onSalvato?.(id);
        },
        onError: (err) => toast.error(messaggioErroreOperai(err, "Non sono riuscito a salvare. Riprova tra qualche secondo.")),
      },
    );
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !salva.isPending && onAperto(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{nuovo ? "Nuovo operaio" : "Modifica operaio"}</DialogTitle>
          <DialogDescription>
            {nuovo
              ? "Lo trovi subito nel Personale e lo puoi mettere al lavoro nelle commesse."
              : "Le modifiche valgono anche nel Personale."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={invia} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="operaio-nome">Nome</Label>
              <Input {...campo("nome")} autoComplete="off" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operaio-cognome">Cognome</Label>
              <Input {...campo("cognome")} autoComplete="off" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operaio-telefono">Telefono</Label>
              <Input {...campo("telefono")} type="tel" inputMode="tel" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operaio-email">Email</Label>
              <Input {...campo("email")} type="email" autoComplete="off" />
              <p className="text-xs text-muted-foreground">Serve per dargli l'app di cantiere.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operaio-mansione">Mansione</Label>
              <Input {...campo("mansione")} list="operaio-mansioni" placeholder="Es. Muratore" autoComplete="off" />
              <datalist id="operaio-mansioni">
                {MANSIONI.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operaio-data_assunzione">Assunto il</Label>
              <Input {...campo("data_assunzione")} type="date" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="operaio-contratto">Contratto</Label>
              <Select value={v.tipo_contratto} onValueChange={(x) => setV((s) => ({ ...s, tipo_contratto: x }))}>
                <SelectTrigger id="operaio-contratto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRATTI.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onAperto(false)} disabled={salva.isPending}>
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={salva.isPending}
              className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white hover:from-orange-600 hover:to-amber-600"
            >
              {salva.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {nuovo ? "Aggiungi operaio" : "Salva"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
