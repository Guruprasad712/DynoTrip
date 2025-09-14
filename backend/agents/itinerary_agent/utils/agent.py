from fastmcp import FastMCP
from firestore_client import FirestoreClient
import os

# Prefer built-in stateless HTTP mode if available in this fastmcp version
mcp = FastMCP(name="Travel MCP Server")


# Initialize shared clients
firestore_client = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

@mcp.tool
def get_travel_options(frm: str, to: str, depart_date: str | None = None):
    """Fetch travel options from Firestore."""
    return firestore_client.get_travel_options(frm, to, depart_date)

@mcp.tool
def get_accommodation(city: str):
    """Fetch accommodation options from Firestore."""
    return firestore_client.get_accommodation(city)

if __name__ == "__main__":
   
    #import asyncio

    #asyncio.run(mcp.run_async())
    mcp.run(transport="http", host="127.0.0.1", port=9000)
