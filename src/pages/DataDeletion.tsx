// DataDeletion — Pagina pubblica obbligatoria per Meta App Review e GDPR.
//
// Meta richiede un "Data Deletion Instructions URL" pubblicamente accessibile
// (no login) durante l'App Review per qualsiasi app che richieda permessi
// utente. Questa pagina spiega come l'utente può richiedere la cancellazione
// dei propri dati personali raccolti tramite Facebook/Meta Login o WhatsApp
// Embedded Signup.
//
// Affiancata da edge function `meta-data-deletion-callback` che gestisce le
// richieste programmatiche di Meta (quando un utente revoca un'app via Facebook
// Settings) restituendo confirmation_code + status_url.

import { useState } from "react";
import LegalLayout from "@/components/legal/LegalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Shield, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function DataDeletion() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  const handleSendRequest = () => {
    if (!email || !email.includes("@")) {
      toast.error("Inserisci un'email valida");
      return;
    }
    const subject = encodeURIComponent("Richiesta cancellazione dati personali — GDPR Art. 17");
    const body = encodeURIComponent(
      `Spettabile Edilizia in Cloud,\n\n` +
      `con la presente richiedo la cancellazione dei dati personali a me riferiti ` +
      `ai sensi dell'art. 17 del Regolamento UE 2016/679 (GDPR).\n\n` +
      `Email account: ${email}\n` +
      `${reason ? `Motivazione (facoltativa): ${reason}\n\n` : "\n"}` +
      `Vi ringrazio per il riscontro entro i 30 giorni previsti dalla normativa.\n\n` +
      `Cordiali saluti.`,
    );
    window.location.href = `mailto:privacy@ediliziaincloud.com?subject=${subject}&body=${body}`;
    toast.success("Email preparata nel tuo client di posta. Inviala per completare la richiesta.");
  };

  return (
    <LegalLayout
      title="Cancellazione dei dati"
      metaDescription="Istruzioni per richiedere la cancellazione dei dati personali raccolti da Edilizia in Cloud — diritto all'oblio GDPR Art. 17 e procedura Meta/Facebook."
      lastUpdate="27 maggio 2026"
      currentPath="/data-deletion"
    >
      <p>
        <strong>Diritto alla cancellazione dei dati personali</strong>
        <br />
        Ai sensi dell'art. 17 del Regolamento UE 2016/679 ("GDPR"), dell'art. 7
        del D.Lgs. 196/2003 ("Codice Privacy") e delle policy Meta Platform per
        gli sviluppatori di app.
        <br />
        Ultimo aggiornamento: 27 maggio 2026
      </p>

      <h2>1. Quali dati raccogliamo via Meta / Facebook / WhatsApp</h2>
      <p>
        Edilizia in Cloud (gestito da <strong>Domus Group S.r.l.</strong>) raccoglie
        dati personali tramite il <em>Facebook Login</em> e il flow <em>WhatsApp
        Embedded Signup</em> esclusivamente nell'ambito del servizio SaaS B2B
        fornito alle aziende clienti (Titolari autonomi del trattamento dei dati
        dei propri utenti finali).
      </p>
      <ul>
        <li>
          <strong>Account Facebook</strong>: nome, email, ID Facebook (solo se hai
          usato "Accedi con Facebook" per autenticarti).
        </li>
        <li>
          <strong>Account WhatsApp Business</strong>: WABA ID, numero WhatsApp
          collegato, token di accesso (cifrati lato server), nome visualizzato
          del bot.
        </li>
        <li>
          <strong>Messaggi WhatsApp</strong>: conversazioni inviate/ricevute
          tramite il numero WhatsApp Business collegato (conservate per finalità
          di supporto clienti e analisi AI, come da informativa privacy
          dell'azienda Titolare).
        </li>
        <li>
          <strong>Pagine Facebook / Instagram</strong>: ID pagina, nome, statistiche
          di engagement (se hai collegato un asset Meta per la gestione social).
        </li>
      </ul>

      <h2>2. Come richiedere la cancellazione</h2>

      <p>Esistono <strong>tre modalità</strong> per richiedere la cancellazione:</p>

      <h3>A) Richiesta diretta via email (procedura GDPR completa)</h3>
      <div className="not-prose my-4 rounded-lg border border-border bg-muted/30 p-5 space-y-4">
        <p className="text-sm text-foreground">
          Compila il modulo qui sotto: aprirà il tuo client di posta con una email
          pre-compilata indirizzata al nostro DPO.
        </p>
        <div className="space-y-2">
          <Label htmlFor="email">Email dell'account da cancellare *</Label>
          <Input
            id="email"
            type="email"
            placeholder="tuo@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reason">Motivazione (facoltativa)</Label>
          <Textarea
            id="reason"
            placeholder="Es: non utilizzo più il servizio, esercizio del diritto all'oblio…"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button onClick={handleSendRequest} className="w-full sm:w-auto">
          <Mail className="mr-2 h-4 w-4" />
          Prepara richiesta di cancellazione
        </Button>
        <p className="text-xs text-muted-foreground">
          In alternativa scrivi direttamente a{" "}
          <a href="mailto:privacy@ediliziaincloud.com" className="underline">
            privacy@ediliziaincloud.com
          </a>{" "}
          specificando email account e motivazione.
        </p>
      </div>

      <h3>B) Revoca diretta da Facebook (per dati raccolti via Meta Login)</h3>
      <ol>
        <li>
          Accedi al tuo account Facebook e vai a{" "}
          <a
            href="https://www.facebook.com/settings?tab=applications"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Impostazioni → Apps e siti web
          </a>
          .
        </li>
        <li>
          Trova <strong>"Edilizia in Cloud"</strong> nell'elenco app autorizzate.
        </li>
        <li>
          Click su <em>"Rimuovi"</em> per revocare i permessi.
        </li>
        <li>
          Meta invierà automaticamente al nostro endpoint di callback la richiesta
          di cancellazione: i tuoi dati Facebook saranno rimossi entro 30 giorni
          (riceverai un <em>confirmation code</em> visibile su Facebook).
        </li>
      </ol>

      <h3>C) Cancellazione completa dell'account Edilizia in Cloud</h3>
      <p>
        Se hai un account utente attivo nella piattaforma Edilizia in Cloud (e
        non solo dati raccolti via Meta), puoi richiedere la cancellazione
        completa dal pannello{" "}
        <strong>Impostazioni → Mio Profilo → Elimina account</strong>, oppure
        scrivendo a privacy@ediliziaincloud.com.
      </p>

      <h2>3. Tempistiche</h2>
      <div className="not-prose my-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <Clock className="h-5 w-5 text-primary mb-2" />
          <p className="text-sm font-semibold">Conferma ricezione</p>
          <p className="text-xs text-muted-foreground mt-1">
            Entro 72 ore dalla richiesta
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <Shield className="h-5 w-5 text-primary mb-2" />
          <p className="text-sm font-semibold">Verifica identità</p>
          <p className="text-xs text-muted-foreground mt-1">
            Documento o conferma via email registrata
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <CheckCircle2 className="h-5 w-5 text-primary mb-2" />
          <p className="text-sm font-semibold">Cancellazione effettiva</p>
          <p className="text-xs text-muted-foreground mt-1">
            Entro 30 giorni (termine GDPR)
          </p>
        </div>
      </div>

      <h2>4. Dati conservati per obblighi di legge</h2>
      <p>
        Alcuni dati possono essere conservati anche dopo la richiesta di
        cancellazione, esclusivamente per adempiere a obblighi di legge:
      </p>
      <ul>
        <li>
          <strong>Dati fiscali e contabili</strong>: 10 anni (DPR 633/72, art. 22
          + Codice Civile art. 2220) — fatture, contratti, prima nota.
        </li>
        <li>
          <strong>Log di sicurezza e accessi</strong>: 12 mesi (D.Lgs. 196/2003
          + provvedimento Garante Privacy 27 nov 2008) — IP, timestamp login.
        </li>
        <li>
          <strong>Comunicazioni con Pubblica Amministrazione</strong>: 5 anni
          (SDI fatturazione elettronica, ANAC bandi).
        </li>
      </ul>
      <p>
        Tutti gli altri dati personali vengono cancellati definitivamente.
        Eventuali dati anonimizzati per fini statistici/AI training non sono più
        riconducibili all'interessato e possono essere conservati in forma
        aggregata.
      </p>

      <h2>5. Contatti</h2>
      <p>
        <strong>Titolare del trattamento</strong>: Domus Group S.r.l.
        <br />
        <strong>Email DPO</strong>:{" "}
        <a href="mailto:privacy@ediliziaincloud.com" className="underline">
          privacy@ediliziaincloud.com
        </a>
        <br />
        <strong>PEC</strong>:{" "}
        <a href="mailto:domusgroup@pec.it" className="underline">
          domusgroup@pec.it
        </a>
      </p>
      <p>
        Per reclami all'Autorità di controllo:{" "}
        <a
          href="https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/4535524"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Garante per la Protezione dei Dati Personali
        </a>
        .
      </p>

      <h2>6. Endpoint tecnico per Meta Platform</h2>
      <p className="text-sm text-muted-foreground">
        Per gli sviluppatori Meta: il nostro endpoint di callback per la
        cancellazione dati conforme alle{" "}
        <a
          href="https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Data Deletion Callback Specifications
        </a>{" "}
        è disponibile all'URL:
        <br />
        <code className="text-xs">
          https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/meta-data-deletion-callback
        </code>
      </p>
    </LegalLayout>
  );
}
