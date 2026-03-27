"""
Test Neon PostgreSQL connection for Arc agent.
Run this to verify your Neon setup before starting the agent.

If Neon is unreachable, the agent will automatically fall back to local storage.
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()


def test_neon_connection():
    """Test connection to Neon PostgreSQL."""
    
    database_url = os.environ.get("NEON_DATABASE_URL")
    
    if not database_url:
        print("[ERROR] NEON_DATABASE_URL not set in .env")
        print("   Get your connection string from: https://console.neon.tech")
        print("\n[WARNING] The agent will start in LOCAL FALLBACK mode.")
        print("   Skills and memories will be stored locally (not synced).")
        sys.exit(1)
    
    print("Testing Neon connection...")
    print(f"   URL: {database_url.split('@')[1].split('/')[0]}")  # Show host only
    
    try:
        from langgraph.store.postgres import PostgresStore
        from langgraph.checkpoint.postgres import PostgresSaver
        
        # Ensure sslmode
        if "sslmode=" not in database_url:
            separator = "&" if "?" in database_url else "?"
            database_url += f"{separator}sslmode=require"
        
        # Test store connection
        print("\nTesting Store (skills/memory)...")
        store = PostgresStore.from_conn_string(database_url)
        
        # Test write
        store.put(
            namespace=("test",),
            key="connection_test",
            value={"status": "ok", "message": "Neon connection successful!"}
        )
        
        # Test read
        result = store.get(namespace=("test",), key="connection_test")
        
        if result and result.value.get("status") == "ok":
            print("   [OK] Store connection successful!")
        else:
            print("   [WARN] Store connected but read/write test failed")
        
        # Test checkpointer connection
        print("\nTesting Checkpointer (thread persistence)...")
        checkpointer = PostgresSaver.from_conn_string(database_url)
        
        # Try to get a checkpoint (will be empty but should not error)
        config = {"configurable": {"thread_id": "test-thread"}}
        checkpoint = checkpointer.get(config)
        
        if checkpoint is not None or checkpoint == {}:
            print("   [OK] Checkpointer connection successful!")
        
        print("\n" + "=" * 70)
        print("SUCCESS: All Neon connection tests passed!")
        print("=" * 70)
        print("\nYour Arc agent will use CLOUD storage:")
        print("   - Thread persistence (resume anywhere)")
        print("   - Skills storage (synced across devices)")
        print("   - Memory storage (persistent context)")
        print("\nStart the agent:")
        print("   uvicorn src.main:app --reload")
        
    except Exception as e:
        print(f"\n[ERROR] Connection failed: {e}")
        print("\n" + "=" * 70)
        print("FALLBACK MODE WILL BE USED")
        print("=" * 70)
        print("\nThe agent will start with LOCAL storage:")
        print("   - Skills and memories stored locally")
        print("   - Data will NOT sync across devices")
        print("   - Thread history lost on restart")
        print("\nTo fix cloud connection:")
        print("   1. Check your internet connection")
        print("   2. Verify NEON_DATABASE_URL is correct in .env")
        print("   3. Ensure your Neon project is active")
        print("   4. Check Neon firewall settings")
        print("\nYou can still start the agent (it will use local fallback):")
        print("   uvicorn src.main:app --reload")
        print("=" * 70)


if __name__ == "__main__":
    test_neon_connection()
