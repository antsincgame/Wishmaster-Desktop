import { useState, useEffect, useCallback } from 'react'
import { X, Download, Search, Loader2, ChevronRight, ExternalLink, AlertCircle, HardDrive } from 'lucide-react'
import { useStore } from '../store'
import { listen } from '@tauri-apps/api/event'
import type { DownloadProgress, HfModelFile, PopularModel } from '../types'
import clsx from 'clsx'

interface ModelBrowserModalProps {
  isOpen: boolean
  onClose: () => void
}

type ViewMode = 'popular' | 'search' | 'files'

export function ModelBrowserModal({ isOpen, onClose }: ModelBrowserModalProps) {
  const {
    hfFiles,
    hfPopularModels,
    hfDownloadProgress,
    isDownloading,
    hfError,
    listHfFiles,
    loadPopularModels,
    downloadHfModel,
    setDownloadProgress,
  } = useStore()

  const [viewMode, setViewMode] = useState<ViewMode>('popular')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)

  // Load popular models on mount
  useEffect(() => {
    if (isOpen && hfPopularModels.length === 0) {
      loadPopularModels()
    }
  }, [isOpen, hfPopularModels.length, loadPopularModels])

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('hf-download-progress', (event) => {
      setDownloadProgress(event.payload)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [setDownloadProgress])

  const handleSelectRepo = useCallback(async (repoId: string) => {
    setSelectedRepo(repoId)
    setViewMode('files')
    setIsLoadingFiles(true)
    try {
      await listHfFiles(repoId)
    } finally {
      setIsLoadingFiles(false)
    }
  }, [listHfFiles])

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim()
    if (!query) return
    
    // If query looks like a repo ID (contains /), search it directly
    if (query.includes('/')) {
      await handleSelectRepo(query)
    } else {
      // Otherwise, search in popular models or show message
      setViewMode('search')
    }
  }, [searchQuery, handleSelectRepo])

  const handleDownload = useCallback(async (file: HfModelFile) => {
    if (!selectedRepo || isDownloading) return
    
    try {
      await downloadHfModel(selectedRepo, file.filename)
    } catch (e) {
      console.error('Download failed:', e)
    }
  }, [selectedRepo, isDownloading, downloadHfModel])

  const handleBack = useCallback(() => {
    if (viewMode === 'files') {
      setSelectedRepo(null)
      setViewMode('popular')
    }
  }, [viewMode])

  if (!isOpen) return null

  const filteredPopular = searchQuery.trim()
    ? hfPopularModels.filter(m => 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.repoId.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : hfPopularModels

  const groupedByCategory = filteredPopular.reduce((acc, model) => {
    if (!acc[model.category]) {
      acc[model.category] = []
    }
    acc[model.category].push(model)
    return acc
  }, {} as Record<string, PopularModel[]>)

  const categoryLabels: Record<string, string> = {
    awq: '🚀 AWQ-GGUF (конвертированные)',
    multilingual: '🌍 Мультиязычные',
    code: '💻 Для кода',
    compact: '⚡ Компактные',
    general: '🎯 Универсальные',
  }

  // Ensure AWQ category appears first
  const categoryOrder = ['awq', 'multilingual', 'code', 'compact', 'general']
  const sortedCategories = Object.entries(groupedByCategory).sort(([a], [b]) => {
    const aIdx = categoryOrder.indexOf(a)
    const bIdx = categoryOrder.indexOf(b)
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] bg-cyber-dark border border-neon-cyan/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyber-border bg-cyber-surface">
          <div className="flex items-center gap-3">
            {viewMode === 'files' && (
              <button
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-cyber-dark text-gray-400 hover:text-white"
              >
                ←
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-neon-cyan flex items-center gap-2">
                <HardDrive size={24} />
                {viewMode === 'files' ? selectedRepo : 'Скачать модель с HuggingFace'}
              </h2>
              <p className="text-xs text-gray-500">
                {viewMode === 'files' 
                  ? 'Выберите файл для скачивания'
                  : 'Выберите модель или введите repo ID'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-cyber-dark text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search bar */}
        {viewMode !== 'files' && (
          <div className="px-6 py-4 border-b border-cyber-border">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Поиск или repo ID (напр. Qwen/Qwen2.5-7B-Instruct-GGUF)"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-cyber-dark border border-cyber-border text-white placeholder-gray-500 focus:border-neon-cyan focus:outline-none"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-6 py-3 rounded-xl bg-neon-cyan/20 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30 font-bold"
              >
                Найти
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error message */}
          {hfError && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/50 text-red-400 flex items-center gap-3">
              <AlertCircle size={20} />
              <span>{hfError}</span>
            </div>
          )}

          {/* Download progress */}
          {isDownloading && hfDownloadProgress && (
            <div className="mb-4 p-4 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-neon-cyan font-bold flex items-center gap-2">
                  <Loader2 className="animate-spin" size={18} />
                  Загрузка: {hfDownloadProgress.filename}
                </span>
                <span className="text-gray-400">
                  {hfDownloadProgress.percent.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-cyber-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-neon-cyan transition-all duration-300"
                  style={{ width: `${hfDownloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Files view */}
          {viewMode === 'files' && (
            <div className="space-y-2">
              {isLoadingFiles ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="animate-spin text-neon-cyan mb-4" size={48} />
                  <p className="text-gray-400">Загрузка списка файлов...</p>
                </div>
              ) : hfFiles.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <p>GGUF файлы не найдены в этом репозитории</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    Найдено {hfFiles.length} GGUF файлов. Рекомендуем Q4_K_M для баланса качества и размера.
                  </p>
                  {hfFiles.map((file) => (
                    <div
                      key={file.filename}
                      className="flex items-center justify-between p-4 rounded-xl bg-cyber-surface border border-cyber-border hover:border-neon-cyan/30 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white truncate" title={file.filename}>
                          {file.filename}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-sm">
                          <span className="text-gray-500">{file.sizeFormatted}</span>
                          {file.quantType && (
                            <span className={clsx(
                              'px-2 py-0.5 rounded-full text-xs font-bold',
                              file.quantType.includes('Q4') && 'bg-neon-green/20 text-neon-green',
                              file.quantType.includes('Q5') && 'bg-neon-cyan/20 text-neon-cyan',
                              file.quantType.includes('Q6') && 'bg-neon-yellow/20 text-neon-yellow',
                              file.quantType.includes('Q8') && 'bg-neon-magenta/20 text-neon-magenta',
                              file.quantType.includes('F16') && 'bg-red-500/20 text-red-400',
                            )}>
                              {file.quantType}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={isDownloading}
                        className={clsx(
                          'flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all',
                          isDownloading
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-neon-cyan/20 border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30'
                        )}
                      >
                        {isDownloading && hfDownloadProgress?.filename === file.filename ? (
                          <>
                            <Loader2 className="animate-spin" size={16} />
                            {hfDownloadProgress.percent.toFixed(0)}%
                          </>
                        ) : (
                          <>
                            <Download size={16} />
                            Скачать
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Popular models view */}
          {viewMode === 'popular' && (
            <div className="space-y-6">
              {sortedCategories.map(([category, models]) => (
                <div key={category}>
                  <h3 className="text-lg font-bold text-white mb-3">
                    {categoryLabels[category] || category}
                  </h3>
                  <div className="grid gap-3">
                    {models.map((model) => (
                      <button
                        key={model.repoId}
                        onClick={() => handleSelectRepo(model.repoId)}
                        className="flex items-center justify-between p-4 rounded-xl bg-cyber-surface border border-cyber-border hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white group-hover:text-neon-cyan transition-colors">
                            {model.name}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {model.description}
                          </p>
                          <p className="text-xs text-gray-600 mt-1 truncate">
                            {model.repoId}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
                          <span className="px-2 py-1 rounded-lg bg-neon-green/20 text-neon-green text-xs font-bold">
                            {model.recommendedQuant}
                          </span>
                          <ChevronRight size={20} className="text-gray-600 group-hover:text-neon-cyan transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Custom repo hint */}
              <div className="mt-8 p-4 rounded-xl border border-dashed border-gray-700 bg-cyber-surface/50 text-center">
                <p className="text-gray-500 mb-2">
                  Не нашли нужную модель?
                </p>
                <p className="text-sm text-gray-600">
                  Введите repo ID в поиске (например: <span className="text-neon-cyan">TheBloke/Llama-2-7B-GGUF</span>)
                </p>
                <a
                  href="https://huggingface.co/models?library=gguf&sort=trending"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-3 text-neon-cyan hover:underline text-sm"
                >
                  <ExternalLink size={14} />
                  Открыть HuggingFace Hub
                </a>
              </div>
            </div>
          )}

          {/* Search view (fallback) */}
          {viewMode === 'search' && (
            <div className="text-center py-16">
              <p className="text-gray-400 mb-4">
                Для поиска введите полный repo ID, например:
              </p>
              <code className="px-4 py-2 rounded-lg bg-cyber-surface text-neon-cyan">
                Qwen/Qwen2.5-7B-Instruct-GGUF
              </code>
              <p className="text-gray-500 text-sm mt-4">
                Или выберите из рекомендуемых моделей выше
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-cyber-border bg-cyber-surface flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Модели скачиваются в кэш HuggingFace Hub
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-cyber-dark"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
