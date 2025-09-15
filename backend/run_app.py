import subprocess
import sys
import time
import os
from pathlib import Path
import signal

def main():
    # Get the directory of this script
    script_dir = Path(__file__).parent.absolute()
    
    # Resolve Python interpreter: prefer local venv Python
    venv_python = script_dir / ".venv" / "Scripts" / "python.exe"
    python_exec = str(venv_python) if venv_python.exists() else sys.executable
    if venv_python.exists():
        print(f"Using venv interpreter: {python_exec}")
    else:
        print(f"Venv python not found, using current interpreter: {python_exec}")

    # Command to start the MCP server
    mcp_script = script_dir / "agents" / "itinerary_agent" / "utils" / "agent.py"
    
    print("Starting MCP server...")
    mcp_process = subprocess.Popen(
        [python_exec, str(mcp_script)],
        cwd=script_dir,
        stdout=sys.stdout,
        stderr=sys.stderr,
        text=True
    )
    
    try:
        # Wait for the server to start (10 seconds)
        print("Waiting for MCP server to initialize (5 seconds)...")
        time.sleep(5)
        
        # Run main.py with the input file
        input_file = script_dir / "input.json"
        if not input_file.exists():
            print(f"Error: Input file not found at {input_file}")
            return 1
            
        print(f"Running main.py with input file: {input_file}")
        main_script = script_dir / "main.py"
        main_process = subprocess.Popen(
            [python_exec, str(main_script), "--input-file", str(input_file)],
            cwd=script_dir,
            stdout=sys.stdout,
            stderr=sys.stderr
        )
        
        # Wait for the main process to complete
        main_process.wait()
        
    except KeyboardInterrupt:
        print("\nShutting down...")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Terminate the MCP server
        print("Stopping MCP server...")
        mcp_process.terminate()
        try:
            mcp_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            mcp_process.kill()
        print("MCP server stopped.")

if __name__ == "__main__":
    main()
