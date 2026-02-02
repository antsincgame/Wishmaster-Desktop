#ifndef PERSONAANALYZER_H
#define PERSONAANALYZER_H

#include <QObject>
#include <QString>
#include <QList>

struct ChatMessage;

struct PersonaTraits {
    QString writingStyle;      // formal, casual, technical, neutral
    float averageWordCount;
    QString emojiUsage;        // none, rare, moderate, frequent
    QString punctuationStyle;  // minimal, normal, expressive
    QString tone;              // formal, friendly, humorous, direct
    QString responseLength;    // brief, medium, detailed
    QString vocabularyLevel;   // basic, medium, advanced
    QStringList commonPhrases;
    int messagesAnalyzed;
};

class PersonaAnalyzer : public QObject
{
    Q_OBJECT

public:
    explicit PersonaAnalyzer(QObject *parent = nullptr);
    
    PersonaTraits analyze(const QList<ChatMessage> &userMessages);
    QString buildPersonaPrompt(const PersonaTraits &traits);
    
    static int minimumMessagesRequired() { return 20; }

signals:
    void analysisProgress(int current, int total);
    void analysisComplete(const PersonaTraits &traits);

private:
    QString detectWritingStyle(const QStringList &contents);
    QString detectEmojiUsage(const QStringList &contents);
    QString detectTone(const QString &style, const QString &emoji, const QString &punctuation);
    QStringList extractCommonPhrases(const QStringList &contents);
    QString analyzeVocabulary(const QStringList &contents);
};

#endif // PERSONAANALYZER_H
