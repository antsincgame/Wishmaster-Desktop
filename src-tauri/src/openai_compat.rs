//! OpenAI-compatible API client for chat completions (streaming).
//! Use with llama.cpp server (--mmproj for Vision), Llamafile, or any server that exposes
//! POST /v1/chat/completions with stream: true. Enables Vision without Ollama.
//!
//! Supports Vision models: pass images as base64 in OpenAiMessage.images field.

#![cfg(feature = "ollama")]

use serde::{Deserialize, Serialize};

/// Content part for multimodal messages (text or image)
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrlContent },
}

#[derive(Debug, Clone, Serialize)]
struct ImageUrlContent {
    url: String,
}

/// Internal message format for API request
#[derive(Debug, Serialize)]
struct ChatMessage {
    role: String,
    content: serde_json::Value, // String or Vec<ContentPart>
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    temperature: f32,
    max_tokens: usize,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Option<Vec<StreamChoice>>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: Option<StreamDelta>,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
}

/// Build content value: if images present, create multimodal array; otherwise plain string
fn build_content(text: &str, images: &[String]) -> serde_json::Value {
    if images.is_empty() {
        serde_json::Value::String(text.to_string())
    } else {
        let mut parts: Vec<ContentPart> = Vec::with_capacity(images.len() + 1);
        // Add images first (common pattern for Vision models)
        for img_base64 in images {
            // Detect image type from base64 header or default to jpeg
            let mime = if img_base64.starts_with("/9j/") {
                "image/jpeg"
            } else if img_base64.starts_with("iVBORw0KGgo") {
                "image/png"
            } else if img_base64.starts_with("R0lGOD") {
                "image/gif"
            } else if img_base64.starts_with("UklGR") {
                "image/webp"
            } else {
                "image/jpeg" // default
            };
            parts.push(ContentPart::ImageUrl {
                image_url: ImageUrlContent {
                    url: format!("data:{};base64,{}", mime, img_base64),
                },
            });
        }
        // Add text after images
        if !text.is_empty() {
            parts.push(ContentPart::Text { text: text.to_string() });
        }
        serde_json::to_value(parts).unwrap_or_else(|_| serde_json::Value::String(text.to_string()))
    }
}

/// Stream chat completion from an OpenAI-compatible endpoint (e.g. llama-server with --mmproj).
/// Calls `on_token` for each content delta. URL is base only (e.g. http://127.0.0.1:8080).
/// Supports Vision: pass base64 images in OpenAiMessage.images field.
pub async fn stream_chat<F>(
    base_url: &str,
    model: &str,
    messages: Vec<OpenAiMessage>,
    system: Option<&str>,
    temperature: f32,
    max_tokens: usize,
    mut on_token: F,
) -> Result<(), String>
where
    F: FnMut(&str) -> bool,
{
    let url = format!(
        "{}/v1/chat/completions",
        base_url.trim_end_matches('/')
    );
    
    let mut msgs: Vec<ChatMessage> = messages
        .into_iter()
        .map(|m| ChatMessage {
            role: m.role,
            content: build_content(&m.content, &m.images),
        })
        .collect();
    
    if let Some(s) = system {
        msgs.insert(
            0,
            ChatMessage {
                role: "system".to_string(),
                content: serde_json::Value::String(s.to_string()),
            },
        );
    }
    
    let body = ChatRequest {
        model: model.to_string(),
        messages: msgs,
        stream: true,
        temperature,
        max_tokens,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("{}: {}", status, text));
    }

    let mut stream = res.bytes_stream();
    let mut buf = Vec::<u8>::new();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream: {}", e))?;
        buf.extend_from_slice(&chunk);

        // SSE: "data: {...}\n\n" or "data: [DONE]\n\n"
        while let Some(pos) = buf.windows(2).position(|w| w == b"\n\n") {
            let line = std::mem::take(&mut buf);
            let (block, rest) = line.split_at(pos);
            buf = rest[2..].to_vec();
            let line = String::from_utf8_lossy(block).trim().to_string();
            if line.starts_with("data: ") {
                let payload = line.trim_start_matches("data: ").trim();
                if payload == "[DONE]" {
                    return Ok(());
                }
                if let Ok(c) = serde_json::from_str::<StreamChunk>(payload) {
                    if let Some(choices) = c.choices {
                        if let Some(choice) = choices.first() {
                            if let Some(ref delta) = choice.delta {
                                if let Some(ref content) = delta.content {
                                    if !content.is_empty() && !on_token(content) {
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Message for OpenAI-compatible API with optional Vision support
#[derive(Debug, Clone)]
pub struct OpenAiMessage {
    pub role: String,
    pub content: String,
    /// Base64-encoded images for Vision models (without data: prefix)
    pub images: Vec<String>,
}

impl OpenAiMessage {
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
