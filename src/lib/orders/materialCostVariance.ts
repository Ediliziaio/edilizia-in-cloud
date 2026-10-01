/** Compare the same scope: all planned materials versus purchases plus
 * net warehouse consumption not already included in those purchases. */
export function materialCostVariance(planned: number, purchases: number, warehouse: number) {
  const recorded = Math.round((purchases + warehouse) * 100) / 100;
  const amount = Math.round((recorded - planned) * 100) / 100;
  return { recorded, amount, percent: planned > 0 ? amount / planned * 100 : 0 };
}
