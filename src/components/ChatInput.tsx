import { useState, useRef, useEffect } from 'react'
import { Send, Square, Mic, MicOff } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

export function ChatInput() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  
  const { 
    sendMessage, 
    stopGeneration, 
    isGenerating, 
    currentModel,
    isRecording,
    startRecording,
    stopRecording,
    settings
  } = useStore()

  const canSend = text.trim() && currentModel && !isGenerating

  const handleSubmit = async () => {
    if (!canSend) return
    
    const message = text.trim()
    setText('')
    
    try {
      await sendMessage(message)
    } catch (e) {
      console.error('Failed to send:', e)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleVoiceInput = async () => {
    if (isRecording) {
      try {
        const result = await stopRecording()
        if (result && typeof result === 'string' && result.trim()) {
          setText(prev => prev + (prev ? ' ' : '') + result.trim())
        }
      } catch (e) {
        console.error('Voice recognition failed:', e)
      }
    } else {
      try {
        await startRecording()
      } catch (e) {
        console.error('Failed to start recording:', e)
      }
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px'
    }
  }, [text])

  return (
    <div className="p-4 border-t border-cyber-border bg-cyber-surface">
      <div className="flex items-end gap-3">
        {/* Voice input */}
        {settings.sttEnabled && (
          <button
            onClick={handleVoiceInput}
            className={clsx(
              'p-3 rounded-xl border transition-all',
              isRecording
                ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse'
                : 'border-cyber-border text-gray-400 hover:text-neon-cyan hover:border-neon-cyan/50'
            )}
            title={isRecording ? 'Остановить запись' : 'Голосовой ввод'}
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        )}

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !currentModel 
                ? 'Сначала загрузите модель...' 
                : 'Введите сообщение...'
            }
            disabled={!currentModel}
            rows={1}
            className={clsx(
              'w-full px-4 py-3 bg-cyber-dark border rounded-xl resize-none',
              'placeholder:text-gray-600 text-white',
              'focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan/30',
              'transition-all',
              !currentModel 
                ? 'border-red-500/30 cursor-not-allowed opacity-50'
                : 'border-cyber-border'
            )}
          />
        </div>

        {/* Send/Stop button */}
        {isGenerating ? (
          <button
            onClick={stopGeneration}
            className="p-3 rounded-xl bg-red-500/20 border border-red-500 text-red-500 hover:bg-red-500/30 transition-all"
            title="Остановить генерацию"
          >
            <Square size={20} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className={clsx(
              'p-3 rounded-xl border transition-all',
              canSend
                ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30 glow-cyan'
                : 'border-cyber-border text-gray-600 cursor-not-allowed'
            )}
            title="Отправить"
          >
            <Send size={20} />
          </button>
        )}
      </div>
    </div>
  )
}
