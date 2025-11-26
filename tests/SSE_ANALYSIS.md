# SSE Interface Analysis - chat.js vs MCP SDK

## Issue Found: Different SSE Protocol Implementations

After comparing `chat.js` with the MCP SDK implementation, I've identified **critical differences** in how the SSE (Server-Sent Events) protocol is being used.

## The Problem

### chat.js Implementation (CUSTOM/MANUAL)

`chat.js` is implementing a **custom SSE protocol** that:

1. Opens EventSource to `/sse` endpoint
2. Waits for `endpoint` event containing session ID
3. POSTs JSON-RPC message to session endpoint 
4. Waits for `message` event with response
5. Manually handles session management

```javascript
// chat.js lines 219-309
const eventSource = new EventSource(sseUrl);

eventSource.addEventListener('endpoint', async (event) => {
    sessionEndpoint = event.data;
    const postUrl = `${baseUrl}${sessionEndpoint}`;
    
    await fetch(postUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(message)
    });
});

eventSource.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    // Process response
});
```

### MCP SDK Implementation (STANDARD)

The MCP SDK uses the **standard MCP SSE transport** which:

1. Uses `SSEClientTransport` from `@modelcontextprotocol/sdk`
2. Automatically handles session management
3. Uses proper MCP protocol methods
4. Abstracts away the low-level SSE details

```javascript
// Correct SDK usage
const transport = new SSEClientTransport(new URL(MCP_URL));
const client = new Client({name: 'client', version: '1.0.0'}, {capabilities: {}});
await client.connect(transport);
const result = await client.callTool({name: 'query', arguments: {query: sql}});
```

## Why chat.js Isn't Working

### Issue 1: Wrong Protocol Implementation

The `chat.js` is trying to use a **two-step protocol**:
1. Listen for 'endpoint' event
2. POST to session endpoint

But the MCP SSE transport expects a **different flow**:
1. EventSource connects and receives initialization messages
2. Client sends JSON-RPC via the transport
3. Server responds via SSE stream

### Issue 2: Not Using MCP Client Library

The `chat.js` is trying to manually implement what the MCP SDK does automatically. This is error-prone and doesn't follow the standard protocol.

### Issue 3: EventSource in Browser vs Node

- **Browser**: `EventSource` is native
- **Node.js**: Requires `eventsource` package (polyfill)

## Recommended Fixes

### Option 1: Use MCP SDK in Browser (RECOMMENDED)

Replace the custom SSE implementation in `chat.js` with the MCP SDK:

```javascript
// Add to HTML
<script type="module">
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

class WetlandsChatbot {
    async initMCP() {
        const transport = new SSEClientTransport(new URL(this.mcpServerUrl));
        this.mcpClient = new Client({
            name: 'wetlands-chatbot',
            version: '1.0.0'
        }, {
            capabilities: {}
        });
        
        await this.mcpClient.connect(transport);
        this.mcpTools = await this.mcpClient.listTools();
    }
    
    async executeMCPQuery(sqlQuery) {
        const result = await this.mcpClient.callTool({
            name: 'query',
            arguments: { query: sqlQuery }
        });
        
        return result.content[0].text;
    }
}
</script>
```

### Option 2: Fix Custom SSE Implementation

If you must use custom implementation, need to understand the actual MCP SSE protocol from server logs/docs.

The current implementation assumes:
- Server sends 'endpoint' event → **May not be standard MCP**
- Need to POST to session endpoint → **May not be standard MCP**

## Testing the Fix

### For Node.js Tests

Install EventSource polyfill:

```bash
cd tests
npm install eventsource
```

Update test files:

```javascript
// Add at top of test files
import EventSource from 'eventsource';
global.EventSource = EventSource;
```

### For Browser (chat.js)

Use the MCP SDK via CDN or build tool:

```html
<script type="module">
import { Client } from 'https://unpkg.com/@modelcontextprotocol/sdk/dist/index.js';
// ... rest of implementation
</script>
```

## Next Steps

1. **Verify MCP server SSE protocol** - Check server logs to see exact message flow
2. **Update chat.js** - Replace custom SSE with MCP SDK
3. **Fix Node.js tests** - Add EventSource polyfill
4. **Test end-to-end** - Verify tools work in both browser and tests

## Key Differences Summary

| Aspect | chat.js (Current) | MCP SDK (Correct) |
|--------|------------------|-------------------|
| Protocol | Custom two-step | Standard MCP SSE |
| Session mgmt | Manual | Automatic |
| Library | None (manual EventSource) | @modelcontextprotocol/sdk |
| Complexity | High (100+ lines) | Low (10 lines) |
| Reliability | Fragile | Robust |
| Maintenance | Hard | Easy |

## Conclusion

**The main issue is that chat.js is NOT using the standard MCP SSE protocol.** 

It's implementing a custom protocol that may not match what the MCP server expects. This is likely why it's not working.

**SOLUTION**: Replace the custom `executeMCPQuery()` method with proper MCP SDK usage.
