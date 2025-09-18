// app/dashboard/context/TripContext.tsx
'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * TripContext - in-memory store persisted to localStorage.
 * Keys: gptrix_inputJson, gptrix_travelDoc, gptrix_accommodationDoc, gptrix_generatedPlan, gptrix_selections
 *
 * Stores:
 *  - inputJson (user inputs)
 *  - travelDoc (MCP travel output)
 *  - accommodationDoc (MCP accommodation output)
 *  - generatedPlan (MCP itinerary output)
 *  - selections (user selections for transport/hotels/itinerary)
 */

// ------------------------- Types -------------------------

export type Members = { adults: number; children?: number };

// --------------------- Dynamic Mock Builder ----------------------
function daysBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 2;
  try {
    const s = new Date(start);
    const e = new Date(end);
    const d = Math.max(1, Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)));
    return d;
  } catch {
    return 2;
  }
}

function addDays(dateStr: string, offset: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function buildDynamicMock(input: TripJSON, sel?: Selections | null) {
  const dep = input.departure || 'Chennai';
  const dest = input.destination || 'Pondicherry';
  const sd = input.startDate || new Date().toISOString().slice(0, 10);
  const ed = input.endDate || addDays(sd, 2);
  const nDays = daysBetween(sd, ed);
  const acts = (input.activities && input.activities.length ? input.activities : ['Sightseeing']) as string[];
  const budget = Number(input.budget ?? 15000);

  const travelDoc: TravelDoc = {
    meta: { departure: dep, destination: dest, outboundDate: sd, returnDate: ed, createdAt: new Date().toISOString() },
    legs: {
      outbound: {
        label: `Outbound (${dep} → ${dest})`,
        transport: {
          bus: { type: 'bus', label: 'Bus Transport', options: [ { id: 'bus-01', operator: `${dep} Express`, departureTime: '07:00', arrivalTime: '10:00', durationMinutes: 180, price: 650 } ] },
          train: { type: 'train', label: 'Train Transport', options: [ { id: 'train-01', operator: 'Indian Railways', trainNumber: '12656', departureTime: '07:00', arrivalTime: '09:30', durationMinutes: 150, price: 320, class: '3A', recommended: true } ] },
          flight: { type: 'flight', label: 'Flight Transport', options: [ { id: 'flight-none', airline: '', flightNumber: '', departureTime: '', arrivalTime: '', durationMinutes: 0, price: 0, notes: 'No direct flights' } ] },
          own: { type: 'own', label: 'Own Transport', options: [ { id: 'own-01', distanceKm: 165, estimatedDurationMinutes: 180, basePerKmRate: 12, tollsApprox: 100, price: 2080 } ] }
        },
        recommended: { type: 'train', optionId: 'train-01' }
      },
      return: {
        label: `Return (${dest} → ${dep})`,
        transport: {
          bus: { type: 'bus', label: 'Bus Transport', options: [ { id: 'rbus-01', operator: `${dest} Coaches`, departureTime: '18:00', arrivalTime: '21:00', durationMinutes: 180, price: 700 } ] },
          train: { type: 'train', label: 'Train Transport', options: [ { id: 'rtrain-01', operator: 'Indian Railways', trainNumber: '12657', departureTime: '19:00', arrivalTime: '21:30', durationMinutes: 150, price: 340 } ] },
          flight: { type: 'flight', label: 'Flight Transport', options: [ { id: 'rflight-none', airline: '', flightNumber: '', departureTime: '', arrivalTime: '', durationMinutes: 0, price: 0, notes: 'No direct flights' } ] },
          own: { type: 'own', label: 'Own Transport', options: [ { id: 'own-rt-01', distanceKm: 165, estimatedDurationMinutes: 180, basePerKmRate: 12, tollsApprox: 100, price: 2080 } ] }
        },
        recommended: { type: 'train', optionId: 'rtrain-01' }
      }
    }
  };

  const nightly = Math.max(1200, Math.min(6000, Math.round((budget / Math.max(1, nDays)) / 2)));
  const accommodationDoc: AccommodationDoc = {
    hotels: [
      {
        id: 'h-01',
        name: `${dest} Heritage Stay`,
        address: `Center, ${dest}`,
        photos: [
          'https://images.unsplash.com/photo-1568495248636-643ea27d2b8f?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80'
        ],
        pricePerNight: nightly,
        rating: 4.4,
        checkInTime: '14:00',
        checkOutTime: '11:00',
        available: true,
        recommended: true,
        reviews: [
          'Great location with walkable attractions nearby.',
          'Comfortable rooms and courteous staff.',
          'Breakfast spread was fresh and varied.'
        ]
      },
      {
        id: 'h-02',
        name: `${dest} Seaside Resort`,
        address: `Beach Rd, ${dest}`,
        photos: [
          'https://images.unsplash.com/photo-1501117716987-c8e9a0aef1d4?auto=format&fit=crop&w=1200&q=80',
          'https://images.unsplash.com/photo-1460472178825-e5240623afd5?auto=format&fit=crop&w=1200&q=80'
        ],
        pricePerNight: Math.round(nightly * 1.4),
        rating: 4.6,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        available: true,
        recommended: false,
        reviews: [
          'Sea view is fantastic — loved the sunrise.',
          'Pool area is clean and relaxing.'
        ]
      },
      {
        id: 'h-03',
        name: `${dest} Garden Boutique Hotel`,
        address: `Heritage Street, ${dest}`,
        photos: [
          'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1200&q=80'
        ],
        pricePerNight: Math.round(nightly * 1.1),
        rating: 4.3,
        checkInTime: '13:00',
        checkOutTime: '11:00',
        available: true,
        recommended: false,
        reviews: [
          'Charming courtyard and quiet rooms.',
          'Easy access to cafés and markets.'
        ]
      }
    ]
  };

  const catalog = [
    {
      key: 'Sightseeing',
      title: 'Promenade Walk',
      desc: 'Stroll and photos near the water.',
      price: 0,
      photo: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
      rating: 4.7,
      reviews: ['Lovely sunrise view', 'Clean and peaceful walkway']
    },
    {
      key: 'Food',
      title: 'Local Café',
      desc: 'Coffee and pastries at a popular spot.',
      price: 300,
      photo: 'https://images.unsplash.com/photo-1496412705862-e0088f16f791?auto=format&fit=crop&w=1200&q=80',
      rating: 4.5,
      reviews: ['Great coffee aroma', 'Must-try croissants']
    },
    {
      key: 'Heritage',
      title: 'Heritage Quarter',
      desc: 'Explore colonial streets and architecture.',
      price: 0,
      photo: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
      rating: 4.6,
      reviews: ['Colorful lanes', 'Informative plaques around buildings']
    },
    {
      key: 'Relaxation',
      title: 'Sunset Point',
      desc: 'Relax and enjoy the view.',
      price: 0,
      photo: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?auto=format&fit=crop&w=1200&q=80',
      rating: 4.4,
      reviews: ['Golden hour is beautiful', 'Breezy and calm']
    },
    {
      key: 'Adventure',
      title: 'Cycle Tour',
      desc: 'Ride around lanes and backstreets.',
      price: 200,
      photo: 'https://images.unsplash.com/photo-1519305128777-84551f14682e?auto=format&fit=crop&w=1200&q=80',
      rating: 4.8,
      reviews: ['Fun and well-guided', 'Good for beginners']
    }
  ];

  const pickFor = (k: string) => catalog.find(c => c.key === k) || catalog[0];
  const chosen = acts.map(pickFor);
  const storyItinerary = Array.from({ length: nDays }).map((_, i) => {
    const date = addDays(sd, i);
    const baseIdx = i % chosen.length;
    const a = chosen[baseIdx];
    const b = chosen[(baseIdx + 1) % chosen.length];
    return {
      id: `day-${i + 1}`,
      title: `Day ${i + 1}`,
      date,
      items: [
        { id: `meal-d${i + 1}-b`, __isMeal: true, title: 'Breakfast', description: 'Start your day with a hearty breakfast.' },
        { id: `act-d${i + 1}-a`, title: a.title, description: a.desc, photos: a.photo ? [a.photo] : [], price: a.price, rating: a.rating, reviews: a.reviews },
        { id: `act-d${i + 1}-b`, title: b.title, description: b.desc, photos: b.photo ? [b.photo] : [], price: b.price, rating: b.rating, reviews: b.reviews },
      ]
    };
  });

  const generatedPlan: GeneratedPlan = {
    meta: { departure: dep, destination: dest, startDate: sd, endDate: ed, updatedAt: new Date().toISOString(), specialInstructions: input.specialInstructions || '' },
    storyItinerary,
    suggestedPlaces: catalog.slice(0, 3).map((c, i) => ({ id: `sug-${i + 1}`, title: c.title, description: c.desc, photos: c.photo ? [c.photo] : [], rating: c.rating })),
    hiddenGems: [{ id: 'hg-1', title: 'Local pottery studio', description: 'Short hands-on clay session.', photos: ['https://images.unsplash.com/photo-1531266750012-4b1c8f0d6d5b?auto=format&fit=crop&w=1200&q=80'], rating: 4.9 }]
  };

  return { travelDoc, accommodationDoc, generatedPlan };
}

// (moved inside TripProvider below)

export type TripJSON = {
  departure?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number;
  members?: Members;
  activities?: string[];
  tripTheme?: string;
  specialInstructions?: string;
  createdAt?: string;
};

export type TravelDoc = any; // upstream MCP travel doc — kept `any` for now
export type AccommodationDoc = any;
export type GeneratedPlan = any;

export type Selections = {
  transportSelections?: Record<string, any>;
  hotelsSelection?: any;
  itinerary?: any[]; // user-modified itinerary items
};

// ---------------------- localStorage keys --------------------

const LS_KEYS = {
  inputJson: 'gptrix_inputJson',
  travelDoc: 'gptrix_travelDoc',
  accommodationDoc: 'gptrix_accommodationDoc',
  generatedPlan: 'gptrix_generatedPlan',
  selections: 'gptrix_selections',
};

// ------------------------- Seed data ------------------------

const seedInputJson: TripJSON = {
  departure: 'Chennai',
  destination: 'Pondicherry',
  startDate: '2025-10-10',
  endDate: '2025-10-11',
  budget: 15000,
  members: { adults: 2, children: 0 },
  activities: ['Sightseeing', 'Food'],
  tripTheme: 'Heritage',
  specialInstructions: '',
  createdAt: new Date().toISOString(),
};

const seedTravelDoc: TravelDoc = {
  meta: {
    departure: 'Chennai',
    destination: 'Pondicherry',
    outboundDate: '2025-10-10',
    returnDate: '2025-10-11',
    createdAt: new Date().toISOString(),
  },
  legs: {
    outbound: {
      label: 'Outbound (Chennai → Pondicherry)',
      transport: {
        bus: {
          type: 'bus',
          label: 'Bus Transport',
          options: [
            { id: 'bus-01', operator: 'GreenLine Coaches', departureTime: '06:30', arrivalTime: '09:00', durationMinutes: 150, price: 600, seatsAvailable: 12, class: 'Sleeper', notes: 'AC Sleeper', recommended: false },
            { id: 'bus-02', operator: 'Express Travels', departureTime: '09:00', arrivalTime: '11:30', durationMinutes: 150, price: 750, seatsAvailable: 6, class: 'Semi-Sleeper', recommended: false }
          ]
        },
        train: {
          type: 'train',
          label: 'Train Transport',
          options: [
            { id: 'train-01', operator: 'Indian Railways', trainNumber: '12656', departureTime: '07:00', arrivalTime: '09:00', durationMinutes: 120, price: 300, class: '3A', berthsAvailable: 20, recommended: true, notes: 'AC 3-tier' },
            { id: 'train-02', operator: 'Indian Railways', trainNumber: '22678', departureTime: '18:30', arrivalTime: '20:30', durationMinutes: 120, price: 450, class: '2A', berthsAvailable: 6, recommended: false }
          ]
        },
        flight: {
          type: 'flight',
          label: 'Flight Transport',
          options: [
            { id: 'flight-none', airline: '', flightNumber: '', departureTime: '', arrivalTime: '', durationMinutes: 0, price: 0, stops: 0, seatsAvailable: 0, cabin: '', recommended: false, notes: 'No flights available for chosen date' }
          ]
        },
        own: {
          type: 'own',
          label: 'Own Transport',
          options: [
            { id: 'own-01', distanceKm: 165, estimatedDurationMinutes: 180, basePerKmRate: 12, estimatedFuelCost: 1980, tollsApprox: 100, price: 2080, recommended: false, notes: 'Adjustable per-km and tolls' }
          ]
        }
      },
      recommended: { type: 'train', optionId: 'train-01' }
    },
    return: {
      label: 'Return (Pondicherry → Chennai)',
      transport: {
        bus: { type: 'bus', label: 'Bus Transport', options: [{ id: 'rbus-01', operator: 'ReturnLine', departureTime: '18:00', arrivalTime: '20:30', durationMinutes: 150, price: 700 }] },
        train: { type: 'train', label: 'Train Transport', options: [{ id: 'rtrain-01', operator: 'Indian Railways', trainNumber: '12657', departureTime: '19:00', arrivalTime: '21:00', durationMinutes: 120, price: 320 }] },
        flight: { type: 'flight', label: 'Flight Transport', options: [{ id: 'flight-02', airline: 'Air India Express', flightNumber: 'IX-789', departureTime: '11:15', arrivalTime: '12:25', durationMinutes: 70, price: 2900, recommended: true, notes: 'Return flight available' }] },
        own: { type: 'own', label: 'Own Transport', options: [{ id: 'own-rt-01', distanceKm: 165, estimatedDurationMinutes: 180, basePerKmRate: 12, estimatedFuelCost: 1980, tollsApprox: 100, price: 2080 }] }
      },
      recommended: { type: 'flight', optionId: 'flight-02' }
    }
  }
};

const seedAccommodationDoc: AccommodationDoc = {
  hotels: [
    {
      id: 'h-01',
      name: 'Ocean View Resort',
      address: 'Seafront Road, Pondicherry',
      photos: [
        'https://images.unsplash.com/photo-1501117716987-c8e9a0aef1d4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1496412705862-e0088f16f791?auto=format&fit=crop&w=1200&q=80'
      ],
      pricePerNight: 3500,
      rating: 4.6,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      available: true,
      recommended: true,
      reviews: ['Amazing beachfront view — perfect for sunrise.', 'Clean rooms and friendly staff.']
    },
    {
      id: 'h-02',
      name: 'City Center Hotel',
      address: 'Downtown, Pondicherry',
      photos: ['https://images.unsplash.com/photo-1568495248636-643ea27d2b8f?auto=format&fit=crop&w=1200&q=80'],
      pricePerNight: 2400,
      rating: 4.0,
      checkInTime: '15:00',
      checkOutTime: '12:00',
      available: true,
      recommended: false,
      reviews: ['Great location but rooms are compact.', 'Very helpful concierge.']
    }
  ]
};

const seedGeneratedPlan: GeneratedPlan = {
  meta: {
    departure: 'Chennai',
    destination: 'Pondicherry',
    startDate: '2025-10-10',
    endDate: '2025-10-11',
    updatedAt: new Date().toISOString(),
  },
  storyItinerary: [
    {
      id: 'day-1',
      title: 'Day 1',
      date: '2025-10-10',
      items: [
        { id: 'meal-day-1-0', __isMeal: true, title: 'Breakfast', description: 'Enjoy a fresh South-Indian breakfast at a popular café.' },
        {
          id: 'place-pond-1',
          title: 'Promenade Beach',
          description: 'Walk the shoreline and take photos. Ideal for sunrise.',
          photos: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80'],
          rating: 4.7,
          reviews: ['Lovely sunrise view', 'Clean and peaceful walkway'],
          price: 0
        },
        {
          id: 'place-pond-2',
          title: 'Heritage Quarter Walk',
          description: 'Explore colorful French Quarter lanes and colonial buildings.',
          photos: ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80'],
          rating: 4.5,
          reviews: ['Beautiful architecture', 'Great for photography'],
          price: 100
        }
      ]
    }
  ],
  suggestedPlaces: [
    { id: 'sug-1', title: 'Botanical Garden', description: 'Large park with rare plants.', photos: ['https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80'], rating: 4.4 },
    { id: 'sug-2', title: 'Heritage Walk', description: 'Guided walk through the French Quarter.', photos: ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80'], rating: 4.6 },
    { id: 'sug-3', title: 'Bicycle Tour', description: 'Ride around coastal lanes and backstreets.', photos: [], rating: 4.3 }
  ],
  hiddenGems: [
    { id: 'hg-1', title: 'Tiny pottery studio', description: 'Local pottery workshop — try a short lesson.', photos: ['https://images.unsplash.com/photo-1531266750012-4b1c8f0d6d5b?auto=format&fit=crop&w=1200&q=80'], rating: 4.9 }
  ]
};

const seedSelections: Selections = {
  transportSelections: {
    outbound: { type: 'train', optionId: 'train-01', option: {} },
    return: { type: 'flight', optionId: 'flight-02', option: {} }
  },
  hotelsSelection: {
    useSameHotel: true,
    booking: { hotelId: 'h-01', name: 'Ocean View Resort', pricePerNight: 3500, nights: 1, totalPrice: 3500 }
  },
  itinerary: []
};

// -------------------- localStorage helpers -----------------------

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('TripContext readLS parse failed', key, e);
    return fallback;
  }
}

