import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { isOnline } from "@/lib/campo/network-status";
import { assertReportDay, campoWorkDay } from "@/lib/campo/workDay";
import { notifyRapportinoPdf } from "@/lib/campo/rapportinoPdf";

const BUCKET = "campo-audio";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

export interface MaterialeUsato {
  nome: string;
  quantita: number;
  unita: string;
}

export interface DatiEstratti {
  data_lavoro?: string;
  ore_lavorate?: number;
  lavorazione?: string;
  materiali?: MaterialeUsato[];
  team_presenti?: string[];
  note?: string;
  sicurezza_alert?: {
    rilevato: boolean;
    tipo?: "near_miss" | "infortunio" | "dpi_mancante" | "ponteggio_non_a_norma" | "altro" | null;
    descrizione?: string | null;
    gravita?: "bassa" | "media" | "alta" | null;
  };
  incidenti_segnalati?: string[];
  qualita_auto_valutazione?: "ottima" | "buona" | "da_rivedere" | null;
  lingua_originale?: string | null;
}

export interface RapportinoVocaleDraft {
  data_lavoro?: string;
  id?: string;
  trascrizione: string;
  dati_estratti: DatiEstratti;
  audio_url?: string;
  audio_duration_sec: number;
}

interface UseRapportinoVocaleState {
  uploading: boolean;
  transcribing: boolean;
  draft: RapportinoVocaleDraft | null;
  error: string | null;
}

