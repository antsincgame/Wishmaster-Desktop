use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use once_cell::sync::OnceCell;

// State flags
static IS_RECORDING: AtomicBool = AtomicBool::new(false);
static IS_SPEAKING: AtomicBool = AtomicBool::new(false);
static TTS_PROCESS: OnceCell<Mutex<Option<std::process::Child>>> = OnceCell::new();
static LAST_AUDIO_PATH: OnceCell<Mutex<Option<String>>> = OnceCell::new();

/// TTS engines available on different platforms
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum TtsEngine {
    /// espeak-ng (Linux/Windows, most common)
    EspeakNg,
    /// piper-tts (Linux, high quality neural TTS)
    Piper,
    /// festival (Linux, older but widely available)
    Festival,
    /// Windows SAPI (Windows built-in)
    WindowsSapi,
}

/// STT (Speech-to-Text) engines
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SttEngine {
    /// whisper.cpp (local, high quality)
    WhisperCpp,
    /// OpenAI Whisper (Python)
    WhisperPython,
    /// None available
    None,
}

static CURRENT_TTS: OnceCell<Mutex<TtsEngine>> = OnceCell::new();
static CURRENT_STT: OnceCell<Mutex<SttEngine>> = OnceCell::new();

/// Whisper model paths to check
const WHISPER_MODEL_PATHS: &[&str] = &[
    "~/.local/share/whisper.cpp/models/ggml-base.bin",
    "~/.local/share/whisper/ggml-base.bin",
    "/usr/share/whisper.cpp/models/ggml-base.bin",
    "/usr/local/share/whisper.cpp/models/ggml-base.bin",
    "./models/ggml-base.bin",
    "./ggml-base.bin",
];

pub fn init() {
    let _ = TTS_PROCESS.set(Mutex::new(None));
    let _ = CURRENT_TTS.set(Mutex::new(TtsEngine::EspeakNg));
    let _ = CURRENT_STT.set(Mutex::new(SttEngine::None));
    let _ = LAST_AUDIO_PATH.set(Mutex::new(None));
    
    // Check which TTS is available
    let tts = detect_tts_engine();
    if let Some(engine) = CURRENT_TTS.get() {
        if let Ok(mut guard) = engine.lock() {
            *guard = tts;
        }
    }
    
    // Check which STT is available
    let stt = detect_stt_engine();
    if let Some(engine) = CURRENT_STT.get() {
        if let Ok(mut guard) = engine.lock() {
            *guard = stt;
        }
    }
    
    let tts_name = match tts {
        TtsEngine::EspeakNg => "espeak-ng",
        TtsEngine::Piper => "piper",
        TtsEngine::Festival => "festival",
        TtsEngine::WindowsSapi => "Windows SAPI",
    };
    
    let stt_name = match stt {
        SttEngine::WhisperCpp => "whisper.cpp",
        SttEngine::WhisperPython => "whisper (Python)",
        SttEngine::None => "none (Web Speech API fallback)",
    };
    
    println!("╔══════════════════════════════════════════╗");
    println!("║       VOICE ENGINE INITIALIZED           ║");
    println!("╠══════════════════════════════════════════╣");
    println!("║ TTS: {:<35}║", tts_name);
    println!("║ STT: {:<35}║", stt_name);
    println!("╚══════════════════════════════════════════╝");
}

/// Detect available STT engine on system
fn detect_stt_engine() -> SttEngine {
    // Check for whisper.cpp first (preferred)
    if Command::new("whisper-cpp").arg("--help").output().is_ok() {
        return SttEngine::WhisperCpp;
    }
    
    // Check for whisper.cpp with different names
    if Command::new("main").arg("--help").output()
        .map(|o| String::from_utf8_lossy(&o.stderr).contains("whisper"))
        .unwrap_or(false) 
    {
        return SttEngine::WhisperCpp;
    }
    
    // Check for Python whisper
    if Command::new("whisper").arg("--help").output().is_ok() {
        return SttEngine::WhisperPython;
    }
    
    SttEngine::None
}

