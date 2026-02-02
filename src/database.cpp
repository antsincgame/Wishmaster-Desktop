#include "database.h"
#include "chatwidget.h"

#include <QSqlQuery>
#include <QSqlError>
#include <QStandardPaths>
#include <QDir>
#include <QDebug>
#include <QDateTime>

Database& Database::instance()
{
    static Database instance;
    return instance;
}

Database::Database()
{
}

Database::~Database()
{
    close();
}

bool Database::initialize()
{
    // Database path
    QString dataPath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dataPath);
    QString dbPath = dataPath + "/wishmaster.db";
    
    m_db = QSqlDatabase::addDatabase("QSQLITE");
    m_db.setDatabaseName(dbPath);
    
    if (!m_db.open()) {
        qCritical() << "Failed to open database:" << m_db.lastError().text();
        return false;
    }
    
    qDebug() << "Database opened:" << dbPath;
    
    createTables();
    runMigrations();
    
    return true;
}

void Database::close()
{
    if (m_db.isOpen()) {
        m_db.close();
    }
}

void Database::createTables()
{
    QSqlQuery query;
    
    // Sessions table
    query.exec(R"(
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Новый чат',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0,
            last_message TEXT,
            mode TEXT NOT NULL DEFAULT 'chat'
        )
    )");
    
    // Messages table
    query.exec(R"(
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_user INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
    )");
    
    // Settings table
    query.exec(R"(
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    )");
    
    // Persona table
    query.exec(R"(
        CREATE TABLE IF NOT EXISTS persona (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL DEFAULT 'default',
            writing_style TEXT NOT NULL DEFAULT 'neutral',
            average_word_count REAL NOT NULL DEFAULT 0,
            emoji_usage TEXT NOT NULL DEFAULT 'none',
            tone TEXT NOT NULL DEFAULT 'friendly',
            common_phrases TEXT NOT NULL DEFAULT '[]',
            messages_analyzed INTEGER NOT NULL DEFAULT 0,
            last_analyzed_at INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id)
        )
    )");
    
    // Indexes
    query.exec("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)");
    query.exec("CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(content)");
}

void Database::runMigrations()
{
    // Future migrations can be added here
    QString version = getSetting("db_version", "1");
    int v = version.toInt();
    
    // Migration example:
    // if (v < 2) {
    //     query.exec("ALTER TABLE ...");
    //     setSetting("db_version", "2");
    // }
    
    Q_UNUSED(v)
}

// ==================== Sessions ====================

QList<ChatSession> Database::getAllSessions()
{
    QList<ChatSession> sessions;
    QSqlQuery query("SELECT id, title, created_at, updated_at, message_count, last_message, mode "
                    "FROM sessions ORDER BY updated_at DESC");
    
    while (query.next()) {
        ChatSession s;
        s.id = query.value(0).toLongLong();
        s.title = query.value(1).toString();
        s.createdAt = query.value(2).toLongLong();
        s.updatedAt = query.value(3).toLongLong();
        s.messageCount = query.value(4).toInt();
        s.lastMessage = query.value(5).toString();
        s.mode = query.value(6).toString();
        sessions.append(s);
    }
    
    return sessions;
}

ChatSession Database::getSession(qint64 id)
{
    ChatSession s;
    QSqlQuery query;
    query.prepare("SELECT id, title, created_at, updated_at, message_count, last_message, mode "
                  "FROM sessions WHERE id = ?");
    query.addBindValue(id);
    
    if (query.exec() && query.next()) {
        s.id = query.value(0).toLongLong();
        s.title = query.value(1).toString();
        s.createdAt = query.value(2).toLongLong();
        s.updatedAt = query.value(3).toLongLong();
        s.messageCount = query.value(4).toInt();
        s.lastMessage = query.value(5).toString();
        s.mode = query.value(6).toString();
    }
    
    return s;
}

qint64 Database::createSession(const QString &title, const QString &mode)
{
    qint64 now = QDateTime::currentMSecsSinceEpoch();
    
    QSqlQuery query;
    query.prepare("INSERT INTO sessions (title, created_at, updated_at, mode) VALUES (?, ?, ?, ?)");
    query.addBindValue(title);
    query.addBindValue(now);
    query.addBindValue(now);
    query.addBindValue(mode);
    
    if (query.exec()) {
        return query.lastInsertId().toLongLong();
    }
    
    return -1;
}

void Database::updateSession(const ChatSession &session)
{
    QSqlQuery query;
    query.prepare("UPDATE sessions SET title = ?, updated_at = ?, message_count = ?, "
                  "last_message = ?, mode = ? WHERE id = ?");
    query.addBindValue(session.title);
    query.addBindValue(QDateTime::currentMSecsSinceEpoch());
    query.addBindValue(session.messageCount);
    query.addBindValue(session.lastMessage);
    query.addBindValue(session.mode);
    query.addBindValue(session.id);
    query.exec();
}

