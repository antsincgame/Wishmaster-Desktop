#include "ttsengine.h"
#include <QDebug>
#include <QTextToSpeech>

TTSEngine::TTSEngine(QObject *parent)
    : QObject(parent)
{
}

TTSEngine::~TTSEngine()
{
    stop();
    delete m_audioOutput;
    delete m_audioBuffer;
}

bool TTSEngine::initialize(Engine engine)
{
    m_engine = engine;
    
    // TODO: Initialize ONNX runtime for Silero/Piper
    // For now, just return true
    
    qDebug() << "TTS Engine initialized:" << engine;
    return true;
}

void TTSEngine::setEngine(Engine engine)
{
    if (m_speaking) {
        stop();
    }
    m_engine = engine;
}

void TTSEngine::speak(const QString &text)
{
    if (text.isEmpty()) return;
    
    switch (m_engine) {
        case SILERO:
            speakWithSilero(text);
            break;
        case PIPER:
            speakWithPiper(text);
            break;
        case SYSTEM:
            speakWithSystem(text);
            break;
    }
}

void TTSEngine::stop()
{
    if (m_audioOutput) {
        m_audioOutput->stop();
    }
    m_speaking = false;
    emit speakingFinished();
}

bool TTSEngine::isSpeaking() const
{
    return m_speaking;
}

QStringList TTSEngine::availableVoices() const
{
    // TODO: Return available voices based on engine
    return {"default"};
}

void TTSEngine::setVoice(const QString &voiceId)
{
    Q_UNUSED(voiceId)
    // TODO: Implement voice selection
}

void TTSEngine::speakWithSilero(const QString &text)
{
#ifdef WITH_TTS
    // TODO: Implement Silero TTS with ONNX
    qDebug() << "Silero TTS:" << text.left(50);
    emit speakingStarted();
    // ... ONNX inference ...
    emit speakingFinished();
#else
    emit errorOccurred("TTS не включен в сборку");
    // Fallback to system
    speakWithSystem(text);
#endif
}

void TTSEngine::speakWithPiper(const QString &text)
{
#ifdef WITH_TTS
    // TODO: Implement Piper TTS with ONNX
    qDebug() << "Piper TTS:" << text.left(50);
    emit speakingStarted();
    // ... ONNX inference ...
    emit speakingFinished();
#else
    emit errorOccurred("TTS не включен в сборку");
    speakWithSystem(text);
#endif
}

void TTSEngine::speakWithSystem(const QString &text)
{
    // Use Qt's built-in TTS
    QTextToSpeech *tts = new QTextToSpeech(this);
    
    connect(tts, &QTextToSpeech::stateChanged, [this, tts](QTextToSpeech::State state) {
        if (state == QTextToSpeech::Speaking) {
            m_speaking = true;
            emit speakingStarted();
        } else if (state == QTextToSpeech::Ready) {
            m_speaking = false;
            emit speakingFinished();
            tts->deleteLater();
        }
    });
    
    // Set Russian locale if available
    for (const auto &locale : tts->availableLocales()) {
        if (locale.language() == QLocale::Russian) {
            tts->setLocale(locale);
            break;
        }
    }
    
    tts->say(text);
}
