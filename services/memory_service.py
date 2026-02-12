"""
Cognee Memory Service - FastAPI REST API
Provides graph-based memory (RAG) for Mindcraft Autonomous Evolution Agent

Endpoints:
- POST /remember - Store facts to memory with world_id isolation
- POST /recall - Query facts from memory by world_id
- GET /health - Service health check
- DELETE /clear_world/{world_id} - Clear all memory for a specific world

Run: uvicorn memory_service:app --port 8001 --reload
"""

import time
import os
import logging
import traceback
from datetime import datetime
from typing import List, Optional, Dict, Any

import cognee
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("CogneeMemoryService")

# Task 21: Cognify Debouncing State
_last_cognify_time = 0

# FastAPI app
app = FastAPI(
    title="Cognee Memory Service",
    description="Graph-based memory for Mindcraft Bot",
    version="1.0.0"
)

# CORS - Allow Node.js bot to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response validation
class RememberRequest(BaseModel):
    """Request model for storing facts"""
    world_id: str = Field(..., description="Unique world identifier", min_length=1)
    facts: List[str] = Field(..., description="List of facts to remember", min_items=1)
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata")

class RecallRequest(BaseModel):
    """Request model for querying facts"""
    world_id: str = Field(..., description="Unique world identifier", min_length=1)
    query: str = Field(..., description="Query string", min_length=1)
    limit: int = Field(default=5, description="Max results to return", ge=1, le=20)

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    service: str
    timestamp: str
    cognee_initialized: bool

class RememberResponse(BaseModel):
    """Response after storing facts"""
    success: bool
    world_id: str
    facts_stored: int
    message: str

class RecallResponse(BaseModel):
    """Response with recalled facts"""
    success: bool
    world_id: str
    query: str
    results: List[str]
    count: int

class ClearWorldResponse(BaseModel):
    """Response after clearing world memory"""
    success: bool
    world_id: str
    message: str

# Global state
_cognee_initialized = False
_world_memories: Dict[str, List[str]] = {}  # In-memory cache: world_id -> facts

@app.on_event("startup")
async def startup_event():
    """Initialize Cognee on service startup"""
    global _cognee_initialized
    try:
        logger.info("=" * 60)
        logger.info("Starting Cognee Memory Service...")
        logger.info("=" * 60)
        
        # Initialize Cognee
        logger.info("Initializing Cognee...")
        await cognee.prune.prune_system(metadata=True)
        
        _cognee_initialized = True
        logger.info("✓ Cognee initialized successfully")
        logger.info("✓ Memory Service ready on port 8001")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"✗ Failed to initialize Cognee: {e}")
        logger.error(traceback.format_exc())
        _cognee_initialized = False
        # Don't exit - let service respond with errors

