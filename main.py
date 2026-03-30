from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas.request_models import RouteRequest
from services.route_service import find_route

app = FastAPI(title="SafeRoute AI | Intelligent Navigation Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "Sentinel AI Routing Backend Running"}

@app.post("/predict-route")
def predict_route(data: RouteRequest):
    try:
        results = find_route(
            data.start_lat,
            data.start_lon,
            data.end_lat,
            data.end_lon
        )
        
        # If both are null, something is wrong
        if not results.get("safe_route") and not results.get("short_route"):
            raise HTTPException(status_code=404, detail="No route found between selected points")

        return results
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))