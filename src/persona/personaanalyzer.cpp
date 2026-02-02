#include "personaanalyzer.h"
#include "chatwidget.h"

#include <QRegularExpression>
#include <QDebug>
#include <QMap>

PersonaAnalyzer::PersonaAnalyzer(QObject *parent)
    : QObject(parent)
{
}

PersonaTraits PersonaAnalyzer::analyze(const QList<ChatMessage> &userMessages)
{
    PersonaTraits traits;
    
    if (userMessages.size() < minimumMessagesRequired()) {
        qWarning() << "Not enough messages for analysis:" << userMessages.size();
        return traits;
    }
    
    // Extract content
    QStringList contents;
    for (const auto &msg : userMessages) {
        if (msg.isUser) {
            contents.append(msg.content);
        }
    }
    
    emit analysisProgress(0, 6);
    
    // 1. Average word count
    int totalWords = 0;
    for (const QString &c : contents) {
        totalWords += c.split(QRegularExpression("\\s+"), Qt::SkipEmptyParts).size();
    }
    traits.averageWordCount = float(totalWords) / contents.size();
    emit analysisProgress(1, 6);
    
    // 2. Writing style
    traits.writingStyle = detectWritingStyle(contents);
    emit analysisProgress(2, 6);
    
    // 3. Emoji usage
    traits.emojiUsage = detectEmojiUsage(contents);
    emit analysisProgress(3, 6);
    
    // 4. Punctuation style
    int exclamations = 0, ellipsis = 0;
    for (const QString &c : contents) {
        exclamations += c.count('!');
        ellipsis += c.count("...");
    }
    float punctPerMsg = float(exclamations + ellipsis) / contents.size();
    if (punctPerMsg > 1.0) traits.punctuationStyle = "expressive";
    else if (punctPerMsg < 0.3) traits.punctuationStyle = "minimal";
    else traits.punctuationStyle = "normal";
    emit analysisProgress(4, 6);
    
    // 5. Tone
    traits.tone = detectTone(traits.writingStyle, traits.emojiUsage, traits.punctuationStyle);
    
    // 6. Response length
    if (traits.averageWordCount < 10) traits.responseLength = "brief";
    else if (traits.averageWordCount < 30) traits.responseLength = "medium";
    else traits.responseLength = "detailed";
    
    // 7. Common phrases
    traits.commonPhrases = extractCommonPhrases(contents);
    emit analysisProgress(5, 6);
    
    // 8. Vocabulary level
    traits.vocabularyLevel = analyzeVocabulary(contents);
    emit analysisProgress(6, 6);
    
    traits.messagesAnalyzed = contents.size();
    
    emit analysisComplete(traits);
    return traits;
}

QString PersonaAnalyzer::detectWritingStyle(const QStringList &contents)
{
    QStringList formalMarkers = {"уважаемый", "пожалуйста", "благодарю", "извините"};
    QStringList casualMarkers = {"короче", "типа", "ну", "блин", "чё", "норм"};
    QStringList techMarkers = {"функция", "класс", "метод", "api", "код", "баг"};
    
    QString allText = contents.join(" ").toLower();
    
    int formalScore = 0, casualScore = 0, techScore = 0;
    for (const QString &m : formalMarkers) if (allText.contains(m)) formalScore++;
    for (const QString &m : casualMarkers) if (allText.contains(m)) casualScore++;
    for (const QString &m : techMarkers) if (allText.contains(m)) techScore++;
    
    if (techScore > formalScore && techScore > casualScore) return "technical";
    if (formalScore > casualScore * 2) return "formal";
    if (casualScore > formalScore * 2) return "casual";
    return "neutral";
}

QString PersonaAnalyzer::detectEmojiUsage(const QStringList &contents)
{
    static QRegularExpression emojiRegex("[\\x{1F600}-\\x{1F64F}\\x{1F300}-\\x{1F5FF}\\x{1F680}-\\x{1F6FF}\\x{2600}-\\x{26FF}]");
    
    int totalEmoji = 0;
    for (const QString &c : contents) {
        totalEmoji += c.count(emojiRegex);
    }
    
    float avgEmoji = float(totalEmoji) / contents.size();
    
    if (avgEmoji < 0.1) return "none";
    if (avgEmoji < 0.5) return "rare";
    if (avgEmoji < 2.0) return "moderate";
    return "frequent";
}