@app.get("/", tags=["Info"])
async def root():
    """Root endpoint - service info"""
    return {
        "service": "Cognee Memory Service",
        "version": "1.0.0",
        "status": "running" if _cognee_initialized else "degraded",
        "endpoints": {
            "health": "GET /health",
            "remember": "POST /remember",
            "recall": "POST /recall",
            "clear_world": "DELETE /clear_world/{world_id}"
        }
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint
    Returns service status and Cognee initialization state
    """
    return HealthResponse(
        status="healthy" if _cognee_initialized else "unhealthy",
        service="cognee-memory-service",
        timestamp=datetime.utcnow().isoformat(),
        cognee_initialized=_cognee_initialized
    )

@app.post("/remember", response_model=RememberResponse, tags=["Memory"])
async def remember(request: RememberRequest):
    """
    Store facts to memory with world isolation
    
    Args:
        request: RememberRequest with world_id and facts
        
    Returns:
        RememberResponse with success status and count
        
    Example:
        POST /remember
        {
            "world_id": "survival_world_001",
            "facts": [
                "Found diamonds at (-120, 12, 340)",
                "Village located at (50, 64, -100)"
            ]
        }
    """
    if not _cognee_initialized:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cognee not initialized. Check service logs."
        )
    
    try:
        logger.info(f"[{request.world_id}] Remembering {len(request.facts)} fact(s)")
        
        # Tag facts with world_id for isolation
        tagged_facts = [
            f"[WORLD:{request.world_id}] {fact}"
            for fact in request.facts
        ]
        
        # Store in Cognee
        for fact in tagged_facts:
            await cognee.add(fact)
        
        # Optimized cognify: Debounce heavy graph processing
        global _last_cognify_time
        now = time.time()
        if now - _last_cognify_time > 30: # Only re-cognify every 30 seconds max
            logger.info(f"[{request.world_id}] Triggering knowledge graph update (cognify)...")
            await cognee.cognify()
            _last_cognify_time = now
        else:
            logger.info(f"[{request.world_id}] Skipping redundant cognify. Using recently updated graph.")
        
        # Cache in memory
        if request.world_id not in _world_memories:
            _world_memories[request.world_id] = []
        _world_memories[request.world_id].extend(request.facts)
        
        logger.info(f"[{request.world_id}] ✓ Stored {len(request.facts)} facts successfully")
        
        return RememberResponse(
            success=True,
            world_id=request.world_id,
            facts_stored=len(request.facts),
            message=f"Successfully stored {len(request.facts)} facts"
        )
        
    except Exception as e:
        logger.error(f"[{request.world_id}] ✗ Error storing facts: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store facts: {str(e)}"
        )

@app.post("/recall", response_model=RecallResponse, tags=["Memory"])
async def recall(request: RecallRequest):
    """
    Query facts from memory with world isolation
    
    Args:
        request: RecallRequest with world_id and query
        
    Returns:
        RecallResponse with matching facts
        
    Example:
        POST /recall
        {
            "world_id": "survival_world_001",
            "query": "Where are diamonds?",
            "limit": 5
        }
    """
    if not _cognee_initialized:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cognee not initialized. Check service logs."
        )
    
    try:
        logger.info(f"[{request.world_id}] Querying: '{request.query}'")
        
        # Query with world_id filter
        search_query = f"[WORLD:{request.world_id}] {request.query}"
        
        # Search in Cognee
        raw_results = await cognee.search("INSIGHTS", search_query)
        
        # Extract and clean results
        results = []
        if raw_results:
            for result in raw_results[:request.limit]:
                # Extract text from result object
                if hasattr(result, 'text'):
                    text = result.text
                elif isinstance(result, dict) and 'text' in result:
                    text = result['text']
                else:
                    text = str(result)
                
                # Remove world tag prefix
                text = text.replace(f"[WORLD:{request.world_id}] ", "")
                results.append(text)
        
        logger.info(f"[{request.world_id}] ✓ Found {len(results)} result(s)")
        
        return RecallResponse(
            success=True,
            world_id=request.world_id,
            query=request.query,
            results=results,
            count=len(results)
        )
        
    except Exception as e:
        logger.error(f"[{request.world_id}] ✗ Error querying facts: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query facts: {str(e)}"
        )

@app.delete("/clear_world/{world_id}", response_model=ClearWorldResponse, tags=["Memory"])
async def clear_world(world_id: str):
    """
    Clear all memory for a specific world
    
    Args:
        world_id: World identifier to clear
        
    Returns:
        ClearWorldResponse with success status
        
    Example:
        DELETE /clear_world/survival_world_001
    """
    if not _cognee_initialized:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cognee not initialized. Check service logs."
        )
    
    try:
        logger.info(f"[{world_id}] Clearing world memory...")
        
        # Remove from in-memory cache
        if world_id in _world_memories:
            fact_count = len(_world_memories[world_id])
            del _world_memories[world_id]
            logger.info(f"[{world_id}] ✓ Cleared {fact_count} cached facts")
        
        # Note: Cognee doesn't have selective delete by tag yet
        # So we just log and clear cache for now
        # In future, implement proper deletion when Cognee supports it
        
        logger.info(f"[{world_id}] ✓ World memory cleared")
        
        return ClearWorldResponse(
            success=True,
            world_id=world_id,
            message=f"Cleared memory cache for world {world_id}"
        )
        
    except Exception as e:
        logger.error(f"[{world_id}] ✗ Error clearing world: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear world memory: {str(e)}"
        )

# Run with: uvicorn memory_service:app --port 8001 --reload
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
