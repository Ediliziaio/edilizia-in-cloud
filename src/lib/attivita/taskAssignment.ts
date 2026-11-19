interface Office { id: string; membri: string[] }

/** An empty assignee is the area inbox; individual tasks default to their author. */
export function taskAssignment({ officeId, assigneeId, userId, offices, canAssignOthers }: {
  officeId?: string;
  assigneeId?: string;
  userId: string;
  offices: readonly Office[];
  canAssignOthers: boolean;
}) {
  const office = officeId ? offices.find(o => o.id === officeId) : undefined;
  if (officeId && !office) throw new Error("L’area selezionata non è più disponibile. Scegli un’altra area.");
  if (assigneeId && !canAssignOthers && assigneeId !== userId) throw new Error("Non puoi assegnare l’attività a questa persona.");
  if (office && assigneeId && !office.membri.includes(assigneeId)) throw new Error("La persona selezionata non appartiene all’area. Scegli un membro dell’area.");
  return { ufficio_id: officeId || null, assigned_to: office ? assigneeId || null : assigneeId || userId };
}
