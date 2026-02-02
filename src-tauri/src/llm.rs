use once_cell::sync::OnceCell;
use std::sync::Mutex;

static MODEL_PATH: OnceCell<Mutex<Option<String>>> = OnceCell::new();
static CONTEXT_LENGTH: OnceCell<Mutex<usize>> = OnceCell::new();

/// Stop sequences for ChatML format
const STOP_SEQUENCES: &[&str] = &[
    "<|im_end|>",
    "<|im_start|>",
    "### User:",
    "\nUser:",
];

pub fn init() {
    MODEL_PATH.set(Mutex::new(None)).ok();
    CONTEXT_LENGTH.set(Mutex::new(2048)).ok();
    println!("LLM engine initialized");
}

pub fn load_model(path: &str, context_length: usize) -> Result<(), String> {
    println!("Loading model: {} with context: {}", path, context_length);
    
    // Check if file exists
    if !std::path::Path::new(path).exists() {
        return Err(format!("Model file not found: {}", path));
    }
    
    // Store model path
    if let Some(model_path) = MODEL_PATH.get() {
        if let Ok(mut guard) = model_path.lock() {
            *guard = Some(path.to_string());
        }
    }
    
    if let Some(ctx_len) = CONTEXT_LENGTH.get() {
        if let Ok(mut guard) = ctx_len.lock() {
            *guard = context_length;
        }
    }
    
    // TODO: Implement actual model loading using llama-cpp-2
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    println!("Model loaded successfully!");
    Ok(())
}

pub fn unload_model() {
    if let Some(model_path) = MODEL_PATH.get() {
        if let Ok(mut guard) = model_path.lock() {
            *guard = None;
        }
    }
    println!("Model unloaded");
}

pub fn is_loaded() -> bool {
    MODEL_PATH.get()
        .and_then(|m| m.lock().ok())
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub fn generate<F>(prompt: &str, temperature: f32, max_tokens: usize, mut callback: F) -> Result<(), String>
where
    F: FnMut(String) -> bool,
{
    if !is_loaded() {
        return Err("Model not loaded".to_string());
    }
    
    println!("Generating response for prompt ({} chars) temp={} max_tokens={}", 
             prompt.len(), temperature, max_tokens);
    
    // TODO: Implement actual generation using llama-cpp-2
    // Placeholder response
    let response = "Привет! Я Wishmaster — ваш локальный AI-ассистент. \
                   Я работаю полностью оффлайн благодаря llama.cpp. \
                   Чем могу помочь?";
    
    let mut accumulated = String::new();
    
    for word in response.split_whitespace() {
        let token = format!("{} ", word);
        accumulated.push_str(&token);
        
        // Check for stop sequences
        let should_stop = STOP_SEQUENCES.iter().any(|seq| accumulated.contains(seq));
        
        // Simulate generation delay
        std::thread::sleep(std::time::Duration::from_millis(50));
        
        if !callback(token) {
            println!("Generation stopped by user");
            break;
        }
        
        if should_stop {
            println!("Stop sequence detected");
            break;
        }
    }
    
    Ok(())
}
