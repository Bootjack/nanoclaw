/**
 * Conversation Memory Integration
 * Provides memory context for agent responses
 */
const MemorySystem = require('./memory-api-v2');

class ConversationMemory {
  constructor(namespace = 'main') {
    this.memory = new MemorySystem({ namespace });
    this.namespace = namespace;
  }

  /**
   * Get relevant memory context for a user message
   * This will be injected into the agent's prompt
   */
  async getContext(userMessage, maxTokens = 2000) {
    // Extract keywords from the message for better search
    const keywords = this._extractKeywords(userMessage);

    if (keywords.length === 0) {
      return { context: '', entries: [] };
    }

    // Search for relevant memories
    // FTS5 needs OR operators for multi-word queries
    const searchQuery = keywords.join(' OR ');
    const results = this.memory.retrieve({
      query: searchQuery,
      maxResults: 5,
      includeGlobal: true
    });

    // Format memory context for the agent
    const contextParts = results.entries.map(entry => {
      return `### ${entry.title} (${entry.category})
${this._truncateContent(entry.content, 300)}
---`;
    });

    const context = contextParts.length > 0
      ? `## Relevant Memories\n\n${contextParts.join('\n\n')}`
      : '';

    return {
      context,
      entries: results.entries,
      metadata: results.metadata
    };
  }

  /**
   * Store a new fact or preference from conversation
   * Call this when you notice important information worth remembering
   */
  async storeFact({ title, content, category = 'facts', tags = [] }) {
    try {
      const entry = this.memory.store({
        title,
        content,
        category,
        tags
      });
      return { success: true, entry };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Store a person's information
   */
  async storePerson({ name, content, tags = [] }) {
    return this.storeFact({
      title: name,
      content,
      category: 'people',
      tags: ['person', ...tags]
    });
  }

  /**
   * Store project information
   */
  async storeProject({ name, content, tags = [] }) {
    return this.storeFact({
      title: name,
      content,
      category: 'projects',
      tags: ['project', ...tags]
    });
  }

  /**
   * Extract keywords from a message for search
   */
  _extractKeywords(message) {
    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'what', 'how', 'when', 'where',
      'why', 'who', 'which', 'this', 'that', 'these', 'those', 'i', 'you',
      'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its',
      'our', 'their', 'me', 'him', 'them', 'us'
    ]);

    return message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Limit to top 10 keywords
  }

  /**
   * Truncate content to approximate token count
   */
  _truncateContent(content, maxChars) {
    if (content.length <= maxChars) return content;
    return content.slice(0, maxChars) + '...';
  }

  /**
   * Search memory directly
   */
  async search(query, maxResults = 10) {
    return this.memory.retrieve({ query, maxResults, includeGlobal: true });
  }

  /**
   * Close database connection
   */
  close() {
    this.memory.close();
  }
}

module.exports = ConversationMemory;

// Example usage
if (require.main === module) {
  const memory = new ConversationMemory('main');

  console.log('📝 Testing conversation memory integration...\n');

  // Store some example data
  console.log('1. Storing person info...');
  memory.storePerson({
    name: 'Jason Hinebaugh',
    content: `# Jason Hinebaugh

## Preferences
- Prefers clean WhatsApp formatting (no ## headings)
- Values pragmatic solutions over perfect abstraction
- Likes iterative development

## Projects
- NanoClaw/Mitzi - Personal AI assistant
`,
    tags: ['user', 'creator']
  });
  console.log('   ✅ Stored\n');

  console.log('2. Storing preference...');
  memory.storeFact({
    title: 'WhatsApp Formatting Rules',
    content: `# WhatsApp Formatting

- Use *bold* with single asterisks
- Use _italic_ with underscores
- Never use ## markdown headings
`,
    category: 'facts',
    tags: ['whatsapp', 'formatting', 'preferences']
  });
  console.log('   ✅ Stored\n');

  // Test retrieval
  console.log('3. Testing context retrieval...');
  memory.getContext('How should I format WhatsApp messages?').then(result => {
    console.log(`   ✅ Found ${result.entries.length} relevant memories`);
    console.log(`   ⚡ Latency: ${result.metadata.latencyMs}ms\n`);

    if (result.context) {
      console.log('Context preview:');
      console.log(result.context.slice(0, 200) + '...\n');
    }

    memory.close();
    console.log('✅ Test complete!');
  });
}
