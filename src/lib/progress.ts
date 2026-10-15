/** Percentage of recorded items that are done, or null when nothing has been recorded yet. */
export function percent(done: number, total: number): number | null {
  return total === 0 ? null : Math.round((done / total) * 100);
}

export function isOverdue(dueDate: Date | null, completed: boolean, now = new Date()): boolean {
  return !!dueDate && !completed && dueDate.getTime() < now.getTime();
}
