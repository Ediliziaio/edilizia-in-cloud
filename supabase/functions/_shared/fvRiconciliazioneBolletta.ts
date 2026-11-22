const valido = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const centesimi = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Confronta lo stesso consumo annuo, senza attribuire lo scarto a voci mai lette. */
export function riconciliaBollettaFv(input: {
  consumo: number | null | undefined;
  costoKwh: number | null | undefined;
  fissi: number | null | undefined;
  spesaLetta: number | null | undefined;
}) {
  const energia = valido(input.consumo) && valido(input.costoKwh)
    ? centesimi(input.consumo * input.costoKwh) : null;
  const fissi = valido(input.fissi) ? centesimi(input.fissi) : null;
  const spesaLetta = valido(input.spesaLetta) ? centesimi(input.spesaLetta) : null;
  const modellata = energia != null && fissi != null ? centesimi(energia + fissi) : null;
  const differenza = spesaLetta != null && modellata != null ? centesimi(spesaLetta - modellata) : null;
  return { energia, fissi, spesaLetta, modellata, differenza,
    stato: differenza == null ? "incompleta" as const : Math.abs(differenza) <= .02
      ? "coerente" as const : differenza > 0 ? "residuo" as const : "superiore" as const };
}