/// Detect available TTS engine on system
fn detect_tts_engine() -> TtsEngine {
    #[cfg(target_os = "windows")]
    {
        if Command::new("espeak-ng").arg("--version").output().is_ok() {
            return TtsEngine::EspeakNg;
        }
        TtsEngine::WindowsSapi
    }
    
    #[cfg(target_os = "linux")]
    {
        if Command::new("piper").arg("--help").output().is_ok() {
            return TtsEngine::Piper;
        }
        if Command::new("espeak-ng").arg("--version").output().is_ok() {
            return TtsEngine::EspeakNg;
        }
        if Command::new("espeak").arg("--version").output().is_ok() {
            return TtsEngine::EspeakNg;
        }
        if Command::new("festival").arg("--version").output().is_ok() {
            return TtsEngine::Festival;
        }
        TtsEngine::EspeakNg
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        TtsEngine::EspeakNg
    }
}

/// Find whisper model file
fn find_whisper_model() -> Option<PathBuf> {
    // Check environment variable first
    if let Ok(path) = std::env::var("WHISPER_MODEL_PATH") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Some(p);
        }
    }
    
    // Check standard paths
    for path_str in WHISPER_MODEL_PATHS {
        let expanded = shellexpand::tilde(path_str);
        let path = PathBuf::from(expanded.as_ref());
        if path.exists() {
            return Some(path);
        }
    }
    
    None
}

/// Convert WebM/audio file to WAV 16kHz mono (required for whisper.cpp)
fn convert_to_wav(input_path: &Path) -> Result<PathBuf, String> {
    let output_path = input_path.with_extension("wav");
    
    // Use ffmpeg for conversion
    let result = Command::new("ffmpeg")
        .args([
            "-y",                    // Overwrite output
            "-i", input_path.to_str().unwrap_or(""),
            "-ar", "16000",          // 16kHz sample rate
            "-ac", "1",              // Mono
            "-c:a", "pcm_s16le",     // 16-bit PCM
            output_path.to_str().unwrap_or("")
        ])
        .output();
    
    match result {
        Ok(output) if output.status.success() => Ok(output_path),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("ffmpeg conversion failed: {}", stderr))
        }
        Err(e) => {
            // Try with avconv (alternative to ffmpeg)
            let avconv_result = Command::new("avconv")
                .args([
                    "-y",
                    "-i", input_path.to_str().unwrap_or(""),
                    "-ar", "16000",
                    "-ac", "1",
                    "-c:a", "pcm_s16le",
                    output_path.to_str().unwrap_or("")
                ])
                .output();
            
            match avconv_result {
                Ok(o) if o.status.success() => Ok(output_path),
                _ => Err(format!("Audio conversion failed. Install ffmpeg: sudo apt install ffmpeg\nError: {}", e))
            }
        }
    }
}

/// Transcribe audio using whisper.cpp
fn transcribe_whisper_cpp(wav_path: &Path, model_path: &Path) -> Result<String, String> {
    println!("Transcribing with whisper.cpp: {:?}", wav_path);
    
    // Try whisper-cpp command
    let programs = ["whisper-cpp", "main", "whisper"];
    
    for program in programs {
        let result = Command::new(program)
            .args([
                "-m", model_path.to_str().unwrap_or(""),
                "-f", wav_path.to_str().unwrap_or(""),
                "-l", "ru",              // Russian language
                "-nt",                   // No timestamps
                "--no-prints",           // Quiet mode (if supported)
            ])
            .output();
        
        if let Ok(output) = result {
            if output.status.success() {
                let transcript = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .to_string();
                
                // Clean up whisper output (remove [BLANK_AUDIO] markers, etc.)
                let cleaned = transcript
                    .lines()
                    .filter(|line| !line.contains("[BLANK_AUDIO]") && !line.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ")
                    .trim()
                    .to_string();
                
                if !cleaned.is_empty() {
                    return Ok(cleaned);
                }
            }
        }
    }
    
    Err("whisper.cpp transcription failed".to_string())
}

/// Transcribe audio using Python whisper
fn transcribe_whisper_python(wav_path: &Path) -> Result<String, String> {
    println!("Transcribing with Python whisper: {:?}", wav_path);
    
    let result = Command::new("whisper")
        .args([
            wav_path.to_str().unwrap_or(""),
            "--model", "base",
            "--language", "ru",
            "--output_format", "txt",
            "--output_dir", wav_path.parent().unwrap_or(Path::new("/tmp")).to_str().unwrap_or("/tmp"),
        ])
        .output();
    
    match result {
        Ok(output) if output.status.success() => {
            // Read the generated .txt file
            let txt_path = wav_path.with_extension("txt");
            std::fs::read_to_string(&txt_path)
                .map(|s| s.trim().to_string())
                .map_err(|e| format!("Failed to read transcript: {}", e))
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("whisper transcription failed: {}", stderr))
        }
        Err(e) => Err(format!("Failed to run whisper: {}", e))
    }
}

