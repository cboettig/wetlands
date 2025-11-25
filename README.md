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

## Local Development (with Proxies)

To run the full application locally, including backend proxies for CORS and LLM/MCP integration:

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/boettiger-lab/wetlands.git
   cd wetlands
   uv pip install -r requirements.txt
   ```
2. Set your API key (required for LLM proxy):
   ```bash
   export NRP_API_KEY="your-api-key-here"
   ```
3. Start all backend services (HTTP server, MCP server, MCP proxy, LLM proxy):
   ```bash
   ./start.sh
   ```
   - This will launch all services in the background and save their PIDs for easy cleanup.
   - To stop all services, run:
   ```bash
   ./stop.sh
   ```
4. Open [http://localhost:8000](http://localhost:8000) in your browser to use the app.

## Static Deployment (GitHub Pages)

- The frontend (maplibre folder) can be deployed as a static site on GitHub Pages or similar static hosting.
- **Limitations:** Without the backend proxies, browser requests to MCP/LLM endpoints may fail due to CORS restrictions.
- For full chatbot functionality, use local deployment with proxies as described above.

## Configuration
- Endpoints for MCP and LLM are set in `maplibre/config.json` and proxied via FastAPI apps in `app/mcp_proxy.py` and `app/llm_proxy.py`.
- Local artifacts (logs, pid files, duck.db) are ignored via `.gitignore`.

## Troubleshooting
- If you encounter CORS errors or 500/404 errors, ensure all backend proxies are running and endpoints are correctly set in `config.json`.
- Use `./stop.sh` to clean up all services before restarting.

---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
