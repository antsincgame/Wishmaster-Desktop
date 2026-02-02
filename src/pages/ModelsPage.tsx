import { useEffect, useState } from 'react'
import { Box, Check, Loader2, HardDrive, Plus, Trash2, FolderOpen } from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

export function ModelsPage() {
  const { 
    models, 
    currentModel, 
    isModelLoading,
    loadModels, 
    addModelPath,
    removeModelPath,
    loadModel, 
    unloadModel 
  } = useStore()

  const [loadingModel, setLoadingModel] = useState<string | null>(null)
  const [newPath, setNewPath] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const handleAddPath = async () => {
    const path = newPath.trim()
    if (!path) return
    setPathError(null)
    try {
      await addModelPath(path)
      setNewPath('')
    } catch (e) {
      setPathError('Не удалось добавить путь')
    }
  }

  const handleLoadModel = async (path: string) => {
    setLoadingModel(path)
    try {
      await loadModel(path)
    } catch (e) {
      console.error('Failed to load model:', e)
    } finally {
      setLoadingModel(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-cyber-border bg-cyber-surface flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neon-cyan">📦 Модели</h2>
          <p className="text-xs text-gray-500">
            Укажите пути к GGUF-моделям вручную
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Add path manually */}
        <section className="p-4 rounded-xl border border-neon-cyan/30 bg-neon-cyan/5">
          <h3 className="text-sm font-bold text-neon-cyan mb-3 flex items-center gap-2">
            <FolderOpen size={18} />
            Добавить путь к модели
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => { setNewPath(e.target.value); setPathError(null) }}
              placeholder="/home/user/models/model.gguf или ~/Downloads/model.gguf"
              className="flex-1 px-4 py-2 rounded-lg bg-cyber-dark border border-cyber-border text-white placeholder-gray-500 focus:border-neon-cyan focus:outline-none"
            />
            <button
              onClick={handleAddPath}
              disabled={!newPath.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-cyan/20 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} />
              Добавить
            </button>
          </div>
          {pathError && <p className="text-red-400 text-sm mt-2">{pathError}</p>}
          <p className="text-xs text-gray-500 mt-2">
            Введите полный путь к файлу .gguf
          </p>
        </section>

        {/* Model list */}
        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Box size={64} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-400 mb-2">
              Нет добавленных моделей
            </h3>
            <p className="text-gray-500 max-w-md">
              Добавьте путь к модели выше (например: ~/models/qwen2.5-7b.gguf)
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {models.map((model) => {
              const isLoaded = currentModel?.path === model.path
              const isLoading = loadingModel === model.path

              return (
                <div
                  key={model.path}
                  className={clsx(
                    'p-4 rounded-xl border transition-all',
                    isLoaded
                      ? 'bg-neon-green/10 border-neon-green/50 glow-green'
                      : 'bg-cyber-surface border-cyber-border hover:border-neon-cyan/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={clsx(
                          'font-bold truncate',
                          isLoaded ? 'text-neon-green' : 'text-white'
                        )}>
                          {model.name}
                        </h3>
                        {isLoaded && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neon-green/20 text-neon-green text-xs shrink-0">
                            <Check size={12} />
                            Загружена
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 truncate" title={model.path}>
                        {model.path}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isLoaded ? (
                        <button
                          onClick={unloadModel}
                          className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                          Выгрузить
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLoadModel(model.path)}
                          disabled={isLoading || isModelLoading}
                          className={clsx(
                            'px-4 py-2 rounded-lg border flex items-center gap-2',
                            isLoading || isModelLoading
                              ? 'border-gray-600 text-gray-500 cursor-not-allowed'
                              : 'border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10'
                          )}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Загрузка...
                            </>
                          ) : (
                            'Загрузить'
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => removeModelPath(model.path)}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                        title="Удалить путь"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Recommended models */}
        <div className="mt-8 p-4 rounded-xl border border-cyber-border bg-cyber-surface/50">
          <h4 className="text-sm font-bold text-neon-yellow mb-3">
            💡 Рекомендуемые модели
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-cyber-dark">
              <p className="font-bold text-neon-cyan">Qwen2.5 7B Q4_K_M</p>
              <p className="text-gray-500">Лучший русский • ~5 GB</p>
            </div>
            <div className="p-3 rounded-lg bg-cyber-dark">
              <p className="font-bold text-neon-magenta">DeepSeek 7B Q4_K_M</p>
              <p className="text-gray-500">Лучший для кода • ~3.5 GB</p>
            </div>
            <div className="p-3 rounded-lg bg-cyber-dark">
              <p className="font-bold text-neon-green">Gemma 3n</p>
              <p className="text-gray-500">Компактная • ~2 GB</p>
            </div>
            <div className="p-3 rounded-lg bg-cyber-dark">
              <p className="font-bold text-neon-purple">Llama 3.1 8B Q4_K_M</p>
              <p className="text-gray-500">Длинный контекст • ~6 GB</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
