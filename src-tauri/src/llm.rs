use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::token::data_array::LlamaTokenDataArray;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;
use std::sync::Mutex;

static BACKEND: OnceCell<LlamaBackend> = OnceCell::new();
static MODEL: OnceCell<Mutex<Option<LlamaModel>>> = OnceCell::new();
static MODEL_PATH: OnceCell<Mutex<Option<String>>> = OnceCell::new();
static CONTEXT_SIZE: OnceCell<Mutex<u32>> = OnceCell::new();
static GPU_AVAILABLE: OnceCell<bool> = OnceCell::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub available: bool,
    pub backend: String,
    pub device_name: String,
    pub vram_total_mb: u64,
    pub vram_free_mb: u64,
}

/// Stop sequences for ChatML format
const STOP_SEQUENCES: &[&str] = &[
    "<|im_end|>",
    "<|im_start|>",
    "</s>",
    "<|endoftext|>",
];

/// Sample a token with temperature
/// 
/// Temperature controls randomness:
/// - temp = 0.0: greedy (always pick highest probability)
/// - temp = 0.0-0.5: focused, deterministic
/// - temp = 0.5-1.0: balanced creativity
/// - temp > 1.0: more random, creative
fn sample_with_temperature(candidates: &mut LlamaTokenDataArray, temperature: f32) -> llama_cpp_2::token::LlamaToken {
    if temperature <= 0.0 {
        // Greedy sampling - pick the most likely token
        candidates.sample_token_greedy()
    } else {
        // Apply softmax first to convert logits to probabilities
        candidates.sample_softmax();
        
        // Apply temperature scaling
        // Higher temperature = more uniform distribution = more randomness
        candidates.sample_temp(temperature);
        
        // Sample from the distribution
        // Note: sample_token uses the probability distribution after temp scaling
        candidates.sample_token()
    }
}

pub fn init() {
    // Initialize llama.cpp backend
    let backend = BACKEND.get_or_init(|| {
        LlamaBackend::init().expect("Failed to initialize llama.cpp backend")
    });
    
    let _ = MODEL.set(Mutex::new(None));
    let _ = MODEL_PATH.set(Mutex::new(None));
    let _ = CONTEXT_SIZE.set(Mutex::new(2048));
    
    // Check GPU support
    let gpu_supported = backend.supports_gpu_offload();
    let _ = GPU_AVAILABLE.set(gpu_supported);
    
    println!("╔══════════════════════════════════════════╗");
    println!("║     WISHMASTER LLM ENGINE INIT           ║");
    println!("╠══════════════════════════════════════════╣");
    println!("║ Backend: llama.cpp (native)              ║");
    if gpu_supported {
        println!("║ GPU: ✅ CUDA AVAILABLE                   ║");
        println!("║ Mode: GPU Accelerated                    ║");
    } else {
        println!("║ GPU: ❌ CPU ONLY                         ║");
        println!("║ Mode: CPU (slower)                       ║");
    }
    println!("╚══════════════════════════════════════════╝");
    
    let _ = backend;
}

/// Get GPU/CUDA information
pub fn get_gpu_info() -> GpuInfo {
    let available = GPU_AVAILABLE.get().copied().unwrap_or(false);
    
    if available {
        GpuInfo {
            available: true,
            backend: "CUDA".to_string(),
            device_name: "NVIDIA GPU".to_string(), // Generic name
            vram_total_mb: 0, // Would need unsafe FFI to get real values
            vram_free_mb: 0,
        }
    } else {
        GpuInfo {
            available: false,
            backend: "CPU".to_string(),
            device_name: "N/A".to_string(),
            vram_total_mb: 0,
            vram_free_mb: 0,
        }
    }
}

/// Check if GPU/CUDA is available
pub fn is_gpu_available() -> bool {
    GPU_AVAILABLE.get().copied().unwrap_or(false)
}

