#include "mainwindow.h"
#include "chatwidget.h"
#include "settingsdialog.h"
#include "modelmanager.h"
#include "database.h"
#include "llm/llamaengine.h"
#include "voice/ttsengine.h"
#include "voice/sttengine.h"
#include "persona/personaanalyzer.h"

#include <QMenuBar>
#include <QToolBar>
#include <QStatusBar>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QMessageBox>
#include <QFileDialog>
#include <QSettings>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , m_llamaEngine(std::make_unique<LlamaEngine>())
    , m_ttsEngine(std::make_unique<TTSEngine>())
    , m_sttEngine(std::make_unique<STTEngine>())
    , m_modelManager(std::make_unique<ModelManager>())
    , m_personaAnalyzer(std::make_unique<PersonaAnalyzer>())
{
    setWindowTitle("Wishmaster Desktop");
    setMinimumSize(1200, 800);
    
    setupUI();
    setupMenuBar();
    setupToolBar();
    setupStatusBar();
    loadSessions();
    
    // Connect engine signals
    connect(m_llamaEngine.get(), &LlamaEngine::modelLoaded, 
            this, &MainWindow::onModelLoaded);
    connect(m_llamaEngine.get(), &LlamaEngine::errorOccurred,
            this, &MainWindow::onModelError);
    
    // Load last used model
    QSettings settings;
    QString lastModel = settings.value("lastModel").toString();
    if (!lastModel.isEmpty() && QFile::exists(lastModel)) {
        m_llamaEngine->loadModel(lastModel);
    }
}

MainWindow::~MainWindow() = default;

void MainWindow::setupUI()
{
    // Main splitter
    m_splitter = new QSplitter(Qt::Horizontal, this);
    setCentralWidget(m_splitter);
    
    // Left panel - Session list
    QWidget *leftPanel = new QWidget;
    QVBoxLayout *leftLayout = new QVBoxLayout(leftPanel);
    leftLayout->setContentsMargins(10, 10, 10, 10);
    
    // Logo / Title
    QLabel *logo = new QLabel("🧞 WISHMASTER");
    logo->setStyleSheet("font-size: 24px; font-weight: bold; color: #00ffff; padding: 10px;");
    logo->setAlignment(Qt::AlignCenter);
    leftLayout->addWidget(logo);
    
    // New chat button
    QPushButton *newChatBtn = new QPushButton("+ Новый чат");
    newChatBtn->setStyleSheet("background-color: rgba(255, 0, 128, 0.2); border-color: #ff0080; color: #ff0080;");
    connect(newChatBtn, &QPushButton::clicked, this, &MainWindow::onNewChat);
    leftLayout->addWidget(newChatBtn);
    
    // Session list
    m_sessionList = new QListWidget;
    m_sessionList->setStyleSheet("QListWidget { background-color: transparent; border: none; }");
    connect(m_sessionList, &QListWidget::currentRowChanged, 
            this, &MainWindow::onSessionSelected);
    leftLayout->addWidget(m_sessionList);
    
    leftPanel->setFixedWidth(280);
    m_splitter->addWidget(leftPanel);
    
    // Right panel - Chat area
    m_chatWidget = new ChatWidget(m_llamaEngine.get(), m_ttsEngine.get(), m_sttEngine.get());
    m_splitter->addWidget(m_chatWidget);
    
    // Splitter proportions
    m_splitter->setStretchFactor(0, 0);
    m_splitter->setStretchFactor(1, 1);
}

void MainWindow::setupMenuBar()
{
    QMenuBar *menuBar = this->menuBar();
    
    // File menu
    QMenu *fileMenu = menuBar->addMenu("&Файл");
    fileMenu->addAction("Новый чат", this, &MainWindow::onNewChat, QKeySequence::New);
    fileMenu->addSeparator();
    fileMenu->addAction("Настройки", this, &MainWindow::onOpenSettings, QKeySequence::Preferences);
    fileMenu->addSeparator();
    fileMenu->addAction("Выход", this, &QWidget::close, QKeySequence::Quit);
    
    // Model menu
    QMenu *modelMenu = menuBar->addMenu("&Модель");
    modelMenu->addAction("Управление моделями", this, &MainWindow::onOpenModels);
    modelMenu->addSeparator();
    modelMenu->addAction("Загрузить модель...", [this]() {
        QString file = QFileDialog::getOpenFileName(this, 
            "Выберите модель GGUF", 
            QDir::homePath(), 
            "GGUF Models (*.gguf)");
        if (!file.isEmpty()) {
            m_llamaEngine->loadModel(file);
        }
    });
    
    // Voice menu
    QMenu *voiceMenu = menuBar->addMenu("&Голос");
    voiceMenu->addAction("Голосовой ввод", [this]() {
        m_chatWidget->startVoiceInput();
    }, QKeySequence(Qt::CTRL | Qt::Key_M));
    voiceMenu->addAction("Озвучить последний ответ", [this]() {
        m_chatWidget->speakLastResponse();
    });
    
    // Help menu
    QMenu *helpMenu = menuBar->addMenu("&Справка");
    helpMenu->addAction("О программе", [this]() {
        QMessageBox::about(this, "О Wishmaster",
            "<h2>Wishmaster Desktop</h2>"
            "<p>Локальный AI ассистент с поддержкой llama.cpp</p>"
            "<p>Версия 1.0.0</p>"
            "<p>© 2026 Wishmaster Team</p>");
    });
}