void Database::deleteSession(qint64 id)
{
    QSqlQuery query;
    query.prepare("DELETE FROM sessions WHERE id = ?");
    query.addBindValue(id);
    query.exec();
    
    // Messages are deleted via CASCADE
}

// ==================== Messages ====================

QList<ChatMessage> Database::getMessagesBySession(qint64 sessionId)
{
    QList<ChatMessage> messages;
    
    QSqlQuery query;
    query.prepare("SELECT id, content, is_user, timestamp FROM messages "
                  "WHERE session_id = ? ORDER BY timestamp ASC");
    query.addBindValue(sessionId);
    
    if (query.exec()) {
        while (query.next()) {
            ChatMessage m;
            m.id = query.value(0).toLongLong();
            m.content = query.value(1).toString();
            m.isUser = query.value(2).toBool();
            m.timestamp = query.value(3).toLongLong();
            messages.append(m);
        }
    }
    
    return messages;
}

qint64 Database::insertMessage(qint64 sessionId, const ChatMessage &msg)
{
    QSqlQuery query;
    query.prepare("INSERT INTO messages (session_id, content, is_user, timestamp) "
                  "VALUES (?, ?, ?, ?)");
    query.addBindValue(sessionId);
    query.addBindValue(msg.content);
    query.addBindValue(msg.isUser ? 1 : 0);
    query.addBindValue(msg.timestamp);
    
    if (query.exec()) {
        qint64 msgId = query.lastInsertId().toLongLong();
        
        // Update session
        QSqlQuery updateQuery;
        updateQuery.prepare("UPDATE sessions SET updated_at = ?, message_count = message_count + 1, "
                            "last_message = ? WHERE id = ?");
        updateQuery.addBindValue(msg.timestamp);
        updateQuery.addBindValue(msg.content.left(100));
        updateQuery.addBindValue(sessionId);
        updateQuery.exec();
        
        return msgId;
    }
    
    return -1;
}

void Database::deleteMessagesBySession(qint64 sessionId)
{
    QSqlQuery query;
    query.prepare("DELETE FROM messages WHERE session_id = ?");
    query.addBindValue(sessionId);
    query.exec();
}

QList<ChatMessage> Database::searchMessages(const QString &searchQuery, int limit)
{
    QList<ChatMessage> messages;
    
    QSqlQuery query;
    query.prepare("SELECT id, content, is_user, timestamp FROM messages "
                  "WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?");
    query.addBindValue("%" + searchQuery + "%");
    query.addBindValue(limit);
    
    if (query.exec()) {
        while (query.next()) {
            ChatMessage m;
            m.id = query.value(0).toLongLong();
            m.content = query.value(1).toString();
            m.isUser = query.value(2).toBool();
            m.timestamp = query.value(3).toLongLong();
            messages.append(m);
        }
    }
    
    return messages;
}

// ==================== Persona ====================

UserPersona Database::getPersona(const QString &userId)
{
    UserPersona p;
    
    QSqlQuery query;
    query.prepare("SELECT * FROM persona WHERE user_id = ?");
    query.addBindValue(userId);
    
    if (query.exec() && query.next()) {
        p.id = query.value(0).toLongLong();
        p.userId = query.value(1).toString();
        p.writingStyle = query.value(2).toString();
        p.averageWordCount = query.value(3).toFloat();
        p.emojiUsage = query.value(4).toString();
        p.tone = query.value(5).toString();
        p.commonPhrases = query.value(6).toString();
        p.messagesAnalyzed = query.value(7).toInt();
        p.lastAnalyzedAt = query.value(8).toLongLong();
    }
    
    return p;
}

void Database::savePersona(const UserPersona &persona)
{
    QSqlQuery query;
    query.prepare("INSERT OR REPLACE INTO persona "
                  "(user_id, writing_style, average_word_count, emoji_usage, tone, "
                  "common_phrases, messages_analyzed, last_analyzed_at) "
                  "VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    query.addBindValue(persona.userId);
    query.addBindValue(persona.writingStyle);
    query.addBindValue(persona.averageWordCount);
    query.addBindValue(persona.emojiUsage);
    query.addBindValue(persona.tone);
    query.addBindValue(persona.commonPhrases);
    query.addBindValue(persona.messagesAnalyzed);
    query.addBindValue(QDateTime::currentMSecsSinceEpoch());
    query.exec();
}

// ==================== Settings ====================

QString Database::getSetting(const QString &key, const QString &defaultValue)
{
    QSqlQuery query;
    query.prepare("SELECT value FROM settings WHERE key = ?");
    query.addBindValue(key);
    
    if (query.exec() && query.next()) {
        return query.value(0).toString();
    }
    
    return defaultValue;
}

void Database::setSetting(const QString &key, const QString &value)
{
    QSqlQuery query;
    query.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    query.addBindValue(key);
    query.addBindValue(value);
    query.exec();
}
