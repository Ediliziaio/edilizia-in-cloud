import { Link, useSearchParams } from "react-router-dom";
import { useCommessaCampoSync } from "@/hooks/useCommessaCampoSync";
import { leggiRuoloOperativoCampo } from "@/lib/campo/ruoloOperativo";
import { refreshCommessaCampoQueries } from "@/lib/orders/refreshCommessaCampoQueries";
/**
 * Avanzamento lavori — l'operaio o il subappaltatore segna se ha fatto o meno
 * la SUA fase, allegando le foto.
 *
 * Sostituisce la vecchia pagina "SAL", che era costruita sugli IMPORTI
 * (importi/ritenute/percentuali di pagamento) — informazione che in cantiere
 * non serve e che comunque non ha mai funzionato: leggeva `subappaltatori`
 * mentre la FK di `sal_subappaltatori` punta a `subappaltatori_sicurezza`, e
 * scriveva 5 colonne inesistenti.
 *
 * Qui la fonte di verità è `order_work_phases`, già usata dall'ufficio:
 * niente doppioni, e la percentuale di commessa si aggiorna dal trigger DB
 * di rollup esistente.
 *
 * Permessi: la policy "Campo workers can update phases of assigned orders"
 * (USING + WITH CHECK su order_campo_assignments OR order_employees) copre
 * sia l'operaio sia il subappaltatore. Chi spunta lo decide l'azienda
 * (Impostazioni → Fasi): la stessa regola che il database applica alle
 * sottofasi vale qui anche per la fase, così lo schermo offre solo le spunte
 * che vanno a buon fine.
 */
import { useMemo, useState } from "react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { linkFileRiservato } from "@/lib/storage/fileRiservati";
import { apriDocumentoDopoAttesa } from "@/lib/campo/apriDocumento";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Camera, Loader2, RefreshCcw, MapPin,
  ImageIcon, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCantieriTecnici } from "@/hooks/campo/useSchedaCantiere";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { faseInRitardo, periodoFase, testoRitardo } from "@/components/campo/PianoSchedaCantiere";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { puoSpuntareInCantiere, chiSpuntaValido, type ChiSpunta } from "@/lib/orders/chiSpunta";
import { faseHaSottofasi, messaggioErrore, SOTTOFASI_NELLA_FASE, sottofasiDalleFasi, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";
import { percorsoCantiereTecnico } from "@/lib/campo/schedaCantiere";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

// Le foto restano indirizzate come prima nel database; in lettura passano da
// un link a scadenza (linkFileRiservato), cosi' funzionano anche quando il
// contenitore non e' piu' aperto a chiunque.
const PHOTO_BUCKET = "campo-rapportini";
const MAX_PHOTO_MB = 10;

// La tabella delle sottofasi non è ancora nei tipi generati: cast localizzato.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Fase {
  id: string;
  order_id: string;
  name: string;
  position: number;
  status: string;
  percentuale: number;
  notes: string | null;
  foto_urls: unknown;
  completata_il: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Cantiere {
  id: string;
  order_code: string | null;
  description: string | null;
  indirizzo_lavori: string | null;
}

/** foto_urls è jsonb: normalizza qualunque forma in string[]. */
function toPhotoList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

async function compressImage(file: File, maxWidth = 1280, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Compressione fallita"))), "image/jpeg", quality),
  );
}

