import { useEffect, useState, useRef, useCallback } from 'react'
import { Mic, Square, Play, Pause, Trash2, Plus, Volume2, Check, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { formatDate } from '../utils'
import clsx from 'clsx'

export function VoiceClonePage() {
  const { 
    voiceProfiles, 
    currentVoice,
    loadVoiceProfiles,
    loadVoiceRecordings,
    createVoiceProfile,
    createVoiceProfileFromRecording,
    deleteVoiceProfile,
    selectVoice,
    speak,
    isSpeaking,
    stopSpeaking
  } = useStore()

  const [voiceRecordings, setVoiceRecordings] = useState<Array<{ id: number; path: string; createdAt: number }>>([])
  const [createFromRecordingId, setCreateFromRecordingId] = useState<number | null>(null)
  const [createFromRecordingName, setCreateFromRecordingName] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<string | null>(null)
  const [newProfileName, setNewProfileName] = useState('')
  const [testText, setTestText] = useState('Привет! Это тест клонированного голоса.')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Load profiles and recordings on mount
  useEffect(() => {
    loadVoiceProfiles()
  }, [loadVoiceProfiles])

  useEffect(() => {
    loadVoiceRecordings().then(setVoiceRecordings)
  }, [loadVoiceRecordings])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop recording if active
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      // Stop all tracks
      streamRef.current?.getTracks().forEach(track => track.stop())
      // Revoke object URL
      if (recordedAudio) {
        URL.revokeObjectURL(recordedAudio)
      }
    }
  }, [recordedAudio])

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // Revoke previous URL if exists
        if (recordedAudio) {
          URL.revokeObjectURL(recordedAudio)
        }
        const url = URL.createObjectURL(blob)
        setRecordedAudio(url)
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (e) {
      console.error('Failed to start recording:', e)
      setError('Не удалось получить доступ к микрофону. Проверьте разрешения.')
    }
  }, [recordedAudio])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [])

  const clearRecording = useCallback(() => {
    if (recordedAudio) {
      URL.revokeObjectURL(recordedAudio)
      setRecordedAudio(null)
    }
  }, [recordedAudio])

  const handleCreateProfile = useCallback(async () => {
    if (!newProfileName.trim() || !recordedAudio) return

    setError(null)
    try {
      await createVoiceProfile(newProfileName.trim(), recordedAudio)
      setNewProfileName('')
      clearRecording()
      setShowCreateDialog(false)
    } catch (e) {
      console.error('Failed to create voice profile:', e)
      setError('Не удалось создать голосовой профиль')
    }
  }, [newProfileName, recordedAudio, createVoiceProfile, clearRecording])

  const handleTestVoice = useCallback(async (voiceId: number) => {
    if (isSpeaking) {
      stopSpeaking()
    } else {
      try {
        await speak(testText, voiceId)
      } catch (e) {
        console.error('Failed to speak:', e)
      }
    }
  }, [isSpeaking, stopSpeaking, speak, testText])

  const handleCloseDialog = useCallback(() => {
    setShowCreateDialog(false)
    clearRecording()
    setNewProfileName('')
    setError(null)
  }, [clearRecording])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-cyber-border bg-cyber-surface">
        <h2 className="text-xl font-bold text-neon-cyan">🎤 Клонирование голоса</h2>
        <p className="text-xs text-gray-500">
          Создайте AI-клон своего голоса с помощью Coqui XTTS
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            {error}
          </div>
        )}

        {/* Info box */}
        <div className="p-4 rounded-xl border border-neon-yellow/30 bg-neon-yellow/5 mb-6">
          <h3 className="text-sm font-bold text-neon-yellow mb-2">
            ℹ️ Как это работает
          </h3>
          <p className="text-sm text-gray-400">
            Запишите ~6 секунд своего голоса, и AI создаст его цифровую копию.
            Эта копия сможет озвучивать любой текст вашим голосом!
          </p>
        </div>

        {/* Create new profile */}
        <div className="mb-8">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-neon-green/20 border border-neon-green text-neon-green hover:bg-neon-green/30 transition-all w-full justify-center"
          >
            <Plus size={20} />
            Создать новый голосовой профиль
          </button>
        </div>

        {/* Create dialog */}
        {showCreateDialog && (
          <div className="mb-8 p-6 rounded-xl border border-neon-cyan/30 bg-cyber-surface">
            <h3 className="text-lg font-bold text-neon-cyan mb-4">
              Создание голосового профиля
            </h3>

            {/* Name input */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                Название профиля
              </label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Мой голос"
                className="w-full px-4 py-2 rounded-lg bg-cyber-dark border border-cyber-border text-white focus:border-neon-cyan focus:outline-none"
              />
            </div>

            {/* Recording section */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">
                Запись голоса (минимум 6 секунд)
              </label>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={clsx(
                    'flex items-center gap-2 px-6 py-3 rounded-xl border transition-all',
                    isRecording
                      ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse'
                      : 'border-neon-magenta text-neon-magenta hover:bg-neon-magenta/10'
                  )}
                >
                  {isRecording ? (
                    <>
                      <Square size={20} />
                      Остановить запись
                    </>
                  ) : (
                    <>
                      <Mic size={20} />
                      Начать запись
                    </>
                  )}
                </button>

                {recordedAudio && (
                  <div className="flex items-center gap-2">
                    <audio src={recordedAudio} controls className="h-10" />
                    <button
                      onClick={clearRecording}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {isRecording && (
                <p className="text-sm text-red-400 mt-2 animate-pulse">
                  🔴 Запись идёт... Говорите естественно, минимум 6 секунд
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim() || !recordedAudio}
                className={clsx(
                  'flex-1 px-4 py-2 rounded-lg border transition-all',
                  newProfileName.trim() && recordedAudio
                    ? 'bg-neon-cyan/20 border-neon-cyan text-neon-cyan hover:bg-neon-cyan/30'
                    : 'border-gray-600 text-gray-600 cursor-not-allowed'
                )}
              >
                Создать профиль
              </button>
              <button
                onClick={handleCloseDialog}
                className="px-4 py-2 rounded-lg border border-cyber-border text-gray-400 hover:text-white"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Recordings from chat */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-neon-cyan uppercase tracking-wider">
              🎤 Записи из чата
            </h3>
            <button
              onClick={() => loadVoiceRecordings().then(setVoiceRecordings)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-cyber-border text-gray-400 hover:text-neon-cyan text-xs"
            >
              <RefreshCw size={14} />
              Обновить
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Голосовые сообщения из чата сохраняются здесь. Создайте профиль из любой записи.
          </p>
          {voiceRecordings.length === 0 ? (
            <div className="p-4 rounded-xl border border-cyber-border bg-cyber-surface/50 text-gray-500 text-sm">
              Нет записей. Используйте голосовой ввод в чате — записи появятся здесь.
            </div>
          ) : (
            <div className="grid gap-3">
              {voiceRecordings.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-cyber-border bg-cyber-surface"
                >
                  <span className="text-sm text-gray-400 truncate flex-1 mr-2" title={rec.path}>
                    {rec.path.split('/').pop() ?? rec.path}
                  </span>
                  <button
                    onClick={() => { setCreateFromRecordingId(rec.id); setCreateFromRecordingName(`Голос из чата ${rec.id}`) }}
                    className="px-3 py-1.5 rounded-lg border border-neon-cyan text-neon-cyan text-sm hover:bg-neon-cyan/10"
                  >
                    Создать профиль
                  </button>
                </div>
              ))}
            </div>
          )}
          {createFromRecordingId !== null && (
            <div className="mt-4 p-4 rounded-xl border border-neon-cyan/30 bg-neon-cyan/5">
              <p className="text-sm text-neon-cyan mb-2">Название профиля:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createFromRecordingName}
                  onChange={(e) => setCreateFromRecordingName(e.target.value)}
                  placeholder="Мой голос из чата"
                  className="flex-1 px-3 py-2 rounded-lg bg-cyber-dark border border-cyber-border text-white"
                />
                <button
                  onClick={async () => {
                    try {
                      await createVoiceProfileFromRecording(createFromRecordingId, createFromRecordingName)
                      setCreateFromRecordingId(null)
                      setCreateFromRecordingName('')
                      loadVoiceRecordings().then(setVoiceRecordings)
                    } catch (e) {
                      setError('Не удалось создать профиль')
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-neon-cyan/20 border border-neon-cyan text-neon-cyan"
                >
                  Создать
                </button>
                <button
                  onClick={() => { setCreateFromRecordingId(null); setCreateFromRecordingName('') }}
                  className="px-4 py-2 rounded-lg border border-cyber-border text-gray-400"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Voice profiles list */}
        <div>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
            Ваши голосовые профили
          </h3>

          {voiceProfiles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Volume2 size={48} className="mx-auto mb-4 opacity-50" />
              <p>Нет голосовых профилей</p>
              <p className="text-sm">Создайте свой первый профиль выше</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {voiceProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className={clsx(
                    'p-4 rounded-xl border transition-all cursor-pointer',
                    currentVoice?.id === profile.id
                      ? 'bg-neon-magenta/10 border-neon-magenta/50 glow-magenta'
                      : 'bg-cyber-surface border-cyber-border hover:border-neon-cyan/30'
                  )}
                  onClick={() => selectVoice(currentVoice?.id === profile.id ? null : profile)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Selection indicator */}
                      <div className={clsx(
                        'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        currentVoice?.id === profile.id
                          ? 'bg-neon-magenta border-neon-magenta'
                          : 'border-gray-600'
                      )}>
                        {currentVoice?.id === profile.id && <Check size={14} className="text-white" />}
                      </div>
                      
                      <div>
                        <h4 className="font-bold text-white">{profile.name}</h4>
                        <p className="text-xs text-gray-500">
                          Создан: {formatDate(profile.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleTestVoice(profile.id)}
                        className={clsx(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                          isSpeaking
                            ? 'border-red-500 text-red-500'
                            : 'border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10'
                        )}
                      >
                        {isSpeaking ? <Pause size={16} /> : <Play size={16} />}
                        {isSpeaking ? 'Стоп' : 'Тест'}
                      </button>
                      
                      <button
                        onClick={() => deleteVoiceProfile(profile.id)}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test text */}
        <div className="mt-8 p-4 rounded-xl border border-cyber-border bg-cyber-surface">
          <label className="block text-sm text-gray-400 mb-2">
            Текст для тестирования голоса
          </label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 rounded-lg bg-cyber-dark border border-cyber-border text-white resize-none focus:border-neon-cyan focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
