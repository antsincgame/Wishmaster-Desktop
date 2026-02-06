use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::database;
#[cfg(feature = "embeddings")]
use crate::embeddings;
use crate::hf_models;
#[cfg(feature = "native-llm")]
use crate::llm;
use crate::voice;

static STOP_GENERATION: AtomicBool = AtomicBool::new(false);

/// GPU info (used when native-llm is off; native-llm returns llm::GpuInfo, we map to this for API)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub available: bool,
    pub backend: String,
    pub device_name: String,
    pub vram_total_mb: u64,
    pub vram_free_mb: u64,
}

/// Currently selected model name
static CURRENT_MODEL: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

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
    #[serde(rename = "systemPrompt", default = "default_system_prompt")]
    pub system_prompt: String,
    /// LLM backend: always "native" (built-in llama.cpp)
    #[serde(rename = "llmBackend", default = "default_llm_backend")]
    pub llm_backend: String,
}

fn default_llm_backend() -> String {
    "native".to_string()
}

fn default_system_prompt() -> String {
    "Ты — Wishmaster, умный диалоговый AI-ассистент с долговременной памятью. \
     Отвечай кратко и по делу на русском языке. \
     Отвечай только содержательным текстом, без процентов, формул сходства и служебных меток.".to_string()
}

/// Detects if the stored system prompt is the "similarity comparison" task that causes
/// the model to output "сходство 100%" instead of a real reply. Replaces with safe default.
fn is_similarity_comparison_prompt(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return false;
    }
    let lower = t.to_lowercase();
    t.contains("сходство") && (t.contains("сравни") || t.contains("процент") || t.contains('%'))
        || t.contains("сравни два сообщения")
        || (lower.contains("similarity") && (lower.contains("compare") || t.contains('%')))
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
            system_prompt: default_system_prompt(),
            llm_backend: default_llm_backend(),
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
#[allow(dead_code)] // Used by Tauri frontend via JSON serialization
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
pub async fn load_model(path: String, _context_length: i32) -> Result<(), String> {
    // Track model name
    if let Ok(mut guard) = CURRENT_MODEL.lock() {
        let name = path.split('/').last()
            .unwrap_or(&path)
            .replace(".gguf", "");
        *guard = name;
    }
    #[cfg(feature = "native-llm")]
    {
        let context_length = _context_length as usize;
        tauri::async_runtime::spawn_blocking(move || llm::load_model(&path, context_length))
            .await
            .map_err(|e| format!("Load model task join error: {}", e))?
            .map_err(|e| e)
    }
    #[cfg(not(feature = "native-llm"))]
    Err("Native LLM не собран. Соберите с --features native-llm".to_string())
}

#[tauri::command]
pub fn unload_model() -> Result<(), String> {
    if let Ok(mut guard) = CURRENT_MODEL.lock() {
        guard.clear();
    }
    #[cfg(feature = "native-llm")]
    llm::unload_model();
    Ok(())
}

#[tauri::command]
pub fn get_gpu_info() -> Result<GpuInfo, String> {
    #[cfg(feature = "native-llm")]
    {
        let info = llm::get_gpu_info();
        Ok(GpuInfo {
            available: info.available,
            backend: info.backend,
            device_name: info.device_name,
            vram_total_mb: info.vram_total_mb,
            vram_free_mb: info.vram_free_mb,
        })
    }
    #[cfg(not(feature = "native-llm"))]
    Ok(GpuInfo {
        available: false,
        backend: "CPU".to_string(),
        device_name: String::new(),
        vram_total_mb: 0,
        vram_free_mb: 0,
    })
}

