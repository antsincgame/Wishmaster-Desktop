#include "chatwidget.h"
#include "database.h"
#include "llm/llamaengine.h"
#include "voice/ttsengine.h"
#include "voice/sttengine.h"

#include <QHBoxLayout>
#include <QScrollBar>
#include <QSettings>
#include <QTimer>
#include <QDateTime>
#include <QPropertyAnimation>

// ==================== MessageBubble ====================

MessageBubble::MessageBubble(const ChatMessage &msg, QWidget *parent)
    : QFrame(parent)
{
    setFrameStyle(QFrame::NoFrame);
    
    QHBoxLayout *layout = new QHBoxLayout(this);
    layout->setContentsMargins(10, 5, 10, 5);
    
    QLabel *content = new QLabel(msg.content);
    content->setWordWrap(true);
    content->setTextInteractionFlags(Qt::TextSelectableByMouse);
    content->setMaximumWidth(600);
    
    if (msg.isUser) {
        // User message - right aligned, magenta
        layout->addStretch();
        content->setStyleSheet(R"(
            QLabel {
                background-color: rgba(255, 0, 128, 0.2);
                border: 1px solid #ff0080;
                border-radius: 12px;
                padding: 12px 16px;
                color: #ffffff;
            }
        )");
        layout->addWidget(content);
    } else {
        // Assistant message - left aligned, cyan
        content->setStyleSheet(R"(
            QLabel {
                background-color: rgba(0, 255, 255, 0.1);
                border: 1px solid #00ffff;
                border-radius: 12px;
                padding: 12px 16px;
                color: #ffffff;
            }
        )");
        layout->addWidget(content);
        layout->addStretch();
    }
}

// ==================== ChatWidget ====================

ChatWidget::ChatWidget(LlamaEngine *llama, TTSEngine *tts, STTEngine *stt, QWidget *parent)
    : QWidget(parent)
    , m_llamaEngine(llama)
    , m_ttsEngine(tts)
    , m_sttEngine(stt)
{
    setupUI();
    reloadSettings();
    
    // Connect signals
    connect(m_llamaEngine, &LlamaEngine::tokenGenerated, 
            this, &ChatWidget::onTokenReceived);
    connect(m_llamaEngine, &LlamaEngine::generationFinished,
            this, &ChatWidget::onGenerationFinished);
    connect(m_sttEngine, &STTEngine::recognitionResult,
            this, &ChatWidget::onVoiceInputResult);
}

