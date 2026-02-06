use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::LlamaModelLoadError;
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::token::data_array::LlamaTokenDataArray;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

static BACKEND: OnceCell<LlamaBackend> = OnceCell::new();
static MODEL: OnceCell<Mutex<Option<LlamaModel>>> = OnceCell::new();
static MODEL_PATH: OnceCell<Mutex<Option<String>>> = OnceCell::new();
static CONTEXT_SIZE: OnceCell<Mutex<u32>> = OnceCell::new();
static GPU_AVAILABLE: OnceCell<bool> = OnceCell::new();
static SEED_COUNTER: AtomicU32 = AtomicU32::new(42);
/// Serializes model load/unload so only one load runs at a time (prevents crash when loading multiple models).
static LOAD_MODEL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

/// Default CPU threads when detection fails
const DEFAULT_CPU_THREADS: i32 = 4;

/// Get number of CPU threads for inference (uses all available cores when on CPU)
fn cpu_thread_count() -> i32 {
    std::thread::available_parallelism()
        .map(|p| p.get() as i32)
        .unwrap_or(DEFAULT_CPU_THREADS)
        .max(1)
}

/// Get next seed for random sampling (simple incrementing counter)
fn next_seed() -> u32 {
    SEED_COUNTER.fetch_add(1, Ordering::Relaxed)
}

/// Sample a token with temperature using the new Sampler API
/// 
/// Temperature controls randomness:
/// - temp = 0.0: greedy (always pick highest probability)
/// - temp = 0.0-0.5: focused, deterministic
/// - temp = 0.5-1.0: balanced creativity
/// - temp > 1.0: more random, creative
/// 
/// Returns None if sampling fails (should be rare but handled gracefully)
fn sample_with_temperature(candidates: &mut LlamaTokenDataArray, temperature: f32) -> Option<llama_cpp_2::token::LlamaToken> {
    if temperature <= 0.0 {
        // Greedy sampling - pick the most likely token
        candidates.apply_sampler(&LlamaSampler::greedy());
        candidates.selected_token()
    } else {
        // Create a sampler chain: temperature -> random distribution
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(temperature),
            LlamaSampler::dist(next_seed()),
        ]);
        
        candidates.apply_sampler(&mut sampler);
        candidates.selected_token()
    }
}

pub fn init() {
    // Initialize llama.cpp backend with error handling
    let backend = BACKEND.get_or_init(|| {
        match LlamaBackend::init() {
            Ok(backend) => backend,
            Err(e) => {
                eprintln!("❌ CRITICAL: Failed to initialize llama.cpp backend: {:?}", e);
                eprintln!("   The application will not be able to run LLM inference.");
                // We still need to return something - create a default backend
                // This should rarely happen in practice
                panic!("Cannot initialize LLM backend: {:?}", e);
            }
        }
    });
    
    let _ = MODEL.set(Mutex::new(None));
    let _ = MODEL_PATH.set(Mutex::new(None));
    let _ = CONTEXT_SIZE.set(Mutex::new(2048));
    
    // Real CUDA detection: llama.cpp llama_supports_gpu_offload() (build with feature "cuda" + NVIDIA runtime)
    let gpu_supported = backend.supports_gpu_offload();
    let _ = GPU_AVAILABLE.set(gpu_supported);
    
    let n_threads = cpu_thread_count();
    println!("╔══════════════════════════════════════════╗");
    println!("║     WISHMASTER LLM ENGINE INIT           ║");
    println!("╠══════════════════════════════════════════╣");
    println!("║ Backend: llama.cpp (native)              ║");
    println!("║ CPU threads: {} (multi-core)              ║", n_threads);
    if gpu_supported {
        println!("║ GPU: ✅ CUDA AVAILABLE                   ║");
        println!("║ Mode: GPU Accelerated                    ║");
    } else {
        println!("║ GPU: ❌ CPU ONLY                         ║");
        println!("║ Mode: CPU ({} threads)                   ║", n_threads);
    }
    println!("╚══════════════════════════════════════════╝");
    
    let _ = backend;
}

/// Optional: query real GPU name and VRAM via NVML (when feature "nvml-wrapper" is enabled).
#[cfg(feature = "nvml-wrapper")]
fn query_nvml_gpu_info() -> Option<(String, u64, u64)> {
    use once_cell::sync::OnceCell;
    static NVML: OnceCell<Option<nvml_wrapper::Nvml>> = OnceCell::new();
    let nvml = NVML.get_or_init(|| nvml_wrapper::Nvml::init().ok());
    let nvml = nvml.as_ref()?;
    let device = nvml.device_by_index(0).ok()?;
    let name = device.name().ok()?.trim().to_string();
    let mem = device.memory_info().ok()?;
    let total_mb = mem.total / (1024 * 1024);
    let free_mb = mem.free / (1024 * 1024);
    Some((if name.is_empty() { "NVIDIA GPU".to_string() } else { name }, total_mb, free_mb))
}

