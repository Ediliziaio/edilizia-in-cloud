/** These views enforce row visibility and field projection in PostgreSQL.
 * Routing is for compatibility; direct requests to the base tables are denied
 * independently of this client code. Aliases keep existing result shapes intact.
 */
const relations = ["orders", "order_installments", "order_employees", "campo_rapportini", "employees"];
// Lo spazio dopo la virgola fa parte dei select scritti a mano («id, order:orders!inner(…)»):
// senza accettarlo la riscrittura saltava e la lettura finiva sulla tabella grezza, che la
// regola restrittiva nega a chi non ha importi, costi e margini (25/11/2026: i cantieri
// sparivano dall’area operaio).
const embed = new RegExp(`((?:^|[,(])\\s*)(?:(\\w+):)?(${relations.join("|")})((?:![\\w]+)*)\\(`, "g");
export function protectedOrderSelect(select: string) {
  return select.replace(embed, (_match, before: string, alias: string | undefined, relation: string, hints: string) =>
    `${before}${alias ?? relation}:${relation}_visibili${hints}(`);
}
export function protectedOrderUrl(input: string) {
  if (!input.includes("/rest/v1/") || input.includes("/rest/v1/rpc/")) return input;
  const url = new URL(input);
  const relation = url.pathname.split("/rest/v1/")[1];
  if (relations.includes(relation)) url.pathname = `/rest/v1/${relation}_visibili`;
  const select = url.searchParams.get("select");
  if (select) url.searchParams.set("select", protectedOrderSelect(select));
  return url.toString();
}