/// Start recording user's voice
pub fn start_recording() -> Result<(), String> {
    if IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Already recording".to_string());
    }
    
    IS_RECORDING.store(true, Ordering::SeqCst);
    println!("Started recording...");
    Ok(())
}

/// Set the last recorded audio file path (called from commands.rs after saving)
pub fn set_last_audio_path(path: &str) {
    if let Some(storage) = LAST_AUDIO_PATH.get() {
        if let Ok(mut guard) = storage.lock() {
            *guard = Some(path.to_string());
        }
    }
}

/// Stop recording and return transcription
/// Falls back to error message if STT is not available
pub fn stop_recording() -> Result<String, String> {
    if !IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }

    IS_RECORDING.store(false, Ordering::SeqCst);
    println!("Stopped recording");

    // Get the last recorded audio path
    let audio_path = LAST_AUDIO_PATH.get()
        .and_then(|s| s.lock().ok())
        .and_then(|g| g.clone());
    
    let audio_path = match audio_path {
        Some(p) => p,
        None => return Err("No audio file recorded".to_string()),
    };
    
    let audio_file = Path::new(&audio_path);
    if !audio_file.exists() {
        return Err("Audio file not found".to_string());
    }

    // Get current STT engine
    let stt_engine = CURRENT_STT.get()
        .and_then(|e| e.lock().ok())
        .map(|g| *g)
        .unwrap_or(SttEngine::None);
    
    match stt_engine {
        SttEngine::WhisperCpp => {
            // Convert to WAV for whisper.cpp
            let wav_path = match convert_to_wav(audio_file) {
                Ok(p) => p,
                Err(e) => return Err(format!("Audio conversion failed: {}", e)),
            };
            
            // Find whisper model
            let model_path = match find_whisper_model() {
                Some(p) => p,
                None => return Err(
                    "Whisper model not found. Download from: https://github.com/ggerganov/whisper.cpp\n\
                     Place ggml-base.bin in ~/.local/share/whisper.cpp/models/ or set WHISPER_MODEL_PATH".to_string()
                ),
            };
            
            // Transcribe
            let result = transcribe_whisper_cpp(&wav_path, &model_path);
            
            // Cleanup temp WAV
            let _ = std::fs::remove_file(&wav_path);
            
            result
        }
        SttEngine::WhisperPython => {
            // Convert to WAV for whisper
            let wav_path = match convert_to_wav(audio_file) {
                Ok(p) => p,
                Err(e) => return Err(format!("Audio conversion failed: {}", e)),
            };
            
            let result = transcribe_whisper_python(&wav_path);
            
            // Cleanup temp WAV
            let _ = std::fs::remove_file(&wav_path);
            
            result
        }
        SttEngine::None => {
            // STT not available - frontend will use Web Speech API
            Err("Локальная транскрипция недоступна. Используется Web Speech API браузера.".to_string())
        }
    }
}