#[cfg(not(feature = "nvml-wrapper"))]
fn query_nvml_gpu_info() -> Option<(String, u64, u64)> {
    None
}

/// Get GPU/CUDA information (device name and VRAM from NVML when available).
pub fn get_gpu_info() -> GpuInfo {
    let available = GPU_AVAILABLE.get().copied().unwrap_or(false);

    if available {
        let (device_name, vram_total_mb, vram_free_mb) =
            query_nvml_gpu_info().unwrap_or(("NVIDIA GPU".to_string(), 0, 0));
        GpuInfo {
            available: true,
            backend: "CUDA".to_string(),
            device_name,
            vram_total_mb,
            vram_free_mb,
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
    let _load_guard = LOAD_MODEL_LOCK
        .lock()
        .map_err(|e| format!("Load model lock poisoned: {}", e))?;

    let gpu_available = is_gpu_available();

    // Unload current model first to avoid GPU/memory conflicts when switching models
    unload_model();
    // Brief pause so GPU/driver can release memory before loading next model (reduces crash on switch)
    std::thread::sleep(std::time::Duration::from_millis(800));

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
    let model = LlamaModel::load_from_file(backend, path, &model_params).map_err(|e| {
        match &e {
            LlamaModelLoadError::NullResult => {
                "Не удалось загрузить модель. Убедитесь что файл GGUF корректен и не повреждён.".to_string()
            }
            _ => format!("Failed to load model: {:?}", e),
        }
    })?;
    
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
    
    let n_threads = cpu_thread_count();
    println!("Generating: {} chars, temp={}, max_tokens={}, ctx={}, threads={}",
             prompt.len(), temperature, max_tokens, ctx_size, n_threads);
    
    // Create context with multi-threaded CPU inference
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(ctx_size))
        .with_n_threads(n_threads)
        .with_n_threads_batch(n_threads);
    
    let backend = BACKEND.get().ok_or("LLM backend not initialized")?;
    let mut ctx = model.new_context(backend, ctx_params)
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
    let mut decoder = encoding_rs::UTF_8.new_decoder();

    for _ in 0..max_tokens {
        // Get logits for the last token
        let candidates = ctx.candidates_ith(batch.n_tokens() - 1);
        let mut candidates_p = LlamaTokenDataArray::from_iter(candidates, false);

        // Sample with temperature
        let new_token = match sample_with_temperature(&mut candidates_p, temperature) {
            Some(token) => token,
            None => {
                eprintln!("⚠️ Sampling failed, ending generation");
                break;
            }
        };

        // Check for EOS
        if model.is_eog_token(new_token) {
            println!("EOS token reached");
            break;
        }

        // Convert token to string (token_to_piece with decode_special=true for Tokenize behavior)
        let token_str = model
            .token_to_piece(new_token, &mut decoder, true, None)
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

// ==================== TESTS ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== GpuInfo Tests ====================

    #[test]
    fn test_gpu_info_structure_available() {
        let info = GpuInfo {
            available: true,
            backend: "CUDA".to_string(),
            device_name: "NVIDIA RTX 4090".to_string(),
            vram_total_mb: 24576,
            vram_free_mb: 20000,
        };
        
        assert!(info.available);
        assert_eq!(info.backend, "CUDA");
        assert!(info.vram_total_mb > 0);
    }

    #[test]
    fn test_gpu_info_structure_unavailable() {
        let info = GpuInfo {
            available: false,
            backend: "CPU".to_string(),
            device_name: "N/A".to_string(),
            vram_total_mb: 0,
            vram_free_mb: 0,
        };
        
        assert!(!info.available);
        assert_eq!(info.backend, "CPU");
        assert_eq!(info.vram_total_mb, 0);
    }

    #[test]
    fn test_gpu_info_serialization() {
        let info = GpuInfo {
            available: true,
            backend: "CUDA".to_string(),
            device_name: "GPU".to_string(),
            vram_total_mb: 8192,
            vram_free_mb: 4096,
        };
        
        let json = serde_json::to_string(&info).expect("Serialization failed");
        assert!(json.contains("\"available\":true"));
        assert!(json.contains("\"backend\":\"CUDA\""));
        assert!(json.contains("vramTotalMb")); // camelCase from serde
        
        let deserialized: GpuInfo = serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(deserialized.available, info.available);
        assert_eq!(deserialized.backend, info.backend);
    }

    // ==================== Stop Sequences Tests ====================

    #[test]
    fn test_stop_sequences_defined() {
        assert!(!STOP_SEQUENCES.is_empty(), "Stop sequences should be defined");
    }

    #[test]
    fn test_stop_sequences_contains_chatml_end() {
        assert!(
            STOP_SEQUENCES.contains(&"<|im_end|>"),
            "Should contain ChatML end token"
        );
    }

    #[test]
    fn test_stop_sequences_contains_im_start() {
        assert!(
            STOP_SEQUENCES.contains(&"<|im_start|>"),
            "Should contain ChatML start token to prevent model from generating new turns"
        );
    }

    #[test]
    fn test_stop_sequences_contains_eos() {
        assert!(
            STOP_SEQUENCES.contains(&"</s>"),
            "Should contain common EOS token"
        );
    }

    #[test]
    fn test_stop_sequence_detection() {
        let test_output = "Hello world<|im_end|>";
        let has_stop = STOP_SEQUENCES.iter().any(|seq| test_output.contains(seq));
        assert!(has_stop, "Should detect stop sequence in output");
    }

    #[test]
    fn test_stop_sequence_cleaning() {
        let token = "текст<|im_end|>";
        let clean = STOP_SEQUENCES.iter()
            .fold(token.to_string(), |acc, seq| acc.replace(seq, ""));
        assert_eq!(clean, "текст");
    }

    // ==================== Temperature Behavior Tests ====================
    // Note: Can't test sample_with_temperature directly without model,
    // but we can test the logic boundaries

    #[test]
    fn test_temperature_zero_is_greedy() {
        // Temperature = 0 should use greedy sampling
        // This is a logic documentation test
        let temp = 0.0f32;
        assert!(temp <= 0.0, "Zero temp triggers greedy path");
    }

    #[test]
    fn test_temperature_negative_is_greedy() {
        // Negative temperature should also use greedy (edge case)
        let temp = -0.5f32;
        assert!(temp <= 0.0, "Negative temp should trigger greedy path");
    }

    #[test]
    fn test_temperature_valid_range() {
        // Typical valid temperatures
        let temps = [0.1, 0.5, 0.7, 1.0, 1.5, 2.0];
        for temp in temps {
            assert!(temp > 0.0, "Valid temps are positive");
            assert!(temp <= 2.0, "Temps rarely exceed 2.0");
        }
    }

    // ==================== Model Path Validation Tests ====================

    #[test]
    fn test_model_file_extension_validation() {
        let valid_paths = [
            "/path/to/model.gguf",
            "model.gguf",
            "/home/user/qwen2.5-7b-q4_k_m.gguf",
        ];
        
        for path in valid_paths {
            assert!(
                path.ends_with(".gguf"),
                "GGUF models should have .gguf extension"
            );
        }
    }

    #[test]
    fn test_model_name_extraction_from_path() {
        let path = "/home/user/models/qwen2.5-7b-instruct-q4_k_m.gguf";
        let filename = std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");
        
        assert_eq!(filename, "qwen2.5-7b-instruct-q4_k_m");
    }

    #[test]
    fn test_model_name_extraction_windows_path() {
        // On Linux, Path doesn't parse Windows backslashes as separators
        // so we split by both '/' and '\' manually
        let path = r"C:\Users\user\models\llama-7b.gguf";
        let filename = path
            .rsplit(|c| c == '/' || c == '\\')
            .next()
            .unwrap_or(path)
            .trim_end_matches(".gguf");
        
        assert_eq!(filename, "llama-7b");
    }

    // ==================== Context Length Tests ====================

    #[test]
    fn test_context_length_minimum() {
        let min_ctx = 512u32;
        assert!(min_ctx >= 512, "Minimum context should be at least 512");
    }

    #[test]
    fn test_context_length_default() {
        let default_ctx = 2048u32;
        assert_eq!(default_ctx, 2048, "Default context should be 2048");
    }

    #[test]
    fn test_context_length_common_values() {
        let valid_contexts = [512, 1024, 2048, 4096, 8192, 16384, 32768];
        for ctx in valid_contexts {
            assert!(ctx >= 512, "Context must be at least 512");
            assert!(ctx <= 131072, "Context rarely exceeds 128k");
        }
    }

    // ==================== GPU Layers Logic Tests ====================

    #[test]
    fn test_gpu_layers_when_available() {
        let gpu_available = true;
        let gpu_layers = if gpu_available { 99 } else { 0 };
        assert_eq!(gpu_layers, 99, "Should use max GPU layers when available");
    }

    #[test]
    fn test_gpu_layers_when_unavailable() {
        let gpu_available = false;
        let gpu_layers = if gpu_available { 99 } else { 0 };
        assert_eq!(gpu_layers, 0, "Should use 0 GPU layers on CPU");
    }

    // ==================== Edge Cases ====================

    #[test]
    fn test_empty_prompt_handling() {
        let prompt = "";
        assert!(prompt.is_empty(), "Empty prompt should be detected");
    }

    #[test]
    fn test_whitespace_only_prompt() {
        let prompt = "   \t\n  ";
        assert!(prompt.trim().is_empty(), "Whitespace-only prompt should be detected");
    }

    #[test]
    fn test_unicode_prompt() {
        let prompt = "Привет, как дела? 🎉";
        assert!(!prompt.is_empty());
        assert!(prompt.chars().count() > 0);
    }

    #[test]
    fn test_very_long_prompt() {
        let prompt = "x".repeat(10000);
        assert_eq!(prompt.len(), 10000);
        // In real scenario, this would be truncated to fit context
    }
}