#[tauri::command]
pub fn is_gpu_available() -> bool {
    #[cfg(feature = "native-llm")]
    return llm::is_gpu_available();
    #[cfg(not(feature = "native-llm"))]
    false
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
    let msg_id = database::insert_message(session_id, &content, is_user).map_err(|e| e.to_string())?;
    
    // Auto-index message for semantic search (async, non-blocking)
    #[cfg(feature = "embeddings")]
    {
        let content_clone = content.clone();
        std::thread::spawn(move || {
            let result = database::with_connection(|conn| {
                embeddings::index_message(conn, msg_id, &content_clone)
            });
            
            match result {
                Ok(Ok(())) => {} // Success
                Ok(Err(e)) => eprintln!("Failed to index message {}: {}", msg_id, e),
                Err(e) => eprintln!("Database error indexing message {}: {}", msg_id, e),
            }
        });
    }
    
    Ok(msg_id)
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
    
    // Detect language (check both lower and uppercase Cyrillic, including ё/Ё)
    let has_cyrillic = messages.iter().any(|m| m.chars().any(|c| {
        (c >= 'а' && c <= 'я') || (c >= 'А' && c <= 'Я') || c == 'ё' || c == 'Ё'
    }));
    let language = if has_cyrillic { "ru" } else { "en" };
    
    // Detect emoji usage (check common emoji Unicode ranges)
    let emoji_count: usize = messages.iter()
        .flat_map(|m| m.chars())
        .filter(|c| {
            let cp = *c as u32;
            (cp >= 0x1F600 && cp <= 0x1F64F)
            || (cp >= 0x1F300 && cp <= 0x1F5FF)
            || (cp >= 0x1F680 && cp <= 0x1F6FF)
            || (cp >= 0x1F900 && cp <= 0x1F9FF)
            || (cp >= 0x2600 && cp <= 0x26FF)
            || (cp >= 0x2700 && cp <= 0x27BF)
            || (cp >= 0x1FA00 && cp <= 0x1FA6F)
        })
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
        topics_of_interest: "[]".to_string(),
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

// ==================== Memory Context Builder ====================

/// Build enriched system prompt with memory, RAG context, and persona info.
/// Used by the native llama.cpp backend.
fn build_enriched_system_prompt(
    base_prompt: &str,
    _prompt: &str,
    _session_id: i64,
) -> String {
    let mut enriched = String::with_capacity(base_prompt.len() + 2048);
    enriched.push_str(base_prompt);
    enriched.push_str("\nТы помнишь ВСЕ предыдущие разговоры и используешь эту информацию.");
    enriched.push_str(" Отвечай только текстом ответа пользователю — без процентов, сходства и метаданных.\n\n");

    // Add important memories
    if let Ok(memories) = database::get_top_memories(5) {
        if !memories.is_empty() {
            enriched.push_str("=== ВАЖНЫЕ ФАКТЫ ИЗ ПАМЯТИ ===\n");
            for mem in memories {
                enriched.push_str(&format!("- [{}] {}\n", mem.category, mem.content));
            }
            enriched.push('\n');
        }
    }

    // Add relevant context using SEMANTIC SEARCH (RAG)
    #[cfg(feature = "embeddings")]
    if let Ok(rag_results) = database::with_connection(|conn| {
        embeddings::find_rag_context(conn, _prompt, 5)
    }) {
        if let Ok(results) = rag_results {
            let relevant: Vec<_> = results.iter()
                .filter(|r| r.similarity > 0.5)
                .take(3)
                .collect();

            if !relevant.is_empty() {
                enriched.push_str("=== РЕЛЕВАНТНЫЙ КОНТЕКСТ (для справки) ===\n");
                for result in relevant {
                    let source = match result.source_type.as_str() {
                        "memory" => "Память",
                        "message" => "Сообщение",
                        _ => &result.source_type,
                    };
                    enriched.push_str(&format!("[{}] {}\n",
                        source,
                        result.content.chars().take(200).collect::<String>()));
                }
                enriched.push('\n');
            }
        }
    }

    // Fallback to keyword search
    let keywords: Vec<&str> = _prompt.split_whitespace()
        .filter(|w| w.len() > 3)
        .take(3)
        .collect();

    if !keywords.is_empty() {
        let search_query = keywords.join(" OR ");
        if let Ok(relevant) = database::search_all_messages(&search_query, 3) {
            let other_session_msgs: Vec<_> = relevant.iter()
                .filter(|m| m.session_id != _session_id)
                .collect();

            if !other_session_msgs.is_empty() {
                enriched.push_str("=== КОНТЕКСТ ИЗ ДРУГИХ ЧАТОВ ===\n");
                for msg in other_session_msgs {
                    let role = if msg.is_user { "Пользователь" } else { "Ассистент" };
                    enriched.push_str(&format!("[{}] {}: {}\n",
                        msg.session_title, role,
                        msg.content.chars().take(200).collect::<String>()));
                }
                enriched.push('\n');
            }
        }
    }

    // Add persona info if available
    if let Ok(Some(persona)) = database::get_user_persona() {
        enriched.push_str(&format!(
            "=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===\nСтиль: {}, Тон: {}, Язык: {}\n\n",
            persona.writing_style, persona.tone, persona.language
        ));
    }

    enriched
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

    // Get user's custom system prompt (replace known-bad "similarity comparison" prompt with safe default)
    let settings = database::get_settings().unwrap_or_default();
    let base_system_prompt = if is_similarity_comparison_prompt(&settings.system_prompt) {
        default_system_prompt()
    } else {
        settings.system_prompt.clone()
    };

    // Build enriched system prompt with memory, RAG, persona (for ALL backends)
    let system_prompt = build_enriched_system_prompt(
        &base_system_prompt,
        &prompt,
        session_id,
    );

    // Build prompt with ChatML format (native LLM)
    let mut full_prompt = String::from("<|im_start|>system\n");
    full_prompt.push_str(&system_prompt);
    full_prompt.push_str("<|im_end|>\n");

    // Add session history
    for msg in history.iter() {
        let role = if msg.is_user { "user" } else { "assistant" };
        full_prompt.push_str(&format!("<|im_start|>{}\n{}<|im_end|>\n", role, msg.content));
    }

    // Current message
    full_prompt.push_str(&format!("<|im_start|>user\n{}<|im_end|>\n", prompt));
    full_prompt.push_str("<|im_start|>assistant\n");

    // Generate with streaming (native LLM) — run in blocking thread to not block async runtime
    #[cfg(feature = "native-llm")]
    let result = {
        let app_handle = app.clone();
        let max_tokens_usize = max_tokens as usize;
        tauri::async_runtime::spawn_blocking(move || {
            match llm::generate(&full_prompt, temperature, max_tokens_usize, |token| {
                if STOP_GENERATION.load(Ordering::SeqCst) {
                    return false;
                }
                if let Err(e) = app_handle.emit("llm-token", token) {
                    eprintln!("Failed to emit token: {}", e);
                }
                true
            }) {
                Ok(_) => {
                    if let Err(e) = app_handle.emit("llm-finished", ()) {
                        eprintln!("Failed to emit finished event: {}", e);
                    }
                    Ok(())
                }
                Err(e) => {
                    if let Err(emit_err) = app_handle.emit("llm-finished", ()) {
                        eprintln!("Failed to emit finished event: {}", emit_err);
                    }
                    Err(e.to_string())
                }
            }
        })
        .await
        .map_err(|e| format!("Generation task error: {}", e))?
    };
    #[cfg(not(feature = "native-llm"))]
    let result = Err("Native LLM не собран. Соберите с --features native-llm".to_string());
    result
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

#[tauri::command]
pub fn is_stt_available() -> bool {
    voice::is_stt_available()
}

#[tauri::command]
pub fn transcribe_audio(audio_path: String) -> Result<String, String> {
    voice::transcribe_audio(&audio_path)
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
    
    // Set last audio path for whisper transcription
    voice::set_last_audio_path(&path_str);
    
    Ok(path_str)
}

#[tauri::command]
pub fn create_voice_profile_from_recording(recording_id: i64, name: String) -> Result<i64, String> {
    let recordings = database::get_voice_recordings().map_err(|e| e.to_string())?;
    let rec = recordings.iter().find(|r| r.id == recording_id)
        .ok_or_else(|| "Recording not found".to_string())?;
    database::create_voice_profile(name.trim(), &rec.path).map_err(|e| e.to_string())
}

// ==================== SEMANTIC SEARCH Commands (RAG) ====================

/// Search result type for RAG (used when embeddings feature is disabled)
#[cfg(not(feature = "embeddings"))]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub source_type: String,
    pub source_id: i64,
    pub content: String,
    pub similarity: f32,
}

/// Find relevant context for RAG using semantic search
#[cfg(feature = "embeddings")]
#[tauri::command]
pub fn find_rag_context(query: String, limit: i32) -> Result<Vec<embeddings::SearchResult>, String> {
    let results = database::with_connection(|conn| {
        embeddings::find_rag_context(conn, &query, limit)
    }).map_err(|e| e.to_string())??;
    
    Ok(results)
}

/// Find relevant context - stub when embeddings disabled
#[cfg(not(feature = "embeddings"))]
#[tauri::command]
pub fn find_rag_context(_query: String, _limit: i32) -> Result<Vec<SearchResult>, String> {
    Ok(vec![])
}

/// Index all existing messages for semantic search
#[cfg(feature = "embeddings")]
#[tauri::command]
pub async fn index_all_messages() -> Result<i32, String> {
    let messages = database::get_all_messages_for_indexing()
        .map_err(|e| e.to_string())?;
    
    let mut indexed = 0;
    
    database::with_connection(|conn| {
        for (id, content) in &messages {
            match embeddings::index_message(conn, *id, content) {
                Ok(_) => indexed += 1,
                Err(e) => eprintln!("Failed to index message {}: {}", id, e),
            }
        }
        Ok::<_, String>(())
    }).map_err(|e| e.to_string())??;
    
    Ok(indexed)
}

/// Index all messages - stub when embeddings disabled
#[cfg(not(feature = "embeddings"))]
#[tauri::command]
pub async fn index_all_messages() -> Result<i32, String> {
    Err("Semantic search is disabled in this build (no embeddings feature)".to_string())
}

/// Get embedding statistics
#[cfg(feature = "embeddings")]
#[tauri::command]
pub fn get_embedding_stats() -> Result<serde_json::Value, String> {
    database::with_connection(|conn| {
        embeddings::get_embedding_stats(conn).map_err(|e| e.to_string())
    }).map_err(|e| e.to_string())?
}

/// Get embedding stats - stub when embeddings disabled
#[cfg(not(feature = "embeddings"))]
#[tauri::command]
pub fn get_embedding_stats() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "status": "disabled",
        "message": "Semantic search is disabled in this build"
    }))
}

