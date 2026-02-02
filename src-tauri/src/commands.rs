use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
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
pub fn scan_models() -> Result<Vec<Model>, String> {
    let mut models = Vec::new();
    
    // Search in common directories
    let home = dirs::home_dir().unwrap_or_default();
    let search_paths = vec![
        home.join("models"),
        home.join("Downloads"),
        home.join(".cache/llama.cpp"),
    ];
    
    for path in search_paths {
        if path.exists() {
            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.flatten() {
                    let file_path = entry.path();
                    if file_path.extension().map(|e| e == "gguf").unwrap_or(false) {
                        if let Ok(metadata) = entry.metadata() {
                            models.push(Model {
                                name: file_path.file_stem()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("Unknown")
                                    .to_string(),
                                path: file_path.to_string_lossy().to_string(),
                                size: metadata.len() as i64,
                                is_loaded: false,
                            });
                        }
                    }
                }
            }
        }
    }
    
    Ok(models)
}

#[tauri::command]
pub async fn load_model(path: String, context_length: i32) -> Result<(), String> {
    llm::load_model(&path, context_length as usize)
        .map_err(|e| e.to_string())
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

// ==================== Generation Commands ====================

#[tauri::command]
pub async fn generate(
    app: AppHandle,
    prompt: String,
    history: Vec<HistoryMessage>,
    temperature: f32,
    max_tokens: i32,
) -> Result<(), String> {
    STOP_GENERATION.store(false, Ordering::SeqCst);
    
    // Build prompt with ChatML format
    let mut full_prompt = String::from("<|im_start|>system\n");
    full_prompt.push_str("Ты - Wishmaster, умный AI-ассистент. Отвечай кратко и по делу на русском языке. ");
    full_prompt.push_str("НЕ повторяй вопрос пользователя.<|im_end|>\n");
    
    // Add history
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
            return false; // Stop generation
        }
        
        // Emit token to frontend
        let _ = app.emit("llm-token", token);
        true // Continue
    }) {
        Ok(_) => {
            let _ = app.emit("llm-finished", ());
            Ok(())
        }
        Err(e) => {
            let _ = app.emit("llm-finished", ());
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
