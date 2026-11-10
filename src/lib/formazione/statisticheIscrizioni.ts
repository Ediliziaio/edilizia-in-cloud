import type { PortalLearningEnrollment } from "@/lib/portalLearningApi";

export interface StatisticheIscrizioniCorso {
  enrolled: number;
  completion: number;
}

/** Proiezione per la vista: non modifica i metadati persistiti dei corsi. */
export function statisticheIscrizioni(
  courseIds: readonly string[],
  enrollments: readonly Pick<PortalLearningEnrollment, "courseId" | "progressPercent">[],
): Map<string, StatisticheIscrizioniCorso> {
  const sums = new Map(courseIds.map((id) => [id, { count: 0, progress: 0 }]));
  for (const enrollment of enrollments) {
    const row = sums.get(enrollment.courseId);
    if (!row) continue;
    row.count++;
    row.progress += enrollment.progressPercent || 0;
  }
  return new Map([...sums].map(([id, row]) => [id, {
    enrolled: row.count,
    completion: row.count ? Math.round(row.progress / row.count) : 0,
  }]));
}
