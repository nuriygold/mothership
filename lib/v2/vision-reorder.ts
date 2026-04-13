export async function reorderPillars(orderedIds: string[]): Promise<void> {
  const res = await fetch('/api/v2/vision/pillars/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message ?? 'Failed to reorder pillars');
  }
}

export async function reorderItems(pillarId: string, orderedIds: string[]): Promise<void> {
  const res = await fetch('/api/v2/vision/items/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pillarId, orderedIds }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error?.message ?? 'Failed to reorder items');
  }
}
