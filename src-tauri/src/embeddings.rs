use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};
use once_cell::sync::OnceCell;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

static EMBEDDER: OnceCell<Mutex<TextEmbedding>> = OnceCell::new();

const EMBEDDING_DIM: usize = 384; // multilingual-e5-small dimension (used in stats)

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingEntry {
    pub id: i64,
    pub source_type: String,      // "message", "memory", "document"
    pub source_id: i64,
    pub content_hash: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub source_type: String,
    pub source_id: i64,
    pub content: String,
    pub similarity: f32,
}

// ==================== Initialization ====================

/// Initialize the embedding model
pub fn init_embedder() -> Result<(), String> {
    if EMBEDDER.get().is_some() {
        return Ok(());
    }

    println!("Loading embedding model (multilingual-e5-small)...");
    
    let model = TextEmbedding::try_new(InitOptions {
        model_name: EmbeddingModel::MultilingualE5Small,
        show_download_progress: true,
        ..Default::default()
    }).map_err(|e| format!("Failed to load embedding model: {}", e))?;

    EMBEDDER.set(Mutex::new(model))
        .map_err(|_| "Embedder already initialized".to_string())?;
    
    println!("Embedding model loaded successfully");
    Ok(())
}

// Note: embeddings table is created in database.rs during init

// ==================== Embedding Operations ====================

/// Generate embedding for search query (use "query:" prefix)
pub fn embed_query(text: &str) -> Result<Vec<f32>, String> {
    let embedder = EMBEDDER.get()
        .ok_or("Embedder not initialized")?
        .lock()
        .map_err(|e| format!("Failed to lock embedder: {}", e))?;

    // E5 model: use "query:" prefix for search queries
    let prefixed = format!("query: {}", text);
    
    let embeddings = embedder.embed(vec![prefixed], None)
        .map_err(|e| format!("Embedding failed: {}", e))?;

    embeddings.into_iter().next()
        .ok_or("No embedding returned".to_string())
}

/// Generate embedding for document/passage (use "passage:" prefix)
pub fn embed_passage(text: &str) -> Result<Vec<f32>, String> {
    let embedder = EMBEDDER.get()
        .ok_or("Embedder not initialized")?
        .lock()
        .map_err(|e| format!("Failed to lock embedder: {}", e))?;

    // E5 model: use "passage:" prefix for documents being indexed
    let prefixed = format!("passage: {}", text);
    
    let embeddings = embedder.embed(vec![prefixed], None)
        .map_err(|e| format!("Embedding failed: {}", e))?;

    embeddings.into_iter().next()
        .ok_or("No embedding returned".to_string())
}

/// Generate embeddings for multiple passages (batch indexing)
#[allow(dead_code)]
pub fn embed_passages_batch(texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let embedder = EMBEDDER.get()
        .ok_or("Embedder not initialized")?
        .lock()
        .map_err(|e| format!("Failed to lock embedder: {}", e))?;

    // E5 model: use "passage:" prefix for batch indexing
    let prefixed: Vec<String> = texts.iter()
        .map(|t| format!("passage: {}", t))
        .collect();
    
    embedder.embed(prefixed, None)
        .map_err(|e| format!("Batch embedding failed: {}", e))
}

// ==================== Database Operations ====================

/// Store embedding in database
pub fn store_embedding(
    conn: &Connection,
    source_type: &str,
    source_id: i64,
    content: &str,
    vector: &[f32],
) -> Result<i64> {
    let content_hash = format!("{:x}", md5_hash(content));
    let vector_bytes = floats_to_bytes(vector);
    let now = get_timestamp();

    conn.execute(
        r#"INSERT OR REPLACE INTO embeddings 
           (source_type, source_id, content_hash, vector, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)"#,
        params![source_type, source_id, content_hash, vector_bytes, now],
    )?;

    Ok(conn.last_insert_rowid())
}

/// Check if content already has embedding (by hash)
pub fn has_embedding(conn: &Connection, source_type: &str, source_id: i64, content: &str) -> Result<bool> {
    let content_hash = format!("{:x}", md5_hash(content));
    
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM embeddings WHERE source_type = ?1 AND source_id = ?2 AND content_hash = ?3",
        params![source_type, source_id, content_hash],
        |row| row.get(0),
    ).unwrap_or(false);

    Ok(exists)
}

/// Semantic search - find similar content
pub fn semantic_search(
    conn: &Connection,
    query_vector: &[f32],
    source_type: Option<&str>,
    limit: i32,
    min_similarity: f32,
) -> Result<Vec<(i64, String, i64, f32)>> {
    // Get all embeddings (for small datasets this is fine, for large use approximate NN)
    let mut stmt = if let Some(st) = source_type {
        conn.prepare(
            "SELECT id, source_type, source_id, vector FROM embeddings WHERE source_type = ?1"
        )?
    } else {
        conn.prepare(
            "SELECT id, source_type, source_id, vector FROM embeddings"
        )?
    };

    let rows: Vec<(i64, String, i64, Vec<u8>)> = if source_type.is_some() {
        stmt.query_map(params![source_type.unwrap()], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })?
    } else {
        stmt.query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })?
    }.filter_map(|r| r.ok()).collect();

    // Calculate similarities
    let mut results: Vec<(i64, String, i64, f32)> = rows
        .into_iter()
        .map(|(id, st, sid, vec_bytes)| {
            let stored_vector = bytes_to_floats(&vec_bytes);
            let similarity = cosine_similarity(query_vector, &stored_vector);
            (id, st, sid, similarity)
        })
        .filter(|(_, _, _, sim)| *sim >= min_similarity)
        .collect();

    // Sort by similarity (descending)
    results.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit as usize);

    Ok(results)
}

