/**
 * «Открыть страницу человека» — из ленты, по лицу или имени у сообщения. Страница живёт в панели
 * «О чате», а панель — у оболочки: просьба ждёт здесь, пока панель её не заберёт.
 */
class ProfileRequest {
  /** Чей профиль и в каком чате. */
  pending = $state<{ roomId: string; userId: string } | null>(null);

  open(roomId: string, userId: string): void {
    this.pending = { roomId, userId };
  }

  take(roomId: string): string | undefined {
    const pending = this.pending;
    if (pending?.roomId !== roomId) return undefined;
    this.pending = null;
    return pending.userId;
  }
}

export const profileRequest = new ProfileRequest();
