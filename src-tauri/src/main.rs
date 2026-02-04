// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
#[cfg(feature = "embeddings")]
mod embeddings;
mod errors;
mod llm;
mod voice;

use tauri::Manager;

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    eprintln!("Failed to get app data directory: {}", e);
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "Failed to get app data directory"
                    )));
                }
            };
            
            if let Err(e) = std::fs::create_dir_all(&app_dir) {
                eprintln!("Warning: Failed to create app directory: {}", e);
            }
            
            let db_path = app_dir.join("wishmaster.db");
            if let Err(e) = database::init(&db_path) {
                eprintln!("Failed to initialize database: {}", e);
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to initialize database: {}", e)
                )));
            }
            
            // Initialize LLM engine
            llm::init();
            
            // Initialize voice engine
            voice::init();
            
            // Initialize embedding model (async, non-blocking)
            #[cfg(feature = "embeddings")]
            std::thread::spawn(|| {
                if let Err(e) = embeddings::init_embedder() {
                    eprintln!("Warning: Failed to initialize embeddings: {}", e);
                } else {
                    println!("🔍 Semantic search ready");
                }
            });
            
            println!("🧞 Wishmaster Desktop started!");
            println!("📚 Memory system active - all conversations will be remembered");
            #[cfg(feature = "embeddings")]
            println!("🔍 RAG/Vector search enabled");
            #[cfg(not(feature = "embeddings"))]
            println!("⚠️ Semantic search disabled (build without embeddings feature)");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            commands::load_settings,
            commands::save_settings,
            // Models
            commands::get_model_paths,
            commands::add_model_path,
            commands::remove_model_path,
            commands::load_model,
            commands::unload_model,
            commands::get_gpu_info,
            commands::is_gpu_available,
            // Sessions
            commands::get_sessions,
            commands::create_session,
            commands::delete_session,
            // Messages
            commands::get_messages,
            commands::save_message,
            // Generation (with memory)
            commands::generate,
            commands::stop_generation,
            // MEMORY SYSTEM
            commands::search_all_messages,
            commands::get_recent_global_messages,
            commands::add_memory,
            commands::get_all_memories,
            commands::get_memories_by_category,
            commands::get_top_memories,
            commands::delete_memory,
            // USER PERSONA (digital twin)
            commands::get_user_persona,
            commands::analyze_persona,
            // EXPORT (for fine-tuning)
            commands::export_all_data,
            commands::export_alpaca_format,
            commands::export_sharegpt_format,
            commands::get_data_stats,
            commands::export_to_file,
            // SEMANTIC SEARCH (RAG)
            commands::find_rag_context,
            commands::index_all_messages,
            commands::get_embedding_stats,
            // Voice
            commands::get_voice_profiles,
            commands::create_voice_profile,
            commands::delete_voice_profile,
            commands::start_recording,
            commands::stop_recording,
            commands::speak,
            commands::stop_speaking,
            commands::is_stt_available,
            commands::transcribe_audio,
            commands::get_voice_recordings,
            commands::save_voice_from_chat,
            commands::create_voice_profile_from_recording,
        ])
        .run(tauri::generate_context!());
    
    if let Err(e) = result {
        eprintln!("Application error: {}", e);
        std::process::exit(1);
    }
}