// ==================== HuggingFace Hub Commands ====================

/// Get list of GGUF files in a HuggingFace repository
#[tauri::command]
pub async fn list_hf_gguf_files(repo_id: String) -> Result<Vec<hf_models::HfModelFile>, String> {
    tauri::async_runtime::spawn_blocking(move || hf_models::list_gguf_files(&repo_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Get list of popular/recommended GGUF model repositories
#[tauri::command]
pub fn get_popular_models() -> Vec<hf_models::PopularModel> {
    hf_models::get_popular_models()
}

/// Download a model from HuggingFace Hub
/// Returns the local path to the downloaded file
#[tauri::command]
pub async fn download_hf_model(
    app: AppHandle,
    repo_id: String,
    filename: String,
) -> Result<String, String> {
    use std::sync::Arc;
    
    let state = Arc::new(hf_models::DownloadState::new());
    let state_clone = state.clone();
    let repo_id_clone = repo_id.clone();
    let filename_clone = filename.clone();
    
    // Spawn progress emitter task
    let app_clone = app.clone();
    let state_for_progress = state.clone();
    let repo_for_progress = repo_id.clone();
    let file_for_progress = filename.clone();
    
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            let (downloaded, total, percent) = hf_models::get_progress(&state_for_progress);
            
            let progress = hf_models::DownloadProgress {
                repo_id: repo_for_progress.clone(),
                filename: file_for_progress.clone(),
                downloaded,
                total,
                percent,
                speed: 0,
                complete: false,
                error: None,
            };
            
            if app_clone.emit("hf-download-progress", &progress).is_err() {
                break;
            }
            
            if total > 0 && downloaded >= total {
                break;
            }
        }
    });
    
    // Download in blocking task
    let result = tauri::async_runtime::spawn_blocking(move || {
        hf_models::download_model(&repo_id_clone, &filename_clone, state_clone)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;
    
    match result {
        Ok(path) => {
            let progress = hf_models::DownloadProgress {
                repo_id: repo_id.clone(),
                filename: filename.clone(),
                downloaded: 0,
                total: 0,
                percent: 100.0,
                speed: 0,
                complete: true,
                error: None,
            };
            let _ = app.emit("hf-download-progress", &progress);
            
            let path_str = path.to_string_lossy().to_string();
            if let Err(e) = add_model_path(path_str.clone()) {
                eprintln!("Warning: failed to add model path: {}", e);
            }
            
            Ok(path_str)
        }
        Err(e) => {
            let progress = hf_models::DownloadProgress {
                repo_id,
                filename,
                downloaded: 0,
                total: 0,
                percent: 0.0,
                speed: 0,
                complete: false,
                error: Some(e.clone()),
            };
            let _ = app.emit("hf-download-progress", &progress);
            
            Err(e)
        }
    }
}

/// Get the models directory path
#[tauri::command]
pub fn get_models_dir() -> Result<String, String> {
    hf_models::get_models_dir()
        .map(|p| p.to_string_lossy().to_string())
}

// ==================== AWQ Conversion Commands ====================

/// AWQ conversion progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwqConversionProgress {
    pub stage: String,
    pub percent: f32,
    pub message: String,
    pub error: Option<String>,
}

/// Python environment status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonStatus {
    pub python_version: Option<String>,
    pub python_ok: bool,
    pub dependencies: std::collections::HashMap<String, Option<String>>,
    pub all_installed: bool,
    pub cuda_available: bool,
    pub cuda_device: Option<String>,
}

