/**
 * Где снимок лежит в квадрате, из которого вырезается фото профиля или чата, и сам вырез —
 * `AvatarCrop` нативной, отдельно от окна, чтобы проверять тестом.
 *
 * Сначала снимок заполняет квадрат — короткая сторона от края до края, по центру, — потом его
 * можно приблизить до `MAX_ZOOM` и подвинуть, но никогда так, чтобы в квадрате было что-то,
 * кроме снимка. Уходит сам квадрат, не больше `MAX_SIDE` по стороне, свежим JPEG из одних
 * пикселей: у снимка из галереи — где и когда снято, а фото профиля — самое открытое, что есть
 * у человека.
 */

export const MAX_ZOOM = 4;
export const MAX_SIDE = 1024;

export interface Size {
  width: number;
  height: number;
}

export interface Offset {
  x: number;
  y: number;
}

export interface Crop {
  /** Размер снимка в пикселях, уже правильной стороной вверх. */
  image: Size;
  /** Сторона квадрата на экране. */
  side: number;
  /** 1 — снимок заполняет квадрат; больше — ближе. */
  zoom: number;
  /** Насколько центр снимка ушёл от центра квадрата, на экране. */
  offset: Offset;
}

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom));

/** Точек экрана на пиксель снимка при этом приближении. */
export function scaleOf({ image, side, zoom }: Crop): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  return (side / Math.min(image.width, image.height)) * zoom;
}

/** Снимок на экране. */
export function displayedSize(crop: Crop): Size {
  const scale = scaleOf(crop);
  return { width: crop.image.width * scale, height: crop.image.height * scale };
}

/** Сдвиг, удержанный так, чтобы снимок всегда закрывал квадрат. */
export function clampOffset(crop: Crop, offset: Offset = crop.offset): Offset {
  const shown = displayedSize(crop);
  const slackX = Math.max(0, (shown.width - crop.side) / 2);
  const slackY = Math.max(0, (shown.height - crop.side) / 2);
  return { x: Math.min(slackX, Math.max(-slackX, offset.x)), y: Math.min(slackY, Math.max(-slackY, offset.y)) };
}

/**
 * Новое приближение так, чтобы точка `(px, py)` (от центра квадрата) осталась под пальцем
 * или курсором — сдвиг сразу удержан.
 */
export function zoomAt(crop: Crop, nextZoom: number, px = 0, py = 0): Crop {
  const zoom = clampZoom(nextZoom);
  const k = zoom / crop.zoom;
  const next = { ...crop, zoom };
  return { ...next, offset: clampOffset(next, { x: px - (px - crop.offset.x) * k, y: py - (py - crop.offset.y) * k }) };
}

/** Квадрат в пикселях самого снимка, от верхнего левого угла. */
export function cropRect(crop: Crop): Offset & Size {
  const offset = clampOffset(crop);
  const scale = scaleOf(crop);
  const length = crop.side / scale;
  const cx = crop.image.width / 2 - offset.x / scale;
  const cy = crop.image.height / 2 - offset.y / scale;
  return { x: cx - length / 2, y: cy - length / 2, width: length, height: length };
}

/** Сторона того, что уйдёт: квадрат как есть, но не больше `MAX_SIDE`. */
export const outputSide = (crop: Crop) => Math.floor(Math.min(MAX_SIDE, cropRect(crop).width));

/** Вырезать квадрат из `source` в JPEG — канвас не переносит из файла ничего, кроме пикселей. */
export function renderCrop(source: CanvasImageSource, crop: Crop): Promise<Blob | null> {
  const rect = cropRect(crop);
  const out = outputSide(crop);
  if (out < 1) return Promise.resolve(null);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, out, out);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}
