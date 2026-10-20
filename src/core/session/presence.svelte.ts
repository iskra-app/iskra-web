/**
 * Где собеседник — то, что сервер готов о нём сказать (`Presence` нативной).
 *
 * Три состояния Matrix и одно число, которое важно: когда он последний раз что-то делал.
 * «был(а) 5 мин назад» строится из него и ни из чего больше — никогда из последнего сообщения
 * в переписке: тот, кто всё утро читал молча, не «был(а) в 09:14».
 *
 * Сервер с выключенным присутствием (matrix.org среди них) отвечает про всех `offline` без
 * времени — и правильно нарисовать на это *ничего*, а не «не в сети». Отказ (присутствие
 * выключено, нет общей комнаты) — навсегда, пока открыт чат: опрос останавливается. Сбой сети —
 * последний ответ остаётся: «был(а) 5 мин назад», ненадолго устаревшее, лучше мигающего.
 */
import { SetPresence } from 'matrix-js-sdk/lib/sync';
import type { MatrixClient } from 'matrix-js-sdk';

export interface Presence {
  /** Сейчас — по словам сервера (`currently_active`) или по состоянию `online`. */
  online: boolean;
  /** Когда последний раз был активен; нет — сервер не сказал. */
  lastActive?: number;
}

/** Как часто открытый чат спрашивает снова: присутствие — факт о минутах. */
export const PRESENCE_INTERVAL_MS = 60_000;

/** Ответ `GET /presence/{userId}/status` → то, что стоит показать, или ничего. */
export function presenceFrom(status: { presence?: string; last_active_ago?: number; currently_active?: boolean }, now = Date.now()): Presence | null {
  const online = status.currently_active === true || status.presence === 'online';
  const lastActive = typeof status.last_active_ago === 'number' ? now - status.last_active_ago : undefined;
  if (!online && lastActive === undefined) return null;
  return { online, ...(lastActive !== undefined ? { lastActive } : {}) };
}

/** Присутствие одного собеседника, пока открыт его чат. Тот, кто создал, — тот и `destroy()`. */
export class PresenceWatch {
  presence = $state<Presence | null>(null);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly client: MatrixClient,
    private readonly userId: string,
  ) {
    void this.ask();
  }

  destroy(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private async ask(): Promise<void> {
    try {
      const status = await this.client.getPresence(this.userId);
      if (this.stopped) return;
      this.presence = presenceFrom(status);
    } catch (error) {
      if (this.stopped) return;
      const code = (error as { httpStatus?: number }).httpStatus;
      // Отказ — молчать до конца визита; сбой сети — оставить, что было, и спросить позже.
      if (code !== undefined && code >= 400 && code < 500) {
        this.presence = null;
        return;
      }
    }
    this.timer = setTimeout(() => void this.ask(), PRESENCE_INTERVAL_MS);
  }
}

/**
 * Сказать серверу, в сети ли аккаунт, — или, если время захода скрыто, что нет, что бы он ни
 * делал. И в синхронизации (`set_presence`: иначе сервер считает её «в сети»), и отдельным
 * запросом — чтобы сразу. Сервер с выключенным присутствием отвечает отказом; скрывать там
 * нечего, ответ не смотрим.
 */
export async function applyPresence(client: MatrixClient, hidden: boolean): Promise<void> {
  await client.setSyncPresence(hidden ? SetPresence.Offline : SetPresence.Online).catch(() => {});
  await client.setPresence({ presence: hidden ? 'offline' : 'online' }).catch(() => {});
}
