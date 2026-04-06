/** Distanza in km tra due coordinate (Haversine) */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distanza totale in km percorsa da una serie di punti */
export function calcolaDistanzaTotaleKm(punti: Array<{ lat: number; lng: number }>): number {
  if (punti.length < 2) return 0;
  let totale = 0;
  for (let i = 1; i < punti.length; i++) {
    totale += haversineKm(punti[i - 1].lat, punti[i - 1].lng, punti[i].lat, punti[i].lng);
  }
  return Math.round(totale * 10) / 10;
}
