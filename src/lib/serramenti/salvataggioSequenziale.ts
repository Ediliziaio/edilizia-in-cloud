/** The dependent change must not start before the parent write succeeds. */
export async function salvaPoiSincronizza(
  salva: () => Promise<unknown>,
  sincronizza: () => Promise<unknown> | undefined,
): Promise<void> {
  await salva();
  await sincronizza();
}
