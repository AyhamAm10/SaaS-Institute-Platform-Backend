import type { Api } from './client';
import { eventually } from './client';

export interface InboxItem {
  id: number;
  type: string;
  title: string;
  body: string;
  studentId: number | null;
  read: boolean;
  data: Record<string, unknown>;
}

/** The whole inbox of a user (newest first). */
export async function inbox(user: Api): Promise<InboxItem[]> {
  return (await user.get('/notifications?page=1&limit=100')).data as InboxItem[];
}

/** Waits until the user has at least `count` notifications of `type` (events are written after the response). */
export async function waitFor(user: Api, type: string, count = 1): Promise<InboxItem[]> {
  const items = await eventually(() => inbox(user), (all) => all.filter((n) => n.type === type).length >= count);
  return items.filter((n) => n.type === type);
}

/** Settles background events, then returns the user's notifications of a type (to assert "none" or "exactly n"). */
export async function settled(user: Api, type?: string): Promise<InboxItem[]> {
  await new Promise((r) => setTimeout(r, 600));
  const all = await inbox(user);
  return type ? all.filter((n) => n.type === type) : all;
}
