/**
 * Move one item of a list to another index. Returns the same array when the
 * move goes past either end, so callers can skip the save on a no-op.
 *
 * Shared by drag-and-drop and the move-up / move-down buttons: dragging is
 * unreliable with a finger on a tablet, so every reorder also has buttons.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
        return list as T[];
    }
    const next = list.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}