pub fn load_model(path: &str, context_length: usize) -> Result<(), String> {
    let gpu_available = is_gpu_available();
    
    println!("╔══════════════════════════════════════════╗");
    println!("║          LOADING MODEL                   ║");
    println!("╠══════════════════════════════════════════╣");
    println!("║ Path: {}...", &path[path.len().saturating_sub(40)..]);
    println!("║ Context: {} tokens", context_length);
    println!("║ GPU Layers: {}", if gpu_available { "99 (max)" } else { "0 (CPU)" });
    println!("╚══════════════════════════════════════════╝");
    
    // Check if file exists
    if !std::path::Path::new(path).exists() {
        return Err(format!("Model file not found: {}", path));
    }
    
    // Get backend
    let backend = BACKEND.get().ok_or("Backend not initialized")?;
    
    // Model parameters with GPU acceleration
    // Use 99 layers on GPU (llama.cpp will use max available)
    let gpu_layers = if gpu_available { 99 } else { 0 };
    let model_params = LlamaModelParams::default()
        .with_n_gpu_layers(gpu_layers);
    
    println!("⏳ Loading model to {}...", if gpu_available { "GPU" } else { "CPU" });
    
    // Load model
    let model = LlamaModel::load_from_file(backend, path, &model_params)
        .map_err(|e| format!("Failed to load model: {:?}", e))?;
    
    // Store model
    let model_holder = MODEL.get_or_init(|| Mutex::new(None));
    match model_holder.lock() {
        Ok(mut guard) => {
            *guard = Some(model);
        }
        Err(e) => {
            return Err(format!("Failed to lock model: {}", e));
        }
    }
    
    // Store path
    let path_holder = MODEL_PATH.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = path_holder.lock() {
        *guard = Some(path.to_string());
    }
    
    // Store context size
    let ctx_holder = CONTEXT_SIZE.get_or_init(|| Mutex::new(2048));
    if let Ok(mut guard) = ctx_holder.lock() {
        *guard = context_length as u32;
    }
    
    println!("✅ Model loaded successfully!");
    if gpu_available {
        println!("🚀 Running on CUDA GPU - Fast inference enabled");
    } else {
        println!("⚠️ Running on CPU - Consider using GPU for faster inference");
    }
    Ok(())
}

pub fn unload_model() {
    if let Some(model_holder) = MODEL.get() {
        if let Ok(mut guard) = model_holder.lock() {
            *guard = None;
            println!("Model unloaded");
        }
    }
    
    if let Some(path_holder) = MODEL_PATH.get() {
        if let Ok(mut guard) = path_holder.lock() {
            *guard = None;
        }
    }
}

pub fn is_loaded() -> bool {
    MODEL.get()
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
    
    let model_holder = MODEL.get().ok_or("Model holder not initialized")?;
    let model_guard = model_holder.lock().map_err(|e| format!("Lock error: {}", e))?;
    let model = model_guard.as_ref().ok_or("Model not loaded")?;
    
    let ctx_size = CONTEXT_SIZE.get()
        .and_then(|c| c.lock().ok())
        .map(|g| *g)
        .unwrap_or(2048);
    
    println!("Generating: {} chars, temp={}, max_tokens={}, ctx={}", 
             prompt.len(), temperature, max_tokens, ctx_size);
    
    // Create context with basic params
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(ctx_size));
    
    let mut ctx = model.new_context(&BACKEND.get().unwrap(), ctx_params)
        .map_err(|e| format!("Failed to create context: {:?}", e))?;
    
    // Tokenize prompt
    let tokens = model.str_to_token(prompt, llama_cpp_2::model::AddBos::Always)
        .map_err(|e| format!("Tokenization error: {:?}", e))?;
    
    if tokens.is_empty() {
        return Err("Empty prompt after tokenization".to_string());
    }
    
    println!("Prompt tokens: {}", tokens.len());
    
    // Create batch
    let mut batch = LlamaBatch::new(ctx_size as usize, 1);
    
    // Add prompt tokens to batch
    for (i, token) in tokens.iter().enumerate() {
        let is_last = i == tokens.len() - 1;
        batch.add(*token, i as i32, &[0], is_last)
            .map_err(|e| format!("Batch add error: {:?}", e))?;
    }
    
    // Decode prompt
    ctx.decode(&mut batch)
        .map_err(|e| format!("Decode error: {:?}", e))?;
    
    // Generate tokens
    let mut n_cur = tokens.len();
    let mut accumulated = String::new();
    
    for _ in 0..max_tokens {
        // Get logits for the last token
        let candidates = ctx.candidates_ith(batch.n_tokens() - 1);
        let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);
        
        // Sample with temperature
        let new_token = sample_with_temperature(&mut candidates_p, temperature);
        
        // Check for EOS
        if model.is_eog_token(new_token) {
            println!("EOS token reached");
            break;
        }
        
        // Convert token to string
        let token_str = model.token_to_str(new_token, llama_cpp_2::model::Special::Tokenize)
            .map_err(|e| format!("Token to string error: {:?}", e))?;
        
        accumulated.push_str(&token_str);
        
        // Check stop sequences
        let should_stop = STOP_SEQUENCES.iter().any(|seq| accumulated.contains(seq));
        
        // Clean and emit token
        let clean_token = STOP_SEQUENCES.iter()
            .fold(token_str.clone(), |acc, seq| acc.replace(seq, ""));
        
        if !clean_token.is_empty() {
            if !callback(clean_token) {
                println!("Generation stopped by user");
                break;
            }
        }
        
        if should_stop {
            println!("Stop sequence detected");
            break;
        }
        
        // Prepare next batch
        batch.clear();
        batch.add(new_token, n_cur as i32, &[0], true)
            .map_err(|e| format!("Batch add error: {:?}", e))?;
        n_cur += 1;
        
        ctx.decode(&mut batch)
            .map_err(|e| format!("Decode error: {:?}", e))?;
    }
    
    println!("Generation complete. {} tokens generated", n_cur - tokens.len());
    Ok(())
}
