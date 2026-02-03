import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// ==================== TYPES ====================

export interface Message {
  id: number
  content: string
  isUser: boolean
  timestamp: number
}

export interface Session {
  id: number
  title: string
  createdAt: number
  messageCount: number
}

export interface Model {
  name: string
  path: string
  size: number
  isLoaded: boolean
}

export interface VoiceProfile {
  id: number
  name: string
  audioPath: string
  createdAt: number
}

export interface VoiceRecording {
  id: number
  path: string
  createdAt: number
}

// Memory system types
export interface MemoryEntry {
  id: number
  content: string
  category: string
  sourceSessionId: number
  sourceMessageId: number
  importance: number
  createdAt: number
}

export interface UserPersona {
  id: number
  writingStyle: string
  avgMessageLength: number
  commonPhrases: string
  topicsOfInterest: string
  language: string
  emojiUsage: string
  tone: string
  messagesAnalyzed: number
  lastUpdated: number
}

export interface GlobalMessage {
  id: number
  sessionId: number
  sessionTitle: string
  content: string
  isUser: boolean
  timestamp: number
}

export interface DataStats {
  totalSessions: number
  totalMessages: number
  userMessages: number
  assistantMessages: number
  totalMemories: number
  totalCharacters: number
  estimatedTokens: number
}

export interface GpuInfo {
  available: boolean
  backend: string
  deviceName: string
  vramTotalMb: number
  vramFreeMb: number
}

// Semantic search result
export interface SearchResult {
  sourceType: string
  sourceId: number
  content: string
  similarity: number
}

// Embedding stats
export interface EmbeddingStats {
  totalEmbeddings: number
  byType: Record<string, number>
  embeddingDimension: number
  model: string
}

interface Settings {
  temperature: number
  maxTokens: number
  contextLength: number
  theme: 'dark' | 'light'
  accentColor: string
  autoSpeak: boolean
  sttEnabled: boolean
  ttsEnabled: boolean
  modelPaths: string[]
  systemPrompt: string  // Custom system prompt for LLM
}

// ==================== STORE ====================

interface AppState {
  // Sessions
  sessions: Session[]
  currentSessionId: number | null
  messages: Message[]
  
  // Models
  models: Model[]
  currentModel: Model | null
  isModelLoading: boolean
  
  // GPU
  gpuInfo: GpuInfo | null
  
  // Voice
  voiceProfiles: VoiceProfile[]
  currentVoice: VoiceProfile | null
  isRecording: boolean
  isSpeaking: boolean
  
  // Generation
  isGenerating: boolean
  pendingResponse: string
  
  // Settings
  settings: Settings
  
  // Memory System
  memories: MemoryEntry[]
  persona: UserPersona | null
  dataStats: DataStats | null
  
  // Actions
  loadSettings: () => Promise<void>
  saveSettings: (settings: Partial<Settings>) => Promise<void>
  
  loadModels: () => Promise<void>
  loadGpuInfo: () => Promise<void>
  addModelPath: (path: string) => Promise<void>
  removeModelPath: (path: string) => Promise<void>
  loadModel: (path: string) => Promise<void>
  unloadModel: () => Promise<void>
  
  loadSessions: () => Promise<void>
  createSession: () => Promise<void>
  selectSession: (id: number) => Promise<void>
  deleteSession: (id: number) => Promise<void>
  
  sendMessage: (content: string) => Promise<void>
  stopGeneration: () => void
  appendToken: (token: string) => void
  finishGeneration: () => void
  
  // Memory System Actions
  searchAllMessages: (query: string, limit?: number) => Promise<GlobalMessage[]>
  addMemory: (content: string, category: string, importance?: number) => Promise<void>
  loadMemories: () => Promise<void>
  deleteMemory: (id: number) => Promise<void>
  analyzePersona: () => Promise<UserPersona>
  loadPersona: () => Promise<void>
  loadDataStats: () => Promise<void>
  
  // Export Actions (for fine-tuning / digital twin)
  exportAlpaca: () => Promise<string>
  exportShareGPT: () => Promise<string>
  exportFull: () => Promise<string>
  
  // Semantic Search (RAG)
  embeddingStats: EmbeddingStats | null
  semanticSearch: (query: string, limit?: number) => Promise<SearchResult[]>
  indexAllMessages: () => Promise<number>
  loadEmbeddingStats: () => Promise<void>
  
