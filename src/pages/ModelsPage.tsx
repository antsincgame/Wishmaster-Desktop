import { useEffect, useState } from 'react'
import { Box, Check, Loader2, Plus, Trash2, FolderOpen, FileSearch, Download, Cloud } from 'lucide-react'
import { useStore } from '../store'
import { open } from '@tauri-apps/plugin-dialog'
import { ModelBrowserModal } from '../components/ModelBrowserModal'
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
  const [showBrowser, setShowBrowser] = useState(false)

  useEffect(() => {
    loadModels()
  }, [loadModels])

  // Open file picker dialog
  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'GGUF Models',
          extensions: ['gguf']
        }],
        title: 'Выберите модель GGUF'
      })
      
      if (selected && typeof selected === 'string') {
        setNewPath(selected)
        setPathError(null)
        // Auto-add the selected path
        try {
          await addModelPath(selected)
          setNewPath('')
        } catch (e) {
          setPathError('Не удалось добавить модель')
        }
      }
    } catch (e) {
      console.error('File dialog error:', e)
      setPathError('Ошибка открытия диалога файлов')
    }
  }

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
            Добавьте GGUF-модели через обзор файлов или вручную
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Download from HuggingFace */}
        <section className="p-4 rounded-xl border border-neon-magenta/30 bg-neon-magenta/5">
          <h3 className="text-sm font-bold text-neon-magenta mb-3 flex items-center gap-2">
            <Cloud size={18} />
            Скачать с HuggingFace
          </h3>
          <button
            onClick={() => setShowBrowser(true)}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-neon-magenta/10 border-2 border-dashed border-neon-magenta/50 text-neon-magenta hover:bg-neon-magenta/20 hover:border-neon-magenta transition-all"
          >
            <Download size={24} />
            <span className="text-lg font-bold">Обзор моделей...</span>
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Qwen, Llama, Mistral, DeepSeek и другие GGUF модели
          </p>
        </section>

        {/* Add model - File picker */}
        <section className="p-4 rounded-xl border border-neon-cyan/30 bg-neon-cyan/5">
          <h3 className="text-sm font-bold text-neon-cyan mb-3 flex items-center gap-2">
            <FolderOpen size={18} />
            Добавить локальную модель
          </h3>
          
          {/* Browse button */}
          <button
            onClick={handleBrowse}
            className="w-full mb-4 flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-neon-cyan/10 border-2 border-dashed border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan transition-all"
          >
            <FileSearch size={24} />
            <span className="text-lg font-bold">Обзор файлов...</span>
          </button>
          
          {/* Manual path input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => { setNewPath(e.target.value); setPathError(null) }}
              placeholder="Или введите путь вручную: /home/user/model.gguf"
              className="flex-1 px-4 py-2 rounded-lg bg-cyber-dark border border-cyber-border text-white placeholder-gray-500 focus:border-neon-cyan focus:outline-none text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAddPath()}
            />
            <button
              onClick={handleAddPath}
              disabled={!newPath.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neon-cyan/20 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} />
            </button>
          </div>
          {pathError && <p className="text-red-400 text-sm mt-2">{pathError}</p>}
        </section>

        {/* Model list */}
        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Box size={64} className="text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-400 mb-2">
              Нет добавленных моделей
            </h3>
            <p className="text-gray-500 max-w-md">
              Нажмите "Обзор файлов" чтобы выбрать GGUF модель
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

        {/* Tip */}
        <div className="mt-8 p-4 rounded-xl border border-cyber-border bg-cyber-surface/50">
          <h4 className="text-sm font-bold text-neon-yellow mb-2">
            💡 Совет
          </h4>
          <p className="text-sm text-gray-400">
            Для русского языка рекомендуем <span className="text-neon-cyan font-bold">Qwen 2.5</span>.
            Для кода — <span className="text-neon-magenta font-bold">Qwen Coder</span> или <span className="text-neon-magenta font-bold">DeepSeek Coder</span>.
            Квантизация <span className="text-neon-green font-bold">Q4_K_M</span> — лучший баланс качества и размера.
          </p>
        </div>
      </div>

      {/* HuggingFace Browser Modal */}
      <ModelBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
      />
    </div>
  )
}
