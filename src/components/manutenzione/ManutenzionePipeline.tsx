/**
 * Kanban della manutenzione: gli impianti in colonne per stato (Scaduta · In
 * scadenza · In regola · Senza piano). A differenza dell'assistenza le card non
 * si trascinano — lo stato lo dà la data della prossima manutenzione e si
 * aggiorna da solo — ma da ogni card si può «Pianifica» o «Completa».
 */
import { Calendar, User, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  STATI_MANUTENZIONE, STATO_MANUT_META, etichettaScadenza, type StatoManutenzione,
} from "@/lib/manutenzione/statoManutenzione";

export interface ImpiantoStato {
  id: string;
  tipo_impianto: string;
  marca: string | null;
  modello: string | null;
  garanzia_scadenza: string | null;
  data_installazione: string | null;
  customer: { first_name: string | null; last_name: string | null } | null;
  stato: StatoManutenzione;
  prossimaScadenza: string | null;
  prossimoPianoId: string | null;
  contrattoNome: string | null;
}

function Card({ im, onOpen, onPianifica, onCompleta, busy }: {
  im: ImpiantoStato;
  onOpen: (id: string) => void;
  onPianifica: (impiantoId: string) => void;
  onCompleta: (impiantoId: string) => void;
  busy: boolean;
}) {
  const meta = STATO_MANUT_META[im.stato];
  const cliente = [im.customer?.first_name, im.customer?.last_name].filter(Boolean).join(" ");
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <button type="button" className="w-full text-left" onClick={() => onOpen(im.id)}>
        <p className="text-sm font-semibold capitalize leading-snug line-clamp-2">
          {im.tipo_impianto.replace("_", " ")}
          {im.marca && <span className="ml-1 font-normal text-muted-foreground">{im.marca}{im.modello ? ` ${im.modello}` : ""}</span>}
        </p>
        {cliente && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><User className="h-3 w-3" />{cliente}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge className={cn("text-[10px]", meta.badge)}>{meta.label}</Badge>
          {im.prossimaScadenza && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />{format(new Date(im.prossimaScadenza), "d MMM yyyy", { locale: it })}
            </span>
          )}
        </div>
      </button>
      {im.prossimoPianoId && (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={busy}
                  onClick={() => onPianifica(im.id)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Pianifica"}
          </Button>
          <Button size="sm" className="h-7 flex-1 text-xs" disabled={busy}
                  onClick={() => onCompleta(im.id)}>
            Completa
          </Button>
        </div>
      )}
    </div>
  );
}

export function ManutenzionePipeline({
  impianti, onOpen, onPianifica, onCompleta, busy = false,
}: {
  impianti: ImpiantoStato[];
  onOpen: (id: string) => void;
  onPianifica: (impiantoId: string) => void;
  onCompleta: (impiantoId: string) => void;
  busy?: boolean;
}) {
  const perStato: Record<StatoManutenzione, ImpiantoStato[]> = {
    scaduta: [], in_scadenza: [], in_regola: [], senza_piano: [],
  };
  impianti.forEach((im) => perStato[im.stato].push(im));
  // Nelle colonne con scadenza, prima le più urgenti.
  perStato.scaduta.sort((a, b) => (a.prossimaScadenza ?? "").localeCompare(b.prossimaScadenza ?? ""));
  perStato.in_scadenza.sort((a, b) => (a.prossimaScadenza ?? "").localeCompare(b.prossimaScadenza ?? ""));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {STATI_MANUTENZIONE.map((s) => {
        const lista = perStato[s.key];
        return (
          <div key={s.key} className="flex min-h-[72px] flex-col rounded-xl border border-border bg-muted/30 p-2 sm:min-h-[220px]">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="text-sm font-semibold">{s.label}</span>
              <Badge variant="secondary" className="text-xs">{lista.length}</Badge>
            </div>
            <div className="flex-1 space-y-2">
              {lista.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Niente qui</p>
              ) : (
                lista.map((im) => (
                  <Card key={im.id} im={im} onOpen={onOpen} onPianifica={onPianifica} onCompleta={onCompleta} busy={busy} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
