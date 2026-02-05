import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Mic, MicOff, Image, X } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

/** Maximum number of images per message */
const MAX_IMAGES = 4
/** Maximum image size in bytes (5MB) */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
/** Supported image types */
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** Silence duration threshold (ms) before auto-stop and send */
const SILENCE_THRESHOLD_MS = 3000
/** Audio level threshold (0-1) below which we consider "silence" */
const SILENCE_LEVEL_THRESHOLD = 0.01
/** Check interval for silence detection */
const SILENCE_CHECK_INTERVAL_MS = 100

/** Web Speech API typings */
interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechend: (() => void) | null
}

interface ISpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: { transcript: string }
      isFinal: boolean
    }
    length: number
  }
  resultIndex: number
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition
    webkitSpeechRecognition: new () => ISpeechRecognition
  }
}

/** Check if Web Speech API is available */
const isSpeechRecognitionSupported = () =>
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

export function ChatInput() {
  const [text, setText] = useState('')
  const [images, setImages] = useState<string[]>([]) // Base64 encoded images
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const [interimText, setInterimText] = useState('')
  const [silenceProgress, setSilenceProgress] = useState(0) // 0-100%
  
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const blobSavedResolveRef = useRef<(() => void) | null>(null)
  const voiceNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Web Speech API refs
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
  
  // Silence detection refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const silenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStoppedRef = useRef(false)
  
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

  const canSend = (text.trim() || images.length > 0) && currentModel && !isGenerating
  const isVisionBackend = settings.llmBackend === 'ollama' || settings.llmBackend === 'custom'

  const showVoiceNotice = useCallback((message: string) => {
    if (voiceNoticeTimeoutRef.current) clearTimeout(voiceNoticeTimeoutRef.current)
    setVoiceNotice(message)
    voiceNoticeTimeoutRef.current = setTimeout(() => {
      setVoiceNotice(null)
      voiceNoticeTimeoutRef.current = null
    }, 5000)
  }, [])

  /** Handle image file selection */
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (images.length >= MAX_IMAGES) {
        showVoiceNotice(`Максимум ${MAX_IMAGES} изображения`)
        return
      }
      if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        showVoiceNotice('Поддерживаются только JPEG, PNG, GIF, WebP')
        return
      }
      if (file.size > MAX_IMAGE_SIZE) {
        showVoiceNotice('Изображение слишком большое (макс. 5MB)')
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        if (base64) {
          setImages(prev => [...prev, base64])
        }
      }
      reader.readAsDataURL(file)
    })

    // Reset input
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }, [images.length, showVoiceNotice])

  /** Remove image by index */
  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  /** Clean up audio analysis resources */
  const cleanupAudioAnalysis = useCallback(() => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current)
      silenceCheckIntervalRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    audioContextRef.current = null
    analyserRef.current = null
    silenceStartRef.current = null
    setSilenceProgress(0)
  }, [])

  /** Stop recording and process result */
  const stopVoiceRecording = useCallback(async (autoStopped = false) => {
    autoStoppedRef.current = autoStopped
    cleanupAudioAnalysis()
    
    // Stop Web Speech API
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // Already stopped
      }
    }
    
    // Stop MediaRecorder for backup file
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      await new Promise<void>(r => { blobSavedResolveRef.current = r })
    }
    
    // Stop media stream
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    mediaRecorderRef.current = null
    chunksRef.current = []
    
    // Get final transcript from Web Speech API
    const transcript = finalTranscriptRef.current.trim()
    finalTranscriptRef.current = ''
    setInterimText('')
    
    if (transcript) {
      // We have a transcript from Web Speech API
      setText(prev => prev + (prev ? ' ' : '') + transcript)
      
      // Auto-send after 3 seconds of silence
      if (autoStopped && currentModel && !isGenerating) {
        const fullText = (text + (text ? ' ' : '') + transcript).trim()
        if (fullText) {
          setText('')
          try {
            await sendMessage(fullText)
          } catch (e) {
            console.error('Failed to auto-send:', e)
            setText(fullText) // Restore text on error
          }
        }
      }
    } else {
      // Fallback to backend whisper.cpp transcription
      try {
        const result = await stopRecording()
        const trimmed = typeof result === 'string' ? result.trim() : ''
        if (trimmed && !trimmed.includes('Транскрипция') && !trimmed.includes('pip install')) {
          setText(prev => prev + (prev ? ' ' : '') + trimmed)
          
          // Auto-send after silence
          if (autoStopped && currentModel && !isGenerating) {
            const fullText = (text + (text ? ' ' : '') + trimmed).trim()
            if (fullText) {
              setText('')
              try {
                await sendMessage(fullText)
              } catch (e) {
                console.error('Failed to auto-send:', e)
                setText(fullText)
              }
            }
          }
        } else if (trimmed) {
          showVoiceNotice(trimmed)
        }
      } catch (e) {
        console.error('Voice recognition failed:', e)
        const msg =
          typeof e === 'string'
            ? e
            : (e as { message?: string })?.message ?? 'Транскрипция недоступна. Запись сохранена.'
        showVoiceNotice(msg)
        blobSavedResolveRef.current?.()
      }
    }
  }, [cleanupAudioAnalysis, currentModel, isGenerating, sendMessage, showVoiceNotice, stopRecording, text])

  /** Set up silence detection using AudioContext */
  const setupSilenceDetection = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      
      // Check audio level periodically
      silenceCheckIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return
        
        analyserRef.current.getByteFrequencyData(dataArray)
        
        // Calculate RMS (root mean square) for audio level
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length) / 255
        
        if (rms < SILENCE_LEVEL_THRESHOLD) {
          // Silence detected
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now()
          }
          
          const silenceDuration = Date.now() - silenceStartRef.current
          const progress = Math.min(100, (silenceDuration / SILENCE_THRESHOLD_MS) * 100)
          setSilenceProgress(progress)
          
          if (silenceDuration >= SILENCE_THRESHOLD_MS) {
            // 3 seconds of silence - auto-stop and send
            stopVoiceRecording(true)
          }
        } else {
          // Sound detected - reset silence timer
          silenceStartRef.current = null
          setSilenceProgress(0)
        }
      }, SILENCE_CHECK_INTERVAL_MS)
    } catch (e) {
      console.error('Failed to setup silence detection:', e)
    }
  }, [stopVoiceRecording])

  /** Start voice recording with Web Speech API */
  const startVoiceRecording = useCallback(async () => {
    try {
      await startRecording()
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      
      // Setup MediaRecorder for backup file
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
      
      // Setup silence detection
      setupSilenceDetection(stream)
      
      // Try Web Speech API (primary method)
      if (isSpeechRecognitionSupported()) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        const recognition = new SpeechRecognition()
        recognitionRef.current = recognition
        
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'ru-RU' // Russian language
        
        recognition.onresult = (event: ISpeechRecognitionEvent) => {
          let interim = ''
          let final = ''
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              final += transcript
            } else {
              interim += transcript
            }
          }
          
          if (final) {
            finalTranscriptRef.current += final
            setInterimText('')
            // Reset silence timer on speech
            silenceStartRef.current = null
            setSilenceProgress(0)
          } else {
            setInterimText(interim)
          }
        }
        
        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error)
          if (event.error === 'not-allowed') {
            showVoiceNotice('Доступ к микрофону запрещён. Разрешите в настройках браузера.')
          }
        }
        
        recognition.onend = () => {
          // Speech recognition ended
          recognitionRef.current = null
        }
        
        recognition.onspeechend = () => {
          // User stopped speaking - handled by silence detection
        }
        
        recognition.start()
      }
    } catch (e) {
      console.error('Failed to start recording:', e)
      showVoiceNotice('Не удалось получить доступ к микрофону')
    }
  }, [saveVoiceFromChat, setupSilenceDetection, showVoiceNotice, startRecording])

  const handleVoiceInput = async () => {
    if (isRecording) {
      await stopVoiceRecording(false)
    } else {
      await startVoiceRecording()
    }
  }

  const handleSubmit = async () => {
    if (!canSend) return
    
    const message = text.trim()
    const imagesToSend = [...images]
    setText('')
    setImages([])
    
    try {
      await sendMessage(message, imagesToSend)
    } catch (e) {
      console.error('Failed to send:', e)
      // Restore on error
      setText(message)
      setImages(imagesToSend)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (voiceNoticeTimeoutRef.current) clearTimeout(voiceNoticeTimeoutRef.current)
      cleanupAudioAnalysis()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch {
          // Already stopped
        }
      }
    }
  }, [cleanupAudioAnalysis])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px'
    }
  }, [text])

  return (
    <div className="p-4 border-t border-cyber-border bg-cyber-surface">
      {voiceNotice && (
        <p
          role="status"
          className="mb-3 text-sm text-amber-400/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
        >
          {voiceNotice}
        </p>
      )}
      
      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={`data:image/jpeg;base64,${img}`}
                alt={`Изображение ${idx + 1}`}
                className="w-20 h-20 object-cover rounded-lg border border-cyber-border"
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Удалить"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {/* Interim transcription preview */}
      {isRecording && interimText && (
        <p className="mb-3 text-sm text-gray-400 italic bg-cyber-dark/50 rounded-lg px-3 py-2">
          {interimText}...
        </p>
      )}
      
      <div className="flex items-end gap-3">
        {/* Hidden file input for images */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        {/* Voice input with silence progress */}
        {settings.sttEnabled && (
          <div className="relative">
            <button
              onClick={handleVoiceInput}
              className={clsx(
                'p-3 rounded-xl border transition-all relative overflow-hidden',
                isRecording
                  ? 'bg-red-500/20 border-red-500 text-red-500'
                  : 'border-cyber-border text-gray-400 hover:text-neon-cyan hover:border-neon-cyan/50'
              )}
              title={
                isRecording 
                  ? `Остановить запись (авто-отправка после ${SILENCE_THRESHOLD_MS / 1000}с тишины)` 
                  : 'Голосовой ввод'
              }
            >
              {/* Silence progress indicator */}
              {isRecording && silenceProgress > 0 && (
                <div 
                  className="absolute bottom-0 left-0 right-0 bg-neon-cyan/30 transition-all"
                  style={{ height: `${silenceProgress}%` }}
                />
              )}
              <span className="relative z-10">
                {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
              </span>
            </button>
            
            {/* Recording indicator */}
            {isRecording && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
        )}

        {/* Image upload button (only for Vision backends) */}
        {isVisionBackend && (
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={images.length >= MAX_IMAGES || !currentModel}
            className={clsx(
              'p-3 rounded-xl border transition-all',
              images.length >= MAX_IMAGES || !currentModel
                ? 'border-cyber-border text-gray-600 cursor-not-allowed'
                : 'border-cyber-border text-gray-400 hover:text-neon-magenta hover:border-neon-magenta/50'
            )}
            title={`Добавить изображение (${images.length}/${MAX_IMAGES})`}
          >
            <Image size={20} />
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
                : isRecording
                  ? 'Говорите... (3 сек тишины = авто-отправка)'
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
