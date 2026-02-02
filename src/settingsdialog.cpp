#include "settingsdialog.h"
#include "database.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGroupBox>
#include <QPushButton>
#include <QLabel>
#include <QSettings>
#include <QDialogButtonBox>

SettingsDialog::SettingsDialog(QWidget *parent)
    : QDialog(parent)
{
    setWindowTitle("Настройки");
    setMinimumSize(500, 400);
    
    setupUI();
    loadSettings();
}

void SettingsDialog::setupUI()
{
    QVBoxLayout *mainLayout = new QVBoxLayout(this);
    
    m_tabs = new QTabWidget;
    mainLayout->addWidget(m_tabs);
    
    // ==================== Generation Tab ====================
    QWidget *genTab = new QWidget;
    QVBoxLayout *genLayout = new QVBoxLayout(genTab);
    
    QGroupBox *genGroup = new QGroupBox("Параметры генерации");
    QFormLayout *genForm = new QFormLayout(genGroup);
    
    // Temperature
    QWidget *tempWidget = new QWidget;
    QHBoxLayout *tempLayout = new QHBoxLayout(tempWidget);
    tempLayout->setContentsMargins(0, 0, 0, 0);
    m_temperatureSlider = new QSlider(Qt::Horizontal);
    m_temperatureSlider->setRange(0, 100);
    m_temperatureSlider->setValue(70);
    QLabel *tempValue = new QLabel("0.70");
    connect(m_temperatureSlider, &QSlider::valueChanged, [tempValue](int v) {
        tempValue->setText(QString::number(v / 100.0, 'f', 2));
    });
    tempLayout->addWidget(m_temperatureSlider);
    tempLayout->addWidget(tempValue);
    genForm->addRow("Температура:", tempWidget);
    
    // Max tokens
    m_maxTokensSpin = new QSpinBox;
    m_maxTokensSpin->setRange(64, 4096);
    m_maxTokensSpin->setValue(512);
    m_maxTokensSpin->setSingleStep(64);
    genForm->addRow("Макс. токенов:", m_maxTokensSpin);
    
    // Context length
    m_contextLengthSpin = new QSpinBox;
    m_contextLengthSpin->setRange(512, 32768);
    m_contextLengthSpin->setValue(2048);
    m_contextLengthSpin->setSingleStep(512);
    genForm->addRow("Длина контекста:", m_contextLengthSpin);
    
    genLayout->addWidget(genGroup);
    genLayout->addStretch();
    m_tabs->addTab(genTab, "⚙️ Генерация");
    
    // ==================== Voice Tab ====================
    QWidget *voiceTab = new QWidget;
    QVBoxLayout *voiceLayout = new QVBoxLayout(voiceTab);
    
    QGroupBox *voiceGroup = new QGroupBox("Голосовые настройки");
    QFormLayout *voiceForm = new QFormLayout(voiceGroup);
    
    m_ttsEngineCombo = new QComboBox;
    m_ttsEngineCombo->addItem("Silero (RU)", "silero");
    m_ttsEngineCombo->addItem("Piper", "piper");
    m_ttsEngineCombo->addItem("Системный", "system");
    voiceForm->addRow("TTS движок:", m_ttsEngineCombo);
    
    m_sttLanguageCombo = new QComboBox;
    m_sttLanguageCombo->addItem("Русский", "ru");
    m_sttLanguageCombo->addItem("English", "en");
    voiceForm->addRow("Язык STT:", m_sttLanguageCombo);
    
    m_autoSpeakCheck = new QCheckBox("Автоматически озвучивать ответы");
    voiceForm->addRow("", m_autoSpeakCheck);
    
    voiceLayout->addWidget(voiceGroup);
    voiceLayout->addStretch();
    m_tabs->addTab(voiceTab, "🎤 Голос");
    
    // ==================== Appearance Tab ====================
    QWidget *appearTab = new QWidget;
    QVBoxLayout *appearLayout = new QVBoxLayout(appearTab);
    
    QGroupBox *appearGroup = new QGroupBox("Оформление");
    QFormLayout *appearForm = new QFormLayout(appearGroup);
    
    m_themeCombo = new QComboBox;
    m_themeCombo->addItem("⬛ Тёмная", "dark");
    m_themeCombo->addItem("⬜ Светлая", "light");
    appearForm->addRow("Тема:", m_themeCombo);
    
    m_accentColorCombo = new QComboBox;
    m_accentColorCombo->addItem("🔵 Cyan", "cyan");
    m_accentColorCombo->addItem("🟣 Magenta", "magenta");
    m_accentColorCombo->addItem("🟢 Green", "green");
    m_accentColorCombo->addItem("🟡 Yellow", "yellow");
    appearForm->addRow("Акцент:", m_accentColorCombo);
    
    appearLayout->addWidget(appearGroup);
    appearLayout->addStretch();
    m_tabs->addTab(appearTab, "🎨 Оформление");
    
    // ==================== AI Clone Tab ====================
    QWidget *cloneTab = new QWidget;
    QVBoxLayout *cloneLayout = new QVBoxLayout(cloneTab);
    
    QGroupBox *cloneGroup = new QGroupBox("🧬 AI Clone");
    QVBoxLayout *cloneGroupLayout = new QVBoxLayout(cloneGroup);
    
    QLabel *desc = new QLabel("Анализирует твои сообщения и создаёт AI-клон, "
                              "который отвечает в твоём стиле.");
    desc->setWordWrap(true);
    desc->setStyleSheet("color: #888;");
    cloneGroupLayout->addWidget(desc);
    
    m_personaStatusLabel = new QLabel("Статус: не проанализировано");
    m_personaStatusLabel->setStyleSheet("color: #ffff00;");
    cloneGroupLayout->addWidget(m_personaStatusLabel);
    
    m_analyzePersonaBtn = new QPushButton("🔬 Анализировать сообщения");
    m_analyzePersonaBtn->setStyleSheet("background-color: rgba(0, 255, 0, 0.2); "
                                        "border-color: #00ff00; color: #00ff00;");
    connect(m_analyzePersonaBtn, &QPushButton::clicked, this, &SettingsDialog::onAnalyzePersona);
    cloneGroupLayout->addWidget(m_analyzePersonaBtn);
    
    cloneLayout->addWidget(cloneGroup);
    cloneLayout->addStretch();
    m_tabs->addTab(cloneTab, "🧬 AI Clone");
    
    // ==================== Buttons ====================
    QDialogButtonBox *buttons = new QDialogButtonBox(
        QDialogButtonBox::Ok | QDialogButtonBox::Cancel);
    connect(buttons, &QDialogButtonBox::accepted, this, &SettingsDialog::onAccept);
    connect(buttons, &QDialogButtonBox::rejected, this, &SettingsDialog::onReject);
    mainLayout->addWidget(buttons);
}

