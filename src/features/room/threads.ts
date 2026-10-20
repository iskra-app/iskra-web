/**
 * Где треды — `ThreadSettings` нативной. В большом чате тред не даёт одному разговору утопить
 * остальные; среди дюжины друзей он чаще прячет ответ, который хотели увидеть. Личный чат —
 * никогда: тред там — второй разговор с тем же человеком (это решает вызывающий).
 */
import { preferences } from '../app/preferences.svelte.ts';

/** «Большой чат» — больше стольких человек. */
export const LARGE_ROOM = 100;

export function threadsShownIn(memberCount: number): boolean {
  switch (preferences.threadsShown) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'inLargeRooms':
      return memberCount > LARGE_ROOM;
  }
}