  // Voice
  loadVoiceProfiles: () => Promise<void>
  createVoiceProfile: (name: string, audioPath: string) => Promise<void>
  createVoiceProfileFromRecording: (recordingId: number, name: string) => Promise<void>
  deleteVoiceProfile: (id: number) => Promise<void>
  selectVoice: (profile: VoiceProfile | null) => void
  loadVoiceRecordings: () => Promise<VoiceRecording[]>
  saveVoiceFromChat: (base64Audio: string) => Promise<string>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string>
  speak: (text: string, voiceId?: number) => Promise<void>
  stopSpeaking: () => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  sessions: [],
  currentSessionId: null,
  messages: [],
  models: [],
  currentModel: null,
  isModelLoading: false,
  gpuInfo: null,
  voiceProfiles: [],
  currentVoice: null,
  isRecording: false,
  isSpeaking: false,
  isGenerating: false,
  pendingResponse: '',
  settings: {
    temperature: 0.7,
    maxTokens: 512,
    contextLength: 2048,
    theme: 'dark',
    accentColor: 'cyan',
    autoSpeak: false,
    sttEnabled: true,
    ttsEnabled: true,
    modelPaths: [] as string[],
    systemPrompt: 'Ты - Wishmaster, умный AI-ассистент с долговременной памятью. Отвечай кратко и по делу на русском языке.',
  },
  // Memory system state
  memories: [],
  persona: null,
  dataStats: null,
  embeddingStats: null,

  // ==================== Settings ====================
  
