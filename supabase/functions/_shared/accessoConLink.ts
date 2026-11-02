/**
 * Accesso all'app di cantiere con un link (02/11/2026): regole comuni alle due funzioni.
 * L'operaio non ha un'email: il suo account ne ha una costruita dall'id del dipendente,
 * su un dominio senza posta. sendEmailUnified la scarta (vedi emailSuppression).
 */
import { DOMINIO_ACCESSO_CON_LINK } from "./emailSuppression.ts";

export const GIORNI_VALIDITA_LINK = 14;

export function emailDaLink(employeeId: string): string {
  return `operaio-${employeeId.toLowerCase()}@${DOMINIO_ACCESSO_CON_LINK}`;
}

export function eEmailDaLink(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${DOMINIO_ACCESSO_CON_LINK}`);
}

function esadecimale(byte: Uint8Array): string {
  return Array.from(byte, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generaTokenLink(): string {
  return esadecimale(crypto.getRandomValues(new Uint8Array(32)));
}

export function tokenValido(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
}

export async function impronta(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return esadecimale(new Uint8Array(digest));
}