export function useRapportinoVocale(): UseRapportinoVocaleState & {
  processAudio: (
    blob: Blob,
    durationSec: number,
    mimeType: string,
    orderId?: string | null,
  ) => Promise<RapportinoVocaleDraft | null>;
  confirmRapportino: (
    draft: RapportinoVocaleDraft,
    orderId?: string | null,
  ) => Promise<boolean>;
  resetDraft: () => void;
} {
  const { user, profile } = useAuth();
  const { isSubappaltatore } = useIsCampo();
  const queryClient = useQueryClient();
  const { enqueue } = useOfflineSync();
  const [state, setState] = useState<UseRapportinoVocaleState>({
    uploading: false,
    transcribing: false,
    draft: null,
    error: null,
  });

  const processAudio = useCallback(
    async (
      blob: Blob,
      durationSec: number,
      mimeType: string,
      orderId?: string | null,
    ): Promise<RapportinoVocaleDraft | null> => {
      if (!user?.id || !profile?.company_id) {
        setState((s) => ({ ...s, error: "Profilo non disponibile" }));
        return null;
      }
      if (blob.size > MAX_AUDIO_BYTES) {
        setState((s) => ({ ...s, error: "Registrazione troppo grande (max 10MB)" }));
        return null;
      }
      if (durationSec < 3) {
        setState((s) => ({ ...s, error: "Registrazione troppo breve (min 3s)" }));
        return null;
      }

      setState((s) => ({ ...s, uploading: true, error: null }));

      // 1. Upload audio su storage (se online)
      const now = new Date();
      const dataLavoro = campoWorkDay(now);
      const y = now.getFullYear();
      const m = (now.getMonth() + 1).toString().padStart(2, "0");
      const d = now.getDate().toString().padStart(2, "0");
      const ext = mimeType.includes("mp4") ? "m4a" : "webm";
      const filename = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${user.id}/${y}${m}${d}/${filename}`;

      let audioUrl: string | undefined;

      if (isOnline()) {
        const { error: upError } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, {
            contentType: mimeType,
            upsert: false,
          });
        if (!upError) {
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
          audioUrl = urlData.publicUrl;
        }
      }

      setState((s) => ({ ...s, uploading: false, transcribing: true }));

      // 2. Chiama Edge Function per trascrizione + estrazione
      let draft: RapportinoVocaleDraft;

      if (isOnline() && audioUrl) {
        try {
          const { data, error } = await supabase.functions.invoke(
            "parse-rapportino-ai",
            {
              body: {
                audio_url: audioUrl,
                audio_path: path,
                order_id: orderId ?? null,
                duration_sec: durationSec,
              },
            },
          );
          if (error) throw new Error(error.message);
          const parsed = data as {
            trascrizione?: string;
            dati_estratti?: DatiEstratti;
            rapportino_id?: string;
          };
          draft = {
            data_lavoro: dataLavoro,
            id: parsed.rapportino_id,
            trascrizione: parsed.trascrizione ?? "",
            dati_estratti: parsed.dati_estratti ?? {},
            audio_url: audioUrl,
            audio_duration_sec: durationSec,
          };
        } catch (err) {
          console.error("[useRapportinoVocale] trascrizione fallita", err);
          // Fallback: crea bozza vuota, l'utente compilerà a mano
          draft = {
            data_lavoro: dataLavoro,
            trascrizione: "",
            dati_estratti: {},
            audio_url: audioUrl,
            audio_duration_sec: durationSec,
          };
          setState((s) => ({
            ...s,
            transcribing: false,
            error:
              "Trascrizione automatica non disponibile. Compila i campi manualmente.",
          }));
          setState((s) => ({ ...s, draft, transcribing: false }));
          return draft;
        }
      } else {
        // Offline: metti audio in coda, bozza vuota
        draft = {
          data_lavoro: dataLavoro,
          trascrizione: "",
          dati_estratti: {},
          audio_duration_sec: durationSec,
        };
        await enqueue("foto", {
          bucket: BUCKET,
          path,
          blob,
          contentType: mimeType,
        });
      }

      setState((s) => ({ ...s, transcribing: false, draft }));
      return draft;
    },
    [user?.id, profile?.company_id, enqueue],
  );

  const confirmRapportino = useCallback(
    async (
      draft: RapportinoVocaleDraft,
      orderId?: string | null,
    ): Promise<boolean> => {
      if (!user?.id || !profile?.company_id) return false;
      const dataLavoro = draft.data_lavoro ?? draft.dati_estratti.data_lavoro ?? "";
      try { assertReportDay(dataLavoro); } catch (err) {
        setState(s => ({ ...s, error: err instanceof Error ? err.message : "Giornata non valida" }));
        return false;
      }

      const resolveOrderId = async (): Promise<string | null> => {
        if (orderId) return orderId;

        const activeOrderIds = new Set<string>();
        const addActive = (order: { id?: string | null; status?: string | null } | null | undefined) => {
          if (!order?.id) return;
          const status = String(order.status ?? "").toLowerCase();
          if (status === "annullato" || status === "chiuso") return;
          activeOrderIds.add(order.id);
        };

        const { data: directAssignments } = await supabase
          .from("order_campo_assignments")
          .select("order:orders(id, status)")
          .eq("user_id", user.id)
          .eq("company_id", profile.company_id);

        for (const assignment of (directAssignments ?? []) as Array<{ order: { id: string; status: string | null } | null }>) {
          addActive(assignment.order);
        }

        const { data: employee } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", user.id)
          .eq("company_id", profile.company_id)
          .maybeSingle();

        if (employee?.id) {
          const { data: employeeAssignments } = await supabase
            .from("order_employees")
            .select("order:orders(id, status)")
            .eq("employee_id", employee.id);

          for (const assignment of (employeeAssignments ?? []) as Array<{ order: { id: string; status: string | null } | null }>) {
            addActive(assignment.order);
          }
        }

        return activeOrderIds.size === 1 ? Array.from(activeOrderIds)[0] : null;
      };

      const effectiveOrderId = await resolveOrderId();
      const materiali = (draft.dati_estratti.materiali ?? []).filter((m) => m.nome?.trim())
        .map(m => ({ nome: m.nome, quantita: m.quantita, unita: m.unita }));
      const oreLavorate = Number.isFinite(draft.dati_estratti.ore_lavorate)
        ? Math.min(24, Math.max(0, Number(draft.dati_estratti.ore_lavorate)))
        : null;
      const descrizioneLavori = [
        draft.dati_estratti.lavorazione,
        draft.dati_estratti.note,
      ].filter(Boolean).join(" — ") || draft.trascrizione?.slice(0, 1200) || null;
      const actorName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "Operatore campo";

      const payload = {
        company_id: profile.company_id,
        order_id: effectiveOrderId,
        operaio_id: user.id,
        audio_url: draft.audio_url ?? null,
        audio_duration_sec: draft.audio_duration_sec,
        trascrizione: draft.trascrizione,
        dati_estratti: { ...draft.dati_estratti, data_lavoro: dataLavoro },
        ore_lavorate: oreLavorate,
        lavorazione: draft.dati_estratti.lavorazione ?? null,
        materiali_usati: materiali,
        note: draft.dati_estratti.note ?? null,
        stato: "confermato" as const,
      };

      try {
        assertReportDay(dataLavoro);
        if (isOnline()) {
          if (effectiveOrderId) {
            const { data: existing, error: lookupError } = await supabase.from("campo_rapportini")
              .select("id").eq("company_id", profile.company_id).eq("user_id", user.id)
              .eq("order_id", effectiveOrderId).eq("data_lavoro", dataLavoro).limit(1);
            if (lookupError) throw lookupError;
            if (existing?.length) throw new Error("Esiste già un rapportino per questo cantiere e questa giornata. Per correggerlo contatta l’ufficio.");
          }
          assertReportDay(dataLavoro);
          if (draft.id) {
            const { error } = await supabase
              .from("rapportini_vocali" as never)
              .update(payload as never)
              .eq("id", draft.id);
            if (error) throw new Error(error.message);
          } else {
            const { error } = await supabase
              .from("rapportini_vocali" as never)
              .insert(payload as never);
            if (error) throw new Error(error.message);
          }

          if (effectiveOrderId) {
            assertReportDay(dataLavoro);
            const { data: campoRapportino, error: campoError } = await supabase
              .from("campo_rapportini")
              .insert({
                company_id: profile.company_id,
                order_id: effectiveOrderId,
                user_id: user.id,
                role_type: isSubappaltatore ? "subcontractor" : "employee",
                data_lavoro: dataLavoro,
                ore_lavorate: oreLavorate,
                descrizione_lavori: descrizioneLavori,
                materiali_usati: materiali,
                note: draft.dati_estratti.note ?? null,
                source: "campo",
                stato: "inviato",
              })
              .select("id")
              .single();

            if (campoError) throw new Error(campoError.message);

            await supabase
              .from("order_events" as never)
              .insert({
                order_id: effectiveOrderId,
                company_id: profile.company_id,
                event_type: "reportino_cantiere",
                actor_id: user.id,
                actor_name: actorName,
                payload: {
                  rapportino_id: campoRapportino?.id ?? null,
                  rapportino_vocale_id: draft.id ?? null,
                  data_lavoro: dataLavoro,
                  ore_lavorate: oreLavorate,
                  lavorazione: draft.dati_estratti.lavorazione ?? null,
                  materiali_usati: materiali,
                  materiali_count: materiali.length,
                  note: draft.dati_estratti.note ?? null,
                  trascrizione_preview: draft.trascrizione?.slice(0, 500) ?? null,
                  sicurezza_alert: draft.dati_estratti.sicurezza_alert ?? null,
                  incidenti_segnalati: draft.dati_estratti.incidenti_segnalati ?? [],
                  qualita_auto_valutazione: draft.dati_estratti.qualita_auto_valutazione ?? null,
                  origine: "rapportino_vocale_ai",
                },
              } as never)
              .then(({ error: eventError }) => {
                if (eventError) console.warn("[useRapportinoVocale] order event failed:", eventError);
              });

            if (campoRapportino?.id) {
              void notifyRapportinoPdf(campoRapportino.id, effectiveOrderId, queryClient);
            }

            queryClient.invalidateQueries({ queryKey: ["campo-rapportini-ordine", effectiveOrderId] });
            queryClient.invalidateQueries({ queryKey: ["campo-rapportini-da-compilare"] });
            queryClient.invalidateQueries({ queryKey: ["campo-rapportino-gia-oggi"] });
            queryClient.invalidateQueries({ queryKey: ["campo-lavoro-rapportino-oggi", effectiveOrderId] });
            queryClient.invalidateQueries({ queryKey: ["order-campo-rapportini", effectiveOrderId] });
            queryClient.invalidateQueries({ queryKey: ["order-events", profile.company_id, effectiveOrderId] });
            queryClient.invalidateQueries({ queryKey: ["order-diary-audit", effectiveOrderId, profile.company_id] });
          }
        } else {
          await enqueue("rapportino_vocale", payload);
        }
        setState((s) => ({ ...s, draft: null, error: null }));
        return true;
      } catch (err) {
        console.error("[useRapportinoVocale] confirm error", err);
        // Accodare ha senso SOLO se il salvataggio è fallito per la rete.
        // Prima qualunque errore (RLS, vincolo, payload malformato) finiva in
        // coda e la funzione tornava comunque `true`: l'utente vedeva
        // "Rapportino salvato" mentre in commessa non arrivava nulla, la coda
        // ritentava 5 volte, falliva e moriva in silenzio. Se è il server a
        // rifiutare, è un errore vero e va detto.
        if (isOnline()) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Impossibile salvare il rapportino",
          }));
          return false;
        }
        try {
          await enqueue("rapportino_vocale", payload);
          setState((s) => ({ ...s, draft: null, error: null }));
          return true;
        } catch {
          setState((s) => ({ ...s, error: "Impossibile salvare il rapportino" }));
          return false;
        }
      }
    },
    [
      user?.id,
      profile?.company_id,
      profile?.first_name,
      profile?.last_name,
      profile?.email,
      isSubappaltatore,
      queryClient,
      enqueue,
    ],
  );

  const resetDraft = useCallback(() => {
    setState({ uploading: false, transcribing: false, draft: null, error: null });
  }, []);

  return { ...state, processAudio, confirmRapportino, resetDraft };
}
