//! HuggingFace Hub integration for downloading GGUF models
//!
//! Provides functionality to browse and download GGUF models from HuggingFace Hub.
//! Uses the hf-hub crate for API interactions and caching.

use hf_hub::api::sync::{Api, ApiRepo};
use hf_hub::Repo;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

/// Information about a model file on HuggingFace Hub
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HfModelFile {
    /// Filename (e.g., "model-q4_k_m.gguf")
    pub filename: String,
    /// File size in bytes
    pub size: u64,
    /// Size formatted as string (e.g., "4.5 GB")
    pub size_formatted: String,
    /// Quantization type extracted from filename (e.g., "Q4_K_M")
    pub quant_type: Option<String>,
}

/// Popular model repository information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopularModel {
    /// Repository ID (e.g., "TheBloke/Qwen2.5-7B-Instruct-GGUF")
    pub repo_id: String,
    /// Display name
    pub name: String,
    /// Short description
    pub description: String,
    /// Category (e.g., "chat", "code", "multilingual")
    pub category: String,
    /// Recommended quantization
    pub recommended_quant: String,
}

/// Download progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    /// Repository ID
    pub repo_id: String,
    /// Filename being downloaded
    pub filename: String,
    /// Downloaded bytes
    pub downloaded: u64,
    /// Total file size
    pub total: u64,
    /// Progress percentage (0-100)
    pub percent: f32,
    /// Download speed in bytes/sec
    pub speed: u64,
    /// Is download complete
    pub complete: bool,
    /// Error message if failed
    pub error: Option<String>,
}

/// Shared download state for progress tracking
pub struct DownloadState {
    pub downloaded: AtomicU64,
    pub total: AtomicU64,
    pub cancelled: AtomicBool,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            downloaded: AtomicU64::new(0),
            total: AtomicU64::new(0),
            cancelled: AtomicBool::new(false),
        }
    }
}

/// Progress tracker implementing hf_hub Progress trait
pub struct ProgressTracker {
    state: Arc<DownloadState>,
}

impl ProgressTracker {
    pub fn new(state: Arc<DownloadState>) -> Self {
        Self { state }
    }
}

impl hf_hub::api::Progress for ProgressTracker {
    fn init(&mut self, size: usize, _filename: &str) {
        self.state.total.store(size as u64, Ordering::SeqCst);
        self.state.downloaded.store(0, Ordering::SeqCst);
    }

    fn update(&mut self, size: usize) {
        self.state.downloaded.fetch_add(size as u64, Ordering::SeqCst);
    }

    fn finish(&mut self) {
        // Download complete
    }
}

/// Format bytes to human-readable string
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Extract quantization type from filename
fn extract_quant_type(filename: &str) -> Option<String> {
    let lower = filename.to_lowercase();
    
    // Common GGUF quantization patterns
    let quant_patterns = [
        "q2_k", "q3_k_s", "q3_k_m", "q3_k_l",
        "q4_0", "q4_1", "q4_k_s", "q4_k_m",
        "q5_0", "q5_1", "q5_k_s", "q5_k_m",
        "q6_k", "q8_0", "f16", "f32",
        "iq2_xxs", "iq2_xs", "iq2_s", "iq2_m",
        "iq3_xxs", "iq3_xs", "iq3_s", "iq3_m",
        "iq4_nl", "iq4_xs",
    ];
    
    for pattern in quant_patterns {
        if lower.contains(pattern) {
            return Some(pattern.to_uppercase());
        }
    }
    
    None
}

/// Get HuggingFace API instance
fn get_api() -> Result<Api, String> {
    Api::new().map_err(|e| format!("Failed to initialize HuggingFace API: {:?}", e))
}

/// Get repository API handle
fn get_repo(repo_id: &str) -> Result<ApiRepo, String> {
    let api = get_api()?;
    let repo = Repo::model(repo_id.to_string());
    Ok(api.repo(repo))
}