/// Delete embedding
pub fn delete_embedding(conn: &Connection, source_type: &str, source_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM embeddings WHERE source_type = ?1 AND source_id = ?2",
        params![source_type, source_id],
    )?;
    Ok(())
}

/// Get embedding stats
pub fn get_embedding_stats(conn: &Connection) -> Result<serde_json::Value> {
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM embeddings",
        [],
        |row| row.get(0),
    )?;

    let by_type: Vec<(String, i64)> = {
        let mut stmt = conn.prepare(
            "SELECT source_type, COUNT(*) FROM embeddings GROUP BY source_type"
        )?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(serde_json::json!({
        "totalEmbeddings": total,
        "byType": by_type.into_iter().collect::<std::collections::HashMap<_, _>>(),
        "embeddingDimension": EMBEDDING_DIM,
        "model": "multilingual-e5-small"
    }))
}

// ==================== Utility Functions ====================

/// Convert float array to bytes for SQLite BLOB
fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    floats.iter()
        .flat_map(|f| f.to_le_bytes())
        .collect()
}

/// Convert bytes back to float array
fn bytes_to_floats(bytes: &[u8]) -> Vec<f32> {
    bytes.chunks_exact(4)
        .map(|chunk| {
            let arr: [u8; 4] = chunk.try_into().unwrap();
            f32::from_le_bytes(arr)
        })
        .collect()
}

/// Cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

/// Simple hash for content deduplication
fn md5_hash(content: &str) -> u128 {
    // Simple FNV-1a hash (good enough for deduplication)
    let mut hash: u128 = 0xcbf29ce484222325;
    for byte in content.bytes() {
        hash ^= byte as u128;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn get_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ==================== High-Level API ====================

/// Index a message for semantic search
pub fn index_message(conn: &Connection, message_id: i64, content: &str) -> Result<(), String> {
    // Skip if already indexed with same content
    if has_embedding(conn, "message", message_id, content).unwrap_or(false) {
        return Ok(());
    }

    // Use embed_passage for documents being indexed
    let vector = embed_passage(content)?;
    store_embedding(conn, "message", message_id, content, &vector)
        .map_err(|e| format!("Failed to store embedding: {}", e))?;

    Ok(())
}

/// Index a memory entry for semantic search
pub fn index_memory(conn: &Connection, memory_id: i64, content: &str) -> Result<(), String> {
    if has_embedding(conn, "memory", memory_id, content).unwrap_or(false) {
        return Ok(());
    }

    // Use embed_passage for documents being indexed
    let vector = embed_passage(content)?;
    store_embedding(conn, "memory", memory_id, content, &vector)
        .map_err(|e| format!("Failed to store embedding: {}", e))?;

    Ok(())
}

/// Find similar messages using semantic search
pub fn find_similar_messages(
    conn: &Connection,
    query: &str,
    limit: i32,
) -> Result<Vec<(i64, f32)>, String> {
    // Use embed_query for search queries
    let query_vector = embed_query(query)?;
    
    let results = semantic_search(conn, &query_vector, Some("message"), limit, 0.5)
        .map_err(|e| format!("Search failed: {}", e))?;

    Ok(results.into_iter().map(|(_, _, source_id, sim)| (source_id, sim)).collect())
}

/// Find relevant context for RAG
pub fn find_rag_context(
    conn: &Connection,
    query: &str,
    limit: i32,
) -> Result<Vec<SearchResult>, String> {
    // Use embed_query for search queries
    let query_vector = embed_query(query)?;
    
    // Search both messages and memories
    let results = semantic_search(conn, &query_vector, None, limit, 0.4)
        .map_err(|e| format!("Search failed: {}", e))?;

    // Fetch actual content for each result
    let mut search_results = Vec::new();
    
    for (_, source_type, source_id, similarity) in results {
        let content = match source_type.as_str() {
            "message" => {
                conn.query_row(
                    "SELECT content FROM messages WHERE id = ?1",
                    params![source_id],
                    |row| row.get::<_, String>(0),
                ).ok()
            }
            "memory" => {
                conn.query_row(
                    "SELECT content FROM memory WHERE id = ?1",
                    params![source_id],
                    |row| row.get::<_, String>(0),
                ).ok()
            }
            _ => None,
        };

        if let Some(content) = content {
            search_results.push(SearchResult {
                source_type,
                source_id,
                content,
                similarity,
            });
        }
    }

    Ok(search_results)
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floats_to_bytes_roundtrip() {
        let original = vec![1.0f32, 2.5, -3.14, 0.0];
        let bytes = floats_to_bytes(&original);
        let recovered = bytes_to_floats(&bytes);
        
        assert_eq!(original.len(), recovered.len());
        for (a, b) in original.iter().zip(recovered.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        let sim = cosine_similarity(&a, &b);
        assert!(sim.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 2.0, 3.0];
        let b = vec![-1.0, -2.0, -3.0];
        let sim = cosine_similarity(&a, &b);
        assert!((sim + 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_md5_hash_consistency() {
        let hash1 = md5_hash("hello world");
        let hash2 = md5_hash("hello world");
        let hash3 = md5_hash("different text");
        
        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_search_result_structure() {
        let result = SearchResult {
            source_type: "message".to_string(),
            source_id: 42,
            content: "Test content".to_string(),
            similarity: 0.85,
        };
        
        assert_eq!(result.source_type, "message");
        assert_eq!(result.source_id, 42);
        assert!(result.similarity > 0.8);
    }
}
