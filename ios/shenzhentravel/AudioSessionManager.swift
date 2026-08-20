import AVFoundation
import React

@objc(AudioSessionManager)
class AudioSessionManager: NSObject {

  /// 配置音频会话为 voiceChat 模式，启用系统级回声消除 (AEC)
  /// 这样扬声器播放的 TTS 声音不会被麦克风拾取
  @objc func configureForVoiceChat(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .voiceChat,
        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP]
      )
      try session.setActive(true)
      resolve(true)
    } catch {
      reject("AUDIO_SESSION_ERROR", "Failed to configure audio session: \(error.localizedDescription)", error)
    }
  }

  /// 配置音频会话为纯播放模式（用于 TTS）
  /// 不带 AGC，避免音量波动
  @objc func configureForPlayback(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playback,
        mode: .spokenAudio,
        options: [.duckOthers]
      )
      try session.setActive(true)
      resolve(true)
    } catch {
      reject("AUDIO_SESSION_ERROR", "Failed to configure playback session: \(error.localizedDescription)", error)
    }
  }

  /// 配置音频会话为录音模式（用于 STT）
  @objc func configureForRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.defaultToSpeaker, .allowBluetooth]
      )
      try session.setActive(true)
      resolve(true)
    } catch {
      reject("AUDIO_SESSION_ERROR", "Failed to configure recording session: \(error.localizedDescription)", error)
    }
  }

  /// 恢复默认音频会话配置
  @objc func resetAudioSession(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
      resolve(true)
    } catch {
      reject("AUDIO_SESSION_ERROR", "Failed to reset audio session: \(error.localizedDescription)", error)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