/// Check if Python and AWQ dependencies are available
#[tauri::command]
pub async fn check_awq_python(app: AppHandle) -> Result<PythonStatus, String> {
    use std::process::Command;
    
    let python_cmd = find_python().ok_or("Python не найден")?;
    let converter_path = get_converter_script_path(&app)?;
    
    let output = Command::new(&python_cmd)
        .arg(&converter_path)
        .arg("--check")
        .output()
        .map_err(|e| format!("Ошибка запуска Python: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Python check failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Ошибка парсинга результата: {}", e))
}

/// Install AWQ conversion dependencies
#[tauri::command]
pub async fn install_awq_dependencies(app: AppHandle) -> Result<bool, String> {
    use std::process::Command;
    
    let python_cmd = find_python().ok_or("Python не найден")?;
    let converter_path = get_converter_script_path(&app)?;
    
    let output = Command::new(&python_cmd)
        .arg(&converter_path)
        .arg("--install")
        .output()
        .map_err(|e| format!("Ошибка запуска установки: {}", e))?;
    
    Ok(output.status.success())
}

/// Convert AWQ model to GGUF
#[tauri::command]
pub async fn convert_awq_to_gguf(
    app: AppHandle,
    repo_id: String,
    quant_type: String,
) -> Result<String, String> {
    use std::process::{Command, Stdio};
    use std::io::{BufRead, BufReader};
    
    let python_cmd = find_python().ok_or("Python не найден")?;
    let converter_path = get_converter_script_path(&app)?;
    
    let models_dir = hf_models::get_models_dir()?;
    let safe_name = repo_id.replace('/', "_");
    let output_path = models_dir.join(format!("{}-{}.gguf", safe_name, quant_type.to_lowercase()));
    
    let mut child = Command::new(&python_cmd)
        .arg(&converter_path)
        .arg("--convert")
        .arg(&repo_id)
        .arg("--output")
        .arg(&output_path)
        .arg("--quant")
        .arg(&quant_type)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Ошибка запуска конвертации: {}", e))?;
    
    let stdout = child.stdout.take().ok_or("Не удалось получить stdout")?;
    let reader = BufReader::new(stdout);
    
    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(progress) = serde_json::from_str::<AwqConversionProgress>(&line) {
                let _ = app.emit("awq-conversion-progress", &progress);
                if let Some(err) = progress.error {
                    return Err(err);
                }
            }
        }
    }
    
    let status = child.wait()
        .map_err(|e| format!("Ошибка ожидания процесса: {}", e))?;
    
    if !status.success() {
        return Err("Конвертация завершилась с ошибкой".to_string());
    }
    
    let output_str = output_path.to_string_lossy().to_string();
    add_model_path(output_str.clone())?;
    
    Ok(output_str)
}

