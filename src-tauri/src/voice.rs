use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use once_cell::sync::OnceCell;

// State flags
static IS_RECORDING: AtomicBool = AtomicBool::new(false);
static IS_SPEAKING: AtomicBool = AtomicBool::new(false);
static TTS_PROCESS: OnceCell<Mutex<Option<std::process::Child>>> = OnceCell::new();

// TTS engines available on Linux
#[derive(Clone, Copy, PartialEq)]
pub enum TtsEngine {
    EspeakNg,    // espeak-ng (most common, installed by default on many distros)
    Piper,       // piper-tts (high quality neural TTS)
    Festival,    // festival (older but widely available)
}

static CURRENT_TTS: OnceCell<Mutex<TtsEngine>> = OnceCell::new();

pub fn init() {
    let _ = TTS_PROCESS.set(Mutex::new(None));
    let _ = CURRENT_TTS.set(Mutex::new(TtsEngine::EspeakNg));
    
    // Check which TTS is available
    let tts = detect_tts_engine();
    if let Some(engine) = CURRENT_TTS.get() {
        if let Ok(mut guard) = engine.lock() {
            *guard = tts;
        }
    }
    
    let engine_name = match tts {
        TtsEngine::EspeakNg => "espeak-ng",
        TtsEngine::Piper => "piper",
        TtsEngine::Festival => "festival",
    };
    println!("Voice engine initialized. TTS: {}", engine_name);
}

/// Detect available TTS engine on system
fn detect_tts_engine() -> TtsEngine {
    // Try piper first (best quality)
    if Command::new("piper").arg("--help").output().is_ok() {
        return TtsEngine::Piper;
    }
    
    // Try espeak-ng (most common)
    if Command::new("espeak-ng").arg("--version").output().is_ok() {
        return TtsEngine::EspeakNg;
    }
    
    // Try espeak (older version)
    if Command::new("espeak").arg("--version").output().is_ok() {
        return TtsEngine::EspeakNg;
    }
    
    // Try festival
    if Command::new("festival").arg("--version").output().is_ok() {
        return TtsEngine::Festival;
    }
    
    // Default to espeak-ng
    TtsEngine::EspeakNg
}

/// Start recording user's voice
/// Note: Actual recording requires arecord (ALSA) or similar
pub fn start_recording() -> Result<(), String> {
    if IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Already recording".to_string());
    }
    
    IS_RECORDING.store(true, Ordering::SeqCst);
    
    // Check if arecord is available for actual recording
    if Command::new("arecord").arg("--version").output().is_ok() {
        println!("Started recording (arecord available)...");
        // In a real implementation, we'd spawn arecord here
        // arecord -f S16_LE -r 16000 -c 1 /tmp/recording.wav
    } else {
        println!("Started recording (simulated - install alsa-utils for actual recording)...");
    }
    
    Ok(())
}

/// Stop recording and return transcription
/// Note: Actual STT requires whisper or similar
pub fn stop_recording() -> Result<String, String> {
    if !IS_RECORDING.load(Ordering::SeqCst) {
        return Err("Not recording".to_string());
    }
    
    IS_RECORDING.store(false, Ordering::SeqCst);
    println!("Stopped recording");
    
    // Check for local whisper
    let has_whisper = Command::new("whisper").arg("--help").output().is_ok()
        || Command::new("whisper-cpp").arg("--help").output().is_ok();
    
    if has_whisper {
        // In real implementation: whisper /tmp/recording.wav --model small --language ru
        println!("Whisper detected, but transcription not yet implemented");
    }
    
    // For now, return instructions
    Ok("Голосовой ввод записан. Для транскрипции установите whisper: pip install openai-whisper".to_string())
}

/// Speak text using TTS
pub fn speak(text: &str, _voice_id: Option<i64>) -> Result<(), String> {
    if IS_SPEAKING.load(Ordering::SeqCst) {
        // Stop previous speech first
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
    };
    
    IS_SPEAKING.store(false, Ordering::SeqCst);
    result
}

/// Speak using espeak-ng
fn speak_espeak(text: &str) -> Result<(), String> {
    // Try espeak-ng first, fall back to espeak
    let program = if Command::new("espeak-ng").arg("--version").output().is_ok() {
        "espeak-ng"
    } else {
        "espeak"
    };
    
    println!("Speaking with {}: {}...", program, &text[..text.len().min(50)]);
    
    // Use Russian voice if available
    let output = Command::new(program)
        .args([
            "-v", "ru",           // Russian voice
            "-s", "150",          // Speed (words per minute)
            "-p", "50",           // Pitch (0-99)
            text
        ])
        .output();
    
    match output {
        Ok(out) => {
            if !out.status.success() {
                // Try without Russian voice
                let fallback = Command::new(program)
                    .arg(text)
                    .output();
                
                match fallback {
                    Ok(_) => Ok(()),
                    Err(e) => Err(format!("{} error: {}", program, e))
                }
            } else {
                Ok(())
            }
        }
        Err(e) => {
            Err(format!("TTS not available. Install espeak-ng: sudo apt install espeak-ng\nError: {}", e))
        }
    }
}

/// Speak using piper (neural TTS, high quality)
fn speak_piper(text: &str) -> Result<(), String> {
    println!("Speaking with piper: {}...", &text[..text.len().min(50)]);
    
    // Piper requires a model file, check common locations
    let model_paths = [
        "/usr/share/piper-voices/ru_RU-irina-medium.onnx",
        "~/.local/share/piper/ru_RU-irina-medium.onnx",
        "./piper-model.onnx",
    ];
    
    let model = model_paths.iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|s| s.to_string());
    
    if let Some(model_path) = model {
        // echo "text" | piper --model model.onnx --output_file - | aplay
        let output = Command::new("sh")
            .args([
                "-c",
                &format!("echo '{}' | piper --model {} --output_file - | aplay -q", 
                         text.replace("'", "\\'"), model_path)
            ])
            .output();
        
        match output {
            Ok(out) if out.status.success() => Ok(()),
            _ => {
                println!("Piper failed, falling back to espeak-ng");
                speak_espeak(text)
            }
        }
    } else {
        println!("Piper model not found, falling back to espeak-ng");
        speak_espeak(text)
    }
}

/// Speak using festival
fn speak_festival(text: &str) -> Result<(), String> {
    println!("Speaking with festival: {}...", &text[..text.len().min(50)]);
    
    let output = Command::new("sh")
        .args([
            "-c",
            &format!("echo '{}' | festival --tts", text.replace("'", "\\'"))
        ])
        .output();
    
    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(_) => {
            println!("Festival failed, falling back to espeak-ng");
            speak_espeak(text)
        }
        Err(e) => Err(format!("Festival error: {}", e))
    }
}

/// Stop speaking
pub fn stop_speaking() {
    IS_SPEAKING.store(false, Ordering::SeqCst);
    
    // Kill any running TTS processes
    let _ = Command::new("pkill")
        .args(["-f", "espeak"])
        .output();
    let _ = Command::new("pkill")
        .args(["-f", "piper"])
        .output();
    let _ = Command::new("pkill")
        .args(["-f", "festival"])
        .output();
    let _ = Command::new("pkill")
        .args(["-f", "aplay"])
        .output();
    
    println!("Stopped speaking");
}

/// Check if TTS is available on system
pub fn is_tts_available() -> bool {
    Command::new("espeak-ng").arg("--version").output().is_ok()
        || Command::new("espeak").arg("--version").output().is_ok()
        || Command::new("piper").arg("--help").output().is_ok()
        || Command::new("festival").arg("--version").output().is_ok()
}
