// Media privati: nel render con dati d'esempio non ci sono. Passthrough.
export function eRiferimentoNudo(): boolean { return false; }
export async function linkFileRiservati(urls: (string|null)[]): Promise<(string|null)[]> { return urls; }
export default { eRiferimentoNudo, linkFileRiservati };
