#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QStackedWidget>
#include <QListWidget>
#include <QSplitter>
#include <memory>

class ChatWidget;
class ModelManager;
class LlamaEngine;
class TTSEngine;
class STTEngine;
class PersonaAnalyzer;

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

private slots:
    void onNewChat();
    void onOpenSettings();
    void onOpenModels();
    void onSessionSelected(int index);
    void onModelLoaded(const QString &modelName);
    void onModelError(const QString &error);

private:
    void setupUI();
    void setupMenuBar();
    void setupToolBar();
    void setupStatusBar();
    void loadSessions();
    void createNewSession(const QString &title = "Новый чат");

    // UI Components
    QSplitter *m_splitter;
    QListWidget *m_sessionList;
    ChatWidget *m_chatWidget;
    QStackedWidget *m_stackedWidget;
    
    // Engines
    std::unique_ptr<LlamaEngine> m_llamaEngine;
    std::unique_ptr<TTSEngine> m_ttsEngine;
    std::unique_ptr<STTEngine> m_sttEngine;
    std::unique_ptr<ModelManager> m_modelManager;
    std::unique_ptr<PersonaAnalyzer> m_personaAnalyzer;
    
    // State
    qint64 m_currentSessionId = -1;
    QString m_currentModel;
};

#endif // MAINWINDOW_H
