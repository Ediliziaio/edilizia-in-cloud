import { Link } from "react-router-dom";
import { ClipboardList, ListChecks, Users, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RuoloCantiereCampo({
  orderId,
  ruolo,
  subappaltatore,
  caricamento,
  errore,
  onRiprova,
  onRapportini,
}: {
  orderId: string;
  ruolo?: {
    isCapocantiere: boolean;
    isCaposquadra: boolean;
    esisteCapo: boolean;
  };
  subappaltatore: boolean;
  caricamento: boolean;
  errore: boolean;
  onRiprova: () => void;
  onRapportini: () => void;
}) {
  if (errore)
    return (
      <section
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"
      >
        <p className="font-semibold">Ruolo del cantiere non disponibile</p>
        <p className="mt-1">
          Non possiamo confermare le operazioni di coordinamento. Riprova prima
          di procedere.
        </p>
        <Button variant="outline" className="mt-3" onClick={onRiprova}>
          Rileggi il ruolo
        </Button>
      </section>
    );
  if (caricamento || !ruolo)
    return (
      <p
        role="status"
        className="rounded-2xl border p-4 text-sm text-muted-foreground"
      >
        Verifica del ruolo in questo cantiere…
      </p>
    );
  const coordina = ruolo.isCapocantiere || ruolo.isCaposquadra;
  const titolo = ruolo.isCapocantiere
    ? "Capocantiere"
    : ruolo.isCaposquadra
      ? "Caposquadra"
      : subappaltatore
        ? "Impresa subappaltatrice"
        : "Operaio";
  return (
    <section
      aria-label="Il tuo ruolo nel cantiere"
      className="rounded-2xl border bg-background p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">
            Il tuo ruolo in questa commessa
          </p>
          <h2 className="mt-1 text-base font-semibold">{titolo}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ruolo.isCapocantiere
              ? "Coordini il cantiere e consulti la squadra. Documenta il lavoro svolto e gestisci i rapporti con il cliente secondo le regole aziendali."
              : ruolo.isCaposquadra
                ? "Coordini la tua squadra. Il capocantiere mantiene il coordinamento della commessa."
                : subappaltatore
                  ? "Documenta il lavoro affidato alla tua impresa. Le quantità economiche e i SAL vengono verificati nel gestionale."
                  : "Registra le tue ore, documenta il lavoro e consulta le fasi della commessa."}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link
          to={`/campo/avanzamento?order_id=${encodeURIComponent(orderId)}`}
          className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium"
        >
          <ListChecks className="h-4 w-4" />
          Fasi di questo cantiere
        </Link>
        <button
          type="button"
          onClick={onRapportini}
          className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium"
        >
          <ClipboardList className="h-4 w-4" />{ruolo.isCapocantiere ? "Rapportini del cantiere" : "I miei rapportini"}
        </button>
        {coordina && (
          <Link
            to={`/campo/squadra/${orderId}`}
            className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium sm:col-span-2"
          >
            <Users className="h-4 w-4" />
            Presenze e squadra del cantiere
          </Link>
        )}
      </div>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-1">
          Ruoli e avanzamento: cosa significano
        </summary>
        <p className="mt-2">
          Questo è il ruolo operativo assegnato nella commessa; non sostituisce
          nomine e incarichi di sicurezza. Le fasi descrivono l’avanzamento
          operativo. Il rapportino dichiara il lavoro; la sua approvazione e il
          riconoscimento di un SAL sono passaggi distinti.
        </p>
      </details>
    </section>
  );
}
