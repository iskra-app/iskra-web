import { scrub } from './logger';

/**
 * Короткая причина сбоя для мелкой строки под сообщением: `Имя: текст`, не длиннее 200 знаков.
 * Без токенов (`scrub`): строку показывают на экране, а экран фотографируют и пересылают.
 */
export function errorDetail(error: unknown): string {
  const text = scrub(error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '');
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}
