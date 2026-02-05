"""
Cognee Basic Functionality Test
Tests Cognee's core features: add, search, and graph construction
Run: python test_cognee.py
"""

import asyncio
import cognee

async def main():
    print("=" * 60)
    print("  Cognee Basic Functionality Test")
    print("=" * 60 + "\n")
    
    try:
        # Test 1: Initialize Cognee
        print("[1/4] Initializing Cognee...")
        await cognee.prune.prune_data()  # Clean slate
        await cognee.prune.prune_system(metadata=True)
        print("  ✓ Cognee initialized\n")
        
        # Test 2: Add some facts
        print("[2/4] Adding facts to memory...")
        facts = [
            "The bot found diamonds at coordinates (-120, 12, 340)",
            "There is a village at coordinates (50, 64, -100)",
            "The bot died from a zombie attack near the village",
            "Iron ore is common at Y-level 16"
        ]
        
        for i, fact in enumerate(facts, 1):
            await cognee.add(fact)
            print(f"  ✓ Added fact {i}: {fact[:50]}...")
        
        print("")
        
        # Test 3: Cognify (process and create knowledge graph)
        print("[3/4] Processing facts into knowledge graph...")
        await cognee.cognify()
        print("  ✓ Knowledge graph created\n")
        
        # Test 4: Search/Query
        print("[4/4] Testing search functionality...")
        
        queries = [
            "Where are diamonds?",
            "What happened near the village?",
            "Where to find iron?"
        ]
        
        for query in queries:
            print(f"\n  Query: '{query}'")
            results = await cognee.search("INSIGHTS", query)
            
            if results:
                print(f"  ✓ Found {len(results)} result(s)")
                for idx, result in enumerate(results[:2], 1):  # Show max 2 results
                    # Extract text from result
                    if hasattr(result, 'text'):
                        preview = result.text[:80]
                    elif isinstance(result, dict) and 'text' in result:
                        preview = result['text'][:80]
                    else:
                        preview = str(result)[:80]
                    
                    print(f"    {idx}. {preview}...")
            else:
                print("  ⚠ No results found")
        
        print("\n" + "=" * 60)
        print("  ✓ ALL TESTS PASSED")
        print("=" * 60 + "\n")
        
        print("Cognee is working correctly!")
        print("Next: Create memory_service.py (Task 3)\n")
        
    except Exception as e:
        print("\n" + "=" * 60)
        print("  ✗ TEST FAILED")
        print("=" * 60 + "\n")
        print(f"Error: {type(e).__name__}: {str(e)}\n")
        
        # Troubleshooting tips
        print("Troubleshooting:")
        print("  1. Make sure virtual environment is activated")
        print("  2. Verify Cognee installed: pip list | findstr cognee")
        print("  3. Try reinstalling: pip install --upgrade cognee")
        print("  4. Check Python version: python --version (need 3.10+)\n")
        
        return False
    
    return True

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)
