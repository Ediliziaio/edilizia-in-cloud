// Questa funzione non esiste più: è stata svuotata, non spostata.
//
// Cosa faceva, per chi la ritrova nei log:
//   • leggeva `.from("hr_dipendenti")` — una tabella che nel database non
//     c'è mai stata. Il client Supabase non solleva: mette l'errore in
//     `error` e lascia `data` a null. Il codice faceva `if (!dipendenti)
//     continue`, quindi saltava ogni azienda in silenzio.
//   • chiamava `silvio_tool_calcola_ore_mese_dipendente(p_company_id,
//     p_dipendente_id, p_periodo)` e `silvio_tool_genera_cedolino_dipendente`
//     con la stessa forma: le firme vere hanno cinque e sei parametri, con
//     nomi diversi. Anche fosse arrivata fin lì, avrebbe fallito.
//   • rispondeva comunque 200 con `{cedolini_creati: 0}` e nessun errore.
//     Nei log risultava riuscita. È il difetto peggiore dei tre.
//
// Nessuno la chiamava: nessun cron, nessuna riga in src/, nessun riferimento
// in config.toml. In produzione hr_cedolini aveva zero righe su 2.039
// timbrature registrate.
//
// Il lavoro che prometteva di fare adesso c'è davvero, sul database:
//   public.cedolino_ore_periodo(employee_id, anno, mese)  → le ore dalle timbrature
//   public.cedolino_calcola(employee_id, anno, mese)      → il conto CCNL
//   public.cedolino_genera(employee_id, anno, mese)       → scrive in hr_cedolini
//
// La copia deployata resta finché qualcuno non la elimina dal pannello
// Supabase: da qui non si può cancellare, si può solo sostituire. Nel
// frattempo risponde 410 invece di fingere di aver lavorato.

Deno.serve(() =>
  new Response(
    JSON.stringify({
      error: "hr-genera-cedolini-mese è stata rimossa",
      motivo:
        "interrogava una tabella inesistente (hr_dipendenti) e chiamava due RPC con firme sbagliate, " +
        "restituendo comunque 200 con zero cedolini",
      usare_invece: [
        "public.cedolino_ore_periodo(p_employee_id, p_anno, p_mese)",
        "public.cedolino_calcola(p_employee_id, p_anno, p_mese)",
        "public.cedolino_genera(p_employee_id, p_anno, p_mese, p_rigenera)",
      ],
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
