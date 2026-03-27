# Arc Setup Guide — Neon Cloud Configuration

## ✅ Configuration Complete

Your Arc agent is now configured with:

| Component | Setting |
|-----------|---------|
| **Model** | `openrouter:moonshotai/kimi-k2.5` |
| **API Key** | OpenRouter configured |
| **Persistence** | Neon PostgreSQL (cloud) |
| **Mode** | `ARC_MODE=neon` |

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
cd backend
pip install -e ".[dev]"
```

### Step 2: Test Neon Connection

```bash
python test_neon.py
```

Expected output:
```
🔍 Testing Neon connection...
   URL: ep-dry-block-anzqwdlr-pooler.c-6.us-east-1.aws.neon.tech

📦 Testing Store (skills/memory)...
   ✅ Store connection successful!

💾 Testing Checkpointer (thread persistence)...
   ✅ Checkpointer connection successful!

==================================================
🎉 All Neon connection tests passed!
==================================================
```

### Step 3: Start the Backend

```bash
uvicorn src.main:app --reload --port 8000
```

You should see:
```
[Arc] Loading Neon cloud agent configuration...
INFO:     Application startup complete.
```

### Step 4: Start the Frontend (Optional)

```bash
cd frontend
npm install
npm run dev
```

## 📁 Your Neon Database

**Connection String:**
```
postgresql://neondb_owner:npg_oBj1wuzIR8mL@ep-dry-block-anzqwdlr-pooler.c-6.us-east-1.aws.neon.tech/Arc?sslmode=require&channel_binding=require
```

**Database Name:** `Arc`

**What Gets Stored:**

| Data | Location | Persistence |
|------|----------|-------------|
| Thread history | Neon PostgreSQL | ✅ Cloud (access anywhere) |
| Checkpoints | Neon PostgreSQL | ✅ Cloud (resume anywhere) |
| Skills | Neon PostgreSQL | ✅ Cloud (synced everywhere) |
| Memory | Neon PostgreSQL | ✅ Cloud (persistent) |
| Working files | `./workspace/` | Local (temporary) |

## 🔧 Available Agent Modes

Switch modes by changing `ARC_MODE` in `.env`:

```bash
# Local mode (no cloud persistence)
ARC_MODE=local

# Neon mode (cloud persistence - ACTIVE)
ARC_MODE=neon
NEON_DATABASE_URL=postgresql://...
```

## 🛠️ What's Included

### Agent Capabilities
- ✅ Planning with `write_todos`
- ✅ 4 Sub-agents (researcher, coder, doc-extraction, uiux)
- ✅ File system tools (read, write, edit, ls, glob, grep)
- ✅ Web search (Tavily)
- ✅ VM health monitoring
- ✅ Reflection and skill creation
- ✅ Human-in-the-loop (HITL) for destructive operations

### Cloud Features
- ✅ Thread persistence (resume conversations anywhere)
- ✅ Skills storage (synced across devices)
- ✅ Memory storage (persistent context)
- ✅ Cross-device access

## 📝 Next Steps

1. **Add Tavily API Key** (for web search):
   - Get key at https://tavily.com
   - Add to `.env`: `TAVILY_API_KEY=tvly-...`

2. **Add LangSmith API Key** (for observability):
   - Get key at https://smith.langchain.com
   - Add to `.env`: `LANGCHAIN_API_KEY=ls__...`

3. **Customize Skills**:
   - Add skill folders to `./workspace/skills/`
   - Each skill needs a `SKILL.md` file

4. **Add Memories**:
   - Edit `./workspace/memories/AGENTS.md`
   - Add project conventions and preferences

## 🆘 Troubleshooting

### Connection Failed

```bash
# Test with verbose output
python test_neon.py
```

Common issues:
- **Wrong connection string**: Copy from Neon Console → Connection Details
- **Network blocked**: Check firewall/VPN settings
- **Database not active**: Verify Neon project status in dashboard

### Module Not Found

```bash
# Reinstall dependencies
cd backend
pip install -e ".[dev]" --force-reinstall
```

### Port Already in Use

```bash
# Use different port
uvicorn src.main:app --reload --port 8001
```

## 📚 Resources

- **Neon Console**: https://console.neon.tech
- **Neon Docs**: https://neon.tech/docs
- **Deep Agents Docs**: https://docs.langchain.com/oss/python/deepagents/overview
- **OpenRouter**: https://openrouter.ai

---

**Your Arc agent is ready!** Start with `python test_neon.py` to verify, then launch with `uvicorn src.main:app --reload`.
