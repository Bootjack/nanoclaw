# Channel Meta-Prompts

Meta-prompts allow you to customize Mitzi's behavior on a per-channel basis. Each channel can have its own `meta-prompt.md` file that defines how the bot should respond in that context.

## How It Works

1. Meta-prompts are stored at: `/workspace/extra/nanoclaw/groups/{folder}/meta-prompt.md`
2. They are loaded automatically when processing messages for that channel
3. The meta-prompt is prepended to the message history before being sent to the AI
4. Each channel only sees its own meta-prompt (no context bloat)

## Setup

Copy the example files to your group folders:

```bash
# For mitzi-dev channel
cp examples/meta-prompts/mitzi-dev.md /workspace/extra/nanoclaw/groups/mitzi-dev/meta-prompt.md

# For random channel
cp examples/meta-prompts/random.md /workspace/extra/nanoclaw/groups/random/meta-prompt.md

# For main DM
cp examples/meta-prompts/main.md /workspace/extra/nanoclaw/groups/main/meta-prompt.md
```

## Autonomous Updates

Mitzi can update these files herself based on:
- **Direct requests** from channel members (e.g., "Be more concise in your responses")
- **Feedback patterns** observed in conversations
- **Self-reflection** on response quality

No pull requests needed - meta-prompts are editable files that Mitzi can modify using standard file operations.

## Best Practices

- Keep meta-prompts **focused and specific** to the channel's purpose
- Include **when to respond** guidance (especially for trigger-based channels)
- Specify **tone and style** preferences
- Add **self-improvement instructions** so Mitzi knows how to update the prompt
- Keep them **concise** (200-500 words) to avoid excessive token usage

## Examples

See the example files in this directory:
- `mitzi-dev.md` - Technical development channel (no trigger, detailed responses)
- `random.md` - General channel (trigger-based, concise responses)
- `main.md` - Privileged DM (comprehensive, transparent)

## Performance Impact

Meta-prompts are:
- ✓ **Channel-specific** - only injected for their respective channel
- ✓ **Loaded once per message batch** - not on every individual message
- ✓ **Optional** - if no meta-prompt file exists, channel works normally
- ✓ **Efficient** - prepended before message formatting (minimal overhead)

Typical meta-prompts add 100-300 tokens per channel invocation.