function writeLS(key: string, value: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('TripContext writeLS failed', key, e);
  }
}

// ------------------------- Context API --------------------------

type ContextType = {
  mounted: boolean;

  inputJson: TripJSON;
  travelDoc: TravelDoc | null;
  accommodationDoc: AccommodationDoc | null;
  generatedPlan: GeneratedPlan | null;
  selections: Selections | null;

  setInputJson: (v: TripJSON) => void;
  setTravelDoc: (v: TravelDoc | null) => void;
  setAccommodationDoc: (v: AccommodationDoc | null) => void;
  setGeneratedPlan: (v: GeneratedPlan | null) => void;
  setSelections: (v: Selections | null | ((prev: Selections | null) => Selections | null)) => void;

  resetToSeed: () => void;
  clearSelections: () => void;
  applyMcpResponse: (payload: { travelDoc?: TravelDoc; accommodationDoc?: AccommodationDoc; generatedPlan?: GeneratedPlan }) => void;

  // Dynamic mock helpers
  buildDynamicMock: (input: TripJSON, selections?: Selections | null) => { travelDoc: TravelDoc; accommodationDoc: AccommodationDoc; generatedPlan: GeneratedPlan };
  setMockPlanFromInput: (input: TripJSON) => void;
  setMockGeneratedPlan: (input: TripJSON, selections?: Selections | null) => void;
};