void MainWindow::setupToolBar()
{
    QToolBar *toolbar = addToolBar("Main");
    toolbar->setMovable(false);
    toolbar->setStyleSheet("QToolBar { background: #191923; border-bottom: 1px solid #00ffff; padding: 5px; }");
    
    toolbar->addAction("🗨️ Чат", [this]() { /* switch to chat */ });
    toolbar->addAction("⚙️ Настройки", this, &MainWindow::onOpenSettings);
    toolbar->addAction("📦 Модели", this, &MainWindow::onOpenModels);
    toolbar->addSeparator();
    
    // Model status
    QLabel *modelLabel = new QLabel("Модель: не загружена");
    modelLabel->setObjectName("modelStatusLabel");
    modelLabel->setStyleSheet("color: #888; padding: 0 20px;");
    toolbar->addWidget(modelLabel);
    
    toolbar->addSeparator();
    
    // Memory usage
    QLabel *memLabel = new QLabel("RAM: 0 MB");
    memLabel->setObjectName("memoryLabel");
    memLabel->setStyleSheet("color: #00ff00; padding: 0 10px;");
    toolbar->addWidget(memLabel);
}

void MainWindow::setupStatusBar()
{
    QStatusBar *status = statusBar();
    status->setStyleSheet("QStatusBar { background: #191923; border-top: 1px solid #00ffff; color: #888; }");
    status->showMessage("Готов к работе");
}

void MainWindow::loadSessions()
{
    m_sessionList->clear();
    
    auto sessions = Database::instance().getAllSessions();
    for (const auto &session : sessions) {
        QListWidgetItem *item = new QListWidgetItem(session.title);
        item->setData(Qt::UserRole, session.id);
        item->setToolTip(QString("Создан: %1\nСообщений: %2")
            .arg(QDateTime::fromMSecsSinceEpoch(session.createdAt).toString("dd.MM.yyyy hh:mm"))
            .arg(session.messageCount));
        m_sessionList->addItem(item);
    }
    
    // Select first session or create new
    if (m_sessionList->count() > 0) {
        m_sessionList->setCurrentRow(0);
    } else {
        createNewSession("Основной чат");
    }
}

void MainWindow::createNewSession(const QString &title)
{
    qint64 sessionId = Database::instance().createSession(title);
    
    QListWidgetItem *item = new QListWidgetItem(title);
    item->setData(Qt::UserRole, sessionId);
    m_sessionList->insertItem(0, item);
    m_sessionList->setCurrentRow(0);
}

void MainWindow::onNewChat()
{
    createNewSession("Новый чат");
}

void MainWindow::onOpenSettings()
{
    SettingsDialog dialog(this);
    if (dialog.exec() == QDialog::Accepted) {
        // Apply settings
        m_chatWidget->reloadSettings();
    }
}

void MainWindow::onOpenModels()
{
    m_modelManager->show();
}

void MainWindow::onSessionSelected(int index)
{
    if (index < 0) return;
    
    QListWidgetItem *item = m_sessionList->item(index);
    if (!item) return;
    
    m_currentSessionId = item->data(Qt::UserRole).toLongLong();
    m_chatWidget->loadSession(m_currentSessionId);
    
    statusBar()->showMessage(QString("Сессия: %1").arg(item->text()));
}

void MainWindow::onModelLoaded(const QString &modelName)
{
    m_currentModel = modelName;
    
    // Update UI
    QLabel *label = findChild<QLabel*>("modelStatusLabel");
    if (label) {
        label->setText(QString("Модель: %1").arg(modelName));
        label->setStyleSheet("color: #00ff00; padding: 0 20px;");
    }
    
    // Save to settings
    QSettings settings;
    settings.setValue("lastModel", modelName);
    
    statusBar()->showMessage(QString("Модель загружена: %1").arg(modelName), 5000);
}

void MainWindow::onModelError(const QString &error)
{
    QLabel *label = findChild<QLabel*>("modelStatusLabel");
    if (label) {
        label->setText("Модель: ошибка");
        label->setStyleSheet("color: #ff0000; padding: 0 20px;");
    }
    
    QMessageBox::critical(this, "Ошибка загрузки модели", error);
}
