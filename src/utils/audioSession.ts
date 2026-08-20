/**
 * iOS 音频会话管理
 * 提供多种音频会话配置模式
 */

import { NativeModules, Platform } from 'react-native';

const { AudioSessionManager } = NativeModules;

/**
 * 配置音频会话为 voiceChat 模式（启用 AEC 回声消除）
 * 这是关键：启用iOS系统级的回声消除，防止TTS声音被麦克风拾取
 */
export async function configureVoiceChatSession(): Promise<boolean> {
  console.log('[audioSession] configureVoiceChatSession called');
  if (Platform.OS !== 'ios' || !AudioSessionManager) {
    console.log('[audioSession] AudioSessionManager not available on this platform');
    return false;
  }
  try {
    await AudioSessionManager.configureForVoiceChat();
    console.log('[audioSession] Audio session configured for voiceChat');
    return true;
  } catch (error) {
    console.warn('[audioSession] Failed to configure voiceChat session:', error);
    return false;
  }
}

/**
 * 配置音频会话为播放模式（用于 TTS）
 * 使用 spokenAudio 模式，适合语音助手场景
 */
export async function configurePlaybackSession(): Promise<boolean> {
  console.log('[audioSession] configurePlaybackSession called');
  if (Platform.OS !== 'ios' || !AudioSessionManager) {
    console.log('[audioSession] AudioSessionManager not available on this platform');
    return false;
  }
  try {
    await AudioSessionManager.configureForPlayback();
    if (typeof AudioSessionManager.forceSpeakerOutput === 'function') {
      try {
        await AudioSessionManager.forceSpeakerOutput(true);
        console.log('[audioSession] Speaker output forced for playback');
      } catch (speakerError) {
        console.warn('[audioSession] Failed to force speaker output:', speakerError);
      }
    } else {
      console.log('[audioSession] forceSpeakerOutput not exposed by native module');
    }

    console.log('[audioSession] Audio session configured for playback');
    return true;
  } catch (error) {
    console.warn('[audioSession] Failed to configure playback session:', error);
    return false;
  }
}

/**
 * 配置音频会话为录音模式（用于 STT）
 * 使用 playAndRecord 类别，default 模式
 */
export async function configureRecordingSession(): Promise<boolean> {
  console.log('[audioSession] configureRecordingSession called');
  if (Platform.OS !== 'ios' || !AudioSessionManager) {
    console.log('[audioSession] AudioSessionManager not available on this platform');
    return false;
  }
  try {
    await AudioSessionManager.configureForRecording();
    console.log('[audioSession] Audio session configured for recording');
    return true;
  } catch (error) {
    console.warn('[audioSession] Failed to configure recording session:', error);
    return false;
  }
}

/**
 * 恢复默认音频会话
 */
export async function resetAudioSession(): Promise<boolean> {
  console.log('[audioSession] resetAudioSession called');
  if (Platform.OS !== 'ios' || !AudioSessionManager) {
    console.log('[audioSession] AudioSessionManager not available on this platform');
    return false;
  }
  try {
    await AudioSessionManager.resetAudioSession();
    console.log('[audioSession] Audio session reset to default');
    return true;
  } catch (error) {
    console.warn('[audioSession] Failed to reset audio session:', error);
    return false;
  }
}
