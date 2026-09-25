/**
 * Rapportino giornaliero SEMPLIFICATO (2 step):
 * 1. La giornata — descrizione, meteo, ore e foto: tutto quello che serve
 *    all'operaio "normale", in una schermata sola.
 * 2. Conferma e firma — fasi/squadra/materiali (solo se servono), riepilogo
 *    e FIRMA dell'operaio/capocantiere: il PDF generato all'invio esce già
 *    firmato da chi lo compila.
 * 3. SOLO se "lavoro completato": firma del cliente (obbligatoria).
 *
 * Le ore vanno confermate: 0 per sole foto/note; nessuna presenza implicita.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft, ChevronRight, ChevronLeft,
  Camera, X, Minus, Plus, Loader2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { notifyRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useGPS } from "@/hooks/useGPS";
import { FirmaPad } from "@/components/campo/FirmaPad";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { hasRapportinoAssignment } from "@/lib/campo/rapportinoAssignment";
import { buildRapportinoMaterials, rapportinoArticleKind, rapportinoMaterialUnit, rapportinoUnitOptions, type RapportinoArticle, type RapportinoMaterialDraft } from "@/lib/campo/rapportinoMaterials";
import { loadRapportinoArticles } from "@/lib/campo/loadRapportinoArticles";
import { RapportinoSiteContext } from "@/components/campo/RapportinoSiteContext";
import { useCampoDayTime } from "@/hooks/campo/useCampoDayTime";
import { campoReportHours } from "@/lib/campo/timeSummary";
import { validateRapportinoHours, type CampoHoursDraft } from "@/lib/campo/rapportinoHours";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { assertReportDay, campoWorkDay, reportDayAllowed, REPORT_DEADLINE_MESSAGE, shiftWorkDay, validWorkDay } from "@/lib/campo/workDay";

const TOTAL_STEPS = 2;

// Fase della commessa su cui l'operaio può dichiarare l'avanzamento
interface FaseCommessa {
  id: string;
  name: string;
  status: "da_iniziare" | "in_corso" | "completata";
  percentuale: number;
}

/**
 * Compressione immagine lato client con gestione completa degli errori:
 * - img.onerror rifiuta la Promise (prima restava pending → loader infinito)
 * - toBlob può ritornare null → Promise rifiutata, il caller usa fallback
 * - URL.revokeObjectURL per evitare memory leak dei blob URL temporanei
 * - timeout 10s per evitare loader "Uploading…" bloccato se il browser non risponde
 */
async function compressImage(file: File, maxWidth = 1280, quality = 0.75): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const t = setTimeout(() => reject(new Error("image load timeout")), 10000);
      el.onload = () => { clearTimeout(t); resolve(el); };
      el.onerror = () => { clearTimeout(t); reject(new Error("image load error")); };
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.width || maxWidth, maxWidth);
    canvas.height = Math.round((img.height || canvas.width) * (canvas.width / (img.width || canvas.width)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) throw new Error("toBlob returned null");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CampoRapportino() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  // Freeze the chosen day: leaving the form open overnight must not re-date it.
  const [openedDay] = useState(() => campoWorkDay());
  const workDay = params.get("data") ?? openedDay;
  return <CampoRapportinoEditor key={`${profile?.company_id}:${user?.id}:${orderId}:${workDay}`} workDay={workDay} />;
}

