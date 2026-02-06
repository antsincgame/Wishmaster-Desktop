import { memo, useMemo } from 'react'
import { Message } from '../store'
import { formatTime } from '../utils'
import clsx from 'clsx'

interface Props {
  message: Message
}

export const ChatMessage = memo(function ChatMessage({ message }: Props) {
  const formattedTime = useMemo(() => formatTime(message.timestamp), [message.timestamp])
  
  return (
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
