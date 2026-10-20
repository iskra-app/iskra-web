/**
 * Новые входы в аккаунт — «Новый вход. Это вы?» Telegram, `NewSignInsStore` нативной.
 *
 * События «кто-то вошёл в ваш аккаунт» в Matrix нет: новый сеанс просто есть в списке, когда его
 * читают. Поэтому список читается (при запуске и при каждом возвращении на вкладку) и
 * сравнивается с теми, что это устройство уже видело. Первый взгляд записывает всё и ни о чём не
 * спрашивает: сеансы, что были до этого, — не новость.
 *
 * Сеанс узнаётся по ID **и** имени: клиент сам выбирает `device_id` при входе, и вход с уже
 * существующим ID заменяет тот сеанс — кто знает пароль и повторил известный ID, иначе вошёл бы
 * без вопроса. Переименованный сеанс спросят снова — в эту сторону ошибаться правильно.
 */
import type { AccountDevice } from './userSession.svelte.ts';
import { vault } from '../storage/vault';

const fingerprint = (device: AccountDevice) => `${device.id}\u001f${device.name}`;

export class NewSignIns {
  /** Новые — по последней активности, свежие первыми. */
  sessions = $state.raw<AccountDevice[]>([]);

  private checking = false;
  /**
   * Чтение и запись памяти — по очереди: проверка, начатая до «Да, это я», иначе записала бы
   * свой устаревший список поверх только что подтверждённого.
   */
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => {});
    return next;
  }

  constructor(
    private readonly userId: string,
    private readonly list: () => Promise<AccountDevice[]>,
  ) {}

  /** Перечитать. Молча: не пришёл список — полоса ни к чему, «Безопасность» скажет как следует. */
  async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const devices = await this.list();
      const listed = devices.map(fingerprint);
      this.sessions = await this.serial(async () => {
        const known = await vault.knownDevices(this.userId);
        if (!known) {
          await vault.setKnownDevices(this.userId, listed);
          return [];
        }
        // Ушедший сеанс забывается: вернись он с тем же ID — это уже новый вход.
        const stillThere = known.filter((k) => listed.includes(k));
        if (stillThere.length !== known.length) await vault.setKnownDevices(this.userId, stillThere);
        return devices.filter((d) => !d.current && !stillThere.includes(fingerprint(d)));
      });
    } catch {
      // Тихо — см. выше.
    } finally {
      this.checking = false;
    }
  }

  /** «Да, это я» — записать, и полоса уходит. */
  async confirm(device: AccountDevice): Promise<void> {
    this.sessions = this.sessions.filter((d) => d.id !== device.id);
    const mark = fingerprint(device);
    await this.serial(async () => {
      const known = (await vault.knownDevices(this.userId)) ?? [];
      if (!known.includes(mark)) await vault.setKnownDevices(this.userId, [...known, mark]);
    });
  }
}
