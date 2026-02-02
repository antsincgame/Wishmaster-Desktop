use once_cell::sync::OnceCell;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

use crate::commands::{Message, Session, Settings, VoiceProfile, VoiceRecording};

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

// ==================== Memory Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub content: String,
    pub category: String,      // fact, preference, name, topic, skill, etc.
    pub source_session_id: i64,
    pub source_message_id: i64,
    pub importance: i32,       // 1-10
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPersona {
    pub id: i64,
    pub writing_style: String,     // formal, casual, technical, etc.
    pub avg_message_length: f32,
    pub common_phrases: String,    // JSON array
    pub topics_of_interest: String, // JSON array
    pub language: String,
    pub emoji_usage: String,       // none, minimal, moderate, heavy
    pub tone: String,              // friendly, professional, humorous
    pub messages_analyzed: i64,
    pub last_updated: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportData {
    pub sessions: Vec<Session>,
    pub messages: Vec<ExportMessage>,
    pub memory: Vec<MemoryEntry>,
    pub persona: Option<UserPersona>,
    pub exported_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportMessage {
    pub id: i64,
    pub session_id: i64,
    pub session_title: String,
    pub content: String,
    pub is_user: bool,
    pub timestamp: i64,
}

/// Initialize the database connection
pub fn init(db_path: &Path) -> Result<()> {
    if DB.get().is_some() {
        println!("Database already initialized");
        return Ok(());
    }
    
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    
    // Create all tables including memory system
    conn.execute_batch(r#"
        -- Core tables
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Новый чат',
            created_at INTEGER NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0
        );
        
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_user INTEGER NOT NULL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS voice_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            audio_path TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS voice_recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        
        -- MEMORY SYSTEM: Long-term memory across all sessions
        CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'fact',
            source_session_id INTEGER,
            source_message_id INTEGER,
            importance INTEGER NOT NULL DEFAULT 5,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (source_session_id) REFERENCES sessions(id) ON DELETE SET NULL
        );
        
        -- USER PERSONA: Digital twin data
        CREATE TABLE IF NOT EXISTS user_persona (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            writing_style TEXT NOT NULL DEFAULT 'casual',
            avg_message_length REAL NOT NULL DEFAULT 0,
            common_phrases TEXT NOT NULL DEFAULT '[]',
            topics_of_interest TEXT NOT NULL DEFAULT '[]',
            language TEXT NOT NULL DEFAULT 'ru',
            emoji_usage TEXT NOT NULL DEFAULT 'minimal',
            tone TEXT NOT NULL DEFAULT 'friendly',
            messages_analyzed INTEGER NOT NULL DEFAULT 0,
            last_updated INTEGER NOT NULL
        );
        
        -- Indexes for fast search
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(content);
        CREATE INDEX IF NOT EXISTS idx_memory_category ON memory(category);
        CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory(importance DESC);
        
        -- Full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            content='messages',
            content_rowid='id'
        );
        
        -- Triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
        END;
        
        CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
        END;
        
        CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
            INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
            INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
        END;
    "#)?;
    
    match DB.set(Mutex::new(conn)) {
        Ok(()) => {
            println!("Database initialized with memory system");
            Ok(())
        }
        Err(_) => {
            println!("Database was initialized by another thread");
            Ok(())
        }
    }
}

fn get_conn() -> Result<std::sync::MutexGuard<'static, Connection>> {
    let db = DB.get().ok_or_else(|| {
        eprintln!("Database not initialized!");
        rusqlite::Error::InvalidQuery
    })?;
    
    db.lock().map_err(|e| {
        eprintln!("Failed to acquire database lock: {}", e);
        rusqlite::Error::InvalidQuery
    })
}

fn get_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ==================== Settings ====================

pub fn get_settings() -> Result<Settings> {
    let conn = get_conn()?;
    let mut settings = Settings::default();
    
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    
    for row in rows.flatten() {
        let (key, value) = row;
        match key.as_str() {
            "temperature" => settings.temperature = value.parse().unwrap_or(0.7),
            "maxTokens" => settings.max_tokens = value.parse().unwrap_or(512),
            "contextLength" => settings.context_length = value.parse().unwrap_or(2048),
            "theme" => settings.theme = value,
            "accentColor" => settings.accent_color = value,
            "autoSpeak" => settings.auto_speak = value == "true",
            "sttEnabled" => settings.stt_enabled = value == "true",
            "ttsEnabled" => settings.tts_enabled = value == "true",
            "modelPaths" => settings.model_paths = serde_json::from_str(&value).unwrap_or_default(),
            _ => {}
        }
    }
    
    Ok(settings)
}

