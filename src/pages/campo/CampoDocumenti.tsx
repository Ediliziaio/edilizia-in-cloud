/**
 * Documenti dipendente — lista con badge scadenza; dal 24/11/2026 l'operaio carica anche i suoi attestati.
 *
 * Leggeva `documenti_dipendenti`: una TERZA tabella, diversa sia da quella su
 * cui l'ufficio carica sia da quella che manda gli avvisi di scadenza. Il
 * risultato era che l'operaio non avrebbe mai visto un documento caricato
 * dall'ufficio, qualunque cosa l'ufficio facesse. Ora legge `hr_documenti`
 * tramite il proprio profilo HR (policy self-read già in RLS): la stessa fonte
 * della scheda in ufficio, degli avvisi e dei badge.
 */
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  FileText, AlertTriangle, CheckCircle, Clock,
  Download, Loader2, RefreshCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useMyHrProfilo } from "@/hooks/useTimbratura";
import { calcStato, categoriaLabel } from "@/types/hrDocumenti";
import { cn } from "@/lib/utils";
import { apriDocumentoDopoAttesa } from "@/lib/campo/apriDocumento";
import SubDocumenti from "./subappaltatore/SubDocumenti";
import { CaricaAttestato, type AttestatoDaCaricare } from "@/components/campo/CaricaAttestato";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const PRIVATE_DOC_BUCKET = "hr-documenti";
const DOCUMENTI_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export default function CampoDocumenti() {
  const { isSubappaltatore } = useIsCampo();
  return isSubappaltatore ? <SubDocumenti /> : <CampoDocumentiDipendente />;
}

interface DocOperaio {
  id: string;
  tipo: string;
  nome_file: string | null;
  url: string | null;
  data_scadenza: string | null;
  alert_giorni_prima: number | null;
}

