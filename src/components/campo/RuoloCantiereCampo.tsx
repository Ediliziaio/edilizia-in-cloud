import { Link } from "react-router-dom";
import { ClipboardList, ListChecks, Users, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  if (errore)
    return (
      <section
        role="alert"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"
      >
        <p className="font-semibold">{t("Ruolo del cantiere non disponibile")}</p>
        <p className="mt-1">
          {t("Non possiamo confermare le operazioni di coordinamento. Riprova prima di procedere.")}
        </p>
        <Button variant="outline" className="mt-3" onClick={onRiprova}>
          {t("Rileggi il ruolo")}
        </Button>
      </section>
    );
  if (caricamento || !ruolo)
    return (
      <p
        role="status"
        className="rounded-2xl border p-4 text-sm text-muted-foreground"
      >
        {t("Verifica del ruolo in questo cantiere…")}
      </p>
    );
  const coordina = ruolo.isCapocantiere || ruolo.isCaposquadra;
  const titolo = ruolo.isCapocantiere
    ? t("Capocantiere")
    : ruolo.isCaposquadra
      ? t("Caposquadra")
      : subappaltatore
        ? t("Impresa subappaltatrice")
        : t("Operaio");
  const spiegazione = ruolo.isCapocantiere
    ? t("Coordini il cantiere e consulti la squadra. Documenta il lavoro svolto e gestisci i rapporti con il cliente secondo le regole aziendali.")
    : ruolo.isCaposquadra
      ? t("Coordini la tua squadra. Il capocantiere mantiene il coordinamento della commessa.")
      : subappaltatore
        ? t("Documenta il lavoro affidato alla tua impresa. Le quantità economiche e i SAL vengono verificati nel gestionale.")
        : t("Registra le tue ore, documenta il lavoro e consulta le fasi della commessa.");
  // Collaudo 23/11 («più semplice e minimale»): il riquadro occupava mezzo schermo in apertura — spiegazione, tre
  // pulsanti a tutta riga e una nota. Ora: ruolo su una riga, tre scorciatoie su una riga, la spiegazione a richiesta.
  const scorciatoia = "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-1 text-[13px] font-medium";
  return (
    <section
      aria-label={t("Il tuo ruolo nel cantiere")}
      className="rounded-2xl border bg-background p-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">{t("Il tuo ruolo")}</p>
        <h2 className="min-w-0 truncate text-[15px] font-semibold">{titolo}</h2>
      </div>
      <div className={`mt-2 grid gap-2 ${coordina ? "grid-cols-3" : "grid-cols-2"}`}>
        <Link
          to={`/campo/avanzamento?order_id=${encodeURIComponent(orderId)}`}
          aria-label={t("Fasi di questo cantiere")}
          className={scorciatoia}
        >
          <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("Fasi")}
        </Link>
        <button
          type="button"
          onClick={onRapportini}
          aria-label={ruolo.isCapocantiere ? t("Rapportini del cantiere") : t("I miei rapportini")}
          className={scorciatoia}
        >
          <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />{t("Rapportini")}
        </button>
        {coordina && (
          <Link
            to={`/campo/squadra/${orderId}`}
            aria-label={t("Presenze e squadra del cantiere")}
            className={scorciatoia}
          >
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("Squadra")}
          </Link>
        )}
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">{t("Cosa fa il tuo ruolo")}</summary>
        <p className="mt-1 text-sm">{spiegazione}</p>
        <p className="mt-2">
          {t("Questo è il ruolo operativo assegnato nella commessa; non sostituisce nomine e incarichi di sicurezza. Le fasi descrivono l’avanzamento operativo. Il rapportino dichiara il lavoro; la sua approvazione e il riconoscimento di un SAL sono passaggi distinti.")}
        </p>
      </details>
    </section>
  );
}
