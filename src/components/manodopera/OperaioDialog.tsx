/**
 * Nuovo operaio / modifica operaio (Manodopera e Mezzi, 26/09/2026).
 *
 * Una scheda sola: si scrive la persona e, se si vuole, il costo orario. La
 * scheda del costo per le commesse la crea il database; una persona che è già
 * nel Personale con la stessa email diventa operaio invece di essere doppiata.
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
  costo_orario: string;
  stipendio_lordo: string;
  ore_mese: string;
}

const VUOTO: ValoriOperaio = {
  nome: "", cognome: "", telefono: "", email: "", mansione: "", data_assunzione: "",
  tipo_contratto: "indeterminato", costo_orario: "", stipendio_lordo: "", ore_mese: "",
};

export function OperaioDialog({
  aperto,
  onAperto,
  operaioId = null,
  iniziali,
  mostraStipendio = false,
  onSalvato,
}: {
  aperto: boolean;
  onAperto: (v: boolean) => void;
  /** null = nuovo operaio. */
  operaioId?: string | null;
  iniziali?: Partial<ValoriOperaio>;
  /** Stipendio e ore al mese: solo per chi può modificare gli operai. */
  mostraStipendio?: boolean;
  onSalvato?: (id: string) => void;
}) {
  const salva = useSalvaOperaio();
  const [v, setV] = useState<ValoriOperaio>(VUOTO);
  const [stipendioAperto, setStipendioAperto] = useState(false);

  useEffect(() => {
    if (!aperto) return;
    const base = { ...VUOTO, ...iniziali };
    setV(base);
    setStipendioAperto(!!(base.stipendio_lordo || base.ore_mese));
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
      costo_orario: v.costo_orario,
    };
    if (mostraStipendio && stipendioAperto) {
      dati.stipendio_lordo = v.stipendio_lordo;
      dati.ore_mese = v.ore_mese;
    }
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

          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="operaio-costo_orario">Costo orario per le commesse (€ all'ora)</Label>
              <Input {...campo("costo_orario")} inputMode="decimal" placeholder="Es. 24,50" className="max-w-[10rem]" />
              <p className="text-xs text-muted-foreground">
                Quanto ti costa un'ora di questo operaio, contributi compresi. Se lo lasci vuoto lo calcoliamo dallo stipendio.
              </p>
            </div>
            {mostraStipendio && (
              stipendioAperto ? (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="operaio-stipendio_lordo">Stipendio lordo al mese (€)</Label>
                    <Input {...campo("stipendio_lordo")} inputMode="decimal" placeholder="Es. 2.100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="operaio-ore_mese">Ore al mese</Label>
                    <Input {...campo("ore_mese")} inputMode="numeric" placeholder="Es. 168" />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Al lordo aggiungiamo i contributi e dividiamo per le ore.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-xs font-medium text-orange-700 underline-offset-2 hover:underline"
                  onClick={() => setStipendioAperto(true)}
                >
                  Calcolalo dallo stipendio
                </button>
              )
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onAperto(false)} disabled={salva.isPending}>
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={salva.isPending}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
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
