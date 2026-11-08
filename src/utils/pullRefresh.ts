export const PULL_THRESHOLD = 72;
/** Cancel horizontal drags and upward scrolling before arming a refresh. */
export function pullDistance(dx: number, dy: number): number {
  return dy > 0 && Math.abs(dx) < 30 && dy > Math.abs(dx) * 1.5
    ? Math.min(110, dy * 0.5) : 0;
}
