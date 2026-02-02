#ifndef LLAMAENGINE_H
#define LLAMAENGINE_H

#include <QObject>
#include <QString>
#include <QThread>
#include <atomic>

#ifdef WITH_LLAMA
#include "llama.h"
#endif

class GenerationWorker;

class LlamaEngine : public QObject
{
    Q_OBJECT

public:
    explicit LlamaEngine(QObject *parent = nullptr);
    ~LlamaEngine();
    
    bool loadModel(const QString &modelPath, int contextLength = 2048);
    void unloadModel();
    bool isModelLoaded() const;
    QString getLoadedModelName() const;
    qint64 getMemoryUsageMB() const;
    
    void generate(const QString &prompt, float temperature = 0.7f, int maxTokens = 512);
    void stopGeneration();

signals:
    void modelLoaded(const QString &modelName);
    void modelUnloaded();
    void errorOccurred(const QString &error);
    void tokenGenerated(const QString &token);
    void generationFinished();
    void generationProgress(int tokensGenerated, int maxTokens);

private slots:
    void onWorkerToken(const QString &token);
    void onWorkerFinished();
    void onWorkerError(const QString &error);

private:
#ifdef WITH_LLAMA
    llama_model *m_model = nullptr;
    llama_context *m_ctx = nullptr;
#endif
    
    QThread *m_workerThread = nullptr;
    GenerationWorker *m_worker = nullptr;
    
    QString m_modelPath;
    QString m_modelName;
    int m_contextLength = 2048;
    std::atomic<bool> m_stopRequested{false};
};

// Worker for background generation
class GenerationWorker : public QObject
{
    Q_OBJECT
    
public:
#ifdef WITH_LLAMA
    GenerationWorker(llama_context *ctx, const QString &prompt, 
                     float temp, int maxTokens, std::atomic<bool> *stopFlag);
#else
    GenerationWorker(void *ctx, const QString &prompt,
                     float temp, int maxTokens, std::atomic<bool> *stopFlag);
#endif

public slots:
    void process();

signals:
    void tokenGenerated(const QString &token);
    void finished();
    void error(const QString &msg);

private:
#ifdef WITH_LLAMA
    llama_context *m_ctx;
#else
    void *m_ctx;
#endif
    QString m_prompt;
    float m_temperature;
    int m_maxTokens;
    std::atomic<bool> *m_stopFlag;
};

#endif // LLAMAENGINE_H