pub fn save_settings(settings: &Settings) -> Result<()> {
    let conn = get_conn()?;
    let model_paths_json = serde_json::to_string(&settings.model_paths).unwrap_or_else(|_| "[]".to_string());
    
    let pairs = vec![
        ("temperature", settings.temperature.to_string()),
        ("maxTokens", settings.max_tokens.to_string()),
        ("contextLength", settings.context_length.to_string()),
        ("theme", settings.theme.clone()),
        ("accentColor", settings.accent_color.clone()),
        ("autoSpeak", settings.auto_speak.to_string()),
        ("sttEnabled", settings.stt_enabled.to_string()),
        ("ttsEnabled", settings.tts_enabled.to_string()),
        ("modelPaths", model_paths_json),
    ];
    
    for (key, value) in pairs {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }
    
    Ok(())
}

// ==================== Sessions ====================

pub fn get_sessions() -> Result<Vec<Session>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, title, created_at, message_count FROM sessions ORDER BY created_at DESC"
    )?;
    
    let sessions = stmt.query_map([], |row| {
        Ok(Session {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            message_count: row.get(3)?,
        })
    })?;
    
    sessions.collect()
}

pub fn create_session(title: &str) -> Result<i64> {
    let conn = get_conn()?;
    let now = get_timestamp();
    
    conn.execute(
        "INSERT INTO sessions (title, created_at, message_count) VALUES (?1, ?2, 0)",
        params![title, now],
    )?;
    
    Ok(conn.last_insert_rowid())
}

pub fn delete_session(session_id: i64) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM messages WHERE session_id = ?1", params![session_id])?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
    Ok(())
}

// ==================== Messages ====================

pub fn get_messages(session_id: i64) -> Result<Vec<Message>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, is_user, timestamp FROM messages WHERE session_id = ?1 ORDER BY timestamp ASC"
    )?;
    
    let messages = stmt.query_map(params![session_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            content: row.get(1)?,
            is_user: row.get::<_, i32>(2)? != 0,
            timestamp: row.get(3)?,
        })
    })?;
    
    messages.collect()
}

pub fn insert_message(session_id: i64, content: &str, is_user: bool) -> Result<i64> {
    let conn = get_conn()?;
    let now = get_timestamp();
    
    conn.execute(
        "INSERT INTO messages (session_id, content, is_user, timestamp) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, content, is_user as i32, now],
    )?;
    
    conn.execute(
        "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?1",
        params![session_id],
    )?;
    
    Ok(conn.last_insert_rowid())
}

// ==================== GLOBAL SEARCH (across ALL sessions) ====================

/// Search messages across ALL sessions using full-text search
pub fn search_all_messages(query: &str, limit: i32) -> Result<Vec<ExportMessage>> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare(r#"
        SELECT m.id, m.session_id, s.title, m.content, m.is_user, m.timestamp
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE m.id IN (
            SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?1
        )
        ORDER BY m.timestamp DESC
        LIMIT ?2
    "#)?;
    
    let messages = stmt.query_map(params![query, limit], |row| {
        Ok(ExportMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            session_title: row.get(2)?,
            content: row.get(3)?,
            is_user: row.get::<_, i32>(4)? != 0,
            timestamp: row.get(5)?,
        })
    })?;
    
    messages.collect()
}

/// Get recent messages from ALL sessions (for context building)
pub fn get_recent_global_messages(limit: i32) -> Result<Vec<ExportMessage>> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare(r#"
        SELECT m.id, m.session_id, s.title, m.content, m.is_user, m.timestamp
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        ORDER BY m.timestamp DESC
        LIMIT ?1
    "#)?;
    
    let messages = stmt.query_map(params![limit], |row| {
        Ok(ExportMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            session_title: row.get(2)?,
            content: row.get(3)?,
            is_user: row.get::<_, i32>(4)? != 0,
            timestamp: row.get(5)?,
        })
    })?;
    
    messages.collect()
}

/// Get user messages only (for persona analysis)
pub fn get_all_user_messages() -> Result<Vec<String>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT content FROM messages WHERE is_user = 1 ORDER BY timestamp ASC"
    )?;
    
    let messages: Vec<String> = stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(messages)
}

// ==================== MEMORY SYSTEM ====================

/// Add a memory entry
pub fn add_memory(content: &str, category: &str, session_id: i64, message_id: i64, importance: i32) -> Result<i64> {
    let conn = get_conn()?;
    let now = get_timestamp();
    
    conn.execute(
        "INSERT INTO memory (content, category, source_session_id, source_message_id, importance, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![content, category, session_id, message_id, importance, now],
    )?;
    
    Ok(conn.last_insert_rowid())
}

