---
title: Wetlands
emoji: 🌳
colorFrom: indigo
colorTo: blue
sdk: streamlit
sdk_version: 1.45.1
app_file: app/app.py
pinned: false
license: apache-2.0
---

# Wetlands Chatbot & Map Application

## Quick Start (Default: Hosted MCP)

By default, the application uses the hosted Kubernetes MCP server and a local LLM proxy (for CORS).

1. Clone the repository:
   ```bash
   git clone https://github.com/boettiger-lab/wetlands.git
   cd wetlands
   ```

2. Set your API key (required for authentication):
   ```bash
   export NRP_API_KEY="your-api-key-here"
   ```

3. Start the services:
   ```bash
   ./start.sh
   ```
   - This launches:
     - HTTP server (port 8000) - serves the frontend
     - LLM proxy (port 8011) - local proxy for CORS handling
   - Backend MCP service is hosted at `https://biodiversity-mcp.nrp-nautilus.io`

4. Open [http://localhost:8000](http://localhost:8000) in your browser to use the app.

5. To stop the services:
   ```bash
   ./stop.sh
   ```

## Local Development (Full Stack with Local MCP)

For development and testing with a local MCP server:

1. Install dependencies:
   ```bash
   uv pip install -r requirements.txt
   ```

2. Set your API key:
   ```bash
   export NRP_API_KEY="your-api-key-here"
   ```

3. Start all services locally:
   ```bash
   ./start.sh --local-mcp
   ```
   - This launches all backend services locally:
     - HTTP server (port 8000) - serves the frontend
     - LLM proxy (port 8011) - proxy to LLM APIs
     - MCP server (port 8001) - mcp-server-motherduck with SSE transport
     - MCP proxy (port 8010) - CORS-enabled proxy to MCP server
   - PIDs are saved for easy cleanup

4. To stop all local services:
   ```bash
   ./stop.sh
   ```

## Static Deployment (GitHub Pages)

- The frontend (`maplibre` folder) can be deployed as a static site on GitHub Pages or similar static hosting.
- Configure `maplibre/config.json` to point to the hosted backend services:
  ```json
  {
    "mcp_server_url": "https://biodiversity-mcp.nrp-nautilus.io/sse",
    "llm_endpoint": "https://llm-proxy.nrp-nautilus.io/chat",
    "llm_host": "https://ellm.nrp-nautilus.io/v1",
    "llm_model": "qwen3"
  }
  ```
- Note: For local testing, use `http://localhost:8011/chat` for the LLM endpoint to avoid CORS issues.

## Configuration

### Frontend Configuration
- Endpoints are set in `maplibre/config.json`
- **Local testing** (default): Uses local LLM proxy at `http://localhost:8011/chat` and hosted MCP
- **GitHub Pages** (production): Uses hosted LLM proxy at `https://llm-proxy.nrp-nautilus.io/chat`
- **Local MCP** (`--local-mcp`): Adds local MCP server at `http://localhost:8001`

### Backend Services
- **LLM Proxy**: Always runs locally for CORS (local testing) or on K8s (GitHub Pages)
- **MCP Server**: Hosted by default, or local with `--local-mcp` flag
- **MCP Proxy**: Only needed for local MCP server (handles SSE protocol)

## Troubleshooting

- **CORS errors**: Ensure backend services are running and ingress CORS is properly configured
- **Authentication errors**: Verify `NRP_API_KEY` is set correctly
- **Connection errors**: Check that hosted services are accessible or use `--local` mode
- Use `./stop.sh` to clean up all local services before restarting

---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
