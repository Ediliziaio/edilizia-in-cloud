/**
 * I due conti che lo SDI rifà su ogni fattura e che lo schema XSD non vede:
 * 00423 (PrezzoTotale = quantità × prezzo, al netto dello sconto di riga) e 00422 (imponibile
 * del riepilogo = somma delle righe con la stessa aliquota e natura), più l'imposta del riepilogo.
 * Fino al centesimo per riga, fino a 1 euro per il riepilogo (tolleranza dello SDI).
 */
const n = (v: string | null | undefined) => Number(v ?? 0);

export function contiSdi(d: Document): string[] {
  const errori: string[] = [];
  const linee = Array.from(d.getElementsByTagName("DettaglioLinee"));
  const testo = (el: Element, tag: string) => el.getElementsByTagName(tag)[0]?.textContent ?? null;
  for (const l of linee) {
    const q = n(testo(l, "Quantita") ?? "1");
    let prezzo = n(testo(l, "PrezzoUnitario"));
    const sc = l.getElementsByTagName("ScontoMaggiorazione")[0];
    if (sc) {
      const perc = testo(sc, "Percentuale");
      const imp = testo(sc, "Importo");
      const segno = testo(sc, "Tipo") === "MG" ? 1 : -1;
      prezzo = perc ? prezzo * (1 + segno * n(perc) / 100) : prezzo + segno * n(imp);
    }
    const totale = n(testo(l, "PrezzoTotale"));
    if (Math.abs(prezzo * q - totale) > 0.01) errori.push(`00423 riga ${testo(l, "NumeroLinea")}: ${totale} ≠ ${(prezzo * q).toFixed(2)}`);
  }
  for (const r of Array.from(d.getElementsByTagName("DatiRiepilogo"))) {
    const al = n(testo(r, "AliquotaIVA"));
    const nat = testo(r, "Natura") ?? "";
    const somma = linee.filter((l) => n(testo(l, "AliquotaIVA")) === al && (testo(l, "Natura") ?? "") === nat)
      .reduce((s, l) => s + n(testo(l, "PrezzoTotale")), 0);
    const imponibile = n(testo(r, "ImponibileImporto"));
    const imposta = n(testo(r, "Imposta"));
    if (Math.abs(somma - imponibile) > 1) errori.push(`00422 aliquota ${al}: ${imponibile} ≠ ${somma.toFixed(2)}`);
    if (Math.abs(imponibile * al / 100 - imposta) > 0.01) errori.push(`imposta aliquota ${al}: ${imposta} ≠ ${(imponibile * al / 100).toFixed(2)}`);
  }
  return errori;
}