/// Check if a model is AWQ format (not GGUF)
#[tauri::command]
pub fn is_awq_model(repo_id: String) -> bool {
    let lower = repo_id.to_lowercase();
    lower.contains("awq") && !lower.contains("gguf")
}

/// Search for GGUF equivalent of an AWQ model
#[tauri::command]
pub fn suggest_gguf_alternative(repo_id: String) -> Option<String> {
    let parts: Vec<&str> = repo_id.split('/').collect();
    if parts.len() != 2 {
        return None;
    }
    
    let model_name = parts[1];
    
    let suggestions = [
        (model_name.replace("-AWQ", "-GGUF"), "AWQ", "GGUF"),
        (model_name.replace("-awq", "-GGUF"), "awq", "GGUF"),
        (format!("{}-GGUF", model_name.replace("-AWQ", "").replace("-awq", "")), "", "GGUF"),
    ];
    
    for (suggested, _, _) in suggestions {
        if suggested != model_name && suggested.contains("GGUF") {
            return Some(suggested);
        }
    }
    
    None
}

// Helper: Find Python executable
fn find_python() -> Option<String> {
    let candidates = ["python3", "python", "python3.11", "python3.10", "python3.9"];
    
    for cmd in candidates {
        if std::process::Command::new(cmd)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(cmd.to_string());
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if std::process::Command::new("py")
            .arg("-3")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some("py -3".to_string());
        }
    }
    
    None
}

