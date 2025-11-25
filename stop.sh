#!/bin/bash

# Stop all wetlands application services

# Colors for output
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${RED}Stopping Wetlands Application Services...${NC}"

cd "$(dirname "$0")"

# Stop HTTP server
if [ -f .http.pid ]; then
    PID=$(cat .http.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null
        echo "Stopped HTTP server (PID: $PID)"
    else
        echo "HTTP server process not running (PID: $PID)"
    fi
    rm .http.pid
fi

# Stop MCP server
if [ -f .mcp.pid ]; then
    PID=$(cat .mcp.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null
        echo "Stopped MCP server (PID: $PID)"
    else
        echo "MCP server process not running (PID: $PID)"
    fi
    rm .mcp.pid
fi

# Extra: kill any lingering processes on ports 8000/8001
lsof -ti :8000 | xargs -r kill -9 2>/dev/null && echo "Force killed any process on port 8000"
lsof -ti :8001 | xargs -r kill -9 2>/dev/null && echo "Force killed any process on port 8001"

# Stop MCP proxy
if [ -f .mcp_proxy.pid ]; then
    PID=$(cat .mcp_proxy.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null
        echo "Stopped MCP proxy (PID: $PID)"
    else
        echo "MCP proxy process not running (PID: $PID)"
    fi
    rm .mcp_proxy.pid
fi

# Stop LLM proxy
if [ -f .llm_proxy.pid ]; then
    PID=$(cat .llm_proxy.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null
        echo "Stopped LLM proxy (PID: $PID)"
    else
        echo "LLM proxy process not running (PID: $PID)"
    fi
    rm .llm_proxy.pid
fi

# Extra: kill any lingering processes on ports 8010/8011
lsof -ti :8010 | xargs -r kill -9 2>/dev/null && echo "Force killed any process on port 8010"
lsof -ti :8011 | xargs -r kill -9 2>/dev/null && echo "Force killed any process on port 8011"

echo "All services stopped"
