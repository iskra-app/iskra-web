/**
 * Экран, который нужен не каждому и не сразу, — своим чанком: грузится, когда понадобился.
 *
 * `when(needed)` — компонент, если он уже пришёл; если нет и он нужен — начать загрузку, а до
 * её конца места нет (доли секунды: чанк лежит в кеше service worker'а). Пришедший остаётся
 * смонтированным, как и раньше, — окна закрываются своей анимацией, а не исчезают.
 * Не загрузился (сеть пропала посреди обновления) — следующий `when(true)` попробует снова.
 */
export class Lazy<T> {
  #component = $state.raw<T | undefined>();
  #loading: Promise<void> | undefined;
  readonly #load: () => Promise<{ default: T }>;

  constructor(load: () => Promise<{ default: T }>) {
    this.#load = load;
  }

  when(needed: boolean): T | undefined {
    if (needed && !this.#component) void this.preload();
    return this.#component;
  }

  /** Загрузить заранее — пока человек ещё не нажал, но вот-вот нажмёт. */
  preload(): Promise<void> {
    this.#loading ??= this.#load().then(
      (module) => {
        this.#component = module.default;
      },
      () => {
        this.#loading = undefined;
      },
    );
    return this.#loading;
  }
}
