/** Un account mai utilizzato diventa inattivo soltanto dopo la soglia dalla creazione. */
export function isCompanyMemberInactive(
  member: { last_login_at?: string | null; created_at?: string | null },
  daysThreshold = 30,
  now = new Date(),
): boolean {
  const reference = member.last_login_at ?? member.created_at;
  if (!reference) return false;
  const timestamp = new Date(reference).getTime();
  return (
    Number.isFinite(timestamp) &&
    now.getTime() - timestamp > daysThreshold * 86_400_000
  );
}
export function countCompanyLoginAccounts(
  team:
    | {
        admins?: { id: string }[];
        staff?: { id: string }[];
        salespeople?: { user_id?: string | null }[];
        employees?: { user_id?: string | null }[];
      }
    | null
    | undefined,
): number {
  return new Set(
    [
      ...(team?.admins?.map((member) => member.id) ?? []),
      ...(team?.staff?.map((member) => member.id) ?? []),
      ...(team?.salespeople?.map((member) => member.user_id) ?? []),
      ...(team?.employees?.map((member) => member.user_id) ?? []),
    ].filter(Boolean),
  ).size;
}
