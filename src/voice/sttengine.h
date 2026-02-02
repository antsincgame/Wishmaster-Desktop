#ifndef STTENGINE_H
#define STTENGINE_H

#include <QObject>
#include <QString>
#include <QAudioInput>
#include <QBuffer>

class STTEngine : public QObject
{
    Q_OBJECT

public:
    explicit STTEngine(QObject *parent = nullptr);
    ~STTEngine();
    
    bool initialize(const QString &language = "ru");
    void setLanguage(const QString &language);
    
    void startListening();
    void stopListening();
    bool isListening() const;

signals:
    void listeningStarted();
    void listeningStopped();
    void recognitionResult(const QString &text);
    void partialResult(const QString &text);
    void errorOccurred(const QString &error);

private slots:
    void onAudioDataReady();

private:
    void processAudio(const QByteArray &data);
    
    QAudioInput *m_audioInput = nullptr;
    QBuffer *m_audioBuffer = nullptr;
    QString m_language = "ru";
    bool m_listening = false;
    
#ifdef WITH_WHISPER
    void *m_whisperCtx = nullptr;
#endif
};

#endif // STTENGINE_H
