"""
Initialize all local skills in Neon cloud storage.

This script:
1. Discovers all skills in ~/.agents/skills/
2. Uploads them to Neon PostgreSQL cloud storage
3. Makes them available to the Arc agent from any device

Usage:
    python init_cloud_skills.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Configuration
LOCAL_SKILLS_DIR = Path.home() / ".agents" / "skills"
EXCLUDED_SKILLS = {"kimi-cli-help", "skill-creator"}  # Internal/system skills


def discover_skills():
    """Discover all available skills."""
    skills = []
    
    if not LOCAL_SKILLS_DIR.exists():
        print(f"❌ Skills directory not found: {LOCAL_SKILLS_DIR}")
        return skills
    
    for skill_dir in sorted(LOCAL_SKILLS_DIR.iterdir()):
        if not skill_dir.is_dir():
            continue
        
        if skill_dir.name in EXCLUDED_SKILLS:
            continue
        
        skill_md = skill_dir / "SKILL.md"
        if skill_md.exists():
            skills.append({
                "name": skill_dir.name,
                "path": skill_dir,
                "size": skill_md.stat().st_size,
            })
    
    return skills


def read_skill_content(skill_path: Path) -> str:
    """Read the SKILL.md file."""
    try:
        return skill_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  ⚠️  Error reading {skill_path}: {e}")
        return ""


def upload_to_cloud(skills):
    """Upload all skills to Neon cloud storage."""
    
    database_url = os.environ.get("NEON_DATABASE_URL")
    if not database_url:
        print("❌ NEON_DATABASE_URL not set")
        return False
    
    try:
        from langgraph.store.postgres import PostgresStore
        from deepagents.backends.utils import create_file_data
        
        # Ensure sslmode
        if "sslmode=" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += f"{separator}sslmode=require"
        
        print("☁️  Connecting to Neon PostgreSQL...")
        store = PostgresStore.from_conn_string(database_url)
        
        print(f"📤 Uploading {len(skills)} skills to cloud...\n")
        
        success_count = 0
        for i, skill in enumerate(skills, 1):
            print(f"[{i}/{len(skills)}] 📦 {skill['name']}...", end=" ")
            
            try:
                content = read_skill_content(skill['path'] / "SKILL.md")
                if content:
                    virtual_path = f"/skills/{skill['name']}/SKILL.md"
                    store.put(
                        namespace=("filesystem",),
                        key=virtual_path,
                        value=create_file_data(content)
                    )
                    print("✅")
                    success_count += 1
                else:
                    print("⚠️  (empty)")
            except Exception as e:
                print(f"❌ ({e})")
        
        print(f"\n🎉 Successfully uploaded {success_count}/{len(skills)} skills to cloud!")
        print("\nYour Arc agent can now access these skills from any device.")
        return True
        
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: pip install -e \".[dev]\"")
        return False
    except Exception as e:
        print(f"❌ Error connecting to Neon: {e}")
        print("\n💡 Troubleshooting:")
        print("   1. Check NEON_DATABASE_URL in .env")
        print("   2. Verify internet connection")
        print("   3. Check Neon project status at https://console.neon.tech")
        return False


def main():
    print("=" * 70)
    print("🚀 Arc Skills Cloud Initialization")
    print("=" * 70)
    print()
    
    # Discover skills
    print("🔍 Discovering local skills...")
    skills = discover_skills()
    
    if not skills:
        print("❌ No skills found in ~/.agents/skills/")
        sys.exit(1)
    
    print(f"✅ Found {len(skills)} skills:\n")
    for skill in skills:
        size_kb = skill['size'] / 1024
        print(f"   • {skill['name']:<35} ({size_kb:.1f} KB)")
    
    print()
    
    # Confirm
    confirm = input(f"Upload {len(skills)} skills to cloud? [y/N]: ")
    if confirm.lower() != 'y':
        print("❌ Cancelled")
        sys.exit(0)
    
    print()
    
    # Upload
    if upload_to_cloud(skills):
        print("\n✨ Done! Your skills are now in the cloud.")
        print("\nStart your agent:")
        print("   uvicorn src.main:app --reload")
    else:
        print("\n⚠️  Upload failed. The agent will use local fallback mode.")
        sys.exit(1)


if __name__ == "__main__":
    main()
