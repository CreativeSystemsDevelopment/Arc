"""
Remove Azure skills from Neon cloud storage.

This script removes all Azure-related skills from the cloud database.
Run this if Azure skills were previously synced and need to be removed.

Usage:
    python remove_azure_skills.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

# List of Azure skills to remove
AZURE_SKILLS = [
    "appinsights-instrumentation",
    "azure-ai",
    "azure-aigateway",
    "azure-cloud-migrate",
    "azure-compliance",
    "azure-compute",
    "azure-cost-optimization",
    "azure-deploy",
    "azure-diagnostics",
    "azure-hosted-copilot-sdk",
    "azure-kusto",
    "azure-messaging",
    "azure-observability",
    "azure-prepare",
    "azure-quotas",
    "azure-rbac",
    "azure-resource-lookup",
    "azure-resource-visualizer",
    "azure-storage",
    "azure-validate",
]


def remove_azure_skills_from_cloud():
    """Remove all Azure skills from Neon cloud storage."""
    
    database_url = os.environ.get("NEON_DATABASE_URL")
    if not database_url:
        print("[ERROR] NEON_DATABASE_URL not set")
        return False
    
    try:
        from langgraph.store.postgres import PostgresStore
        
        # Ensure sslmode
        if "sslmode=" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += f"{separator}sslmode=require"
        
        print("[Cloud] Connecting to Neon PostgreSQL...")
        store = PostgresStore.from_conn_string(database_url)
        
        print(f"[Cloud] Removing {len(AZURE_SKILLS)} Azure skills...\n")
        
        removed_count = 0
        for skill_name in AZURE_SKILLS:
            skill_path = f"/skills/{skill_name}/SKILL.md"
            try:
                # Try to delete the skill
                store.delete(namespace=("filesystem",), key=skill_path)
                print(f"[REMOVED] {skill_name}")
                removed_count += 1
            except Exception as e:
                # Skill might not exist, which is fine
                if "not found" in str(e).lower() or "no such" in str(e).lower():
                    print(f"[NOT FOUND] {skill_name} (already removed or never synced)")
                else:
                    print(f"[ERROR] {skill_name}: {e}")
        
        print(f"\n[SUCCESS] Removed {removed_count} Azure skills from cloud storage")
        return True
        
    except ImportError as e:
        print(f"[ERROR] Missing dependency: {e}")
        print("   Run: pip install -e \".[dev]\"")
        return False
    except Exception as e:
        print(f"[ERROR] Failed to connect to Neon: {e}")
        return False


def list_remaining_cloud_skills():
    """List skills that remain in cloud storage after removal."""
    
    database_url = os.environ.get("NEON_DATABASE_URL")
    if not database_url:
        return
    
    try:
        from langgraph.store.postgres import PostgresStore
        
        if "sslmode=" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += f"{separator}sslmode=require"
        
        store = PostgresStore.from_conn_string(database_url)
        
        print("\n[Cloud] Remaining skills in cloud storage:")
        print("   (Note: Listing requires direct database query)")
        print("   Use: SELECT key FROM store WHERE namespace = '{filesystem}' AND key LIKE '/skills/%'")
        
    except Exception as e:
        print(f"[ERROR] Could not list skills: {e}")


def main():
    print("=" * 70)
    print("Azure Skills Removal from Cloud Storage")
    print("=" * 70)
    print()
    
    print(f"This will remove {len(AZURE_SKILLS)} Azure skills from Neon cloud storage:")
    for skill in AZURE_SKILLS:
        print(f"  - {skill}")
    print()
    
    confirm = input("Are you sure you want to remove these skills? [y/N]: ")
    if confirm.lower() != 'y':
        print("Cancelled")
        return
    
    print()
    
    if remove_azure_skills_from_cloud():
        list_remaining_cloud_skills()
        print("\n[COMPLETE] Azure skills have been removed from cloud storage")
        print("\nRemaining non-Azure skills (will be kept):")
        print("  - entra-app-registration")
        print("  - langgraph-deepagent-docs")
        print("  - microsoft-foundry")
    else:
        print("\n[FAILED] Could not remove Azure skills")
        sys.exit(1)


if __name__ == "__main__":
    main()
