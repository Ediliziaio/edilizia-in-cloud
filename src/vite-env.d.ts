/// <reference types="vite/client" />

/**
 * Data del commit da cui è stato costruito questo bundle (ISO 8601), messa da
 * `vite.config.ts`. L'app la confronta con `/versione-minima.json` per accorgersi di
 * essere vecchia. Nei test non c'è: si legge sempre con `typeof`, mai direttamente.
 */
declare const __EIC_BUILD__: string;