void SettingsDialog::loadSettings()
{
    QSettings settings;
    
    m_temperatureSlider->setValue(int(settings.value("temperature", 0.7).toFloat() * 100));
    m_maxTokensSpin->setValue(settings.value("maxTokens", 512).toInt());
    m_contextLengthSpin->setValue(settings.value("contextLength", 2048).toInt());
    
    int ttsIdx = m_ttsEngineCombo->findData(settings.value("ttsEngine", "silero"));
    if (ttsIdx >= 0) m_ttsEngineCombo->setCurrentIndex(ttsIdx);
    
    int sttIdx = m_sttLanguageCombo->findData(settings.value("sttLanguage", "ru"));
    if (sttIdx >= 0) m_sttLanguageCombo->setCurrentIndex(sttIdx);
    
    m_autoSpeakCheck->setChecked(settings.value("autoSpeak", false).toBool());
    
    int themeIdx = m_themeCombo->findData(settings.value("theme", "dark"));
    if (themeIdx >= 0) m_themeCombo->setCurrentIndex(themeIdx);
    
    int colorIdx = m_accentColorCombo->findData(settings.value("accentColor", "cyan"));
    if (colorIdx >= 0) m_accentColorCombo->setCurrentIndex(colorIdx);
    
    // Load persona status
    UserPersona persona = Database::instance().getPersona();
    if (persona.messagesAnalyzed > 0) {
        m_personaStatusLabel->setText(QString("✅ Проанализировано %1 сообщений")
                                      .arg(persona.messagesAnalyzed));
        m_personaStatusLabel->setStyleSheet("color: #00ff00;");
    }
}

void SettingsDialog::saveSettings()
{
    QSettings settings;
    
    settings.setValue("temperature", m_temperatureSlider->value() / 100.0f);
    settings.setValue("maxTokens", m_maxTokensSpin->value());
    settings.setValue("contextLength", m_contextLengthSpin->value());
    settings.setValue("ttsEngine", m_ttsEngineCombo->currentData());
    settings.setValue("sttLanguage", m_sttLanguageCombo->currentData());
    settings.setValue("autoSpeak", m_autoSpeakCheck->isChecked());
    settings.setValue("theme", m_themeCombo->currentData());
    settings.setValue("accentColor", m_accentColorCombo->currentData());
}

void SettingsDialog::onAccept()
{
    saveSettings();
    accept();
}

void SettingsDialog::onReject()
{
    reject();
}

void SettingsDialog::onAnalyzePersona()
{
    m_analyzePersonaBtn->setEnabled(false);
    m_analyzePersonaBtn->setText("Анализ...");
    
    // TODO: Run PersonaAnalyzer in background thread
    // For now, just update status
    m_personaStatusLabel->setText("⏳ Анализ в процессе...");
    
    // Simulate analysis completion
    QTimer::singleShot(2000, this, [this]() {
        m_analyzePersonaBtn->setEnabled(true);
        m_analyzePersonaBtn->setText("🔬 Анализировать сообщения");
        m_personaStatusLabel->setText("✅ Анализ завершён");
        m_personaStatusLabel->setStyleSheet("color: #00ff00;");
    });
}
