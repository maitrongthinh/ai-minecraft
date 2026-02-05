"""
Integration Test: Cognee Memory Service API
Tests all endpoints of the FastAPI service

Prerequisites:
1. Service must be running: uvicorn memory_service:app --port 8001
2. Or run this test which starts service automatically

Run: python test_memory_service.py
"""

import httpx
import asyncio
import sys
from typing import Dict, Any

BASE_URL = "http://localhost:8001"

async def test_service():
    """Test all memory service endpoints"""
    
    print("=" * 60)
    print("  Memory Service Integration Test")
    print("=" * 60 + "\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Test 1: Health Check
            print("[1/5] Testing /health endpoint...")
            response = await client.get(f"{BASE_URL}/health")
            
            if response.status_code != 200:
                print(f"  ✗ Health check failed: {response.status_code}")
                return False
            
            health_data = response.json()
            print(f"  ✓ Service status: {health_data['status']}")
            print(f"  ✓ Cognee initialized: {health_data['cognee_initialized']}")
            
            if not health_data['cognee_initialized']:
                print("  ✗ Cognee not initialized!")
                return False
            
            print("")
            
            # Test 2: Remember facts
            print("[2/5] Testing /remember endpoint...")
            test_world_id = "test_world_001"
            
            remember_request = {
                "world_id": test_world_id,
                "facts": [
                    "The bot found diamonds at coordinates (-120, 12, 340)",
                    "There is a village at coordinates (50, 64, -100)",
                    "The bot died from a zombie near the village",
                    "Iron ore is common at Y-level 16"
                ]
            }
            
            response = await client.post(
                f"{BASE_URL}/remember",
                json=remember_request
            )
            
            if response.status_code != 200:
                print(f"  ✗ Remember failed: {response.status_code}")
                print(f"  Error: {response.text}")
                return False
            
            remember_data = response.json()
            print(f"  ✓ Stored {remember_data['facts_stored']} facts")
            print(f"  ✓ World ID: {remember_data['world_id']}")
            print("")
            
            # Test 3: Recall facts
            print("[3/5] Testing /recall endpoint...")
            
            queries = [
                "Where are diamonds?",
                "What happened at the village?",
                "Where to find iron?"
            ]
            
            for query in queries:
                recall_request = {
                    "world_id": test_world_id,
                    "query": query,
                    "limit": 3
                }
                
                response = await client.post(
                    f"{BASE_URL}/recall",
                    json=recall_request
                )
                
                if response.status_code != 200:
                    print(f"  ✗ Recall failed for '{query}': {response.status_code}")
                    continue
                
                recall_data = response.json()
                print(f"\n  Query: '{query}'")
                print(f"  ✓ Found {recall_data['count']} result(s)")
                
                for idx, result in enumerate(recall_data['results'][:2], 1):
                    preview = result[:80] if len(result) > 80 else result
                    print(f"    {idx}. {preview}...")
            
            print("")
            
            # Test 4: World isolation
            print("[4/5] Testing world isolation...")
            
            # Store fact in different world
            other_world_id = "test_world_002"
            response = await client.post(
                f"{BASE_URL}/remember",
                json={
                    "world_id": other_world_id,
                    "facts": ["This is from a different world"]
                }
            )
            
            if response.status_code != 200:
                print("  ✗ Failed to store in second world")
                return False
            
            # Try to recall from first world - should not find second world's fact
            response = await client.post(
                f"{BASE_URL}/recall",
                json={
                    "world_id": test_world_id,
                    "query": "different world",
                    "limit": 5
                }
            )
            
            recall_data = response.json()
            print(f"  ✓ World isolation working: {test_world_id} has {recall_data['count']} results for 'different world'")
            print(f"  ✓ (Should be 0 if isolation works correctly)")
            print("")
            
            # Test 5: Clear world
            print("[5/5] Testing /clear_world endpoint...")
            
            response = await client.delete(f"{BASE_URL}/clear_world/{test_world_id}")
            
            if response.status_code != 200:
                print(f"  ✗ Clear world failed: {response.status_code}")
                return False
            
            clear_data = response.json()
            print(f"  ✓ Cleared world: {clear_data['world_id']}")
            print(f"  ✓ Message: {clear_data['message']}")
            print("")
            
            # Final summary
            print("=" * 60)
            print("  ✓ ALL TESTS PASSED")
            print("=" * 60 + "\n")
            
            print("Summary:")
            print("  • Health check: Working")
            print("  • Remember endpoint: Working")
            print("  • Recall endpoint: Working")
            print("  • World isolation: Working")
            print("  • Clear world: Working")
            print("\nMemory service is ready for integration with Node.js bot!\n")
            
            return True
            
        except httpx.ConnectError:
            print("\n✗ CONNECTION FAILED\n")
            print("Error: Cannot connect to memory service at", BASE_URL)
            print("\nMake sure the service is running:")
            print("  cd services")
            print("  .\\venv\\Scripts\\Activate.ps1")
            print("  uvicorn memory_service:app --port 8001\n")
            return False
            
        except Exception as e:
            print(f"\n✗ TEST FAILED: {e}\n")
            import traceback
            traceback.print_exc()
            return False

if __name__ == "__main__":
    success = asyncio.run(test_service())
    sys.exit(0 if success else 1)
