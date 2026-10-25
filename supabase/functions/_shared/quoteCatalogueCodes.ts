/** Literal variants for the optional terminal marker of Lombardia codes only.
 * Never prefix-match, infer a price, alter a technical code segment or cross editions.
 * Both candidates, if present, remain distinct references for explicit review. */
export function catalogueCodeVariants(code: string): string[] {
  const literal = code.trim();
  return /^LOM\d{3}\.[a-z0-9]+(?:\.[a-z0-9]+){5,9}$/i.test(literal)
    ? [literal, `${literal}.-`] : [literal];
}