function CampoRapportinoEditor({ workDay }: { workDay: string }) {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isSubappaltatore } = useIsCampo();
  const queryClient = useQueryClient();
  const { lat, lng, accuracy, requestPosition } = useGPS(profile?.company_id ?? null);
  const companyId = profile?.company_id ?? null;
  const [params, setParams] = useSearchParams();
  const today = useCampoWorkDay();
  const yesterday = shiftWorkDay(today, -1);
  const dayAllowed = validWorkDay(workDay) && (workDay === today || workDay === yesterday);
  const dayLabel = validWorkDay(workDay) ? format(new Date(`${workDay}T12:00:00`), "d MMMM yyyy", { locale: it }) : "Data non valida";

  const [step, setStep] = useState(1);

  // Step 1
  const [descrizione, setDescrizione] = useState("");
  const [meteo, setMeteo] = useState<string>("");

  // Step 2
  const [oreLavorate, setOreLavorate] = useState<CampoHoursDraft>("");
  const oreModificate = useRef(false);
  const meteoModificato = useRef(false);
  const modificaOre = (value: CampoHoursDraft) => { oreModificate.current = true; setOreLavorate(value); };
  const [oreStraordinario, setOreStraordinario] = useState(0);
  const [percentuale, setPercentuale] = useState(0);
  // Fasi dichiarate: phase_id → nuovo avanzamento raggiunto (0-100)
  const [fasiDichiarate, setFasiDichiarate] = useState<Record<string, number>>({});
  // Materiali usati oggi: key (order_item id o "libero_<n>") → nome+quantità
  const [materialiSel, setMaterialiSel] = useState<Record<string, RapportinoMaterialDraft>>({});
  const [materialeLibero, setMaterialeLibero] = useState("");
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Step 3
  const [lavoro_completato, setLavoroCompletato] = useState(false);

  // Step 4 (solo fine lavori): firme
  const [firmaCliente, setFirmaCliente] = useState<string | null>(null);
  const [firmaClienteNome, setFirmaClienteNome] = useState("");
  const [firmaOperaio, setFirmaOperaio] = useState<string | null>(null);

  // Con "lavoro completato" attivo si aggiunge lo step Firma cliente;
  // sul giornaliero normale sono 2 step.
  const totalSteps = lavoro_completato ? 3 : TOTAL_STEPS;

  // Acquisisci GPS all'inizio — una sola volta al mount (requestPosition è useCallback
  // con dep [companyId]; se companyId cambia da null a valore, l'effect rilancia una
  // volta sola). Evitiamo comunque di ciclare includendo requestPosition nelle deps.

  useEffect(() => {
    if (profile?.company_id) requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  // ── Fasi della commessa (order_work_phases) ─────────────────────────
  // Select minima: l'operaio dichiara solo su quali fasi ha lavorato e il
  // nuovo avanzamento raggiunto. Se la commessa non ha fasi, il blocco
  // non viene mostrato (zero regressioni sul flusso esistente).
  const { data: fasiCommessa = [] } = useQuery({
    queryKey: ["campo-fasi-commessa", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<FaseCommessa[]> => {
      // order_work_phases.percentuale non è nei tipi generati → cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("order_work_phases")
        .select("id, name, status, percentuale")
        .eq("order_id", orderId)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? "",
        status: (p.status as FaseCommessa["status"]) ?? "da_iniziare",
        percentuale: Number(p.percentuale) || 0,
      }));
    },
  });

  // Chi dichiara l'avanzamento? L'OPERAIO racconta la giornata (ore, foto,
  // su quali fasi ha lavorato — serve ad attribuire il costo); il
  // CAPOCANTIERE, che segue lo stato avanzamento, dichiara le percentuali.
  const { data: ruoloCampo } = useQuery({
    queryKey: ["campo-ruolo", orderId, user?.id],
    enabled: !!orderId && !!user?.id && !!companyId,
    staleTime: 300_000,
    queryFn: async (): Promise<{ isCapocantiere: boolean; esisteCapo: boolean }> => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        .select("user_id, is_capocantiere")
        .eq("order_id", orderId!)
        .eq("company_id", companyId!);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ user_id: string; is_capocantiere: boolean | null }>;
      return {
        isCapocantiere: righe.some(r => r.user_id === user!.id && !!r.is_capocantiere),
        esisteCapo: righe.some(r => !!r.is_capocantiere),
      };
    },
  });
  const isCapocantiere = ruoloCampo?.isCapocantiere ?? false;
  // FALLBACK di adozione: finché la commessa non ha un capocantiere nominato
  // vale il comportamento storico (chiunque dichiara le %) — le commesse
  // esistenti non si bloccano; il rigore scatta con la nomina.
  const puoDichiararePercentuali = !!ruoloCampo && (isCapocantiere || !ruoloCampo.esisteCapo);

  // ── Squadra del giorno ────────────────────────────────────────────────
  // Il flusso reale: il rapportino lo fa UNO (capocantiere), e dentro c'è
  // chi ha lavorato oggi — operai con le loro ore, subappaltatori presenti.
  // Il costo si calcola per OGNI dipendente elencato, non per l'autore.
  type MembroSquadra = {
    key: string;
    employee_id?: string;
    subappaltatore_id?: string;
    nome: string;
  };
  const [presenzeSel, setPresenzeSel] = useState<Record<string, CampoHoursDraft>>({});
  const { data: squadra = [] } = useQuery({
    queryKey: ["campo-squadra", orderId],
    enabled: !!orderId && isCapocantiere,
    staleTime: 300_000,
    queryFn: async (): Promise<MembroSquadra[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [empRes, subRes, campoRes] = await Promise.all([
        db.from("order_employees")
          .select("employee_id, employees(id, first_name, last_name, user_id)")
          .eq("order_id", orderId),
        db.from("subappaltatori_sicurezza")
          .select("id, ragione_sociale")
          .eq("order_id", orderId),
        // Hint obbligatorio: due FK verso profiles (user_id, assigned_by) → senza
        // hint PostgREST risponde 400 PGRST201 e gli assegnati mancavano.
        db.from("order_campo_assignments")
          .select("user_id, profiles!order_campo_assignments_user_id_fkey(first_name, last_name)")
          .eq("order_id", orderId),
      ]);
      const visti = new Set<string>();
      const utentiDipendenti = new Set<string>();
      const membri: MembroSquadra[] = [];
      for (const r of (empRes.data ?? []) as Array<{ employee_id: string; employees: { id: string; first_name: string; last_name: string; user_id: string | null } | null }>) {
        if (!r.employees || visti.has(r.employee_id)) continue;
        visti.add(r.employee_id);
        if (r.employees.user_id) utentiDipendenti.add(r.employees.user_id);
        membri.push({
          key: `emp-${r.employee_id}`,
          employee_id: r.employee_id,
          nome: `${r.employees.first_name} ${r.employees.last_name}`.trim(),
        });
      }
      for (const sub of (subRes.data ?? []) as Array<{ id: string; ragione_sociale: string }>) {
        membri.push({ key: `sub-${sub.id}`, subappaltatore_id: sub.id, nome: sub.ragione_sociale });
      }
      // Assegnati al cantiere senza scheda dipendente: presenza registrabile
      // (senza costo orario finché la scheda non c'è) — meglio vederli che
      // fingere che non fossero in cantiere.
      for (const r of (campoRes.data ?? []) as Array<{ user_id: string; profiles: { first_name: string | null; last_name: string | null } | null }>) {
        if (utentiDipendenti.has(r.user_id)) continue;
        const nome = `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim();
        if (!nome) continue;
        membri.push({ key: `usr-${r.user_id}`, nome });
      }
      return membri;
    },
  });
  const togglePresenza = (m: MembroSquadra) => {
    setPresenzeSel(prev => {
      const next = { ...prev };
      if (m.key in next) delete next[m.key];
      else next[m.key] = "";
      return next;
    });
  };

  // The existing DB unique key is author + site + workday. Never promise a
  // second report or overwrite an approved one; corrections go to the office.
  const { data: rapportinoGiaOggi } = useQuery({
    queryKey: ["campo-rapportino-gia-oggi", companyId, orderId, user?.id, workDay],
    enabled: !!companyId && !!orderId && !!user?.id && validWorkDay(workDay),
    staleTime: 30_000,
    queryFn: async (): Promise<{ id: string; created_at: string } | null> => {
      const { data, error } = await supabase
        .from("campo_rapportini")
        .select("id, created_at")
        .eq("order_id", orderId!)
        .eq("user_id", user!.id)
        .eq("company_id", companyId!)
        .eq("data_lavoro", workDay)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as { id: string; created_at: string } | undefined) ?? null;
    },
  });

  const dayTime = useCampoDayTime(user?.id, companyId, workDay);
  const siteTime = dayTime.summary.byOrder.get(orderId ?? "");
  const oreRilevate = siteTime ? campoReportHours(siteTime.workMinutes) : null;
  const anomalieTimbrature = dayTime.summary.issues.some(issue => issue.kind !== "open_session");
  const sessioneDaChiudere = dayTime.isSuccess && dayTime.summary.state !== "out" && dayTime.summary.activeOrderId === orderId && workDay === today;
  useEffect(() => {
    if (oreModificate.current || rapportinoGiaOggi || !dayTime.isSuccess || oreRilevate == null || anomalieTimbrature) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || oreModificate.current) return;
      setOreLavorate(oreRilevate);
    });
    return () => { cancelled = true; };
  }, [dayTime.isSuccess, oreRilevate, anomalieTimbrature, rapportinoGiaOggi]);
  const { data: coordCantiere } = useQuery({
    queryKey: ["campo-cantiere-coord", orderId],
    enabled: !!orderId,
    staleTime: 3600_000,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("work_lat, work_lng").eq("id", orderId!).maybeSingle();
      return data?.work_lat != null && data?.work_lng != null ? { lat: Number(data.work_lat), lng: Number(data.work_lng) } : null;
    },
  });
  const { data: meteoMap } = useWeatherForecast(coordCantiere?.lat ?? 45.4654, coordCantiere?.lng ?? 9.1859, 1);
  useEffect(() => {
    if (meteoModificato.current || rapportinoGiaOggi || !meteoMap || !coordCantiere) return;
    const weather = meteoMap.get(workDay);
    if (!weather) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || meteoModificato.current) return;
      const c = weather.code;
      setMeteo(c <= 1 ? "soleggiato" : c <= 48 ? "nuvoloso" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "neve" : "pioggia");
      meteoModificato.current = true;
    });
    return () => { cancelled = true; };
  }, [meteoMap, coordCantiere, rapportinoGiaOggi, workDay]);
  // Solo le fasi non completate sono dichiarabili
  const fasiDichiarabili = fasiCommessa.filter(f => f.status !== "completata");

  // ── Articoli/materiali della commessa (order_items) ─────────────────
  // L'operaio può confermare quali ha usato oggi (facoltativo). Se la
  // commessa non ha articoli resta solo l'aggiunta libera.
  const { data: articoliCommessa = [], isLoading: articoliLoading, isError: articoliError, refetch: refetchArticoli } = useQuery({
    queryKey: ["campo-articoli-commessa-rapportino", orderId, companyId],
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: () => loadRapportinoArticles(orderId!, companyId!),
  });
  const materialiCommessa = articoliCommessa.filter(item => rapportinoArticleKind(item) === "material");
  const articoliDaVerificare = articoliCommessa.filter(item => rapportinoArticleKind(item) === "unknown");
  const prestazioniCommessa = articoliCommessa.filter(item => rapportinoArticleKind(item) === "service");

  const toggleMateriale = (item: RapportinoArticle) => {
    setMaterialiSel(prev => {
      const next = { ...prev };
      if (item.id in next) delete next[item.id];
      else next[item.id] = { nome: item.name, quantita: 1, unita: rapportinoMaterialUnit(item.template?.unit_of_measure) };
      return next;
    });
  };

  const renderMateriale = (item: RapportinoArticle) => (
    <button key={item.id} type="button" aria-pressed={item.id in materialiSel}
      onClick={() => toggleMateriale(item)}
      className={`max-w-full min-h-11 rounded-xl border px-3 py-2 text-left text-sm break-words transition-colors ${
        item.id in materialiSel ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-muted text-muted-foreground"
      }`}>
      {item.name}
    </button>
  );

  const aggiungiMaterialeLibero = () => {
    const nome = materialeLibero.trim();
    if (!nome) return;
    setMaterialiSel(prev => ({ ...prev, [`libero_${Date.now()}`]: { nome, quantita: 1 } }));
    setMaterialeLibero("");
  };

  const toggleFase = (fase: FaseCommessa) => {
    setFasiDichiarate(prev => {
      const next = { ...prev };
      if (fase.id in next) delete next[fase.id];
      else next[fase.id] = fase.percentuale; // slider precompilato con l'attuale
      return next;
    });
  };

  // ── Upload foto ──────────────────────────────────────────────────────
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!reportDayAllowed(workDay)) { toast.error(REPORT_DEADLINE_MESSAGE); return; }
    if (!profile?.company_id || !orderId) {
      toast.error("Sessione non pronta, riprova");
      return;
    }
    const files = Array.from(e.target.files).slice(0, 5);
    setUploadingFoto(true);

    const previews: string[] = [];
    const urls: string[] = [];
    let failed = 0;
    let troppoGrandi = 0;

    for (const file of files) {
      // Limite dimensione: una foto da 30MB su 4G tiene bloccato il wizard
      // per minuti (e lo storage non la vuole comunque).
      if (file.size > 10 * 1024 * 1024) {
        troppoGrandi++;
        continue;
      }

      try {
        // Comprimi: se il browser fallisce qualsiasi step, carica il file originale
        const compressed = await compressImage(file).catch((): null => null);
        assertReportDay(workDay);
        const payload: Blob = compressed ?? file;

        const path = `${profile.company_id}/${orderId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { data: up, error: upErr } = await supabase.storage
          .from("campo-rapportini")
          .upload(path, payload, { contentType: "image/jpeg", upsert: false });

        if (upErr) throw upErr;
        if (!up?.path) throw new Error("Upload senza path");

        const { data: urlData } = supabase.storage.from("campo-rapportini").getPublicUrl(up.path);
        urls.push(urlData.publicUrl);
        previews.push(URL.createObjectURL(file));
      } catch (err) {
        failed++;
        console.error("[CampoRapportino] upload foto:", err);
      }
    }

    setFotoPreviews(prev => [...prev, ...previews]);
    setFotoUrls(prev => [...prev, ...urls]);
    setUploadingFoto(false);

    if (troppoGrandi > 0) {
      toast.error(`${troppoGrandi} foto oltre i 10MB: scattale dall'app invece di allegarle dalla galleria in alta risoluzione`);
    }
    if (failed > 0) {
      toast.error(
        failed === files.length - troppoGrandi
          ? "Impossibile caricare le foto — riprova"
          : `Caricate ${urls.length}/${files.length} foto`,
      );
    }
  };

  // ── Salvataggio ──────────────────────────────────────────────────────
  const { mutate: salva, isPending: saving } = useMutation({
    mutationFn: async () => {
      assertReportDay(workDay);
      if (sessioneDaChiudere) throw new Error("Timbra prima l’uscita da questo cantiere, poi conferma le ore del rapportino.");
      if (rapportinoGiaOggi) throw new Error("Esiste già un rapportino per questo cantiere e questa giornata. Per correggerlo contatta l’ufficio.");
      if (!companyId || !orderId || !user?.id) {
        throw new Error("Sessione non pronta, ricarica la pagina");
      }

      const hasAssignment = await hasRapportinoAssignment(orderId, user.id, companyId);
      if (!hasAssignment) {
        throw new Error("Non puoi inviare rapportini per un lavoro non assegnato");
      }
      const materialiPayload = buildRapportinoMaterials(materialiSel);
      const orePayload = validateRapportinoHours(oreLavorate, oreStraordinario, isCapocantiere ? presenzeSel : {});

      // Fasi dichiarate dall'operaio: [{phase_id, percentuale}] (Fase C)
      const fasiLavorate = Object.entries(fasiDichiarate).map(([phase_id, percentuale]) => ({
        phase_id,
        percentuale,
      }));

      // ── Firme: dataURL → PNG → bucket campo-rapportini ──
      // La firma dell'operaio/capocantiere vale su OGNI rapportino (finisce
      // nel PDF generato all'invio); quella del cliente solo sul fine lavori.
      let firmaClienteUrl: string | null = null;
      let firmaOperaioUrl: string | null = null;
      const ts = Date.now();
      const uploadFirma = async (dataUrl: string, suffix: string): Promise<string> => {
        assertReportDay(workDay);
        const blob = await (await fetch(dataUrl)).blob();
        const path = `${companyId}/${orderId}/firme/${ts}_${suffix}.png`;
        const { data: up, error: upErr } = await supabase.storage
          .from("campo-rapportini")
          .upload(path, blob, { contentType: "image/png", upsert: false });
        if (upErr) throw upErr;
        if (!up?.path) throw new Error("Upload firma senza path");
        const { data: urlData } = supabase.storage.from("campo-rapportini").getPublicUrl(up.path);
        return urlData.publicUrl;
      };
      if (firmaOperaio) {
        // Opzionale: se fallisce non blocca l'invio del rapportino
        firmaOperaioUrl = await uploadFirma(firmaOperaio, "operaio").catch((err): null => {
          console.warn("[CampoRapportino] upload firma operaio fallito:", err);
          return null;
        });
      }
      if (lavoro_completato && firmaCliente) {
        // La firma del cliente è obbligatoria sul fine lavori: se fallisce, blocca l'invio
        firmaClienteUrl = await uploadFirma(firmaCliente, "cliente");
      }

      // Inserisci rapportino
      assertReportDay(workDay); // Recheck after permission lookup / slow uploads.
      const { data: inserted, error } = await supabase
        .from("campo_rapportini")
        .insert({
          company_id: companyId,
          order_id: orderId,
          user_id: user.id,
          role_type: isSubappaltatore ? "subcontractor" : "employee",
          data_lavoro: workDay,
          ore_lavorate: orePayload,
          ore_straordinario: oreStraordinario > 0 ? oreStraordinario : 0,
          descrizione_lavori: descrizione || null,
          foto_urls: fotoUrls,
          lavoro_completato,
          percentuale_avanzamento: percentuale,
          gps_lat: lat || null,
          gps_lng: lng || null,
          gps_accuracy: accuracy || null,
          meteo: meteo || null,
          stato: "inviato",
          // Fasi su cui l'operaio ha lavorato: se non ne dichiara, payload invariato
          ...(fasiLavorate.length > 0 ? { fasi_lavorate: fasiLavorate } : {}),
          // Squadra del giorno (solo capocantiere): chi c'era e quante ore.
          // I subappaltatori sono presenza registrata, non costo orario.
          ...(isCapocantiere && Object.keys(presenzeSel).length > 0
            ? {
                presenze: squadra
                  .filter(m => m.key in presenzeSel)
                  .map(m => ({
                    ...(m.employee_id ? { employee_id: m.employee_id } : {}),
                    ...(m.subappaltatore_id ? { subappaltatore_id: m.subappaltatore_id } : {}),
                    nome: m.nome,
                    ore: presenzeSel[m.key],
                  })),
              }
            : {}),
          // Materiali confermati oggi (facoltativi): stesso formato del vocale
          ...(materialiPayload.length > 0 ? { materiali_usati: materialiPayload } : {}),
          // Firma dell'autore su qualunque rapportino; firma cliente solo fine lavori
          ...(firmaOperaioUrl ? { firma_operaio_url: firmaOperaioUrl } : {}),
          ...(lavoro_completato && firmaClienteUrl
            ? {
                firma_cliente_url: firmaClienteUrl,
                firma_cliente_nome: firmaClienteNome.trim(),
                firma_cliente_at: new Date().toISOString(),
              }
            : {}),
        })
        .select("id")
        .single();

      if (error?.code === "23505") throw new Error("Rapportino già presente per questa giornata. Apri lo storico del cantiere; non è stato creato un doppione.");
      if (error) throw error;

      // Le fasi dichiarate NON si applicano qui: l'avanzamento si muove
      // all'APPROVAZIONE del rapportino (OrdineRapportiniCampo). Prima si
      // applicava all'invio e l'approvazione era decorativa: un rapportino
      // rifiutato lasciava la fase gonfiata per sempre.

      if (inserted?.id) {
        const actorName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "Operatore campo";
        await supabase
          .from("order_events" as never)
          .insert({
            order_id: orderId,
            company_id: companyId,
            event_type: "reportino_cantiere",
            actor_id: user.id,
            actor_name: actorName,
            payload: {
              rapportino_id: inserted.id,
              data_lavoro: workDay,
              ore_lavorate: orePayload,
              ore_straordinario: oreStraordinario > 0 ? oreStraordinario : 0,
              percentuale_avanzamento: percentuale,
              lavoro_completato,
              meteo: meteo || null,
              foto_count: fotoUrls.length,
              descrizione_lavori: descrizione || null,
              origine: "app_campo",
            },
          } as never)
          .then(({ error: eventError }) => {
            if (eventError) console.warn("[CampoRapportino] diario ordine non aggiornato:", eventError);
          });
      }

      // Aggiorna avanzamento sull'ordine se impostato.
      // Se la commessa ha fasi, la % ordine è DERIVATA dal trigger DB
      // (recompute_order_progress) a ogni update di fase: qui si scrive
      // solo per le commesse senza fasi, come prima.
      if (percentuale > 0 && fasiCommessa.length === 0) {
        const { data: currentOrder, error: currentOrderError } = await supabase
          .from("orders")
          .select("percentuale_avanzamento")
          .eq("id", orderId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (currentOrderError) throw currentOrderError;

        const nextProgress = Math.max(Number(currentOrder?.percentuale_avanzamento ?? 0), percentuale);
        await supabase
          .from("orders")
          .update({ percentuale_avanzamento: nextProgress })
          .eq("id", orderId)
          .eq("company_id", companyId);
      }

      // Separate PDF feedback: a failure must never suggest resubmitting the report.
      if (inserted?.id) {
        void notifyRapportinoPdf(inserted.id, orderId, queryClient);
      }

      // Notifica al responsabile (assigned_to, fallback created_by).
      // Errori silenziosi: la notifica non deve mai bloccare l'invio.
      if (inserted?.id) {
        try {
          const { data: orderInfo, error: orderInfoError } = await supabase
            .from("orders")
            .select("assigned_to, created_by, order_code")
            .eq("id", orderId)
            .eq("company_id", companyId)
            .maybeSingle();
          if (orderInfoError) throw orderInfoError;

          const destinatario = orderInfo?.assigned_to || orderInfo?.created_by;
          if (destinatario) {
            const orderCode = orderInfo?.order_code || "commessa";
            const actorLabel = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Un operaio";
            const { error: notifError } = await supabase.rpc("create_notification", {
              p_company_id: companyId,
              p_user_id: destinatario,
              p_type: "rapportino_inviato",
              p_title: lavoro_completato
                ? `Rapporto di fine lavori firmato dal cliente — ${orderCode}`
                : `Nuovo rapportino da approvare — ${orderCode}`,
              p_body: lavoro_completato
                ? `${firmaClienteNome.trim() || "Il cliente"} ha firmato il rapporto di fine lavori inviato da ${actorLabel}.`
                : `${actorLabel} ha inviato un rapportino di ${orePayload}h${oreStraordinario > 0 ? ` (+${oreStraordinario}h straordinario)` : ""}.`,
              p_entity_type: "campo_rapportino",
              p_entity_id: inserted.id,
              p_action_url: `/azienda/ordini/${orderId}?tab=campo`,
            });
            if (notifError) throw notifError;
          }
        } catch (err) {
          console.warn("[CampoRapportino] notifica responsabile non inviata:", err);
        }
      }
    },
    onSuccess: () => {
      navigator.vibrate?.([10, 50, 10]);
      toast.success("Rapportino inviato!");
      queryClient.invalidateQueries({ queryKey: ["campo-rapportini-ordine", orderId] });
      // Header dettaglio lavoro: la % ordine è ricalcolata dal trigger DB
      queryClient.invalidateQueries({ queryKey: ["campo-lavoro", orderId] });
      // Card "rapportini da compilare" in home + indicatore "già fatto oggi" nel dettaglio
      queryClient.invalidateQueries({ queryKey: ["campo-rapportini-da-compilare"] });
      queryClient.invalidateQueries({ queryKey: ["campo-rapportino-gia-oggi"] });
      queryClient.invalidateQueries({ queryKey: ["campo-lavoro-rapportino-oggi", orderId] });
      queryClient.invalidateQueries({ queryKey: ["campo-rapportini-sospesi"] });
      // Lista rapportini lato azienda (stessa sessione admin+campo)
      queryClient.invalidateQueries({ queryKey: ["order-campo-rapportini", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-events", companyId, orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-diary-audit", orderId, companyId] });
      // Fasi aggiornate dal rapportino: riallinea lavorazioni + semaforo tempi
      queryClient.invalidateQueries({ queryKey: ["order_work_phases", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-phases-progress", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-schedule-health", orderId] });
      queryClient.invalidateQueries({ queryKey: ["campo-fasi-commessa", orderId] });
      navigate(`/campo/lavoro/${orderId}`);
    },
    onError: (err: unknown) => {
      // Il messaggio vero (es. "lavoro non assegnato") deve arrivare
      // all'operaio: il toast generico faceva riprovare all'infinito.
      const msg = err instanceof Error && err.message ? err.message : "Errore nel salvataggio. Riprova.";
      toast.error(msg);
    },
  });

  // Fine lavori: firma cliente + nome obbligatori per inviare
  const firmeMancanti = lavoro_completato && (!firmaCliente || !firmaClienteNome.trim());
  const isUltimoStep = step >= totalSteps;

  const goNext = () => {
    if (!reportDayAllowed(workDay)) { toast.error(REPORT_DEADLINE_MESSAGE); return; }
    if (step < totalSteps) setStep(s => s + 1);
    else salva();
  };

  // Dati "sudati" nel form: uscire per sbaglio (freccia indietro col pollice)
  // non deve buttare via la giornata scritta senza nemmeno chiedere.
  const datiInseriti =
    descrizione.trim().length > 0 || oreLavorate !== "" || oreStraordinario > 0 ||
    fotoUrls.length > 0 ||
    Object.keys(fasiDichiarate).length > 0 ||
    Object.keys(presenzeSel).length > 0 ||
    Object.keys(materialiSel).length > 0;

  const goBack = () => {
    if (step === 1) {
      if (datiInseriti && !window.confirm("Vuoi uscire dal rapportino? I dati inseriti andranno persi.")) {
        return;
      }
      navigate(`/campo/lavoro/${orderId}`);
      return;
    }
    if (step === 3) {
      // Tornando indietro il canvas si smonta: azzera la firma cliente per
      // evitare uno stato "firmato" con pad visivamente vuoto al rientro.
      setFirmaCliente(null);
    }
    if (step === 2) setFirmaOperaio(null);
    setStep(s => s - 1);
  };

  const METEO_OPTIONS = [
    { value: "soleggiato", emoji: "☀️", label: "Sole" },
    { value: "nuvoloso", emoji: "☁️", label: "Nuvolo" },
    { value: "pioggia", emoji: "🌧️", label: "Pioggia" },
    { value: "neve", emoji: "❄️", label: "Neve" },
    { value: "vento", emoji: "💨", label: "Vento" },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-3 py-3 shadow-sm md:px-4">
        <button
          onClick={goBack}
          aria-label="Indietro nel rapportino"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted active:bg-muted"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Rapportino — Passo {step} di {totalSteps}</p>
          <RapportinoSiteContext orderId={orderId} companyId={companyId} />
          <p className="mt-1 text-xs font-semibold">Giornata del {dayLabel}</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenuto — spacing denso su mobile (regola no-spazio-vuoto) */}
      <div className="space-y-3 px-3 py-3 md:space-y-4 md:px-4 md:py-5">
        {!dayAllowed && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{REPORT_DEADLINE_MESSAGE} I dati compilati restano visibili, ma non vengono spostati a oggi.</p>}
        {rapportinoGiaOggi && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Esiste già un rapportino per questa giornata. Non ne viene creato un altro: per integrazioni o correzioni contatta l’ufficio.
        </p>}

        {/* ── Step 1: Descrizione ── */}
        {step === 1 && (
          <>
            <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
              <label htmlFor="rapportino-giornata" className="text-sm font-semibold">Giornata di lavoro</label>
              <select id="rapportino-giornata" value={workDay} disabled={saving || uploadingFoto}
                onChange={e => {
                  if (datiInseriti && !window.confirm("Cambiare giornata cancella i dati di questo modulo. Vuoi continuare?")) return;
                  const next = new URLSearchParams(params); next.set("data", e.target.value); setParams(next, { replace: true });
                }} className="h-12 w-full min-w-0 rounded-lg border bg-background px-3 text-base">
                {!dayAllowed && <option value={workDay}>{dayLabel} — non inviabile</option>}
                <option value={today}>Oggi · {format(new Date(`${today}T12:00:00`), "dd/MM/yyyy")}</option>
                <option value={yesterday}>Ieri · {format(new Date(`${yesterday}T12:00:00`), "dd/MM/yyyy")}</option>
              </select>
              <p className="text-xs text-muted-foreground">{dayAllowed ? workDay === yesterday ? "Da inviare entro oggi alle 23:59." : "Da inviare entro domani alle 23:59." : "Giornata fuori termine."} Ora italiana. Un rapportino per autore, cantiere e giornata.</p>
            </div>
            <h2 className="text-lg font-black text-foreground md:text-xl">{workDay === today ? "Cosa hai fatto oggi?" : "Cosa hai fatto in questa giornata?"}</h2>
            <textarea
              className="w-full resize-none rounded-2xl border border-border bg-muted/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={5}
              placeholder="Es: Ho installato il telaio finestra al piano primo, sigillato con schiuma poliuretanica..."
              value={descrizione}
              onChange={e => setDescrizione(e.target.value)}
            />
            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Condizioni meteo</p>
              <div className="grid grid-cols-5 gap-2">
                {METEO_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => { meteoModificato.current = true; setMeteo(meteo === m.value ? "" : m.value); }}
                    className={`flex min-h-12 flex-col items-center justify-center rounded-xl border p-2 transition-all ${
                      meteo === m.value
                        ? "bg-primary/10 border-primary/40"
                        : "bg-muted border-border"
                    }`}
                  >
                    <span className="text-lg">{m.emoji}</span>
                    <span className="text-[10px] font-medium text-muted-foreground">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Ore del solo cantiere: proposta verificabile, mai 8 ore implicite. */}
            {sessioneDaChiudere && <div role="status" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>La timbratura è ancora aperta su questo cantiere. Prima dell’invio registra l’uscita: le ore non sono ancora definitive.</p>
              <button type="button" className="min-h-11 underline" onClick={() => {
                if (datiInseriti && !window.confirm("Aprire la timbratura lascia questo modulo. I dati non inviati andranno persi. Continuare?")) return;
                navigate(`/campo/timbratura?order_id=${orderId}`);
              }}>Vai a timbrare l’uscita</button>
            </div>}
            <div className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
              <div>
                <label htmlFor="ore-cantiere" className="text-sm font-semibold">Ore ordinarie su questo cantiere</label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dayTime.isError ? "Timbrature non disponibili: inserisci le ore oppure riprova." :
                    anomalieTimbrature ? "Ci sono timbrature da verificare: indica le ore effettive." :
                    oreRilevate != null ? `Rilevate ${oreRilevate} h, pause escluse${siteTime?.provisional ? " · sessione ancora aperta" : ""}. Verifica prima di inviare.` :
                    "Nessuna ora attribuita da proporre. Per sole foto o note, indica 0."}
                </p>
                {dayTime.isError && <button type="button" className="mt-2 min-h-11 text-sm text-primary underline" onClick={() => dayTime.refetch()}>Riprova timbrature</button>}
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" aria-label="Riduci ore ordinarie"
                    onClick={() => modificaOre(Math.max(0, Math.round(((oreLavorate === "" ? 0 : oreLavorate) - 0.5) * 10) / 10))}
                    className="h-11 w-11 shrink-0 rounded-xl bg-muted flex items-center justify-center">
                    <Minus className="w-4 h-4" />
                  </button>
                  <input id="ore-cantiere" type="number" min={0} max={24} step={0.1} inputMode="decimal"
                    value={oreLavorate} placeholder="Da indicare"
                    onChange={e => modificaOre(e.target.value === "" ? "" : Number(e.target.value))}
                    className="min-w-0 w-full h-11 rounded-xl border bg-background px-3 text-center text-base" />
                  <span className="text-sm text-muted-foreground">h</span>
                  <button type="button" aria-label="Aumenta ore ordinarie"
                    onClick={() => modificaOre(Math.min(24, Math.round(((oreLavorate === "" ? 0 : oreLavorate) + 0.5) * 10) / 10))}
                    className="h-11 w-11 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Sono ore aggiuntive: se incluse nelle ore rilevate, sottraile dalle ordinarie qui sopra.</p>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Ore straordinario</p>
                  <span className="text-primary font-bold">{oreStraordinario}h</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setOreStraordinario(o => Math.max(0, o - 0.5))}
                    className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
                  >
                    <Minus className="w-4 h-4 text-foreground" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={6}
                    step={0.5}
                    value={oreStraordinario}
                    onChange={e => setOreStraordinario(Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <button
                    onClick={() => setOreStraordinario(o => Math.min(6, o + 0.5))}
                    className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Foto cantiere</p>
              <label className="block w-full">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={handleFotoChange}
                  disabled={uploadingFoto || !dayAllowed || !!rapportinoGiaOggi}
                />
                <div className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/60 p-6 transition-colors active:border-primary">
                  {uploadingFoto ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Scatta o scegli foto</span>
                    </>
                  )}
                </div>
              </label>
              {fotoPreviews.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {fotoPreviews.map((p, i) => (
                    <div key={i} className="relative">
                      <img loading="lazy" src={p} className="aspect-square w-full rounded-xl object-cover" alt="preview" />
                      <button
                        onClick={() => {
                          setFotoPreviews(prev => prev.filter((_, idx) => idx !== i));
                          setFotoUrls(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 2 (a): fasi, squadra e materiali del cantiere ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-black text-foreground md:text-xl">Conferma e firma</h2>

            {/* Avanzamento generale SOLO senza fasi: con le fasi la % commessa
                è derivata dal DB, chiederla di nuovo qui confonde. */}
            {fasiCommessa.length === 0 && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Avanzamento lavori</p>
                  <span className="text-primary font-bold">{percentuale}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={percentuale}
                  onChange={e => setPercentuale(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* ── Squadra del giorno (solo capocantiere): chi c'era oggi ── */}
            {isCapocantiere && squadra.length > 0 && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">{workDay === today ? "Chi ha lavorato oggi?" : "Chi ha lavorato in questa giornata?"}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Tocca chi era in cantiere: le ore dei dipendenti diventano costo
                  di commessa all'approvazione. I subappaltatori sono registrati
                  come presenza (il loro costo è nel contratto).
                </p>
                <div className="flex flex-wrap gap-2">
                  {squadra.map(m => {
                    const selected = m.key in presenzeSel;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => togglePresenza(m)}
                        className={`min-h-11 rounded-full border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {m.nome}
                        {m.subappaltatore_id ? " · sub" : ""}
                      </button>
                    );
                  })}
                </div>
                {Object.keys(presenzeSel).length > 0 && (
                  <p role="status" className="mt-3 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                    Il costo della squadra usa le presenze selezionate, non le ore personali del passo 1.
                    Se hai lavorato anche tu, seleziona anche il tuo nome.
                  </p>
                )}
                {squadra.filter(m => m.key in presenzeSel).map(m => (
                  <div key={m.key} className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">
                      {m.nome}
                      {m.subappaltatore_id && (
                        <span className="ml-1 text-xs text-muted-foreground">(subappaltatore)</span>
                      )}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <input
                        type="number"
                        min={0.1}
                        max={24}
                        step={0.1}
                        inputMode="decimal"
                        value={presenzeSel[m.key]}
                        onChange={e =>
                          setPresenzeSel(prev => ({ ...prev, [m.key]: e.target.value === "" ? "" : Number(e.target.value) }))
                        }
                        className="h-11 w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-base"
                        aria-label={`Ore di ${m.nome}`}
                      />
                      <span className="text-xs text-muted-foreground">ore</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Fasi lavorate (solo se la commessa ha fasi non completate) ── */}
            {fasiDichiarabili.length > 0 && (
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <p className="text-sm font-semibold text-foreground">{workDay === today ? "Su cosa hai lavorato oggi?" : "Su cosa hai lavorato in questa giornata?"}</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  {!ruoloCampo
                    ? "Ruolo Campo non ancora verificato. Puoi indicare le fasi lavorate; la modifica delle percentuali resta disabilitata."
                    : puoDichiararePercentuali
                    ? "Tocca le fasi e indica l'avanzamento raggiunto (facoltativo)"
                    : "Tocca le fasi su cui hai lavorato: servono ad attribuire le tue ore. L'avanzamento lo dichiara il capocantiere."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {fasiDichiarabili.map(fase => {
                    const selected = fase.id in fasiDichiarate;
                    return (
                      <button
                        key={fase.id}
                        type="button"
                        onClick={() => toggleFase(fase)}
                        className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {fase.name}
                      </button>
                    );
                  })}
                </div>

                {puoDichiararePercentuali && fasiDichiarabili.filter(f => f.id in fasiDichiarate).map(fase => (
                  <div key={fase.id} className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">{fase.name}</p>
                      <span className="shrink-0 text-primary font-bold">{fasiDichiarate[fase.id]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={fasiDichiarate[fase.id]}
                      onChange={e =>
                        setFasiDichiarate(prev => ({ ...prev, [fase.id]: Number(e.target.value) }))
                      }
                      className="w-full accent-primary"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {fase.percentuale > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Avanzamento attuale: {fase.percentuale}%
                        </p>
                      ) : <span />}
                      <button
                        type="button"
                        onClick={() =>
                          setFasiDichiarate(prev => ({
                            ...prev,
                            [fase.id]: prev[fase.id] === 100 ? fase.percentuale : 100,
                          }))
                        }
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          fasiDichiarate[fase.id] === 100
                            ? "border-green-500 bg-green-500/10 text-green-600"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {fasiDichiarate[fase.id] === 100 ? "✓ Fase completata" : "Segna completata"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Materiali usati oggi (facoltativo) ── */}
            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">{workDay === today ? "Materiali usati oggi" : "Materiali usati nella giornata"}</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Tocca i materiali usati e verifica quantità e unità (facoltativo). La dichiarazione non scarica automaticamente il magazzino.
              </p>
              {articoliLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento materiali…</p>}
              {articoliError && <div role="alert" className="mb-3 rounded-xl border border-amber-200 p-3 text-sm">
                Non riesco a caricare gli articoli. I materiali già scelti restano nel rapportino.
                <button type="button" className="block min-h-11 text-primary underline" onClick={() => refetchArticoli()}>Riprova materiali</button>
              </div>}
              {materialiCommessa.length > 0 && <div className="flex flex-wrap gap-2">{materialiCommessa.map(renderMateriale)}</div>}
              {articoliDaVerificare.length > 0 && <details className="mt-3 rounded-xl border p-3">
                <summary className="min-h-11 cursor-pointer text-sm font-semibold">Articoli da verificare ({articoliDaVerificare.length})</summary>
                <p className="mb-3 text-xs text-muted-foreground">Queste voci non sono classificate. Seleziona solo materiali effettivamente usati; descrivi manodopera e servizi nelle lavorazioni.</p>
                <div className="flex flex-wrap gap-2">{articoliDaVerificare.map(renderMateriale)}</div>
              </details>}
              {prestazioniCommessa.length > 0 && <p className="mt-3 text-xs text-muted-foreground">
                {prestazioniCommessa.length} voci di manodopera o servizi escluse dai materiali: descrivile nelle lavorazioni.
              </p>}

              {Object.entries(materialiSel).map(([key, m]) => (
                <div key={key} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
                  <p className="w-full text-sm font-medium leading-tight text-foreground">{m.nome}</p>
                  <button
                    type="button"
                    aria-label={`Riduci quantità ${m.nome}`}
                    onClick={() =>
                      setMaterialiSel(prev => ({
                        ...prev,
                        [key]: { ...m, quantita: Math.max(0.01, m.quantita - 1) },
                      }))
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
                  >
                    <Minus className="w-4 h-4 text-foreground" />
                  </button>
                  <input type="number" min="0.01" step="any" inputMode="decimal"
                    aria-label={`Quantità ${m.nome}`} value={m.quantita}
                    onChange={e => setMaterialiSel(prev => ({ ...prev, [key]: { ...m, quantita: Number(e.target.value) } }))}
                    className="h-11 min-w-0 w-20 rounded-lg border bg-background px-2 text-center text-base" />
                  <select aria-label={`Unità ${m.nome}`} value={m.unita || ""}
                    onChange={e => setMaterialiSel(prev => ({ ...prev, [key]: { ...m, unita: e.target.value } }))}
                    className="h-11 min-w-0 max-w-full rounded-lg border bg-background px-2 text-base">
                    <option value="" disabled>Scegli unità</option>
                    {rapportinoUnitOptions(m.unita).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  {!m.unita && <p className="w-full text-xs text-amber-700">Unità non disponibile: scegli come hai misurato il materiale.</p>}
                  <button
                    type="button"
                    aria-label={`Aumenta quantità ${m.nome}`}
                    onClick={() =>
                      setMaterialiSel(prev => ({
                        ...prev,
                        [key]: { ...m, quantita: m.quantita + 1 },
                      }))
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary"
                  >
                    <Plus className="w-4 h-4 text-primary-foreground" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Rimuovi materiale ${m.nome}`}
                    onClick={() =>
                      setMaterialiSel(prev => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })
                    }
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              ))}

              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Altro materiale…"
                  value={materialeLibero}
                  onChange={e => setMaterialeLibero(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") aggiungiMaterialeLibero(); }}
                />
                <button
                  type="button"
                  onClick={aggiungiMaterialeLibero}
                  disabled={!materialeLibero.trim()}
                  className="flex h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                >
                  Aggiungi
                </button>
              </div>
            </div>

          </>
        )}

        {/* ── Step 2 (b): riepilogo, fine lavori e firma dell'autore ── */}
        {step === 2 && (
          <>
            <h3 className="text-base font-black text-foreground">Riepilogo</h3>

            {/* Riepilogo dati */}
            <div className="space-y-3 rounded-2xl border border-border bg-muted/60 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data</span>
                <span className="text-foreground">{dayLabel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ore personali ordinarie</span>
                <span className="text-primary font-bold">{oreLavorate === "" ? (Object.keys(presenzeSel).length ? "Vedi presenze squadra" : "Da indicare") : `${oreLavorate}h`}</span>
              </div>
              {Object.keys(presenzeSel).length > 0 && (
                <div className="space-y-1 border-t border-border pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Presenze squadra</p>
                  {squadra.filter(m => m.key in presenzeSel).map(m => (
                    <div key={m.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words">{m.nome}{m.subappaltatore_id ? " · sub" : ""}</span>
                      <span className="shrink-0 font-semibold">{presenzeSel[m.key] === "" ? "Da indicare" : `${presenzeSel[m.key]} h`}</span>
                    </div>
                  ))}
                </div>
              )}
              {oreStraordinario > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ore straordinario</span>
                  <span className="text-primary font-bold">{oreStraordinario}h</span>
                </div>
              )}
              {fasiCommessa.length === 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avanzamento</span>
                  <span className="text-primary font-bold">{percentuale}%</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Foto</span>
                <span className="text-foreground">{fotoUrls.length} foto</span>
              </div>
              {Object.keys(materialiSel).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Materiali usati</p>
                  {Object.values(materialiSel).map((m, i) => (
                    <p key={i} className="text-sm text-foreground">
                      {m.nome} <span className="font-semibold text-primary">× {m.quantita} {m.unita || "· unità da scegliere"}</span>
                    </p>
                  ))}
                </div>
              )}
              {Object.keys(fasiDichiarate).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">{puoDichiararePercentuali ? "Avanzamento dichiarato delle fasi" : workDay === today ? "Lavorazioni svolte oggi" : "Lavorazioni svolte nella giornata"}</p>
                  {fasiCommessa.filter(f => f.id in fasiDichiarate).map(f => (
                    <p key={f.id} className="text-sm text-foreground">
                      {f.name}{" "}
                      <span className="font-semibold text-primary">
                        {!puoDichiararePercentuali ? workDay === today ? "· lavorata oggi" : "· lavorata nella giornata" : fasiDichiarate[f.id] === 100 ? "✓ completata" : `→ ${fasiDichiarate[f.id]}%`}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {descrizione && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Descrizione</p>
                  <p className="text-sm text-foreground">{descrizione}</p>
                </div>
              )}
              {meteo && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Meteo</span>
                  <span className="text-foreground capitalize">{meteo}</span>
                </div>
              )}
            </div>

            {/* Toggle lavoro completato */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
              <button
                onClick={() => setLavoroCompletato(!lavoro_completato)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  lavoro_completato ? "bg-green-500" : "bg-border"
                } relative`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  lavoro_completato ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-foreground">Lavoro completato</p>
                <p className="text-xs text-muted-foreground">
                  {lavoro_completato
                    ? "Al passo successivo servirà la firma del cliente"
                    : "Attivalo solo se il cantiere è finito: chiederemo la firma del cliente"}
                </p>
              </div>
            </div>

            {/* Firma dell'autore su OGNI rapportino: finisce nel PDF generato
                all'invio. Facoltativa, ma il pad qui la rende un gesto solo. */}
            <FirmaPad
              label={isCapocantiere ? "Firma del capocantiere (facoltativa)" : "Firma dell'operaio (facoltativa)"}
              onChange={setFirmaOperaio}
            />
          </>
        )}

        {/* ── Step 3: Firma del cliente (solo fine lavori) ── */}
        {step === 3 && lavoro_completato && (
          <>
            <h2 className="text-lg font-black text-foreground md:text-xl">Firma del cliente</h2>
            <p className="text-sm text-muted-foreground">
              Fai firmare il cliente per confermare la fine dei lavori.
            </p>

            <FirmaPad label="Firma del cliente" onChange={setFirmaCliente} />

            <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-foreground">Nome e cognome del cliente</p>
              <input
                type="text"
                className="w-full rounded-xl border border-border bg-muted/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Es: Mario Rossi"
                value={firmaClienteNome}
                onChange={e => setFirmaClienteNome(e.target.value)}
              />
            </div>

            {firmeMancanti && (
              <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Per inviare il rapporto di fine lavori servono la firma del cliente e il suo nome e cognome.
              </p>
            )}
          </>
        )}
      </div>

      {/* Navigazione. -bottom-28 compensa il pb-28 del <main>: senza, la
          barra si aggancia 112px sopra il fondo e copre il form. */}
      {/* La bottom-nav è nascosta nel wizard (CampoLayout): la barra sta a
          filo schermo, senza più il trucco -bottom-28/pb-20 che le faceva
          spazio sopra la nav. */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:px-4 md:pb-3">
        <div className="flex gap-3">
          <button
            onClick={goBack}
            aria-label="Passo precedente"
            className="bg-muted border border-border text-foreground font-semibold py-3.5 px-6 rounded-xl active:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            disabled={saving || uploadingFoto || !dayAllowed || !!rapportinoGiaOggi || (isUltimoStep && (firmeMancanti || sessioneDaChiudere))}
            className="flex-1 bg-primary text-white font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : !isUltimoStep ? (
              <>
                Avanti
                <ChevronRight className="w-5 h-5" />
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {lavoro_completato ? "Invia fine lavori" : "Invia rapportino"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
