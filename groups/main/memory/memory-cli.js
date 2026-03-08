#!/usr/bin/env node
/**
 * Memory CLI Tool
 * Simple command-line interface for memory management
 */
const ConversationMemory = require('./conversation-memory');

const memory = new ConversationMemory('main');

const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  switch (command) {
    case 'search':
    case 's': {
      const query = args.join(' ');
      if (!query) {
        console.log('Usage: memory-cli search <query>');
        process.exit(1);
      }

      const results = await memory.search(query);
      console.log(`\n🔍 Search: "${query}"`);
      console.log(`📊 Found ${results.entries.length} results (${results.metadata.latencyMs}ms)\n`);

      results.entries.forEach((entry, i) => {
        console.log(`${i + 1}. ${entry.title} [${entry.category}]`);
        console.log(`   Tags: ${entry.tags.join(', ')}`);
        console.log(`   ${entry.content.slice(0, 150).replace(/\n/g, ' ')}...`);
        console.log('');
      });
      break;
    }

    case 'store': {
      const title = args[0];
      const content = args[1];
      const category = args[2] || 'facts';

      if (!title || !content) {
        console.log('Usage: memory-cli store <title> <content> [category]');
        process.exit(1);
      }

      const result = await memory.storeFact({
        title,
        content,
        category,
        tags: []
      });

      if (result.success) {
        console.log(`\n✅ Stored: ${result.entry.title}`);
        console.log(`   Category: ${result.entry.category}`);
        console.log(`   File: ${result.entry.filePath}\n`);
      } else {
        console.log(`\n❌ Error: ${result.error}\n`);
      }
      break;
    }

    case 'list': {
      const category = args[0] || '';
      const query = category || '*';
      const results = await memory.search(query, 20);

      console.log(`\n📋 Memory Entries${category ? ` (${category})` : ''}`);
      console.log(`   Total: ${results.entries.length}\n`);

      const byCategory = {};
      results.entries.forEach(entry => {
        if (!byCategory[entry.category]) {
          byCategory[entry.category] = [];
        }
        byCategory[entry.category].push(entry);
      });

      Object.keys(byCategory).sort().forEach(cat => {
        console.log(`${cat}:`);
        byCategory[cat].forEach(entry => {
          console.log(`  - ${entry.title}`);
        });
        console.log('');
      });
      break;
    }

    case 'help':
    case undefined: {
      console.log(`
Memory CLI Tool

Usage:
  memory-cli search <query>       Search for memories
  memory-cli store <title> <content> [category]   Store a new memory
  memory-cli list [category]      List all memories
  memory-cli help                 Show this help

Examples:
  memory-cli search "WhatsApp formatting"
  memory-cli store "New Fact" "Content here" facts
  memory-cli list people

Categories: people, projects, facts, conversations, consolidated
`);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run "memory-cli help" for usage information');
      process.exit(1);
  }

  memory.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  memory.close();
  process.exit(1);
});
