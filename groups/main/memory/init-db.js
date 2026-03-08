#!/usr/bin/env node
/**
 * Initialize the memory system database
 */
const fs = require('fs');
const path = require('path');

// Use better-sqlite3 from the main project's node_modules
const Database = require('/workspace/project/node_modules/better-sqlite3');

const DB_PATH = path.join(__dirname, 'index.db');
const SCHEMA_PATH = path.join(__dirname, 'schema-v2.sql');

console.log('🗄️  Initializing memory system database...');

// Create database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance for concurrent reads/writes
db.pragma('foreign_keys = ON');

// Read and execute schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

console.log('✅ Database initialized successfully');
console.log(`   Location: ${DB_PATH}`);

// Verify tables were created
const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table'
  ORDER BY name
`).all();

console.log('\n📋 Created tables:');
tables.forEach(t => console.log(`   - ${t.name}`));

// Check FTS5 virtual table
const ftsCheck = db.prepare(`
  SELECT * FROM sqlite_master
  WHERE type='table' AND name='memory_fts'
`).get();

if (ftsCheck) {
  console.log('✅ FTS5 full-text search enabled');
} else {
  console.warn('⚠️  FTS5 table not found');
}

db.close();
console.log('\n🎉 Memory system ready!');
