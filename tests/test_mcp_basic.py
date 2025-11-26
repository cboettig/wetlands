"""
Basic MCP server connection tests.

Tests basic connectivity and tool invocation without LLM integration.
Based on simple-mcp-server-test.py
"""

import os
import pytest
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient


# Configuration
MCP_URL = os.getenv('MCP_URL', 'https://biodiversity-mcp.nrp-nautilus.io/sse')


class TestMCPBasicConnection:
    """Basic MCP server connectivity tests."""
    
    @pytest.mark.asyncio
    async def test_connect_and_list_tools(self):
        """Test basic connection to MCP server and tool listing."""
        print("🔌 Connecting to MCP Server...")
        
        # Initialize the client
        client = MultiServerMCPClient({
            "my-server": {
                "url": MCP_URL,
                "transport": "sse",
            }
        })
        
        # Fetch the tools
        print("   Fetching tool list...")
        tools = await client.get_tools()
        
        # Verify tools were returned
        assert len(tools) > 0, "No tools returned from server"
        print(f"✅ Found {len(tools)} tools")
        
        # List all available tools
        for tool in tools:
            print(f"   - {tool.name}: {tool.description[:80] if tool.description else 'No description'}")
    
    @pytest.mark.asyncio
    async def test_query_tool_exists(self):
        """Test that the 'query' tool exists and has expected attributes."""
        print("🔍 Looking for 'query' tool...")
        
        client = MultiServerMCPClient({
            "my-server": {
                "url": MCP_URL,
                "transport": "sse",
            }
        })
        
        tools = await client.get_tools()
        query_tool = next((t for t in tools if t.name == "query"), None)
        
        assert query_tool is not None, "Tool 'query' not found"
        print(f"✅ Found tool: {query_tool.name}")
        print(f"   Description: {query_tool.description}")
        
        # Verify tool has required attributes
        assert hasattr(query_tool, 'name'), "Tool missing 'name' attribute"
        assert hasattr(query_tool, 'description'), "Tool missing 'description' attribute"
    
    @pytest.mark.asyncio
    async def test_simple_query_execution(self):
        """Test executing a simple SQL query through the tool."""
        print("🧪 Testing tool invocation...")
        
        client = MultiServerMCPClient({
            "my-server": {
                "url": MCP_URL,
                "transport": "sse",
            }
        })
        
        tools = await client.get_tools()
        query_tool = next((t for t in tools if t.name == "query"), None)
        
        assert query_tool is not None, "Query tool not found"
        
        # Invoke the tool with a simple query
        print("   Executing: SELECT 1")
        try:
            result = await query_tool.ainvoke({"query": "SELECT 1"})
            print(f"✅ Response: {result}")
            
            # Verify we got a result
            assert result is not None, "Tool returned None"
            
        except Exception as e:
            pytest.fail(f"❌ Execution Error: {e}")
    
    @pytest.mark.asyncio
    async def test_multiple_tool_invocations(self):
        """Test that the client can handle multiple sequential tool calls."""
        print("🔄 Testing multiple invocations...")
        
        client = MultiServerMCPClient({
            "my-server": {
                "url": MCP_URL,
                "transport": "sse",
            }
        })
        
        tools = await client.get_tools()
        query_tool = next((t for t in tools if t.name == "query"), None)
        
        assert query_tool is not None
        
        # Execute multiple queries
        queries = [
            "SELECT 1",
            "SELECT 2",
            "SELECT 1 + 1 as result"
        ]
        
        for i, query in enumerate(queries):
            print(f"   Query {i+1}: {query}")
            result = await query_tool.ainvoke({"query": query})
            assert result is not None, f"Query {i+1} returned None"
            print(f"   ✓ Result: {result}")
        
        print("✅ All queries executed successfully")
    
    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test how the tool handles invalid queries."""
        print("⚠️  Testing error handling...")
        
        client = MultiServerMCPClient({
            "my-server": {
                "url": MCP_URL,
                "transport": "sse",
            }
        })
        
        tools = await client.get_tools()
        query_tool = next((t for t in tools if t.name == "query"), None)
        
        assert query_tool is not None
        
        # Try an invalid query
        invalid_query = "SELECT * FROM nonexistent_table_xyz"
        print(f"   Executing invalid query: {invalid_query}")
        
        # The tool should either raise an exception or return an error message
        try:
            result = await query_tool.ainvoke({"query": invalid_query})
            # If it returns, check if result indicates an error
            print(f"   Result: {result}")
            # We accept either an exception or an error in the result
        except Exception as e:
            print(f"   ✓ Expected error caught: {type(e).__name__}")
            # This is acceptable - the tool reported the error


class TestMCPReconnection:
    """Test client reconnection scenarios."""
    
    @pytest.mark.asyncio
    async def test_fresh_client_per_query(self):
        """Test creating a fresh client for each query (recommended pattern)."""
        print("🔄 Testing fresh client pattern...")
        
        for i in range(3):
            print(f"   Iteration {i+1}: Creating fresh client...")
            
            client = MultiServerMCPClient({
                "my-server": {
                    "url": MCP_URL,
                    "transport": "sse",
                }
            })
            
            tools = await client.get_tools()
            query_tool = next((t for t in tools if t.name == "query"), None)
            
            assert query_tool is not None
            
            result = await query_tool.ainvoke({"query": f"SELECT {i+1}"})
            assert result is not None
            print(f"   ✓ Query {i+1} successful: {result}")
        
        print("✅ Fresh client pattern works correctly")


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])
