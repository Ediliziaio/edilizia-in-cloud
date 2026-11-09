import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useVociImpostazioni } from "@/hooks/useVociImpostazioni";

const BASE = "/azienda/impostazioni/";
/** Solo collegamenti presenti nell'indice autorizzato dell'utente e nel suo piano. */
const COLLEGAMENTI_IMPOSTAZIONI: Record<string, { sezione: string; motivo: string }[]> = {
  profilo: [{ sezione: "fatturazione", motivo: "Dati fiscali che compaiono sulle fatture" }, { sezione: "branding", motivo: "Aspetto della piattaforma con il tuo marchio" }],
  branding: [{ sezione: "profilo", motivo: "Anagrafica e contatti dell'azienda" }, { sezione: "dominio-email", motivo: "Mittente e aspetto delle email ai clienti" }],
  "modelli-fasi": [{ sezione: "stati-ordine", motivo: "I passaggi della commessa, dal contratto all'assistenza" }, { sezione: "rapportini-cantiere", motivo: "Chi compila dal cantiere e cosa può fare" }],
  "stati-ordine": [{ sezione: "modelli-fasi", motivo: "Le lavorazioni e il loro avanzamento" }],
  "rapportini-cantiere": [{ sezione: "modelli-fasi", motivo: "I modelli delle lavorazioni del cantiere" }, { sezione: "persone", motivo: "Accessi e permessi di operai e collaboratori" }],
  "modelli-pagamento": [{ sezione: "fatturazione", motivo: "Come l'azienda emette le fatture" }],
  fatturazione: [{ sezione: "profilo", motivo: "Anagrafica generale dell'azienda" }, { sezione: "modelli-pagamento", motivo: "Le rate con cui incassi una commessa" }],
  "campi-personalizzati": [{ sezione: "template-preventivi", motivo: "Dove usare le variabili nei testi dei preventivi" }, { sezione: "modelli-pdf", motivo: "Aspetto dei documenti che consegni ai clienti" }],
  persone: [{ sezione: "sicurezza-privacy", motivo: "Sessioni, attività e regole di accesso" }],
  "sicurezza-privacy": [{ sezione: "persone", motivo: "Chi entra in azienda e con quali permessi" }, { sezione: "mio-profilo", motivo: "Password e sicurezza del tuo account" }],
  "dominio-email": [{ sezione: "mio-profilo", motivo: "La casella personale che usi per leggere e rispondere" }, { sezione: "integrazioni", motivo: "Le connessioni ai servizi esterni" }],
  "automazioni-finanza": [{ sezione: "notifiche", motivo: "Gli avvisi che ricevi nel tuo account" }],
};

export function CollegamentiImpostazioni({ sezione }: { sezione: string | null }) {
  const richiesti = sezione ? COLLEGAMENTI_IMPOSTAZIONI[sezione] ?? [] : [];
  const { voci } = useVociImpostazioni(richiesti.length > 0);
  const collegamenti = richiesti.flatMap((r) => {
    const voce = voci.find((v) => v.url === `${BASE}${r.sezione}`);
    return voce ? [{ ...r, voce }] : [];
  });
  if (!collegamenti.length) return null;
  return <nav aria-label="Impostazioni collegate" className="mt-8 max-w-3xl border-t pt-4">
    <p className="mb-2 text-xs font-semibold text-muted-foreground">Impostazioni collegate</p>
    <ul className="grid gap-2 sm:grid-cols-2">
      {collegamenti.map(({ voce, motivo }) => <li key={voce.url}>
        <Link to={voce.url} className="flex h-full items-start justify-between gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0"><span className="block text-sm font-medium">{voce.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{motivo}</span></span>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </li>)}
    </ul>
  </nav>;
}
