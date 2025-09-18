// frontend/pages/api/mcp/plan.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Simulate processing delay
  await new Promise((r) => setTimeout(r, 700));

  // Seeded travel doc (same shape your UI expects)
  const seedTravelDoc = {
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
            type: 'bus', label: 'Bus Transport',
            options: [
              { id: 'bus-01', operator: 'GreenLine Coaches', departureTime: '06:30', arrivalTime: '09:00', durationMinutes: 150, price: 600, seatsAvailable: 12, class: 'Sleeper', notes: 'AC Sleeper', recommended: false }
            ]
          },
          train: {
            type: 'train', label: 'Train Transport',
            options: [
              { id: 'train-01', operator: 'Indian Railways', trainNumber: '12656', departureTime: '07:00', arrivalTime: '09:00', durationMinutes: 120, price: 300, class: '3A', berthsAvailable: 20, recommended: true, notes: 'AC 3-tier' }
            ]
          },
          flight: {
            type: 'flight', label: 'Flight Transport',
            options: [
              { id: 'flight-none', airline: '', flightNumber: '', departureTime: '', arrivalTime: '', durationMinutes: 0, price: 0, seatsAvailable: 0, recommended: false, notes: 'No flights available' }
            ]
          },
          own: {
            type: 'own', label: 'Own Transport',
            options: [
              { id: 'own-01', distanceKm: 165, estimatedDurationMinutes: 180, basePerKmRate: 12, estimatedFuelCost: 1980, tollsApprox: 100, price: 2080, recommended: false }
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
          flight: { type: 'flight', label: 'Flight Transport', options: [{ id: 'flight-02', airline: 'Air India Express', flightNumber: 'IX-789', departureTime: '11:15', arrivalTime: '12:25', durationMinutes: 70, price: 2900, recommended: true }] },
          own: { type: 'own', label: 'Own Transport', options: [{ id: 'own-rt-01', distanceKm: 165, price: 2080 }] }
        },
        recommended: { type: 'flight', optionId: 'flight-02' }
      }
    }
  };

  const seedAccommodationDoc = {
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
        photos: [
          'https://images.unsplash.com/photo-1568495248636-643ea27d2b8f?auto=format&fit=crop&w=1200&q=80'
        ],
        pricePerNight: 2400,
        rating: 4.0,
        checkInTime: '15:00',
        checkOutTime: '12:00',
        available: true,
        recommended: false,
        reviews: ['Great location but rooms are compact.']
      }
    ]
  };

  // Optionally inspect req.body.inputJson to vary output for testing
  return res.status(200).json({
    travelDoc: seedTravelDoc,
    accommodationDoc: seedAccommodationDoc,
    // echo input for debugging:
    inputEcho: req.body?.inputJson || null
  });
}