const TripContext = createContext<ContextType | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // load from localStorage or use seed
  const [inputJson, setInputJsonState] = useState<TripJSON>(() => readLS<TripJSON>(LS_KEYS.inputJson, seedInputJson));
  const [travelDoc, setTravelDocState] = useState<TravelDoc | null>(() => readLS<TravelDoc | null>(LS_KEYS.travelDoc, seedTravelDoc));
  const [accommodationDoc, setAccommodationDocState] = useState<AccommodationDoc | null>(() => readLS<AccommodationDoc | null>(LS_KEYS.accommodationDoc, seedAccommodationDoc));
  const [generatedPlan, setGeneratedPlanState] = useState<GeneratedPlan | null>(() => readLS<GeneratedPlan | null>(LS_KEYS.generatedPlan, seedGeneratedPlan));
  const [selections, setSelectionsState] = useState<Selections | null>(() => readLS<Selections | null>(LS_KEYS.selections, seedSelections));

  useEffect(() => { setMounted(true); }, []);

  // persist changes to localStorage
  useEffect(() => { writeLS(LS_KEYS.inputJson, inputJson); }, [inputJson]);
  useEffect(() => { writeLS(LS_KEYS.travelDoc, travelDoc); }, [travelDoc]);
  useEffect(() => { writeLS(LS_KEYS.accommodationDoc, accommodationDoc); }, [accommodationDoc]);
  useEffect(() => { writeLS(LS_KEYS.generatedPlan, generatedPlan); }, [generatedPlan]);
  useEffect(() => { writeLS(LS_KEYS.selections, selections); }, [selections]);

  // wrapper setters - typed
  const setInputJson = (v: TripJSON) => setInputJsonState(v);
  const setTravelDoc = (v: TravelDoc | null) => setTravelDocState(v);
  const setAccommodationDoc = (v: AccommodationDoc | null) => setAccommodationDocState(v);
  const setGeneratedPlan = (v: GeneratedPlan | null) => setGeneratedPlanState(v);

  // Properly typed setSelections wrapper (fixes implicit any warnings)
  const setSelections = (v: Selections | null | ((prev: Selections | null) => Selections | null)) => {
    if (typeof v === 'function') {
      setSelectionsState((prev: Selections | null) => {
        // annotate prev and call updater
        const updater = v as (p: Selections | null) => Selections | null;
        return updater(prev);
      });
    } else {
      setSelectionsState(v);
    }
  };

  // Reset everything to seed (dev convenience)
  function resetToSeed() {
    setInputJsonState(seedInputJson);
    setTravelDocState(seedTravelDoc);
    setAccommodationDocState(seedAccommodationDoc);
    setGeneratedPlanState(seedGeneratedPlan);
    setSelectionsState(seedSelections);

    writeLS(LS_KEYS.inputJson, seedInputJson);
    writeLS(LS_KEYS.travelDoc, seedTravelDoc);
    writeLS(LS_KEYS.accommodationDoc, seedAccommodationDoc);
    writeLS(LS_KEYS.generatedPlan, seedGeneratedPlan);
    writeLS(LS_KEYS.selections, seedSelections);
  }

  // Clear only selections (keeps generatedPlan/travel/accommodation)
  function clearSelections() {
    setSelectionsState(null);
    if (typeof window !== 'undefined') localStorage.removeItem(LS_KEYS.selections);
  }

  // Apply MCP response and reset selections if not present
  function applyMcpResponse(payload: { travelDoc?: TravelDoc; accommodationDoc?: AccommodationDoc; generatedPlan?: GeneratedPlan }) {
    if (payload.travelDoc) setTravelDocState(payload.travelDoc);
    if (payload.accommodationDoc) setAccommodationDocState(payload.accommodationDoc);
    if (payload.generatedPlan) setGeneratedPlanState(payload.generatedPlan);

    // Ensure we have a selections object (keeping previous when present)
    setSelectionsState((prev: Selections | null) => prev ?? seedSelections);
  }

  // Build dynamic mock docs from input and commit them to context (used when proceeding with Mock data)
  function setMockPlanFromInput(input: TripJSON) {
    const mock = buildDynamicMock(input, null);
    setInputJsonState(input);
    setTravelDocState(mock.travelDoc);
    setAccommodationDocState(mock.accommodationDoc);
    setGeneratedPlanState(null);
    setSelectionsState(null);
    writeLS(LS_KEYS.inputJson, input);
    writeLS(LS_KEYS.travelDoc, mock.travelDoc);
    writeLS(LS_KEYS.accommodationDoc, mock.accommodationDoc);
    if (typeof window !== 'undefined') localStorage.removeItem(LS_KEYS.generatedPlan);
    if (typeof window !== 'undefined') localStorage.removeItem(LS_KEYS.selections);
  }

  // Generate only the itinerary mock from input (keep existing travel/stay)
  function setMockGeneratedPlan(input: TripJSON, sel?: Selections | null) {
    const mock = buildDynamicMock(input, sel);
    setGeneratedPlanState(mock.generatedPlan);
    writeLS(LS_KEYS.generatedPlan, mock.generatedPlan);
  }

  const value = useMemo<ContextType>(() => ({
    mounted,
    inputJson,
    travelDoc,
    accommodationDoc,
    generatedPlan,
    selections,
    setInputJson,
    setTravelDoc,
    setAccommodationDoc,
    setGeneratedPlan,
    setSelections,
    resetToSeed,
    clearSelections,
    applyMcpResponse,
    buildDynamicMock,
    setMockPlanFromInput,
    setMockGeneratedPlan,
  }), [mounted, inputJson, travelDoc, accommodationDoc, generatedPlan, selections]);

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): ContextType {
  const c = useContext(TripContext);
  if (!c) throw new Error('useTrip must be used inside TripProvider');
  return c;
}
