import { useEffect, useState } from 'react'
import { Box, Check, Loader2, HardDrive, RefreshCw, FolderOpen } from 'lucide-react'
import { useStore } from '../store'
import { formatSize } from '../utils'
import clsx from 'clsx'

export function ModelsPage() {
  const { 
    models, 
    currentModel, 
    isModelLoading,
    loadModels, 
    loadModel, 
    unloadModel 
  } = useStore()

  const [loadingModel, setLoadingModel] = useState<string | null>(null)

  useEffect(() => {
    loadModels()
  }, [loadModels])

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
      {/* Header */}
      <header className="px-6 py-4 border-b border-cyber-border bg-cyber-surface flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neon-cyan">📦 Модели</h2>
          <p className="text-xs text-gray-500">
            Управление LLM моделями (GGUF)
          </p>
        </div>
        
        <button
          onClick={loadModels}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyber-border text-gray-400 hover:text-neon-cyan hover:border-neon-cyan/50 transition-all"
        >
          <RefreshCw size={16} />
          Сканировать
        </button>
      </header>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Info about model location */}
        <div className="mb-6 p-4 rounded-xl border border-neon-cyan/30 bg-neon-cyan/5">
          <div className="flex items-start gap-3">
            <FolderOpen className="text-neon-cyan mt-0.5" size={20} />
            <div>
              <h3 className="font-bold text-neon-cyan mb-1">Куда положить модели?</h3>
              <p className="text-sm text-gray-400">
                Скачайте .gguf модель и положите в одну из папок:
              </p>
              <div className="mt-2 space-y-1 font-mono text-xs">
                <p className="text-neon-green">~/models/</p>
                <p className="text-neon-green">~/Downloads/</p>
                <p className="text-neon-green">~/.cache/llama.cpp/</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Затем нажмите "Сканировать" для обнаружения
              </p>
            </div>
          </div>
        </div>

        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Box size={64} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-400 mb-2">
              Модели не найдены
            </h3>
            <p className="text-gray-500 mb-4 max-w-md">
              Положите файлы .gguf в папку ~/models или ~/Downloads, 
              затем нажмите "Сканировать"
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
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className={clsx(
                          'font-bold',
                          isLoaded ? 'text-neon-green' : 'text-white'
                        )}>
                          {model.name}
                        </h3>
                        {isLoaded && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-neon-green/20 text-neon-green text-xs">
                            <Check size={12} />
                            Загружена
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        {model.path}
                      </p>
                      
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="flex items-center gap-1 text-gray-400">
                          <HardDrive size={14} />
                          {formatSize(model.size)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isLoaded ? (
                        <button
                          onClick={unloadModel}
                          className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          Выгрузить
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLoadModel(model.path)}
                          disabled={isLoading || isModelLoading}
                          className={clsx(
                            'px-4 py-2 rounded-lg border transition-all flex items-center gap-2',
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