QString PersonaAnalyzer::detectTone(const QString &style, const QString &emoji, const QString &punctuation)
{
    if (style == "formal") return "formal";
    if (emoji == "frequent" && punctuation == "expressive") return "humorous";
    if (style == "casual" && emoji != "none") return "friendly";
    if (style == "technical") return "direct";
    if (punctuation == "minimal") return "direct";
    return "friendly";
}

QStringList PersonaAnalyzer::extractCommonPhrases(const QStringList &contents)
{
    QMap<QString, int> bigramCounts;
    
    for (const QString &text : contents) {
        QString clean = text.toLower();
        clean.replace(QRegularExpression("[^а-яёa-z\\s]"), " ");
        QStringList words = clean.split(QRegularExpression("\\s+"), Qt::SkipEmptyParts);
        words.removeAll("");
        
        // Count bigrams
        for (int i = 0; i < words.size() - 1; ++i) {
            if (words[i].length() > 2 && words[i + 1].length() > 2) {
                QString bigram = words[i] + " " + words[i + 1];
                bigramCounts[bigram]++;
            }
        }
    }
    
    // Get top phrases with count >= 3
    QList<QPair<QString, int>> sorted;
    for (auto it = bigramCounts.begin(); it != bigramCounts.end(); ++it) {
        if (it.value() >= 3) {
            sorted.append({it.key(), it.value()});
        }
    }
    
    std::sort(sorted.begin(), sorted.end(), [](const auto &a, const auto &b) {
        return a.second > b.second;
    });
    
    QStringList result;
    for (int i = 0; i < qMin(10, sorted.size()); ++i) {
        result.append(sorted[i].first);
    }
    
    return result;
}

QString PersonaAnalyzer::analyzeVocabulary(const QStringList &contents)
{
    QSet<QString> uniqueWords;
    int totalWords = 0;
    int totalLength = 0;
    
    for (const QString &text : contents) {
        QStringList words = text.toLower().split(QRegularExpression("\\s+"), Qt::SkipEmptyParts);
        for (const QString &w : words) {
            if (w.length() > 3) {
                uniqueWords.insert(w);
                totalWords++;
                totalLength += w.length();
            }
        }
    }
    
    float uniqueRatio = totalWords > 0 ? float(uniqueWords.size()) / totalWords : 0;
    float avgLength = totalWords > 0 ? float(totalLength) / totalWords : 0;
    
    if (uniqueRatio > 0.7 && avgLength > 6) return "advanced";
    if (uniqueRatio < 0.3 || avgLength < 4) return "basic";
    return "medium";
}

QString PersonaAnalyzer::buildPersonaPrompt(const PersonaTraits &traits)
{
    QString styleDesc;
    if (traits.writingStyle == "formal") styleDesc = "формально и вежливо";
    else if (traits.writingStyle == "casual") styleDesc = "неформально и расслабленно";
    else if (traits.writingStyle == "technical") styleDesc = "технично и точно";
    else styleDesc = "естественно";
    
    QString lengthDesc;
    if (traits.responseLength == "brief") lengthDesc = "короткими фразами (5-15 слов)";
    else if (traits.responseLength == "detailed") lengthDesc = "развёрнуто и подробно (40+ слов)";
    else lengthDesc = "умеренно (15-30 слов)";
    
    QString emojiDesc;
    if (traits.emojiUsage == "frequent") emojiDesc = "Активно использует emoji 😊🔥👍";
    else if (traits.emojiUsage == "moderate") emojiDesc = "Иногда добавляет emoji";
    else if (traits.emojiUsage == "rare") emojiDesc = "Редко использует emoji";
    else emojiDesc = "Не использует emoji";
    
    QString phraseDesc;
    if (!traits.commonPhrases.isEmpty()) {
        phraseDesc = "Часто говорит: " + traits.commonPhrases.mid(0, 5).join(", ");
    }
    
    return QString(R"(
Ты - цифровой клон пользователя. Отвечай ТОЧНО как он.

СТИЛЬ ОБЩЕНИЯ:
- Пиши %1
- Отвечай %2
- %3
%4

ВАЖНО:
- НЕ будь слишком вежливым если пользователь пишет неформально
- Копируй его манеру речи
- Используй его словечки и фразы
- Отвечай в его стиле, не в стиле AI-ассистента
)").arg(styleDesc, lengthDesc, emojiDesc, phraseDesc).trimmed();
}
