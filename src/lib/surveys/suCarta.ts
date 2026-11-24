/**
 * Il sopralluogo su carta (piano sopralluoghi, lotto 8): niente modulo, solo foto e PDF del foglio.
 * Usa il modello di sistema della registrazione rapida e `surveys.mode = 'express'`.
 */
export const MODELLO_SU_CARTA = "feca0825-6909-4208-9ed7-cd52070ea1d5";

export const eSuCarta = (s: { mode?: string | null } | null | undefined) => s?.mode === "express";

export const TIPI_FILE_CARTA = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Il tipo del file nel rilievo: il PDF è un documento, il resto una foto. */
export const tipoMediaCarta = (mime: string): "photo" | "document" => (mime === "application/pdf" ? "document" : "photo");

export function fileCartaValido(f: { type: string; size: number }, maxByte = 25 * 1024 * 1024): string | null {
  if (!TIPI_FILE_CARTA.includes(f.type)) return "Solo foto o PDF";
  if (f.size > maxByte) return "File oltre i 25 MB";
  return null;
}
