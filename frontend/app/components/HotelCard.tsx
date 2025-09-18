'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardMedia, Typography, Stack, Button, Chip, Box, IconButton } from '@mui/material';
import { Star, ChevronLeft, ChevronRight } from '@mui/icons-material';

type Hotel = {
  id: string;
  name: string;
  address?: string;
  photos?: string[];
  pricePerNight?: number;
  rating?: number;
  checkInTime?: string;
  checkOutTime?: string;
  available?: boolean;
  recommended?: boolean;
  reviews?: string[];
};

export default function HotelCard({ hotel, onSelect, selected }: { hotel: Hotel; onSelect?: () => void; selected?: boolean; }) {
  const photos = hotel.photos && hotel.photos.length ? hotel.photos : ['/placeholder.jpg'];
  const [idx, setIdx] = useState(0);

  function prev() {
    setIdx((i) => (i - 1 + photos.length) % photos.length);
  }
  function next() {
    setIdx((i) => (i + 1) % photos.length);
  }

  return (
    <Card sx={{ border: selected ? '2px solid' : '1px solid', borderColor: selected ? 'primary.main' : 'divider' }}>
      <Box sx={{ position: 'relative' }}>
        <CardMedia component="img" height="180" image={photos[idx]} alt={hotel.name} />
        {photos.length > 1 && (
          <>
            <IconButton onClick={prev} size="small" sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(255,255,255,0.7)' }}>
              <ChevronLeft />
            </IconButton>
            <IconButton onClick={next} size="small" sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(255,255,255,0.7)' }}>
              <ChevronRight />
            </IconButton>
          </>
        )}
        {hotel.recommended && <Chip label="Recommended" color="primary" size="small" sx={{ position: 'absolute', top: 8, left: 8 }} />}
      </Box>

      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{hotel.name}</Typography>
            {hotel.address && <Typography variant="caption" color="text.secondary">{hotel.address}</Typography>}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
              <Star sx={{ fontSize: 16, color: 'gold' }} />
              <Typography variant="body2">{hotel.rating ?? '—'}</Typography>
              <Typography variant="body2" sx={{ ml: 1 }}>• ₹{hotel.pricePerNight ?? '—'}/night</Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
              {hotel.checkInTime && <Typography variant="caption">Check-in: {hotel.checkInTime}</Typography>}
              {hotel.checkOutTime && <Typography variant="caption">Check-out: {hotel.checkOutTime}</Typography>}
            </Stack>
          </Box>

          <Box textAlign="right">
            <Button variant={selected ? 'contained' : 'outlined'} onClick={onSelect} size="small">{selected ? 'Selected' : 'Select'}</Button>
          </Box>
        </Stack>

        {/* Reviews snippet */}
        {hotel.reviews && hotel.reviews.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Reviews</Typography>
            <Box sx={{ mt: 0.5 }}>
              {hotel.reviews.slice(0, 3).map((r, i) => (
                <Typography key={i} variant="caption" display="block">• {r}</Typography>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
