import { datiBollettaVuoti } from "../../supabase/functions/_shared/fvBollette";
const files = new Map<string, Blob>();
export const supabase = {
  storage: {
    from: () => ({
      upload: async (path: string, file: Blob) => {
        files.set(path, file);
        return { data: { path }, error: null };
      },
      download: async (path: string) => ({
        data: files.get(path) ?? null,
        error: files.has(path)
          ? null
          : Error("File non presente nella sessione locale"),
      }),
    }),
  },
  functions: {
    invoke: async (
      name: string,
      { body }: { body: Record<string, unknown> },
    ) => {
      if (name !== "fv-leggi-bolletta") {
        return {
          data: null,
          error: Error(
            "Mappa indisponibile: servizio remoto disattivato nel collaudo locale",
          ),
        };
      }
      const hash = String(body.path).split("/").pop()!.split(".")[0],
        dati = {
          ...datiBollettaVuoti(),
          intestatario: "Cliente dimostrativo",
          pod: "IT001E12345678",
          indirizzo_fornitura: "Via Esempio 1, Roma",
          consumo_annuo_kwh: 6000,
          consumo_periodo_kwh: 6000,
          periodo_dal: "2025-01-01",
          periodo_al: "2025-12-31",
          spesa_annua: 1800,
          totale_da_pagare: 1800,
          quote_fisse: 360,
          quote_consumi: 1440,
          pagine: { consumo_annuo_kwh: 2, spesa_annua: 2 },
          avvisi: [
            "Documento sintetico: la lettura è simulata soltanto in questa anteprima di collaudo.",
          ],
        };
      return {
        data: {
          documenti: [{
            id: hash + ":0",
            hash,
            nome: body.nome,
            path: body.path,
            mime: files.get(String(body.path))?.type ?? "application/pdf",
            dati,
            estratti: structuredClone(dati),
            confermato: false,
            pagine_totali: 2,
            pagine_non_lette: [],
            metodo: "ai",
          }],
        },
        error: null,
      };
    },
  },
};
export function captureVelocityEvent() {}
export function captureVelocityError() {}
export function setSentryUserContext() {}
export async function initSentry() {}
