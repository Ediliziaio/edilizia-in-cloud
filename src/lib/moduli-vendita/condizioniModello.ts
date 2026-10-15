/** Intervention layouts must not erase terms explicitly configured by the company. */
export function ereditaCondizioniModello(base: {
  condizioni_legali_testo?: string | null;
  condizioni_legali_attivo?: boolean | null;
  modulo_recesso_attivo?: boolean | null;
}) {
  const text = base.condizioni_legali_testo?.trim() || null;
  return {
    condizioni_legali_testo: text,
    condizioni_legali_attivo: !!text && base.condizioni_legali_attivo !== false,
    modulo_recesso_attivo: base.modulo_recesso_attivo === true,
  };
}
