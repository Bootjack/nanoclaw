/**
 * Memory System API v2
 * Fixed FTS indexing - manually populate FTS table
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('/workspace/project/node_modules/better-sqlite3');

class MemorySystem {
  constructor(config = {}) {
    this.dbPath = config.dbPath || path.join(__dirname, 'index.db');
    this.markdownRoot = config.markdownRoot || __dirname;
    this.namespace = config.namespace || 'main';

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Prepared statements
    this.stmts = {
      insertEntry: this.db.prepare(`
        INSERT INTO memory_entries (chat_namespace, file_path, title, category, tags, content_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      insertFTS: this.db.prepare(`
        INSERT INTO memory_fts (rowid, title, content, tags)
        VALUES (?, ?, ?, ?)
      `),

      search: this.db.prepare(`
        SELECT
          rowid as id,
          rank as relevance
        FROM memory_fts
        WHERE memory_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),

      getEntry: this.db.prepare(`
        SELECT * FROM memory_entries WHERE id = ? AND chat_namespace = ?
      `),

      updateAccess: this.db.prepare(`
        UPDATE memory_entries
        SET last_accessed = CURRENT_TIMESTAMP,
            access_count = access_count + 1
        WHERE id = ?
      `),

      logQuery: this.db.prepare(`
        INSERT INTO memory_query_stats (chat_namespace, query, results_count, latency_ms, entry_ids)
        VALUES (?, ?, ?, ?, ?)
      `)
    };
  }

  /**
   * Store a new memory entry
   */
  store({ title, content, category = 'facts', tags = [] }) {
    const filename = this._sanitizeFilename(title) + '.md';
    const categoryDir = path.join(this.markdownRoot, category);
    const filePath = path.join(categoryDir, filename);

    // Ensure category directory exists
    fs.mkdirSync(categoryDir, { recursive: true });

    // Write markdown file
    fs.writeFileSync(filePath, content, 'utf-8');

    // Calculate content hash
    const contentHash = crypto.createHash('sha256')
      .update(content)
      .digest('hex');

    // Insert into memory_entries
    const result = this.stmts.insertEntry.run(
      this.namespace,
      filePath,
      title,
      category,
      tags.join(','),
      contentHash
    );

    const entryId = result.lastInsertRowid;

    // Insert into FTS index
    this.stmts.insertFTS.run(
      entryId,
      title,
      content,
      tags.join(' ')
    );

    return {
      id: entryId,
      filePath,
      title,
      category,
      tags
    };
  }

  /**
   * Retrieve memory entries using BM25 full-text search
   */
  retrieve({ query, maxResults = 10, includeGlobal = false }) {
    const startTime = Date.now();

    // Search FTS index
    const ftsResults = this.stmts.search.all(query, maxResults);

    // Load full entries from memory_entries
    const entries = ftsResults
      .map(row => {
        const entry = this.stmts.getEntry.get(row.id, this.namespace);
        
        // Skip if not in our namespace
        if (!entry) {
          // Try global if includeGlobal is true
          if (includeGlobal) {
            return this.stmts.getEntry.get(row.id, 'global');
          }
          return null;
        }
        
        return entry;
      })
      .filter(e => e !== null)
      .map(entry => {
        const content = fs.readFileSync(entry.file_path, 'utf-8');
        this.stmts.updateAccess.run(entry.id);

        return {
          id: entry.id,
          title: entry.title,
          category: entry.category,
          tags: entry.tags ? entry.tags.split(',') : [],
          content,
          updatedAt: entry.updated_at
        };
      });

    // Log query statistics
    const latency = Date.now() - startTime;
    this.stmts.logQuery.run(
      this.namespace,
      query,
      entries.length,
      latency,
      JSON.stringify(entries.map(e => e.id))
    );

    return {
      entries,
      metadata: {
        namespace: this.namespace,
        resultsCount: entries.length,
        latencyMs: latency,
        query
      }
    };
  }

  /**
   * Sanitize filename
   */
  _sanitizeFilename(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }

  close() {
    this.db.close();
  }
}

module.exports = MemorySystem;

// Test
if (require.main === module) {
  const memory = new MemorySystem({ namespace: 'main' });

  console.log('📝 Testing memory system v2...\n');

  const entry = memory.store({
    title: 'WhatsApp Formatting Guidelines',
    content: `# WhatsApp Formatting Guidelines

- Use *bold* with single asterisks
- Use _italic_ with underscores
- Never use ## markdown headings`,
    category: 'facts',
    tags: ['whatsapp', 'formatting']
  });
  console.log('✅ Stored:', entry.title, '\n');

  const results = memory.retrieve({ query: 'WhatsApp formatting' });
  console.log(`✅ Found ${results.entries.length} results`);
  console.log(`⚡ Latency: ${results.metadata.latencyMs}ms\n`);

  results.entries.forEach(e => {
    console.log(`- ${e.title}`);
    console.log(`  Category: ${e.category}`);
  });

  memory.close();
}
