/**
 * EmailClientPage — ingresso del client email personale
 *
 * Pagina del client email integrato. Visibile solo se feature flag
 * 'email_client' è attiva per la company (Beta gate via sidebar).
 *
 * Se nessuna connessione è presente mostra una CTA verso le impostazioni
 * profilo; altrimenti apre il client 3-pane con compose, sync e AI.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Archive,
  ArrowRight,
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  CircleCheck,
  Clock3,
  Eye,
  FileEdit,
  FileText,
  FolderPlus,
  Forward,
  Inbox,
  Mail,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PackageCheck,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Plug,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Truck,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import { EmailLayout } from "./EmailLayout";

const demoEmailAccounts = [
  { email: "email@demo.srl", unread: 184, color: "bg-emerald-500" },
  { email: "preventivi@demo.srl", unread: 42, color: "bg-blue-500" },
  { email: "ordini@demo.srl", unread: 18, color: "bg-orange-500" },
];

const demoEmailIdentities = [
  {
    email: "email@demo.srl",
    displayName: "Demo Azienda S.r.l.",
    role: "Ufficio operativo",
    avatar: "DA",
    signature: [
      "Demo Azienda S.r.l.",
      "Ufficio preventivi e logistica",
      "Tel. 0532 000000 · www.demo.srl",
    ],
  },
  {
    email: "preventivi@demo.srl",
    displayName: "Demo Azienda S.r.l. - Preventivi",
    role: "Ufficio preventivi",
    avatar: "PR",
    signature: [
      "Demo Azienda S.r.l.",
      "Ufficio preventivi",
      "preventivi@demo.srl · www.demo.srl/preventivi",
    ],
  },
  {
    email: "ordini@demo.srl",
    displayName: "Demo Azienda S.r.l. - Ordini",
    role: "Acquisti e logistica",
    avatar: "OR",
    signature: [
      "Demo Azienda S.r.l.",
      "Ufficio acquisti e logistica",
      "ordini@demo.srl · Tel. 0532 000000",
    ],
  },
];

const demoEmailIdentity = demoEmailIdentities[0];

const demoEmailFolders = [
  { icon: Inbox, label: "Posta in arrivo", count: "244", open: true },
  { icon: Star, label: "Contrassegnata", count: "36", open: true },
  { icon: Clock3, label: "Posticipata", count: "9", open: false },
  { icon: FileEdit, label: "Bozze", count: "12", open: true },
  { icon: Send, label: "Inviate", count: "246", open: false },
  { icon: Archive, label: "Archiviate", count: "1.128", open: false },
  { icon: ShieldAlert, label: "Spam", count: "4", open: false },
];

type DemoEmailIdentity = (typeof demoEmailIdentities)[number];
type DemoEmailFolder = (typeof demoEmailFolders)[number];

const demoEmailRows = [
  {
    from: "Fornitore Edilizia Nord",
    email: "fornitori@edilizianord.it",
    subject: "Consegna ODA 2026-018 spostata al 28/05",
    preview: "Buongiorno, il serramento alzante scorrevole arriverà con due giorni di ritardo...",
    badge: "Ritardo",
    color: "bg-orange-500",
    unread: true,
    starred: true,
    time: "10:42",
    attachments: 2,
  },
  {
    from: "Edilizia in Cloud",
    email: "lead@ediliziaincloud.com",
    subject: "Nuovo lead sito: richiesta preventivo",
    preview: "Cliente interessato a ristrutturazione bagno, zona Ferrara, budget indicato 8-12k...",
    badge: "Lead",
    color: "bg-blue-600",
    unread: true,
    starred: false,
    time: "09:18",
    attachments: 0,
  },
  {
    from: "Trasporti Bianchi",
    email: "tracking@trasportibianchi.it",
    subject: "DDT 7742 ricevuto · bancali parziali",
    preview: "Consegnati 4 bancali su 6. Firma digitale e foto scarico disponibili in allegato.",
    badge: "DDT",
    color: "bg-emerald-500",
    unread: false,
    starred: false,
    time: "Ieri",
    attachments: 1,
  },
  {
    from: "Studio Commercialista",
    email: "contabilita@studio-demo.it",
    subject: "Scadenze IVA e fatture da registrare",
    preview: "Mancano le fatture di acquisto del fornitore Nord Edil per chiudere il periodo.",
    badge: "Contabilità",
    color: "bg-slate-700",
    unread: false,
    starred: true,
    time: "22 mag",
    attachments: 3,
  },
  {
    from: "Meta for Business",
    email: "ads-noreply@facebookmail.com",
    subject: "Le tue inserzioni sono state approvate",
    preview: "La campagna lead generation può iniziare. Controlla budget, creatività e pubblico.",
    badge: "Ads",
    color: "bg-indigo-600",
    unread: false,
    starred: false,
    time: "21 mag",
    attachments: 0,
  },
];

type DemoEmailRow = (typeof demoEmailRows)[number];
type DemoQuickMailFilter = "all" | "unread" | "starred";
type DemoMailboxRow = DemoEmailRow & {
  status: "inbox" | "archived" | "trash";
  contactLinked: boolean;
};
type DemoAttachment = { name: string; type: string; size: string };
type ComposeDraft = {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachments: DemoAttachment[];
};

function getDemoEmailMessage(row: DemoEmailRow): string {
  if (row.badge === "Lead") {
    return "Buongiorno, abbiamo ricevuto una richiesta per una ristrutturazione bagno in zona Ferrara. Il cliente indica budget 8-12k e preferisce essere ricontattato entro domani mattina.";
  }
  if (row.badge === "DDT") {
    return "In allegato trovate il DDT 7742. Sono stati consegnati 4 bancali su 6; i restanti 2 risultano in transito e saranno consegnati al prossimo giro.";
  }
  if (row.badge === "Contabilità") {
    return "Buongiorno, per chiudere correttamente il periodo mancano alcune fatture di acquisto del fornitore Nord Edil. Vi chiediamo di inviarle entro fine giornata.";
  }
  if (row.badge === "Ads") {
    return "Le tue inserzioni sono state approvate. La campagna lead generation può iniziare: controlla budget, creatività e pubblico prima della pubblicazione definitiva.";
  }
  return "Buongiorno, confermiamo che la consegna prevista per l'ODA 2026-018 slitta al 28/05 per ritardo del reparto verniciatura. Possiamo anticipare i profili standard disponibili a magazzino e completare la consegna del serramento principale entro la nuova data.";
}

function getDemoAiInsight(row: DemoEmailRow): { title: string; body: string; action: string; note: string } {
  if (row.badge === "Lead") {
    return {
      title: "Lead caldo rilevato",
      body: "Richiesta preventivo con budget e urgenza chiari. Conviene creare opportunità CRM e rispondere entro 2 ore.",
      action: "Crea opportunità, prepara risposta e assegna follow-up commerciale.",
      note: "Silvio può generare una risposta orientata a sopralluogo e qualificazione.",
    };
  }
  if (row.badge === "DDT") {
    return {
      title: "DDT parziale rilevato",
      body: "Il documento indica una consegna incompleta. Serve riconciliare ODA, DDT e magazzino prima di chiudere la ricezione.",
      action: "Abbina DDT, segnala anomalia e crea task logistica.",
      note: "Allegati utili: DDT, foto scarico, firma ricezione.",
    };
  }
  if (row.badge === "Contabilità") {
    return {
      title: "Documento amministrativo",
      body: "La mail impatta la chiusura IVA. Serve recuperare fatture mancanti e collegarle al fornitore corretto.",
      action: "Crea task contabilità e cerca fatture correlate nello storico.",
      note: "Silvio può classificare la richiesta come pratica amministrativa.",
    };
  }
  if (row.badge === "Ads") {
    return {
      title: "Notifica marketing",
      body: "La campagna è pronta alla pubblicazione. Conviene verificare budget, pubblico e creatività prima dello start.",
      action: "Apri ADS Manager e controlla checklist pre-lancio.",
      note: "La mail può essere archiviata dopo verifica campagna.",
    };
  }
  return {
    title: "Ritardo rilevato",
    body: "L'ODA 2026-018 slitta al 28/05. Impatto: cantiere bagno zona Ferrara.",
    action: "Aggiorna ordine, avvisa capo cantiere e prepara risposta al fornitore.",
    note: "Allegati rilevati: DDT provvisorio, foto colli, conferma nuova data.",
  };
}

function getDemoReplyDraft(row: DemoEmailRow): string {
  if (row.badge === "Lead") {
    return "Buongiorno, grazie per la richiesta. Possiamo aiutarla a valutare il lavoro e preparare un preventivo chiaro. Le propongo un breve contatto telefonico per confermare misure, tempi e priorità del bagno.";
  }
  if (row.badge === "DDT") {
    return "Buongiorno, abbiamo ricevuto il DDT 7742 ma risultano consegnati 4 bancali su 6. Vi chiediamo conferma della data di consegna dei 2 bancali mancanti e del relativo aggiornamento documentale.";
  }
  if (row.badge === "Contabilità") {
    return "Buongiorno, grazie per l'avviso. Verifichiamo subito le fatture mancanti del fornitore Nord Edil e vi aggiorniamo entro fine giornata con i documenti corretti.";
  }
  if (row.badge === "Ads") {
    return "Grazie per la notifica. Procediamo con la verifica finale di budget, pubblico e creatività prima dell'avvio della campagna.";
  }
  return "Buongiorno, grazie per l'aggiornamento. Confermiamo la nuova data del 28/05 e vi chiediamo di inviarci appena possibile conferma scritta dei colli interessati, così aggiorniamo ODA e pianificazione del cantiere.";
}

function getDemoAttachments(row: DemoEmailRow): DemoAttachment[] {
  if (row.attachments <= 0) return [];

  if (row.badge === "Ritardo") {
    return [
      { name: "DDT-provvisorio-ODA-2026-018.pdf", type: "PDF", size: "214 KB" },
      { name: "foto-colli-verniciatura.jpg", type: "JPG", size: "1.2 MB" },
    ];
  }

  if (row.badge === "DDT") {
    return [
      { name: "DDT-7742-trasporti-bianchi.pdf", type: "PDF", size: "188 KB" },
    ];
  }

  if (row.badge === "Contabilità") {
    return [
      { name: "fatture-mancanti-maggio.xlsx", type: "XLSX", size: "72 KB" },
      { name: "scadenze-iva.pdf", type: "PDF", size: "140 KB" },
      { name: "estratto-fornitore-nord-edil.pdf", type: "PDF", size: "96 KB" },
    ];
  }

  return Array.from({ length: row.attachments }, (_, index) => ({
    name: `allegato-${index + 1}.pdf`,
    type: "PDF",
    size: "90 KB",
  }));
}

function getDemoThreadEvents(row: DemoEmailRow): Array<{ title: string; detail: string; time: string }> {
  if (row.badge === "Lead") {
    return [
      { title: "Nuovo lead ricevuto", detail: "Associato al contatto cliente@esempio.it e alla pipeline Preventivi.", time: "09:18" },
      { title: "AI suggerisce follow-up", detail: "Risposta entro 2 ore + proposta sopralluogo con slot disponibili.", time: "09:19" },
    ];
  }
  if (row.badge === "DDT") {
    return [
      { title: "DDT ricevuto", detail: "Documento 7742 agganciabile all'ODA 2026-018.", time: "Ieri" },
      { title: "Anomalia quantità", detail: "4 bancali consegnati su 6: serve conferma fornitore.", time: "Ieri" },
    ];
  }
  if (row.badge === "Contabilità") {
    return [
      { title: "Richiesta amministrativa", detail: "Scadenza IVA collegata allo Studio Commercialista.", time: "22 mag" },
      { title: "Documenti mancanti", detail: "Silvio propone ricerca fatture Nord Edil nello storico email.", time: "22 mag" },
    ];
  }
  return [
    { title: "Email fornitore ricevuta", detail: "Ritardo consegna rilevato su ODA 2026-018.", time: "10:42" },
    { title: "Impatto operativo", detail: "Aggiornare data consegna e avvisare il capo cantiere.", time: "10:43" },
  ];
}

function getDemoOperationalActions(row: DemoEmailRow): string[] {
  if (row.badge === "Lead") return ["Crea opportunità CRM", "Pianifica sopralluogo", "Scrivi risposta"];
  if (row.badge === "DDT") return ["Abbina DDT", "Crea anomalia", "Scrivi risposta"];
  if (row.badge === "Contabilità") return ["Crea task contabilità", "Cerca fatture", "Scrivi risposta"];
  if (row.badge === "Ads") return ["Apri ADS Manager", "Archivia notifica", "Scrivi risposta"];
  return ["Aggiorna ODA", "Crea task logistica", "Scrivi risposta"];
}

export default function EmailClientPage() {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const companyId = effectiveCompany?.id;
  const [showSlowFallback, setShowSlowFallback] = useState(false);
  const forceDemo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("__email_demo");

  const { data: connections, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-email-connections", userId, companyId],
    enabled: !forceDemo && !!userId && !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_email_oauth_connections_meta")
        .select("id, provider, email_address, status")
        .eq("company_id", companyId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!isLoading) {
      setShowSlowFallback(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSlowFallback(true), 5000);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const hasConnections = (connections?.length ?? 0) > 0;

  if (forceDemo) {
    return (
      <div className="container mx-auto max-w-6xl p-4 md:p-6">
        <EmptyConnectionsState />
      </div>
    );
  }

  if (isLoading && !showSlowFallback) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Skeleton className="h-[calc(100vh-8rem)]" />
      </div>
    );
  }

  if (isLoading && showSlowFallback) {
    return (
      <div className="container mx-auto max-w-6xl p-4 md:p-6">
        <EmptyConnectionsState
          mode="loading"
          onRetry={() => {
            setShowSlowFallback(false);
            void refetch();
          }}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto max-w-6xl p-4 md:p-6">
        <EmptyConnectionsState
          mode="error"
          errorMessage={error instanceof Error ? error.message : "Impossibile caricare le caselle email."}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!hasConnections) {
    return (
      <div className="container mx-auto max-w-6xl p-4 md:p-6">
        <EmptyConnectionsState />
      </div>
    );
  }

  return <EmailLayout />;
}

// ───────────────────────────────────────────────────────────────────────────

function EmptyConnectionsState({
  mode = "empty",
  errorMessage,
  onRetry,
}: {
  mode?: "empty" | "loading" | "error";
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const isLoadingMode = mode === "loading";
  const isErrorMode = mode === "error";

  return (
    <Card className="overflow-hidden border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-orange-50/40 shadow-sm">
      <CardContent className="grid gap-8 p-5 md:grid-cols-[0.9fr_1.4fr] md:p-8">
        <div className="flex flex-col justify-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-white shadow-sm">
            <Plug className="h-7 w-7 text-blue-600" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            {isLoadingMode ? "Sto caricando le caselle email" : isErrorMode ? "Non riesco a caricare le caselle" : "Collega una o più caselle email"}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">
            {isLoadingMode
              ? "La pagina resta utilizzabile anche se il controllo delle connessioni impiega qualche secondo. Puoi riprovare senza ricaricare tutto."
              : isErrorMode
                ? errorMessage ?? "C'è stato un problema nel leggere le connessioni email. La preview resta disponibile mentre riprovi."
                : "EiC diventa il tuo centro email operativo: Gmail, Outlook e IMAP/SMTP in un'unica vista, con cartelle per ogni casella, ricerca, invio e AI che riconosce priorità, lead e preventivi."}
          </p>
          <div className="mt-6 grid gap-2 text-left sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3">
            {[
              { icon: Tags, title: "Cartelle + caselle", text: "Posta, bozze, inviate e account sotto ogni voce." },
              { icon: Sparkles, title: "AI operativa", text: "Classifica, riassume e propone azioni." },
              { icon: Truck, title: "Acquisti + DDT", text: "Ritardi, ODA, fornitori e consegne sotto controllo." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm">
                  <Icon className="h-4 w-4 text-blue-600" />
                  <p className="mt-2 text-xs font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">{item.text}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {(isLoadingMode || isErrorMode) && onRetry && (
              <Button type="button" variant="outline" className="gap-2 rounded-xl border-blue-200 bg-white" onClick={onRetry}>
                Riprova caricamento
              </Button>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="w-fit gap-2 rounded-xl border-blue-200 bg-white text-blue-700 hover:bg-blue-50">
                  <Eye className="h-4 w-4" />
                  Vedi visuale demo
                </Button>
              </DialogTrigger>
              <EmailDemoDialog />
            </Dialog>
            <Button asChild className="w-fit gap-2 rounded-xl bg-blue-600 hover:bg-blue-700">
              <Link to="/azienda/impostazioni/mio-profilo">
                <Mail className="h-4 w-4" />
                Vai alle Impostazioni Email
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-[11px] text-slate-500">
            Gmail, Outlook e IMAP/SMTP custom · inbox personale isolata per utente · AI per priorità e riepiloghi.
          </p>
        </div>

        <MailboxPreview />
      </CardContent>
    </Card>
  );
}

function MailboxPreview() {
  const accounts = demoEmailAccounts;
  const folders = demoEmailFolders;
  const rows = demoEmailRows.slice(0, 4);
  const selectedRow = rows[0];

  return (
    <div className="rounded-[28px] border border-blue-100 bg-white p-3 shadow-xl shadow-blue-100/60">
      <div className="grid h-[520px] overflow-hidden rounded-2xl border border-slate-100 bg-white md:grid-cols-[210px_minmax(0,1fr)] 2xl:grid-cols-[190px_minmax(0,1fr)_245px]">
        <aside className="hidden border-r border-blue-100 bg-gradient-to-b from-white to-blue-50/60 p-3 sm:block">
          <button className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm">
            <PencilLine className="h-4 w-4" />
            Scrivi
          </button>
          <div className="space-y-1">
            {folders.map((folder, index) => {
              const Icon = folder.icon;
              return (
                <div
                  key={folder.label}
                  className={index === 0
                    ? "rounded-xl bg-blue-600 px-3 py-2 text-white shadow-sm"
                    : "rounded-xl px-3 py-2 text-slate-600"}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {folder.open ? <ChevronDown className="h-3 w-3 opacity-70" /> : <span className="h-3 w-3" />}
                    <Icon className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                    <span className="text-xs">{folder.count}</span>
                  </div>
                  {folder.open && (
                    <div className="ml-8 mt-2 space-y-1 border-l border-blue-100 pl-2">
                      {accounts.map((account, emailIndex) => (
                        <div
                          key={`${folder.label}-${account.email}`}
                          className={index === 0 && emailIndex === 0
                            ? "flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1 text-[11px] text-slate-700"
                            : index === 0
                              ? "flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] text-blue-100/90"
                            : "flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] text-slate-500"}
                        >
                          <span className={`h-2 w-2 rounded-full ${account.color}`} />
                          <span className="min-w-0 flex-1 truncate">{account.email}</span>
                          {index === 0 && <span className="text-[10px] font-semibold">{account.unread}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
        <main className="flex min-w-0 flex-col">
          <div className="border-b border-blue-100 bg-gradient-to-r from-white via-blue-50/50 to-orange-50/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-950">Posta in arrivo</p>
                <p className="text-xs text-slate-500">email@demo.srl · 1-25 di 244 email</p>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Search className="h-5 w-5" />
                <MoreHorizontal className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-400">
              <Search className="h-3.5 w-3.5 text-blue-500" />
              Cerca: from:fornitore ODA after:2026-05-01
            </div>
            <div className="mt-3 flex gap-2">
              {["Tutte", "Da fare", "Lead", "Fornitori"].map((chip, index) => (
                <span key={chip} className={index === 0
                  ? "rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800"
                  : "rounded-full bg-white px-3 py-1 text-xs text-slate-500"}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="mx-3 mt-3 rounded-2xl border border-orange-100 bg-orange-50/80 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-orange-900">
              <Sparkles className="h-4 w-4 text-orange-600" />
              Silvio ha trovato 3 email operative
            </div>
            <div className="mt-2 grid gap-2 text-[11px] text-slate-600 sm:grid-cols-3">
              <span className="inline-flex items-center gap-1 rounded-xl bg-white px-2 py-1">
                <CalendarClock className="h-3.5 w-3.5 text-orange-600" />
                aggiorna ritardi ODA
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-white px-2 py-1">
                <PackageCheck className="h-3.5 w-3.5 text-blue-600" />
                abbina DDT
              </span>
              <span className="inline-flex items-center gap-1 rounded-xl bg-white px-2 py-1">
                <Truck className="h-3.5 w-3.5 text-emerald-600" />
                prepara acquisti
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
            {rows.map((row) => (
              <div
                key={row.subject}
                className={row.subject === selectedRow.subject
                  ? "rounded-2xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm"
                  : "rounded-2xl border border-blue-100 bg-white p-3 shadow-sm"}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${row.color}`}>
                    {row.from.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">{row.from}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">{row.badge}</span>
                      {row.unread && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">{row.subject}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="min-w-0 flex-1 truncate">{row.preview}</span>
                      {row.attachments > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {row.attachments}
                        </span>
                      )}
                      <span>{row.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-center text-xs font-semibold text-blue-700">
              Carica email precedenti
            </div>
          </div>
        </main>
        <section className="hidden min-w-0 border-l border-blue-100 bg-white 2xl:flex 2xl:flex-col">
          <div className="border-b border-blue-100 p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
                {selectedRow.badge}
              </span>
              <CircleCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <h3 className="mt-3 text-sm font-semibold leading-tight text-slate-950">{selectedRow.subject}</h3>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              Da {selectedRow.email} a email@demo.srl
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                <Bot className="h-4 w-4 text-blue-600" />
                Analisi AI
              </div>
              <ul className="mt-2 space-y-2 text-[11px] leading-snug text-slate-600">
                <li>Ritardo su ODA 2026-018 rilevato.</li>
                <li>Aggiornare data consegna e avvisare cantiere.</li>
                <li>Bozza risposta pronta per conferma.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-100 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Anteprima messaggio</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Buongiorno, confermiamo che la consegna prevista per l'ODA 2026-018 slitta al 28/05 per ritardo del reparto
                verniciatura. Possiamo anticipare i profili standard disponibili a magazzino.
              </p>
            </div>
            <div className="grid gap-2 text-[11px] text-slate-600">
              {["Crea task logistica", "Aggiorna ODA", "Scrivi risposta"].map((action) => (
                <button key={action} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-left font-medium text-blue-700 shadow-sm">
                  {action}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function EmailDemoDialog() {
  return (
    <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-1.25rem)] max-w-[1500px] overflow-hidden rounded-2xl border-blue-100 p-0 shadow-2xl">
      <DialogHeader className="border-b border-blue-100 bg-gradient-to-r from-white via-blue-50/80 to-orange-50/50 px-4 py-3">
        <div className="flex flex-col gap-2 pr-8 md:flex-row md:items-center md:justify-between">
          <div>
            <DialogTitle className="text-lg text-slate-950">Demo casella email operativa</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-slate-500">
              Vista realistica con più caselle, storico, categorie e azioni AI su lead, fornitori e DDT.
            </DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">email@demo.srl sincronizzata</span>
            <span className="rounded-full border border-blue-100 bg-white px-3 py-1">244 email</span>
          </div>
        </div>
      </DialogHeader>
      <DemoMailboxExperience />
    </DialogContent>
  );
}

function DemoMailboxExperience() {
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | null>(null);
  const [composeExpanded, setComposeExpanded] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [compactView, setCompactView] = useState(true);
  const [detailVisible, setDetailVisible] = useState(true);
  const [activeCategory, setActiveCategory] = useState("Tutte");
  const [quickMailFilter, setQuickMailFilter] = useState<DemoQuickMailFilter>("all");
  const [selectedFolderLabel, setSelectedFolderLabel] = useState("Posta in arrivo");
  const [expandedFolderLabels, setExpandedFolderLabels] = useState<string[]>(() =>
    demoEmailFolders
      .filter((folder) => folder.open || folder.label === "Bozze")
      .map((folder) => folder.label),
  );
  const [customFolders, setCustomFolders] = useState<DemoEmailFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [demoSearch, setDemoSearch] = useState("");
  const [identities, setIdentities] = useState<DemoEmailIdentity[]>(demoEmailIdentities);
  const [selectedIdentityEmail, setSelectedIdentityEmail] = useState(demoEmailIdentity.email);
  const [identityEditorOpen, setIdentityEditorOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [emailRows, setEmailRows] = useState<DemoMailboxRow[]>(() =>
    demoEmailRows.map((row) => ({
      ...row,
      status: "inbox",
      contactLinked: false,
    })),
  );
  const primaryIdentity = identities[0] ?? demoEmailIdentity;
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({
    from: primaryIdentity.email,
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    attachments: [],
  });
  const folders = [...demoEmailFolders, ...customFolders];
  const getEditableIdentity = (email: string) =>
    identities.find((identity) => identity.email === email) ?? primaryIdentity;
  const activeIdentity = getEditableIdentity(composeDraft.from);
  const selectedIdentity = getEditableIdentity(selectedIdentityEmail);
  const selectedFolder = folders.find((folder) => folder.label === selectedFolderLabel);
  const selectedFolderTotal = selectedFolder?.count ?? "244";
  const getRowsForFolder = (folderLabel: string) => {
    if (folderLabel === "Archiviate") return emailRows.filter((row) => row.status === "archived");
    if (folderLabel === "Contrassegnata") return emailRows.filter((row) => row.starred && row.status !== "trash");
    if (folderLabel === "Spam") return [];
    if (folderLabel === "Posta in arrivo") return emailRows.filter((row) => row.status === "inbox");
    if (folderLabel === "Bozze" || folderLabel === "Inviate" || folderLabel === "Posticipata") return [];
    return emailRows.filter((row) => row.status === "inbox");
  };
  const folderRows = getRowsForFolder(selectedFolderLabel);
  const getRowsForQuickFilter = (filter: DemoQuickMailFilter, rows: DemoMailboxRow[] = folderRows) => {
    if (filter === "unread") return rows.filter((row) => row.unread);
    if (filter === "starred") return rows.filter((row) => row.starred);
    return rows;
  };
  const visibleEmailRows = getRowsForQuickFilter(quickMailFilter, folderRows);
  const selectedRow = emailRows[selectedRowIndex] ?? visibleEmailRows[0] ?? emailRows[0];
  const aiInsight = getDemoAiInsight(selectedRow);
  const replyDraft = getDemoReplyDraft(selectedRow);
  const attachments = getDemoAttachments(selectedRow);
  const threadEvents = getDemoThreadEvents(selectedRow);
  const operationalActions = getDemoOperationalActions(selectedRow);
  const quickFilterOptions: Array<{
    key: DemoQuickMailFilter;
    label: string;
    count: number;
    icon: typeof Inbox;
  }> = [
    { key: "all", label: "Tutte", count: folderRows.length, icon: Inbox },
    { key: "unread", label: "Da leggere", count: folderRows.filter((row) => row.unread).length, icon: Mail },
    { key: "starred", label: "Contrassegnate", count: folderRows.filter((row) => row.starred).length, icon: Star },
  ];

  const applyQuickMailFilter = (filter: DemoQuickMailFilter) => {
    const nextRows = getRowsForQuickFilter(filter, folderRows);
    setQuickMailFilter(filter);
    if (nextRows[0]) {
      const nextIndex = emailRows.findIndex((row) => row.subject === nextRows[0].subject);
      setSelectedRowIndex(Math.max(nextIndex, 0));
      setAiPanelOpen(false);
      setTimelineOpen(false);
    }
    setDetailVisible(true);
    setActionStatus(
      filter === "all"
        ? "Vista demo ripristinata su tutte le email."
        : `Filtro rapido "${filter === "unread" ? "Da leggere" : "Contrassegnate"}" applicato.`,
    );
  };

  const selectDemoFolder = (folderLabel: string) => {
    const nextRows = getRowsForFolder(folderLabel);
    setSelectedFolderLabel(folderLabel);
    setQuickMailFilter("all");
    setActionStatus(`Cartella "${folderLabel}" selezionata.`);
    setDetailVisible(true);
    if (nextRows[0]) {
      const nextIndex = emailRows.findIndex((row) => row.subject === nextRows[0].subject);
      setSelectedRowIndex(Math.max(nextIndex, 0));
      setAiPanelOpen(false);
      setTimelineOpen(false);
    }
  };

  const selectNextVisibleRow = (currentSubject: string) => {
    const nextRow =
      visibleEmailRows.find((row) => row.subject !== currentSubject)
      ?? emailRows.find((row) => row.subject !== currentSubject && row.status === "inbox")
      ?? emailRows.find((row) => row.subject !== currentSubject && row.status !== "trash");

    if (nextRow) {
      const nextIndex = emailRows.findIndex((row) => row.subject === nextRow.subject);
      setSelectedRowIndex(Math.max(nextIndex, 0));
      setAiPanelOpen(false);
      setTimelineOpen(false);
    }
  };

  const toggleSelectedReadStatus = () => {
    const nextUnread = !selectedRow.unread;
    setEmailRows((current) =>
      current.map((row) =>
        row.subject === selectedRow.subject ? { ...row, unread: nextUnread } : row,
      ),
    );
    if (!nextUnread && quickMailFilter === "unread") {
      selectNextVisibleRow(selectedRow.subject);
    }
    setActionStatus(nextUnread ? "Email demo segnata come da leggere." : "Email demo segnata come letta.");
  };

  const archiveSelectedEmail = () => {
    setEmailRows((current) =>
      current.map((row) =>
        row.subject === selectedRow.subject ? { ...row, status: "archived" } : row,
      ),
    );
    selectNextVisibleRow(selectedRow.subject);
    setActionStatus("Email demo archiviata. La trovi nella cartella Archiviate.");
  };

  const trashSelectedEmail = () => {
    setEmailRows((current) =>
      current.map((row) =>
        row.subject === selectedRow.subject ? { ...row, status: "trash" } : row,
      ),
    );
    selectNextVisibleRow(selectedRow.subject);
    setActionStatus("Email demo spostata nel cestino.");
  };

  const linkSelectedContact = () => {
    setEmailRows((current) =>
      current.map((row) =>
        row.subject === selectedRow.subject ? { ...row, contactLinked: true } : row,
      ),
    );
    setActionStatus(`Contatto ${selectedRow.from} collegato a rubrica, CRM e storico conversazioni.`);
  };

  const updateSelectedIdentity = (
    field: "displayName" | "role" | "avatar" | "signature",
    value: string,
  ) => {
    setIdentities((current) =>
      current.map((identity) => {
        if (identity.email !== selectedIdentityEmail) return identity;
        if (field === "signature") {
          return {
            ...identity,
            signature: value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          };
        }
        return { ...identity, [field]: value };
      }),
    );
  };

  const createDemoFolder = () => {
    const label = newFolderName.trim();
    if (!label) {
      setActionStatus("Inserisci un nome per creare una nuova cartella demo.");
      return;
    }
    if (folders.some((folder) => folder.label.toLowerCase() === label.toLowerCase())) {
      setActionStatus(`La cartella "${label}" esiste già nella demo.`);
      return;
    }
    setCustomFolders((current) => [
      ...current,
      { icon: Tags, label, count: "0", open: false },
    ]);
    setExpandedFolderLabels((current) => [...current, label]);
    setSelectedFolderLabel(label);
    setNewFolderName("");
    setActionStatus(`Cartella "${label}" creata. Nella versione reale sarà sincronizzata per utente/casella.`);
  };

  const openReplyDemo = () => {
    const fromEmail = selectedRow.badge === "DDT" || selectedRow.badge === "Ritardo" ? "ordini@demo.srl" : primaryIdentity.email;
    const fromIdentity = getEditableIdentity(fromEmail);
    setComposeMode("reply");
    setComposeExpanded(false);
    setShowCcBcc(false);
    setComposeDraft({
      from: fromEmail,
      to: selectedRow.email,
      cc: "",
      bcc: "",
      subject: `Re: ${selectedRow.subject}`,
      body: replyDraft,
      attachments: [],
    });
    setDetailVisible(true);
    setActionStatus(`Risposta AI pronta con firma della casella ${fromIdentity.email}.`);
  };

  const toggleDemoFolder = (folderLabel: string) => {
    const isExpanded = expandedFolderLabels.includes(folderLabel);
    setExpandedFolderLabels((current) =>
      isExpanded
        ? current.filter((label) => label !== folderLabel)
        : [...current, folderLabel],
    );
    setActionStatus(`Cartella "${folderLabel}" ${isExpanded ? "chiusa" : "aperta"}.`);
  };

  const openNewCompose = () => {
    setComposeMode("new");
    setComposeExpanded(false);
    setShowCcBcc(false);
    setComposeDraft({
      from: primaryIdentity.email,
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      attachments: [],
    });
    setActionStatus("Nuova email demo aperta con identità e firma già pronte.");
  };

  const handleDemoAction = (action: string) => {
    if (action === "Scrivi risposta") {
      openReplyDemo();
      return;
    }
    if (action === "Archivia notifica") {
      setActionStatus("Email demo archiviata. Puoi annullare l'azione entro pochi secondi.");
      return;
    }
    setActionStatus(`${action}: azione demo pronta per conferma utente.`);
  };

  const addComposeAttachment = () => {
    const nextIndex = composeDraft.attachments.length + 1;
    setComposeDraft((draft) => ({
      ...draft,
      attachments: [
        ...draft.attachments,
        {
          name: nextIndex === 1 ? "preventivo-demo.pdf" : `allegato-demo-${nextIndex}.pdf`,
          type: "PDF",
          size: nextIndex === 1 ? "156 KB" : "90 KB",
        },
      ],
    }));
  };

  const removeComposeAttachment = (name: string) => {
    setComposeDraft((draft) => ({
      ...draft,
      attachments: draft.attachments.filter((attachment) => attachment.name !== name),
    }));
  };

  const handleSendDemo = () => {
    if (!composeDraft.to.trim()) {
      setActionStatus("Inserisci almeno un destinatario prima di inviare la demo.");
      return;
    }
    if (!composeDraft.subject.trim()) {
      setActionStatus("Aggiungi un oggetto prima di inviare la demo.");
      return;
    }
    setComposeMode(null);
    setComposeExpanded(false);
    setActionStatus(`Email demo pronta per l'invio da ${activeIdentity.email}. Bozza validata con firma e allegati.`);
  };

  const openForwardDemo = () => {
    setComposeMode("new");
    setComposeExpanded(false);
    setShowCcBcc(false);
    setComposeDraft({
      from: primaryIdentity.email,
      to: "",
      cc: "",
      bcc: "",
      subject: `Fwd: ${selectedRow.subject}`,
      body: [
        "",
        "---------- Messaggio inoltrato ----------",
        `Da: ${selectedRow.from} <${selectedRow.email}>`,
        `Oggetto: ${selectedRow.subject}`,
        "",
        getDemoEmailMessage(selectedRow),
      ].join("\n"),
      attachments: getDemoAttachments(selectedRow),
    });
    setActionStatus("Inoltro demo preparato con allegati del thread.");
  };

  return (
    <div
      className={
        detailVisible
          ? "relative grid h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden bg-white lg:grid-cols-[210px_minmax(390px,0.92fr)_minmax(390px,1.08fr)]"
          : "relative grid h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden bg-white lg:grid-cols-[210px_minmax(520px,1fr)]"
      }
    >
      <aside className="hidden min-h-0 border-r border-blue-100 bg-slate-50/80 p-2.5 lg:flex lg:flex-col">
        <Button
          type="button"
          className="h-10 justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm hover:bg-blue-700"
          onClick={openNewCompose}
        >
          <PencilLine className="h-4 w-4" />
          Scrivi
        </Button>
        <div className="mt-3 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Cartelle</span>
          <span>{demoEmailAccounts.length} caselle</span>
        </div>
        <form
          className="mt-2 flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            createDemoFolder();
          }}
        >
          <input
            aria-label="Nome nuova cartella demo"
            className="h-8 min-w-0 flex-1 rounded-lg border border-blue-100 bg-white px-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300"
            value={newFolderName}
            placeholder="Nuova cartella"
            onChange={(event) => setNewFolderName(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="icon"
            title="Crea nuova cartella"
            className="h-8 w-8 rounded-lg border-blue-100 bg-white"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </form>
        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {folders.map((folder) => {
            const Icon = folder.icon;
            const selected = folder.label === selectedFolderLabel;
            const expanded = expandedFolderLabels.includes(folder.label);
            return (
              <div
                key={`demo-${folder.label}`}
                className={selected ? "rounded-xl bg-blue-600 text-white shadow-sm" : "rounded-xl text-slate-600 hover:bg-white"}
              >
                <div className="flex h-9 w-full items-center gap-1 px-1.5 text-sm font-semibold">
                  <button
                    type="button"
                    className={selected
                      ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/90 hover:bg-white/15"
                      : "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700"}
                    onClick={() => toggleDemoFolder(folder.label)}
                    title={expanded ? `Chiudi ${folder.label}` : `Apri ${folder.label}`}
                    aria-label={expanded ? `Chiudi ${folder.label}` : `Apri ${folder.label}`}
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left"
                    onClick={() => selectDemoFolder(folder.label)}
                    title={`Seleziona ${folder.label}`}
                    aria-label={`Seleziona ${folder.label}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{folder.label}</span>
                    <span className="text-xs">{folder.count}</span>
                  </button>
                </div>
                {expanded && (
                  <div className={selected ? "mx-2 mb-2 space-y-1 border-l border-white/35 pl-2" : "mx-2 mb-2 space-y-1 border-l border-blue-100 pl-2"}>
                    {demoEmailAccounts.map((account, accountIndex) => (
                      <button
                        key={`demo-${folder.label}-${account.email}`}
                        type="button"
                        onClick={() => {
                          setSelectedIdentityEmail(account.email);
                          setComposeDraft((draft) => ({ ...draft, from: account.email }));
                          setActionStatus(`Casella ${account.email} selezionata.`);
                        }}
                        className={selected && accountIndex === 0
                          ? "flex w-full items-center gap-2 rounded-lg bg-white/90 px-2 py-1.5 text-left text-[11px] text-slate-700"
                          : selected
                            ? "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-blue-100/90"
                            : "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-slate-500"}
                      >
                        <span className={`h-2 w-2 rounded-full ${account.color}`} />
                        <span className="min-w-0 flex-1 truncate">{account.email}</span>
                        {selected && <span className="font-semibold">{account.unread}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
              {selectedIdentity.avatar}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900">{selectedIdentity.displayName}</span>
              <span className="block truncate text-[11px]">{selectedIdentity.role}</span>
            </span>
          </div>
          <p className="mt-2 rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] leading-4 text-blue-900">
            Firma attiva su {selectedIdentity.email}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-8 w-full rounded-lg border-blue-100 text-xs"
            onClick={() => setIdentityEditorOpen((open) => !open)}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Modifica casella
          </Button>
          {identityEditorOpen && (
            <div className="mt-2 space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-2">
              <select
                aria-label="Casella da modificare"
                className="h-8 w-full rounded-lg border border-blue-100 bg-white px-2 text-xs text-slate-700 outline-none"
                value={selectedIdentityEmail}
                onChange={(event) => {
                  setSelectedIdentityEmail(event.target.value);
                  setComposeDraft((draft) => ({ ...draft, from: event.target.value }));
                }}
              >
                {identities.map((identity) => (
                  <option key={`edit-${identity.email}`} value={identity.email}>{identity.email}</option>
                ))}
              </select>
              <input
                aria-label="Nome visualizzato casella"
                className="h-8 w-full rounded-lg border border-blue-100 bg-white px-2 text-xs text-slate-700 outline-none"
                value={selectedIdentity.displayName}
                onChange={(event) => updateSelectedIdentity("displayName", event.target.value)}
              />
              <input
                aria-label="Ruolo casella"
                className="h-8 w-full rounded-lg border border-blue-100 bg-white px-2 text-xs text-slate-700 outline-none"
                value={selectedIdentity.role}
                onChange={(event) => updateSelectedIdentity("role", event.target.value)}
              />
              <input
                aria-label="Avatar casella"
                className="h-8 w-full rounded-lg border border-blue-100 bg-white px-2 text-xs text-slate-700 outline-none"
                maxLength={2}
                value={selectedIdentity.avatar}
                onChange={(event) => updateSelectedIdentity("avatar", event.target.value.toUpperCase())}
              />
              <textarea
                aria-label="Firma email demo"
                className="min-h-[76px] w-full resize-none rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-xs leading-5 text-slate-700 outline-none"
                value={selectedIdentity.signature.join("\n")}
                onChange={(event) => updateSelectedIdentity("signature", event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full rounded-lg border-blue-100 bg-white text-xs"
                onClick={() => setActionStatus(`Impostazioni di ${selectedIdentity.email} aggiornate nella demo.`)}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Salva demo
              </Button>
            </div>
          )}
        </div>
      </aside>

      <main className={detailVisible ? "min-h-0 overflow-hidden lg:border-r lg:border-blue-100" : "min-h-0 overflow-hidden"}>
        <div className="border-b border-blue-100 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-slate-950">{selectedFolderLabel}</p>
              <p className="text-xs text-slate-500">{selectedIdentity.email} · 1-25 di {selectedFolderTotal} email</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="hidden h-8 rounded-lg border-blue-100 px-2 text-xs md:inline-flex"
                onClick={() => setCompactView((value) => !value)}
              >
                {compactView ? "Vista comoda" : "Vista compatta"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                title={detailVisible ? "Nascondi colonna lettura" : "Mostra colonna lettura"}
                aria-label={detailVisible ? "Nascondi colonna lettura" : "Mostra colonna lettura"}
                onClick={() => setDetailVisible((visible) => !visible)}
              >
                {detailVisible ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                title="Aggiorna email demo"
                aria-label="Aggiorna email demo"
                onClick={() => setActionStatus("Posta demo aggiornata. Nessun nuovo messaggio.")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                title="Apri impostazioni caselle"
                aria-label="Apri impostazioni caselle"
                onClick={() => {
                  setIdentityEditorOpen(true);
                  setActionStatus("Impostazioni caselle aperte nella colonna sinistra.");
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2 text-sm text-slate-400">
            <Search className="h-4 w-4 text-blue-500" />
            <input
              aria-label="Cerca email demo"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              value={demoSearch}
              placeholder="Cerca nello storico: from:fornitore ODA after:2026-05-01"
              onChange={(event) => setDemoSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setActionStatus(`Ricerca demo applicata: ${demoSearch || "nessun filtro"}.`);
                }
              }}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Tutte", "Da fare", "Lead", "Fornitori", "DDT", "Contabilità"].map((chip) => (
              <button
                key={`demo-chip-${chip}`}
                type="button"
                onClick={() => {
                  setActiveCategory(chip);
                  setActionStatus(`Filtro "${chip}" applicato nella demo.`);
                }}
                className={activeCategory === chip
                  ? "rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-blue-100 bg-white px-3 py-1 text-xs text-slate-600"}
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-blue-50 pt-2">
            {quickFilterOptions.map((filter) => {
              const Icon = filter.icon;
              const active = quickMailFilter === filter.key;
              return (
                <button
                  key={`quick-mail-filter-${filter.key}`}
                  type="button"
                  onClick={() => applyQuickMailFilter(filter.key)}
                  className={active
                    ? "inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                    : "inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-200 hover:bg-blue-50/70"}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {filter.label}
                  <span className={active ? "text-white/80" : "text-slate-400"}>{filter.count}</span>
                </button>
              );
            })}
          </div>
          {actionStatus && !detailVisible && (
            <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
              {actionStatus}
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto bg-white">
          <div className="border-b border-orange-100 bg-orange-50/80 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-orange-900">
              <Sparkles className="h-4 w-4 text-orange-600" />
              Silvio ha trovato 3 email operative
            </div>
            <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
              {["Aggiorna ritardi ODA", "Abbina DDT", "Prepara acquisti"].map((action) => (
                <button
                  key={`quick-${action}`}
                  type="button"
                  className="rounded-lg bg-white px-3 py-2 text-left font-medium hover:bg-orange-100/70"
                  onClick={() => handleDemoAction(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
          {visibleEmailRows.map((row) => {
            const rowIndex = emailRows.findIndex((item) => item.subject === row.subject);
            const selected = row.subject === selectedRow.subject;
            const rowTone = selected
              ? "border-l-blue-600 bg-blue-50/80 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.08)]"
              : row.unread
                ? "border-l-transparent bg-white hover:bg-blue-50/40"
                : "border-l-transparent bg-slate-50/70 hover:bg-blue-50/30";
            return (
              <button
                key={`demo-row-${row.subject}`}
                type="button"
                aria-label={`Apri email ${row.subject}`}
                onClick={() => {
                  setSelectedRowIndex(rowIndex);
                  setAiPanelOpen(false);
                  setTimelineOpen(false);
                  setActionStatus(null);
                  setDetailVisible(true);
                }}
                className={`w-full border-b border-slate-100 border-l-4 px-3 text-left transition-colors ${rowTone} ${compactView ? "py-2" : "py-3"}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${compactView ? "h-8 w-8" : "h-9 w-9"} ${row.color}`}>
                    {row.from.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {row.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" title="Da leggere" />}
                      <p className={`truncate text-sm ${row.unread ? "font-bold text-slate-950" : "font-semibold text-slate-700"}`}>
                        {row.from}
                      </p>
                      {row.starred && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Contrassegnata" />
                      )}
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{row.badge}</span>
                      {row.unread && (
                        <span className="hidden rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 sm:inline-flex">
                          Da leggere
                        </span>
                      )}
                      <span className={`ml-auto shrink-0 text-xs ${row.unread ? "font-semibold text-slate-700" : "text-slate-400"}`}>
                        {row.time}
                      </span>
                    </div>
                    <p className={`mt-0.5 truncate text-sm ${row.unread ? "font-bold text-slate-900" : "font-medium text-slate-600"}`}>
                      {row.subject}
                    </p>
                    <div className={`mt-0.5 flex min-w-0 items-center gap-2 text-xs ${row.unread ? "text-slate-500" : "text-slate-400"}`}>
                      <span className="min-w-0 flex-1 truncate">{row.preview}</span>
                      {row.attachments > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {row.attachments}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {visibleEmailRows.length === 0 && (
            <div className="p-4 text-sm text-slate-500">
              Nessuna email demo per questo filtro rapido.
            </div>
          )}
          <div className="border-t border-blue-100 bg-blue-50/50 p-3 lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Anteprima selezionata</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{selectedRow.subject}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{getDemoEmailMessage(selectedRow)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {operationalActions.map((action) => (
                <Button
                  key={`mobile-${action}`}
                  type="button"
                  variant="outline"
                  className="h-8 rounded-lg border-blue-100 bg-white px-2 text-xs text-blue-700"
                  onClick={() => handleDemoAction(action)}
                >
                  {action}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {detailVisible && (
      <section className="hidden min-h-0 flex-col bg-white lg:flex">
        <div className="border-b border-blue-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">{selectedRow.badge}</span>
              {selectedRow.unread ? (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Da leggere</span>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Letta</span>
              )}
              {selectedRow.contactLinked && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Contatto collegato</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                onClick={toggleSelectedReadStatus}
                title={selectedRow.unread ? "Segna come letta" : "Segna come da leggere"}
                aria-label={selectedRow.unread ? "Segna come letta" : "Segna come da leggere"}
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                onClick={archiveSelectedEmail}
                title="Archivia"
                aria-label="Archivia email demo"
              >
                <Archive className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                onClick={openReplyDemo}
                title="Rispondi"
                aria-label="Rispondi email demo"
              >
                <Reply className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                onClick={linkSelectedContact}
                title="Aggiungi contatto"
                aria-label="Aggiungi contatto email demo"
              >
                <UserPlus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100 text-slate-500 hover:text-red-600"
                onClick={trashSelectedEmail}
                title="Sposta nel cestino"
                aria-label="Sposta email demo nel cestino"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-blue-100"
                onClick={() => setDetailVisible(false)}
                title="Chiudi pannello lettura"
                aria-label="Chiudi pannello lettura"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <h3 className="mt-3 text-lg font-semibold leading-tight text-slate-950">{selectedRow.subject}</h3>
          <p className="mt-1.5 text-sm text-slate-500">
            Da {selectedRow.email} a <span className="font-medium text-slate-700">{selectedIdentity.email}</span>
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              title={aiPanelOpen ? "Comprimi analisi AI" : "Espandi analisi AI"}
              className="flex w-full items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left"
              onClick={() => setAiPanelOpen((open) => !open)}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <Bot className="h-5 w-5 text-blue-600" />
                  Analisi predittiva
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-600">
                  Categoria, priorità e azioni suggerite per questa conversazione.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                  {selectedRow.badge}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm">
                  {aiPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </span>
            </button>
            {aiPanelOpen ? (
              <div className="grid gap-3 p-4 text-sm text-slate-700">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">Segnale principale</p>
                  <p className="mt-1 font-semibold text-slate-950">{aiInsight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">{aiInsight.body}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Prossima mossa</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-slate-800">{aiInsight.action}</p>
                </div>
                <div className="rounded-xl border border-orange-100 bg-orange-50/70 p-3 text-xs leading-5 text-orange-950">
                  {aiInsight.note}
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-xs leading-5 text-slate-700">
                {aiInsight.title} · {aiInsight.action}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Messaggio originale</p>
            <p className="mt-3 text-sm leading-7 text-slate-800">{getDemoEmailMessage(selectedRow)}</p>
          </div>

          {attachments.length > 0 && (
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Allegati ({attachments.length})
                </p>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                  visibili nel thread
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {attachments.map((attachment) => (
                  <button
                    key={attachment.name}
                    type="button"
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50"
                    onClick={() => setActionStatus(`Allegato demo "${attachment.name}" aperto in anteprima.`)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">{attachment.name}</span>
                      <span className="block text-xs text-slate-500">{attachment.type} · {attachment.size}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              title={timelineOpen ? "Comprimi timeline collegata" : "Espandi timeline collegata"}
              className="flex w-full items-center justify-between gap-3 bg-slate-50/90 px-4 py-3 text-left hover:bg-blue-50/60"
              onClick={() => setTimelineOpen((open) => !open)}
            >
              <span className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Timeline collegata</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  Eventi, agganci CRM e azioni collegate alla conversazione.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {threadEvents.length} eventi
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm">
                  {timelineOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </span>
            </button>
            {timelineOpen ? (
              <div className="relative space-y-3 border-t border-slate-200 bg-slate-50/50 p-4 pl-8">
                <div className="absolute bottom-4 left-[22px] top-4 w-px bg-blue-200" />
                {threadEvents.map((event) => (
                  <div key={event.title} className="relative rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <span className="absolute -left-[19px] top-3 h-3 w-3 rounded-full border-2 border-white bg-blue-600 shadow-sm" />
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{event.title}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{event.time}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{event.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-600">
                Ultimo evento: <span className="font-semibold text-slate-900">{threadEvents[0]?.title}</span>
                {threadEvents[0]?.time ? ` · ${threadEvents[0].time}` : ""}
              </div>
            )}
          </div>
          {actionStatus && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              {actionStatus}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {operationalActions.map((action) => (
              <Button
                key={`demo-action-${action}`}
                type="button"
                variant="outline"
                className="h-auto justify-start rounded-xl border-blue-100 bg-white px-3 py-2 text-left text-blue-700"
                onClick={() => handleDemoAction(action)}
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      </section>
      )}

      {composeMode && (
        <div
          className={composeExpanded
            ? "absolute inset-4 z-30 flex flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl"
            : "absolute bottom-4 right-4 z-30 flex w-[min(560px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl"}
        >
          <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {composeMode === "reply" ? "Risposta demo" : "Nuova email demo"}
              </p>
              <p className="text-xs text-slate-500">Autosave bozza · firma per casella · allegati pronti</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title={composeExpanded ? "Riduci composizione" : "Ingrandisci composizione"}
                className="h-8 w-8 rounded-lg"
                onClick={() => setComposeExpanded((expanded) => !expanded)}
              >
                {composeExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Chiudi composizione"
                className="h-8 w-8 rounded-lg"
                onClick={() => setComposeMode(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className={composeExpanded ? "min-h-0 flex-1 space-y-2 overflow-y-auto p-4 text-sm" : "space-y-2 p-4 text-sm"}>
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
              <span className="w-12 text-xs font-semibold uppercase text-slate-400">Da</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {activeIdentity.avatar}
              </span>
              <select
                aria-label="Mittente"
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none"
                value={composeDraft.from}
                onChange={(event) => setComposeDraft((draft) => ({ ...draft, from: event.target.value }))}
              >
                {identities.map((identity) => (
                  <option key={identity.email} value={identity.email}>
                    {identity.displayName} · {identity.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
              <span className="w-12 text-xs font-semibold uppercase text-slate-400">A</span>
              <input
                aria-label="Destinatario"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                value={composeDraft.to}
                placeholder="cliente@esempio.it"
                onChange={(event) => setComposeDraft((draft) => ({ ...draft, to: event.target.value }))}
              />
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                onClick={() => setShowCcBcc((value) => !value)}
              >
                Cc/Ccn
              </button>
            </div>
            {showCcBcc && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <span className="w-12 text-xs font-semibold uppercase text-slate-400">Cc</span>
                  <input
                    aria-label="Cc"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={composeDraft.cc}
                    placeholder="capocantiere@demo.srl"
                    onChange={(event) => setComposeDraft((draft) => ({ ...draft, cc: event.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                  <span className="w-12 text-xs font-semibold uppercase text-slate-400">Ccn</span>
                  <input
                    aria-label="Ccn"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    value={composeDraft.bcc}
                    placeholder="amministrazione@demo.srl"
                    onChange={(event) => setComposeDraft((draft) => ({ ...draft, bcc: event.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
              <span className="w-12 text-xs font-semibold uppercase text-slate-400">Oggetto</span>
              <input
                aria-label="Oggetto"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                value={composeDraft.subject}
                placeholder="Oggetto del messaggio"
                onChange={(event) => setComposeDraft((draft) => ({ ...draft, subject: event.target.value }))}
              />
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <textarea
                aria-label="Corpo email"
                className={composeExpanded
                  ? "min-h-[280px] w-full resize-none bg-transparent text-sm leading-7 text-slate-700 outline-none placeholder:text-slate-400"
                  : "min-h-[130px] w-full resize-none bg-transparent text-sm leading-7 text-slate-700 outline-none placeholder:text-slate-400"}
                value={composeDraft.body}
                placeholder="Scrivi qui il messaggio. Silvio può generare una bozza partendo dal contesto di cliente, fornitore, ordine, DDT o preventivo."
                onChange={(event) => setComposeDraft((draft) => ({ ...draft, body: event.target.value }))}
              />
              <div className="mt-5 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                {activeIdentity.signature.map((line, index) => (
                  <p key={`${activeIdentity.email}-signature-${index}`}>{line}</p>
                ))}
              </div>
            </div>
            {composeDraft.attachments.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <Paperclip className="h-4 w-4 text-blue-600" />
                  Allegati pronti da inviare
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {composeDraft.attachments.map((attachment) => (
                    <button
                      key={`draft-${attachment.name}`}
                      type="button"
                      className="inline-flex max-w-full items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-100"
                      onClick={() => removeComposeAttachment(attachment.name)}
                      title="Rimuovi allegato demo"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span className="truncate">{attachment.name}</span>
                      <X className="h-3 w-3 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {composeMode === "reply" && attachments.length > 0 && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                  <Paperclip className="h-4 w-4" />
                  Allegati del thread visibili
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <span
                      key={`compose-${attachment.name}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-1.5 text-xs text-slate-600"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span className="truncate">{attachment.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-blue-100 bg-slate-50 px-4 py-3">
            <Button type="button" className="h-9 rounded-xl bg-blue-600 px-4 text-sm hover:bg-blue-700" onClick={handleSendDemo}>
              <Send className="mr-2 h-4 w-4" />
              Invia demo
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={addComposeAttachment} title="Aggiungi allegato demo">
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="hidden items-center gap-1 text-slate-500 sm:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                title="Annulla ultima azione"
                onClick={() => setActionStatus("Ultima azione demo annullata. La bozza resta salvata.")}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" title="Inoltra" onClick={openForwardDemo}>
                <Forward className="h-4 w-4" />
              </Button>
            </div>
            <span className="ml-auto text-xs font-medium text-emerald-700">Bozza salvata</span>
          </div>
        </div>
      )}
    </div>
  );
}
