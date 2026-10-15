/** I costi non diventano mai automaticamente prezzi cliente. Le chiavi null
 * vengono ignorate dall'importatore anche in aggiornamento (non azzerano il listino).
 */
export function prezziPerImport<T extends object>(riga: T, importaVendita: boolean): T & Record<string, unknown> {
  return { ...riga, ...(!importaVendita ? { base_price: null, list_price: null, prezzo_orario: null } : {}) };
}
