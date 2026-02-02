#ifndef MODELMANAGER_H
#define MODELMANAGER_H

#include <QDialog>
#include <QListWidget>
#include <QProgressBar>
#include <QPushButton>

struct ModelInfo {
    QString name;
    QString path;
    qint64 sizeBytes = 0;
    bool isValid = true;
    QString description;
};

class ModelManager : public QDialog
{
    Q_OBJECT

public:
    explicit ModelManager(QWidget *parent = nullptr);
    
    QList<ModelInfo> getAvailableModels() const;
    void scanForModels();

signals:
    void modelSelected(const QString &path);

private slots:
    void onAddModel();
    void onRemoveModel();
    void onSelectModel();
    void onScanModels();

private:
    void setupUI();
    void refreshList();
    QString formatSize(qint64 bytes);
    
    QListWidget *m_modelList;
    QPushButton *m_addBtn;
    QPushButton *m_removeBtn;
    QPushButton *m_selectBtn;
    QPushButton *m_scanBtn;
    QProgressBar *m_progress;
    
    QList<ModelInfo> m_models;
};

#endif // MODELMANAGER_H
