import { useState, useCallback } from 'react'
import { useStore } from '../store'
import clsx from 'clsx'

// Constant array - extracted outside component to prevent recreation on each render
const ACCENT_COLORS = [
  { id: 'cyan', label: 'Cyan', color: '#00ffff' },
  { id: 'magenta', label: 'Magenta', color: '#ff0080' },
  { id: 'green', label: 'Green', color: '#00ff41' },
  { id: 'yellow', label: 'Yellow', color: '#ffff00' },
  { id: 'purple', label: 'Purple', color: '#bf00ff' },
] as const

export function SettingsPage() {
  const { settings, saveSettings } = useStore()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async (updates: Parameters<typeof saveSettings>[0]) => {
    setError(null)
    try {
      await saveSettings(updates)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 2500)
    } catch (e) {
      setError('Не удалось сохранить настройки')
    }
  }, [saveSettings])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-cyber-border bg-cyber-surface flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neon-cyan">⚙️ Настройки</h2>
          <p className="text-xs text-gray-500">
            Параметры генерации и интерфейса
          </p>
        </div>
        {savedAt !== null && (
          <span className="text-sm text-neon-green animate-pulse">✓ Сохранено</span>
        )}
        {error && (
          <span className="text-sm text-red-400">{error}</span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Generation settings */}
        <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <h3 className="text-lg font-bold text-neon-cyan mb-4">
            🎛️ Параметры генерации
          </h3>

          <div className="space-y-4">
            {/* Temperature */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Температура</label>
                <span className="text-sm text-neon-cyan">{settings.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.temperature * 100}
                onChange={(e) => handleSave({ temperature: Number(e.target.value) / 100 })}
                className="w-full accent-neon-cyan"
              />
              <p className="text-xs text-gray-500 mt-1">
                Выше = более креативные ответы, ниже = более точные
              </p>
            </div>

            {/* Max tokens */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Макс. токенов</label>
                <span className="text-sm text-neon-cyan">{settings.maxTokens}</span>
              </div>
              <input
                type="range"
                min="64"
                max="4096"
                step="64"
                value={settings.maxTokens}
                onChange={(e) => handleSave({ maxTokens: Number(e.target.value) })}
                className="w-full accent-neon-cyan"
              />
              <p className="text-xs text-gray-500 mt-1">
                Максимальная длина ответа
              </p>
            </div>

            {/* Context length */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Длина контекста</label>
                <span className="text-sm text-neon-cyan">{settings.contextLength}</span>
              </div>
              <input
                type="range"
                min="512"
                max="8192"
                step="512"
                value={settings.contextLength}
                onChange={(e) => handleSave({ contextLength: Number(e.target.value) })}
                className="w-full accent-neon-cyan"
              />
              <p className="text-xs text-gray-500 mt-1">
                Сколько предыдущих сообщений помнит AI
              </p>
            </div>
          </div>
        </section>

        {/* System Prompt */}
        <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <h3 className="text-lg font-bold text-neon-green mb-4">
            🤖 Системный промпт
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Инструкции для AI, определяющие его поведение и стиль ответов
          </p>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => handleSave({ systemPrompt: e.target.value })}
            rows={4}
            placeholder="Опишите, как должен вести себя AI..."
            className="w-full px-4 py-3 rounded-lg bg-cyber-dark border border-cyber-border text-gray-200 focus:border-neon-green focus:outline-none resize-none"
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-500">
              {settings.systemPrompt.length} символов
            </p>
            <button
              onClick={() => handleSave({ 
                systemPrompt: 'Ты — Wishmaster, умный диалоговый AI-ассистент с долговременной памятью. Отвечай кратко и по делу на русском языке. Отвечай только содержательным текстом, без процентов, формул сходства и служебных меток.'
              })}
              className="text-xs text-gray-400 hover:text-neon-cyan"
            >
              Сбросить по умолчанию
            </button>
          </div>
        </section>

        {/* Voice settings */}
        <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <h3 className="text-lg font-bold text-neon-magenta mb-4">
            🎤 Голосовые настройки
          </h3>

          <div className="space-y-4">
            {/* STT */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Голосовой ввод (STT)</p>
                <p className="text-xs text-gray-500">Whisper.cpp</p>
              </div>
              <button
                onClick={() => handleSave({ sttEnabled: !settings.sttEnabled })}
                className={clsx(
                  'w-12 h-6 rounded-full transition-all',
                  settings.sttEnabled ? 'bg-neon-cyan' : 'bg-gray-600'
                )}
              >
                <div className={clsx(
                  'w-5 h-5 rounded-full bg-white transition-transform',
                  settings.sttEnabled ? 'translate-x-6' : 'translate-x-0.5'
                )} />
              </button>
            </div>

            {/* TTS */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Озвучка (TTS)</p>
                <p className="text-xs text-gray-500">Coqui XTTS + Клонирование</p>
              </div>
              <button
                onClick={() => handleSave({ ttsEnabled: !settings.ttsEnabled })}
                className={clsx(
                  'w-12 h-6 rounded-full transition-all',
                  settings.ttsEnabled ? 'bg-neon-magenta' : 'bg-gray-600'
                )}
              >
                <div className={clsx(
                  'w-5 h-5 rounded-full bg-white transition-transform',
                  settings.ttsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                )} />
              </button>
            </div>

            {/* Auto-speak */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Автоматическая озвучка</p>
                <p className="text-xs text-gray-500">Озвучивать ответы AI</p>
              </div>
              <button
                onClick={() => handleSave({ autoSpeak: !settings.autoSpeak })}
                disabled={!settings.ttsEnabled}
                className={clsx(
                  'w-12 h-6 rounded-full transition-all',
                  !settings.ttsEnabled && 'opacity-50 cursor-not-allowed',
                  settings.autoSpeak && settings.ttsEnabled ? 'bg-neon-green' : 'bg-gray-600'
                )}
              >
                <div className={clsx(
                  'w-5 h-5 rounded-full bg-white transition-transform',
                  settings.autoSpeak && settings.ttsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <h3 className="text-lg font-bold text-neon-yellow mb-4">
            🎨 Оформление
          </h3>

          <div className="space-y-4">
            {/* Theme */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Тема</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave({ theme: 'dark' })}
                  className={clsx(
                    'flex-1 px-4 py-2 rounded-lg border transition-all',
                    settings.theme === 'dark'
                      ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan'
                      : 'border-cyber-border text-gray-400'
                  )}
                >
                  🌙 Тёмная
                </button>
                <button
                  onClick={() => handleSave({ theme: 'light' })}
                  className={clsx(
                    'flex-1 px-4 py-2 rounded-lg border transition-all',
                    settings.theme === 'light'
                      ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan'
                      : 'border-cyber-border text-gray-400'
                  )}
                >
                  ☀️ Светлая
                </button>
              </div>
            </div>

            {/* Accent color */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Акцентный цвет</label>
              <div className="flex gap-2">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSave({ accentColor: c.id })}
                    className={clsx(
                      'w-10 h-10 rounded-lg border-2 transition-all',
                      settings.accentColor === c.id
                        ? 'border-white scale-110'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                    style={{ backgroundColor: c.color }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <h3 className="text-lg font-bold text-gray-400 mb-4">
            ℹ️ О программе
          </h3>
          <div className="text-sm text-gray-500 space-y-2">
            <p><span className="text-neon-cyan">Wishmaster Desktop</span> v1.0.0</p>
            <p>Built with Tauri + Rust + React</p>
            <p>LLM: llama.cpp • STT: Whisper.cpp • TTS: Coqui XTTS</p>
            <p className="pt-2 border-t border-cyber-border mt-2">
              © 2026 Wishmaster Team
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
