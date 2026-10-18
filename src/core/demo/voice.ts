/**
 * Голосовое демо-сервера: звук и волна из одной огибающей — волна в событии честно
 * совпадает с тем, что слышно.
 */

/** Голосовое демо: четыре секунды «слогов» — тон, который то громче, то тише. */
const VOICE_SECONDS = 4;
const VOICE_RATE = 8000;

/** Громкость «речи» в момент `t` (с), 0…1 — по ней и звук, и волна в событии. */
function voiceEnvelope(t: number): number {
  const syllable = Math.max(0, Math.sin(t * Math.PI * 3.2));
  const phrase = t % 2 < 1.6 ? 1 : 0.1;
  return syllable * phrase * (0.55 + 0.45 * Math.sin(t * 1.7));
}

/** WAV, 8 кГц, 16 бит, моно: играет любой браузер, рисовать файл не надо. */
export function voiceWav(): Uint8Array {
  const samples = VOICE_SECONDS * VOICE_RATE;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_RATE, true);
  view.setUint32(28, VOICE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const t = i / VOICE_RATE;
    const tone = Math.sin(2 * Math.PI * 220 * t) * 0.6 + Math.sin(2 * Math.PI * 330 * t) * 0.4;
    view.setInt16(44 + i * 2, Math.round(tone * voiceEnvelope(t) * 0.5 * 32767), true);
  }
  return bytes;
}

/** Голосовое демо — для события: длительность, размер и волна 0…1024, как у настоящего. */
export function demoVoice(): { duration: number; size: number; waveform: number[] } {
  return {
    duration: VOICE_SECONDS * 1000,
    size: 44 + VOICE_SECONDS * VOICE_RATE * 2,
    waveform: Array.from({ length: 128 }, (_, i) => Math.round(voiceEnvelope(((i + 0.5) / 128) * VOICE_SECONDS) * 1024)),
  };
}
