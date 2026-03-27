"""
Skills Manager for Arc Agent

Manages loading, syncing, and migrating skills between local storage and cloud storage (Neon).

Usage:
    python skills_manager.py sync      # Sync all local skills to cloud
    python skills_manager.py list      # List all skills
    python skills_manager.py migrate   # Migrate from local to cloud
"""

import os
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Optional

from dotenv import load_dotenv

load_dotenv()

# Local skills directory
LOCAL_SKILLS_DIR = Path.home() / ".agents" / "skills"

# Skills that should be excluded from cloud sync
EXCLUDED_SKILLS = {
    "kimi-cli-help",  # Internal CLI help
    # Azure skills - excluded per user request
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
}


def discover_local_skills() -> List[Dict]:
    """Discover all skills in the local skills directory."""
    skills = []
    
    if not LOCAL_SKILLS_DIR.exists():
        print(f"[ERROR] Local skills directory not found: {LOCAL_SKILLS_DIR}")
        return skills
    
    for skill_dir in LOCAL_SKILLS_DIR.iterdir():
        if not skill_dir.is_dir():
            continue
        
        skill_name = skill_dir.name
        
        # Skip excluded skills
        if skill_name in EXCLUDED_SKILLS:
            continue
        
        skill_md = skill_dir / "SKILL.md"
        
        if skill_md.exists():
            # Read the skill metadata
            try:
                content = skill_md.read_text(encoding="utf-8")
                
                # Extract name and description from frontmatter if present
                name = skill_name
                description = ""
                
                if content.startswith("---"):
                    # Parse YAML frontmatter
                    parts = content.split("---", 2)
                    if len(parts) >= 3:
                        frontmatter = parts[1]
                        for line in frontmatter.split("\n"):
                            if line.startswith("name:"):
                                name = line.split(":", 1)[1].strip()
                            elif line.startswith("description:"):
                                description = line.split(":", 1)[1].strip()
                
                skills.append({
                    "name": name,
                    "dir_name": skill_name,
                    "path": skill_dir,
                    "skill_md": skill_md,
                    "description": description,
                    "size": skill_md.stat().st_size,
                })
            except Exception as e:
                print(f"[WARN] Error reading skill {skill_name}: {e}")
    
    return sorted(skills, key=lambda s: s["name"])


def read_skill_files(skill_dir: Path) -> Dict[str, str]:
    """Read all files in a skill directory."""
    files = {}
    
    for file_path in skill_dir.rglob("*"):
        if file_path.is_file():
            # Get relative path from skill directory
            rel_path = file_path.relative_to(skill_dir)
            virtual_path = f"/skills/{skill_dir.name}/{rel_path}"
            
            try:
                # Read as text if possible, otherwise skip binary files
                try:
                    content = file_path.read_text(encoding="utf-8")
                    files[virtual_path] = content
                except UnicodeDecodeError:
                    # Skip binary files for now
                    print(f"  [WARN] Skipping binary file: {rel_path}")
            except Exception as e:
                print(f"  [WARN] Error reading {rel_path}: {e}")
    
    return files


def sync_skills_to_cloud(skills: List[Dict], dry_run: bool = False):
    """Sync all skills to Neon cloud storage."""
    
    database_url = os.environ.get("NEON_DATABASE_URL")
    if not database_url:
        print("[ERROR] NEON_DATABASE_URL not set. Cannot sync to cloud.")
        return False
    
    try:
        from langgraph.store.postgres import PostgresStore
        from deepagents.backends.utils import create_file_data
        
        # Ensure sslmode
        if "sslmode=" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += f"{separator}sslmode=require"
        
        print("[Cloud] Connecting to Neon...")
        store = PostgresStore.from_conn_string(database_url)
        
        print(f"[Cloud] Syncing {len(skills)} skills to cloud storage...\n")
        
        for i, skill in enumerate(skills, 1):
            print(f"[{i}/{len(skills)}] Uploading {skill['name']}...")
            
            if dry_run:
                print(f"   (Dry run - would upload {skill['size']} bytes)")
                continue
            
            # Read all files in the skill directory
            files = read_skill_files(skill['path'])
            
            # Upload each file to cloud storage
            for virtual_path, content in files.items():
                try:
                    store.put(
                        namespace=("filesystem",),
                        key=virtual_path,
                        value=create_file_data(content)
                    )
                except Exception as e:
                    print(f"   [ERROR] Error uploading {virtual_path}: {e}")
            
            print(f"   [OK] Uploaded {len(files)} files")
        
        print(f"\n[SUCCESS] Synced {len(skills)} skills to cloud!")
        return True
        
    except Exception as e:
        print(f"\n[ERROR] Failed to sync to cloud: {e}")
        print("\n[TROUBLESHOOTING]")
        print("   1. Check your NEON_DATABASE_URL")
        print("   2. Verify your internet connection")
        print("   3. Ensure Neon project is active")
        return False


def list_cloud_skills():
    """List all skills in cloud storage."""
    
    database_url = os.environ.get("NEON_DATABASE_URL")
    if not database_url:
        print("[ERROR] NEON_DATABASE_URL not set.")
        return
    
    try:
        from langgraph.store.postgres import PostgresStore
        
        # Ensure sslmode
        if "sslmode=" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += f"{separator}sslmode=require"
        
        store = PostgresStore.from_conn_string(database_url)
        
        # List all skills in the /skills/ namespace
        # This is a bit tricky with PostgresStore - we'd need to search
        print("[Cloud] Cloud skills listing requires direct database query.")
        print("   Use psql or Neon console to view stored data.")
        
    except Exception as e:
        print(f"[ERROR] {e}")


def main():
    parser = argparse.ArgumentParser(description="Manage Arc agent skills")
    parser.add_argument(
        "command",
        choices=["sync", "list", "discover", "migrate"],
        help="Command to execute"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be synced without uploading"
    )
    
    args = parser.parse_args()
    
    if args.command == "discover" or args.command == "list":
        print("Discovering local skills...\n")
        skills = discover_local_skills()
        
        if not skills:
            print("[ERROR] No skills found in ~/.agents/skills/")
            return
        
        print(f"Found {len(skills)} skills:\n")
        print(f"{'Name':<40} {'Size':>10} {'Path':<30}")
        print("-" * 80)
        
        for skill in skills:
            size_kb = skill['size'] / 1024
            print(f"{skill['name']:<40} {size_kb:>8.1f}KB  {skill['dir_name']:<30}")
            if skill['description']:
                print(f"  --> {skill['description'][:60]}...")
        
        print(f"\nTotal: {len(skills)} skills")
    
    elif args.command == "sync" or args.command == "migrate":
        print("Skills Sync to Cloud\n")
        
        skills = discover_local_skills()
        if not skills:
            print("[ERROR] No skills to sync")
            return
        
        print(f"Found {len(skills)} skills to sync:\n")
        for skill in skills:
            print(f"  - {skill['name']}")
        
        print()
        
        if args.dry_run:
            print("DRY RUN MODE - No actual upload\n")
        
        confirm = input(f"Sync {len(skills)} skills to cloud? [y/N]: ")
        if confirm.lower() == 'y':
            sync_skills_to_cloud(skills, dry_run=args.dry_run)
        else:
            print("Cancelled")


if __name__ == "__main__":
    main()
