/**
 * Где живёт демо-сервер — отдельно от его мира: адрес нужен входу всегда, а сам сервер с
 * фикстурами грузится, только когда в демо и правда входят (`fetchFor`).
 */
export const DEMO_SERVER = 'demo.iskra.invalid';
export const DEMO_BASE_URL = `https://${DEMO_SERVER}`;
