const DEMO_AZIENDA_2 = "d2000000-0000-4000-a000-000000000002";
export function consentiSimulazionePreventivoAi(dev: boolean, hostname: string, companyId: string | null | undefined): boolean {
  return dev && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname) && companyId === DEMO_AZIENDA_2;
}
