/**
 * «Открыть чат на этом сообщении» — из поиска над списком. Чат открывается адресом, а
 * сообщение ждёт здесь, пока его лента не появится на экране и не заберёт его
 * (`RoomView`). Адрес про сообщение не знает: в истории браузера — только чат.
 */
import { router } from '../../core/navigation/router.svelte.ts';

class RevealRequest {
  pending = $state<{ roomId: string; eventId: string } | null>(null);

  open(roomId: string, eventId: string): void {
    this.pending = { roomId, eventId };
    router.go({ name: 'room', roomId });
  }

  /** Сообщение, которого ждёт этот чат, — один раз. */
  take(roomId: string): string | undefined {
    const pending = this.pending;
    if (pending?.roomId !== roomId) return undefined;
    this.pending = null;
    return pending.eventId;
  }
}

export const revealRequest = new RevealRequest();
