import { Link, useLocation } from 'react-router-dom'
import { 
  MessageSquare, 
  Box, 
  Settings, 
  Mic, 
  Plus,
  Trash2,
  Brain
} from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

// Constant array - extracted outside component to prevent recreation on each render
const NAV_ITEMS = [
  { path: '/', icon: MessageSquare, label: 'Чат' },
  { path: '/models', icon: Box, label: 'Модели' },
  { path: '/memory', icon: Brain, label: 'Память & Двойник' },
  { path: '/voice-clone', icon: Mic, label: 'Клон голоса' },
  { path: '/settings', icon: Settings, label: 'Настройки' },
] as const

export function Sidebar() {
  const location = useLocation()
  const { 
    sessions, 
    currentSessionId, 
    createSession, 
    selectSession,
    deleteSession,
    currentModel 
  } = useStore()

  return (
    <aside className="w-72 bg-cyber-surface border-r border-cyber-border flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-cyber-border">
        <h1 className="text-2xl font-bold text-neon-cyan text-glow-cyan text-center">
          🧞 WISHMASTER
        </h1>
        <p className="text-xs text-gray-500 text-center mt-1">
          Desktop Edition v1.0
        </p>
      </div>

      {/* Navigation */}
      <nav className="p-2">
        {NAV_ITEMS.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all',
              location.pathname === item.path
                ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                : 'text-gray-400 hover:text-neon-cyan hover:bg-cyber-dark'
            )}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Sessions */}
      <div className="flex-1 flex flex-col border-t border-cyber-border mt-2">
        <div className="p-2 flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider px-2">
            История чатов
          </span>
          <button
            onClick={createSession}
            className="p-1.5 rounded-lg text-neon-green hover:bg-neon-green/10 transition-colors"
            title="Новый чат"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              Нет чатов
            </p>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                className={clsx(
                  'group flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer transition-all',
                  currentSessionId === session.id
                    ? 'bg-neon-magenta/10 text-neon-magenta border border-neon-magenta/30'
                    : 'text-gray-400 hover:bg-cyber-dark'
                )}
                onClick={() => selectSession(session.id)}
              >
                <MessageSquare size={16} className="shrink-0" />
                <span className="flex-1 truncate text-sm">{session.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(session.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-400 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Model status */}
      <div className="p-3 border-t border-cyber-border">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-2 h-2 rounded-full',
            currentModel ? 'bg-neon-green animate-pulse' : 'bg-red-500'
          )} />
          <span className="text-xs text-gray-400 truncate">
            {currentModel ? currentModel.name : 'Модель не загружена'}
          </span>
        </div>
      </div>
    </aside>
  )
}