/// List GGUF files in a HuggingFace repository
/// 
/// # Arguments
/// * `repo_id` - Repository ID (e.g., "TheBloke/Llama-2-7B-GGUF")
/// 
/// # Returns
/// List of GGUF model files with metadata
pub fn list_gguf_files(repo_id: &str) -> Result<Vec<HfModelFile>, String> {
    println!("📦 Fetching GGUF files from: {}", repo_id);
    
    let api = get_api()?;
    let repo = Repo::model(repo_id.to_string());
    let api_repo = api.repo(repo);
    
    // Get repository info
    let info = api_repo.info()
        .map_err(|e| format!("Failed to get repo info: {:?}", e))?;
    
    // Filter for GGUF files (hf-hub 0.4 Siblings only has rfilename, no size in API)
    let gguf_files: Vec<HfModelFile> = info.siblings
        .into_iter()
        .filter(|f| f.rfilename.to_lowercase().ends_with(".gguf"))
        .map(|f| {
            let size = 0u64;
            HfModelFile {
                filename: f.rfilename.clone(),
                size,
                size_formatted: "—".to_string(),
                quant_type: extract_quant_type(&f.rfilename),
            }
        })
        .collect();
    
    println!("✅ Found {} GGUF files", gguf_files.len());
    Ok(gguf_files)
}

/// Download a model file from HuggingFace Hub
/// 
/// # Arguments
/// * `repo_id` - Repository ID
/// * `filename` - File to download
/// * `state` - Shared state for progress tracking
/// 
/// # Returns
/// Local path to the downloaded file
pub fn download_model(
    repo_id: &str,
    filename: &str,
    state: Arc<DownloadState>,
) -> Result<PathBuf, String> {
    println!("⬇️ Downloading: {}/{}", repo_id, filename);
    
    let api_repo = get_repo(repo_id)?;
    let progress = ProgressTracker::new(state.clone());
    
    let path = api_repo.download_with_progress(filename, progress)
        .map_err(|e| format!("Download failed: {:?}", e))?;
    
    println!("✅ Downloaded to: {:?}", path);
    Ok(path)
}

/// Get download progress from shared state
pub fn get_progress(state: &DownloadState) -> (u64, u64, f32) {
    let downloaded = state.downloaded.load(Ordering::SeqCst);
    let total = state.total.load(Ordering::SeqCst);
    let percent = if total > 0 {
        (downloaded as f64 / total as f64 * 100.0) as f32
    } else {
        0.0
    };
    (downloaded, total, percent)
}

