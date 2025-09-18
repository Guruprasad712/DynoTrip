// frontend/lib/seedData.ts
// Minimal seed used by API mock routes to avoid import cycles with TripContext.

export const seedGeneratedPlan = {
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
          price: 0,
        },
        {
          id: 'place-pond-2',
          title: 'Heritage Quarter Walk',
          description: 'Explore colorful French Quarter lanes and colonial buildings.',
          photos: ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80'],
          rating: 4.5,
          reviews: ['Beautiful architecture', 'Great for photography'],
          price: 100,
        },
      ],
    },
  ],
  suggestedPlaces: [
    { id: 'sug-1', title: 'Botanical Garden', description: 'Large park with rare plants.', photos: ['https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=1200&q=80'], rating: 4.4 },
    { id: 'sug-2', title: 'Heritage Walk', description: 'Guided walk through the French Quarter.', photos: ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80'], rating: 4.6 },
    { id: 'sug-3', title: 'Bicycle Tour', description: 'Ride around coastal lanes and backstreets.', photos: [], rating: 4.3 },
  ],
  hiddenGems: [
    { id: 'hg-1', title: 'Tiny pottery studio', description: 'Local pottery workshop — try a short lesson.', photos: ['https://images.unsplash.com/photo-1531266750012-4b1c8f0d6d5b?auto=format&fit=crop&w=1200&q=80'], rating: 4.9 },
  ],
};