  loadSettings: async () => {
    try {
      const settings = await invoke<Settings>('load_settings')
      set({ settings })
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  },

  saveSettings: async (newSettings) => {
    const settings = { ...get().settings, ...newSettings }
    set({ settings })
    try {
      await invoke('save_settings', { settings })
    } catch (e) {
      console.error('Failed to save settings:', e)
      throw e
    }
  },

  // ==================== Models ====================
  
  loadModels: async () => {
    try {
      const paths = await invoke<string[]>('get_model_paths')
      const models: Model[] = paths.map(p => ({
        name: p.split('/').pop()?.replace(/\.gguf$/i, '') ?? 'Модель',
        path: p,
        size: 0,
        isLoaded: false,
      }))
      set({ models })
    } catch (e) {
      console.error('Failed to load model paths:', e)
    }
  },
  
  loadGpuInfo: async () => {
    try {
      const gpuInfo = await invoke<GpuInfo>('get_gpu_info')
      console.log('GPU Info:', gpuInfo)
      set({ gpuInfo })
    } catch (e) {
      console.error('Failed to load GPU info:', e)
      set({ gpuInfo: { available: false, backend: 'CPU', device_name: 'N/A', vram_total_mb: 0, vram_free_mb: 0 } })
    }
  },

  addModelPath: async (path) => {
    try {
      await invoke('add_model_path', { path: path.trim() })
      await get().loadModels()
    } catch (e) {
      console.error('Failed to add path:', e)
      throw e
    }
  },

  removeModelPath: async (path) => {
    try {
      await invoke('remove_model_path', { path })
      await get().loadModels()
    } catch (e) {
      console.error('Failed to remove path:', e)
    }
  },

  loadModel: async (path) => {
    set({ isModelLoading: true })
    try {
      await invoke('load_model', { path, contextLength: get().settings.contextLength })
      const model = get().models.find(m => m.path === path)
      if (model) {
        set({ currentModel: { ...model, isLoaded: true } })
      } else {
        const name = path.split('/').pop()?.replace('.gguf', '') ?? 'Unknown'
        set({ currentModel: { name, path, size: 0, isLoaded: true } })
      }
    } catch (e) {
      console.error('Failed to load model:', e)
      throw e
    } finally {
      set({ isModelLoading: false })
    }
  },

  unloadModel: async () => {
    try {
      await invoke('unload_model')
      set({ currentModel: null })
    } catch (e) {
      console.error('Failed to unload model:', e)
    }
  },

  // ==================== Sessions ====================
  
  loadSessions: async () => {
    try {
      const sessions = await invoke<Session[]>('get_sessions')
      set({ sessions })
      if (sessions.length > 0 && !get().currentSessionId) {
        await get().selectSession(sessions[0].id)
      }
    } catch (e) {
      console.error('Failed to load sessions:', e)
    }
  },

  createSession: async () => {
    try {
      const id = await invoke<number>('create_session', { title: 'Новый чат' })
      await get().loadSessions()
      await get().selectSession(id)
    } catch (e) {
      console.error('Failed to create session:', e)
    }
  },

  selectSession: async (id) => {
    set({ currentSessionId: id })
    try {
      const messages = await invoke<Message[]>('get_messages', { sessionId: id })
      set({ messages })
    } catch (e) {
      console.error('Failed to load messages:', e)
    }
  },

  deleteSession: async (id) => {
    try {
      await invoke('delete_session', { sessionId: id })
      await get().loadSessions()
      if (get().currentSessionId === id) {
        const sessions = get().sessions
        if (sessions.length > 0) {
          await get().selectSession(sessions[0].id)
        } else {
          set({ currentSessionId: null, messages: [] })
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  },

  // ==================== Chat (with Memory) ====================
  
  sendMessage: async (content) => {
    const { currentSessionId, currentModel, settings, messages } = get()
    
    if (!currentSessionId || !currentModel) {
      throw new Error('No session or model selected')
    }

    const userMsg: Message = {
      id: Date.now(),
      content,
      isUser: true,
      timestamp: Date.now(),
    }
    
    set({ 
      messages: [...messages, userMsg],
      isGenerating: true,
      pendingResponse: '',
    })

    try {
      await invoke('save_message', { 
        sessionId: currentSessionId, 
        content, 
        isUser: true 
      })

      // Build prompt with more history (now using memory system)
      const history = get().messages.slice(-20) // Increased from 10 to 20
      
      await invoke('generate', {
        prompt: content,
        history: history.map(m => ({ content: m.content, isUser: m.isUser })),
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        sessionId: currentSessionId, // Pass session ID for memory context
      })
    } catch (e) {
      console.error('Failed to send message:', e)
      set({ isGenerating: false })
      throw e
    }
  },

  stopGeneration: async () => {
    try {
      await invoke('stop_generation')
    } catch (e) {
      console.error('Failed to stop generation:', e)
    }
  },

  appendToken: (token) => {
    set(state => ({
      pendingResponse: state.pendingResponse + token
    }))
  },

  finishGeneration: () => {
    const { pendingResponse, messages, currentSessionId, settings } = get()
    
    if (pendingResponse.trim()) {
      const assistantMsg: Message = {
        id: Date.now(),
        content: pendingResponse.trim(),
        isUser: false,
        timestamp: Date.now(),
      }
      
      set({
        messages: [...messages, assistantMsg],
        isGenerating: false,
        pendingResponse: '',
      })

      if (currentSessionId) {
        invoke('save_message', {
          sessionId: currentSessionId,
          content: assistantMsg.content,
          isUser: false,
        }).catch(e => console.error('Failed to save message:', e))
      }

      if (settings.autoSpeak && settings.ttsEnabled) {
        get().speak(assistantMsg.content).catch(e => 
          console.error('Auto-speak failed:', e)
        )
      }
    } else {
      set({ isGenerating: false, pendingResponse: '' })
    }
  },

  // ==================== MEMORY SYSTEM ====================
  
  searchAllMessages: async (query, limit = 20) => {
    try {
      return await invoke<GlobalMessage[]>('search_all_messages', { query, limit })
    } catch (e) {
      console.error('Failed to search messages:', e)
      return []
    }
  },

  addMemory: async (content, category, importance = 5) => {
    const { currentSessionId, messages } = get()
    const lastMessage = messages[messages.length - 1]
    
    try {
      await invoke('add_memory', {
        content,
        category,
        sessionId: currentSessionId || 0,
        messageId: lastMessage?.id || 0,
        importance,
      })
      await get().loadMemories()
    } catch (e) {
      console.error('Failed to add memory:', e)
      throw e
    }
  },

  loadMemories: async () => {
    try {
      const memories = await invoke<MemoryEntry[]>('get_all_memories')
      set({ memories })
    } catch (e) {
      console.error('Failed to load memories:', e)
    }
  },

  deleteMemory: async (id) => {
    try {
      await invoke('delete_memory', { id })
      await get().loadMemories()
    } catch (e) {
      console.error('Failed to delete memory:', e)
    }
  },

  analyzePersona: async () => {
    try {
      const persona = await invoke<UserPersona>('analyze_persona')
      set({ persona })
      return persona
    } catch (e) {
      console.error('Failed to analyze persona:', e)
      throw e
    }
  },

  loadPersona: async () => {
    try {
      const persona = await invoke<UserPersona | null>('get_user_persona')
      set({ persona })
    } catch (e) {
      console.error('Failed to load persona:', e)
    }
  },

  loadDataStats: async () => {
    try {
      const dataStats = await invoke<DataStats>('get_data_stats')
      set({ dataStats })
    } catch (e) {
      console.error('Failed to load data stats:', e)
    }
  },

  // ==================== EXPORT (for Digital Twin) ====================
  
  exportAlpaca: async () => {
    try {
      return await invoke<string>('export_to_file', { format: 'alpaca' })
    } catch (e) {
      console.error('Failed to export Alpaca:', e)
      throw e
    }
  },

  exportShareGPT: async () => {
    try {
      return await invoke<string>('export_to_file', { format: 'sharegpt' })
    } catch (e) {
      console.error('Failed to export ShareGPT:', e)
      throw e
    }
  },

  exportFull: async () => {
    try {
      return await invoke<string>('export_to_file', { format: 'full' })
    } catch (e) {
      console.error('Failed to export full:', e)
      throw e
    }
  },

  // ==================== SEMANTIC SEARCH (RAG) ====================
  
  semanticSearch: async (query, limit = 10) => {
    try {
      return await invoke<SearchResult[]>('find_rag_context', { query, limit })
    } catch (e) {
      console.error('Failed to semantic search:', e)
      return []
    }
  },

  indexAllMessages: async () => {
    try {
      const count = await invoke<number>('index_all_messages')
      await get().loadEmbeddingStats()
      return count
    } catch (e) {
      console.error('Failed to index messages:', e)
      throw e
    }
  },

  loadEmbeddingStats: async () => {
    try {
      const stats = await invoke<EmbeddingStats>('get_embedding_stats')
      set({ embeddingStats: stats })
    } catch (e) {
      console.error('Failed to load embedding stats:', e)
    }
  },

  // ==================== Voice ====================
  
  loadVoiceProfiles: async () => {
    try {
      const profiles = await invoke<VoiceProfile[]>('get_voice_profiles')
      set({ voiceProfiles: profiles })
    } catch (e) {
      console.error('Failed to load voice profiles:', e)
    }
  },

  createVoiceProfile: async (name, audioPath) => {
    try {
      await invoke('create_voice_profile', { name, audioPath })
      await get().loadVoiceProfiles()
    } catch (e) {
      console.error('Failed to create voice profile:', e)
      throw e
    }
  },

  createVoiceProfileFromRecording: async (recordingId, name) => {
    try {
      await invoke('create_voice_profile_from_recording', { recordingId, name })
      await get().loadVoiceProfiles()
    } catch (e) {
      console.error('Failed to create profile from recording:', e)
      throw e
    }
  },

  loadVoiceRecordings: async () => {
    try {
      return await invoke<VoiceRecording[]>('get_voice_recordings')
    } catch (e) {
      console.error('Failed to load voice recordings:', e)
      return []
    }
  },

  saveVoiceFromChat: async (base64Audio) => {
    return await invoke<string>('save_voice_from_chat', { base64Audio })
  },

  deleteVoiceProfile: async (id) => {
    try {
      await invoke('delete_voice_profile', { id })
      if (get().currentVoice?.id === id) {
        set({ currentVoice: null })
      }
      await get().loadVoiceProfiles()
    } catch (e) {
      console.error('Failed to delete voice profile:', e)
    }
  },

  selectVoice: (profile) => {
    set({ currentVoice: profile })
  },

  startRecording: async () => {
    set({ isRecording: true })
    try {
      await invoke('start_recording')
    } catch (e) {
      set({ isRecording: false })
      throw e
    }
  },

  stopRecording: async () => {
    set({ isRecording: false })
    try {
      const text = await invoke<string>('stop_recording')
      return text
    } catch (e) {
      console.error('Failed to stop recording:', e)
      throw e
    }
  },

  speak: async (text, voiceId) => {
    set({ isSpeaking: true })
    try {
      const id = voiceId ?? get().currentVoice?.id ?? null
      await invoke('speak', { text, voiceId: id })
    } catch (e) {
      console.error('Failed to speak:', e)
    } finally {
      set({ isSpeaking: false })
    }
  },

  stopSpeaking: async () => {
    try {
      await invoke('stop_speaking')
    } catch (e) {
      console.error('Failed to stop speaking:', e)
    } finally {
      set({ isSpeaking: false })
    }
  },
}))
