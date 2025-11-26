# Quick Start Guide - MCP Server Tests

## Setup (One-time)

### Python Tests
```bash
# Install Python dependencies
pip install -r tests/requirements.txt
```

### JavaScript Tests
```bash
# Install JavaScript dependencies
cd tests
npm install
cd ..
```

## Running Tests

### Simple Method (Recommended)
```bash
# Run all tests
./tests/run_tests.sh

# Run only Python tests
./tests/run_tests.sh python

# Run only JavaScript tests
./tests/run_tests.sh js

# Run only basic tests (both languages)
./tests/run_tests.sh all basic

# Run only LLM integration tests (requires API key)
./tests/run_tests.sh all llm
```

### Direct Method

#### Python
```bash
# All Python tests
pytest tests/ -v -s

# Basic connectivity tests only
pytest tests/test_mcp_basic.py -v -s

# LLM integration tests only (requires NRP_API_KEY)
pytest tests/test_mcp_llm_integration.py -v -s

# Specific test
pytest tests/test_mcp_basic.py::TestMCPBasicConnection::test_connect_and_list_tools -v
```

#### JavaScript
```bash
cd tests

# All JavaScript tests
npm test

# Basic tests only
npm run test:basic

# LLM tests only (requires NRP_API_KEY)
npm run test:llm
```

## Environment Variables

Set these before running tests:

```bash
# Required for LLM integration tests
export NRP_API_KEY="your-api-key-here"

# Optional - use custom MCP server
export MCP_URL="https://biodiversity-mcp.nrp-nautilus.io/sse"

# Optional - use different LLM endpoint
export LLM_ENDPOINT="https://api.glama.ai/v1"
export LLM_MODEL="glm-v"
```

## Test Files Overview

```
tests/
├── test_mcp_basic.py                      # Python: Basic MCP connectivity
├── test_mcp_llm_integration.py            # Python: LLM + MCP integration
├── test_mcp_basic.test.js                 # JavaScript: Basic MCP connectivity
├── test_mcp_llm_integration.test.js       # JavaScript: LLM + MCP integration
├── requirements.txt                       # Python dependencies
├── package.json                           # JavaScript dependencies
├── conftest.py                           # Pytest configuration
├── run_tests.sh                          # Test runner script
└── README.md                             # Full documentation
```

## Quick Test Examples

### Test 1: Basic Connection (No API key needed)
```bash
pytest tests/test_mcp_basic.py::TestMCPBasicConnection::test_connect_and_list_tools -v -s
```

### Test 2: Direct Tool Invocation (No API key needed)
```bash
pytest tests/test_mcp_basic.py::TestMCPBasicConnection::test_simple_query_execution -v -s
```

### Test 3: LLM Tool Calling (Requires API key)
```bash
export NRP_API_KEY="your-key"
pytest tests/test_mcp_llm_integration.py::TestLLMToolCalling::test_llm_generates_tool_calls -v -s
```

### Test 4: End-to-End Workflow (Requires API key)
```bash
export NRP_API_KEY="your-key"
pytest tests/test_mcp_llm_integration.py::TestLLMToolCalling::test_end_to_end_tool_execution -v -s
```

## Troubleshooting

### "Import pytest could not be resolved"
```bash
pip install pytest pytest-asyncio
```

### "Module @modelcontextprotocol/sdk not found"
```bash
cd tests && npm install
```

### "NRP_API_KEY not set"
- This is only required for LLM integration tests
- Basic tests will still run without it
- Set the key: `export NRP_API_KEY="your-key"`

### Connection timeout
- Check that MCP server is running: `curl -I https://biodiversity-mcp.nrp-nautilus.io/sse`
- Try using the fresh client pattern (already implemented in tests)

## See Also

- `tests/README.md` - Full documentation
- `mcp/remote-llm.ipynb` - Original notebook these tests are based on
- `mcp/simple-mcp-server-test.py` - Original simple test script
