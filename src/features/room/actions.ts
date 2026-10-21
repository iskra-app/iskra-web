/**
 * Что можно сделать с сообщением — один объект на ленту, а не десяток колбэков в каждой
 * строке. Собирает его `RoomView`: ответ и правка идут в композер, остальное — в ленту.
 */
import type { Message } from '../../core/timeline/message';

export interface MessageActions {
  canReply: boolean;
  canPin: boolean;
  reply(message: Message): void;
  edit(message: Message): void;
  react(message: Message, key: string): void;
  vote(message: Message, answerIds: string[]): void;
  /** «Переслать в…» с этим сообщением. */
  forward(message: Message): void;
  /** «Выбрать»: режим выбора нескольких, с этим уже отмеченным. */
  select(message: Message): void;
  /** Спросить «завершить опрос?» — и завершить. */
  endPoll(message: Message): void;
  pin(message: Message): void;
  unpin(message: Message): void;
  /** Спросить «удалить у всех?» — и удалить. */
  remove(message: Message): void;
  retry(key: string): void;
  /** «Отправить всё равно» — только для `identityChanged` и `insecureDevices`. */
  sendAnyway(key: string): void;
  discard(key: string): void;
  /** Просмотрщик — с этого фото или видео. */
  openMedia(message: Message): void;
  /** «N реакций» — кто что поставил. Только в группе: в личном пилюля и так говорит, кто. */
  showsReactors: boolean;
  reactors(message: Message): void;
  /** «Просмотреть JSON» (бета-функции) — окно с событием; нет — пункта в меню нет. */
  viewSource?: (message: Message) => void;
  /** «Пожаловаться» — окно с необязательной причиной. */
  report(message: Message): void;
  /**
   * Стикер из сообщения — в свой набор: `true` — уже там («Убрать»), `false` — нет («Добавить»),
   * `undefined` — не стикер или зашифрованный, такой в набор не положить.
   */
  stickerIsMine(message: Message): boolean | undefined;
  toggleSticker(message: Message): void;
  /**
   * Открыть тред под этим сообщением — «Ответить в треде» и строка «N ответов». Нет — тредов
   * здесь не бывает: личный чат, настройки, или это уже лента треда.
   */
  openThread?: (message: Message) => void;
  /** Страница человека — по лицу или имени у сообщения. Нет — лицо не нажимается (подглядывание). */
  openProfile?: (userId: string) => void;
  /** Меню: у точки — для мыши, листом — для пальца. */
  openMenu(message: Message, at: { x: number; y: number }, sheet: boolean): void;
}

/** Полоса над полем композера: на что отвечаем или что правим. */
export type ComposerContext = { kind: 'reply' | 'edit'; message: Message } | null;
