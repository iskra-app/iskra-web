/**
 * Логгер для `createClient({ logger })`.
 *
 * Ничего не логируется: ни текст сообщений, ни токены, ни URL обратного вызова OAuth.
 * На десктопе DevTools открыты чаще, чем кажется, — консоль тоже лог. Поэтому
 * `trace`/`debug`/`info` молчат, а `warn`/`error` уходят в консоль — SDK пишет туда
 * сбои, а не тела запросов (в URL он сам заменяет параметры на `xxx`).
 *
 * Но «сам заменяет» — обещание чужого кода, а в тексте ошибки бывает что угодно, что прислал
 * сервер. Поэтому всё, что уходит в консоль, — строками и через `scrub`: токены Matrix и MAS,
 * `Bearer …`, `access_token=`, `code=`, `loginToken=` становятся `xxx`. Объекты — не целиком,
 * а именем и текстом ошибки.
 */
import type { Logger } from 'matrix-js-sdk/lib/logger';

const silent = () => {};

const SECRETS: Array<[RegExp, string]> = [
  [/\b(syt|syr|mat|mar|mct|mcr)_[A-Za-z0-9_-]+/g, '$1_xxx'],
  [/\bBearer\s+[^\s"',]+/gi, 'Bearer xxx'],
  [/([?&#](?:access_token|refresh_token|code|state|loginToken|code_verifier)=)[^&#\s"']+/gi, '$1xxx'],
  [/("(?:access_token|refresh_token|password|code_verifier)"\s*:\s*")[^"]*"/gi, '$1xxx"'],
];

/** Строка без того, что стоит как токен. */
export function scrub(text: string): string {
  return SECRETS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

function describe(value: unknown): string {
  if (typeof value === 'string') return scrub(value);
  if (value instanceof Error) return scrub(`${value.name}: ${value.message}`);
  if (value === null || typeof value !== 'object') return String(value);
  return '[object]';
}

export function quietLogger(): Logger {
  const logger: Logger = {
    trace: silent,
    debug: silent,
    info: silent,
    warn: (...msg: unknown[]) => console.warn(msg.map(describe).join(' ')),
    error: (...msg: unknown[]) => console.error(msg.map(describe).join(' ')),
    getChild: () => logger,
  };
  return logger;
}
