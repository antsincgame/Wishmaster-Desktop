import { useState, useEffect, useCallback } from 'react'
import { useStore, SearchResult } from '../store'
import clsx from 'clsx'

const MEMORY_CATEGORIES = [
  { id: 'fact', label: 'Факт', icon: '📌' },
  { id: 'preference', label: 'Предпочтение', icon: '❤️' },
  { id: 'name', label: 'Имя', icon: '👤' },
  { id: 'topic', label: 'Тема', icon: '💡' },
  { id: 'skill', label: 'Навык', icon: '🛠️' },
  { id: 'goal', label: 'Цель', icon: '🎯' },
] as const

export function MemoryPage() {
  const { 
    memories, 
    persona, 
    dataStats,
    embeddingStats,
    loadMemories, 
    addMemory, 
    deleteMemory,
    analyzePersona,
    loadPersona,
    loadDataStats,
    loadEmbeddingStats,
    semanticSearch,
    indexAllMessages,
    exportAlpaca,
    exportShareGPT,
    exportFull,
  } = useStore()

  const [activeTab, setActiveTab] = useState<'search' | 'memory' | 'persona' | 'export'>('search')
  const [newMemory, setNewMemory] = useState('')
  const [newCategory, setNewCategory] = useState('fact')
  const [newImportance, setNewImportance] = useState(5)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Semantic search state
  const [semanticQuery, setSemanticQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexedCount, setIndexedCount] = useState<number | null>(null)

  useEffect(() => {
    loadMemories()
    loadPersona()
    loadDataStats()
    loadEmbeddingStats()
  }, [loadMemories, loadPersona, loadDataStats, loadEmbeddingStats])

  const handleAddMemory = useCallback(async () => {
    if (!newMemory.trim()) return
    try {
      await addMemory(newMemory.trim(), newCategory, newImportance)
      setNewMemory('')
      setNewImportance(5)
    } catch (e) {
      console.error('Failed to add memory:', e)
    }
  }, [newMemory, newCategory, newImportance, addMemory])

  const handleSemanticSearch = useCallback(async () => {
    if (!semanticQuery.trim()) return
    setIsSearching(true)
    try {
      const results = await semanticSearch(semanticQuery.trim(), 20)
      setSearchResults(results)
    } catch (e) {
      console.error('Semantic search failed:', e)
    } finally {
      setIsSearching(false)
    }
  }, [semanticQuery, semanticSearch])

  const handleIndexAll = useCallback(async () => {
    setIsIndexing(true)
    setIndexedCount(null)
    try {
      const count = await indexAllMessages()
      setIndexedCount(count)
    } catch (e) {
      console.error('Indexing failed:', e)
    } finally {
      setIsIndexing(false)
    }
  }, [indexAllMessages])

  const handleAnalyzePersona = useCallback(async () => {
    setIsAnalyzing(true)
    try {
      await analyzePersona()
    } catch (e) {
      console.error('Failed to analyze persona:', e)
    } finally {
      setIsAnalyzing(false)
    }
  }, [analyzePersona])

  const handleExport = useCallback(async (format: 'alpaca' | 'sharegpt' | 'full') => {
    setExportStatus('Экспортирую...')
    try {
      let path: string
      switch (format) {
        case 'alpaca':
          path = await exportAlpaca()
          break
        case 'sharegpt':
          path = await exportShareGPT()
          break
        default:
          path = await exportFull()
      }
      setExportStatus(`✓ Сохранено: ${path}`)
      setTimeout(() => setExportStatus(null), 5000)
    } catch (e) {
      setExportStatus('✗ Ошибка экспорта')
      setTimeout(() => setExportStatus(null), 3000)
    }
  }, [exportAlpaca, exportShareGPT, exportFull])

  const filteredMemories = memories.filter(m => 
    searchQuery === '' || 
    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-cyber-border bg-cyber-surface">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neon-magenta">🧠 Память & Цифровой двойник</h2>
            <p className="text-xs text-gray-500">
              Долговременная память AI и создание вашего цифрового клона
            </p>
          </div>
{dataStats && (
                  <div className="text-right text-xs text-gray-500">
                    <p>{dataStats.totalMessages.toLocaleString()} сообщений</p>
                    <p>~{dataStats.estimatedTokens.toLocaleString()} токенов</p>
                  </div>
                )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab('search')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm transition-all',
              activeTab === 'search'
                ? 'bg-neon-yellow/20 border border-neon-yellow text-neon-yellow'
                : 'border border-cyber-border text-gray-400 hover:text-white'
            )}
          >
            🔍 Поиск
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm transition-all',
              activeTab === 'memory'
                ? 'bg-neon-cyan/20 border border-neon-cyan text-neon-cyan'
                : 'border border-cyber-border text-gray-400 hover:text-white'
            )}
          >
            📌 Память ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab('persona')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm transition-all',
              activeTab === 'persona'
                ? 'bg-neon-magenta/20 border border-neon-magenta text-neon-magenta'
                : 'border border-cyber-border text-gray-400 hover:text-white'
            )}
          >
            👤 Персона
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm transition-all',
              activeTab === 'export'
                ? 'bg-neon-green/20 border border-neon-green text-neon-green'
                : 'border border-cyber-border text-gray-400 hover:text-white'
            )}
          >
            📤 Экспорт
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Embedding Stats */}
            <section className="p-4 rounded-xl border border-neon-yellow/30 bg-neon-yellow/5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-neon-yellow">🔍 Семантический поиск</h3>
                  <p className="text-xs text-gray-500">
                    Поиск по смыслу с использованием AI embeddings (multilingual-e5-small)
                  </p>
                </div>
                {embeddingStats && (
                  <div className="text-right text-xs">
                    <p className="text-neon-cyan">{embeddingStats.totalEmbeddings} проиндексировано</p>
                    <p className="text-gray-500">Размерность: {embeddingStats.embeddingDimension}</p>
                  </div>
                )}
              </div>

              {/* Index status */}
              <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-cyber-dark border border-cyber-border">
                <div className="flex-1">
                  <p className="text-sm text-gray-400">
                    {embeddingStats?.totalEmbeddings === 0 
                      ? 'Сообщения не проиндексированы. Нажмите "Индексировать" для включения семантического поиска.'
                      : `Проиндексировано ${embeddingStats?.totalEmbeddings || 0} элементов`}
                  </p>
                  {indexedCount !== null && (
                    <p className="text-sm text-neon-green mt-1">✓ Только что проиндексировано: {indexedCount}</p>
                  )}
                </div>
                <button
                  onClick={handleIndexAll}
                  disabled={isIndexing}
                  className={clsx(
                    'px-4 py-2 rounded-lg border transition-all',
                    isIndexing
                      ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                      : 'border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10'
                  )}
                >
                  {isIndexing ? '⏳ Индексирую...' : '📊 Индексировать всё'}
                </button>
              </div>

              {/* Search input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={semanticQuery}
                  onChange={(e) => setSemanticQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSemanticSearch()}
                  placeholder="Введите запрос для семантического поиска..."
                  className="flex-1 px-4 py-3 rounded-lg bg-cyber-dark border border-cyber-border text-gray-200 focus:border-neon-yellow focus:outline-none"
                />
                <button
                  onClick={handleSemanticSearch}
                  disabled={isSearching || !semanticQuery.trim()}
                  className={clsx(
                    'px-6 py-3 rounded-lg font-bold transition-all',
                    isSearching || !semanticQuery.trim()
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-neon-yellow text-black hover:bg-neon-yellow/80'
                  )}
                >
                  {isSearching ? '⏳' : '🔍 Искать'}
                </button>
              </div>
            </section>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
                <h3 className="text-lg font-bold text-neon-yellow mb-4">
                  📋 Результаты ({searchResults.length})
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <div
                      key={`${result.sourceType}-${result.sourceId}-${index}`}
                      className="p-4 rounded-lg bg-cyber-dark border border-cyber-border hover:border-neon-yellow/50 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={clsx(
                          'px-2 py-0.5 rounded text-xs',
                          result.sourceType === 'message' 
                            ? 'bg-neon-cyan/20 text-neon-cyan' 
                            : 'bg-neon-magenta/20 text-neon-magenta'
                        )}>
                          {result.sourceType === 'message' ? '💬 Сообщение' : '🧠 Память'}
                        </span>
                        <span className="text-xs text-gray-500">
                          Сходство: <span className="text-neon-green">{Math.round(result.similarity * 100)}%</span>
                        </span>
                      </div>
                      <p className="text-gray-200">{result.content}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {searchResults.length === 0 && semanticQuery && !isSearching && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-4xl mb-4">🔍</p>
                <p>Ничего не найдено</p>
                <p className="text-sm mt-2">Попробуйте другой запрос или проиндексируйте сообщения</p>
              </div>
            )}

            {/* Info */}
            <section className="p-4 rounded-xl border border-neon-yellow/30 bg-neon-yellow/5">
              <h4 className="text-md font-bold text-neon-yellow mb-2">💡 Как это работает?</h4>
              <p className="text-sm text-gray-400">
                Семантический поиск использует AI для понимания <strong>смысла</strong> вашего запроса, 
                а не просто ключевых слов. Модель multilingual-e5-small преобразует текст в векторы 
                и находит похожие по смыслу сообщения и воспоминания.
              </p>
            </section>
          </div>
        )}

        {/* Memory Tab */}
        {activeTab === 'memory' && (
          <div className="space-y-6">
            {/* Add new memory */}
            <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
              <h3 className="text-lg font-bold text-neon-cyan mb-4">➕ Добавить в память</h3>
              
              <div className="space-y-3">
                <textarea
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  placeholder="Что AI должен запомнить? (факт, предпочтение, имя...)"
                  className="w-full px-4 py-3 rounded-lg bg-cyber-dark border border-cyber-border text-gray-200 focus:border-neon-cyan focus:outline-none resize-none"
                  rows={2}
                />
                
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="flex gap-2">
                    {MEMORY_CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setNewCategory(cat.id)}
                        className={clsx(
                          'px-3 py-1 rounded-lg text-sm transition-all',
                          newCategory === cat.id
                            ? 'bg-neon-cyan/20 border border-neon-cyan text-neon-cyan'
                            : 'border border-cyber-border text-gray-400 hover:text-white'
                        )}
                      >
                        {cat.icon} {cat.label}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Важность:</span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={newImportance}
                      onChange={(e) => setNewImportance(Number(e.target.value))}
                      className="w-24 accent-neon-cyan"
                    />
                    <span className="text-neon-cyan w-4">{newImportance}</span>
                  </div>
                  
                  <button
                    onClick={handleAddMemory}
                    disabled={!newMemory.trim()}
                    className="ml-auto px-6 py-2 rounded-lg bg-neon-cyan text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neon-cyan/80 transition-all"
                  >
                    Запомнить
                  </button>
                </div>
              </div>
            </section>

            {/* Memory list */}
            <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neon-cyan">📚 Сохранённые воспоминания</h3>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="px-3 py-1 rounded-lg bg-cyber-dark border border-cyber-border text-gray-200 focus:border-neon-cyan focus:outline-none text-sm"
                />
              </div>
              
              {filteredMemories.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {memories.length === 0 
                    ? 'Память пуста. Добавьте важные факты выше.' 
                    : 'Ничего не найдено'}
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredMemories.map(memory => {
                    const cat = MEMORY_CATEGORIES.find(c => c.id === memory.category)
                    return (
                      <div
                        key={memory.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-cyber-dark border border-cyber-border group hover:border-neon-cyan/50 transition-all"
                      >
                        <span className="text-xl" title={cat?.label}>{cat?.icon || '📝'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-200">{memory.content}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Важность: {'⭐'.repeat(Math.min(memory.importance, 5))} • 
                            {new Date(memory.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteMemory(memory.id)}
                          className="opacity-0 group-hover:opacity-100 px-2 py-1 text-red-400 hover:text-red-300 transition-all"
                        >
                          ✕
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Persona Tab */}
        {activeTab === 'persona' && (
          <div className="space-y-6">
            <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neon-magenta">🪞 Ваш цифровой профиль</h3>
                <button
                  onClick={handleAnalyzePersona}
                  disabled={isAnalyzing}
                  className="px-4 py-2 rounded-lg bg-neon-magenta text-black font-bold disabled:opacity-50 hover:bg-neon-magenta/80 transition-all"
                >
                  {isAnalyzing ? '⏳ Анализирую...' : '🔄 Проанализировать'}
                </button>
              </div>
              
              {!persona ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-4xl mb-4">🤖</p>
                  <p>Профиль ещё не создан.</p>
                  <p className="text-sm mt-2">
                    Нажмите "Проанализировать", чтобы AI изучил ваш стиль общения.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border">
                    <p className="text-xs text-gray-500 mb-1">Стиль письма</p>
                    <p className="text-lg text-neon-cyan capitalize">{persona.writingStyle}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border">
                    <p className="text-xs text-gray-500 mb-1">Тон общения</p>
                    <p className="text-lg text-neon-magenta capitalize">{persona.tone}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border">
                    <p className="text-xs text-gray-500 mb-1">Язык</p>
                    <p className="text-lg text-neon-green">{persona.language === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English'}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border">
                    <p className="text-xs text-gray-500 mb-1">Использование эмодзи</p>
                    <p className="text-lg text-neon-yellow capitalize">{persona.emojiUsage}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Средняя длина сообщения</p>
                    <p className="text-lg text-gray-200">{Math.round(persona.avgMessageLength)} символов</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border col-span-2">
                    <p className="text-xs text-gray-500 mb-2">Частые фразы</p>
                    <div className="flex flex-wrap gap-2">
                      {JSON.parse(persona.commonPhrases || '[]').map((phrase: string, i: number) => (
                        <span key={i} className="px-2 py-1 rounded bg-neon-cyan/10 text-neon-cyan text-sm">
                          "{phrase}"
                        </span>
                      ))}
                      {JSON.parse(persona.commonPhrases || '[]').length === 0 && (
                        <span className="text-gray-500 text-sm">Недостаточно данных</span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border col-span-2">
                    <p className="text-xs text-gray-500 mb-1">Проанализировано сообщений</p>
                    <p className="text-lg text-gray-200">{persona.messagesAnalyzed.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </section>

            <section className="p-4 rounded-xl border border-neon-magenta/30 bg-neon-magenta/5">
              <h4 className="text-md font-bold text-neon-magenta mb-2">💡 Как это работает?</h4>
              <p className="text-sm text-gray-400">
                AI анализирует ВСЕ ваши сообщения из всех чатов и определяет уникальные паттерны вашего общения.
                Эти данные можно экспортировать для обучения собственной языковой модели — вашего цифрового двойника.
              </p>
            </section>
          </div>
        )}

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            {/* Stats */}
            {dataStats && (
              <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
                <h3 className="text-lg font-bold text-neon-green mb-4">📊 Статистика данных</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border text-center">
                    <p className="text-3xl font-bold text-neon-cyan">{dataStats.totalSessions}</p>
                    <p className="text-xs text-gray-500">Сессий</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border text-center">
                    <p className="text-3xl font-bold text-neon-magenta">{dataStats.totalMessages.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Сообщений</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border text-center">
                    <p className="text-3xl font-bold text-neon-green">~{dataStats.estimatedTokens.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Токенов</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border text-center">
                    <p className="text-3xl font-bold text-neon-yellow">{dataStats.userMessages.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Ваших сообщений</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border text-center">
                    <p className="text-3xl font-bold text-gray-400">{dataStats.assistantMessages.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Ответов AI</p>
                  </div>
                  <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border text-center">
                    <p className="text-3xl font-bold text-purple-400">{dataStats.totalMemories}</p>
                    <p className="text-xs text-gray-500">В памяти</p>
                  </div>
                </div>
              </section>
            )}

            {/* Export options */}
            <section className="p-4 rounded-xl border border-cyber-border bg-cyber-surface">
              <h3 className="text-lg font-bold text-neon-green mb-4">📤 Экспорт для Fine-Tuning</h3>
              
              {exportStatus && (
                <div className={clsx(
                  'mb-4 p-3 rounded-lg text-sm',
                  exportStatus.startsWith('✓') ? 'bg-neon-green/10 text-neon-green' : 
                  exportStatus.startsWith('✗') ? 'bg-red-500/10 text-red-400' :
                  'bg-neon-cyan/10 text-neon-cyan'
                )}>
                  {exportStatus}
                </div>
              )}
              
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-neon-cyan">Alpaca Format</h4>
                    <p className="text-xs text-gray-500">
                      JSONL формат для Axolotl, LLaMA-Factory и др.
                    </p>
                    <code className="text-xs text-gray-600 mt-1 block">
                      {`{"instruction": "...", "input": "", "output": "..."}`}
                    </code>
                  </div>
                  <button
                    onClick={() => handleExport('alpaca')}
                    className="px-4 py-2 rounded-lg border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 transition-all"
                  >
                    Экспорт
                  </button>
                </div>

                <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-neon-magenta">ShareGPT Format</h4>
                    <p className="text-xs text-gray-500">
                      JSON формат для FastChat, OpenAssistant и др.
                    </p>
                    <code className="text-xs text-gray-600 mt-1 block">
                      {`{"conversations": [{"from": "human", "value": "..."}, ...]}`}
                    </code>
                  </div>
                  <button
                    onClick={() => handleExport('sharegpt')}
                    className="px-4 py-2 rounded-lg border border-neon-magenta text-neon-magenta hover:bg-neon-magenta/10 transition-all"
                  >
                    Экспорт
                  </button>
                </div>

                <div className="p-4 rounded-lg bg-cyber-dark border border-cyber-border flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-neon-green">Полный экспорт</h4>
                    <p className="text-xs text-gray-500">
                      Все данные: сессии, сообщения, память, персона
                    </p>
                  </div>
                  <button
                    onClick={() => handleExport('full')}
                    className="px-4 py-2 rounded-lg border border-neon-green text-neon-green hover:bg-neon-green/10 transition-all"
                  >
                    Экспорт
                  </button>
                </div>
              </div>
            </section>

            <section className="p-4 rounded-xl border border-neon-green/30 bg-neon-green/5">
              <h4 className="text-md font-bold text-neon-green mb-2">🚀 Создание цифрового двойника</h4>
              <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                <li>Накопите достаточно диалогов (рекомендуется 1000+ пар вопрос-ответ)</li>
                <li>Экспортируйте в нужном формате (Alpaca для LoRA fine-tuning)</li>
                <li>Используйте Axolotl/Unsloth для дообучения модели на ваших данных</li>
                <li>Загрузите обученную модель обратно в Wishmaster</li>
              </ol>
              <p className="text-xs text-gray-500 mt-4">
                Подробная инструкция: github.com/wishmaster/digital-twin-guide
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
