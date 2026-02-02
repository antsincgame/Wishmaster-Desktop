#include "llamaengine.h"
#include <QFileInfo>
#include <QDebug>

LlamaEngine::LlamaEngine(QObject *parent)
    : QObject(parent)
{
#ifdef WITH_LLAMA
    // Initialize llama backend once
    llama_backend_init();
#endif
}

LlamaEngine::~LlamaEngine()
{
    unloadModel();
    
#ifdef WITH_LLAMA
    llama_backend_free();
#endif
}

bool LlamaEngine::loadModel(const QString &modelPath, int contextLength)
{
#ifdef WITH_LLAMA
    // Unload previous model
    unloadModel();
    
    m_modelPath = modelPath;
    m_contextLength = contextLength;
    
    // Model parameters
    llama_model_params model_params = llama_model_default_params();
    model_params.use_mmap = true;
    model_params.use_mlock = false;
    
    // Load model
    m_model = llama_model_load_from_file(modelPath.toUtf8().constData(), model_params);
    if (!m_model) {
        emit errorOccurred("Не удалось загрузить модель: " + modelPath);
        return false;
    }
    
    // Context parameters
    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = contextLength;
    ctx_params.n_batch = 512;
    ctx_params.n_threads = QThread::idealThreadCount();
    
    // Create context
    m_ctx = llama_new_context_with_model(m_model, ctx_params);
    if (!m_ctx) {
        llama_free_model(m_model);
        m_model = nullptr;
        emit errorOccurred("Не удалось создать контекст");
        return false;
    }
    
    // Extract model name
    QFileInfo fi(modelPath);
    m_modelName = fi.baseName();
    
    emit modelLoaded(m_modelName);
    qDebug() << "Model loaded:" << m_modelName << "context:" << contextLength;
    return true;
#else
    Q_UNUSED(modelPath)
    Q_UNUSED(contextLength)
    emit errorOccurred("llama.cpp не включен в сборку");
    return false;
#endif
}

void LlamaEngine::unloadModel()
{
#ifdef WITH_LLAMA
    stopGeneration();
    
    if (m_ctx) {
        llama_free(m_ctx);
        m_ctx = nullptr;
    }
    if (m_model) {
        llama_free_model(m_model);
        m_model = nullptr;
    }
    
    m_modelPath.clear();
    m_modelName.clear();
    
    emit modelUnloaded();
#endif
}

bool LlamaEngine::isModelLoaded() const
{
#ifdef WITH_LLAMA
    return m_model != nullptr && m_ctx != nullptr;
#else
    return false;
#endif
}

QString LlamaEngine::getLoadedModelName() const
{
    return m_modelName;
}

qint64 LlamaEngine::getMemoryUsageMB() const
{
#ifdef WITH_LLAMA
    if (m_ctx) {
        size_t bytes = llama_get_state_size(m_ctx);
        return bytes / (1024 * 1024);
    }
#endif
    return 0;
}

void LlamaEngine::generate(const QString &prompt, float temperature, int maxTokens)
{
#ifdef WITH_LLAMA
    if (!isModelLoaded()) {
        emit errorOccurred("Модель не загружена");
        return;
    }
    
    // Clean up previous worker
    if (m_workerThread && m_workerThread->isRunning()) {
        stopGeneration();
        m_workerThread->wait();
    }
    
    m_stopRequested = false;
    
    // Create worker thread
    m_workerThread = new QThread(this);
    m_worker = new GenerationWorker(m_ctx, prompt, temperature, maxTokens, &m_stopRequested);
    m_worker->moveToThread(m_workerThread);
    
    connect(m_workerThread, &QThread::started, m_worker, &GenerationWorker::process);
    connect(m_worker, &GenerationWorker::tokenGenerated, this, &LlamaEngine::onWorkerToken);
    connect(m_worker, &GenerationWorker::finished, this, &LlamaEngine::onWorkerFinished);
    connect(m_worker, &GenerationWorker::error, this, &LlamaEngine::onWorkerError);
    connect(m_worker, &GenerationWorker::finished, m_workerThread, &QThread::quit);
    connect(m_workerThread, &QThread::finished, m_worker, &QObject::deleteLater);
    connect(m_workerThread, &QThread::finished, m_workerThread, &QObject::deleteLater);
    
    m_workerThread->start();
#else
    Q_UNUSED(prompt)
    Q_UNUSED(temperature)
    Q_UNUSED(maxTokens)
    emit errorOccurred("llama.cpp не включен в сборку");
#endif
}

void LlamaEngine::stopGeneration()
{
    m_stopRequested = true;
}

void LlamaEngine::onWorkerToken(const QString &token)
{
    emit tokenGenerated(token);
}

