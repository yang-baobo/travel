import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { base64ToBytes, bytesToBase64, makeWavBytes } from './audioEncoding';

type BrowserAudioContext = AudioContext & { state: AudioContextState };

export class RealtimePcmPlayer {
  private readonly sampleRate: number;
  private browserContext: BrowserAudioContext | null = null;
  private nextPlayAt = 0;
  private browserSources = new Set<AudioBufferSourceNode>();
  private nativeChunks: Uint8Array[] = [];
  private nativeSound: Audio.Sound | null = null;

  constructor(sampleRate = Number(process.env.EXPO_PUBLIC_STEP_REALTIME_OUTPUT_SAMPLE_RATE || 24000)) {
    this.sampleRate = Number.isFinite(sampleRate) ? sampleRate : 24000;
  }

  async enqueue(base64Audio: string): Promise<void> {
    const bytes = base64ToBytes(base64Audio);
    if (Platform.OS !== 'web') {
      this.nativeChunks.push(bytes);
      return;
    }

    const AudioContextCtor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!this.browserContext) this.browserContext = new AudioContextCtor();
    const context = this.browserContext;
    if (!context) return;
    if (context.state === 'suspended') await context.resume();

    const sampleCount = Math.floor(bytes.length / 2);
    const audioBuffer = context.createBuffer(1, sampleCount, this.sampleRate);
    const output = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < sampleCount; i += 1) output[i] = view.getInt16(i * 2, true) / 32768;

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, this.nextPlayAt);
    source.start(startAt);
    this.nextPlayAt = startAt + audioBuffer.duration;
    this.browserSources.add(source);
    source.onended = () => this.browserSources.delete(source);
  }

  async complete(): Promise<void> {
    if (Platform.OS === 'web' || this.nativeChunks.length === 0) return;
    const total = this.nativeChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcm = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.nativeChunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.nativeChunks = [];

    const FileSystem = await import('expo-file-system/legacy');
    const uri = `${FileSystem.cacheDirectory}step-realtime-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(makeWavBytes(pcm, this.sampleRate)), {
      encoding: FileSystem.EncodingType.Base64,
    });
    await this.nativeSound?.unloadAsync().catch(() => undefined);
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    this.nativeSound = sound;
  }

  async interrupt(): Promise<void> {
    for (const source of this.browserSources) {
      try { source.stop(); } catch (_) {}
    }
    this.browserSources.clear();
    this.nextPlayAt = 0;
    this.nativeChunks = [];
    if (this.nativeSound) {
      await this.nativeSound.stopAsync().catch(() => undefined);
      await this.nativeSound.unloadAsync().catch(() => undefined);
      this.nativeSound = null;
    }
  }
}
