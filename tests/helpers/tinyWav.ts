import { LIVE_WAV_SECONDS } from "./rateLimitGuard";

/** 16 kHz mono PCM WAV long enough for Groq's 0.01s minimum, short vs ASH. */
export function tinyWav(durationSec = LIVE_WAV_SECONDS): Buffer {
  const sampleRate = 16_000;
  const samples = Math.max(160, Math.floor(sampleRate * durationSec));
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}