function CampoDocumentiDipendente() {
  const t = useT();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: hrProfilo } = useMyHrProfilo();
  const profiloId = hrProfilo?.id ?? null;

  const { data: documenti = [], isLoading, isError, error, refetch, isFetching } = useQuery<DocOperaio[]>({
    queryKey: ["campo-documenti-hr", companyId, profiloId],
    queryFn: async () => {
      if (!profiloId) return [];
      const { data, error } = await withTimeout(
        supabase
          .from("hr_documenti")
          .select("id, categoria, titolo, file_name, file_path, data_scadenza, alert_giorni_prima")
          .eq("hr_profilo_id", profiloId)
          .order("data_scadenza", { ascending: true, nullsFirst: false }),
        DOCUMENTI_TIMEOUT_MS,
        "Caricamento documenti troppo lento",
      );
      if (error) throw error;
      type Row = {
        id: string; categoria: string; titolo: string | null; file_name: string | null;
        file_path: string | null; data_scadenza: string | null; alert_giorni_prima: number | null;
      };
      return ((data ?? []) as Row[]).map((d): DocOperaio => ({
        id: d.id,
        tipo: d.categoria,
        nome_file: d.titolo || d.file_name,
        url: d.file_path,
        data_scadenza: d.data_scadenza,
        alert_giorni_prima: d.alert_giorni_prima,
      }));
    },
    enabled: !!user?.id && !!profiloId,
    // Rete di cantiere: un solo tentativo faceva comparire l'errore anche per
    // un singolo pacchetto perso. Un retry assorbe i blip senza mascherare
    // i guasti veri.
    retry: 1,
  });

  const today = new Date();

  // Stessa regola dell'ufficio e del cron: la soglia è l'`alert_giorni_prima`
  // del documento, non un 30 fisso (una patente si avvisa a 60, un corso a 90).
  const getScadenzaStatus = (doc: DocOperaio) => {
    const stato = calcStato(doc.data_scadenza, doc.alert_giorni_prima);
    return stato === "senza_scadenza" ? "nessuna" : stato;
  };

  const pageHeader = (
    <div>
      <h1 className="text-lg font-bold tracking-tight text-foreground">{t("Documenti")}</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t("Contratti, corsi, visite e patenti. Puoi caricare i tuoi attestati: l'ufficio li controlla.")}
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {pageHeader}
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border bg-background p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">{t("Caricamento documenti...")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {t("Se la connessione in cantiere e' lenta, ti mostro un messaggio invece di lasciare la pagina vuota.")}
          </p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {pageHeader}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t("Documenti non caricati")}</p>
              <p className="mt-1 text-xs leading-relaxed">
                {(error as Error)?.message === "Caricamento documenti troppo lento" ? t("Caricamento documenti troppo lento")
                  : (error as Error)?.message || t("La richiesta non ha risposto in tempo.")} {t("Riprova quando la rete e' stabile.")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-background px-3 text-xs font-bold text-amber-900 shadow-sm disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {t("Riprova")}
          </button>
        </div>
      </div>
    );
  }

  const scadutiCount = documenti.filter((d) => getScadenzaStatus(d) === "scaduto").length;
  const inScadenzaCount = documenti.filter((d) => getScadenzaStatus(d) === "in_scadenza").length;

  // Il lavoratore carica nella propria cartella <azienda>/<profilo HR>/ (hr_doc_storage_self_insert) e la riga
  // nasce sua (hr_documenti_self_insert, solo tipi personali); l'ufficio riceve l'avviso dal database.
  const caricaAttestato = async (a: AttestatoDaCaricare) => {
    if (!companyId || !profiloId || !user?.id) throw new Error(t("Azienda non disponibile, riprova tra un istante"));
    const sicuro = a.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${companyId}/${profiloId}/${crypto.randomUUID()}-${sicuro}`;
    const { error: up } = await supabase.storage.from(PRIVATE_DOC_BUCKET).upload(path, a.file, { upsert: false });
    if (up) throw up;
    const { error } = await supabase.from("hr_documenti").insert({
      company_id: companyId, hr_profilo_id: profiloId, categoria: a.categoria, created_by: user.id,
      titolo: a.titolo, data_scadenza: a.scadenza, file_path: path, file_name: a.file.name,
      note: "Caricato dall'operaio dall'app",
    });
    if (error) {
      void supabase.storage.from(PRIVATE_DOC_BUCKET).remove([path]);
      throw error;
    }
  };

  const openDocumento = async (url: string) => {
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    // Il link a scadenza arriva dopo un'attesa: la scheda va aperta prima (sul telefono, dopo l'attesa, la blocca).
    const aperto = await apriDocumentoDopoAttesa(async () => {
      const { data, error } = await supabase.storage.from(PRIVATE_DOC_BUCKET).createSignedUrl(url, 60 * 5);
      return error ? null : data?.signedUrl;
    });
    if (!aperto) toast.error(t("Impossibile aprire il documento"));
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col space-y-4">
      {pageHeader}

      {/* Corso, visita, patente: li fotografa lui, l'ufficio li controlla (24/11). */}
      {companyId && profiloId && user?.id && <CaricaAttestato carica={caricaAttestato} />}

      {/* Alert scadenze */}
      {scadutiCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-500/30 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs text-red-600">
            {t(scadutiCount > 1 ? "{n} documenti scaduti — contatta l'ufficio" : "{n} documento scaduto — contatta l'ufficio", { n: scadutiCount })}
          </p>
        </div>
      )}
      {inScadenzaCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <p className="text-xs text-primary">
            {t(inScadenzaCount > 1 ? "{n} documenti in scadenza" : "{n} documento in scadenza", { n: inScadenzaCount })}
          </p>
        </div>
      )}

      {documenti.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <FileText className="w-10 h-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">{t("Nessun documento disponibile")}</p>
          <p className="text-muted-foreground text-xs">{t("I tuoi documenti caricati dall'ufficio appariranno qui")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documenti.map((doc) => {
            const status = getScadenzaStatus(doc);
            return (
              <div
                key={doc.id}
                className={cn(
                  "bg-muted border rounded-2xl p-4",
                  status === "scaduto" ? "border-red-500/30" :
                  status === "in_scadenza" ? "border-primary/30" :
                  "border-border"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground" dir="auto">
                        {doc.nome_file || t(categoriaLabel(doc.tipo))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(categoriaLabel(doc.tipo))}
                      </p>
                    </div>
                  </div>

                  {/* Scadenza badge */}
                  {status === "scaduto" && (
                    <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-600 border border-red-500/20 rounded-full px-2 py-0.5 shrink-0">
                      <AlertTriangle className="w-3 h-3" />
                      {t("Scaduto")}
                    </span>
                  )}
                  {status === "in_scadenza" && (
                    <span className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 shrink-0">
                      <Clock className="w-3 h-3" />
                      {t("In scadenza")}
                    </span>
                  )}
                  {status === "valido" && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5 shrink-0">
                      <CheckCircle className="w-3 h-3" />
                      {t("Valido")}
                    </span>
                  )}
                </div>

                {doc.data_scadenza && (
                  <p className="text-xs text-muted-foreground mt-1 ml-12">
                    {t("Scadenza: {data}", { data: format(parseISO(doc.data_scadenza), "d MMMM yyyy", { locale: dateFnsCampo() }) })}
                    {status === "in_scadenza" && (
                      <span className="text-primary ml-1">
                        {t("(tra {n} giorni)", { n: differenceInDays(parseISO(doc.data_scadenza), today) })}
                      </span>
                    )}
                  </p>
                )}

                {doc.url && (
                  <button
                    onClick={() => openDocumento(doc.url)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-primary ml-12"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t("Visualizza documento")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
