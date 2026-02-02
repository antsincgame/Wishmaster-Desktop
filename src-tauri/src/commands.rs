use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::database;
use crate::llm;
use crate::voice;

static STOP_GENERATION: AtomicBool = AtomicBool::new(false);

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub temperature: f32,
    #[serde(rename = "maxTokens")]
    pub max_tokens: i32,
    #[serde(rename = "contextLength")]
    pub context_length: i32,
    pub theme: String,
    #[serde(rename = "accentColor")]
    pub accent_color: String,
    #[serde(rename = "autoSpeak")]
    pub auto_speak: bool,
    #[serde(rename = "sttEnabled")]
    pub stt_enabled: bool,
    #[serde(rename = "ttsEnabled")]
    pub tts_enabled: bool,
    #[serde(rename = "modelPaths")]
    pub model_paths: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            max_tokens: 512,
            context_length: 2048,
            theme: "dark".to_string(),
            accent_color: "cyan".to_string(),
            auto_speak: false,
            stt_enabled: true,
            tts_enabled: true,
            model_paths: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub content: String,
    #[serde(rename = "isUser")]
    pub is_user: bool,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: i64,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "messageCount")]
    pub message_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub name: String,
    pub path: String,
    pub size: i64,
    #[serde(rename = "isLoaded")]
    pub is_loaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceProfile {
    pub id: i64,
    pub name: String,
    #[serde(rename = "audioPath")]
    pub audio_path: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub content: String,
    #[serde(rename = "isUser")]
    pub is_user: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceRecording {
    pub id: i64,
    pub path: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

// ==================== Settings Commands ====================

#[tauri::command]
pub fn load_settings() -> Result<Settings, String> {
    database::get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    database::save_settings(&settings).map_err(|e| e.to_string())
}

// ==================== Model Commands ====================

#[tauri::command]
pub fn get_model_paths() -> Result<Vec<String>, String> {
    let settings = database::get_settings().map_err(|e| e.to_string())?;
    Ok(settings.model_paths)
}

#[tauri::command]
pub fn add_model_path(path: String) -> Result<(), String> {
    let mut settings = database::get_settings().map_err(|e| e.to_string())?;
    let path_trimmed = path.trim().to_string();
    if path_trimmed.is_empty() {
        return Ok(());
    }
    if !settings.model_paths.contains(&path_trimmed) {
        settings.model_paths.push(path_trimmed);
        database::save_settings(&settings).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_model_path(path: String) -> Result<(), String> {
    let mut settings = database::get_settings().map_err(|e| e.to_string())?;
    settings.model_paths.retain(|p| p != &path);
    database::save_settings(&settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_model(path: String, context_length: i32) -> Result<(), String> {
    llm::load_model(&path, context_length as usize).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unload_model() -> Result<(), String> {
    llm::unload_model();
    Ok(())
}

// ==================== Session Commands ====================

#[tauri::command]
pub fn get_sessions() -> Result<Vec<Session>, String> {
    database::get_sessions().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_session(title: String) -> Result<i64, String> {
    database::create_session(&title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_session(session_id: i64) -> Result<(), String> {
    database::delete_session(session_id).map_err(|e| e.to_string())
}

// ==================== Message Commands ====================

#[tauri::command]
pub fn get_messages(session_id: i64) -> Result<Vec<Message>, String> {
    database::get_messages(session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_message(session_id: i64, content: String, is_user: bool) -> Result<i64, String> {
    database::insert_message(session_id, &content, is_user).map_err(|e| e.to_string())
}

// ==================== MEMORY SYSTEM Commands ====================

/// Search across ALL messages in ALL sessions
#[tauri::command]
pub fn search_all_messages(query: String, limit: i32) -> Result<Vec<database::ExportMessage>, String> {
    database::search_all_messages(&query, limit).map_err(|e| e.to_string())
}

/// Get recent messages from ALL sessions
#[tauri::command]
pub fn get_recent_global_messages(limit: i32) -> Result<Vec<database::ExportMessage>, String> {
    database::get_recent_global_messages(limit).map_err(|e| e.to_string())
}

/// Add a memory entry
#[tauri::command]
pub fn add_memory(content: String, category: String, session_id: i64, message_id: i64, importance: i32) -> Result<i64, String> {
    database::add_memory(&content, &category, session_id, message_id, importance).map_err(|e| e.to_string())
}

/// Get all memories
#[tauri::command]
pub fn get_all_memories() -> Result<Vec<database::MemoryEntry>, String> {
    database::get_all_memories().map_err(|e| e.to_string())
}

/// Get memories by category
#[tauri::command]
pub fn get_memories_by_category(category: String) -> Result<Vec<database::MemoryEntry>, String> {
    database::get_memories_by_category(&category).map_err(|e| e.to_string())
}

/// Get top N most important memories
#[tauri::command]
pub fn get_top_memories(limit: i32) -> Result<Vec<database::MemoryEntry>, String> {
    database::get_top_memories(limit).map_err(|e| e.to_string())
}

/// Delete a memory entry
#[tauri::command]
pub fn delete_memory(id: i64) -> Result<(), String> {
    database::delete_memory(id).map_err(|e| e.to_string())
}

// ==================== USER PERSONA Commands ====================

/// Get user persona (digital twin profile)
#[tauri::command]
pub fn get_user_persona() -> Result<Option<database::UserPersona>, String> {
    database::get_user_persona().map_err(|e| e.to_string())
}

/// Analyze user messages and build persona
#[tauri::command]
pub fn analyze_persona() -> Result<database::UserPersona, String> {
    let messages = database::get_all_user_messages().map_err(|e| e.to_string())?;
    
    if messages.is_empty() {
        return Err("Нет сообщений для анализа".to_string());
    }
    
    // Analyze user's writing style
    let total_chars: usize = messages.iter().map(|m| m.len()).sum();
    let avg_length = total_chars as f32 / messages.len() as f32;
    
    // Detect language
    let has_cyrillic = messages.iter().any(|m| m.chars().any(|c| c >= 'а' && c <= 'я'));
    let language = if has_cyrillic { "ru" } else { "en" };
    
    // Detect emoji usage
    let emoji_count: usize = messages.iter()
        .flat_map(|m| m.chars())
        .filter(|c| *c as u32 > 0x1F600)
        .count();
    let emoji_ratio = emoji_count as f32 / messages.len() as f32;
    let emoji_usage = if emoji_ratio < 0.1 { "none" }
        else if emoji_ratio < 0.5 { "minimal" }
        else if emoji_ratio < 1.0 { "moderate" }
        else { "heavy" };
    
    // Detect writing style
    let formal_words = ["пожалуйста", "благодарю", "уважаемый", "please", "thank you", "regards"];
    let casual_words = ["привет", "ок", "круто", "классно", "hi", "hey", "cool", "awesome"];
    
    let formal_count: usize = messages.iter()
        .map(|m| formal_words.iter().filter(|w| m.to_lowercase().contains(*w)).count())
        .sum();
    let casual_count: usize = messages.iter()
        .map(|m| casual_words.iter().filter(|w| m.to_lowercase().contains(*w)).count())
        .sum();
    
    let writing_style = if formal_count > casual_count * 2 { "formal" }
        else if casual_count > formal_count * 2 { "casual" }
        else { "neutral" };
    
    // Detect tone
    let positive_words = ["спасибо", "отлично", "хорошо", "thank", "great", "good", "nice"];
    let question_marks = messages.iter().filter(|m| m.contains('?')).count();
    
    let positive_count: usize = messages.iter()
        .map(|m| positive_words.iter().filter(|w| m.to_lowercase().contains(*w)).count())
        .sum();
    
    let tone = if positive_count > messages.len() / 2 { "friendly" }
        else if question_marks > messages.len() / 2 { "inquisitive" }
        else { "neutral" };
    
    // Find common phrases (simple n-gram approach)
    let mut phrase_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for msg in &messages {
        let words: Vec<&str> = msg.split_whitespace().collect();
        for window in words.windows(2) {
            let phrase = window.join(" ").to_lowercase();
            if phrase.len() > 5 {
                *phrase_counts.entry(phrase).or_insert(0) += 1;
            }
        }
    }
    let mut common: Vec<_> = phrase_counts.into_iter().filter(|(_, c)| *c > 2).collect();
    common.sort_by(|a, b| b.1.cmp(&a.1));
    let common_phrases: Vec<String> = common.into_iter().take(10).map(|(p, _)| p).collect();
    
    // Build persona
    let persona = database::UserPersona {
        id: 0,
        writing_style: writing_style.to_string(),
        avg_message_length: avg_length,
        common_phrases: serde_json::to_string(&common_phrases).unwrap_or_else(|_| "[]".to_string()),
        topics_of_interest: "[]".to_string(), // Would need more sophisticated analysis
        language: language.to_string(),
        emoji_usage: emoji_usage.to_string(),
        tone: tone.to_string(),
        messages_analyzed: messages.len() as i64,
        last_updated: 0,
    };
    
    database::save_user_persona(&persona).map_err(|e| e.to_string())?;
    
    Ok(persona)
}

// ==================== EXPORT Commands (for fine-tuning) ====================

/// Export ALL data for digital twin creation
#[tauri::command]
pub fn export_all_data() -> Result<database::ExportData, String> {
    database::export_all_data().map_err(|e| e.to_string())
}

/// Export in Alpaca format for fine-tuning
#[tauri::command]
pub fn export_alpaca_format() -> Result<Vec<serde_json::Value>, String> {
    database::export_alpaca_format().map_err(|e| e.to_string())
}

/// Export in ShareGPT format for fine-tuning
#[tauri::command]
pub fn export_sharegpt_format() -> Result<Vec<serde_json::Value>, String> {
    database::export_sharegpt_format().map_err(|e| e.to_string())
}

/// Get statistics about stored data
#[tauri::command]
pub fn get_data_stats() -> Result<serde_json::Value, String> {
    database::get_data_stats().map_err(|e| e.to_string())
}

/// Export data to file
#[tauri::command]
pub fn export_to_file(app: AppHandle, format: String) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let export_dir = app_dir.join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    
    let (filename, content) = match format.as_str() {
        "alpaca" => {
            let data = database::export_alpaca_format().map_err(|e| e.to_string())?;
            let json = data.iter()
                .map(|v| serde_json::to_string(v).unwrap_or_default())
                .collect::<Vec<_>>()
                .join("\n");
            (format!("alpaca_{}.jsonl", timestamp), json)
        }
        "sharegpt" => {
            let data = database::export_sharegpt_format().map_err(|e| e.to_string())?;
            let json = serde_json::to_string_pretty(&data).unwrap_or_else(|_| "[]".to_string());
            (format!("sharegpt_{}.json", timestamp), json)
        }
        _ => {
            let data = database::export_all_data().map_err(|e| e.to_string())?;
            let json = serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string());
            (format!("full_export_{}.json", timestamp), json)
        }
    };
    
    let path = export_dir.join(&filename);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    
    Ok(path.to_string_lossy().to_string())
}

// ==================== Generation Commands (with MEMORY) ====================

#[tauri::command]
pub async fn generate(
    app: AppHandle,
    prompt: String,
    history: Vec<HistoryMessage>,
    temperature: f32,
    max_tokens: i32,
    session_id: i64,
) -> Result<(), String> {
    STOP_GENERATION.store(false, Ordering::SeqCst);
    
    // Build prompt with ChatML format including MEMORY
    let mut full_prompt = String::from("<|im_start|>system\n");
    full_prompt.push_str("Ты - Wishmaster, умный AI-ассистент с долговременной памятью. ");
    full_prompt.push_str("Ты помнишь ВСЕ предыдущие разговоры и используешь эту информацию. ");
    full_prompt.push_str("Отвечай кратко и по делу на русском языке. ");
    full_prompt.push_str("НЕ повторяй вопрос пользователя.\n\n");
    
    // Add important memories
    if let Ok(memories) = database::get_top_memories(5) {
        if !memories.is_empty() {
            full_prompt.push_str("=== ВАЖНЫЕ ФАКТЫ ИЗ ПАМЯТИ ===\n");
            for mem in memories {
                full_prompt.push_str(&format!("- [{}] {}\n", mem.category, mem.content));
            }
            full_prompt.push_str("\n");
        }
    }
    
    // Add relevant context from other sessions (search by keywords)
    let keywords: Vec<&str> = prompt.split_whitespace()
        .filter(|w| w.len() > 3)
        .take(3)
        .collect();
    
    if !keywords.is_empty() {
        let search_query = keywords.join(" OR ");
        if let Ok(relevant) = database::search_all_messages(&search_query, 3) {
            let other_session_msgs: Vec<_> = relevant.iter()
                .filter(|m| m.session_id != session_id)
                .collect();
            
            if !other_session_msgs.is_empty() {
                full_prompt.push_str("=== РЕЛЕВАНТНЫЙ КОНТЕКСТ ИЗ ДРУГИХ ЧАТОВ ===\n");
                for msg in other_session_msgs {
                    let role = if msg.is_user { "Пользователь" } else { "Ассистент" };
                    full_prompt.push_str(&format!("[{}] {}: {}\n", 
                        msg.session_title, role, 
                        msg.content.chars().take(200).collect::<String>()));
                }
                full_prompt.push_str("\n");
            }
        }
    }
    
    // Add persona info if available
    if let Ok(Some(persona)) = database::get_user_persona() {
        full_prompt.push_str(&format!(
            "=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===\nСтиль: {}, Тон: {}, Язык: {}\n\n",
            persona.writing_style, persona.tone, persona.language
        ));
    }
    
    full_prompt.push_str("<|im_end|>\n");
    
    // Add session history
    for msg in history.iter() {
        let role = if msg.is_user { "user" } else { "assistant" };
        full_prompt.push_str(&format!("<|im_start|>{}\n{}<|im_end|>\n", role, msg.content));
    }
    
    // Current message
    full_prompt.push_str(&format!("<|im_start|>user\n{}<|im_end|>\n", prompt));
    full_prompt.push_str("<|im_start|>assistant\n");
    
    // Generate with streaming
    let stop_flag = &STOP_GENERATION;
    
    match llm::generate(&full_prompt, temperature, max_tokens as usize, |token| {
        if stop_flag.load(Ordering::SeqCst) {
            return false;
        }
        
        if let Err(e) = app.emit("llm-token", token) {
            eprintln!("Failed to emit token: {}", e);
        }
        true
    }) {
        Ok(_) => {
            if let Err(e) = app.emit("llm-finished", ()) {
                eprintln!("Failed to emit finished event: {}", e);
            }
            Ok(())
        }
        Err(e) => {
            if let Err(emit_err) = app.emit("llm-finished", ()) {
                eprintln!("Failed to emit finished event: {}", emit_err);
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn stop_generation() -> Result<(), String> {
    STOP_GENERATION.store(true, Ordering::SeqCst);
    Ok(())
}

// ==================== Voice Commands ====================

#[tauri::command]
pub fn get_voice_profiles() -> Result<Vec<VoiceProfile>, String> {
    database::get_voice_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_voice_profile(name: String, audio_path: String) -> Result<i64, String> {
    database::create_voice_profile(&name, &audio_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_voice_profile(id: i64) -> Result<(), String> {
    database::delete_voice_profile(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_recording() -> Result<(), String> {
    voice::start_recording().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_recording() -> Result<String, String> {
    voice::stop_recording().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn speak(text: String, voice_id: Option<i64>) -> Result<(), String> {
    voice::speak(&text, voice_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_speaking() -> Result<(), String> {
    voice::stop_speaking();
    Ok(())
}

// ==================== Voice Recordings (from chat) ====================

#[tauri::command]
pub fn get_voice_recordings() -> Result<Vec<VoiceRecording>, String> {
    database::get_voice_recordings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_voice_from_chat(app: AppHandle, base64_audio: String) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).ok();
    let voice_dir = app_dir.join("voice_recordings");
    std::fs::create_dir_all(&voice_dir).map_err(|e| e.to_string())?;
    
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_audio.trim())
        .map_err(|e| format!("Invalid base64: {}", e))?;
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let filename = format!("chat_{}.webm", now);
    let path = voice_dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    
    let path_str = path.to_string_lossy().to_string();
    database::save_voice_recording(&path_str).map_err(|e| e.to_string())?;
    Ok(path_str)
}

#[tauri::command]
pub fn create_voice_profile_from_recording(recording_id: i64, name: String) -> Result<i64, String> {
    let recordings = database::get_voice_recordings().map_err(|e| e.to_string())?;
    let rec = recordings.iter().find(|r| r.id == recording_id)
        .ok_or_else(|| "Recording not found".to_string())?;
    database::create_voice_profile(name.trim(), &rec.path).map_err(|e| e.to_string())
}
