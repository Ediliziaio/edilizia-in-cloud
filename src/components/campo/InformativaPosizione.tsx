/**
 * Informativa sulla posizione prima della timbratura (26/11/2026, piano campo completo, punto 4.2).
 *
 * Finché la persona non l'ha letta, l'app NON chiede la posizione: si timbra lo stesso, senza. Al tocco su
 * «Ho letto» la presa visione si registra (campo_informativa_accetta: chi, versione, quando) e da lì la
 * timbratura allega la posizione. Il testo è da far approvare a un legale: cambiandolo si alza VERSIONE e la
 * presa visione si chiede di nuovo. Sul telefono resta anche una copia locale, così senza rete non la richiede.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export const VERSIONE_INFORMATIVA_POSIZIONE = "1";
const TIPO = "posizione_timbratura";
type Rpc = "campo_informativa_letta" | "campo_informativa_accetta";
const db = () => supabase as unknown as {
  rpc: (n: Rpc, a: { p_tipo: string; p_versione: string }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const chiaveLocale = (uid: string) => `informativa-posizione:v${VERSIONE_INFORMATIVA_POSIZIONE}:${uid}`;
const lettaSulTelefono = (uid: string | undefined) => { try { return !!uid && localStorage.getItem(chiaveLocale(uid)) === "1"; } catch { return false; } };
const segnaSulTelefono = (uid: string) => { try { localStorage.setItem(chiaveLocale(uid), "1"); } catch { /* resta il server */ } };

/** `letta`: true/false; `null` finché non si sa (in quel momento la posizione non si chiede). */
export function useInformativaPosizione() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const chiave = ["campo-informativa-posizione", uid, VERSIONE_INFORMATIVA_POSIZIONE];
  const q = useQuery({
    queryKey: chiave,
    enabled: !!uid && !lettaSulTelefono(uid),
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await db().rpc("campo_informativa_letta", { p_tipo: TIPO, p_versione: VERSIONE_INFORMATIVA_POSIZIONE });
      if (error) throw error;
      if (data === true && uid) segnaSulTelefono(uid);
      return data === true;
    },
  });
  const accetta = useMutation({
    mutationFn: async () => {
      const { error } = await db().rpc("campo_informativa_accetta", { p_tipo: TIPO, p_versione: VERSIONE_INFORMATIVA_POSIZIONE });
      if (error) throw error;
    },
    onSuccess: () => { if (uid) segnaSulTelefono(uid); qc.setQueryData(chiave, true); },
  });
  const letta = lettaSulTelefono(uid) ? true : q.isSuccess ? q.data : null;
  return { letta, accetta };
}

export function InformativaPosizione({ onLetta }: { onLetta?: () => void }) {
  const t = useT();
  const { letta, accetta } = useInformativaPosizione();
  if (letta !== false) return null;
  return (
    <section aria-label={t("Come usiamo la tua posizione")} className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-sky-700" aria-hidden="true" />{t("Come usiamo la tua posizione")}</p>
      <p>{t("Quando timbri, l'app salva dove sei in quel momento: serve solo a sapere in quale cantiere o sede inizi e finisci. Non segue i tuoi spostamenti durante il giorno. La vede l'ufficio della tua azienda.")}</p>
      <p className="text-xs text-muted-foreground">{t("Finché non tocchi «Ho letto» la posizione non viene presa: puoi timbrare lo stesso.")}</p>
      <button type="button" disabled={accetta.isPending} onClick={() => accetta.mutate(undefined, { onSuccess: () => onLetta?.() })}
        className="min-h-11 rounded-xl bg-sky-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
        {t("Ho letto")}
      </button>
      {accetta.isError && <p role="alert" className="text-xs text-destructive">{t("Non sono riuscito a salvarlo. Riprova quando c'è rete.")}</p>}
    </section>
  );
}
