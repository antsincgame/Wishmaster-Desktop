#ifndef SETTINGSDIALOG_H
#define SETTINGSDIALOG_H

#include <QDialog>
#include <QTabWidget>
#include <QSlider>
#include <QSpinBox>
#include <QComboBox>
#include <QCheckBox>
#include <QLineEdit>

class SettingsDialog : public QDialog
{
    Q_OBJECT

public:
    explicit SettingsDialog(QWidget *parent = nullptr);

private slots:
    void onAccept();
    void onReject();
    void onAnalyzePersona();

private:
    void setupUI();
    void loadSettings();
    void saveSettings();
    
    QTabWidget *m_tabs;
    
    // Generation settings
    QSlider *m_temperatureSlider;
    QSpinBox *m_maxTokensSpin;
    QSpinBox *m_contextLengthSpin;
    
    // Voice settings
    QComboBox *m_ttsEngineCombo;
    QComboBox *m_sttLanguageCombo;
    QCheckBox *m_autoSpeakCheck;
    
    // Appearance
    QComboBox *m_themeCombo;
    QComboBox *m_accentColorCombo;
    
    // AI Clone
    QPushButton *m_analyzePersonaBtn;
    QLabel *m_personaStatusLabel;
};

#endif // SETTINGSDIALOG_H
