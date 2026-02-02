#include "modelmanager.h"
#include "database.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFileDialog>
#include <QMessageBox>
#include <QDir>
#include <QFileInfo>
#include <QStandardPaths>

ModelManager::ModelManager(QWidget *parent)
    : QDialog(parent)
{
    setWindowTitle("Управление моделями");
    setMinimumSize(600, 400);
    
    setupUI();
    scanForModels();
    refreshList();
}

void ModelManager::setupUI()
{
    QVBoxLayout *mainLayout = new QVBoxLayout(this);
    
    // Model list
    m_modelList = new QListWidget;
    m_modelList->setStyleSheet(R"(
        QListWidget::item {
            padding: 15px;
            border-bottom: 1px solid rgba(0, 255, 255, 0.2);
        }
        QListWidget::item:selected {
            background-color: rgba(0, 255, 255, 0.2);
        }
    )");
    mainLayout->addWidget(m_modelList);
    
    // Progress bar (hidden by default)
    m_progress = new QProgressBar;
    m_progress->hide();
    mainLayout->addWidget(m_progress);
    
    // Buttons
    QHBoxLayout *btnLayout = new QHBoxLayout;
    
    m_scanBtn = new QPushButton("🔍 Сканировать");
    connect(m_scanBtn, &QPushButton::clicked, this, &ModelManager::onScanModels);
    btnLayout->addWidget(m_scanBtn);
    
    m_addBtn = new QPushButton("➕ Добавить");
    m_addBtn->setStyleSheet("background-color: rgba(0, 255, 0, 0.2); border-color: #00ff00; color: #00ff00;");
    connect(m_addBtn, &QPushButton::clicked, this, &ModelManager::onAddModel);
    btnLayout->addWidget(m_addBtn);
    
    m_removeBtn = new QPushButton("🗑️ Удалить");
    m_removeBtn->setStyleSheet("background-color: rgba(255, 0, 0, 0.2); border-color: #ff0000; color: #ff0000;");
    connect(m_removeBtn, &QPushButton::clicked, this, &ModelManager::onRemoveModel);
    btnLayout->addWidget(m_removeBtn);
    
    btnLayout->addStretch();
    
    m_selectBtn = new QPushButton("✓ Выбрать");
    m_selectBtn->setStyleSheet("min-width: 120px;");
    connect(m_selectBtn, &QPushButton::clicked, this, &ModelManager::onSelectModel);
    btnLayout->addWidget(m_selectBtn);
    
    mainLayout->addLayout(btnLayout);
}

void ModelManager::scanForModels()
{
    m_models.clear();
    
    // Scan common directories
    QStringList searchPaths = {
        QDir::homePath() + "/models",
        QDir::homePath() + "/Downloads",
        QDir::homePath() + "/.cache/llama.cpp",
        QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + "/models",
        "/usr/share/llama/models",
        "C:/models",
        "D:/models"
    };
    
    for (const QString &path : searchPaths) {
        QDir dir(path);
        if (!dir.exists()) continue;
        
        QFileInfoList files = dir.entryInfoList({"*.gguf"}, QDir::Files);
        for (const QFileInfo &fi : files) {
            ModelInfo info;
            info.name = fi.baseName();
            info.path = fi.absoluteFilePath();
            info.sizeBytes = fi.size();
            info.isValid = true;
            m_models.append(info);
        }
    }
}

void ModelManager::refreshList()
{
    m_modelList->clear();
    
    for (const ModelInfo &model : m_models) {
        QListWidgetItem *item = new QListWidgetItem;
        item->setText(QString("%1\n📁 %2\n💾 %3")
                      .arg(model.name)
                      .arg(model.path)
                      .arg(formatSize(model.sizeBytes)));
        item->setData(Qt::UserRole, model.path);
        
        if (!model.isValid) {
            item->setForeground(Qt::red);
        }
        
        m_modelList->addItem(item);
    }
    
    if (m_models.isEmpty()) {
        QListWidgetItem *item = new QListWidgetItem;
        item->setText("Модели не найдены.\nНажмите 'Добавить' чтобы выбрать файл .gguf");
        item->setForeground(QColor("#888888"));
        item->setFlags(item->flags() & ~Qt::ItemIsSelectable);
        m_modelList->addItem(item);
    }
}

void ModelManager::onAddModel()
{
    QString file = QFileDialog::getOpenFileName(this,
        "Выберите модель GGUF",
        QDir::homePath(),
        "GGUF Models (*.gguf);;All Files (*)");
    
    if (file.isEmpty()) return;
    
    QFileInfo fi(file);
    ModelInfo info;
    info.name = fi.baseName();
    info.path = fi.absoluteFilePath();
    info.sizeBytes = fi.size();
    info.isValid = true;
    
    m_models.append(info);
    refreshList();
}

void ModelManager::onRemoveModel()
{
    QListWidgetItem *item = m_modelList->currentItem();
    if (!item) return;
    
    QString path = item->data(Qt::UserRole).toString();
    
    for (int i = 0; i < m_models.size(); ++i) {
        if (m_models[i].path == path) {
            m_models.removeAt(i);
            break;
        }
    }
    
    refreshList();
}

void ModelManager::onSelectModel()
{
    QListWidgetItem *item = m_modelList->currentItem();
    if (!item) return;
    
    QString path = item->data(Qt::UserRole).toString();
    if (!path.isEmpty()) {
        emit modelSelected(path);
        accept();
    }
}

void ModelManager::onScanModels()
{
    m_scanBtn->setEnabled(false);
    m_scanBtn->setText("Сканирование...");
    
    scanForModels();
    refreshList();
    
    m_scanBtn->setEnabled(true);
    m_scanBtn->setText("🔍 Сканировать");
}

QList<ModelInfo> ModelManager::getAvailableModels() const
{
    return m_models;
}

QString ModelManager::formatSize(qint64 bytes)
{
    if (bytes < 1024) return QString::number(bytes) + " B";
    if (bytes < 1024 * 1024) return QString::number(bytes / 1024) + " KB";
    if (bytes < 1024 * 1024 * 1024) return QString::number(bytes / (1024 * 1024)) + " MB";
    return QString::number(bytes / (1024.0 * 1024 * 1024), 'f', 1) + " GB";
}