/// Get list of popular GGUF model repositories
pub fn get_popular_models() -> Vec<PopularModel> {
    vec![
        // ==================== AWQ-GGUF (конвертированные из AWQ) ====================
        PopularModel {
            repo_id: "pomelk1n/RuadaptQwen2.5-32B-instruct-4-bit-AWQ-GGUF".to_string(),
            name: "RuadaptQwen 32B AWQ".to_string(),
            description: "🇷🇺 Адаптирован для русского, AWQ→GGUF 4bit".to_string(),
            category: "awq".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "straino/Qwen3-Coder-30B-A3B-Instruct-AWQ-4bit-Q4_K_M-GGUF".to_string(),
            name: "Qwen3 Coder 30B AWQ".to_string(),
            description: "💻 MoE кодер AWQ→GGUF, отличный для кода".to_string(),
            category: "awq".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "NexaAI/Octopus-v2-gguf-awq".to_string(),
            name: "Octopus v2 AWQ".to_string(),
            description: "📱 Компактная Gemma-2B AWQ для мобильных".to_string(),
            category: "awq".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        
        // ==================== Multilingual / Russian ====================
        PopularModel {
            repo_id: "Qwen/Qwen2.5-7B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 7B Instruct".to_string(),
            description: "Лучший для русского языка, 128K контекст".to_string(),
            category: "multilingual".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "Qwen/Qwen2.5-3B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 3B Instruct".to_string(),
            description: "Компактная версия для слабых GPU".to_string(),
            category: "multilingual".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "Qwen/Qwen2.5-14B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 14B Instruct".to_string(),
            description: "Мощная версия, нужно 12+ GB VRAM".to_string(),
            category: "multilingual".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        
        // ==================== Code ====================
        PopularModel {
            repo_id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 Coder 7B".to_string(),
            description: "Специализированная для кода".to_string(),
            category: "code".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 Coder 14B".to_string(),
            description: "Мощный кодер, нужно 10+ GB VRAM".to_string(),
            category: "code".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF".to_string(),
            name: "DeepSeek Coder V2 Lite".to_string(),
            description: "Отличная для программирования".to_string(),
            category: "code".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        
        // ==================== Compact / Fast ====================
        PopularModel {
            repo_id: "Qwen/Qwen2.5-1.5B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 1.5B Instruct".to_string(),
            description: "Ультра-компактная, работает везде".to_string(),
            category: "compact".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF".to_string(),
            name: "Qwen 2.5 Coder 1.5B".to_string(),
            description: "Мини-кодер, быстрый и лёгкий".to_string(),
            category: "compact".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "microsoft/Phi-4-mini-instruct-gguf".to_string(),
            name: "Phi-4 Mini".to_string(),
            description: "Компактная от Microsoft".to_string(),
            category: "compact".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        
        // ==================== General / Long context ====================
        PopularModel {
            repo_id: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF".to_string(),
            name: "Llama 3.1 8B Instruct".to_string(),
            description: "128K контекст от Meta".to_string(),
            category: "general".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "bartowski/Mistral-Nemo-Instruct-2407-GGUF".to_string(),
            name: "Mistral Nemo 12B".to_string(),
            description: "Отличный баланс качества и скорости".to_string(),
            category: "general".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
        PopularModel {
            repo_id: "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF".to_string(),
            name: "Qwen3 4B Instruct".to_string(),
            description: "Новейшая Qwen3, отличное качество".to_string(),
            category: "general".to_string(),
            recommended_quant: "Q4_K_M".to_string(),
        },
    ]
}

/// Get models directory (creates if not exists)
pub fn get_models_dir() -> Result<PathBuf, String> {
    let data_dir = dirs::data_local_dir()
        .ok_or("Cannot find local data directory")?;
    let models_dir = data_dir.join("wishmaster").join("models");
    
    if !models_dir.exists() {
        std::fs::create_dir_all(&models_dir)
            .map_err(|e| format!("Failed to create models directory: {}", e))?;
    }
    
    Ok(models_dir)
}

// ==================== TESTS ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_size_bytes() {
        assert_eq!(format_size(500), "500 B");
    }

    #[test]
    fn test_format_size_kb() {
        assert_eq!(format_size(2048), "2 KB");
    }

    #[test]
    fn test_format_size_mb() {
        assert_eq!(format_size(1024 * 1024 * 5), "5.0 MB");
    }

    #[test]
    fn test_format_size_gb() {
        assert_eq!(format_size(1024 * 1024 * 1024 * 4), "4.00 GB");
    }

    #[test]
    fn test_extract_quant_q4_k_m() {
        let filename = "qwen2.5-7b-instruct-q4_k_m.gguf";
        assert_eq!(extract_quant_type(filename), Some("Q4_K_M".to_string()));
    }

    #[test]
    fn test_extract_quant_q5_k_s() {
        let filename = "model-Q5_K_S.gguf";
        assert_eq!(extract_quant_type(filename), Some("Q5_K_S".to_string()));
    }

    #[test]
    fn test_extract_quant_f16() {
        let filename = "model-f16.gguf";
        assert_eq!(extract_quant_type(filename), Some("F16".to_string()));
    }

    #[test]
    fn test_extract_quant_none() {
        let filename = "model.gguf";
        assert_eq!(extract_quant_type(filename), None);
    }

    #[test]
    fn test_popular_models_not_empty() {
        let models = get_popular_models();
        assert!(!models.is_empty());
    }

    #[test]
    fn test_popular_models_have_qwen() {
        let models = get_popular_models();
        let has_qwen = models.iter().any(|m| m.name.contains("Qwen"));
        assert!(has_qwen, "Should have Qwen model");
    }

    #[test]
    fn test_download_state_initialization() {
        let state = DownloadState::new();
        assert_eq!(state.downloaded.load(Ordering::SeqCst), 0);
        assert_eq!(state.total.load(Ordering::SeqCst), 0);
        assert!(!state.cancelled.load(Ordering::SeqCst));
    }

    #[test]
    fn test_progress_calculation() {
        let state = DownloadState::new();
        state.total.store(1000, Ordering::SeqCst);
        state.downloaded.store(500, Ordering::SeqCst);
        
        let (downloaded, total, percent) = get_progress(&state);
        assert_eq!(downloaded, 500);
        assert_eq!(total, 1000);
        assert!((percent - 50.0).abs() < 0.1);
    }

    #[test]
    fn test_hf_model_file_serialization() {
        let file = HfModelFile {
            filename: "model-q4_k_m.gguf".to_string(),
            size: 4 * 1024 * 1024 * 1024,
            size_formatted: "4.00 GB".to_string(),
            quant_type: Some("Q4_K_M".to_string()),
        };
        
        let json = serde_json::to_string(&file).unwrap();
        assert!(json.contains("\"filename\""));
        assert!(json.contains("\"sizeFormatted\"")); // camelCase
    }
}
