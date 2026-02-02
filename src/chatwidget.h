#ifndef CHATWIDGET_H
#define CHATWIDGET_H

#include <QWidget>
#include <QTextEdit>
#include <QLineEdit>
#include <QPushButton>
#include <QVBoxLayout>
#include <QScrollArea>
#include <QLabel>

class LlamaEngine;
class TTSEngine;
class STTEngine;

struct ChatMessage {
    qint64 id;
    QString content;
    bool isUser;
    qint64 timestamp;
};

class MessageBubble : public QFrame
{
    Q_OBJECT
public:
    explicit MessageBubble(const ChatMessage &msg, QWidget *parent = nullptr);
};

class ChatWidget : public QWidget
{
    Q_OBJECT

public:
    explicit ChatWidget(LlamaEngine *llama, TTSEngine *tts, STTEngine *stt, 
                        QWidget *parent = nullptr);
    
    void loadSession(qint64 sessionId);
    void reloadSettings();
    void startVoiceInput();
    void speakLastResponse();

signals:
    void messageSent(const QString &text);

private slots:
    void onSendMessage();
    void onStopGeneration();
    void onTokenReceived(const QString &token);
    void onGenerationFinished();
    void onVoiceInputResult(const QString &text);

private:
    void setupUI();
    void addMessage(const ChatMessage &msg);
    void scrollToBottom();
    void clearChat();
    QString buildPrompt(const QString &userMessage);

    // UI
    QScrollArea *m_scrollArea;
    QWidget *m_messagesContainer;
    QVBoxLayout *m_messagesLayout;
    QLineEdit *m_inputField;
    QPushButton *m_sendButton;
    QPushButton *m_stopButton;
    QPushButton *m_voiceButton;
    QLabel *m_typingIndicator;
    
    // Engines
    LlamaEngine *m_llamaEngine;
    TTSEngine *m_ttsEngine;
    STTEngine *m_sttEngine;
    
    // State
    qint64 m_sessionId = -1;
    QList<ChatMessage> m_messages;
    QString m_pendingResponse;
    MessageBubble *m_streamingBubble = nullptr;
    bool m_isGenerating = false;
    
    // Settings
    float m_temperature = 0.7f;
    int m_maxTokens = 512;
    int m_contextLength = 2048;
    bool m_autoSpeak = false;
    QString m_currentMode = "chat";
};

#endif // CHATWIDGET_H