export default function CampoAvanzamento() {
  const t = useT();
  const { user, profile, role } = useAuth();
  const [params] = useSearchParams();
  const orderFilter = params.get("order_id") || null;
  const companyId = profile?.company_id;
  useCommessaCampoSync(orderFilter, companyId, !!user);
  const queryClient = useQueryClient();
  const oggi = useCampoWorkDay();
  const [uploadingFaseId, setUploadingFaseId] = useState<string | null>(null);
  // Fasi finite chiuse su una riga (collaudo 23/11): si riaprono toccandole.
  const [finiteAperte, setFiniteAperte] = useState<Set<string>>(() => new Set());
  const alternaFinita = (id: string) => setFiniteAperte(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const cantieriTecnici = useCantieriTecnici(role === "employee");
  const schedeAccessibili = new Set(cantieriTecnici.isError ? [] : (cantieriTecnici.data ?? []).map(c => c.id));

  // Le fasi dei MIEI cantieri. Non filtriamo per utente: ci pensa la RLS
  // ("Campo workers can view phases of assigned orders"), che copre sia il
  // subappaltatore (order_campo_assignments) sia l'operaio (order_employees).
  // Query separate invece dell'embed annidato: gli embed PostgREST su tabelle
  // con RLS pesanti fanno esplodere il planning.
  const fasiQuery = useQuery({
    queryKey: ["campo-avanzamento-fasi", companyId, user?.id, orderFilter],
    queryFn: async (): Promise<Fase[]> => {
      // La chiave della query aveva già l'azienda, la query no.
      let query = supabase.from("order_work_phases").select("id, order_id, name, position, status, percentuale, notes, foto_urls, completata_il, start_date, end_date").eq("company_id", companyId!);
      if (orderFilter) query = query.eq("order_id", orderFilter);
      const { data, error } = await query
        // Stesso ordine completo della lettura delle sottofasi: oltre il
        // massimo di righe per lettura le due prendono le stesse fasi.
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Fase[];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
  });

  const orderIds = useMemo(
    () => Array.from(new Set((fasiQuery.data ?? []).map((f) => f.order_id))),
    [fasiQuery.data],
  );

  const cantieriQuery = useQuery({
    queryKey: ["campo-avanzamento-cantieri", companyId, user?.id, orderIds.join(",")],
    queryFn: async (): Promise<Cantiere[]> => {
      if (orderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, indirizzo_lavori")
        .in("id", orderIds).eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as Cantiere[];
    },
    enabled: orderIds.length > 0,
    staleTime: 60_000,
  });

  // Le sottofasi dei MIEI cantieri: non hanno l'azienda, si parte dalle fasi
  // dell'azienda (la RLS è la stessa delle fasi). Se la lettura fallisce le fasi
  // restano come sempre.
  const sottofasiQuery = useQuery({
    queryKey: ["campo-sottofasi", companyId, user?.id, orderFilter],
    queryFn: async (): Promise<Sottofase[]> => {
      let query = db.from("order_work_phases").select(`id, ${SOTTOFASI_NELLA_FASE}`).eq("company_id", companyId!);
      if (orderFilter) query = query.eq("order_id", orderFilter);
      const { data, error } = await query
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return sottofasiDalleFasi(data as Record<string, unknown>[] | null);
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
    retry: false,
  });
  const sottofasiDi = useMemo(() => sottofasiPerFase(sottofasiQuery.data ?? []), [sottofasiQuery.data]);

  // Regola dell'azienda e, se serve, il mio ruolo e le mie fasi in ogni cantiere.
  // Una lettura fallita non equivale alla regola «tutti»: si resta in consultazione.
  const permessiQuery = useQuery({
    queryKey: ["campo-avanzamento-permessi", companyId, user?.id, orderIds.join(",")],
    queryFn: async (): Promise<{ regola: ChiSpunta; perOrdine: Map<string, { ruolo: { capocantiere?: boolean; esiste_capo?: boolean } | null; mieFasi: Set<string> }> }> => {
      const perOrdine = new Map<string, { ruolo: { capocantiere?: boolean; esiste_capo?: boolean } | null; mieFasi: Set<string> }>();
      const { data: regolaDb, error } = await db.rpc("fasi_regola_chi_spunta", { p_company_id: companyId });
      if (error) throw error;
      if (!["tutti", "chi_la_fa", "capi"].includes(regolaDb)) throw Error("Regola di avanzamento non disponibile");
      const regola = chiSpuntaValido(regolaDb);
      if (regola === "tutti") return { regola, perOrdine };
      await Promise.all(orderIds.map(async (id) => {
        const [ruoloRes, fasiRes] = await Promise.all([
          db.rpc("campo_mio_ruolo", { p_order_id: id }),
          regola === "chi_la_fa" ? db.rpc("campo_mie_fasi", { p_order_id: id }) : Promise.resolve({ data: [], error: null }),
        ]);
        if (ruoloRes.error) throw ruoloRes.error;
        const ruolo = leggiRuoloOperativoCampo(ruoloRes.data);
        if (fasiRes.error) throw fasiRes.error;
        if (regola === "chi_la_fa" && !Array.isArray(fasiRes.data)) throw Error("Assegnazioni alle fasi non disponibili");
        const mieFasi = new Set<string>();
        for (const e of (Array.isArray(fasiRes.data) ? fasiRes.data : []) as Array<{ id?: string; tu?: boolean; squadra?: string | null }>) {
          if (e.id && (e.tu || (e.squadra ?? "") !== "")) mieFasi.add(e.id);
        }
        perOrdine.set(id, { ruolo, mieFasi });
      }));
      return { regola, perOrdine };
    },
    enabled: !!user?.id && !!companyId && orderIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const puoSpuntare = (fase: Fase): boolean => {
    const p = permessiQuery.data;
    if (!p || permessiQuery.isError) return false;
    if (p.regola === "tutti") return true;
    const o = p.perOrdine.get(fase.order_id);
    if (!o || !o.ruolo) return false;
    return puoSpuntareInCantiere(p.regola, o.ruolo, o.mieFasi.has(fase.id));
  };

  const segnaSottofase = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const sottofase = (sottofasiQuery.data ?? []).find(s => s.id === id);
      const fase = (fasiQuery.data ?? []).find(f => f.id === sottofase?.phase_id);
      if (!fase || !puoSpuntare(fase)) throw Error(t("Non riesco a confermare che questa fase tocchi a te. Aggiorna la pagina e riprova."));
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variabili) => {
      const sottofase = (sottofasiQuery.data ?? []).find(s => s.id === variabili.id);
      const fase = (fasiQuery.data ?? []).find(f => f.id === sottofase?.phase_id);
      if (fase) void refreshCommessaCampoQueries(queryClient, fase.order_id, companyId);
      // La fase si ricalcola nel database: si rileggono le sottofasi e le fasi.

    },
    // Il database dice da sé perché no («Le sottofasi le spunta il capocantiere.»).
    onError: (err: unknown) => toast.error(messaggioErrore(err, t("Non riesco a salvare la sottofase"))),
  });

  const gruppi = useMemo(() => {
    const byOrder = new Map<string, Fase[]>();
    for (const fase of fasiQuery.data ?? []) {
      const list = byOrder.get(fase.order_id);
      if (list) list.push(fase);
      else byOrder.set(fase.order_id, [fase]);
    }
    return Array.from(byOrder.entries()).map(([orderId, fasi]) => ({
      cantiere: (cantieriQuery.data ?? []).find((c) => c.id === orderId) ?? null,
      orderId,
      fasi: [...fasi].sort((a, b) => a.position - b.position),
    }));
  }, [fasiQuery.data, cantieriQuery.data]);

  const toggleFase = useMutation({
    mutationFn: async (fase: Fase) => {
      if (!puoSpuntare(fase)) throw Error(t("Non riesco a confermare che questa fase tocchi a te. Aggiorna la pagina e riprova."));
      const completata = fase.status === "completata";
      // Riaprire non inventa un avanzamento: la percentuale resta, la aggiorna il prossimo rapportino
      // o l'ufficio (come la riapertura dall'ufficio).
      const { error } = await supabase
        .from("order_work_phases")
        .update(
          completata
            ? { status: "in_corso", completata_da: null, completata_il: null }
            : { status: "completata", percentuale: 100, completata_da: user!.id, completata_il: new Date().toISOString() },
        )
        .eq("id", fase.id);
      if (error) throw error;
      return !completata;
    },
    onSuccess: (nowDone, fase) => {
      void refreshCommessaCampoQueries(queryClient, fase.order_id, companyId);
      toast.success(nowDone ? t("Fase segnata come completata") : t("Fase riaperta"));
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : t("Non riesco a salvare la fase")),
  });

  async function handlePhoto(fase: Fase, files: FileList | null) {
    if (!files?.length) return;
    if (!companyId) {
      toast.error(t("Profilo in caricamento, riprova tra un istante"));
      return;
    }
    setUploadingFaseId(fase.id);
    const nuove: string[] = [];
    let falliti = 0;

    for (const file of Array.from(files)) {
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) { falliti++; continue; }
      try {
        const compressed = await compressImage(file).catch((): null => null);
        const payload: Blob = compressed ?? file;
        // eslint-disable-next-line react-hooks/purity -- Nome del file calcolato dentro il caricamento asincrono, mai durante il render.
        const path = `${companyId}/${fase.order_id}/fasi/${fase.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { data: up, error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, payload, { contentType: "image/jpeg", upsert: false });
        if (upErr || !up?.path) throw upErr ?? new Error("Upload senza path");
        nuove.push(supabase.storage.from(PHOTO_BUCKET).getPublicUrl(up.path).data.publicUrl);
      } catch (err) {
        falliti++;
        console.error("[CampoAvanzamento] upload foto:", err);
      }
    }

    // Solo le foto REALMENTE caricate finiscono in lista: niente anteprime
    // fantasma che fanno credere di aver allegato una foto inesistente.
    if (nuove.length > 0) {
      const { error } = await supabase
        .from("order_work_phases")
        .update({ foto_urls: [...toPhotoList(fase.foto_urls), ...nuove] })
        .eq("id", fase.id);
      if (error) {
        toast.error(t("Foto caricate ma non collegate alla fase"));
      } else {
        void refreshCommessaCampoQueries(queryClient, fase.order_id, companyId);
        toast.success(nuove.length === 1 ? t("Foto aggiunta") : t("{n} foto aggiunte", { n: nuove.length }));
      }
    }
    if (falliti > 0) toast.error(t("{n} foto non caricate (max {mb}MB)", { n: falliti, mb: MAX_PHOTO_MB }));
    setUploadingFaseId(null);
  }

  async function removePhoto(fase: Fase, url: string) {
    const rimaste = toPhotoList(fase.foto_urls).filter((u) => u !== url);
    const { error } = await supabase
      .from("order_work_phases")
      .update({ foto_urls: rimaste })
      .eq("id", fase.id);
    if (error) toast.error(t("Non riesco a rimuovere la foto"));
    else void refreshCommessaCampoQueries(queryClient, fase.order_id, companyId);
  }

  const isLoading = fasiQuery.isLoading;
  const totali = fasiQuery.data?.length ?? 0;
  const fatte = (fasiQuery.data ?? []).filter((f) => f.status === "completata").length;

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-3 md:space-y-4 md:p-4">
      <header className="min-w-0">
        {orderFilter && <Link className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-primary" to={`/campo/lavoro/${encodeURIComponent(orderFilter)}`}>{t("← Torna al cantiere")}</Link>}
        <h1 className="text-[17px] font-bold tracking-tight md:text-2xl">{t("Avanzamento lavori")}</h1>
        <p className="mt-0.5 break-words text-[13px] text-muted-foreground">
          {orderFilter ? t("Spunta le fasi finite e aggiungi le foto.") : t("I tuoi cantieri: spunta le fasi finite e aggiungi le foto.")}
          {" "}{t("Serve all’ufficio per sapere a che punto siete. Non conta per i pagamenti.")}
        </p>
        {/* Stato in evidenza (collaudo 23/11): la percentuale grande, poi la barra. Niente larghezze fisse:
            sul telefono del founder barra e testo uscivano a destra. */}
        {!isLoading && totali > 0 && (
          <div className="mt-2 rounded-2xl border bg-background p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="text-2xl font-black tabular-nums">{Math.round((fatte / totali) * 100)}%</p>
              <p className="text-[13px] font-semibold text-muted-foreground">{t("{fatte} di {totali} fasi finite", { fatte, totali })}</p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((fatte / totali) * 100)}%` }} />
            </div>
          </div>
        )}
      </header>

      {!isLoading && totali > 0 && (permessiQuery.isError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p>{t("Permessi di avanzamento non disponibili. Puoi consultare le fasi; le spunte restano disattivate.")}</p><Button className="mt-2" variant="outline" onClick={() => void permessiQuery.refetch()}>{t("Rileggi i permessi")}</Button></div> : permessiQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("Verifica dei permessi di avanzamento…")}</p> : null)}
      {sottofasiQuery.isError && <div role="alert" className="rounded-xl border p-3 text-sm">{t("Dettaglio sottofasi non disponibile.")} <Button variant="outline" onClick={() => void sottofasiQuery.refetch()}>{t("Rileggi sottofasi")}</Button></div>}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : fasiQuery.isError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-10 text-center">
          <p className="text-sm font-medium">{t("Non riesco a caricare le fasi")}</p>
          <p className="text-xs text-muted-foreground">{t("Controlla la connessione e riprova.")}</p>
          <Button variant="outline" size="sm" onClick={() => fasiQuery.refetch()} disabled={fasiQuery.isFetching}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {fasiQuery.isFetching ? t("Riprovo…") : t("Riprova")}
          </Button>
        </div>
      ) : gruppi.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium">{t("Nessuna fase da segnare")}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {t("Le fasi le prepara l'ufficio sui cantieri che ti vengono assegnati. Appena ci sono, le trovi qui.")}
          </p>
        </div>
      ) : (
        gruppi.map((g) => (
          <section key={g.orderId} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border bg-muted/40 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{g.cantiere?.order_code ?? t("Cantiere")}</span>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-800">
                    {g.fasi.filter(f => f.status === "completata").length}/{g.fasi.length}
                  </span>
                </p>
                {schedeAccessibili.has(g.orderId) && <Link to={percorsoCantiereTecnico(g.orderId)}
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline">
                  {t("Scheda cantiere")}
                </Link>}
              </div>
              {g.cantiere?.description && (
                <p dir="auto" className="line-clamp-1 break-all text-xs text-muted-foreground">{g.cantiere.description}</p>
              )}
              {g.cantiere?.indirizzo_lavori && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{g.cantiere.indirizzo_lavori}</span>
                </p>
              )}
            </div>

            {/* Tre colonne uguali per ogni fase (26/11/2026, founder: «allineare le cose al meglio»): a sinistra lo
                stato (stessa misura per tutte), al centro nome, date previste, avanzamento e sottofasi, a destra un
                solo pulsante (foto, o la freccia per le fasi finite). Prima ogni tipo di riga aveva la sua forma. */}
            <ul className="divide-y divide-border">
              {g.fasi.map((fase) => {
                const done = fase.status === "completata";
                const foto = toPhotoList(fase.foto_urls);
                const busy = uploadingFaseId === fase.id;
                const sotto = sottofasiDi.get(fase.id) ?? [];
                const derivata = faseHaSottofasi(sotto);
                const spunta = !sottofasiQuery.isError && !sottofasiQuery.isLoading && puoSpuntare(fase);
                const ritardo = faseInRitardo(fase, oggi);
                const pct = done ? 100 : Math.min(100, Math.max(0, Math.round(fase.percentuale || 0)));
                const chiusa = done && !finiteAperte.has(fase.id);
                const fineIl = fase.completata_il ? new Date(fase.completata_il).toLocaleDateString(intlCampo(), { day: "numeric", month: "short" }) : null;
                const pulsanteFoto = (
                  <label className={cn("relative flex size-11 cursor-pointer items-center justify-center rounded-full border bg-background text-primary active:bg-muted", busy && "pointer-events-none opacity-60")}
                    aria-label={t("Aggiungi foto a {fase}", { fase: fase.name })}>
                    {busy ? <Loader2 className="size-[18px] animate-spin" aria-hidden="true" /> : <Camera className="size-[18px]" aria-hidden="true" />}
                    {foto.length > 0 && <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-primary-foreground tabular-nums">{foto.length}</span>}
                    <input type="file" accept="image/*" multiple className="hidden" disabled={busy}
                      onChange={(e) => { void handlePhoto(fase, e.target.files); e.target.value = ""; }} />
                  </label>
                );

                if (chiusa) return (
                  <li key={fase.id} className="bg-muted/20">
                    <button type="button" onClick={() => alternaFinita(fase.id)} aria-expanded={false}
                      aria-label={t("{fase}: completata, mostra i dettagli", { fase: fase.name })}
                      className="grid min-h-12 w-full grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-x-2.5 px-3 py-1.5 text-left active:bg-muted">
                      <StatoFase done ritardo={false} pct={100} />
                      <span className="min-w-0">
                        <span dir="auto" className="block truncate text-sm font-medium text-muted-foreground">{fase.name}</span>
                        {(fineIl || foto.length > 0) && <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {fineIl && <span>{t("Finita il {data}", { data: fineIl })}</span>}
                          {foto.length > 0 && <span className="inline-flex items-center gap-0.5"><ImageIcon className="size-3" aria-hidden="true" />{foto.length}</span>}
                        </span>}
                      </span>
                      <span className="flex justify-center"><ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" /></span>
                    </button>
                  </li>
                );

                return (
                  <li key={fase.id} className={cn("grid grid-cols-[28px_minmax(0,1fr)_44px] gap-x-2.5 px-3 py-3", done && "bg-muted/20")}>
                    <button type="button" onClick={() => toggleFase.mutate(fase)}
                      disabled={toggleFase.isPending || derivata || !spunta}
                      aria-label={derivata
                        ? t("{fase}: si completa spuntando le sottofasi", { fase: fase.name })
                        : !spunta ? t("{fase}: la segna il capocantiere", { fase: fase.name })
                        : done ? t("Riapri la fase {fase}", { fase: fase.name }) : t("Segna {fase} come completata", { fase: fase.name })}
                      className={cn("flex size-7 items-center justify-center self-start", !spunta && "opacity-60")}>
                      <StatoFase done={done} ritardo={!!ritardo} pct={pct} />
                    </button>

                    <div className="min-w-0">
                      {done ? (
                        <button type="button" onClick={() => alternaFinita(fase.id)} aria-expanded={true}
                          className="flex min-h-7 w-full items-center gap-1 text-left">
                          <span dir="auto" className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-muted-foreground">{fase.name}</span>
                          <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-label={t("Chiudi")} />
                        </button>
                      ) : (
                        <p dir="auto" className="flex min-h-7 items-center break-words text-sm font-semibold leading-snug">{fase.name}</p>
                      )}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <span className={cn("font-semibold", done ? "text-emerald-700" : ritardo ? "text-red-700" : fase.status === "in_corso" ? "text-blue-700" : "")}>
                          {done ? t("Completata") : fase.status === "in_corso" ? t("In corso") : t("Da iniziare")}
                        </span>
                        {!done && pct > 0 && <span className="tabular-nums">· {pct}%</span>}
                        <span aria-hidden="true">·</span>
                        <span>{done && fineIl ? t("Finita il {data}", { data: fineIl }) : periodoFase(t, fase.start_date, fase.end_date)}</span>
                      </p>
                      {!done && fase.status === "in_corso" && (
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div className={cn("h-full rounded-full", ritardo ? "bg-red-500" : "bg-blue-500")} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      {/* Ritardi sempre visibili (collaudo 23/11): qui il capo spunta le fasi, e la scadenza non c'era. */}
                      {ritardo && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-400">{testoRitardo(ritardo, t)}</p>}
                      {fase.notes && <p dir="auto" className="mt-1 line-clamp-2 text-xs text-muted-foreground">{fase.notes}</p>}
                      {!spunta && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {permessiQuery.isError || permessiQuery.isLoading || sottofasiQuery.isError ? t("Operazioni da verificare: rileggi permessi e sottofasi.") : permessiQuery.data?.regola === "chi_la_fa"
                            ? t("La segna chi fa questa fase, o il capocantiere.")
                            : t("La segna il capocantiere.")}
                        </p>
                      )}

                      {derivata && (() => {
                        const elenco = (
                          <ul className="mt-1" aria-label={t("Sottofasi di {fase}", { fase: fase.name })}>
                            {sotto.map((s) => (
                              <li key={s.id}>
                                <label className="flex min-h-10 items-center gap-2.5 text-sm">
                                  <Checkbox checked={s.fatta} disabled={segnaSottofase.isPending || !spunta}
                                    onCheckedChange={(v) => segnaSottofase.mutate({ id: s.id, fatta: v === true })}
                                    aria-label={s.fatta ? t("{nome}: fatta", { nome: s.name }) : t("{nome}: da fare", { nome: s.name })} />
                                  <span dir="auto" className={cn("min-w-0 break-words", s.fatta && "text-muted-foreground line-through")}>{s.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        );
                        // Fase finita: le sottofasi (tutte fatte) si chiudono in una riga; si riaprono per correggere.
                        return done ? (
                          <details className="mt-1 text-[13px]">
                            <summary className="flex min-h-9 cursor-pointer list-none items-center text-muted-foreground [&::-webkit-details-marker]:hidden">
                              {t("{n} sottofasi fatte · mostra", { n: sotto.length })}
                            </summary>
                            {elenco}
                          </details>
                        ) : elenco;
                      })()}

                      {foto.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {foto.map((url) => (
                            <div key={url} className="relative">
                              <a href={url} target="_blank" rel="noreferrer"
                                onClick={(e) => {
                                  // Il link a scadenza si chiede al momento del clic; la scheda si apre PRIMA (dopo l'attesa il telefono la blocca).
                                  e.preventDefault();
                                  void apriDocumentoDopoAttesa(async () => (await linkFileRiservato(url)) ?? url);
                                }}>
                                <ImgRiservata src={url} alt={t("Foto avanzamento fase")} loading="lazy" className="h-14 w-14 rounded-md border border-border object-cover" />
                              </a>
                              {/* tap-compact: senza, sotto i 768 px il bottone diventa 44x44 e copre quasi tutta la miniatura */}
                              <button type="button" onClick={() => removePhoto(fase, url)} aria-label={t("Rimuovi foto")}
                                className="tap-compact absolute -right-2.5 -top-2.5 flex h-8 w-8 items-center justify-center">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background shadow ring-1 ring-border">
                                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-center self-start">{pulsanteFoto}</div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** Lo stato della fase, sempre della stessa misura: spunta verde (finita), anello che si riempie (in corso; rosso se in
 * ritardo), cerchio vuoto (da iniziare). */
function StatoFase({ done, ritardo, pct }: { done: boolean; ritardo: boolean; pct: number }) {
  if (done) return <CheckCircle2 className="size-6 text-emerald-600" aria-hidden="true" />;
  const r = 10, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className={ritardo ? "stroke-red-200" : "stroke-muted-foreground/35"} />
      {pct > 0 && <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 12 12)"
        className={ritardo ? "stroke-red-600" : "stroke-blue-600"} />}
    </svg>
  );
}
