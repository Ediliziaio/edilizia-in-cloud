# Fogli per la revisione dei madrelingua

Un foglio per lingua, da aprire con Excel o Numbers. Le colonne sono: italiano, traduzione, OK? (sì/no), correzione, note.
Per argentino (es-AR) e peruviano (es-PE) ci sono solo le righe che cambiano rispetto allo spagnolo.

Ordine consigliato:
1. **La checklist di sicurezza** (casco, scarpe, imbracatura, estintori…): va rivista per prima. Vedi `../scelte-da-confermare.md`.
2. **`glossario.csv`**: le parole e frasi brevi in tutte le lingue, una accanto all'altra. Se un termine è giusto qui, è
   giusto ovunque.
3. Il resto del foglio della propria lingua.

Le correzioni rientrano nel codice senza toccare altro: chi le riporta modifica il file
`src/lib/campo/lingua/dizionari/<lingua>.ts`.
I fogli si rigenerano con `bun scripts/campo/fogli-revisione-lingue.ts`.
