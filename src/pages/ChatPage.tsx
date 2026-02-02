import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { ChatMessage, StreamingMessage, TypingIndicator } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'
import { useStore } from '../store'

export function ChatPage() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { 
    messages, 
    isGenerating, 
    pendingResponse,
    appendToken,
    finishGeneration,
    currentModel,
    createSession,
    sessions
  } = useStore()

  // Listen for token events from Rust backend
  useEffect(() => {
    const unlisten = listen<string>('llm-token', (event) => {
      appendToken(event.payload)
    })

    const unlistenFinish = listen('llm-finished', () => {
      finishGeneration()
    })

    return () => {
      unlisten.then(fn => fn())
      unlistenFinish.then(fn => fn())
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingResponse])

  // Create session if none exists
  useEffect(() => {
    if (sessions.length === 0) {
      createSession()
    }
  }, [sessions])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-cyber-border bg-cyber-surface flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neon-cyan">💬 Чат</h2>
          <p className="text-xs text-gray-500">
            {currentModel 
              ? `Модель: ${currentModel.name}` 
              : 'Модель не загружена'}
          </p>
        </div>
        
        {isGenerating && (
          <div className="flex items-center gap-2 text-neon-green">
            <div className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
            <span className="text-sm">Генерация...</span>
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && !isGenerating && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
            <div className="text-6xl mb-4">🧞</div>
            <h3 className="text-xl font-bold text-neon-cyan mb-2">
              Добро пожаловать в Wishmaster!
            </h3>
            <p className="text-gray-500 max-w-md">
              {currentModel 
                ? 'Напишите сообщение, чтобы начать диалог с AI'
                : 'Загрузите модель в разделе "Модели", чтобы начать'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {isGenerating && pendingResponse && (
          <StreamingMessage content={pendingResponse} />
        )}

        {/* Typing indicator */}
        {isGenerating && !pendingResponse && (
          <TypingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  )
}
