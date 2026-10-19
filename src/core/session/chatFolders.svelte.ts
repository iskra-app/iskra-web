/**
 * Папки аккаунта — `ChatFolders` нативной Искры: читаются из данных аккаунта и пишутся туда
 * целиком на каждую перемену. Папок немного, меняют их редко, а слияние правок двух
 * устройств не стоит того, чего стоило бы сделать его верно: побеждает последняя запись,
 * как у Telegram.
 */
import { ClientEvent, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import { decodeFolders, encodeFolders, FOLDER_LIMIT, FOLDERS_TYPE, moved, type ChatFolder } from '../rooms/folders';

export class ChatFolders {
  /** Живой: папка, заведённая на другом устройстве, приходит синхронизацией. */
  folders = $state.raw<ChatFolder[]>([]);
  /** Не записалось — список на экране возвращён, а это — повод сказать. */
  failed = $state(false);

  private readonly client: MatrixClient;
  private readonly off: () => void;

  constructor(client: MatrixClient) {
    this.client = client;
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() === FOLDERS_TYPE) this.folders = decodeFolders(event.getContent());
    };
    client.on(ClientEvent.AccountData, onAccountData);
    this.off = () => client.off(ClientEvent.AccountData, onAccountData);
    this.folders = decodeFolders(client.getAccountData(FOLDERS_TYPE as never)?.getContent());
  }

  get isFull(): boolean {
    return this.folders.length >= FOLDER_LIMIT;
  }

  /** Новую — в конец (если есть место), существующую — на её место. */
  save(folder: ChatFolder): Promise<boolean> {
    const at = this.folders.findIndex((f) => f.id === folder.id);
    if (at < 0 && this.isFull) return Promise.resolve(false);
    const next = at < 0 ? [...this.folders, folder] : this.folders.map((f) => (f.id === folder.id ? folder : f));
    return this.write(next);
  }

  delete(id: string): Promise<boolean> {
    return this.write(this.folders.filter((f) => f.id !== id));
  }

  move(id: string, offset: number): Promise<boolean> {
    return this.write(moved(this.folders, id, offset));
  }

  dismissFailure(): void {
    this.failed = false;
  }

  destroy(): void {
    this.off();
  }

  private async write(next: ChatFolder[]): Promise<boolean> {
    const previous = this.folders;
    this.folders = next;
    this.failed = false;
    try {
      await this.client.setAccountData(FOLDERS_TYPE as never, encodeFolders(next) as never);
      return true;
    } catch {
      this.folders = previous;
      this.failed = true;
      return false;
    }
  }
}
