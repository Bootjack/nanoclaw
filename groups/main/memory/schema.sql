-- NanoClaw Memory System Database Schema v2
-- Simplified: FTS sync handled in application code

-- Main memory entries table
CREATE TABLE IF NOT EXISTS memory_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_namespace TEXT NOT NULL,
    file_path TEXT NOT NULL,
    title TEXT,
    category TEXT,
    tags TEXT,
    content_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    embedding BLOB,

    CHECK (chat_namespace IS NOT NULL AND chat_namespace != ''),
    UNIQUE(chat_namespace, file_path)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_namespace ON memory_entries(chat_namespace);
CREATE INDEX IF NOT EXISTS idx_category ON memory_entries(category);
CREATE INDEX IF NOT EXISTS idx_category_namespace ON memory_entries(category, chat_namespace);
CREATE INDEX IF NOT EXISTS idx_updated ON memory_entries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_accessed ON memory_entries(last_accessed DESC);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    title,
    content,
    tags,
    tokenize='porter'
);

-- Query statistics
CREATE TABLE IF NOT EXISTS memory_query_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_namespace TEXT NOT NULL,
    query TEXT NOT NULL,
    results_count INTEGER,
    latency_ms INTEGER,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    entry_ids TEXT
);

CREATE INDEX IF NOT EXISTS idx_query_stats_namespace ON memory_query_stats(chat_namespace);
CREATE INDEX IF NOT EXISTS idx_query_stats_timestamp ON memory_query_stats(timestamp DESC);

-- Consolidation metadata
CREATE TABLE IF NOT EXISTS memory_consolidations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_namespace TEXT NOT NULL,
    consolidation_type TEXT NOT NULL,
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    source_entry_ids TEXT,
    consolidated_entry_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consolidation_namespace ON memory_consolidations(chat_namespace);
CREATE INDEX IF NOT EXISTS idx_consolidation_period ON memory_consolidations(period_end DESC);
