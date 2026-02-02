import { useState, useRef, useEffect } from 'react'
import { Send, Square, Mic, MicOff } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

export function ChatInput() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobSavedResolveRef = useRef<(() => void) | null>(null)
  
  const { 
    sendMessage, 
    stopGeneration, 
    isGenerating, 
    currentModel,
    isRecording,
    startRecording,
    stopRecording,
    saveVoiceFromChat,
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
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
          await new Promise<void>(r => { blobSavedResolveRef.current = r })
        }
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        mediaRecorderRef.current = null
        chunksRef.current = []

        const result = await stopRecording()
        if (result && typeof result === 'string' && result.trim()) {
          setText(prev => prev + (prev ? ' ' : '') + result.trim())
        }
      } catch (e) {
        console.error('Voice recognition failed:', e)
        blobSavedResolveRef.current?.()
      }
    } else {
      try {
        await startRecording()
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const mr = new MediaRecorder(stream)
        mediaRecorderRef.current = mr
        chunksRef.current = []
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        mr.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          if (blob.size > 0) {
            try {
              const reader = new FileReader()
              reader.onloadend = async () => {
                const base64 = (reader.result as string)?.split(',')[1]
                if (base64) await saveVoiceFromChat(base64)
                blobSavedResolveRef.current?.()
              }
              reader.readAsDataURL(blob)
            } catch {
              blobSavedResolveRef.current?.()
            }
          } else {
            blobSavedResolveRef.current?.()
          }
        }
        mr.start()
      } catch (e) {
        console.error('Failed to start recording:', e)
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

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
            title={isRecording ? 'Остановить запись' : 'Голосовой ввод (сохраняется в БД)'}
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
