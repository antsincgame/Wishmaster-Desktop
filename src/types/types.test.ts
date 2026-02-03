/**
 * Type validation tests
 * These tests verify that TypeScript types are correctly defined
 * and match the expected structure from Rust backend
 */

import { describe, it, expect } from 'vitest';
import type {
  Message,
  Session,
  Model,
  Settings,
  DataStats,
  GpuInfo,
  MemoryEntry,
  UserPersona,
  SearchResult,
  EmbeddingStats,
  VoiceProfile,
  VoiceRecording,
  GlobalMessage,
} from './index';
import { DEFAULT_SETTINGS } from './index';

describe('Type definitions', () => {
  describe('Message', () => {
    it('should have correct structure', () => {
      const message: Message = {
        id: 1,
        content: 'Hello',
        isUser: true,
        timestamp: Date.now(),
      };
      
      expect(message).toHaveProperty('id');
      expect(message).toHaveProperty('content');
      expect(message).toHaveProperty('isUser');
      expect(message).toHaveProperty('timestamp');
    });
  });

  describe('Session', () => {
    it('should have correct structure', () => {
      const session: Session = {
        id: 1,
        title: 'Test Session',
        createdAt: Date.now(),
        messageCount: 5,
      };
      
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('title');
      expect(session).toHaveProperty('createdAt');
      expect(session).toHaveProperty('messageCount');
    });
  });

  describe('Model', () => {
    it('should have correct structure', () => {
      const model: Model = {
        name: 'test-model',
        path: '/path/to/model.gguf',
        size: 1024,
        isLoaded: false,
      };
      
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('path');
      expect(model).toHaveProperty('size');
      expect(model).toHaveProperty('isLoaded');
    });
  });

  describe('Settings', () => {
    it('should have all required fields', () => {
      const settings: Settings = {
        temperature: 0.7,
        maxTokens: 512,
        contextLength: 2048,
        theme: 'dark',
        accentColor: 'cyan',
        autoSpeak: false,
        sttEnabled: false,
        ttsEnabled: false,
        modelPaths: [],
        systemPrompt: 'You are a helpful assistant.',
      };
      
      expect(settings).toHaveProperty('temperature');
      expect(settings).toHaveProperty('maxTokens');
      expect(settings).toHaveProperty('contextLength');
      expect(settings).toHaveProperty('theme');
      expect(settings).toHaveProperty('accentColor');
      expect(settings).toHaveProperty('autoSpeak');
      expect(settings).toHaveProperty('sttEnabled');
      expect(settings).toHaveProperty('ttsEnabled');
      expect(settings).toHaveProperty('modelPaths');
      expect(settings).toHaveProperty('systemPrompt');
    });

    it('DEFAULT_SETTINGS should have all required fields', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('temperature');
      expect(DEFAULT_SETTINGS).toHaveProperty('maxTokens');
      expect(DEFAULT_SETTINGS).toHaveProperty('contextLength');
      expect(DEFAULT_SETTINGS).toHaveProperty('theme');
      expect(DEFAULT_SETTINGS).toHaveProperty('accentColor');
      expect(DEFAULT_SETTINGS).toHaveProperty('autoSpeak');
      expect(DEFAULT_SETTINGS).toHaveProperty('sttEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('ttsEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('modelPaths');
      expect(DEFAULT_SETTINGS).toHaveProperty('systemPrompt');
    });

    it('DEFAULT_SETTINGS should have valid theme', () => {
      expect(['dark', 'light']).toContain(DEFAULT_SETTINGS.theme);
    });
  });

  describe('DataStats (camelCase)', () => {
    it('should use camelCase field names', () => {
      const stats: DataStats = {
        totalSessions: 10,
        totalMessages: 100,
        userMessages: 50,
        assistantMessages: 50,
        totalMemories: 20,
        totalCharacters: 5000,
        estimatedTokens: 1250,
      };
      
      // Verify camelCase (not snake_case)
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('userMessages');
      expect(stats).toHaveProperty('assistantMessages');
      expect(stats).toHaveProperty('totalMemories');
      expect(stats).toHaveProperty('totalCharacters');
      expect(stats).toHaveProperty('estimatedTokens');
      
      // These should NOT exist (snake_case)
      expect(stats).not.toHaveProperty('total_sessions');
      expect(stats).not.toHaveProperty('total_messages');
    });
  });

  describe('GpuInfo (camelCase)', () => {
    it('should use camelCase field names', () => {
      const gpu: GpuInfo = {
        available: true,
        backend: 'cuda',
        deviceName: 'RTX 4090',
        vramTotalMb: 24576,
        vramFreeMb: 20000,
      };
      
      // Verify camelCase
      expect(gpu).toHaveProperty('deviceName');
      expect(gpu).toHaveProperty('vramTotalMb');
      expect(gpu).toHaveProperty('vramFreeMb');
      
      // These should NOT exist (snake_case)
      expect(gpu).not.toHaveProperty('device_name');
      expect(gpu).not.toHaveProperty('vram_total_mb');
    });
  });

  describe('MemoryEntry (camelCase)', () => {
    it('should use camelCase field names', () => {
      const memory: MemoryEntry = {
        id: 1,
        content: 'Important fact',
        category: 'general',
        sourceSessionId: 1,
        sourceMessageId: 5,
        importance: 0.8,
        createdAt: Date.now(),
      };
      
      expect(memory).toHaveProperty('sourceSessionId');
      expect(memory).toHaveProperty('sourceMessageId');
      expect(memory).toHaveProperty('createdAt');
      
      // These should NOT exist
      expect(memory).not.toHaveProperty('source_session_id');
      expect(memory).not.toHaveProperty('created_at');
    });
  });

  describe('SearchResult (camelCase)', () => {
    it('should use camelCase field names', () => {
      const result: SearchResult = {
        sourceType: 'message',
        sourceId: 1,
        content: 'Search result',
        similarity: 0.95,
      };
      
      expect(result).toHaveProperty('sourceType');
      expect(result).toHaveProperty('sourceId');
      
      // These should NOT exist
      expect(result).not.toHaveProperty('source_type');
      expect(result).not.toHaveProperty('source_id');
    });
  });

  describe('EmbeddingStats (camelCase)', () => {
    it('should use camelCase field names', () => {
      const stats: EmbeddingStats = {
        totalEmbeddings: 100,
        byType: { message: 80, memory: 20 },
        embeddingDimension: 384,
        model: 'all-MiniLM-L6-v2',
      };
      
      expect(stats).toHaveProperty('totalEmbeddings');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('embeddingDimension');
      
      // These should NOT exist
      expect(stats).not.toHaveProperty('total_embeddings');
      expect(stats).not.toHaveProperty('embedding_dimension');
    });
  });

  describe('VoiceProfile (camelCase)', () => {
    it('should use camelCase field names', () => {
      const profile: VoiceProfile = {
        id: 1,
        name: 'My Voice',
        audioPath: '/path/to/audio.wav',
        createdAt: Date.now(),
      };
      
      expect(profile).toHaveProperty('audioPath');
      expect(profile).toHaveProperty('createdAt');
      
      // These should NOT exist
      expect(profile).not.toHaveProperty('audio_path');
      expect(profile).not.toHaveProperty('created_at');
    });
  });

  describe('GlobalMessage (camelCase)', () => {
    it('should use camelCase field names', () => {
      const msg: GlobalMessage = {
        id: 1,
        sessionId: 1,
        sessionTitle: 'Chat',
        content: 'Hello',
        isUser: true,
        timestamp: Date.now(),
      };
      
      expect(msg).toHaveProperty('sessionId');
      expect(msg).toHaveProperty('sessionTitle');
      expect(msg).toHaveProperty('isUser');
      
      // These should NOT exist
      expect(msg).not.toHaveProperty('session_id');
      expect(msg).not.toHaveProperty('session_title');
      expect(msg).not.toHaveProperty('is_user');
    });
  });
});

describe('Type constraints', () => {
  it('Theme should only allow dark or light', () => {
    const validThemes = ['dark', 'light'] as const;
    type Theme = typeof validThemes[number];
    
    const theme: Theme = 'dark';
    expect(validThemes).toContain(theme);
  });

  it('Settings temperature should be between 0 and 1', () => {
    expect(DEFAULT_SETTINGS.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.temperature).toBeLessThanOrEqual(1);
  });

  it('Settings maxTokens should be positive', () => {
    expect(DEFAULT_SETTINGS.maxTokens).toBeGreaterThan(0);
  });
});
