import { useEffect, useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000'

function useEventLog() {
  const [events, setEvents] = useState([])
  const log = (type, message) => {
    const ts = new Date().toLocaleTimeString()
    setEvents((prev) => [{ ts, type, message }, ...prev])
  }
  const clear = () => setEvents([])
  return { events, log, clear }
}

export default function Home() {
  const { events, log, clear } = useEventLog()

  const [loading, setLoading] = useState(false)

  const [travelStayBody, setTravelStayBody] = useState('')
  const [selectionsBody, setSelectionsBody] = useState(`{
  "inputJson": {
    "destination": "Pondicherry",
    "days": [
      { "date": "2025-10-10", "places": ["Promenade Beach, Pondicherry", "Auroville, Pondicherry"] },
      { "date": "2025-10-11", "places": ["White Town, Pondicherry"] }
    ],
    "travel": { "type": "train", "optionId": "train-01" },
    "stay": { "hotelId": "h-01" }
  }
}`)
  const [itineraryBody, setItineraryBody] = useState(`{
  "generatedPlan": {
    "meta": {
      "departure": "Chennai",
      "destination": "Pondicherry",
      "startDate": "2025-10-10",
      "endDate": "2025-10-11",
      "updatedAt": "2025-09-14T00:00:00.000Z"
    },
    "specialInstructions": "Prefer coastal views and vegetarian meals",
    "storyItinerary": [
      { "id": "day-1", "title": "Day 1", "date": "2025-10-10", "items": [] },
      { "id": "day-2", "title": "Day 2", "date": "2025-10-11", "items": [] }
    ],
    "suggestedPlaces": [],
    "hiddenGems": []
  }
}`)

  // Load default travel-stay payload from /public/input.json if present
  useEffect(() => {
    async function loadDefault() {
      try {
        const resp = await fetch('/input.json')
        if (resp.ok) {
          const json = await resp.json()
          setTravelStayBody(JSON.stringify(json, null, 2))
          log('info', 'Loaded default user preferences from /input.json')
          return
        }
      } catch (e) {
        // ignore
      }
      // Fallback example
      const fallback = {
        inputJson: {
          departure: 'Chennai',
          destination: 'Pondicherry',
          startDate: '2025-10-10',
          endDate: '2025-10-11',
          budget: 15000,
          members: { adults: 2, children: 0 },
          activities: ['Sightseeing', 'Food'],
          tripTheme: 'Heritage',
          specialInstructions: 'Prefer coastal views and vegetarian meals',
          createdAt: '2025-09-14T00:00:00.000Z',
        },
      }
      setTravelStayBody(JSON.stringify(fallback, null, 2))
      log('warn', 'Default /input.json not found; using fallback example')
    }
    loadDefault()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function callApi(path, bodyText) {
    setLoading(true)
    clear()
    const url = `${API_BASE}${path}`
    log('start', `POST ${url}`)
    let parsed
    try {
      parsed = JSON.parse(bodyText)
    } catch (e) {
      log('error', `Invalid JSON: ${e.message}`)
      setLoading(false)
      return
    }
    const t0 = performance.now()
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const text = await resp.text()
      const dt = (performance.now() - t0).toFixed(0)
      if (!resp.ok) {
        log('error', `HTTP ${resp.status} in ${dt}ms: ${text}`)
      } else {
        log('done', `OK ${resp.status} in ${dt}ms`)
        try {
          const json = JSON.parse(text)
          log('json', JSON.stringify(json, null, 2))
        } catch {
          log('warn', 'Response was not valid JSON; showing raw')
          log('raw', text)
        }
      }
    } catch (e) {
      log('error', e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: 'system-ui, Arial', padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1>DynoTrip API Tester</h1>
      <p>Backend base: <code>{API_BASE}</code></p>

      <section style={{ marginTop: 20 }}>
        <h2>1) Travel + Stay (uses input_user_pref template)</h2>
        <p>Endpoint: <code>POST /travel-stay</code></p>
        <textarea
          style={{ width: '100%', height: 200, fontFamily: 'monospace' }}
          value={travelStayBody}
          onChange={(e) => setTravelStayBody(e.target.value)}
        />
        <button disabled={loading} onClick={() => callApi('/travel-stay', travelStayBody)}>
          {loading ? 'Running…' : 'Run Travel/Stay'}
        </button>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>2) Itinerary from Selections</h2>
        <p>Endpoint: <code>POST /itinerary-from-selections</code></p>
        <textarea
          style={{ width: '100%', height: 220, fontFamily: 'monospace' }}
          value={selectionsBody}
          onChange={(e) => setSelectionsBody(e.target.value)}
        />
        <button disabled={loading} onClick={() => callApi('/itinerary-from-selections', selectionsBody)}>
          {loading ? 'Running…' : 'Run From Selections'}
        </button>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>3) End-to-End Itinerary (refine previous)</h2>
        <p>Endpoint: <code>POST /itinerary</code></p>
        <textarea
          style={{ width: '100%', height: 220, fontFamily: 'monospace' }}
          value={itineraryBody}
          onChange={(e) => setItineraryBody(e.target.value)}
        />
        <button disabled={loading} onClick={() => callApi('/itinerary', itineraryBody)}>
          {loading ? 'Running…' : 'Run End-to-End'}
        </button>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Event Log</h2>
        <button onClick={clear} disabled={events.length === 0}>Clear Log</button>
        <div style={{ marginTop: 10, padding: 10, background: '#111', color: '#eee', borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>
          {events.map((e, idx) => (
            <div key={idx} style={{ marginBottom: 8 }}>
              <span style={{ opacity: 0.7 }}>{e.ts}</span>
              <span style={{ marginLeft: 8, color: '#6cf' }}>{e.type.toUpperCase()}</span>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0 0' }}>{e.message}</pre>
            </div>
          ))}
          {events.length === 0 && <div style={{ opacity: 0.6 }}>No events yet.</div>}
        </div>
      </section>
    </div>
  )
}
