/**
 * API Layer Tests
 *
 * Tests for the Tauri invoke wrappers and API utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  settingsApi,
  modelApi,
  sessionApi,
  messageApi,
  generationApi,
  memoryApi,
  personaApi,
  exportApi,
  voiceApi,
  searchApi,
  hfApi,
  awqApi,
} from './index';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('API Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Settings API ====================

  describe('settingsApi', () => {
    it('should load settings', async () => {
      const mockSettings = { temperature: 0.7, maxTokens: 512 };
      vi.mocked(invoke).mockResolvedValueOnce(mockSettings);

      const result = await settingsApi.load();

      expect(invoke).toHaveBeenCalledWith('load_settings', undefined);
      expect(result).toEqual(mockSettings);
    });

    it('should save settings', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      const settings = { temperature: 0.8, maxTokens: 1024 };

      await settingsApi.save(settings as any);

      expect(invoke).toHaveBeenCalledWith('save_settings', { settings });
    });
  });

  // ==================== Model API ====================

  describe('modelApi', () => {
    it('should get model paths with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Backend error'));

      const result = await modelApi.getPaths();

      expect(result).toEqual([]);
    });

    it('should get model paths on success', async () => {
      const paths = ['/path/to/model1.gguf', '/path/to/model2.gguf'];
      vi.mocked(invoke).mockResolvedValueOnce(paths);

      const result = await modelApi.getPaths();

      expect(invoke).toHaveBeenCalledWith('get_model_paths', undefined);
      expect(result).toEqual(paths);
    });

    it('should add a model path', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await modelApi.addPath('/new/model.gguf');

      expect(invoke).toHaveBeenCalledWith('add_model_path', { path: '/new/model.gguf' });
    });

    it('should remove a model path', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await modelApi.removePath('/old/model.gguf');

      expect(invoke).toHaveBeenCalledWith('remove_model_path', { path: '/old/model.gguf' });
    });

    it('should load a model with context length', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await modelApi.load('/path/to/model.gguf', 4096);

      expect(invoke).toHaveBeenCalledWith('load_model', {
        path: '/path/to/model.gguf',
        contextLength: 4096,
      });
    });

    it('should unload current model', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await modelApi.unload();

      expect(invoke).toHaveBeenCalledWith('unload_model', undefined);
    });

    it('should get GPU info with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('No GPU'));

      const result = await modelApi.getGpuInfo();

      expect(result).toEqual({
        available: false,
        backend: 'CPU',
        deviceName: 'N/A',
        vramTotalMb: 0,
        vramFreeMb: 0,
      });
    });

    it('should get GPU availability with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Error'));

      const result = await modelApi.isGpuAvailable();

      expect(result).toBe(false);
    });
  });

  // ==================== Session API ====================

  describe('sessionApi', () => {
    it('should get all sessions', async () => {
      const sessions = [
        { id: 1, title: 'Chat 1', createdAt: Date.now(), messageCount: 5 },
      ];
      vi.mocked(invoke).mockResolvedValueOnce(sessions);

      const result = await sessionApi.getAll();

      expect(invoke).toHaveBeenCalledWith('get_sessions', undefined);
      expect(result).toEqual(sessions);
    });

    it('should return empty array on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('DB error'));

      const result = await sessionApi.getAll();

      expect(result).toEqual([]);
    });

    it('should create a session and return ID', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(42);

      const result = await sessionApi.create('New Chat');

      expect(invoke).toHaveBeenCalledWith('create_session', { title: 'New Chat' });
      expect(result).toBe(42);
    });

    it('should delete a session', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await sessionApi.delete(1);

      expect(invoke).toHaveBeenCalledWith('delete_session', { sessionId: 1 });
    });
  });

  // ==================== Message API ====================

  describe('messageApi', () => {
    it('should get messages by session', async () => {
      const messages = [
        { id: 1, content: 'Hello', isUser: true, timestamp: Date.now() },
      ];
      vi.mocked(invoke).mockResolvedValueOnce(messages);

      const result = await messageApi.getBySession(1);

      expect(invoke).toHaveBeenCalledWith('get_messages', { sessionId: 1 });
      expect(result).toEqual(messages);
    });

    it('should save a message and return ID', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(123);

      const result = await messageApi.save(1, 'Hello world', true);

      expect(invoke).toHaveBeenCalledWith('save_message', {
        sessionId: 1,
        content: 'Hello world',
        isUser: true,
      });
      expect(result).toBe(123);
    });
  });

  // ==================== Generation API ====================

  describe('generationApi', () => {
    it('should call generate with all parameters', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      const history = [{ role: 'user' as const, content: 'Hi' }];

      await generationApi.generate('Hello', history, 0.7, 512, 1);

      expect(invoke).toHaveBeenCalledWith('generate', {
        prompt: 'Hello',
        history,
        temperature: 0.7,
        maxTokens: 512,
        sessionId: 1,
      });
    });

    it('should stop generation', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await generationApi.stop();

      expect(invoke).toHaveBeenCalledWith('stop_generation', undefined);
    });
  });

  // ==================== Memory API ====================

  describe('memoryApi', () => {
    it('should search messages with default limit', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await memoryApi.searchMessages('query');

      expect(invoke).toHaveBeenCalledWith('search_all_messages', { query: 'query', limit: 20 });
    });

    it('should search messages with custom limit', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await memoryApi.searchMessages('query', 50);

      expect(invoke).toHaveBeenCalledWith('search_all_messages', { query: 'query', limit: 50 });
    });

    it('should add a memory', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(1);

      const result = await memoryApi.add('Test memory', 'preference', 1, 10, 8);

      expect(invoke).toHaveBeenCalledWith('add_memory', {
        content: 'Test memory',
        category: 'preference',
        sessionId: 1,
        messageId: 10,
        importance: 8,
      });
      expect(result).toBe(1);
    });

    it('should get all memories with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('DB error'));

      const result = await memoryApi.getAll();

      expect(result).toEqual([]);
    });

    it('should get memories by category', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await memoryApi.getByCategory('preference');

      expect(invoke).toHaveBeenCalledWith('get_memories_by_category', { category: 'preference' });
    });

    it('should delete a memory', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await memoryApi.delete(1);

      expect(invoke).toHaveBeenCalledWith('delete_memory', { id: 1 });
    });
  });

  // ==================== Voice API ====================

  describe('voiceApi', () => {
    it('should get voice profiles', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await voiceApi.getProfiles();

      expect(invoke).toHaveBeenCalledWith('get_voice_profiles', undefined);
    });

    it('should create a voice profile', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(1);

      const result = await voiceApi.createProfile('My Voice', '/path/to/audio.wav');

      expect(invoke).toHaveBeenCalledWith('create_voice_profile', {
        name: 'My Voice',
        audioPath: '/path/to/audio.wav',
      });
      expect(result).toBe(1);
    });

    it('should speak text with voice ID', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await voiceApi.speak('Hello world', 1);

      expect(invoke).toHaveBeenCalledWith('speak', { text: 'Hello world', voiceId: 1 });
    });

    it('should speak text without voice ID', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await voiceApi.speak('Hello world', null);

      expect(invoke).toHaveBeenCalledWith('speak', { text: 'Hello world', voiceId: null });
    });

    it('should check STT availability with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Not available'));

      const result = await voiceApi.isSttAvailable();

      expect(result).toBe(false);
    });
  });

  // ==================== Search API ====================

  describe('searchApi', () => {
    it('should find RAG context with default limit', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await searchApi.findRagContext('query');

      expect(invoke).toHaveBeenCalledWith('find_rag_context', { query: 'query', limit: 5 });
    });

    it('should get embedding stats with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Error'));

      const result = await searchApi.getStats();

      expect(result).toEqual({
        totalEmbeddings: 0,
        byType: {},
        embeddingDimension: 384,
        model: 'multilingual-e5-small',
      });
    });
  });

  // ==================== HuggingFace API ====================

  describe('hfApi', () => {
    it('should list GGUF files', async () => {
      const files = [{ filename: 'model.gguf', size: 1000, sizeFormatted: '1 KB' }];
      vi.mocked(invoke).mockResolvedValueOnce(files);

      const result = await hfApi.listGgufFiles('TheBloke/Model-GGUF');

      expect(invoke).toHaveBeenCalledWith('list_hf_gguf_files', { repoId: 'TheBloke/Model-GGUF' });
      expect(result).toEqual(files);
    });

    it('should return empty array on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Network error'));

      const result = await hfApi.listGgufFiles('invalid/repo');

      expect(result).toEqual([]);
    });

    it('should get popular models', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await hfApi.getPopularModels();

      expect(invoke).toHaveBeenCalledWith('get_popular_models', undefined);
    });

    it('should download a model', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('/path/to/downloaded/model.gguf');

      const result = await hfApi.downloadModel('TheBloke/Model-GGUF', 'model-q4.gguf');

      expect(invoke).toHaveBeenCalledWith('download_hf_model', {
        repoId: 'TheBloke/Model-GGUF',
        filename: 'model-q4.gguf',
      });
      expect(result).toBe('/path/to/downloaded/model.gguf');
    });
  });

  // ==================== AWQ API ====================

  describe('awqApi', () => {
    it('should check Python with fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Python not found'));

      const result = await awqApi.checkPython();

      expect(result).toEqual({
        pythonVersion: null,
        pythonOk: false,
        dependencies: {},
        allInstalled: false,
        cudaAvailable: false,
        cudaDevice: null,
      });
    });

    it('should check Python successfully', async () => {
      const status = {
        pythonVersion: '3.10.0',
        pythonOk: true,
        dependencies: { torch: true, transformers: true },
        allInstalled: true,
        cudaAvailable: true,
        cudaDevice: 'NVIDIA RTX 3080',
      };
      vi.mocked(invoke).mockResolvedValueOnce(status);

      const result = await awqApi.checkPython();

      expect(invoke).toHaveBeenCalledWith('check_awq_python', undefined);
      expect(result).toEqual(status);
    });

    it('should convert AWQ to GGUF with default quant', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('/path/to/converted.gguf');

      await awqApi.convertToGguf('model/awq-repo');

      expect(invoke).toHaveBeenCalledWith('convert_awq_to_gguf', {
        repoId: 'model/awq-repo',
        quantType: 'Q4_K_M',
      });
    });

    it('should convert AWQ to GGUF with custom quant', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('/path/to/converted.gguf');

      await awqApi.convertToGguf('model/awq-repo', 'Q5_K_S');

      expect(invoke).toHaveBeenCalledWith('convert_awq_to_gguf', {
        repoId: 'model/awq-repo',
        quantType: 'Q5_K_S',
      });
    });

    it('should check if model is AWQ', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true);

      const result = await awqApi.isAwqModel('model/awq-repo');

      expect(invoke).toHaveBeenCalledWith('is_awq_model', { repoId: 'model/awq-repo' });
      expect(result).toBe(true);
    });

    it('should suggest GGUF alternative', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('model/gguf-alternative');

      const result = await awqApi.suggestGgufAlternative('model/awq-repo');

      expect(invoke).toHaveBeenCalledWith('suggest_gguf_alternative', { repoId: 'model/awq-repo' });
      expect(result).toBe('model/gguf-alternative');
    });
  });

  // ==================== Error Handling ====================

  describe('Error Handling', () => {
    it('should throw with command name on error without fallback', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(settingsApi.load()).rejects.toThrow('load_settings failed: DB connection failed');
    });

    it('should handle string errors', async () => {
      vi.mocked(invoke).mockRejectedValueOnce('String error message');

      await expect(settingsApi.load()).rejects.toThrow('load_settings failed: String error message');
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      await sessionApi.getAll();

      expect(consoleSpy).toHaveBeenCalledWith('API Error [get_sessions]:', 'Test error');
      consoleSpy.mockRestore();
    });
  });
});
