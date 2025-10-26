#!/usr/bin/env python3
"""Simple one-shot tester for an HTTP weather endpoint.

Usage:
  python backend/scripts/test_weather_simple.py --url "https://..." [--key YOUR_API_KEY]

This prints status code, time-to-first-byte (ms), total time (ms), and a small response snippet.
It intentionally stays minimal for quick checks.
"""
import argparse
import sys
import time
from pathlib import Path

try:
    import requests
except Exception:
    print("Please install requests: pip install requests", file=sys.stderr)
    raise


def main():
    p = argparse.ArgumentParser(description="Very simple Maps Weather hourly lookup tester")
    p.add_argument('--lat', default='12.9716', help='Latitude (default: 12.9716)')
    p.add_argument('--lon', default='77.5946', help='Longitude (default: 77.5946)')
    p.add_argument('--timeout', type=float, default=15.0, help='Timeout seconds')
    args = p.parse_args()

    # Read key from backend/.env (simple parse)
    env_path = Path(__file__).resolve().parents[1] / '.env'
    api_key = None
    if env_path.exists():
        for line in env_path.read_text(encoding='utf-8').splitlines():
            if line.strip().startswith('GOOGLE_MAPS_API_KEY='):
                api_key = line.split('=', 1)[1].strip()
                break

    if not api_key:
        print('ERROR: GOOGLE_MAPS_API_KEY not found in backend/.env', file=sys.stderr)
        sys.exit(1)

    lat = args.lat
    lon = args.lon
    url = f'https://weather.googleapis.com/v1/forecast/hours:lookup?key={api_key}&location.latitude={lat}&location.longitude={lon}'
    print(f'Calling: {url}')
    start = time.time()
    try:
        resp = requests.get(url, timeout=args.timeout, stream=True)
    except Exception as e:
        print(f'Request failed: {e}', file=sys.stderr)
        sys.exit(1)

    ttfb_ms = None
    body = bytearray()
    try:
        for chunk in resp.iter_content(chunk_size=1024):
            now = time.time()
            if ttfb_ms is None:
                ttfb_ms = int((now - start) * 1000)
            if chunk:
                body.extend(chunk)
            # stop after we have ~1KB to keep output small
            if len(body) >= 1024:
                break
    except Exception as e:
        print(f"Error while reading response: {e}")

    total_ms = int((time.time() - start) * 1000)

    print(f'Status: {resp.status_code}')
    print(f'TTFB: {ttfb_ms if ttfb_ms is not None else total_ms} ms')
    print(f'Total: {total_ms} ms')
    snippet = body.decode('utf-8', errors='replace')[:1000]
    print('--- response snippet ---')
    print(snippet)


if __name__ == '__main__':
    main()
