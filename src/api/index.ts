/**
 * Wishmaster Desktop - API Layer
 * 
 * This module provides a typed interface to the Tauri backend.
 * All Tauri invoke calls are centralized here for better maintainability.
 * 
 * @module api
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  Message,
  Session,
  Settings,
  Model,
  GpuInfo,
  VoiceProfile,
  VoiceRecording,
  MemoryEntry,
  UserPersona,
  GlobalMessage,
  DataStats,
  HistoryMessage,
} from '../types';

// ==================== ERROR HANDLING ====================

/**
 * Wraps an API call with error handling
 * @param fn - Async function to execute
 * @param fallback - Optional fallback value on error
 */
async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  fallback?: T
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`API Error [${command}]:`, message);
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`${command} failed: ${message}`);
  }
}

// ==================== SETTINGS API ====================

export const settingsApi = {
  /**
   * Load settings from database
   */
  load: () => safeInvoke<Settings>('load_settings'),

  /**
   * Save settings to database
   */
  save: (settings: Settings) => safeInvoke<void>('save_settings', { settings }),
};

// ==================== MODEL API ====================

export const modelApi = {
  /**
   * Get list of registered model paths
   */
  getPaths: () => safeInvoke<string[]>('get_model_paths', undefined, []),

  /**
   * Add a new model path
   */
  addPath: (path: string) => safeInvoke<void>('add_model_path', { path }),

  /**
   * Remove a model path
   */
  removePath: (path: string) => safeInvoke<void>('remove_model_path', { path }),

  /**
   * Load a model into memory
   */
  load: (path: string, contextLength: number) =>
    safeInvoke<void>('load_model', { path, contextLength }),

  /**
   * Unload current model from memory
   */
  unload: () => safeInvoke<void>('unload_model'),

  /**
   * Get GPU/CUDA information
   */
  getGpuInfo: () =>
    safeInvoke<GpuInfo>('get_gpu_info', undefined, {
      available: false,
      backend: 'CPU',
      deviceName: 'N/A',
      vramTotalMb: 0,
      vramFreeMb: 0,
    }),

  /**
   * Check if GPU is available
   */
  isGpuAvailable: () => safeInvoke<boolean>('is_gpu_available', undefined, false),
};

// ==================== SESSION API ====================

export const sessionApi = {
  /**
   * Get all sessions
   */
  getAll: () => safeInvoke<Session[]>('get_sessions', undefined, []),

  /**
   * Create a new session
   */
  create: (title: string) => safeInvoke<number>('create_session', { title }),

  /**
   * Delete a session
   */
  delete: (sessionId: number) => safeInvoke<void>('delete_session', { sessionId }),
};

// ==================== MESSAGE API ====================

export const messageApi = {
  /**
   * Get messages for a session
   */
  getBySession: (sessionId: number) =>
    safeInvoke<Message[]>('get_messages', { sessionId }, []),

  /**
   * Save a new message
   */
  save: (sessionId: number, content: string, isUser: boolean) =>
    safeInvoke<number>('save_message', { sessionId, content, isUser }),
};

// ==================== GENERATION API ====================

export const generationApi = {
  /**
   * Generate AI response with streaming
   */
  generate: (
    prompt: string,
    history: HistoryMessage[],
    temperature: number,
    maxTokens: number,
    sessionId: number
  ) =>
    safeInvoke<void>('generate', {
      prompt,
      history,
      temperature,
      maxTokens,
      sessionId,
    }),

  /**
   * Stop current generation
   */
  stop: () => safeInvoke<void>('stop_generation'),
};

// ==================== MEMORY API ====================