// Helper: Get converter script path
fn get_converter_script_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let resource_path = app.path()
        .resolve("resources/awq_converter.py", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Не удалось найти скрипт конвертера: {}", e))?;
    
    if resource_path.exists() {
        return Ok(resource_path);
    }
    
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let fallback_path = app_dir.join("awq_converter.py");
    
    if fallback_path.exists() {
        return Ok(fallback_path);
    }
    
    Err("Скрипт конвертера не найден".to_string())
}

// ==================== TESTS ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== Settings Tests ====================

    #[test]
    fn test_settings_default_values() {
        let settings = Settings::default();
        
        assert_eq!(settings.temperature, 0.7);
        assert_eq!(settings.max_tokens, 512);
        assert_eq!(settings.context_length, 2048);
        assert_eq!(settings.theme, "dark");
        assert_eq!(settings.accent_color, "cyan");
        assert!(!settings.auto_speak);
        assert!(settings.stt_enabled);
        assert!(settings.tts_enabled);
        assert!(settings.model_paths.is_empty());
        assert_eq!(settings.llm_backend, "native");
    }

    #[test]
    fn test_default_system_prompt() {
        let prompt = default_system_prompt();
        
        assert!(!prompt.is_empty());
        assert!(prompt.contains("Wishmaster"));
        assert!(prompt.contains("русском"));
    }

    #[test]
    fn test_settings_serialization() {
        let settings = Settings::default();
        let json = serde_json::to_string(&settings).expect("Serialization failed");
        
        assert!(json.contains("\"maxTokens\""));
        assert!(json.contains("\"contextLength\""));
        assert!(json.contains("\"accentColor\""));
        assert!(json.contains("\"autoSpeak\""));
        assert!(json.contains("\"sttEnabled\""));
        assert!(json.contains("\"ttsEnabled\""));
        assert!(json.contains("\"modelPaths\""));
        assert!(json.contains("\"systemPrompt\""));
        assert!(json.contains("\"llmBackend\""));
    }

    #[test]
    fn test_settings_deserialization() {
        let json = r#"{
            "temperature": 0.9,
            "maxTokens": 1024,
            "contextLength": 4096,
            "theme": "light",
            "accentColor": "magenta",
            "autoSpeak": true,
            "sttEnabled": false,
            "ttsEnabled": true,
            "modelPaths": ["/path/model.gguf"],
            "systemPrompt": "Custom prompt",
            "llmBackend": "native"
        }"#;
        
        let settings: Settings = serde_json::from_str(json).expect("Deserialization failed");
        
        assert_eq!(settings.temperature, 0.9);
        assert_eq!(settings.max_tokens, 1024);
        assert_eq!(settings.context_length, 4096);
        assert_eq!(settings.theme, "light");
        assert!(settings.auto_speak);
        assert!(!settings.stt_enabled);
        assert_eq!(settings.model_paths.len(), 1);
        assert_eq!(settings.system_prompt, "Custom prompt");
        assert_eq!(settings.llm_backend, "native");
    }

    // ==================== Message Tests ====================

    #[test]
    fn test_message_structure() {
        let msg = Message {
            id: 1,
            content: "Hello".to_string(),
            is_user: true,
            timestamp: 1234567890,
        };
        
        assert_eq!(msg.id, 1);
        assert!(msg.is_user);
    }

    #[test]
    fn test_message_serialization_camel_case() {
        let msg = Message {
            id: 1,
            content: "Test".to_string(),
            is_user: false,
            timestamp: 0,
        };
        
        let json = serde_json::to_string(&msg).expect("Serialization failed");
        assert!(json.contains("\"isUser\""));
        assert!(!json.contains("\"is_user\""));
    }

    // ==================== HistoryMessage Tests ====================

    #[test]
    fn test_history_message_structure() {
        let history = vec![
            HistoryMessage { content: "Привет".to_string(), is_user: true },
            HistoryMessage { content: "Здравствуйте!".to_string(), is_user: false },
        ];
        
        assert_eq!(history.len(), 2);
        assert!(history[0].is_user);
        assert!(!history[1].is_user);
    }

    // ==================== Prompt Building Tests ====================

    #[test]
    fn test_chatml_format_system() {
        let system = "Ты AI ассистент";
        let prompt = format!("<|im_start|>system\n{}<|im_end|>\n", system);
        
        assert!(prompt.starts_with("<|im_start|>system"));
        assert!(prompt.contains(system));
        assert!(prompt.contains("<|im_end|>"));
    }

    #[test]
    fn test_chatml_format_user_message() {
        let user_msg = "Привет";
        let prompt = format!("<|im_start|>user\n{}<|im_end|>\n", user_msg);
        
        assert!(prompt.contains("<|im_start|>user"));
        assert!(prompt.contains(user_msg));
        assert!(prompt.contains("<|im_end|>"));
    }

    #[test]
    fn test_chatml_format_assistant() {
        let assistant_prompt = "<|im_start|>assistant\n";
        
        assert!(assistant_prompt.contains("<|im_start|>assistant"));
        assert!(assistant_prompt.ends_with("\n"));
    }

    #[test]
    fn test_full_prompt_structure() {
        let system = "Ты Wishmaster";
        let history = vec![
            HistoryMessage { content: "Привет".to_string(), is_user: true },
            HistoryMessage { content: "Здравствуйте!".to_string(), is_user: false },
        ];
        let user_message = "Как дела?";
        
        let mut full_prompt = String::from("<|im_start|>system\n");
        full_prompt.push_str(system);
        full_prompt.push_str("\n<|im_end|>\n");
        
        for msg in history.iter() {
            let role = if msg.is_user { "user" } else { "assistant" };
            full_prompt.push_str(&format!("<|im_start|>{}\n{}<|im_end|>\n", role, msg.content));
        }
        
        full_prompt.push_str(&format!("<|im_start|>user\n{}<|im_end|>\n", user_message));
        full_prompt.push_str("<|im_start|>assistant\n");
        
        assert!(full_prompt.starts_with("<|im_start|>system"));
        assert!(full_prompt.contains(system));
        assert!(full_prompt.contains("<|im_start|>user\nПривет<|im_end|>"));
        assert!(full_prompt.contains("<|im_start|>assistant\nЗдравствуйте!<|im_end|>"));
        assert!(full_prompt.contains("<|im_start|>user\nКак дела?<|im_end|>"));
        assert!(full_prompt.ends_with("<|im_start|>assistant\n"));
    }

    #[test]
    fn test_prompt_with_memories() {
        let memories = vec![
            "Пользователь любит Rust",
            "Пользователя зовут Алекс",
        ];
        
        let mut memory_section = String::from("=== ВАЖНЫЕ ФАКТЫ ИЗ ПАМЯТИ ===\n");
        for mem in memories {
            memory_section.push_str(&format!("- {}\n", mem));
        }
        
        assert!(memory_section.contains("ВАЖНЫЕ ФАКТЫ"));
        assert!(memory_section.contains("Rust"));
        assert!(memory_section.contains("Алекс"));
    }

    #[test]
    fn test_prompt_with_persona() {
        let persona_info = format!(
            "=== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===\nСтиль: {}, Тон: {}, Язык: {}\n",
            "casual", "friendly", "ru"
        );
        
        assert!(persona_info.contains("ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ"));
        assert!(persona_info.contains("casual"));
        assert!(persona_info.contains("friendly"));
        assert!(persona_info.contains("ru"));
    }

    #[test]
    fn test_prompt_with_rag_context() {
        let rag_results = vec![
            ("Память", 0.85, "Пользователь работает программистом"),
            ("Сообщение", 0.72, "Обсуждали Rust вчера"),
        ];
        
        let mut rag_section = String::from("=== РЕЛЕВАНТНЫЙ КОНТЕКСТ ===\n");
        for (source, similarity, content) in rag_results {
            rag_section.push_str(&format!("[{} | сходство: {:.0}%] {}\n",
                source, similarity * 100.0, content));
        }
        
        assert!(rag_section.contains("РЕЛЕВАНТНЫЙ КОНТЕКСТ"));
        assert!(rag_section.contains("85%"));
        assert!(rag_section.contains("72%"));
        assert!(rag_section.contains("программистом"));
    }

    // ==================== Edge Cases ====================

    #[test]
    fn test_empty_history() {
        let history: Vec<HistoryMessage> = vec![];
        let user_message = "Первое сообщение";
        
        let mut prompt = String::from("<|im_start|>system\nТы AI<|im_end|>\n");
        
        for msg in history.iter() {
            let role = if msg.is_user { "user" } else { "assistant" };
            prompt.push_str(&format!("<|im_start|>{}\n{}<|im_end|>\n", role, msg.content));
        }
        
        prompt.push_str(&format!("<|im_start|>user\n{}<|im_end|>\n", user_message));
        
        assert!(!prompt.contains("<|im_start|>assistant\n"));
        assert!(prompt.matches("<|im_start|>user").count() == 1);
    }

    #[test]
    fn test_special_characters_in_prompt() {
        let user_message = "Как написать `fn main() { println!(\"Hello\"); }`?";
        let prompt = format!("<|im_start|>user\n{}<|im_end|>\n", user_message);
        
        assert!(prompt.contains("fn main()"));
        assert!(prompt.contains("println!"));
    }

    #[test]
    fn test_multiline_message() {
        let user_message = "Строка 1\nСтрока 2\nСтрока 3";
        let prompt = format!("<|im_start|>user\n{}<|im_end|>\n", user_message);
        
        assert!(prompt.contains("Строка 1\nСтрока 2\nСтрока 3"));
    }

    #[test]
    fn test_emoji_in_message() {
        let user_message = "Привет! 🎉👋";
        let prompt = format!("<|im_start|>user\n{}<|im_end|>\n", user_message);
        
        assert!(prompt.contains("🎉"));
        assert!(prompt.contains("👋"));
    }

    // ==================== Persona Analysis Tests ====================

    #[test]
    fn test_cyrillic_detection() {
        let messages = vec![
            "Привет, как дела?".to_string(),
            "Хорошо, спасибо!".to_string(),
        ];
        
        let has_cyrillic = messages.iter()
            .any(|m| m.chars().any(|c| c >= 'а' && c <= 'я' || c >= 'А' && c <= 'Я'));
        
        assert!(has_cyrillic, "Should detect Cyrillic");
    }

    #[test]
    fn test_no_cyrillic_detection() {
        let messages = vec![
            "Hello, how are you?".to_string(),
            "Fine, thanks!".to_string(),
        ];
        
        let has_cyrillic = messages.iter()
            .any(|m| m.chars().any(|c| c >= 'а' && c <= 'я' || c >= 'А' && c <= 'Я'));
        
        assert!(!has_cyrillic, "Should not detect Cyrillic in English");
    }

    #[test]
    fn test_emoji_ratio_calculation() {
        let messages = vec![
            "Привет 🎉".to_string(),
            "Как дела? 😊👋".to_string(),
            "Хорошо!".to_string(),
        ];
        
        let emoji_count: usize = messages.iter()
            .flat_map(|m| m.chars())
            .filter(|c| {
                let cp = *c as u32;
                (cp >= 0x1F600 && cp <= 0x1F64F)
                || (cp >= 0x1F300 && cp <= 0x1F5FF)
                || (cp >= 0x1F680 && cp <= 0x1F6FF)
                || (cp >= 0x1F900 && cp <= 0x1F9FF)
                || (cp >= 0x2600 && cp <= 0x26FF)
                || (cp >= 0x2700 && cp <= 0x27BF)
                || (cp >= 0x1FA00 && cp <= 0x1FA6F)
            })
            .count();
        
        // 3 emojis (🎉, 😊, 👋) / 3 messages = 1.0
        let emoji_ratio = emoji_count as f32 / messages.len() as f32;
        
        assert!(emoji_ratio >= 1.0);
    }

    #[test]
    fn test_writing_style_detection_casual() {
        let messages = vec!["привет".to_string(), "ок".to_string(), "круто".to_string()];
        let casual_words = ["привет", "ок", "круто"];
        let formal_words = ["пожалуйста", "благодарю"];
        
        let casual_count: usize = messages.iter()
            .map(|m| casual_words.iter().filter(|w| m.to_lowercase().contains(*w)).count())
            .sum();
        let formal_count: usize = messages.iter()
            .map(|m| formal_words.iter().filter(|w| m.to_lowercase().contains(*w)).count())
            .sum();
        
        assert!(casual_count > formal_count);
    }

    // ==================== Model Path Tests ====================

    #[test]
    fn test_add_empty_path() {
        let path = "   ".trim().to_string();
        assert!(path.is_empty(), "Empty path should be detected");
    }

    #[test]
    fn test_duplicate_path_prevention() {
        let mut paths = vec!["/path/model1.gguf".to_string()];
        let new_path = "/path/model1.gguf".to_string();
        
        if !paths.contains(&new_path) {
            paths.push(new_path);
        }
        
        assert_eq!(paths.len(), 1, "Should not add duplicate path");
    }

    #[test]
    fn test_path_removal() {
        let mut paths = vec![
            "/path/model1.gguf".to_string(),
            "/path/model2.gguf".to_string(),
        ];
        
        paths.retain(|p| p != "/path/model1.gguf");
        
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "/path/model2.gguf");
    }
}
