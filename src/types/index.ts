/**
 * Wishmaster Desktop - Type Definitions
 * 
 * This file contains all TypeScript interfaces and types used throughout
 * the application. Types are organized by domain.
 * 
 * @module types
 */

// ==================== MESSAGE TYPES ====================

/**
 * Represents a single chat message
 */
export interface Message {
  /** Unique message identifier */
  id: number;
  /** Message text content */
  content: string;
  /** True if message is from user, false if from AI */
  isUser: boolean;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Message with history context (used for generation)
 */
export interface HistoryMessage {
  content: string;
  isUser: boolean;
}

/**
 * Message role type
 */
export type MessageRole = 'user' | 'assistant' | 'system';

// ==================== SESSION TYPES ====================

/**
 * Represents a chat session
 */
export interface Session {
  /** Unique session identifier */
  id: number;
  /** Session title (usually first message or "Новый чат") */
  title: string;
  /** Unix timestamp when session was created */
  createdAt: number;
  /** Total number of messages in session */
  messageCount: number;
}

// ==================== MODEL TYPES ====================

/**
 * Represents a loaded or available GGUF model
 */
export interface Model {
  /** Model display name (extracted from filename) */
  name: string;
  /** Full path to the .gguf file */
  path: string;
  /** File size in bytes */
  size: number;
  /** Whether model is currently loaded in memory */
  isLoaded: boolean;
}

/**
 * GPU/CUDA information
 */
export interface GpuInfo {
  /** Whether GPU acceleration is available */
  available: boolean;
  /** Backend type: "CUDA", "Metal", "CPU" */
  backend: string;
  /** GPU device name */
  deviceName: string;
  /** Total VRAM in megabytes */
  vramTotalMb: number;
  /** Available VRAM in megabytes */
  vramFreeMb: number;
}

// ==================== VOICE TYPES ====================

/**
 * Represents a voice profile for TTS
 */
export interface VoiceProfile {
  /** Unique profile identifier */
  id: number;
  /** User-defined profile name */
  name: string;
  /** Path to the reference audio file */
  audioPath: string;
  /** Unix timestamp when profile was created */
  createdAt: number;
}

/**
 * Represents a saved voice recording
 */
export interface VoiceRecording {
  /** Unique recording identifier */
  id: number;
  /** Path to the audio file */
  path: string;
  /** Unix timestamp when recording was made */
  createdAt: number;
}

// ==================== MEMORY TYPES ====================

/**
 * Memory categories for organizing facts
 */
export type MemoryCategory = 
  | 'fact'       // General facts
  | 'preference' // User preferences
  | 'name'       // Names of people, places
  | 'topic'      // Topics of interest
  | 'skill'      // User skills
  | 'goal';      // User goals

/**
 * Represents a long-term memory entry
 */
export interface MemoryEntry {
  /** Unique memory identifier */
  id: number;
  /** Memory content text */
  content: string;
  /** Category for organization */
  category: MemoryCategory | string;
  /** Session where memory was extracted from */
  sourceSessionId: number;
  /** Message where memory was extracted from */
  sourceMessageId: number;
  /** Importance level 1-10 */
  importance: number;
  /** Unix timestamp when memory was created */
  createdAt: number;
}

/**
 * User persona analysis result (digital twin profile)
 */
export interface UserPersona {
  /** Unique persona identifier */
  id: number;
  /** Writing style: "formal", "casual", "technical" */
  writingStyle: string;
  /** Average message length in characters */
  avgMessageLength: number;
  /** JSON array of common phrases */
  commonPhrases: string;
  /** JSON array of topics user is interested in */
  topicsOfInterest: string;
  /** Primary language: "ru", "en" */
  language: string;
  /** Emoji usage: "none", "minimal", "moderate", "heavy" */
  emojiUsage: string;
  /** Tone: "friendly", "professional", "humorous", "inquisitive" */
  tone: string;
  /** Number of messages analyzed */
  messagesAnalyzed: number;
  /** Unix timestamp of last update */
  lastUpdated: number;
}

/**
 * Message with global context (for cross-session search)
 */
export interface GlobalMessage {
  id: number;
  sessionId: number;
  sessionTitle: string;
  content: string;
  isUser: boolean;
  timestamp: number;
}

/**
 * Statistics about stored data
 */
export interface DataStats {
  totalSessions: number;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalMemories: number;
  totalCharacters: number;
  estimatedTokens: number;
}

// ==================== SEMANTIC SEARCH TYPES ====================

/**
 * Result from semantic search (RAG)
 */
export interface SearchResult {
  /** Source type: "message", "memory", "document" */
  sourceType: string;
  /** ID of the source item */
  sourceId: number;
  /** Content text */
  content: string;
  /** Similarity score (0.0 - 1.0) */
  similarity: number;
}

/**
 * Embedding statistics
 */
export interface EmbeddingStats {
  totalEmbeddings: number;
  byType: Record<string, number>;
  embeddingDimension: number;
  model: string;
}

// ==================== SETTINGS TYPES ====================

/**
 * Theme options
 */
export type Theme = 'dark' | 'light';

/**
 * Accent color options
 */
export type AccentColor = 'cyan' | 'magenta' | 'green' | 'yellow' | 'purple';

/**
 * Application settings
 */
export interface Settings {
  /** LLM temperature (0.0 - 1.0) */
  temperature: number;
  /** Maximum tokens to generate */
  maxTokens: number;
  /** Context window size */
  contextLength: number;
  /** UI theme */
  theme: Theme;
  /** UI accent color */
  accentColor: AccentColor | string;
  /** Auto-speak AI responses */
  autoSpeak: boolean;
  /** Speech-to-text enabled */
  sttEnabled: boolean;
  /** Text-to-speech enabled */
  ttsEnabled: boolean;
  /** Paths to GGUF model files */
  modelPaths: string[];
  /** Custom system prompt for LLM */
  systemPrompt: string;
}

// ==================== EXPORT FORMAT TYPES ====================

/**
 * Alpaca format for fine-tuning
 */
export interface AlpacaEntry {
  instruction: string;
  input: string;
  output: string;
}

/**
 * ShareGPT conversation format
 */
export interface ShareGPTConversation {
  id: string;
  conversations: Array<{
    from: 'human' | 'gpt';
    value: string;
  }>;
}

/**
 * Full export data structure
 */
export interface ExportData {
  sessions: Session[];
  messages: GlobalMessage[];
  memory: MemoryEntry[];
  persona: UserPersona | null;
  exportedAt: number;
}

// ==================== API RESPONSE TYPES ====================

/**
 * Generic API error response
 */
export interface ApiError {
  code: string;
  message: string;
  details?: string;
}

/**
 * Result type for API calls
 */
export type Result<T, E = ApiError> = 
  | { success: true; data: T }
  | { success: false; error: E };

// ==================== CONSTANTS ====================

/**
 * Memory category configuration
 */
export const MEMORY_CATEGORIES = [
  { id: 'fact' as const, label: 'Факт', icon: '📌' },
  { id: 'preference' as const, label: 'Предпочтение', icon: '❤️' },
  { id: 'name' as const, label: 'Имя', icon: '👤' },
  { id: 'topic' as const, label: 'Тема', icon: '💡' },
  { id: 'skill' as const, label: 'Навык', icon: '🛠️' },
  { id: 'goal' as const, label: 'Цель', icon: '🎯' },
] as const;

/**
 * Accent color configuration
 */
export const ACCENT_COLORS = [
  { id: 'cyan' as const, label: 'Cyan', color: '#00ffff' },
  { id: 'magenta' as const, label: 'Magenta', color: '#ff0080' },
  { id: 'green' as const, label: 'Green', color: '#00ff41' },
  { id: 'yellow' as const, label: 'Yellow', color: '#ffff00' },
  { id: 'purple' as const, label: 'Purple', color: '#bf00ff' },
] as const;

/**
 * Navigation items
 */
export const NAV_ITEMS = [
  { path: '/', icon: 'MessageSquare', label: 'Чат' },
  { path: '/models', icon: 'Box', label: 'Модели' },
  { path: '/memory', icon: 'Brain', label: 'Память & Двойник' },
  { path: '/voice-clone', icon: 'Mic', label: 'Клон голоса' },
  { path: '/settings', icon: 'Settings', label: 'Настройки' },
] as const;

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = {
  temperature: 0.7,
  maxTokens: 512,
  contextLength: 2048,
  theme: 'dark',
  accentColor: 'cyan',
  autoSpeak: false,
  sttEnabled: true,
  ttsEnabled: true,
  modelPaths: [],
  systemPrompt: 'Ты — Wishmaster, умный диалоговый AI-ассистент с долговременной памятью. Отвечай кратко и по делу на русском языке. Отвечай только содержательным текстом, без процентов, формул сходства и служебных меток.',
};