export const memoryApi = {
  /**
   * Search messages across all sessions
   */
  searchMessages: (query: string, limit: number = 20) =>
    safeInvoke<GlobalMessage[]>('search_all_messages', { query, limit }, []),

  /**
   * Get recent messages from all sessions
   */
  getRecentGlobal: (limit: number = 20) =>
    safeInvoke<GlobalMessage[]>('get_recent_global_messages', { limit }, []),

  /**
   * Add a memory entry
   */
  add: (
    content: string,
    category: string,
    sessionId: number,
    messageId: number,
    importance: number
  ) =>
    safeInvoke<number>('add_memory', {
      content,
      category,
      sessionId,
      messageId,
      importance,
    }),

  /**
   * Get all memories
   */
  getAll: () => safeInvoke<MemoryEntry[]>('get_all_memories', undefined, []),

  /**
   * Get memories by category
   */
  getByCategory: (category: string) =>
    safeInvoke<MemoryEntry[]>('get_memories_by_category', { category }, []),

  /**
   * Get top N important memories
   */
  getTop: (limit: number) =>
    safeInvoke<MemoryEntry[]>('get_top_memories', { limit }, []),

  /**
   * Delete a memory entry
   */
  delete: (id: number) => safeInvoke<void>('delete_memory', { id }),
};

// ==================== PERSONA API ====================

export const personaApi = {
  /**
   * Get user persona
   */
  get: () => safeInvoke<UserPersona | null>('get_user_persona', undefined, null),

  /**
   * Analyze messages and build persona
   */
  analyze: () => safeInvoke<UserPersona>('analyze_persona'),
};

// ==================== EXPORT API ====================

export const exportApi = {
  /**
   * Get data statistics
   */
  getStats: () => safeInvoke<DataStats>('get_data_stats'),

  /**
   * Export in Alpaca format
   */
  toAlpaca: () => safeInvoke<unknown[]>('export_alpaca_format', undefined, []),

  /**
   * Export in ShareGPT format
   */
  toShareGPT: () => safeInvoke<unknown[]>('export_sharegpt_format', undefined, []),

  /**
   * Export all data
   */
  toFull: () => safeInvoke<unknown>('export_all_data'),

  /**
   * Export to file
   */
  toFile: (format: 'alpaca' | 'sharegpt' | 'full') =>
    safeInvoke<string>('export_to_file', { format }),
};

// ==================== VOICE API ====================

export const voiceApi = {
  /**
   * Get all voice profiles
   */
  getProfiles: () =>
    safeInvoke<VoiceProfile[]>('get_voice_profiles', undefined, []),

  /**
   * Create a voice profile
   */
  createProfile: (name: string, audioPath: string) =>
    safeInvoke<number>('create_voice_profile', { name, audioPath }),

  /**
   * Create profile from recording
   */
  createProfileFromRecording: (recordingId: number, name: string) =>
    safeInvoke<number>('create_voice_profile_from_recording', { recordingId, name }),

  /**
   * Delete a voice profile
   */
  deleteProfile: (id: number) => safeInvoke<void>('delete_voice_profile', { id }),

  /**
   * Get voice recordings
   */
  getRecordings: () =>
    safeInvoke<VoiceRecording[]>('get_voice_recordings', undefined, []),

  /**
   * Save voice recording from chat
   */
  saveFromChat: (base64Audio: string) =>
    safeInvoke<string>('save_voice_from_chat', { base64Audio }),

  /**
   * Start recording
   */
  startRecording: () => safeInvoke<void>('start_recording'),

  /**
   * Stop recording and get transcription
   */
  stopRecording: () => safeInvoke<string>('stop_recording'),

  /**
   * Speak text with TTS
   */
  speak: (text: string, voiceId: number | null) =>
    safeInvoke<void>('speak', { text, voiceId }),

  /**
   * Stop speaking
   */
  stopSpeaking: () => safeInvoke<void>('stop_speaking'),
};

// ==================== COMBINED EXPORT ====================

export const api = {
  settings: settingsApi,
  model: modelApi,
  session: sessionApi,
  message: messageApi,
  generation: generationApi,
  memory: memoryApi,
  persona: personaApi,
  export: exportApi,
  voice: voiceApi,
};

export default api;
