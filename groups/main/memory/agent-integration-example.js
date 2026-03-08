/**
 * Example: How to integrate memory into agent prompts
 * This shows the pattern for adding memory context to Claude
 */
const ConversationMemory = require('./conversation-memory');

/**
 * Example function showing how to enhance an agent prompt with memory
 */
async function buildAgentPromptWithMemory(userMessage, namespace = 'main') {
  const memory = new ConversationMemory(namespace);

  // Get relevant memory context
  const memoryContext = await memory.getContext(userMessage, 2000);

  // Build the enhanced prompt
  const systemPrompt = `You are Mitzi, a personal assistant.

${memoryContext.context}

## Current Conversation
User: ${userMessage}

When responding:
- Use any relevant information from your memories above
- If you learn new important facts, mention them so they can be stored
- Keep responses natural and conversational
`;

  memory.close();

  return {
    prompt: systemPrompt,
    memoryStats: memoryContext.metadata
  };
}

/**
 * Example: Detecting and storing facts from agent responses
 */
function extractFactsFromResponse(response) {
  // Look for patterns like "I'll remember that..." or "Got it, ..."
  const facts = [];

  // Pattern 1: Explicit memory statements
  const memoryPatterns = [
    /I'll remember (?:that )?(.+)/gi,
    /Got it[,!] (.+)/gi,
    /Noted[,:]? (.+)/gi,
  ];

  memoryPatterns.forEach(pattern => {
    const matches = [...response.matchAll(pattern)];
    matches.forEach(match => {
      facts.push({
        content: match[1].trim(),
        confidence: 0.9
      });
    });
  });

  return facts;
}

// Example usage
if (require.main === module) {
  console.log('🤖 Example: Agent Integration with Memory\n');

  // Simulate a user asking about formatting
  const userMessage = "How should I format messages in WhatsApp?";

  buildAgentPromptWithMemory(userMessage).then(result => {
    console.log('📝 Generated prompt with memory context:\n');
    console.log(result.prompt);
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('📊 Memory stats:');
    console.log(`   - Namespace: ${result.memoryStats.namespace}`);
    console.log(`   - Results: ${result.memoryStats.resultsCount}`);
    console.log(`   - Latency: ${result.memoryStats.latencyMs}ms`);
  });
}