void ChatWidget::setupUI()
{
    QVBoxLayout *mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(0, 0, 0, 0);
    mainLayout->setSpacing(0);
    
    // Chat header
    QWidget *header = new QWidget;
    header->setStyleSheet("background-color: #191923; border-bottom: 1px solid #00ffff;");
    QHBoxLayout *headerLayout = new QHBoxLayout(header);
    
    QLabel *title = new QLabel("💬 Чат");
    title->setStyleSheet("font-size: 18px; font-weight: bold; color: #00ffff; padding: 10px;");
    headerLayout->addWidget(title);
    headerLayout->addStretch();
    
    m_typingIndicator = new QLabel("Генерация...");
    m_typingIndicator->setStyleSheet("color: #00ff00; padding: 10px;");
    m_typingIndicator->hide();
    headerLayout->addWidget(m_typingIndicator);
    
    mainLayout->addWidget(header);
    
    // Messages area
    m_scrollArea = new QScrollArea;
    m_scrollArea->setWidgetResizable(true);
    m_scrollArea->setFrameShape(QFrame::NoFrame);
    m_scrollArea->setStyleSheet("background-color: #121218;");
    
    m_messagesContainer = new QWidget;
    m_messagesLayout = new QVBoxLayout(m_messagesContainer);
    m_messagesLayout->setAlignment(Qt::AlignTop);
    m_messagesLayout->setSpacing(8);
    m_messagesLayout->addStretch();
    
    m_scrollArea->setWidget(m_messagesContainer);
    mainLayout->addWidget(m_scrollArea, 1);
    
    // Input area
    QWidget *inputArea = new QWidget;
    inputArea->setStyleSheet("background-color: #191923; border-top: 1px solid #00ffff;");
    QHBoxLayout *inputLayout = new QHBoxLayout(inputArea);
    inputLayout->setContentsMargins(15, 10, 15, 10);
    
    // Voice input button
    m_voiceButton = new QPushButton("🎤");
    m_voiceButton->setFixedSize(45, 45);
    m_voiceButton->setStyleSheet("border-radius: 22px;");
    connect(m_voiceButton, &QPushButton::clicked, this, &ChatWidget::startVoiceInput);
    inputLayout->addWidget(m_voiceButton);
    
    // Text input
    m_inputField = new QLineEdit;
    m_inputField->setPlaceholderText("Введите сообщение...");
    m_inputField->setMinimumHeight(45);
    connect(m_inputField, &QLineEdit::returnPressed, this, &ChatWidget::onSendMessage);
    inputLayout->addWidget(m_inputField, 1);
    
    // Send button
    m_sendButton = new QPushButton("Отправить");
    m_sendButton->setMinimumHeight(45);
    m_sendButton->setStyleSheet("background-color: rgba(0, 255, 255, 0.2); min-width: 100px;");
    connect(m_sendButton, &QPushButton::clicked, this, &ChatWidget::onSendMessage);
    inputLayout->addWidget(m_sendButton);
    
    // Stop button (hidden by default)
    m_stopButton = new QPushButton("⏹ Стоп");
    m_stopButton->setMinimumHeight(45);
    m_stopButton->setStyleSheet("background-color: rgba(255, 0, 0, 0.2); border-color: #ff0000; color: #ff0000; min-width: 100px;");
    m_stopButton->hide();
    connect(m_stopButton, &QPushButton::clicked, this, &ChatWidget::onStopGeneration);
    inputLayout->addWidget(m_stopButton);
    
    mainLayout->addWidget(inputArea);
}

void ChatWidget::loadSession(qint64 sessionId)
{
    m_sessionId = sessionId;
    clearChat();
    
    // Load messages from database
    m_messages = Database::instance().getMessagesBySession(sessionId);
    
    for (const auto &msg : m_messages) {
        addMessage(msg);
    }
    
    scrollToBottom();
}

void ChatWidget::reloadSettings()
{
    QSettings settings;
    m_temperature = settings.value("temperature", 0.7).toFloat();
    m_maxTokens = settings.value("maxTokens", 512).toInt();
    m_contextLength = settings.value("contextLength", 2048).toInt();
    m_autoSpeak = settings.value("autoSpeak", false).toBool();
    m_currentMode = settings.value("mode", "chat").toString();
}

void ChatWidget::onSendMessage()
{
    QString text = m_inputField->text().trimmed();
    if (text.isEmpty() || !m_llamaEngine->isModelLoaded()) {
        return;
    }
    
    // Clear input
    m_inputField->clear();
    m_inputField->setEnabled(false);
    
    // Add user message
    ChatMessage userMsg;
    userMsg.content = text;
    userMsg.isUser = true;
    userMsg.timestamp = QDateTime::currentMSecsSinceEpoch();
    userMsg.id = Database::instance().insertMessage(m_sessionId, userMsg);
    
    m_messages.append(userMsg);
    addMessage(userMsg);
    scrollToBottom();
    
    // Build prompt with history
    QString prompt = buildPrompt(text);
    
    // Start generation
    m_isGenerating = true;
    m_pendingResponse.clear();
    m_sendButton->hide();
    m_stopButton->show();
    m_typingIndicator->show();
    
    // Create streaming bubble
    ChatMessage assistantMsg;
    assistantMsg.content = "▌";
    assistantMsg.isUser = false;
    m_streamingBubble = new MessageBubble(assistantMsg, m_messagesContainer);
    m_messagesLayout->insertWidget(m_messagesLayout->count() - 1, m_streamingBubble);
    
    m_llamaEngine->generate(prompt, m_temperature, m_maxTokens);
}

void ChatWidget::onStopGeneration()
{
    m_llamaEngine->stopGeneration();
}

