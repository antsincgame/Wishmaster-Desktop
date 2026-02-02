#include "sttengine.h"
#include <QDebug>
#include <QAudioFormat>
#include <QMediaDevices>

#ifdef WITH_WHISPER
#include "whisper.h"
#endif

STTEngine::STTEngine(QObject *parent)
    : QObject(parent)
{
}

STTEngine::~STTEngine()
{
    stopListening();
    
#ifdef WITH_WHISPER
    if (m_whisperCtx) {
        whisper_free((whisper_context*)m_whisperCtx);
    }
#endif
}

bool STTEngine::initialize(const QString &language)
{
    m_language = language;
    
#ifdef WITH_WHISPER
    // Load whisper model
    QString modelPath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation)
                        + "/models/whisper-small.bin";
    
    if (QFile::exists(modelPath)) {
        m_whisperCtx = whisper_init_from_file(modelPath.toUtf8().constData());
        if (!m_whisperCtx) {
            qWarning() << "Failed to load whisper model";
            return false;
        }
        qDebug() << "Whisper model loaded";
        return true;
    } else {
        qWarning() << "Whisper model not found:" << modelPath;
    }
#endif
    
    // Fallback: will use Qt's speech recognition if available
    return true;
}

void STTEngine::setLanguage(const QString &language)
{
    m_language = language;
}

void STTEngine::startListening()
{
    if (m_listening) return;
    
    // Setup audio input
    QAudioFormat format;
    format.setSampleRate(16000);
    format.setChannelCount(1);
    format.setSampleFormat(QAudioFormat::Int16);
    
    QAudioDevice device = QMediaDevices::defaultAudioInput();
    if (!device.isFormatSupported(format)) {
        emit errorOccurred("Аудиоформат не поддерживается");
        return;
    }
    
    m_audioBuffer = new QBuffer(this);
    m_audioBuffer->open(QIODevice::ReadWrite);
    
    m_audioInput = new QAudioInput(device, format, this);
    connect(m_audioInput, &QAudioInput::stateChanged, [this](QAudio::State state) {
        if (state == QAudio::StoppedState) {
            processAudio(m_audioBuffer->data());
        }
    });
    
    m_audioInput->start(m_audioBuffer);
    m_listening = true;
    
    emit listeningStarted();
    qDebug() << "Started listening...";
    
    // Auto-stop after 10 seconds
    QTimer::singleShot(10000, this, &STTEngine::stopListening);
}

void STTEngine::stopListening()
{
    if (!m_listening) return;
    
    if (m_audioInput) {
        m_audioInput->stop();
        delete m_audioInput;
        m_audioInput = nullptr;
    }
    
    m_listening = false;
    emit listeningStopped();
    qDebug() << "Stopped listening";
}

bool STTEngine::isListening() const
{
    return m_listening;
}

void STTEngine::onAudioDataReady()
{
    // Called when audio buffer has data
}

void STTEngine::processAudio(const QByteArray &data)
{
    if (data.isEmpty()) {
        emit recognitionResult("");
        return;
    }
    
#ifdef WITH_WHISPER
    if (m_whisperCtx) {
        // Convert audio data to float
        std::vector<float> pcm(data.size() / 2);
        const int16_t *samples = reinterpret_cast<const int16_t*>(data.constData());
        for (size_t i = 0; i < pcm.size(); ++i) {
            pcm[i] = samples[i] / 32768.0f;
        }
        
        // Run whisper
        whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.language = m_language.toUtf8().constData();
        params.translate = false;
        params.print_progress = false;
        params.print_timestamps = false;
        
        if (whisper_full((whisper_context*)m_whisperCtx, params, pcm.data(), pcm.size()) == 0) {
            QString result;
            int n_segments = whisper_full_n_segments((whisper_context*)m_whisperCtx);
            for (int i = 0; i < n_segments; ++i) {
                result += QString::fromUtf8(whisper_full_get_segment_text((whisper_context*)m_whisperCtx, i));
            }
            emit recognitionResult(result.trimmed());
            return;
        }
    }
#endif
    
    // Fallback: emit empty result
    emit errorOccurred("STT не настроен. Установите whisper.cpp");
    emit recognitionResult("");
    
    delete m_audioBuffer;
    m_audioBuffer = nullptr;
}
