import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "./usePermissions";
import { readInvokeError } from "@/lib/readInvokeError";
import {
  uuidVerbale,
  type FonteVerbaleTecnico,
  type ParametriVerbaleTecnico,
  type RicevutaVerbaleTecnico,
} from "../../supabase/functions/_shared/mezziVerbaliTecnici";
export interface RegistrazioneVerbaleMezzo {
  id: string;
  documento_id: string;
  manutenzione_id: string;
  fonte_impronta: string;
  data_intervento?: string | null;
  titolo: string;
  categoria: string;
  registrato_il: string;
  registrato_da: string;
  disponibile: boolean;
}
export function urlVerbaleTecnico(
  url: unknown,
  company: string,
  mezzo: string,
) {
  if (typeof url !== "string")
    throw new Error("Link originale non disponibile");
  const u = new URL(url);
  if (
    u.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin ||
    !decodeURIComponent(u.pathname).startsWith(
      `/storage/v1/object/sign/mezzi-documenti/${company}/${mezzo}/`,
    )
  )
    throw new Error("Link del verbale non pertinente alla macchina");
  return u.href;
}
export async function preparaVerbaleTecnico(
  company: string,
  mezzo: string,
  manutenzione: string,
): Promise<{ fonte: FonteVerbaleTecnico; url: string }> {
  const { data, error } = await supabase.functions.invoke("mezzi-verbali", {
    body: {
      azione: "prepara",
      company_id: company,
      mezzo_id: mezzo,
      manutenzione_id: manutenzione,
    },
  });
  if (error) throw new Error(await readInvokeError(error));
  const f = data?.fonte;
  if (
    data?.ok !== true ||
    !f ||
    f.company_id !== company ||
    f.mezzo_id !== mezzo ||
    f.manutenzione_id !== manutenzione ||
    !/^[0-9a-f]{64}$/i.test(f.impronta) ||
    typeof f.file_name !== "string"
  )
    throw new Error("Fonte dell’intervento non disponibile");
  return {
    fonte: {
      company_id: company,
      mezzo_id: mezzo,
      manutenzione_id: manutenzione,
      tipo: String(f.tipo),
      data: String(f.data),
      file_name: f.file_name,
      impronta: f.impronta,
    },
    url: urlVerbaleTecnico(data.url, company, mezzo),
  };
}
export async function leggiVerbaliTecniciMezzo(company: string, mezzo: string) {
  const { data, error } = await supabase.rpc(
    "mezzi_verbali_tecnici_elenco" as never,
    { _company: company, _mezzo: mezzo } as never,
  );
  if (error) throw new Error(error.message);
  const q = data as unknown as {
    company_id: string;
    mezzo_id: string;
    registrazioni: RegistrazioneVerbaleMezzo[];
  };
  if (
    !q ||
    q.company_id !== company ||
    q.mezzo_id !== mezzo ||
    !Array.isArray(q.registrazioni) ||
    q.registrazioni.length > 200 ||
    q.registrazioni.some(
      (r) =>
        !uuidVerbale(r.id) ||
        !uuidVerbale(r.documento_id) ||
        !uuidVerbale(r.manutenzione_id) ||
        !/^[0-9a-f]{64}$/i.test(r.fonte_impronta),
    )
  )
    throw new Error("Registro verbali non disponibile per questa macchina");
  return {
    company_id: company,
    mezzo_id: mezzo,
    registrazioni: q.registrazioni.map((r) => ({
      id: r.id,
      documento_id: r.documento_id,
      manutenzione_id: r.manutenzione_id,
      fonte_impronta: r.fonte_impronta,
      data_intervento:
        typeof r.data_intervento === "string" ? r.data_intervento : null,
      titolo: r.titolo,
      categoria: r.categoria,
      registrato_il: r.registrato_il,
      registrato_da: r.registrato_da,
      disponibile: r.disponibile === true,
    })),
  };
}
export function useVerbaliTecniciMezzo(company: string, mezzo: string) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["mezzi-verbali-tecnici", company, mezzo],
    enabled: !!company && !!mezzo && p.canViewMezzi,
    queryFn: () => leggiVerbaliTecniciMezzo(company, mezzo),
  });
}
export function usePreparaVerbaleTecnico(
  company: string,
  mezzo: string,
  manutenzione: string,
  enabled: boolean,
) {
  const p = usePermissions();
  return useQuery({
    queryKey: ["mezzi-verbale-fonte", company, mezzo, manutenzione],
    enabled:
      enabled && !!company && !!mezzo && !!manutenzione && p.canEditMezzi,
    queryFn: () => preparaVerbaleTecnico(company, mezzo, manutenzione),
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}
export function useRegistraVerbaleTecnico(company: string, mezzo: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      manutenzioneId: string;
      richiestaId: string;
      impronta: string;
      parametri: ParametriVerbaleTecnico;
    }) => {
      const { data, error } = await supabase.functions.invoke("mezzi-verbali", {
        body: {
          azione: "registra",
          company_id: company,
          mezzo_id: mezzo,
          manutenzione_id: input.manutenzioneId,
          richiesta_id: input.richiestaId,
          impronta: input.impronta,
          parametri: input.parametri,
        },
      });
      if (error) throw new Error(await readInvokeError(error));
      const r = data?.ricevuta as RicevutaVerbaleTecnico;
      if (
        data?.ok !== true ||
        !r ||
        r.id !== input.richiestaId ||
        r.company_id !== company ||
        r.mezzo_id !== mezzo ||
        r.manutenzione_id !== input.manutenzioneId ||
        !uuidVerbale(r.documento_id)
      )
        throw new Error(
          "Registrazione non confermata: riprova senza chiudere il dialogo",
        );
      return {
        id: r.id,
        documento_id: r.documento_id,
        company_id: r.company_id,
        mezzo_id: r.mezzo_id,
        manutenzione_id: r.manutenzione_id,
        titolo: r.titolo,
        categoria: r.categoria,
        registrato_il: r.registrato_il,
        disponibile: r.disponibile === true,
      };
    },
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: ["mezzi-verbali-tecnici", company, mezzo],
      });
      void qc.invalidateQueries({ queryKey: ["mezzi", "documenti", mezzo] });
      void qc.invalidateQueries({ queryKey: ["mezzi", "scadenze", company] });
      void qc.invalidateQueries({
        queryKey: ["mezzi", "documenti-registrati", company],
      });
      void qc.invalidateQueries({ queryKey: ["pos-documenti-mezzo"] });
    },
  });
}
