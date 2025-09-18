// app/dashboard/page.tsx
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Dashboard root page
 * This simply redirects to the travel step when mounted.
 * Marked as a Client Component because it uses useRouter/useEffect.
 */
export default function DashboardRoot() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the travel step on mount
    router.push('/dashboard/travel');
  }, [router]);

  // You can show a small loading placeholder while redirecting
  return (
    <div style={{ padding: 24 }}>
      <h2>Loading dashboard…</h2>
      <p>If you are not redirected automatically, <a href="/dashboard/travel">click here</a>.</p>
    </div>
  );
}
