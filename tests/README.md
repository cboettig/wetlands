# MCP Server Tests

This directory contains comprehensive tests for the MCP (Model Context Protocol) server integration.

## Test Structure

### Python Tests

1. **test_mcp_basic.py** - Basic MCP server connectivity tests
   - Connection and tool listing
   - Direct tool invocation
   - Multiple sequential queries
   - Error handling
   - Fresh client pattern

2. **test_mcp_llm_integration.py** - LLM integration with MCP tools
   - LLM tool binding
   - LLM-generated tool calls
   - End-to-end workflow (LLM → tool → interpretation)
   - Real-world wetlands queries

### JavaScript Tests

1. **test_mcp_basic.test.js** - JavaScript equivalent of basic tests
   - Uses @modelcontextprotocol/sdk
   - SSE transport
   - Same test coverage as Python version

2. **test_mcp_llm_integration.test.js** - JavaScript LLM integration tests
   - Uses OpenAI SDK for LLM calls
   - MCP SDK for tool invocation
   - Same test coverage as Python version

## Setup

### Python Tests

```bash
# Install dependencies
pip install pytest pytest-asyncio langchain-openai langchain-mcp-adapters

# Run all Python tests
pytest tests/ -v -s

# Run specific test file
pytest tests/test_mcp_basic.py -v -s
pytest tests/test_mcp_llm_integration.py -v -s

# Run specific test
pytest tests/test_mcp_basic.py::TestMCPBasicConnection::test_connect_and_list_tools -v -s
```

### JavaScript Tests

```bash
# Install dependencies
cd tests
npm install

# Run all JavaScript tests
npm test

# Run specific test file
npm run test:basic
npm run test:llm

# Run with verbose output
npm run test:js
```

## Environment Variables

The tests use the following environment variables:

- `MCP_URL` - MCP server endpoint (default: https://biodiversity-mcp.nrp-nautilus.io/sse)
- `LLM_ENDPOINT` - LLM API endpoint (default: https://api.glama.ai/v1)
- `LLM_MODEL` - LLM model to use (default: glm-v)
- `NRP_API_KEY` - API key for LLM calls (required for LLM integration tests)

Example:

```bash
export MCP_URL="https://biodiversity-mcp.nrp-nautilus.io/sse"
export LLM_ENDPOINT="https://api.glama.ai/v1"
export LLM_MODEL="glm-v"
export NRP_API_KEY="your-api-key-here"
```

## Test Categories

### Basic Tests (no API key required)
- Connection testing
- Tool listing
- Direct tool invocation
- Error handling

### LLM Integration Tests (requires API key)
- Tool binding
- LLM-generated queries
- End-to-end workflows
- Real-world scenarios

## Running Tests in CI/CD

### GitHub Actions Example

```yaml
name: MCP Tests

on: [push, pull_request]

jobs:
  test-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pip install pytest pytest-asyncio
      - run: pytest tests/test_mcp_basic.py -v
        env:
          MCP_URL: ${{ secrets.MCP_URL }}
      - run: pytest tests/test_mcp_llm_integration.py -v
        env:
          MCP_URL: ${{ secrets.MCP_URL }}
          NRP_API_KEY: ${{ secrets.NRP_API_KEY }}
  
  test-javascript:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd tests && npm install
      - run: cd tests && npm run test:basic
        env:
          MCP_URL: ${{ secrets.MCP_URL }}
      - run: cd tests && npm run test:llm
        env:
          MCP_URL: ${{ secrets.MCP_URL }}
          NRP_API_KEY: ${{ secrets.NRP_API_KEY }}
```

## Test Patterns

### Fresh Client Pattern

Both Python and JavaScript tests demonstrate the "fresh client" pattern, which is recommended for avoiding session timeouts:

**Python:**
```python
# Create fresh client for each tool invocation
fresh_client = MultiServerMCPClient({
    "wetlands": {
        "transport": "sse",
        "url": mcp_url,
    }
})
fresh_tools = await fresh_client.get_tools()
fresh_tool = next((t for t in fresh_tools if t.name == "query"), None)
result = await fresh_tool.ainvoke(args)
```

**JavaScript:**
```javascript
// Create fresh client for each tool invocation
const transport = new SSEClientTransport(new URL(MCP_URL));
const client = new Client({name: 'test-client', version: '1.0.0'}, {capabilities: {}});
await client.connect(transport);
const result = await client.callTool({name: 'query', arguments: args});
await client.close();
```

## Troubleshooting

### Common Issues

1. **Connection timeouts**
   - Use the fresh client pattern
   - Check MCP server is running and accessible
   - Verify URL is correct

2. **Import errors (Python)**
   - Install missing packages: `pip install langchain-mcp-adapters langchain-openai`
   - Check Python version (3.11+ recommended)

3. **Module not found (JavaScript)**
   - Run `npm install` in the tests directory
   - Ensure Node.js 20+ is installed

4. **LLM tests skipped**
   - Set `NRP_API_KEY` environment variable
   - Verify API key is valid

## Based On

- `remote-llm.ipynb` - Notebook demonstrating LLM + MCP integration
- `simple-mcp-server-test.py` - Basic MCP server testing script
