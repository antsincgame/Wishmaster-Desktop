import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { ChatPage } from './pages/ChatPage'
import { ModelsPage } from './pages/ModelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { VoiceClonePage } from './pages/VoiceClonePage'
import { MemoryPage } from './pages/MemoryPage'
import { useStore } from './store'

function App() {
  const { loadSettings, loadModels, loadSessions, loadMemories, loadPersona, loadDataStats } = useStore()

  useEffect(() => {
    // Initialize app
    loadSettings()
    loadModels()
    loadSessions()
    // Initialize memory system
    loadMemories()
    loadPersona()
    loadDataStats()
  }, [loadSettings, loadModels, loadSessions, loadMemories, loadPersona, loadDataStats])

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-cyber-dark text-gray-100">
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