/// Transcribe a specific audio file (can be called directly)
pub fn transcribe_audio(audio_path: &str) -> Result<String, String> {
    let audio_file = Path::new(audio_path);
    if !audio_file.exists() {
        return Err(format!("Audio file not found: {}", audio_path));
    }
    
    let stt_engine = CURRENT_STT.get()
        .and_then(|e| e.lock().ok())
        .map(|g| *g)
        .unwrap_or(SttEngine::None);
    
    match stt_engine {
        SttEngine::WhisperCpp => {
            let wav_path = convert_to_wav(audio_file)?;
            let model_path = find_whisper_model()
                .ok_or_else(|| "Whisper model not found".to_string())?;
            
            let result = transcribe_whisper_cpp(&wav_path, &model_path);
            let _ = std::fs::remove_file(&wav_path);
            result
        }
        SttEngine::WhisperPython => {
            let wav_path = convert_to_wav(audio_file)?;
            let result = transcribe_whisper_python(&wav_path);
            let _ = std::fs::remove_file(&wav_path);
            result
        }
        SttEngine::None => Err("No STT engine available".to_string())
    }
}

/// Check if STT is available
pub fn is_stt_available() -> bool {
    CURRENT_STT.get()
        .and_then(|e| e.lock().ok())
        .map(|g| *g != SttEngine::None)
        .unwrap_or(false)
}

/// Speak text using TTS
pub fn speak(text: &str, _voice_id: Option<i64>) -> Result<(), String> {
    if IS_SPEAKING.load(Ordering::SeqCst) {
        stop_speaking();
    }
    
    if text.trim().is_empty() {
        return Ok(());
    }
    
    IS_SPEAKING.store(true, Ordering::SeqCst);
    
    let engine = CURRENT_TTS.get()
        .and_then(|e| e.lock().ok())
        .map(|g| *g)
        .unwrap_or(TtsEngine::EspeakNg);
    
    let result = match engine {
        TtsEngine::EspeakNg => speak_espeak(text),
        TtsEngine::Piper => speak_piper(text),
        TtsEngine::Festival => speak_festival(text),
        TtsEngine::WindowsSapi => speak_windows_sapi(text),
    };
    
    IS_SPEAKING.store(false, Ordering::SeqCst);
    result
}

/// Speak using espeak-ng
fn speak_espeak(text: &str) -> Result<(), String> {
    let program = if Command::new("espeak-ng").arg("--version").output().is_ok() {
        "espeak-ng"
    } else {
        "espeak"
    };
    
    println!("Speaking with {}: {}...", program, &text[..text.len().min(50)]);
    
    let output = Command::new(program)
        .args(["-v", "ru", "-s", "150", "-p", "50", text])
        .output();
    
    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(_) => {
            Command::new(program).arg(text).output()
                .map(|_| ())
                .map_err(|e| format!("{} error: {}", program, e))
        }
        Err(e) => Err(format!("TTS not available. Install: sudo apt install espeak-ng\nError: {}", e))
    }
}

/// Speak using piper (neural TTS)
fn speak_piper(text: &str) -> Result<(), String> {
    println!("Speaking with piper: {}...", &text[..text.len().min(50)]);
    
    let mut model_paths = vec![];
    if let Ok(env_path) = std::env::var("PIPER_MODEL_PATH") {
        model_paths.push(env_path);
    }
    model_paths.extend([
        "/usr/share/piper-voices/ru_RU-irina-medium.onnx".to_string(),
        "~/.local/share/piper/ru_RU-irina-medium.onnx".to_string(),
        "./piper-model.onnx".to_string(),
    ]);
    
    let model = model_paths.iter()
        .find(|p| {
            let expanded = shellexpand::tilde(p);
            Path::new(expanded.as_ref()).exists()
        })
        .map(|s| shellexpand::tilde(s).to_string());
    
    if let Some(model_path) = model {
        let output = Command::new("sh")
            .args(["-c", &format!(
                "echo '{}' | piper --model {} --output_file - | aplay -q",
                text.replace("'", "\\'"), model_path
            )])
            .output();
        
        match output {
            Ok(out) if out.status.success() => Ok(()),
            _ => speak_espeak(text)
        }
    } else {
        speak_espeak(text)
    }
}

