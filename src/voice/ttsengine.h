#ifndef TTSENGINE_H
#define TTSENGINE_H

#include <QObject>
#include <QString>
#include <QAudioOutput>
#include <QBuffer>

class TTSEngine : public QObject
{
    Q_OBJECT

public:
    enum Engine { SILERO, PIPER, SYSTEM };
    
    explicit TTSEngine(QObject *parent = nullptr);
    ~TTSEngine();
    
    bool initialize(Engine engine = SILERO);
    void setEngine(Engine engine);
    Engine currentEngine() const { return m_engine; }
    
    void speak(const QString &text);
    void stop();
    bool isSpeaking() const;
    
    QStringList availableVoices() const;
    void setVoice(const QString &voiceId);

signals:
    void speakingStarted();
    void speakingFinished();
    void errorOccurred(const QString &error);

private:
    void speakWithSilero(const QString &text);
    void speakWithPiper(const QString &text);
    void speakWithSystem(const QString &text);
    
    Engine m_engine = SILERO;
    QAudioOutput *m_audioOutput = nullptr;
    QBuffer *m_audioBuffer = nullptr;
    bool m_speaking = false;
    
#ifdef WITH_TTS
    // ONNX session for TTS
    void *m_onnxSession = nullptr;
#endif
};

#endif // TTSENGINE_H
