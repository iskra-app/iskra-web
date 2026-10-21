/**
 * Только то из Mediabunny, что нужно сжатию видео (`videoCompress.ts`), — им этот модуль и
 * грузится по требованию. Пространство имён самой библиотеки сборка не режет, и кусок вышел бы
 * в полтора раза тяжелее.
 */
export {
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  Quality,
  VideoSample,
  VideoSampleSource,
  WEBM,
  canEncodeAudio,
} from 'mediabunny';
export type { InputAudioTrack } from 'mediabunny';
