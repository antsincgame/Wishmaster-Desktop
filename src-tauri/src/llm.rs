use once_cell::sync::OnceCell;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

static MODEL_PATH: OnceCell<Mutex<Option<String>>> = OnceCell::new();
static CONTEXT_LENGTH: OnceCell<Mutex<usize>> = OnceCell::new();
static SERVER_URL: OnceCell<Mutex<String>> = OnceCell::new();
static HTTP_CLIENT: OnceCell<Client> = OnceCell::new();
static USE_SERVER: AtomicBool = AtomicBool::new(true);

/// Stop sequences for ChatML format
const STOP_SEQUENCES: &[&str] = &[
    "<|im_end|>",
    "<|im_start|>",
    "</s>",
    "### User:",
    "\nUser:",
];

#[derive(Serialize)]
struct CompletionRequest {
    prompt: String,
    n_predict: i32,
    temperature: f32,
    stop: Vec<String>,
    stream: bool,
}

#[derive(Deserialize, Debug)]
struct CompletionResponse {
    content: Option<String>,
    #[serde(default)]
    stop: bool,
}

#[derive(Deserialize, Debug)]
struct StreamChunk {
    content: Option<String>,
    #[serde(default)]
    stop: bool,
}

pub fn init() {
    let _ = MODEL_PATH.set(Mutex::new(None));
    let _ = CONTEXT_LENGTH.set(Mutex::new(2048));
    let _ = SERVER_URL.set(Mutex::new("http://127.0.0.1:8080".to_string()));
    let _ = HTTP_CLIENT.set(Client::new());
    println!("LLM engine initialized (HTTP mode to llama.cpp server)");
}

/// Set server URL for llama.cpp server
pub fn set_server_url(url: &str) {
    if let Some(server) = SERVER_URL.get() {
        if let Ok(mut guard) = server.lock() {
            *guard = url.to_string();
            println!("LLM server URL set to: {}", url);
        }
    }
}

/// Check if server is reachable
pub async fn check_server() -> bool {
    let url = SERVER_URL.get()
        .and_then(|s| s.lock().ok())
        .map(|s| s.clone())
        .unwrap_or_else(|| "http://127.0.0.1:8080".to_string());
    
    let client = HTTP_CLIENT.get().cloned().unwrap_or_else(Client::new);
    
    match client.get(&format!("{}/health", url)).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub fn load_model(path: &str, context_length: usize) -> Result<(), String> {
    println!("Setting model path: {} with context: {}", path, context_length);
    
    // For server mode, we just store the path (server loads model separately)
    // Check if file exists for local reference
    if !path.is_empty() && !std::path::Path::new(path).exists() {
        println!("Warning: Model file not found locally: {}. Using server mode.", path);
    }
    
    let model_path = MODEL_PATH.get_or_init(|| Mutex::new(None));
    match model_path.lock() {
        Ok(mut guard) => {
            *guard = Some(path.to_string());
        }
        Err(e) => {
            return Err(format!("Failed to lock model path: {}", e));
        }
    }
    
    let ctx_len = CONTEXT_LENGTH.get_or_init(|| Mutex::new(2048));
    match ctx_len.lock() {
        Ok(mut guard) => {
            *guard = context_length;
        }
        Err(e) => {
            return Err(format!("Failed to lock context length: {}", e));
        }
    }
    
    USE_SERVER.store(true, Ordering::SeqCst);
    println!("Model configured. Using HTTP server mode.");
    Ok(())
}

pub fn unload_model() {
    if let Some(model_path) = MODEL_PATH.get() {
        if let Ok(mut guard) = model_path.lock() {
            *guard = None;
            println!("Model unloaded");
        }
    }
}

pub fn is_loaded() -> bool {
    // In server mode, check if we have a model path configured
    MODEL_PATH.get()
        .and_then(|m| m.lock().ok())
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

/// Generate text using llama.cpp server (streaming)
pub fn generate<F>(prompt: &str, temperature: f32, max_tokens: usize, mut callback: F) -> Result<(), String>
where
    F: FnMut(String) -> bool,
{
    if !is_loaded() {
        return Err("Model not configured".to_string());
    }
    
    let url = SERVER_URL.get()
        .and_then(|s| s.lock().ok())
        .map(|s| s.clone())
        .unwrap_or_else(|| "http://127.0.0.1:8080".to_string());
    
    println!("Generating via server: {} (prompt: {} chars, temp: {}, max: {})", 
             url, prompt.len(), temperature, max_tokens);
    
    // Use blocking client for sync callback
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let request = CompletionRequest {
        prompt: prompt.to_string(),
        n_predict: max_tokens as i32,
        temperature,
        stop: STOP_SEQUENCES.iter().map(|s| s.to_string()).collect(),
        stream: true,
    };
    
    let response = client
        .post(&format!("{}/completion", url))
        .json(&request)
        .send();
    
    match response {
        Ok(resp) => {
            if !resp.status().is_success() {
                return Err(format!("Server error: {}", resp.status()));
            }
            
            // Read streaming response line by line
            let text = resp.text().map_err(|e| e.to_string())?;
            
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() || line == "data: [DONE]" {
                    continue;
                }
                
                let json_str = if line.starts_with("data: ") {
                    &line[6..]
                } else {
                    line
                };
                
                if let Ok(chunk) = serde_json::from_str::<StreamChunk>(json_str) {
                    if let Some(content) = chunk.content {
                        if !content.is_empty() {
                            // Check for stop sequences
                            let should_stop = STOP_SEQUENCES.iter().any(|seq| content.contains(seq));
                            
                            // Clean content from stop sequences
                            let clean_content = STOP_SEQUENCES.iter()
                                .fold(content.clone(), |acc, seq| acc.replace(seq, ""));
                            
                            if !clean_content.is_empty() && !callback(clean_content) {
                                println!("Generation stopped by user");
                                return Ok(());
                            }
                            
                            if should_stop || chunk.stop {
                                println!("Stop sequence detected");
                                return Ok(());
                            }
                        }
                    }
                    
                    if chunk.stop {
                        break;
                    }
                }
            }
            
            Ok(())
        }
        Err(e) => {
            // If server not available, return helpful error
            if e.is_connect() {
                Err(format!(
                    "Не удалось подключиться к llama.cpp серверу на {}. \
                     Запустите сервер: ./llama-server -m model.gguf --port 8080",
                    url
                ))
            } else {
                Err(format!("HTTP error: {}", e))
            }
        }
    }
}
