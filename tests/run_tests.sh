#!/bin/bash
# Test runner script for MCP server integration tests

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MCP Server Integration Tests        ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""

# Check environment variables
if [ -z "$MCP_URL" ]; then
    echo -e "${YELLOW}⚠️  MCP_URL not set, using default${NC}"
    export MCP_URL="https://biodiversity-mcp.nrp-nautilus.io/sse"
fi

if [ -z "$NRP_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  NRP_API_KEY not set, LLM tests will be skipped${NC}"
fi

echo -e "${GREEN}Configuration:${NC}"
echo "  MCP_URL: $MCP_URL"
echo "  LLM_ENDPOINT: ${LLM_ENDPOINT:-https://api.glama.ai/v1}"
echo "  LLM_MODEL: ${LLM_MODEL:-glm-v}"
echo ""

# Parse arguments
TEST_LANG="${1:-all}"
TEST_TYPE="${2:-all}"

case $TEST_LANG in
    python|py)
        echo -e "${BLUE}Running Python tests...${NC}"
        if [ "$TEST_TYPE" = "basic" ]; then
            pytest tests/test_mcp_basic.py -v -s
        elif [ "$TEST_TYPE" = "llm" ]; then
            pytest tests/test_mcp_llm_integration.py -v -s
        else
            pytest tests/ -v -s
        fi
        ;;
    javascript|js)
        echo -e "${BLUE}Running JavaScript tests...${NC}"
        cd tests
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        if [ "$TEST_TYPE" = "basic" ]; then
            npm run test:basic
        elif [ "$TEST_TYPE" = "llm" ]; then
            npm run test:llm
        else
            npm test
        fi
        ;;
    all)
        echo -e "${BLUE}Running all tests...${NC}"
        echo ""
        echo -e "${GREEN}1. Python Tests${NC}"
        echo "────────────────────────────────────────"
        if [ "$TEST_TYPE" = "basic" ]; then
            pytest tests/test_mcp_basic.py -v -s
        elif [ "$TEST_TYPE" = "llm" ]; then
            pytest tests/test_mcp_llm_integration.py -v -s
        else
            pytest tests/ -v -s
        fi
        
        echo ""
        echo -e "${GREEN}2. JavaScript Tests${NC}"
        echo "────────────────────────────────────────"
        cd tests
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        if [ "$TEST_TYPE" = "basic" ]; then
            npm run test:basic
        elif [ "$TEST_TYPE" = "llm" ]; then
            npm run test:llm
        else
            npm test
        fi
        ;;
    *)
        echo "Usage: $0 [python|js|all] [basic|llm|all]"
        echo ""
        echo "Examples:"
        echo "  $0                    # Run all tests"
        echo "  $0 python             # Run all Python tests"
        echo "  $0 js basic           # Run JavaScript basic tests only"
        echo "  $0 all llm            # Run LLM tests in both languages"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Tests completed!${NC}"
