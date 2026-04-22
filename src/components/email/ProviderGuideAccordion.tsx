// ============================================================================
// ProviderGuideAccordion — Email Dual-Provider FASE 10
// ============================================================================
// Guida passo-passo per inserire record DNS (TXT / CNAME / MX) sui 5 registrar
// italiani più diffusi. Mostrato sotto alla tabella record DNS in
// SettingsEmailDomain per ridurre i ticket di support.
//
// Dati e percorsi UI aggiornati ad aprile 2026 (Aruba, Register.it, OVH,
// GoDaddy, Cloudflare). Se il registrar non è in lista l'utente ha comunque
// tutti i valori da copiare.
// ============================================================================

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, ExternalLink } from "lucide-react";

interface ProviderGuide {
  id: string;
  name: string;
  /** Percorso nel pannello admin per arrivare alla gestione DNS. */
  adminPath: string;
  /** Tempi medi di propagazione osservati (informativo). */
  avgPropagation: string;
  /** Gotchas specifici del provider. */
  gotchas: string[];
  /** URL documentazione ufficiale DNS del registrar. */
  docsUrl?: string;
  /** Istruzioni ordinate — 4-6 step pratici. */
  steps: string[];
}

const PROVIDERS: ProviderGuide[] = [
  {
    id: "aruba",
    name: "Aruba",
    adminPath: "admin.aruba.it → I tuoi domini → Gestisci → Zona DNS",
    avgPropagation: "30 min – 4h",
    docsUrl: "https://guide.hosting.aruba.it/dominio/dns/gestione-dns.aspx",
    gotchas: [
      "Il campo Nome non deve contenere il dominio principale (Aruba lo aggiunge in automatico). Es: scrivi 'mail' non 'mail.tuaazienda.it'.",
      "Per i record TXT Aruba richiede di avvolgere il valore tra virgolette.",
      "Il TTL minimo è 3600 (1h) sui piani base; considera un'ora per la propagazione.",
    ],
    steps: [
      "Accedi al pannello admin.aruba.it con le credenziali del dominio.",
      "Apri la sezione I tuoi domini, trova il dominio e clicca Gestisci.",
      "Clicca sul tab Zona DNS e poi sul pulsante + Nuovo Record.",
      "Seleziona il tipo (TXT, CNAME o MX) e incolla Nome e Valore dalla tabella sopra.",
      "Salva e aspetta la propagazione (Aruba mostra \"in propagazione\" per circa 30 minuti).",
      "Torna qui e clicca Verifica DNS per validare i record.",
    ],
  },
  {
    id: "register_it",
    name: "Register.it",
    adminPath: "www.register.it → Accedi → I tuoi domini → DNS",
    avgPropagation: "15 min – 2h",
    docsUrl: "https://we.register.it/ws/it/dns.html",
    gotchas: [
      "Per il record CNAME il campo Alias deve terminare con un punto (es. 'u123.wl.sendgrid.net.') altrimenti Register.it aggiunge il dominio.",
      "Il pannello non accetta TXT > 255 caratteri: se il valore è più lungo va spezzato con le virgolette (raro per SPF/DKIM standard).",
      "Dopo ogni salvataggio attendere almeno 15 min prima di verificare.",
    ],
    steps: [
      "Accedi a www.register.it e clicca Area Clienti.",
      "Dalla lista I tuoi domini seleziona il dominio interessato.",
      "Clicca sulla voce DNS nel menu laterale.",
      "Usa Aggiungi record, scegli il tipo (TXT / CNAME / MX) e incolla Host e Valore dalla tabella.",
      "Salva. La propagazione parte immediatamente ma può richiedere fino a 2 ore.",
      "Clicca Verifica DNS qui sopra quando hai aggiunto tutti i record.",
    ],
  },
  {
    id: "ovh",
    name: "OVH",
    adminPath: "www.ovh.com/manager → Dominî → Zona DNS",
    avgPropagation: "5 min – 1h",
    docsUrl: "https://help.ovhcloud.com/csm/it-dns-edit-zone",
    gotchas: [
      "Il pannello OVH mostra il dominio completo preselezionato: per il campo sotto-dominio scrivi solo la parte senza il dominio principale.",
      "La zona DNS ha un TTL predefinito di 3600; puoi abbassarlo a 600 per testare più velocemente.",
      "OVH applica le modifiche in modo atomico a ogni salvataggio: puoi aggiungere tutti i record uno alla volta senza timori.",
    ],
    steps: [
      "Accedi a OVHcloud Manager → Web Cloud → Domini.",
      "Clicca sul dominio e apri il tab Zona DNS.",
      "Usa il pulsante Aggiungi una voce, scegli il tipo e completa Host e Target.",
      "Per MX imposta anche la priorità (normalmente 10).",
      "Conferma. La zona viene rigenerata entro pochi minuti.",
      "Verifica cliccando Verifica DNS nel pannello EiC.",
    ],
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    adminPath: "dcc.godaddy.com → I miei prodotti → DNS",
    avgPropagation: "1 – 24h",
    docsUrl: "https://it.godaddy.com/help/add-a-dns-record-19239",
    gotchas: [
      "GoDaddy può impiegare fino a 24h per la propagazione globale — spesso sono < 1h ma non farti prendere dal panico.",
      "Nel campo Nome, per un record sul dominio principale, scrivi @ (non lasciare vuoto).",
      "Se hai abilitato DNSSEC, potrebbe essere necessario riconfigurarlo dopo l'aggiunta dei record.",
    ],
    steps: [
      "Accedi a dcc.godaddy.com → I miei prodotti.",
      "Nella sezione Domini trova il dominio e clicca DNS.",
      "Clicca Aggiungi nuovo record e scegli il tipo.",
      "Incolla Nome e Valore dalla tabella, scegli TTL 1 ora (predefinito).",
      "Salva il record e ripeti per ciascuna riga della tabella.",
      "Attendi almeno 30 minuti prima di cliccare Verifica DNS qui in EiC.",
    ],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    adminPath: "dash.cloudflare.com → Seleziona dominio → DNS",
    avgPropagation: "< 5 min",
    docsUrl: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/",
    gotchas: [
      "Disabilita la proxy (nuvoletta arancione → grigia) per i record di autenticazione mail: SPF, DKIM e CNAME di invio DEVONO essere DNS-only.",
      "Cloudflare aggiunge automaticamente il dominio al campo Nome: inserisci solo il sottodominio.",
      "Per DKIM con chiavi lunghe (> 255 char) Cloudflare gestisce automaticamente lo splitting.",
    ],
    steps: [
      "Accedi a dash.cloudflare.com e seleziona il dominio.",
      "Vai su DNS → Records e clicca + Add record.",
      "Scegli il Type (TXT / CNAME / MX), incolla Name e Content dalla tabella.",
      "IMPORTANTE: se appare l'icona nuvoletta arancione, clicca per renderla grigia (DNS only).",
      "Salva. La propagazione Cloudflare è istantanea (< 5 min).",
      "Clicca Verifica DNS nel pannello EiC: dovrebbe risultare verde subito.",
    ],
  },
];

export function ProviderGuideAccordion() {
  return (
    <div className="space-y-3">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Guida pratica per inserire i record DNS sul pannello del tuo registrar.
          Non è nell'elenco? Tutti i registrar accettano i valori in tabella —
          cerca la voce <strong>Gestione DNS</strong> o <strong>DNS Zone</strong> nel pannello.
        </AlertDescription>
      </Alert>

      <Accordion type="single" collapsible className="w-full">
        {PROVIDERS.map((p) => (
          <AccordionItem key={p.id} value={p.id}>
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3 text-left">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  Propagazione: {p.avgPropagation}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium mb-1">Percorso nel pannello:</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block">
                  {p.adminPath}
                </code>
              </div>

              <div>
                <p className="font-medium mb-2">Passi:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                  {p.steps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              </div>

              {p.gotchas.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Attenzione:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                    {p.gotchas.map((g, idx) => (
                      <li key={idx} className="leading-relaxed">{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {p.docsUrl && (
                <a
                  href={p.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Documentazione ufficiale {p.name}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