void LlamaEngine::onWorkerFinished()
{
    m_workerThread = nullptr;
    m_worker = nullptr;
    emit generationFinished();
}

void LlamaEngine::onWorkerError(const QString &error)
{
    emit errorOccurred(error);
}

// ==================== GenerationWorker ====================

#ifdef WITH_LLAMA
GenerationWorker::GenerationWorker(llama_context *ctx, const QString &prompt,
                                   float temp, int maxTokens, std::atomic<bool> *stopFlag)
    : m_ctx(ctx)
    , m_prompt(prompt)
    , m_temperature(temp)
    , m_maxTokens(maxTokens)
    , m_stopFlag(stopFlag)
{
}
#else
GenerationWorker::GenerationWorker(void *ctx, const QString &prompt,
                                   float temp, int maxTokens, std::atomic<bool> *stopFlag)
    : m_ctx(ctx)
    , m_prompt(prompt)
    , m_temperature(temp)
    , m_maxTokens(maxTokens)
    , m_stopFlag(stopFlag)
{
}
#endif

void GenerationWorker::process()
{
#ifdef WITH_LLAMA
    if (!m_ctx) {
        emit error("Context is null");
        emit finished();
        return;
    }
    
    const llama_model *model = llama_get_model(m_ctx);
    const llama_vocab *vocab = llama_model_get_vocab(model);
    
    // Tokenize prompt
    std::vector<llama_token> tokens(m_prompt.length() + 256);
    int n_tokens = llama_tokenize(vocab, m_prompt.toUtf8().constData(), m_prompt.length(),
                                   tokens.data(), tokens.size(), true, true);
    if (n_tokens < 0) {
        emit error("Ошибка токенизации");
        emit finished();
        return;
    }
    tokens.resize(n_tokens);
    
    // Clear KV cache
    llama_kv_cache_clear(m_ctx);
    
    // Process prompt
    llama_batch batch = llama_batch_init(512, 0, 1);
    
    for (int i = 0; i < n_tokens; ++i) {
        llama_batch_add(batch, tokens[i], i, {0}, false);
    }
    batch.logits[batch.n_tokens - 1] = true;
    
    if (llama_decode(m_ctx, batch) != 0) {
        emit error("Ошибка декодирования промпта");
        llama_batch_free(batch);
        emit finished();
        return;
    }
    
    // Generation loop
    int n_generated = 0;
    llama_token eos_token = llama_token_eos(vocab);
    
    // Stop sequences
    QStringList stopSequences = {"<|im_end|>", "<|im_start|>", "### User:", "\nUser:"};
    QString generatedText;
    
    while (n_generated < m_maxTokens && !m_stopFlag->load()) {
        // Sample next token
        float *logits = llama_get_logits_ith(m_ctx, batch.n_tokens - 1);
        
        llama_token new_token;
        if (m_temperature <= 0.0f) {
            // Greedy
            new_token = std::max_element(logits, logits + llama_n_vocab(model)) - logits;
        } else {
            // Temperature sampling
            std::vector<llama_token_data> candidates;
            candidates.reserve(llama_n_vocab(model));
            for (llama_token i = 0; i < llama_n_vocab(model); ++i) {
                candidates.push_back({i, logits[i], 0.0f});
            }
            llama_token_data_array candidates_p = {candidates.data(), candidates.size(), false};
            
            llama_sample_temp(m_ctx, &candidates_p, m_temperature);
            llama_sample_top_p(m_ctx, &candidates_p, 0.95f, 1);
            new_token = llama_sample_token(m_ctx, &candidates_p);
        }
        
        // Check for EOS
        if (new_token == eos_token) {
            break;
        }
        
        // Convert token to text
        char buf[256];
        int len = llama_token_to_piece(vocab, new_token, buf, sizeof(buf), 0, true);
        if (len > 0) {
            QString piece = QString::fromUtf8(buf, len);
            generatedText += piece;
            
            // Check stop sequences
            bool shouldStop = false;
            for (const auto &stop : stopSequences) {
                if (generatedText.endsWith(stop)) {
                    generatedText.chop(stop.length());
                    shouldStop = true;
                    break;
                }
            }
            
            if (shouldStop) {
                break;
            }
            
            emit tokenGenerated(piece);
        }
        
        // Prepare next batch
        llama_batch_clear(batch);
        llama_batch_add(batch, new_token, n_tokens + n_generated, {0}, true);
        
        if (llama_decode(m_ctx, batch) != 0) {
            emit error("Ошибка декодирования");
            break;
        }
        
        ++n_generated;
    }
    
    llama_batch_free(batch);
    emit finished();
#else
    emit error("llama.cpp не включен");
    emit finished();
#endif
}
