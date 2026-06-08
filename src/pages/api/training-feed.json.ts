export const prerender = false;

import type { APIRoute } from 'astro';
import { TRAINING_COURSE, TRAINING_SESSIONS } from '@/data/training';

export const GET: APIRoute = async () => {
  const data = {
    course: {
      title: TRAINING_COURSE.title,
      price_zar: TRAINING_COURSE.price,
      vat_included: TRAINING_COURSE.vatIncluded,
      min_drivers: TRAINING_COURSE.minDrivers,
      duration: TRAINING_COURSE.duration,
      venues: TRAINING_COURSE.venues,
      includes: TRAINING_COURSE.includes,
      curriculum: TRAINING_COURSE.curriculum,
      contact: TRAINING_COURSE.contact,
      booking_url: 'https://landcruisersa.co.za/training/',
    },
    upcoming_sessions: TRAINING_SESSIONS.map(s => ({
      id: s.id,
      date: s.date,
      venue: s.venue,
      spots_available: s.spotsAvailable,
    })),
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
