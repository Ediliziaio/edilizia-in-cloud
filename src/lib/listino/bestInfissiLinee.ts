import piano from './bestInfissiRiordino.json';

export const BEST_INFISSI_ID = piano.companyId;
export const LINEE_BEST_INFISSI = piano.modelli;
export const GRUPPO_SERRAMENTI_BEST = piano.serramenti.id;

/** Identità esplicita della linea, prima e dopo il riordino. Mai dal prezzo o dal nome prodotto. */
export function lineaBestInfissi(famiglia: {
  company_id?: string; macrocategoria_id?: string | null; categoria_id?: string | null;
}): string | null {
  if (famiglia.company_id !== BEST_INFISSI_ID) return null;
  return LINEE_BEST_INFISSI.find(m =>
    m.macroId === famiglia.macrocategoria_id ||
    (famiglia.macrocategoria_id === GRUPPO_SERRAMENTI_BEST && m.categoriaId === famiglia.categoria_id)
  )?.nome ?? null;
}
