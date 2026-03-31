# services/route_service.py

import os
import math
import osmnx as ox
import networkx as nx
from services.risk_service import get_node_risk

# -----------------------------
# Graph config
# -----------------------------
PLACE = "Tiruchirappalli, Tamil Nadu, India"
GRAPH_FILE = "trichy_graph.graphml"

# Lazy-loaded graph — loaded on first request, not at import time
_G = None

def _load_graph():
    """Load or download the city graph. Called once on first request."""
    global _G
    if _G is not None:
        return _G

    if os.path.exists(GRAPH_FILE):
        print("[route_service] Loading graph from disk cache...")
        _G = ox.load_graphml(GRAPH_FILE)
    else:
        print(f"[route_service] Downloading road network for: {PLACE}")
        try:
            _G = ox.graph_from_place(PLACE, network_type='walk')
            ox.save_graphml(_G, GRAPH_FILE)
            print("[route_service] Graph saved to disk.")
        except Exception as e:
            print(f"[route_service] ERROR downloading {PLACE}: {e}. Falling back to point radius...")
            _G = ox.graph_from_point((10.7905, 78.7047), dist=2000, network_type='walk')

    # Add lengths to edges if missing
    if not any('length' in data for u, v, data in _G.edges(data=True)):
        try:
            _G = ox.distance.add_edge_lengths(_G)
        except AttributeError:
            _G = ox.add_edge_lengths(_G)

    print(f"[route_service] Graph ready: {len(_G.nodes)} nodes, {len(_G.edges)} edges")
    return _G


# -----------------------------
# Custom Heuristic (Euclidean)
# -----------------------------
def euclidean_heuristic(u, v):
    G = _load_graph()
    node_u = G.nodes[u]
    node_v = G.nodes[v]
    return math.sqrt((node_u['x'] - node_v['x'])**2 + (node_u['y'] - node_v['y'])**2)


# -----------------------------
# Custom edge weights
# -----------------------------
def get_safe_weight(u, v, data):
    G = _load_graph()
    distance = data.get("length", 1)
    node_u = G.nodes[u]
    risk = get_node_risk(node_u['y'], node_u['x'])
    return distance + (risk * 250)  # Heavy bias towards safety

def get_shortest_weight(u, v, data):
    return data.get("length", 1)


# -----------------------------
# Path analysis helper
# -----------------------------
def analyze_path(path):
    G = _load_graph()
    total_dist = 0
    total_risk = 0
    coords = []

    for i in range(len(path)):
        node_id = path[i]
        node = G.nodes[node_id]
        coords.append([node['y'], node['x']])

        if i < len(path) - 1:
            u, v = path[i], path[i + 1]
            edge_data = G.get_edge_data(u, v)
            data = edge_data[0] if edge_data else {}
            total_dist += data.get("length", 0)
            total_risk += get_node_risk(node['y'], node['x'])

    avg_risk = total_risk / len(path) if len(path) > 0 else 0
    return coords, {
        "distance_km": round(total_dist / 1000, 2),
        "risk_percent": round(avg_risk * 100, 1),
        "safety_level": "SAFE" if avg_risk < 0.3 else ("MODERATE" if avg_risk < 0.6 else "HIGH RISK")
    }


# -----------------------------
# Get nearest node
# -----------------------------
def get_nearest_node(lat, lon):
    G = _load_graph()
    return ox.distance.nearest_nodes(G, lon, lat)


# -----------------------------
# Core find_route function
# -----------------------------
def find_route(start_lat, start_lon, end_lat, end_lon):
    G = _load_graph()  # ensure graph is ready
    start_node = get_nearest_node(start_lat, start_lon)
    end_node = get_nearest_node(end_lat, end_lon)

    results = {}

    # 1. Calculate Safe Route
    try:
        safe_path = nx.astar_path(
            G, start_node, end_node,
            heuristic=euclidean_heuristic,
            weight=get_safe_weight
        )
        safe_coords, safe_summary = analyze_path(safe_path)
        results["safe_route"] = {"coords": safe_coords, "summary": safe_summary}
    except nx.NetworkXNoPath:
        results["safe_route"] = None
    except Exception as e:
        print(f"[route_service] Safe route error: {e}")
        results["safe_route"] = None

    # 2. Calculate Shortest Route
    try:
        short_path = nx.astar_path(
            G, start_node, end_node,
            heuristic=euclidean_heuristic,
            weight=get_shortest_weight
        )
        short_coords, short_summary = analyze_path(short_path)
        results["short_route"] = {"coords": short_coords, "summary": short_summary}
    except nx.NetworkXNoPath:
        results["short_route"] = None
    except Exception as e:
        print(f"[route_service] Short route error: {e}")
        results["short_route"] = None

    return results