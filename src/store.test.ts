import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from './store'

// Mock invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

describe('Store', () => {
  beforeEach(() => {
    // Reset store state
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      messages: [],
      models: [],
      currentModel: null,
      isModelLoading: false,
      voiceProfiles: [],
      currentVoice: null,
      isRecording: false,
      isSpeaking: false,
      isGenerating: false,
      pendingResponse: '',
      memories: [],
      persona: null,
      dataStats: null,
      settings: {
        temperature: 0.7,
        maxTokens: 512,
        contextLength: 2048,
        theme: 'dark',
        accentColor: 'cyan',
        autoSpeak: false,
        sttEnabled: true,
        ttsEnabled: true,
        modelPaths: [],
      }
    })
    vi.clearAllMocks()
  })

  describe('Settings', () => {
    it('should load settings from backend', async () => {
      // Arrange
      const mockSettings = {
        temperature: 0.8,
        maxTokens: 1024,
        contextLength: 4096,
        theme: 'light',
        accentColor: 'magenta',
        autoSpeak: true,
        sttEnabled: false,
        ttsEnabled: true,
        modelPaths: ['/path/to/model.gguf']
      }
      vi.mocked(invoke).mockResolvedValueOnce(mockSettings)
      
      // Act
      await useStore.getState().loadSettings()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('load_settings')
      expect(useStore.getState().settings).toEqual(mockSettings)
    })
    
    it('should save settings to backend', async () => {
      // Arrange
      vi.mocked(invoke).mockResolvedValueOnce(undefined)
      
      // Act
      await useStore.getState().saveSettings({ temperature: 0.9 })
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('save_settings', {
        settings: expect.objectContaining({ temperature: 0.9 })
      })
      expect(useStore.getState().settings.temperature).toBe(0.9)
    })
  })

  describe('Sessions', () => {
    it('should load sessions from backend', async () => {
      // Arrange
      const mockSessions = [
        { id: 1, title: 'Chat 1', createdAt: Date.now(), messageCount: 5 },
        { id: 2, title: 'Chat 2', createdAt: Date.now(), messageCount: 3 }
      ]
      vi.mocked(invoke).mockResolvedValueOnce(mockSessions)
      vi.mocked(invoke).mockResolvedValueOnce([]) // for selectSession
      
      // Act
      await useStore.getState().loadSessions()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('get_sessions')
      expect(useStore.getState().sessions).toEqual(mockSessions)
    })
    
    it('should create a new session', async () => {
      // Arrange
      vi.mocked(invoke).mockResolvedValueOnce(1) // create_session returns id
      vi.mocked(invoke).mockResolvedValueOnce([{ id: 1, title: 'Новый чат', createdAt: Date.now(), messageCount: 0 }]) // loadSessions
      vi.mocked(invoke).mockResolvedValueOnce([]) // get_messages
      
      // Act
      await useStore.getState().createSession()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('create_session', { title: 'Новый чат' })
    })
    
    it('should select a session and load messages', async () => {
      // Arrange
      const mockMessages = [
        { id: 1, content: 'Hello', isUser: true, timestamp: Date.now() },
        { id: 2, content: 'Hi there!', isUser: false, timestamp: Date.now() }
      ]
      vi.mocked(invoke).mockResolvedValueOnce(mockMessages)
      
      // Act
      await useStore.getState().selectSession(1)
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('get_messages', { sessionId: 1 })
      expect(useStore.getState().currentSessionId).toBe(1)
      expect(useStore.getState().messages).toEqual(mockMessages)
    })
    
    it('should delete a session', async () => {
      // Arrange
      useStore.setState({
        sessions: [
          { id: 1, title: 'Chat 1', createdAt: Date.now(), messageCount: 0 },
          { id: 2, title: 'Chat 2', createdAt: Date.now(), messageCount: 0 }
        ],
        currentSessionId: 1
      })
      vi.mocked(invoke).mockResolvedValueOnce(undefined) // delete_session
      vi.mocked(invoke).mockResolvedValueOnce([{ id: 2, title: 'Chat 2', createdAt: Date.now(), messageCount: 0 }]) // loadSessions
      vi.mocked(invoke).mockResolvedValueOnce([]) // selectSession -> get_messages
      
      // Act
      await useStore.getState().deleteSession(1)
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('delete_session', { sessionId: 1 })
    })
  })

  describe('Models', () => {
    it('should load model paths from backend', async () => {
      // Arrange
      const mockPaths = ['/home/user/models/qwen.gguf', '/home/user/models/llama.gguf']
      vi.mocked(invoke).mockResolvedValueOnce(mockPaths)
      
      // Act
      await useStore.getState().loadModels()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('get_model_paths')
      expect(useStore.getState().models.length).toBe(2)
      expect(useStore.getState().models[0].path).toBe(mockPaths[0])
    })
    
    it('should add a model path', async () => {
      // Arrange
      vi.mocked(invoke).mockResolvedValueOnce(undefined) // add_model_path
      vi.mocked(invoke).mockResolvedValueOnce(['/new/model.gguf']) // loadModels
      
      // Act
      await useStore.getState().addModelPath('/new/model.gguf')
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('add_model_path', { path: '/new/model.gguf' })
    })
    
    it('should load a model', async () => {
      // Arrange
      useStore.setState({
        models: [{ name: 'test', path: '/test.gguf', size: 0, isLoaded: false }],
        settings: { ...useStore.getState().settings, contextLength: 4096 }
      })
      vi.mocked(invoke).mockResolvedValueOnce(undefined) // load_model
      
      // Act
      await useStore.getState().loadModel('/test.gguf')
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('load_model', { path: '/test.gguf', contextLength: 4096 })
      expect(useStore.getState().currentModel?.path).toBe('/test.gguf')
      expect(useStore.getState().currentModel?.isLoaded).toBe(true)
    })
    
    it('should unload a model', async () => {
      // Arrange
      useStore.setState({
        currentModel: { name: 'test', path: '/test.gguf', size: 0, isLoaded: true }
      })
      vi.mocked(invoke).mockResolvedValueOnce(undefined)
      
      // Act
      await useStore.getState().unloadModel()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('unload_model')
      expect(useStore.getState().currentModel).toBeNull()
    })
  })

  describe('Generation', () => {
    it('should append tokens during generation', () => {
      // Arrange
      useStore.setState({ pendingResponse: '' })
      
      // Act
      useStore.getState().appendToken('Hello')
      useStore.getState().appendToken(' ')
      useStore.getState().appendToken('World')
      
      // Assert
      expect(useStore.getState().pendingResponse).toBe('Hello World')
    })
    
    it('should finish generation and save message', () => {
      // Arrange
      useStore.setState({
        pendingResponse: 'Generated response',
        messages: [{ id: 1, content: 'User message', isUser: true, timestamp: Date.now() }],
        currentSessionId: 1,
        isGenerating: true,
        settings: { ...useStore.getState().settings, autoSpeak: false }
      })
      vi.mocked(invoke).mockResolvedValueOnce(2) // save_message
      
      // Act
      useStore.getState().finishGeneration()
      
      // Assert
      expect(useStore.getState().isGenerating).toBe(false)
      expect(useStore.getState().pendingResponse).toBe('')
      expect(useStore.getState().messages.length).toBe(2)
      expect(useStore.getState().messages[1].content).toBe('Generated response')
      expect(useStore.getState().messages[1].isUser).toBe(false)
    })
    
    it('should not add empty response', () => {
      // Arrange
      useStore.setState({
        pendingResponse: '   ',
        messages: [],
        isGenerating: true
      })
      
      // Act
      useStore.getState().finishGeneration()
      
      // Assert
      expect(useStore.getState().isGenerating).toBe(false)
      expect(useStore.getState().messages.length).toBe(0)
    })
  })

  describe('Memory', () => {
    it('should load memories from backend', async () => {
      // Arrange
      const mockMemories = [
        { id: 1, content: 'User likes Rust', category: 'preference', importance: 8, sourceSessionId: 1, sourceMessageId: 1, createdAt: Date.now() }
      ]
      vi.mocked(invoke).mockResolvedValueOnce(mockMemories)
      
      // Act
      await useStore.getState().loadMemories()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('get_all_memories')
      expect(useStore.getState().memories).toEqual(mockMemories)
    })
    
    it('should add a memory', async () => {
      // Arrange
      useStore.setState({ currentSessionId: 1, messages: [{ id: 10, content: 'test', isUser: true, timestamp: Date.now() }] })
      vi.mocked(invoke).mockResolvedValueOnce(1) // add_memory
      vi.mocked(invoke).mockResolvedValueOnce([]) // loadMemories
      
      // Act
      await useStore.getState().addMemory('User prefers TypeScript', 'preference', 7)
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('add_memory', {
        content: 'User prefers TypeScript',
        category: 'preference',
        sessionId: 1,
        messageId: 10,
        importance: 7
      })
    })
    
    it('should delete a memory', async () => {
      // Arrange
      vi.mocked(invoke).mockResolvedValueOnce(undefined) // delete_memory
      vi.mocked(invoke).mockResolvedValueOnce([]) // loadMemories
      
      // Act
      await useStore.getState().deleteMemory(1)
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('delete_memory', { id: 1 })
    })
  })

  describe('Voice', () => {
    it('should load voice profiles', async () => {
      // Arrange
      const mockProfiles = [
        { id: 1, name: 'My Voice', audioPath: '/path/to/voice.wav', createdAt: Date.now() }
      ]
      vi.mocked(invoke).mockResolvedValueOnce(mockProfiles)
      
      // Act
      await useStore.getState().loadVoiceProfiles()
      
      // Assert
      expect(invoke).toHaveBeenCalledWith('get_voice_profiles')
      expect(useStore.getState().voiceProfiles).toEqual(mockProfiles)
    })
    
    it('should select a voice profile', () => {
      // Arrange
      const profile = { id: 1, name: 'My Voice', audioPath: '/path/to/voice.wav', createdAt: Date.now() }
      
      // Act
      useStore.getState().selectVoice(profile)
      
      // Assert
      expect(useStore.getState().currentVoice).toEqual(profile)
    })
    
    it('should clear voice selection', () => {
      // Arrange
      useStore.setState({
        currentVoice: { id: 1, name: 'My Voice', audioPath: '/path/to/voice.wav', createdAt: Date.now() }
      })
      
      // Act
      useStore.getState().selectVoice(null)
      
      // Assert
      expect(useStore.getState().currentVoice).toBeNull()
    })
  })
})
