import { it, expect } from "vitest";
import { normalizeHrNumbers } from "@/lib/personale/profileNumbers";
import { giornataDaVerificare } from "@/lib/personale/presenze";
it("does not turn unknown balances or hours into invented entitlements",()=>{
 expect(normalizeHrNumbers({ferie_residue:null,permessi_residui_ore:"",ore_giornaliere:NaN})).toEqual({ferie_residue:null,permessi_residui_ore:null,ore_giornaliere:null});
});
it("preserves negative balances instead of resetting them to 26 days or 32 hours",()=>{
 expect(normalizeHrNumbers({ferie_residue:-2,permessi_residui_ore:-3,rol_residuo_ore:0})).toEqual({ferie_residue:-2,permessi_residui_ore:-3,rol_residuo_ore:0});
});
it("validates hours and preserves unspecified numeric fields",()=>{
 expect(normalizeHrNumbers({nome:"Test"})).toEqual({});
 expect(()=>normalizeHrNumbers({ore_giornaliere:25})).toThrow();
 expect(()=>normalizeHrNumbers({ore_settimanali:-1})).toThrow();
 expect(normalizeHrNumbers({ore_giornaliere:"7.5"})).toEqual({ore_giornaliere:7.5});
});
it("distinguishes today's ongoing shift from a past unpaired punch",()=>{
 const row={anomalia:false,data:"2026-10-26",prima_entrata:"08:00",ultima_uscita:null as string|null};
 expect(giornataDaVerificare(row,"2026-10-26")).toBe(false);
 expect(giornataDaVerificare({...row,data:"2026-10-25"},"2026-10-26")).toBe(true);
});
