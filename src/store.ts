import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

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

interface Settings {
  temperature: number
  maxTokens: number
  contextLength: number
  theme: 'dark' | 'light'
  accentColor: string
  autoSpeak: boolean
  sttEnabled: boolean
  ttsEnabled: boolean
}

interface AppState {
  // Sessions
  sessions: Session[]
  currentSessionId: number | null
  messages: Message[]
  
  // Models
  models: Model[]
  currentModel: Model | null
  isModelLoading: boolean
  
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
  
  // Actions
  loadSettings: () => Promise<void>
  saveSettings: (settings: Partial<Settings>) => Promise<void>
  
  loadModels: () => Promise<void>
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
  
  // Voice
  loadVoiceProfiles: () => Promise<void>
  createVoiceProfile: (name: string, audioPath: string) => Promise<void>
  deleteVoiceProfile: (id: number) => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string>
  speak: (text: string) => Promise<void>
  stopSpeaking: () => void
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
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
  settings: {
    temperature: 0.7,
    maxTokens: 512,
    contextLength: 2048,
    theme: 'dark',
    accentColor: 'cyan',
    autoSpeak: false,
    sttEnabled: true,
    ttsEnabled: true,
  },

  // Settings
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
    }
  },

  // Models
  loadModels: async () => {
    try {
      const models = await invoke<Model[]>('scan_models')
      set({ models })
    } catch (e) {
      console.error('Failed to load models:', e)
    }
  },

  loadModel: async (path) => {
    set({ isModelLoading: true })
    try {
      await invoke('load_model', { path, contextLength: get().settings.contextLength })
      const model = get().models.find(m => m.path === path)
      if (model) {
        set({ currentModel: { ...model, isLoaded: true } })
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

  // Sessions
  loadSessions: async () => {
    try {
      const sessions = await invoke<Session[]>('get_sessions')
      set({ sessions })
      if (sessions.length > 0 && !get().currentSessionId) {
        get().selectSession(sessions[0].id)
      }
    } catch (e) {
      console.error('Failed to load sessions:', e)
    }
  },

  createSession: async () => {
    try {
      const id = await invoke<number>('create_session', { title: 'Новый чат' })
      await get().loadSessions()
      get().selectSession(id)
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
          get().selectSession(sessions[0].id)
        } else {
          set({ currentSessionId: null, messages: [] })
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  },

  // Chat
  sendMessage: async (content) => {
    const { currentSessionId, currentModel, settings, messages } = get()
    
    if (!currentSessionId || !currentModel) {
      throw new Error('No session or model selected')
    }

    // Add user message
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

      // Build prompt with history
      const history = get().messages.slice(-10)
      
      await invoke('generate', {
        prompt: content,
        history: history.map(m => ({ content: m.content, isUser: m.isUser })),
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      })
    } catch (e) {
      console.error('Failed to send message:', e)
      set({ isGenerating: false })
      throw e
    }
  },

  stopGeneration: () => {
    invoke('stop_generation')
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

      // Save to DB
      if (currentSessionId) {
        invoke('save_message', {
          sessionId: currentSessionId,
          content: assistantMsg.content,
          isUser: false,
        })
      }

      // Auto-speak if enabled
      if (settings.autoSpeak && settings.ttsEnabled) {
        get().speak(assistantMsg.content)
      }
    } else {
      set({ isGenerating: false, pendingResponse: '' })
    }
  },

  // Voice
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

  deleteVoiceProfile: async (id) => {
    try {
      await invoke('delete_voice_profile', { id })
      await get().loadVoiceProfiles()
    } catch (e) {
      console.error('Failed to delete voice profile:', e)
    }
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

  speak: async (text) => {
    set({ isSpeaking: true })
    try {
      const voiceId = get().currentVoice?.id
      await invoke('speak', { text, voiceId })
    } catch (e) {
      console.error('Failed to speak:', e)
    } finally {
      set({ isSpeaking: false })
    }
  },

  stopSpeaking: () => {
    invoke('stop_speaking')
    set({ isSpeaking: false })
  },
}))
