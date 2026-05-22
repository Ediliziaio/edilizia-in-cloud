import { clsx, type ClassValue } from "clsx";
import { twMerge, extendTailwindMerge } from "tailwind-merge";

// v9.2 cdn-bust 2026-05-22 20:10 — Cloudflare Pages CDN had stale 500 chunks
// for utils-CvZdsRjv.js and vendor-shared-Cmqm5Dkr.js with content-hash
// collision across builds. This module:
//  • reshapes the function body (changes utils chunk hash)
//  • imports `extendTailwindMerge` with a runtime side effect (changes
//    vendor-shared chunk hash by bringing extra exports into the chunk)
const mergeClasses = twMerge;

// Side-effect: register extendTailwindMerge on globalThis so Rolldown does NOT
// tree-shake it away. This guarantees vendor-shared bundles the symbol and
// produces a new content hash, avoiding the broken cache on Cloudflare CDN.
if (typeof globalThis !== "undefined") {
  (globalThis as Record<string, unknown>).__eic_tw_ext = extendTailwindMerge;
}

export function cn(...inputs: ClassValue[]): string {
  const joined = clsx(inputs);
  return mergeClasses(joined);
}
