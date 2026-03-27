# Arc Skills Configuration

## Excluded Skills

The following Azure skills are **excluded** from the Arc agent:

### Azure Skills (Excluded)
- appinsights-instrumentation
- azure-ai
- azure-aigateway
- azure-cloud-migrate
- azure-compliance
- azure-compute
- azure-cost-optimization
- azure-deploy
- azure-diagnostics
- azure-hosted-copilot-sdk
- azure-kusto
- azure-messaging
- azure-observability
- azure-prepare
- azure-quotas
- azure-rbac
- azure-resource-lookup
- azure-resource-visualizer
- azure-storage
- azure-validate

## Active Skills

The following skills are **enabled** and will be synced to cloud storage:

1. **entra-app-registration**
   - Guides Microsoft Entra ID app registration, OAuth 2.0 authentication, and MSAL integration
   - Use for: Creating app registrations, configuring OAuth, setting up authentication

2. **langgraph-deepagent-docs**
   - LangGraph Deep Agents SDK documentation and patterns
   - Use for: create_deep_agent, subagent configuration, middleware, built-in tools
   - Created: 2026-03-27

3. **microsoft-foundry**
   - Deploy, evaluate, and manage Foundry agents end-to-end
   - Use for: Foundry deployment, prompt optimization, batch evaluation

## Configuration

### Exclusion Logic

Azure skills are excluded in:
- `backend/src/skills_manager.py` - EXCLUDED_SKILLS set
- `backend/src/agent_neon.py` - Cloud storage sync
- `backend/src/remove_azure_skills.py` - Removal script

### To Re-add Azure Skills

1. Remove the skill name from `EXCLUDED_SKILLS` in `skills_manager.py`
2. Run the sync command:
   ```bash
   cd backend
   python -c "from src.skills_manager import *; sync_skills_to_cloud(discover_local_skills())"
   ```

### To Remove Skills from Cloud

If Azure skills were previously synced to Neon:

```bash
cd backend
python src/remove_azure_skills.py
```

## Skill Storage Locations

| Skill Type | Local Path | Cloud Path |
|-----------|-----------|-----------|
| Active skills | `~/.agents/skills/` | `/skills/{name}/SKILL.md` in Neon |
| Excluded skills | `~/.agents/skills/` | Not synced |

## Total Skills

- **Total discovered**: 23
- **Excluded (Azure)**: 20
- **Active**: 3
