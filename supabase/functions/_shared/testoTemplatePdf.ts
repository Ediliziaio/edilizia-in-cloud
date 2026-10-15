/** Decodifica soltanto dopo aver tolto i tag: nessun HTML viene eseguito. */
export function normalizzaTestoTemplatePdf(value: unknown): string {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|h[1-6])>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (match, code: string) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
    })
    .replace(/&(nbsp|lt|gt|quot|apos|amp);/gi, (_, name: string) => ({ nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[name.toLowerCase()] ?? '')
    .trim();
}
