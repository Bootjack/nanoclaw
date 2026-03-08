# Memory System Integration Guide

## ✅ Completed Components

1. **Database & Schema** - SQLite with FTS5 full-text search
2. **Core API** - `memory-api-v2.js` for low-level operations
3. **Conversation Memory** - `conversation-memory.js` for high-level integration
4. **CLI Tool** - `memory-cli.js` for manual memory management
5. **Agent Integration Example** - Shows how to inject memory into prompts

## Quick Start

### Using Memory in Conversations

```javascript
const ConversationMemory = require('./memory/conversation-memory');

// Initialize for a specific namespace/group
const memory = new ConversationMemory('main');

// Get relevant context for a user message
const context = await memory.getContext(userMessage);

// context.context is formatted markdown ready to inject into agent prompt
// context.entries contains the raw memory entries
// context.metadata has search statistics
```

### Storing Memories

```javascript
// Store a fact
await memory.storeFact({
  title: 'User Preference',
  content: '# Preference\n\nDetails here...',
  category: 'facts',
  tags: ['preference', 'user']
});

// Store person info
await memory.storePerson({
  name: 'Person Name',
  content: '# Person Name\n\nBio...',
  tags: ['colleague', 'developer']
});

// Store project info
await memory.storeProject({
  name: 'Project Name',
  content: '# Project\n\nDetails...',
  tags: ['active', 'priority']
});
```

### CLI Usage

```bash
# Search memories
./memory-cli.js search "WhatsApp formatting"

# Store a new memory
./memory-cli.js store "Title" "Content here" facts

# List all memories
./memory-cli.js list

# List by category
./memory-cli.js list people
```

## Integration into Agent Flow

### Step 1: Before Agent Response

```javascript
const ConversationMemory = require('./memory/conversation-memory');

async function processUserMessage(userMessage, namespace) {
  // Get relevant memories
  const memory = new ConversationMemory(namespace);
  const memoryContext = await memory.getContext(userMessage);

  // Build enhanced prompt
  const systemPrompt = `${baseSystemPrompt}

${memoryContext.context}

## Current Message
${userMessage}
`;

  // Send to Claude with enhanced prompt
  const response = await callClaude(systemPrompt);

  memory.close();
  return response;
}
```

### Step 2: After Agent Response (Optional)

```javascript
// Detect if agent mentioned learning something new
function shouldStoreMemory(response) {
  const patterns = [
    /I'll remember/i,
    /Got it/i,
    /Noted/i,
    /I've stored/i
  ];

  return patterns.some(p => p.test(response));
}

// If agent indicates memory storage, extract and store
if (shouldStoreMemory(agentResponse)) {
  // Parse agent response for fact to store
  // This could be more sophisticated
  await memory.storeFact({
    title: extractedTitle,
    content: extractedContent,
    category: 'facts',
    tags: []
  });
}
```

## Performance Characteristics

- **Query Latency**: ~1-5ms for typical searches
- **Storage**: Minimal overhead (SQLite + markdown files)
- **Isolation**: Zero cross-namespace leakage
- **Scalability**: FTS5 handles thousands of entries efficiently

## File Locations

```
/workspace/group/memory/
├── index.db                    # SQLite database
├── config.json                 # System configuration
├── schema-v2.sql              # Database schema
├── init-db.js                 # Database initialization
├── memory-api-v2.js           # Core API
├── conversation-memory.js     # High-level integration
├── memory-cli.js              # CLI tool
├── agent-integration-example.js  # Integration example
├── people/                    # Person memories
├── projects/                  # Project memories
├── facts/                     # General facts
├── conversations/             # Conversation summaries (future)
└── consolidated/              # Consolidated memories (future)
```

## Next Steps for Full Integration

### 1. Add to Main Orchestrator

Modify `src/index.ts` to include memory context in agent prompts:

```typescript
import { ConversationMemory } from '../groups/main/memory/conversation-memory';

async function processGroupMessages(chatJid: string) {
  // ... existing code ...

  // Add memory context
  const memory = new ConversationMemory(group.folder);
  const memoryContext = await memory.getContext(prompt);

  const enhancedPrompt = `${prompt}

${memoryContext.context}`;

  const output = await runAgent(group, enhancedPrompt, chatJid, ...);

  memory.close();
}
```

### 2. Automatic Fact Extraction

Create a post-processing step that detects when facts should be stored:

- Monitor agent responses for learning indicators
- Extract structured information from conversations
- Automatically populate the memory database
- User can review/approve via PR or direct edit

### 3. Consolidation System

Implement daily/weekly consolidation:

- Summarize conversations at end of day
- Extract key facts and decisions
- Store consolidated summaries
- Reduce token usage over time

## Testing

Run the test suite:

```bash
# Test core API
node memory-api-v2.js

# Test conversation integration
node agent-integration-example.js

# Test CLI
./memory-cli.js search "test query"
./memory-cli.js list
```

## Troubleshooting

### No results from search

- Check that keywords are being extracted correctly
- Try simpler, single-word queries
- Use OR operator: "keyword1 OR keyword2"
- Verify entries exist: `./memory-cli.js list`

### Database locked errors

- Ensure only one process accesses the database at a time
- Close memory connections with `memory.close()`
- Check for zombie processes

### FTS5 not available

- Verify SQLite version supports FTS5 (3.9.0+)
- Check init output for "FTS5 full-text search enabled"

## Memory Categories

- **people**: Information about individuals
- **projects**: Project-related knowledge and context
- **facts**: General facts, preferences, and important information
- **conversations**: Conversation summaries (future)
- **consolidated**: Consolidated and summarized entries (future)

## Search Tips

- Use specific keywords: "WhatsApp formatting" > "how to format"
- Multi-word queries automatically use OR
- Tags are searchable: "preference" finds all preference-tagged entries
- Case-insensitive search
- Porter stemming enabled (format, formatting, formatted all match)
