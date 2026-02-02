// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod llm;
mod voice;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app.path().app_data_dir().expect("Failed to get app dir");
            std::fs::create_dir_all(&app_dir).ok();
            
            let db_path = app_dir.join("wishmaster.db");
            database::init(&db_path).expect("Failed to init database");
            
            // Initialize LLM engine
            llm::init();
            
            // Initialize voice engine
            voice::init();
            
            println!("🧞 Wishmaster Desktop started!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings
            commands::load_settings,
            commands::save_settings,
            // Models
            commands::scan_models,
            commands::load_model,
            commands::unload_model,
            // Sessions
            commands::get_sessions,
            commands::create_session,
            commands::delete_session,
            // Messages
            commands::get_messages,
            commands::save_message,
            // Generation
            commands::generate,
            commands::stop_generation,
            // Voice
            commands::get_voice_profiles,
            commands::create_voice_profile,
            commands::delete_voice_profile,
            commands::start_recording,
            commands::stop_recording,
            commands::speak,
            commands::stop_speaking,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
