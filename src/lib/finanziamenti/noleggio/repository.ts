import { useContext } from "react";
import {ContestoNoleggio} from "./contesto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { validaTabellaNoleggio, type TabellaNoleggio } from "../../../../supabase/functions/_shared/noleggioOperativo";
export interface RepositoryNoleggio {
    elenca: (companyId: string) => Promise<TabellaNoleggio[]>;
    crea: (companyId: string, t: TabellaNoleggio, originali: File[]) => Promise<void>;
    stato: (companyId: string, id: string, attiva: boolean) => Promise<void>;
}
// La versione economica è immutabile: solo l’attivazione cambia, i preventivi congelano una copia.
export const repositorySupabase: RepositoryNoleggio = {
    async elenca(companyId) { const { data, error } = await supabase.from("eic_tabelle_noleggio" as never).select("id,company_id,contenuto,attiva").eq("company_id", companyId).order("created_at", { ascending: false }); if (error)
        throw new Error("Non riesco a leggere le tabelle di noleggio. Riprova o contatta l’amministratore."); return ((data ?? []) as Array<{
        id: string;
        company_id: string;
        contenuto: unknown;
        attiva: boolean;
    }>).map(r => { const t = validaTabellaNoleggio(r.contenuto); if (t.companyId !== companyId || r.company_id !== companyId || t.id !== r.id)
        throw new Error("Tabella non coerente con l’azienda selezionata."); return { ...t, attiva: r.attiva }; }); },
    async crea(companyId, raw, originali) { const t = validaTabellaNoleggio(raw); if (t.companyId !== companyId)
        throw new Error("Azienda della tabella non valida."); if (originali.length > 2 || originali.some(f => f.size > 12 * 1024 * 1024 || !/\.(csv|xlsx|pdf)$/i.test(f.name)))
        throw new Error("Allegati non validi: massimo due file CSV, XLSX o PDF da 12 MB."); const paths: string[] = []; try {
        for (const [index, f] of originali.entries()) {
            const path = `${companyId}/noleggio/${t.id}/originale-${index}.${f.name.split('.').at(-1)?.toLowerCase()}`;
            const { error } = await supabase.storage.from("finanziamenti-tabelle").upload(path, f, { upsert: false });
            if (error)
                throw error;
            paths.push(path);
        }
        const { error } = await supabase.from("eic_tabelle_noleggio" as never).insert({ id: t.id, company_id: companyId, contenuto: t, attiva: t.attiva, originali_paths: paths } as never);
        if (error)
            throw error;
    }
    catch (e) {
        if (paths.length)
            await supabase.storage.from("finanziamenti-tabelle").remove(paths);
        throw new Error("Salvataggio della tabella non riuscito. Nessuna nuova versione è stata attivata.", { cause: e });
    } },
    async stato(companyId, id, attiva) { const { error } = await supabase.from("eic_tabelle_noleggio" as never).update({ attiva } as never).eq("id", id).eq("company_id", companyId).select("id").single(); if (error)
        throw new Error("Non riesco ad aggiornare lo stato della tabella."); }
};
export function useArchivioNoleggio() {
    const override = useContext(ContestoNoleggio), effettiva = useEffectiveCompanyId(), companyId = override?.companyId ?? effettiva, repository = override?.repository ?? repositorySupabase, qc = useQueryClient(), key = ["finanziamenti", "noleggio", companyId];
    const query = useQuery({ queryKey: key, enabled: !!companyId, queryFn: () => repository.elenca(companyId!) });
    const salva = useMutation({ mutationFn: async (p: {
            tabella: TabellaNoleggio;
            originali: File[];
        }) => { if (!companyId)
            throw new Error("Seleziona un’azienda."); await repository.crea(companyId, p.tabella, p.originali); }, onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
    const stato = useMutation({ mutationFn: async (p: {
            id: string;
            attiva: boolean;
        }) => { if (!companyId)
            throw new Error("Seleziona un’azienda."); await repository.stato(companyId, p.id, p.attiva); }, onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
    return { companyId, ...query, salva, stato };
}
