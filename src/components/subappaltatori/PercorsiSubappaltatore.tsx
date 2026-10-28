import {
  ArrowUpRight,
  ClipboardList,
  FileCheck2,
  Users,
  WalletCards,
} from "lucide-react";

type Sezione = "contratto" | "contabilita" | "documenti" | "operai";

/** Ingressi alle attività, senza duplicare moduli o dati della scheda. */
export function PercorsiSubappaltatore({
  amministrazione,
  onApri,
}: {
  amministrazione: boolean;
  onApri: (sezione: Sezione) => void;
}) {
  const percorsi = [
    {
      id: "operai",
      titolo: "Operai e squadre",
      testo: "Addetti dell’impresa e assegnazioni ai cantieri.",
      icona: Users,
    },
    {
      id: "documenti",
      titolo: "Documenti e sicurezza",
      testo: "DURC, POS, scadenze e documenti da verificare.",
      icona: FileCheck2,
    },
    ...(amministrazione
      ? [
          {
            id: "contratto",
            titolo: "Lavori e contratti",
            testo: "Scegli la commessa e registra le quantità eseguite.",
            icona: ClipboardList,
          },
          {
            id: "contabilita",
            titolo: "SAL e ritenute",
            testo: "Verbali, ritenute di garanzia e pagamenti registrati.",
            icona: WalletCards,
          },
        ]
      : []),
  ];
  return (
    <section
      aria-label="Accessi rapidi subappaltatore"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {percorsi.map(({ id, titolo, testo, icona: Icona }) => (
        <button
          key={id}
          type="button"
          onClick={() => onApri(id as Sezione)}
          className="group flex min-w-0 items-start gap-3 rounded-xl border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="rounded-lg bg-primary/5 p-2 text-primary">
            <Icona className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              {titolo}
              <ArrowUpRight
                className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary"
                aria-hidden="true"
              />
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {testo}
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}
