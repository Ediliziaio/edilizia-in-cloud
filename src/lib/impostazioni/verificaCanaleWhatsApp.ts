/** Una preferenza non è una verifica del numero. Non creare timestamp dal client. */
export function verificaWhatsAppDaConservare(
  phone: string | null,
  previousPhone: string | null | undefined,
  previousVerification: string | null | undefined,
): string | null {
  const normalizza = (value: string | null | undefined) => (value ?? "").replace(/[\s()-]/g, "").replace(/^00/, "+");
  return phone && normalizza(phone) === normalizza(previousPhone) ? previousVerification ?? null : null;
}
