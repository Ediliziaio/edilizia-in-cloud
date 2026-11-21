export type CampoHoursDraft = number | "";

export type RapportinoPresenza = {
  employee_id?: string;
  subappaltatore_id?: string;
  nome?: string;
  ore?: number | "";
};

type MembroRapportino = {
  key: string;
  employee_id?: string | null;
  subappaltatore_id?: string | null;
  nome: string;
};

export function stessaPresenza(salvata: RapportinoPresenza, membro: Pick<MembroRapportino, "employee_id" | "subappaltatore_id">) {
  return Boolean(
    (salvata.employee_id && salvata.employee_id === membro.employee_id)
    || (salvata.subappaltatore_id && salvata.subappaltatore_id === membro.subappaltatore_id),
  );
}

export function presenzeRapportino(squadra: MembroRapportino[], selezionate: Record<string, CampoHoursDraft>) {
  return squadra.filter(membro => membro.key in selezionate).map(membro => ({
    ...(membro.employee_id ? { employee_id: membro.employee_id } : {}),
    ...(membro.subappaltatore_id ? { subappaltatore_id: membro.subappaltatore_id } : {}),
    nome: membro.nome,
    ore: selezionate[membro.key],
  }));
}

export function correggiPresenzeRapportino(
  originali: RapportinoPresenza[] | null,
  squadra: MembroRapportino[],
  selezionate: Record<string, CampoHoursDraft>,
  modificate: Record<string, true>,
) {
  const personeModificate = squadra.filter(membro => membro.key in modificate);
  if (!personeModificate.length) return undefined;

  const presenzeOriginali = Array.isArray(originali) ? originali : [];
  const rimanenti = presenzeOriginali.filter(presenza =>
    !personeModificate.some(membro => stessaPresenza(presenza, membro)),
  );
  const corrette = presenzeRapportino(personeModificate, selezionate).map(presenza => {
    const originale = presenzeOriginali.find(p => stessaPresenza(p, presenza));
    return originale ? { ...originale, ore: presenza.ore } : presenza;
  });
  return [...rimanenti, ...corrette];
}

/** Current DB contract: ordinary hours + extra; presenze replaces author hours
 * for crew costing. Do not reinterpret historical payloads during UI cleanup. */
export function validateRapportinoHours(own: CampoHoursDraft, extra: number, presenze: Record<string, CampoHoursDraft>) {
  if (own === "" && Object.keys(presenze).length === 0) {
    throw new Error("Indica le ore lavorate su questo cantiere. Per sole foto o note, indica 0.");
  }
  const hours = own === "" ? 0 : own;
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(extra) || extra < 0 || hours + extra > 24) {
    throw new Error("Controlla le ore: ordinarie e straordinario insieme devono essere tra 0 e 24.");
  }
  if (own === "" && extra > 0) throw new Error("Indica anche le ore ordinarie prima dello straordinario.");
  for (const value of Object.values(presenze)) {
    if (value === "" || !Number.isFinite(value) || value <= 0 || value > 24) {
      throw new Error("Indica le ore effettive di ogni persona selezionata, oppure rimuovila dalle presenze.");
    }
  }
  return hours;
}
