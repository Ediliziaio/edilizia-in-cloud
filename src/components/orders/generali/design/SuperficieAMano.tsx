/**
 * La superficie scritta a mano, chiesta dove serve (16/11/2026).
 *
 * I €/m² hanno bisogno di una superficie. Finora si poteva scriverla solo nella scheda «Dati»,
 * che su 18 operazioni nel database nessuna ha mai compilato: il pannello restava coi trattini
 * e nessuno sapeva perché. Un numero si chiede dove lo si sta guardando, non in un'altra scheda.
 *
 * Scrive `dati.area.mq_vendibili`, lo stesso campo della scheda Dati — una sezione si manda
 * intera, quindi si riparte da quella che c'è.
 */
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSalvaDatiGenerale } from "@/hooks/useCommesseGenerali";
import { useToast } from "@/hooks/use-toast";

type ValoriArea = Record<string, string | number | boolean | null>;

interface Props {
  generaleId: string;
  /** La sezione «area» com'è adesso: si rimanda intera, col solo campo cambiato. */
  area: ValoriArea | undefined;
  /** Testo del bottone quando la superficie non c'è ancora. */
  etichetta?: string;
}

/** Legge un numero scritto come lo scrive una persona: «1.250,5» o «1250.5». */
export function leggiMq(testo: string): number | null {
  const pulito = testo.trim().replace(/\./g, "").replace(",", ".");
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function SuperficieAMano({ generaleId, area, etichetta = "metti la superficie" }: Props) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState(() => String(area?.mq_vendibili ?? ""));
  const salva = useSalvaDatiGenerale(generaleId);
  const { toast } = useToast();

  if (!aperto) {
    return (
      <button type="button" className="quadro-prev-mq-azione" onClick={() => { setTesto(String(area?.mq_vendibili ?? "")); setAperto(true); }}>
        <Pencil aria-hidden="true" /> {etichetta}
      </button>
    );
  }

  const conferma = () => {
    const mq = leggiMq(testo);
    if (mq === null) {
      toast({ title: "Superficie non valida", description: "Scrivi i metri quadri, per esempio 1250.", variant: "destructive" });
      return;
    }
    salva.mutate({ area: { ...(area ?? {}), mq_vendibili: mq } }, {
      onSuccess: () => { setAperto(false); toast({ title: "Superficie salvata" }); },
      onError: (e) => toast({ title: "Non riesco a salvare", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
    });
  };

  return (
    <span className="quadro-prev-mq-modifica">
      <Input
        autoFocus
        inputMode="decimal"
        aria-label="Superficie vendibile in metri quadri"
        value={testo}
        disabled={salva.isPending}
        onChange={(e) => setTesto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); conferma(); }
          if (e.key === "Escape") { e.preventDefault(); setAperto(false); }
        }}
        className="h-7 w-24 text-xs"
      />
      <span className="text-xs text-muted-foreground">m²</span>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={conferma} disabled={salva.isPending} aria-label="Salva la superficie">
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAperto(false)} disabled={salva.isPending} aria-label="Annulla">
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
