import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { Cpu, Zap } from 'lucide-react'
import clsx from 'clsx'

// Constant array - extracted outside component to prevent recreation on each render
const ACCENT_COLORS = [
  { id: 'cyan', label: 'Cyan', color: '#00ffff' },
  { id: 'magenta', label: 'Magenta', color: '#ff0080' },
  { id: 'green', label: 'Green', color: '#00ff41' },
  { id: 'yellow', label: 'Yellow', color: '#ffff00' },
  { id: 'purple', label: 'Purple', color: '#bf00ff' },
] as const

/** Debounce delay for slider/text inputs to avoid excessive DB writes */
const DEBOUNCE_MS = 400

export function SettingsPage() {
  const { settings, saveSettings, models, currentModel, selectModel, loadModel, unloadModel, loadModels, gpuInfo, loadGpuInfo, isModelLoading } = useStore()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [localSettings, setLocalSettings] = useState(settings)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local settings when store settings change externally
  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  // Load models and GPU info on mount
  useEffect(() => {
    loadModels()
    loadGpuInfo()
  }, [loadModels, loadGpuInfo])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  /** Immediate save (for toggles, selects) */
  const handleSave = useCallback(async (updates: Parameters<typeof saveSettings>[0]) => {
    setError(null)
    setLocalSettings(prev => ({ ...prev, ...updates }))
    try {
      await saveSettings(updates)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 2500)
    } catch {
      setError('Не удалось сохранить настройки')
    }
  }, [saveSettings])

  /** Debounced save (for sliders, text inputs) */
  const handleDebouncedSave = useCallback((updates: Parameters<typeof saveSettings>[0]) => {
    setLocalSettings(prev => ({ ...prev, ...updates }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setError(null)
      try {
        await saveSettings(updates)
        setSavedAt(Date.now())
        setTimeout(() => setSavedAt(null), 2500)
      } catch {
        setError('Не удалось сохранить настройки')
      }
    }, DEBOUNCE_MS)
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
                <span className="text-sm text-neon-cyan">{localSettings.temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={localSettings.temperature * 100}
                onChange={(e) => handleDebouncedSave({ temperature: Number(e.target.value) / 100 })}
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
                <span className="text-sm text-neon-cyan">{localSettings.maxTokens}</span>
              </div>
              <input
                type="range"
                min="64"
                max="4096"
                step="64"
                value={localSettings.maxTokens}
                onChange={(e) => handleDebouncedSave({ maxTokens: Number(e.target.value) })}
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
                <span className="text-sm text-neon-cyan">{localSettings.contextLength}</span>
              </div>
              <input
                type="range"
                min="512"
                max="8192"
                step="512"
                value={localSettings.contextLength}
                onChange={(e) => handleDebouncedSave({ contextLength: Number(e.target.value) })}
                className="w-full accent-neon-cyan"
              />
              <p className="text-xs text-gray-500 mt-1">
                Сколько предыдущих сообщений помнит AI
              </p>
            </div>
          </div>
        </section>

        {/* LLM Engine + Model Selection */}
        <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <h3 className="text-lg font-bold text-neon-cyan mb-4">
            🧠 Модель
          </h3>

          {/* GPU/CUDA Status */}
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-cyber-dark border border-cyber-border">
            {gpuInfo?.available ? (
              <>
                <Zap size={20} className="text-neon-green shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-neon-green font-bold">CUDA</span>
                  {gpuInfo.deviceName && gpuInfo.deviceName !== 'NVIDIA GPU' && (
                    <span className="text-xs text-gray-400 ml-2">{gpuInfo.deviceName}</span>
                  )}
                  {gpuInfo.vramTotalMb > 0 && (
                    <p className="text-xs text-gray-500">
                      VRAM: {(gpuInfo.vramFreeMb / 1024).toFixed(1)} / {(gpuInfo.vramTotalMb / 1024).toFixed(1)} GB свободно
                    </p>
                  )}
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-neon-green animate-pulse shrink-0" />
              </>
            ) : (
              <>
                <Cpu size={20} className="text-yellow-500 shrink-0" />
                <div className="flex-1">
                  <span className="text-sm text-yellow-500 font-bold">CPU</span>
                  <p className="text-xs text-gray-500">
                    Для ускорения соберите с CUDA: --features cuda
                  </p>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" />
              </>
            )}
          </div>

          {/* Model selection */}
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400 block mb-2">Активная модель</label>
              {models.length > 0 ? (
                <select
                  value={currentModel?.path || ''}
                  onChange={(e) => {
                    const path = e.target.value
                    if (path) {
                      selectModel(path)
                    }
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-cyber-dark border border-cyber-border text-gray-200 focus:border-neon-cyan focus:outline-none"
                >
                  <option value="">Выберите модель...</option>
                  {models.map(m => (
                    <option key={m.path} value={m.path}>
                      {m.name} {currentModel?.path === m.path && currentModel.isLoaded ? '(загружена)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-4 py-3 rounded-lg bg-cyber-dark border border-dashed border-cyber-border text-gray-500 text-sm">
                  Нет моделей. Добавьте GGUF-файл на странице «Модели».
                </div>
              )}
            </div>

            {/* Load/Unload buttons */}
            {currentModel && (
              <div className="flex items-center gap-3">
                <span className={clsx(
                  'px-2 py-1 rounded-full text-xs font-medium',
                  currentModel.isLoaded
                    ? 'bg-neon-green/20 text-neon-green'
                    : 'bg-gray-600/50 text-gray-400'
                )}>
                  {currentModel.isLoaded ? 'В памяти' : 'Не загружена'}
                </span>
                {currentModel.isLoaded ? (
                  <button
                    onClick={() => unloadModel()}
                    className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm"
                  >
                    Выгрузить
                  </button>
                ) : (
                  <button
                    onClick={() => loadModel(currentModel.path)}
                    disabled={isModelLoading}
                    className="px-3 py-1.5 rounded-lg border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 text-sm disabled:opacity-50"
                  >
                    {isModelLoading ? 'Загрузка...' : 'Загрузить'}
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-3">
            Нативный llama.cpp. Добавьте модели GGUF на странице «Модели» или скачайте с HuggingFace.
          </p>
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
            value={localSettings.systemPrompt}
            onChange={(e) => handleDebouncedSave({ systemPrompt: e.target.value })}
            rows={4}
            placeholder="Опишите, как должен вести себя AI..."
            className="w-full px-4 py-3 rounded-lg bg-cyber-dark border border-cyber-border text-gray-200 focus:border-neon-green focus:outline-none resize-none"
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-500">
              {localSettings.systemPrompt.length} символов
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
            <p>LLM: llama.cpp (CUDA) • STT: Whisper.cpp • TTS: Coqui XTTS</p>
            <p className="pt-2 border-t border-cyber-border mt-2">
              © 2026 Wishmaster Team
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