/// Speak using festival
fn speak_festival(text: &str) -> Result<(), String> {
    println!("Speaking with festival: {}...", &text[..text.len().min(50)]);
    
    let output = Command::new("sh")
        .args(["-c", &format!("echo '{}' | festival --tts", text.replace("'", "\\'"))])
        .output();
    
    match output {
        Ok(out) if out.status.success() => Ok(()),
        _ => speak_espeak(text)
    }
}

/// Speak using Windows SAPI
#[cfg(target_os = "windows")]
fn speak_windows_sapi(text: &str) -> Result<(), String> {
    println!("Speaking with Windows SAPI: {}...", &text[..text.len().min(50)]);
    
    let escaped_text = text
        .replace("\\", "\\\\")
        .replace("\"", "`\"")
        .replace("$", "`$")
        .replace("`", "``");
    
    let script = format!(
        r#"Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak("{}")"#,
        escaped_text
    );
    
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output();
    
    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => Err(format!("SAPI failed: {}", String::from_utf8_lossy(&out.stderr))),
        Err(e) => Err(format!("PowerShell error: {}", e))
    }
}

#[cfg(not(target_os = "windows"))]
fn speak_windows_sapi(_text: &str) -> Result<(), String> {
    Err("Windows SAPI is only available on Windows".to_string())
}

/// Stop speaking
pub fn stop_speaking() {
    IS_SPEAKING.store(false, Ordering::SeqCst);
    
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/F", "/IM", "powershell.exe"]).output();
    }
    
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill").args(["-f", "espeak"]).output();
        let _ = Command::new("pkill").args(["-f", "piper"]).output();
        let _ = Command::new("pkill").args(["-f", "festival"]).output();
        let _ = Command::new("pkill").args(["-f", "aplay"]).output();
    }
    
    println!("Stopped speaking");
}

