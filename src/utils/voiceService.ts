/** 语音识别与系统朗读；不连接第三方 TTS API。 */
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

type StatusCallback = (status: 'listening' | 'idle' | 'speaking' | 'error') => void;

class VoiceService {
  private onStatusChange: StatusCallback | null = null;
  private _isSpeaking = false;
  private _shouldListen = false;
  private _speakAborted = false;

  get isSpeaking() { return this._isSpeaking; }
  get shouldListen() { return this._shouldListen; }

  setStatusCallback(callback: StatusCallback) {
    this.onStatusChange = callback;
  }

  setShouldListen(value: boolean) {
    this._shouldListen = value;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return result.status === 'granted';
    } catch (error) {
      console.error('语音识别权限申请失败:', error);
      return false;
    }
  }

  async startRecognition(): Promise<void> {
    try {
      await ExpoSpeechRecognitionModule.start({
        lang: 'zh-CN',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      });
    } catch (error) {
      console.error('语音识别启动失败:', error);
      this.onStatusChange?.('error');
    }
  }

  stopRecognition(): void {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.warn('语音识别停止失败:', error);
    }
  }

  speak(text: string): Promise<void> {
    this._isSpeaking = true;
    this._speakAborted = false;
    this.onStatusChange?.('speaking');
    return new Promise((resolve, reject) => {
      try {
        Speech.stop();
        Speech.speak(text, {
          language: 'zh-CN',
          rate: 1,
          pitch: 1,
          onStart: () => {
            this._isSpeaking = true;
            this.onStatusChange?.('speaking');
          },
          onDone: () => {
            this._isSpeaking = false;
            resolve();
          },
          onStopped: () => {
            this._isSpeaking = false;
            resolve();
          },
          onError: error => {
            this._isSpeaking = false;
            reject(error);
          },
        });
      } catch (error) {
        this._isSpeaking = false;
        reject(error);
      }
    });
  }

  stopSpeaking(): void {
    this._speakAborted = true;
    this._isSpeaking = false;
    Speech.stop();
  }

  destroy(): void {
    this.stopSpeaking();
    this.onStatusChange = null;
  }
}

export const voiceService = new VoiceService();
