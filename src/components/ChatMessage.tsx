import { memo, useMemo, useState } from 'react'
import { Message } from '../store'
import { formatTime } from '../utils'
import clsx from 'clsx'

interface Props {
  message: Message
}

/** Image lightbox for viewing full-size images */
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img 
        src={src} 
        alt="Full size" 
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl"
      >
        ✕
      </button>
    </div>
  )
}

export const ChatMessage = memo(function ChatMessage({ message }: Props) {
  const formattedTime = useMemo(() => formatTime(message.timestamp), [message.timestamp])
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  
  const hasImages = message.images && message.images.length > 0
  
  return (
    <>
      <div className={clsx(
        'flex',
        message.isUser ? 'justify-end' : 'justify-start'
      )}>
        <div className={clsx(
          'max-w-[70%] px-4 py-3 rounded-2xl',
          message.isUser
            ? 'bg-neon-magenta/20 border border-neon-magenta/30 text-white glow-magenta'
            : 'bg-neon-cyan/10 border border-neon-cyan/30 text-white glow-cyan'
        )}>
          {/* Images grid */}
          {hasImages && (
            <div className={clsx(
              'mb-2 grid gap-2',
              message.images!.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
            )}>
              {message.images!.map((img, idx) => (
                <img
                  key={idx}
                  src={`data:image/jpeg;base64,${img}`}
                  alt={`Изображение ${idx + 1}`}
                  className="w-full max-h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setLightboxImage(`data:image/jpeg;base64,${img}`)}
                />
              ))}
            </div>
          )}
          
          {/* Text content */}
          {message.content && (
            <p className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          )}
          
          <p className={clsx(
            'text-[10px] mt-1',
            message.isUser ? 'text-neon-magenta/50' : 'text-neon-cyan/50'
          )}>
            {formattedTime}
          </p>
        </div>
      </div>
      
      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </>
  )
})

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-neon-cyan/10 border border-neon-cyan/30 px-4 py-3 rounded-2xl glow-cyan">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-neon-cyan rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-neon-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-neon-cyan rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export function StreamingMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[70%] bg-neon-cyan/10 border border-neon-cyan/30 px-4 py-3 rounded-2xl glow-cyan animate-pulse-border">
        <p className="whitespace-pre-wrap break-words text-white">
          {content}
          <span className="inline-block w-2 h-4 bg-neon-cyan ml-1 animate-pulse" />
        </p>
      </div>
    </div>
  )
}
