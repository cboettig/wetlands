/**
 * Basic MCP server connection tests (JavaScript)
 * 
 * Tests basic connectivity and tool invocation without LLM integration.
 * Equivalent to test_mcp_basic.py
 * 
 * Run with: npm test test_mcp_basic.test.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import EventSource from './eventsource-shim.js';

// Polyfill EventSource for Node.js
global.EventSource = EventSource;

// Configuration
const MCP_URL = process.env.MCP_URL || 'https://biodiversity-mcp.nrp-nautilus.io/sse';

describe('MCP Basic Connection Tests', () => {

    test('should connect and list tools', async () => {
        console.log('🔌 Connecting to MCP Server...');

        // Create transport and client
        const transport = new SSEClientTransport(new URL(MCP_URL));
        const client = new Client({
            name: 'test-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        // Connect
        await client.connect(transport);
        console.log('   Fetching tool list...');

        // List tools
        const response = await client.listTools();
        const tools = response.tools;

        expect(tools.length).toBeGreaterThan(0);
        console.log(`✅ Found ${tools.length} tools`);

        // List all available tools
        tools.forEach(tool => {
            const desc = tool.description ? tool.description.substring(0, 80) : 'No description';
            console.log(`   - ${tool.name}: ${desc}`);
        });

        // Cleanup
        await client.close();
    }, 30000);

    test('should find query tool', async () => {
        console.log('🔍 Looking for \'query\' tool...');

        const transport = new SSEClientTransport(new URL(MCP_URL));
        const client = new Client({
            name: 'test-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await client.connect(transport);
        const response = await client.listTools();
        const queryTool = response.tools.find(t => t.name === 'query');

        expect(queryTool).toBeDefined();
        console.log(`✅ Found tool: ${queryTool.name}`);
        console.log(`   Description: ${queryTool.description}`);

        // Verify tool has required attributes
        expect(queryTool).toHaveProperty('name');
        expect(queryTool).toHaveProperty('description');

        await client.close();
    }, 30000);

    test('should execute simple query', async () => {
        console.log('🧪 Testing tool invocation...');

        const transport = new SSEClientTransport(new URL(MCP_URL));
        const client = new Client({
            name: 'test-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await client.connect(transport);

        console.log('   Executing: SELECT 1');
        const result = await client.callTool({
            name: 'query',
            arguments: {
                query: 'SELECT 1'
            }
        });

        console.log(`✅ Response:`, result);
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();

        await client.close();
    }, 30000);

    test('should handle multiple sequential invocations', async () => {
        console.log('🔄 Testing multiple invocations...');

        const transport = new SSEClientTransport(new URL(MCP_URL));
        const client = new Client({
            name: 'test-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await client.connect(transport);

        const queries = [
            'SELECT 1',
            'SELECT 2',
            'SELECT 1 + 1 as result'
        ];

        for (let i = 0; i < queries.length; i++) {
            const query = queries[i];
            console.log(`   Query ${i + 1}: ${query}`);

            const result = await client.callTool({
                name: 'query',
                arguments: { query }
            });

            expect(result).toBeDefined();
            console.log(`   ✓ Result:`, result.content);
        }

        console.log('✅ All queries executed successfully');
        await client.close();
    }, 30000);

    test('should handle errors gracefully', async () => {
        console.log('⚠️  Testing error handling...');

        const transport = new SSEClientTransport(new URL(MCP_URL));
        const client = new Client({
            name: 'test-client',
            version: '1.0.0'
        }, {
            capabilities: {}
        });

        await client.connect(transport);

        const invalidQuery = 'SELECT * FROM nonexistent_table_xyz';
        console.log(`   Executing invalid query: ${invalidQuery}`);

        // Should either throw or return error in result
        try {
            const result = await client.callTool({
                name: 'query',
                arguments: { query: invalidQuery }
            });
            console.log(`   Result:`, result);
            // Accept result with error indication
        } catch (error) {
            console.log(`   ✓ Expected error caught: ${error.constructor.name}`);
            // This is acceptable - error was reported
        }

        await client.close();
    }, 30000);

    test('should work with fresh client pattern', async () => {
        console.log('🔄 Testing fresh client pattern...');

        for (let i = 0; i < 3; i++) {
            console.log(`   Iteration ${i + 1}: Creating fresh client...`);

            const transport = new SSEClientTransport(new URL(MCP_URL));
            const client = new Client({
                name: 'test-client',
                version: '1.0.0'
            }, {
                capabilities: {}
            });

            await client.connect(transport);

            const result = await client.callTool({
                name: 'query',
                arguments: { query: `SELECT ${i + 1}` }
            });

            expect(result).toBeDefined();
            console.log(`   ✓ Query ${i + 1} successful:`, result.content);

            await client.close();
        }

        console.log('✅ Fresh client pattern works correctly');
    }, 30000);

});
