import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { erroreVoce, idVoceAdottata, percorsoCapitolo } from "./catalogo";
import type { PrezzarioCapitolo, PrezzarioVoce } from "./tipi";

export type ListinoRegionale =
  | "rst"
  | "bgn"
  | "tet"
  | "clm"
  | "ele"
  | "idr"
  | "pav"
  | "pis";
export interface AdottaPrezzarioInput {
  fonteId: string;
  voci: PrezzarioVoce[];
  ricaricoPct: number;
  capitoloId?: string;
  capitoli?: PrezzarioCapitolo[];
}
export class ImportazioneParziale extends Error {
  constructor(
    public completate: string[],
    public inserite: number,
    message: string,
  ) {
    super(message);
  }
}

export function useAdottaPrezzarioListino(prefisso: ListinoRegionale) {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  // Le tabelle dei listini verticali non sono ancora nei tipi generati.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = () => supabase as any;
  return useMutation({
    mutationFn: async (input: AdottaPrezzarioInput) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!Number.isFinite(input.ricaricoPct) || input.ricaricoPct < 0)
        throw new Error("Ricarico non valido");
      for (const v of input.voci) {
        const errore = erroreVoce(v);
        if (v.fonte_id !== input.fonteId || errore)
          throw new Error(errore ?? "Voce di un'altra fonte");
      }
      if (!input.voci.length)
        return { inserite: 0, giaPresenti: 0, senzaUnita: 0 };
      const { data: fonte, error: fonteErr } = await sb()
        .from("prezzario_fonte")
        .select("nome,regione,anno")
        .eq("id", input.fonteId)
        .maybeSingle();
      if (fonteErr) throw new Error(fonteErr.message);
      if (!fonte) throw new Error("Prezziario non disponibile");
      const tabella = `${prefisso}_listino_voci`;
      const tabellaCapitoli = `${prefisso}_listino_capitoli`;
      // Gli import precedenti usavano id casuali: riconoscili anche per fonte e codice.
      const esistenti = await loadCatalogPages<{
        id: string;
        codice: string | null;
      }>((from, to) =>
        sb()
          .from(tabella)
          .select("id,codice")
          .eq("company_id", companyId)
          .eq("fonte", fonte.nome)
          .order("id")
          .range(from, to),
      );
      const codiciPresenti = new Set(
        esistenti.flatMap((v) => (v.codice ? [v.codice] : [])),
      );
      const daImportare = input.voci.filter(
        (v) => !v.codice || !codiciPresenti.has(v.codice),
      );
      const giaPresenti = input.voci.length - daImportare.length;
      if (!daImportare.length)
        return { inserite: 0, giaPresenti, senzaUnita: 0 };
      const mappa = new Map<string, string>();
      if (!input.capitoloId && input.capitoli?.length) {
        const esistenti = await loadCatalogPages<{ id: string; nome: string }>(
          (from, to) =>
            sb()
              .from(tabellaCapitoli)
              .select("id,nome")
              .eq("company_id", companyId)
              .order("id")
              .range(from, to),
        );
        const nomi = new Map(esistenti.map((c) => [c.nome, c.id]));
        const ids = [
          ...new Set(
            daImportare.flatMap((v) => (v.capitolo_id ? [v.capitolo_id] : [])),
          ),
        ];
        for (const [ordine, id] of ids.entries()) {
          const nome = `${fonte.regione} ${fonte.anno} · ${percorsoCapitolo(input.capitoli, id)}`;
          const idAziendale =
            nomi.get(nome) ??
            (await idVoceAdottata(companyId, tabellaCapitoli, id));
          if (!nomi.has(nome)) {
            const { error } = await sb()
              .from(tabellaCapitoli)
              .upsert(
                { id: idAziendale, company_id: companyId, nome, ordine },
                { onConflict: "id", ignoreDuplicates: true },
              );
            if (error) throw new Error(error.message);
          }
          mappa.set(id, idAziendale);
        }
      }
      const rows = await Promise.all(
        daImportare.map(async (v, ordine) => {
          const prezzo = Number(v.prezzo);
          const incidenza = v.incidenza_manodopera_pct ?? 0;
          const manodopera = Math.round(prezzo * incidenza * 100) / 100;
          return {
            id: await idVoceAdottata(companyId, tabella, v.id),
            company_id: companyId,
            capitolo_id:
              input.capitoloId ??
              (v.capitolo_id ? (mappa.get(v.capitolo_id) ?? null) : null),
            codice: v.codice,
            descrizione: v.descrizione,
            unita_misura: v.unita_misura,
            costo_materiali: Math.round((prezzo - manodopera) * 100) / 100,
            costo_manodopera: manodopera,
            ricarico_pct: input.ricaricoPct,
            prezzo_unitario:
              Math.round(prezzo * (1 + input.ricaricoPct / 100) * 100) / 100,
            note: `Fonte: ${fonte.nome}${v.codice ? ` (cod. ${v.codice})` : ""} · ${percorsoCapitolo(input.capitoli ?? [], v.capitolo_id)}${v.unita_misura_originale !== undefined ? ` · Unità indicata in importazione: ${v.unita_misura}` : ""}`,
            fonte: fonte.nome,
            ordine,
          };
        }),
      );
      let inserite = 0;
      const completate: string[] = [];
      for (let i = 0; i < rows.length; i += 100) {
        const { data, error } = await sb()
          .from(tabella)
          .upsert(rows.slice(i, i + 100), {
            onConflict: "id",
            ignoreDuplicates: true,
          })
          .select("id");
        if (error)
          throw new ImportazioneParziale(completate, inserite, error.message);
        inserite += data?.length ?? 0;
        completate.push(...daImportare.slice(i, i + 100).map((v) => v.id));
      }
      return {
        inserite,
        giaPresenti: giaPresenti + rows.length - inserite,
        senzaUnita: 0,
      };
    },
    onSettled: () => {
      void qc.invalidateQueries({
        queryKey: [`${prefisso}-listino-voci`, companyId],
      });
      void qc.invalidateQueries({
        queryKey: [`${prefisso}-listino-capitoli`, companyId],
      });
    },
  });
}
