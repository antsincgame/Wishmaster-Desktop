#ifndef DATABASE_H
#define DATABASE_H

#include <QObject>
#include <QString>
#include <QList>
#include <QSqlDatabase>

struct ChatMessage;

struct ChatSession {
    qint64 id = -1;
    QString title;
    qint64 createdAt = 0;
    qint64 updatedAt = 0;
    int messageCount = 0;
    QString lastMessage;
    QString mode = "chat";
};

struct UserPersona {
    qint64 id = -1;
    QString userId = "default";
    QString writingStyle = "neutral";
    float averageWordCount = 0;
    QString emojiUsage = "none";
    QString tone = "friendly";
    QString commonPhrases; // JSON array
    int messagesAnalyzed = 0;
    qint64 lastAnalyzedAt = 0;
};

class Database : public QObject
{
    Q_OBJECT
    
public:
    static Database& instance();
    
    bool initialize();
    void close();
    
    // Sessions
    QList<ChatSession> getAllSessions();
    ChatSession getSession(qint64 id);
    qint64 createSession(const QString &title, const QString &mode = "chat");
    void updateSession(const ChatSession &session);
    void deleteSession(qint64 id);
    
    // Messages
    QList<ChatMessage> getMessagesBySession(qint64 sessionId);
    qint64 insertMessage(qint64 sessionId, const ChatMessage &msg);
    void deleteMessagesBySession(qint64 sessionId);
    QList<ChatMessage> searchMessages(const QString &query, int limit = 100);
    
    // Persona
    UserPersona getPersona(const QString &userId = "default");
    void savePersona(const UserPersona &persona);
    
    // Settings
    QString getSetting(const QString &key, const QString &defaultValue = QString());
    void setSetting(const QString &key, const QString &value);
    
private:
    Database();
    ~Database();
    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;
    
    void createTables();
    void runMigrations();
    
    QSqlDatabase m_db;
};

#endif // DATABASE_H
