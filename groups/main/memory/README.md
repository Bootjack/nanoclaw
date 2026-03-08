# NanoClaw Memory System

**Status**: ✅ Phase 1 Complete (Database & Core API)

## Overview

A hybrid memory system combining markdown files (human-readable) with SQLite FTS5 (machine-efficient) for fast, isolated memory across chat groups.

## Architecture

### Storage Layer
- **Markdown Files**: Human-readable, Obsidian-compatible knowledge base
- **SQLite Database**: Metadata, indexes, and full-text search
- **FTS5**: Fast keyword search with BM25 ranking

### Directory Structure
```
/workspace/group/memory/
├── index.db                 # SQLite database
├── config.json             # Configuration
├── schema-v2.sql           # Database schema
├── memory-api-v2.js        # API implementation
├── people/                 # Person entries
├── projects/               # Project knowledge
├── facts/                  # General facts and preferences
├── conversations/          # Conversation summaries
└── consolidated/           # Consolidated entries
```

## Features

✅ **Implemented**:
- Namespace isolation (per-group memory)
- BM25 full-text search via FTS5
- Automatic markdown file storage
- Query statistics tracking
- Access pattern logging

🚧 **Planned**:
- Vector embeddings for semantic search
- Daily/weekly/monthly consolidation
- Automatic summarization
- Cross-namespace queries with global memory

## Usage

```javascript
const MemorySystem = require('./memory-api-v2');

const memory = new MemorySystem({
  namespace: 'main'  // Or any group folder name
});

// Store
memory.store({
  title: 'Important Fact',
  content: '# Content in markdown',
  category: 'facts',
  tags: ['tag1', 'tag2']
});

// Retrieve
const results = memory.retrieve({
  query: 'search terms',
  maxResults: 10,
  includeGlobal: false
});

results.entries.forEach(entry => {
  console.log(entry.title);
  console.log(entry.content);
});

memory.close();
```

## Database Schema

### Tables
- `memory_entries`: Main entries with metadata
- `memory_fts`: FTS5 virtual table for full-text search
- `memory_query_stats`: Query performance and patterns
- `memory_consolidations`: Consolidation tracking (future)

### Indexes
- Namespace isolation
- Category filtering
- Temporal ordering (updated_at, last_accessed)
- Full-text search (FTS5)

## Performance

- Query latency: ~1-5ms for typical searches
- Storage: Minimal overhead (SQLite + markdown)
- Isolation: Zero cross-namespace leakage

## Next Steps

1. **Integrate with conversation flow**: Auto-store important facts
2. **Implement consolidation**: Daily/weekly summaries
3. **Add vector search**: Semantic similarity (optional)
4. **Build high-level API**: Simple store/retrieve interface
5. **Memory management**: Retention policies, archival

## Files

- `schema-v2.sql`: Database schema
- `init-db.js`: Database initialization
- `memory-api-v2.js`: Core API implementation
- `config.json`: System configuration
- `README.md`: This file

## Testing

```bash
# Initialize database
node init-db.js

# Test API
node memory-api-v2.js
```

## Notes

- Each chat group has isolated memory via `chat_namespace`
- Global namespace ('global') for shared facts
- Markdown files are source of truth
- SQLite provides fast indexing and search
- FTS5 uses Porter stemming for English
