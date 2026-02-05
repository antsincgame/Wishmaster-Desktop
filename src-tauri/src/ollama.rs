//! Ollama HTTP client: stream chat without embedding LLM in the binary.
//! Supports Vision models (Llama-3.2-Vision, LLaVA, etc.) when run via Ollama.
//!
//! Vision support: pass base64 images in OllamaMessage.images field.

#![cfg(feature = "ollama")]

use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "http://localhost:11434";

/// Message for Ollama API with optional Vision support
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaMessage {
    pub role: String,
    pub content: String,
    /// Base64-encoded images for Vision models (Ollama format)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub images: Vec<String>,
}

impl OllamaMessage {
    /// Create a text-only message
    pub fn text(role: &str, content: &str) -> Self {
        Self {
            role: role.to_string(),
            content: content.to_string(),
            images: Vec::new(),
        }
    }
    
    /// Create a message with images (Vision)
    pub fn with_images(role: &str, content: &str, images: Vec<String>) -> Self {
        Self {
            role: role.to_string(),
            content: content.to_string(),
            images,
        }
    }
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    options: ChatOptions,
}

#[derive(Debug, Serialize)]
struct ChatOptions {
    temperature: f32,
    num_predict: i32,
}

#[derive(Debug, Deserialize)]
struct ChatStreamChunk {
    message: Option<ChatMessageChunk>,
    done: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ChatMessageChunk {
    content: Option<String>,
}

/// Stream chat completion from Ollama; calls `on_token` for each content delta.
/// Returns Ok(()) on success or when stopped by on_token returning false.
pub async fn stream_chat<F>(
    base_url: &str,
    model: &str,
    messages: Vec<OllamaMessage>,
    system: Option<&str>,
    temperature: f32,
    max_tokens: usize,
    mut on_token: F,
) -> Result<(), String>
where
    F: FnMut(&str) -> bool,
{
    let url = format!(
        "{}/api/chat",
        base_url.trim_end_matches('/')
    );
    let mut msgs = messages;
    if let Some(s) = system {
        msgs.insert(
            0,
            OllamaMessage::text("system", s),
        );
    }
    let body = ChatRequest {
        model: model.to_string(),
        messages: msgs,
        stream: true,
        options: ChatOptions {
            temperature,
            num_predict: max_tokens as i32,
        },
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Ollama client build: {}", e))?;

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama error {}: {}", status, text));
    }

    let mut stream = res.bytes_stream();
    let mut buf = Vec::<u8>::new();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Ollama stream: {}", e))?;
        buf.extend_from_slice(&chunk);

        // NDJSON: one JSON object per line
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line = std::mem::take(&mut buf);
            let (line, rest) = line.split_at(pos);
            buf = rest[1..].to_vec();
            let line = String::from_utf8_lossy(line);
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<ChatStreamChunk>(line) {
                Ok(c) => {
                    if let Some(ref msg) = c.message {
                        if let Some(ref content) = msg.content {
                            if !content.is_empty() && !on_token(content) {
                                return Ok(());
                            }
                        }
                    }
                    if c.done == Some(true) {
                        return Ok(());
                    }
                }
                Err(_) => {}
            }
        }
    }

    Ok(())
}

/// List model names from Ollama (GET /api/tags).
pub async fn list_models(base_url: &str) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Ollama client: {}", e))?;

    let res = client.get(&url).send().await.map_err(|e| format!("Ollama list: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Ollama tags error: {}", res.status()));
    }

    #[derive(Deserialize)]
    struct TagsResponse {
        models: Option<Vec<TagModel>>,
    }
    #[derive(Deserialize)]
    struct TagModel {
        name: String,
    }

    let tags: TagsResponse = res.json().await.map_err(|e| format!("Ollama tags JSON: {}", e))?;
    let names = tags
        .models
        .unwrap_or_default()
        .into_iter()
        .map(|m| m.name)
        .collect();
    Ok(names)
}

pub fn default_base_url() -> &'static str {
    DEFAULT_BASE_URL
}
