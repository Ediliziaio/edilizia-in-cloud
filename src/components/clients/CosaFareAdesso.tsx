/**
 * La riga «Cosa fare adesso» della scheda cliente (23/10/2026): per ogni cosa
 * da fare, il tasto che la fa. Il sollecito apre l'email o WhatsApp già
 * scritti: parte solo quando chi lo legge preme invia.
 */
import { AlertCircle, FileSignature, LifeBuoy, Mail, MessageSquare, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { testoSollecito, type AzioneSuggerita } from "@/lib/clienti/cosaFareAdesso";
import { euro } from "@/lib/clienti/schedaCliente";

const giorni = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);

export function CosaFareAdesso({
  azioni, cliente, azienda, email, telefono, waHref, onEmail, onApri,
}: {
  azioni: AzioneSuggerita[];
  cliente: string;
  azienda: string;
  email: string | null;
  telefono: string | null;
  waHref: string | null;
  onEmail: (oggetto: string, testo: string) => void;
  onApri: (pannello: string) => void;
}) {
  const navigate = useNavigate();
  if (azioni.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-900/50 dark:bg-amber-950/10">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">Cosa fare adesso</p>
      <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
        {azioni.map((a) => {
          if (a.tipo === "sollecito") {
            const { oggetto, testo } = testoSollecito(a, cliente, azienda);
            return (
              <div key="sollecito" className="flex flex-wrap items-center gap-2 px-1 py-1.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <p className="min-w-0 flex-1 basis-[15rem] text-sm">
                  <span className="font-medium text-red-700 dark:text-red-400">{euro(a.importo)} scaduti</span>
                  <span className="text-muted-foreground"> da {giorni(a.giorni)}{a.commesse.length ? ` · ${a.commesse.join(", ")}` : ""}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {email && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onEmail(oggetto, testo)}>
                      <Mail className="h-3.5 w-3.5" /> Sollecito per email
                    </Button>
                  )}
                  {waHref && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a href={`${waHref}?text=${encodeURIComponent(testo)}`} target="_blank" rel="noopener noreferrer">
                        <MessageSquare className="h-3.5 w-3.5" /> Su WhatsApp
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onApri("rate")}>Vedi rate</Button>
                </div>
              </div>
            );
          }
          if (a.tipo === "preventivo") {
            return (
              <div key="preventivo" className="flex flex-wrap items-center gap-2 px-1 py-1.5">
                <FileSignature className="h-4 w-4 shrink-0 text-violet-600" />
                <p className="min-w-0 flex-1 basis-[15rem] text-sm">
                  <span className="font-medium">Preventivo {a.numero ?? ""}</span>
                  <span className="text-muted-foreground"> senza risposta da {giorni(a.giorni)}{a.totale ? ` · ${euro(a.totale)}` : ""}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {telefono && (
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      <a href={`tel:${telefono}`}><Phone className="h-3.5 w-3.5" /> Richiama</a>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/azienda/marketing/preventivi/${a.id}`)}>Apri</Button>
                </div>
              </div>
            );
          }
          return (
            <div key="assistenza" className="flex flex-wrap items-center gap-2 px-1 py-1.5">
              <LifeBuoy className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 basis-[15rem] text-sm">
                <span className="font-medium">Assistenza aperta da {giorni(a.giorni)}</span>
                {a.titolo && <span className="text-muted-foreground"> · {a.titolo}</span>}
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/azienda/assistenza/${a.id}`)}>Apri e assegna</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
