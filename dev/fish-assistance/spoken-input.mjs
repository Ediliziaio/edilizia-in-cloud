const numbers = [
  "zero",
  "uno",
  "due",
  "tre",
  "quattro",
  "cinque",
  "sei",
  "sette",
  "otto",
  "nove",
  "dieci",
  "undici",
  "dodici",
  "tredici",
  "quattordici",
  "quindici",
  "sedici",
  "diciassette",
  "diciotto",
  "diciannove",
  "venti",
  "ventuno",
  "ventidue",
  "ventitre",
  "ventiquattro",
  "venticinque",
  "ventisei",
  "ventisette",
  "ventotto",
  "ventinove",
  "trenta",
  "trentuno",
];
const wordNumber = (value) =>
  /^\d+$/.test(value)
    ? Number(value)
    : numbers.indexOf(value.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
/** Small, explicit spoken forms only. Original transcript is retained for consent. */
export function localSpokenInput(phase, text) {
  let value = text.trim().replace(/[.!?]+$/, "");
  if (phase === "name")
    return value.replace(/^(?:mi chiamo|sono|il mio nome è)\s+/i, "");
  if (phase === "address")
    return value
      .replace(/^(?:abito in|l[’']indirizzo è|il mio indirizzo è)\s+/i, "")
      .replace(/\b(dieci|ventidue)\b/gi, (s) =>
        String(wordNumber(s.toLowerCase())),
      );
  if (phase === "day") {
    const match = value
      .toLowerCase()
      .match(
        /^(?:(?:il|per il)\s+)?(\d{1,2}|[a-zà]+) (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre) (\d{4})$/,
      );
    if (match) {
      const day = wordNumber(match[1]),
        month =
          [
            "gennaio",
            "febbraio",
            "marzo",
            "aprile",
            "maggio",
            "giugno",
            "luglio",
            "agosto",
            "settembre",
            "ottobre",
            "novembre",
            "dicembre",
          ].indexOf(match[2]) + 1;
      if (day > 0 && day <= 31)
        return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (phase === "slot") {
    const match = value
      .toLowerCase()
      .match(
        /^(?:(?:alle|le|per le)\s+)?(\d{1,2}|[a-z]+)(?:(?:[:.](\d{2}))| e (mezza|trenta|quindici|un quarto))?$/,
      );
    if (match) {
      const hour = wordNumber(match[1]),
        minute =
          match[2] ||
          (match[3]
            ? ["mezza", "trenta"].includes(match[3])
              ? "30"
              : "15"
            : "00");
      if (hour >= 0 && hour <= 23 && Number(minute) < 60)
        return `${String(hour).padStart(2, "0")}:${minute}`;
    }
  }
  return value;
}
