use once_cell::sync::OnceCell;
use rusqlite::{params, Connection, Result};
use std::path::Path;
use std::sync::Mutex;

use crate::commands::{Message, Session, Settings, VoiceProfile};

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    
    // Create tables
    conn.execute_batch(r#"
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
        
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    "#)?;
    
    DB.set(Mutex::new(conn)).map_err(|_| rusqlite::Error::InvalidQuery)?;
    
    Ok(())
}

fn get_conn() -> Result<std::sync::MutexGuard<'static, Connection>> {
    DB.get()
        .ok_or_else(|| rusqlite::Error::InvalidQuery)?
        .lock()
        .map_err(|_| rusqlite::Error::InvalidQuery)
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
            _ => {}
        }
    }
    
    Ok(settings)
}

pub fn save_settings(settings: &Settings) -> Result<()> {
    let conn = get_conn()?;
    
    let pairs = vec![
        ("temperature", settings.temperature.to_string()),
        ("maxTokens", settings.max_tokens.to_string()),
        ("contextLength", settings.context_length.to_string()),
        ("theme", settings.theme.clone()),
        ("accentColor", settings.accent_color.clone()),
        ("autoSpeak", settings.auto_speak.to_string()),
        ("sttEnabled", settings.stt_enabled.to_string()),
        ("ttsEnabled", settings.tts_enabled.to_string()),
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
    
    // Update session message count
    conn.execute(
        "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?1",
        params![session_id],
    )?;
    
    Ok(conn.last_insert_rowid())
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
