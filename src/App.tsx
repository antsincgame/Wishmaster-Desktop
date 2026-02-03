import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { ChatPage } from './pages/ChatPage'
import { ModelsPage } from './pages/ModelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { VoiceClonePage } from './pages/VoiceClonePage'
import { MemoryPage } from './pages/MemoryPage'
import { useStore } from './store'
import clsx from 'clsx'

// Accent color CSS variables
const ACCENT_COLORS: Record<string, { primary: string; glow: string }> = {
  cyan: { primary: '#00ffff', glow: '0 0 20px #00ffff' },
  magenta: { primary: '#ff0080', glow: '0 0 20px #ff0080' },
  green: { primary: '#00ff41', glow: '0 0 20px #00ff41' },
  yellow: { primary: '#ffff00', glow: '0 0 20px #ffff00' },
  purple: { primary: '#bf00ff', glow: '0 0 20px #bf00ff' },
}

function App() {
  const { settings, loadSettings, loadModels, loadSessions, loadMemories, loadPersona, loadDataStats, loadGpuInfo, loadEmbeddingStats } = useStore()

  useEffect(() => {
    // Initialize app
    loadSettings()
    loadModels()
    loadSessions()
    loadGpuInfo()  // Check GPU/CUDA status
    // Initialize memory system
    loadMemories()
    loadPersona()
    loadDataStats()
    loadEmbeddingStats()  // Load embedding statistics
  }, [loadSettings, loadModels, loadSessions, loadMemories, loadPersona, loadDataStats, loadGpuInfo, loadEmbeddingStats])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    
    // Apply theme class
    if (settings.theme === 'light') {
      root.classList.add('light-theme')
      root.classList.remove('dark-theme')
    } else {
      root.classList.add('dark-theme')
      root.classList.remove('light-theme')
    }
    
    // Apply accent color CSS variables
    const accent = ACCENT_COLORS[settings.accentColor] || ACCENT_COLORS.cyan
    root.style.setProperty('--accent-color', accent.primary)
    root.style.setProperty('--accent-glow', accent.glow)
    
  }, [settings.theme, settings.accentColor])

  return (
    <BrowserRouter>
      <div className={clsx(
        'flex h-screen text-gray-100',
        settings.theme === 'light' ? 'bg-gray-100' : 'bg-cyber-dark'
      )}>
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/voice-clone" element={<VoiceClonePage />} />
            <Route path="/memory" element={<MemoryPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