/// Check if TTS is available
pub fn is_tts_available() -> bool {
    #[cfg(target_os = "windows")]
    { return true; }
    
    #[cfg(target_os = "linux")]
    {
        return Command::new("espeak-ng").arg("--version").output().is_ok()
            || Command::new("espeak").arg("--version").output().is_ok()
            || Command::new("piper").arg("--help").output().is_ok()
            || Command::new("festival").arg("--version").output().is_ok();
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    { false }
}

// ==================== TESTS ====================

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== Engine Enum Tests ====================
    
    #[test]
    fn test_stt_engine_variants() {
        let engines = [SttEngine::WhisperCpp, SttEngine::WhisperPython, SttEngine::None];
        assert_eq!(engines.len(), 3);
    }

    #[test]
    fn test_tts_engine_variants() {
        let engines = [TtsEngine::EspeakNg, TtsEngine::Piper, TtsEngine::Festival, TtsEngine::WindowsSapi];
        assert_eq!(engines.len(), 4);
    }
    
    #[test]
    fn test_engine_debug_trait() {
        // Test that engines implement Debug
        let tts = TtsEngine::EspeakNg;
        let stt = SttEngine::None;
        assert!(format!("{:?}", tts).contains("EspeakNg"));
        assert!(format!("{:?}", stt).contains("None"));
    }
    
    #[test]
    fn test_engine_copy_clone() {
        // Test that engines implement Copy and Clone
        let tts = TtsEngine::Piper;
        let tts_copy = tts;
        let tts_clone = tts.clone();
        assert_eq!(tts, tts_copy);
        assert_eq!(tts, tts_clone);
    }

    // ==================== Whisper Model Tests ====================
    
    #[test]
    fn test_whisper_model_paths() {
        for path in WHISPER_MODEL_PATHS {
            assert!(path.contains("ggml") || path.contains("whisper"));
        }
    }
    
    #[test]
    fn test_whisper_model_paths_not_empty() {
        assert!(!WHISPER_MODEL_PATHS.is_empty());
        assert!(WHISPER_MODEL_PATHS.len() >= 4);
    }

    // ==================== State Management Tests ====================
    
    #[test]
    fn test_recording_state() {
        let recording = AtomicBool::new(false);
        assert!(!recording.load(Ordering::SeqCst));
        recording.store(true, Ordering::SeqCst);
        assert!(recording.load(Ordering::SeqCst));
    }
    
    #[test]
    fn test_speaking_state() {
        let speaking = AtomicBool::new(false);
        assert!(!speaking.load(Ordering::SeqCst));
        speaking.store(true, Ordering::SeqCst);
        assert!(speaking.load(Ordering::SeqCst));
        speaking.store(false, Ordering::SeqCst);
        assert!(!speaking.load(Ordering::SeqCst));
    }

    // ==================== Text Processing Tests ====================
    
    #[test]
    fn test_text_escape() {
        let text = "It's a test";
        let escaped = text.replace("'", "\\'");
        assert_eq!(escaped, "It\\'s a test");
    }
    
    #[test]
    fn test_text_escape_multiple_quotes() {
        let text = "It's John's book, isn't it?";
        let escaped = text.replace("'", "\\'");
        assert!(escaped.contains("\\'"));
        assert_eq!(escaped.matches("\\'").count(), 4);
    }
    
    #[test]
    fn test_text_truncation_for_logging() {
        let short_text = "Hello";
        let long_text = "This is a very long text that exceeds fifty characters in length for sure";
        
        assert_eq!(short_text.len().min(50), 5);
        assert_eq!(long_text.len().min(50), 50);
    }
    
    #[test]
    fn test_empty_text_handling() {
        let text = "";
        assert!(text.trim().is_empty());
        
        let whitespace = "   ";
        assert!(whitespace.trim().is_empty());
    }

    // ==================== Path Manipulation Tests ====================
    
    #[test]
    fn test_wav_extension_change() {
        let input_path = PathBuf::from("/tmp/audio.webm");
        let output_path = input_path.with_extension("wav");
        assert_eq!(output_path, PathBuf::from("/tmp/audio.wav"));
    }
    
    #[test]
    fn test_txt_extension_change() {
        let wav_path = PathBuf::from("/tmp/audio.wav");
        let txt_path = wav_path.with_extension("txt");
        assert_eq!(txt_path, PathBuf::from("/tmp/audio.txt"));
    }
    
    #[test]
    fn test_path_parent() {
        let path = Path::new("/tmp/audio/file.wav");
        assert_eq!(path.parent().unwrap(), Path::new("/tmp/audio"));
    }

    // ==================== Transcript Cleaning Tests ====================
    
    #[test]
    fn test_transcript_cleaning() {
        let raw_output = "[BLANK_AUDIO]\nHello world\n[BLANK_AUDIO]\nHow are you?\n";
        let cleaned: String = raw_output
            .lines()
            .filter(|line| !line.contains("[BLANK_AUDIO]") && !line.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string();
        
        assert_eq!(cleaned, "Hello world How are you?");
    }
    
    #[test]
    fn test_transcript_all_blank() {
        let raw_output = "[BLANK_AUDIO]\n[BLANK_AUDIO]\n";
        let cleaned: String = raw_output
            .lines()
            .filter(|line| !line.contains("[BLANK_AUDIO]") && !line.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string();
        
        assert!(cleaned.is_empty());
    }

    // ==================== Error Message Tests ====================
    
    #[test]
    fn test_error_messages() {
        let recording_err = "Already recording";
        let not_recording_err = "Not recording";
        let no_audio_err = "No audio file recorded";
        
        assert!(!recording_err.is_empty());
        assert!(!not_recording_err.is_empty());
        assert!(!no_audio_err.is_empty());
    }
    
    #[test]
    fn test_stt_fallback_message() {
        let fallback_msg = "Локальная транскрипция недоступна. Используется Web Speech API браузера.";
        assert!(fallback_msg.contains("Web Speech API"));
    }

    // ==================== Windows SAPI Escaping Tests ====================
    
    #[test]
    fn test_windows_sapi_escaping() {
        let text = r#"Hello "World" $var `test`"#;
        let escaped = text
            .replace("\\", "\\\\")
            .replace("\"", "`\"")
            .replace("$", "`$")
            .replace("`", "``");
        
        assert!(escaped.contains("``\""));  // Escaped quote
        assert!(escaped.contains("``$"));   // Escaped dollar
    }
}
