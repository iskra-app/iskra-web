/**
 * Маркер прочитанного, сдвинутый этим устройством, — пока синхронизация не принесла его
 * обратно. Без этого чат, открытый снова сразу после ухода, прочёл бы из `m.fully_read`
 * прежний маркер и показал бы полосу над тем, что только что дочитали. Как local echo
 * квитанций у SDK.
 */
const moved = new Map<string, string>();

export function rememberMovedMarker(roomId: string, eventId: string): void {
  moved.set(roomId, eventId);
}

/** Маркер комнаты: сдвинутый здесь, пока сервер не сказал того же, иначе — его. */
export function currentMarker(roomId: string, fromServer: string | null): string | null {
  const local = moved.get(roomId);
  if (local === undefined) return fromServer;
  if (local === fromServer) moved.delete(roomId);
  return local;
}

/** Выход из аккаунта: чужому сеансу чужие маркеры ни к чему. */
export function forgetMovedMarkers(): void {
  moved.clear();
}
