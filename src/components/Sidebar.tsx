import { Link, useLocation } from 'react-router-dom'
import { 
  MessageSquare, 
  Box, 
  Settings, 
  Mic, 
  Plus,
  Trash2,
  Brain,
  Cpu,
  Zap
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
    currentModel,
    gpuInfo,
    gpuInfoLoading
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
          {(() => {
            const sessionsWithMessages = sessions.filter((s) => s.messageCount > 0)
            const currentSession = sessions.find((s) => s.id === currentSessionId)
            const showNewChat =
              currentSession && currentSession.messageCount === 0
            const displaySessions = [
              ...(showNewChat ? [{ ...currentSession!, title: 'Новый чат' }] : []),
              ...sessionsWithMessages,
            ]
            if (displaySessions.length === 0) {
              return (
                <p className="text-sm text-gray-500 text-center py-4">
                  Нет чатов
                </p>
              )
            }
            return displaySessions.map((session) => (
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
          })()}
        </div>
      </div>

      {/* Model & GPU status */}
      <div className="p-3 border-t border-cyber-border space-y-2">
        {/* GPU/CUDA Status — device name and VRAM from NVML when available */}
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0" title={gpuInfo?.available ? `CUDA · ${gpuInfo.deviceName}${gpuInfo.vramTotalMb ? ` · ${(gpuInfo.vramFreeMb / 1024).toFixed(1)} / ${(gpuInfo.vramTotalMb / 1024).toFixed(1)} GB` : ''}` : 'Режим CPU'}>
            {gpuInfoLoading ? (
              <>
                <div className="w-3 h-3 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin shrink-0" />
                <span className="text-xs text-gray-500">Проверка GPU…</span>
              </>
            ) : gpuInfo?.available ? (
              <>
                <Zap size={14} className="text-neon-green shrink-0" />
                <span className="text-xs text-neon-green font-medium truncate">
                  CUDA{gpuInfo.deviceName && gpuInfo.deviceName !== 'NVIDIA GPU' ? ` · ${gpuInfo.deviceName}` : ''}
                </span>
                <div className="w-2 h-2 rounded-full bg-neon-green animate-pulse shrink-0" aria-hidden />
              </>
            ) : (
              <>
                <Cpu size={14} className="text-yellow-500 shrink-0" />
                <span className="text-xs text-yellow-500 font-medium">CPU</span>
                <div className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" aria-hidden />
              </>
            )}
          </div>
          {gpuInfo?.available && gpuInfo.vramTotalMb > 0 && (
            <div className="text-[10px] text-gray-500 truncate pl-6" title={`Свободно: ${(gpuInfo.vramFreeMb / 1024).toFixed(1)} GB / Всего: ${(gpuInfo.vramTotalMb / 1024).toFixed(1)} GB`}>
              VRAM: {(gpuInfo.vramFreeMb / 1024).toFixed(1)} / {(gpuInfo.vramTotalMb / 1024).toFixed(1)} GB
            </div>
          )}
        </div>
        
        {/* Model Status */}
        <div className="flex items-center gap-2 min-w-0">
          <div className={clsx(
            'w-2 h-2 rounded-full shrink-0',
            currentModel?.isLoaded && 'bg-neon-green animate-pulse',
            currentModel && !currentModel.isLoaded && 'bg-neon-cyan',
            !currentModel && 'bg-red-500'
          )} />
          <span className="text-xs text-gray-400 truncate" title={currentModel?.path}>
            {currentModel
              ? `${currentModel.name}${currentModel.isLoaded ? '' : ' (выбрана)'}`
              : 'Модель не выбрана'}
          </span>
        </div>
      </div>
    </aside>
  )
}