/// Get all memories, sorted by importance
pub fn get_all_memories() -> Result<Vec<MemoryEntry>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, category, source_session_id, source_message_id, importance, created_at FROM memory ORDER BY importance DESC, created_at DESC"
    )?;
    
    let memories = stmt.query_map([], |row| {
        Ok(MemoryEntry {
            id: row.get(0)?,
            content: row.get(1)?,
            category: row.get(2)?,
            source_session_id: row.get(3)?,
            source_message_id: row.get(4)?,
            importance: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    
    memories.collect()
}

/// Get memories by category
pub fn get_memories_by_category(category: &str) -> Result<Vec<MemoryEntry>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, category, source_session_id, source_message_id, importance, created_at FROM memory WHERE category = ?1 ORDER BY importance DESC"
    )?;
    
    let memories = stmt.query_map(params![category], |row| {
        Ok(MemoryEntry {
            id: row.get(0)?,
            content: row.get(1)?,
            category: row.get(2)?,
            source_session_id: row.get(3)?,
            source_message_id: row.get(4)?,
            importance: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    
    memories.collect()
}

/// Get top N most important memories
pub fn get_top_memories(limit: i32) -> Result<Vec<MemoryEntry>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, category, source_session_id, source_message_id, importance, created_at FROM memory ORDER BY importance DESC LIMIT ?1"
    )?;
    
    let memories = stmt.query_map(params![limit], |row| {
        Ok(MemoryEntry {
            id: row.get(0)?,
            content: row.get(1)?,
            category: row.get(2)?,
            source_session_id: row.get(3)?,
            source_message_id: row.get(4)?,
            importance: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    
    memories.collect()
}

/// Delete a memory entry
pub fn delete_memory(id: i64) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM memory WHERE id = ?1", params![id])?;
    Ok(())
}

// ==================== USER PERSONA (Digital Twin) ====================

/// Get or create user persona
pub fn get_user_persona() -> Result<Option<UserPersona>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, writing_style, avg_message_length, common_phrases, topics_of_interest, language, emoji_usage, tone, messages_analyzed, last_updated FROM user_persona LIMIT 1"
    )?;
    
    let persona = stmt.query_row([], |row| {
        Ok(UserPersona {
            id: row.get(0)?,
            writing_style: row.get(1)?,
            avg_message_length: row.get(2)?,
            common_phrases: row.get(3)?,
            topics_of_interest: row.get(4)?,
            language: row.get(5)?,
            emoji_usage: row.get(6)?,
            tone: row.get(7)?,
            messages_analyzed: row.get(8)?,
            last_updated: row.get(9)?,
        })
    });
    
    match persona {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Save/update user persona
pub fn save_user_persona(persona: &UserPersona) -> Result<()> {
    let conn = get_conn()?;
    let now = get_timestamp();
    
    // Check if persona exists
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM user_persona",
        [],
        |row| row.get(0)
    ).unwrap_or(false);
    
    if exists {
        conn.execute(
            r#"UPDATE user_persona SET 
                writing_style = ?1,
                avg_message_length = ?2,
                common_phrases = ?3,
                topics_of_interest = ?4,
                language = ?5,
                emoji_usage = ?6,
                tone = ?7,
                messages_analyzed = ?8,
                last_updated = ?9"#,
            params![
                persona.writing_style,
                persona.avg_message_length,
                persona.common_phrases,
                persona.topics_of_interest,
                persona.language,
                persona.emoji_usage,
                persona.tone,
                persona.messages_analyzed,
                now
            ],
        )?;
    } else {
        conn.execute(
            r#"INSERT INTO user_persona 
                (writing_style, avg_message_length, common_phrases, topics_of_interest, language, emoji_usage, tone, messages_analyzed, last_updated)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
            params![
                persona.writing_style,
                persona.avg_message_length,
                persona.common_phrases,
                persona.topics_of_interest,
                persona.language,
                persona.emoji_usage,
                persona.tone,
                persona.messages_analyzed,
                now
            ],
        )?;
    }
    
    Ok(())
}

// ==================== EXPORT FOR FINE-TUNING ====================

/// Export ALL data for creating digital twin
pub fn export_all_data() -> Result<ExportData> {
    let sessions = get_sessions()?;
    let persona = get_user_persona()?;
    let memory = get_all_memories()?;
    
    let conn = get_conn()?;
    let mut stmt = conn.prepare(r#"
        SELECT m.id, m.session_id, s.title, m.content, m.is_user, m.timestamp
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        ORDER BY m.timestamp ASC
    "#)?;
    
    let messages: Vec<ExportMessage> = stmt.query_map([], |row| {
        Ok(ExportMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            session_title: row.get(2)?,
            content: row.get(3)?,
            is_user: row.get::<_, i32>(4)? != 0,
            timestamp: row.get(5)?,
        })
    })?.filter_map(|r| r.ok()).collect();
    
    Ok(ExportData {
        sessions,
        messages,
        memory,
        persona,
        exported_at: get_timestamp(),
    })
}

/// Export in Alpaca format for fine-tuning
pub fn export_alpaca_format() -> Result<Vec<serde_json::Value>> {
    let conn = get_conn()?;
    
    // Get conversation pairs (user message -> assistant response)
    let mut stmt = conn.prepare(r#"
        SELECT 
            u.content as instruction,
            a.content as output
        FROM messages u
        JOIN messages a ON a.session_id = u.session_id 
            AND a.timestamp > u.timestamp 
            AND a.is_user = 0
        WHERE u.is_user = 1
        AND a.id = (
            SELECT MIN(id) FROM messages 
            WHERE session_id = u.session_id 
            AND timestamp > u.timestamp 
            AND is_user = 0
        )
        ORDER BY u.timestamp ASC
    "#)?;
    
    let pairs: Vec<serde_json::Value> = stmt.query_map([], |row| {
        let instruction: String = row.get(0)?;
        let output: String = row.get(1)?;
        Ok(serde_json::json!({
            "instruction": instruction,
            "input": "",
            "output": output
        }))
    })?.filter_map(|r| r.ok()).collect();
    
    Ok(pairs)
}

/// Export in ShareGPT format
pub fn export_sharegpt_format() -> Result<Vec<serde_json::Value>> {
    let sessions = get_sessions()?;
    let mut conversations = Vec::new();
    
    for session in sessions {
        let messages = get_messages(session.id)?;
        if messages.is_empty() {
            continue;
        }
        
        let conv: Vec<serde_json::Value> = messages.iter().map(|m| {
            serde_json::json!({
                "from": if m.is_user { "human" } else { "gpt" },
                "value": m.content
            })
        }).collect();
        
        conversations.push(serde_json::json!({
            "id": format!("session_{}", session.id),
            "conversations": conv
        }));
    }
    
    Ok(conversations)
}

/// Get statistics about stored data
pub fn get_data_stats() -> Result<serde_json::Value> {
    let conn = get_conn()?;
    
    let total_sessions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions", [], |row| row.get(0)
    )?;
    
    let total_messages: i64 = conn.query_row(
        "SELECT COUNT(*) FROM messages", [], |row| row.get(0)
    )?;
    
    let user_messages: i64 = conn.query_row(
        "SELECT COUNT(*) FROM messages WHERE is_user = 1", [], |row| row.get(0)
    )?;
    
    let total_memories: i64 = conn.query_row(
        "SELECT COUNT(*) FROM memory", [], |row| row.get(0)
    )?;
    
    let total_chars: i64 = conn.query_row(
        "SELECT COALESCE(SUM(LENGTH(content)), 0) FROM messages", [], |row| row.get(0)
    )?;
    
    Ok(serde_json::json!({
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "user_messages": user_messages,
        "assistant_messages": total_messages - user_messages,
        "total_memories": total_memories,
        "total_characters": total_chars,
        "estimated_tokens": total_chars / 4  // rough estimate
    }))
}

// ==================== Voice Profiles ====================

pub fn get_voice_profiles() -> Result<Vec<VoiceProfile>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, audio_path, created_at FROM voice_profiles ORDER BY created_at DESC"
    )?;
    
    let profiles = stmt.query_map([], |row| {
        Ok(VoiceProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            audio_path: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    
    profiles.collect()
}

pub fn create_voice_profile(name: &str, audio_path: &str) -> Result<i64> {
    let conn = get_conn()?;
    let now = get_timestamp();
    
    conn.execute(
        "INSERT INTO voice_profiles (name, audio_path, created_at) VALUES (?1, ?2, ?3)",
        params![name, audio_path, now],
    )?;
    
    Ok(conn.last_insert_rowid())
}

pub fn delete_voice_profile(id: i64) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM voice_profiles WHERE id = ?1", params![id])?;
    Ok(())
}

// ==================== Voice Recordings ====================

pub fn get_voice_recordings() -> Result<Vec<VoiceRecording>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, path, created_at FROM voice_recordings ORDER BY created_at DESC"
    )?;
    
    let recordings = stmt.query_map([], |row| {
        Ok(VoiceRecording {
            id: row.get(0)?,
            path: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;
    
    recordings.collect()
}

pub fn save_voice_recording(path: &str) -> Result<i64> {
    let conn = get_conn()?;
    let now = get_timestamp();
    
    conn.execute(
        "INSERT INTO voice_recordings (path, created_at) VALUES (?1, ?2)",
        params![path, now],
    )?;
    
    Ok(conn.last_insert_rowid())
}
