from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from schemas.request_models import RouteRequest
from services.route_service import find_route
import os

app = FastAPI(title="SafeRoute AI | Intelligent Navigation Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the frontend directory as static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    favicon_path = os.path.join(FRONTEND_DIR, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    # Return 204 No Content instead of 404 to silence browser errors
    from fastapi.responses import Response
    return Response(status_code=204)

@app.get("/")
def home():
    return {"message": "Sentinel AI Routing Backend Running"}

@app.get("/health")
def health():
    """Health check — responds immediately so Render knows the app is alive."""
    return {"status": "ok"}

@app.post("/predict")
def predict_route(data: RouteRequest):
    try:
        results = find_route(
            data.start_lat,
            data.start_lon,
            data.end_lat,
            data.end_lon
        )
        
        # If both routes are None, the selected points are unreachable
        if not results.get("safe_route") and not results.get("short_route"):
            raise HTTPException(
                status_code=422,
                detail="No walkable path found between the selected points. Try selecting points closer to roads."
            )

        return results
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        import traceback
        print(f"[ERROR] /predict failed: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal routing error: {str(e)}")