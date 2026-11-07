/**
 * Le memorie del browser che il PDF vero dei preventivi usa per non richiedere le stesse cose a ogni giro
 * (link firmati, immagini convertite, miniature, archivio delle condizioni). Ognuna si iscrive qui: le prove
 * le svuotano tutte prima di ogni test (src/test/setup.ts), così un test non vede quello che ha lasciato l'altro.
 */
const g = globalThis as typeof globalThis & { __memorieDaSvuotare?: Set<() => void> };

export function registraMemoria(svuota: () => void): void {
  (g.__memorieDaSvuotare ??= new Set()).add(svuota);
}

export function svuotaTutteLeMemorie(): void {
  g.__memorieDaSvuotare?.forEach((svuota) => svuota());
}