void ChatWidget::onTokenReceived(const QString &token)
{
    m_pendingResponse += token;
    
    if (m_streamingBubble) {
        // Update the streaming bubble
        QLabel *label = m_streamingBubble->findChild<QLabel*>();
        if (label) {
            label->setText(m_pendingResponse + "▌");
        }
    }
    
    scrollToBottom();
}

void ChatWidget::onGenerationFinished()
{
    m_isGenerating = false;
    m_inputField->setEnabled(true);
    m_sendButton->show();
    m_stopButton->hide();
    m_typingIndicator->hide();
    
    // Remove streaming bubble
    if (m_streamingBubble) {
        m_messagesLayout->removeWidget(m_streamingBubble);
        m_streamingBubble->deleteLater();
        m_streamingBubble = nullptr;
    }
    
    // Add final message
    if (!m_pendingResponse.isEmpty()) {
        ChatMessage assistantMsg;
        assistantMsg.content = m_pendingResponse.trimmed();
        assistantMsg.isUser = false;
        assistantMsg.timestamp = QDateTime::currentMSecsSinceEpoch();
        assistantMsg.id = Database::instance().insertMessage(m_sessionId, assistantMsg);
        
        m_messages.append(assistantMsg);
        addMessage(assistantMsg);
        
        // Auto-speak if enabled
        if (m_autoSpeak) {
            m_ttsEngine->speak(assistantMsg.content);
        }
    }
    
    scrollToBottom();
    m_inputField->setFocus();
}

void ChatWidget::startVoiceInput()
{
    m_voiceButton->setStyleSheet("background-color: rgba(255, 0, 0, 0.3); border-color: #ff0000;");
    m_sttEngine->startListening();
}

void ChatWidget::onVoiceInputResult(const QString &text)
{
    m_voiceButton->setStyleSheet("border-radius: 22px;");
    
    if (!text.isEmpty()) {
        m_inputField->setText(text);
        onSendMessage();
    }
}

void ChatWidget::speakLastResponse()
{
    if (!m_messages.isEmpty()) {
        for (int i = m_messages.size() - 1; i >= 0; --i) {
            if (!m_messages[i].isUser) {
                m_ttsEngine->speak(m_messages[i].content);
                break;
            }
        }
    }
}

void ChatWidget::addMessage(const ChatMessage &msg)
{
    MessageBubble *bubble = new MessageBubble(msg, m_messagesContainer);
    m_messagesLayout->insertWidget(m_messagesLayout->count() - 1, bubble);
}

void ChatWidget::scrollToBottom()
{
    QTimer::singleShot(50, [this]() {
        QScrollBar *bar = m_scrollArea->verticalScrollBar();
        bar->setValue(bar->maximum());
    });
}

void ChatWidget::clearChat()
{
    // Remove all message bubbles
    QLayoutItem *item;
    while ((item = m_messagesLayout->takeAt(0)) != nullptr) {
        if (item->widget()) {
            delete item->widget();
        }
        delete item;
    }
    m_messagesLayout->addStretch();
    m_messages.clear();
}

QString ChatWidget::buildPrompt(const QString &userMessage)
{
    QString prompt;
    
    // System prompt based on mode
    QString systemPrompt;
    if (m_currentMode == "clone") {
        // TODO: Load persona prompt from PersonaAnalyzer
        systemPrompt = "Ты - цифровой клон пользователя. Отвечай как он.";
    } else {
        systemPrompt = "Ты - Wishmaster, полезный AI ассистент. Отвечай кратко и по делу. "
                       "Отвечай на том же языке, что и пользователь.";
    }
    
    prompt += "<|im_start|>system\n" + systemPrompt + "<|im_end|>\n";
    
    // Add conversation history (last 10 messages)
    int historyStart = qMax(0, m_messages.size() - 10);
    for (int i = historyStart; i < m_messages.size(); ++i) {
        const auto &msg = m_messages[i];
        QString role = msg.isUser ? "user" : "assistant";
        prompt += QString("<|im_start|>%1\n%2<|im_end|>\n").arg(role, msg.content);
    }
    
    // Current message
    prompt += "<|im_start|>user\n" + userMessage + "<|im_end|>\n";
    prompt += "<|im_start|>assistant\n";
    
    return prompt;
}
