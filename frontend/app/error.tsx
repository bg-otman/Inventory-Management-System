'use client';
import Recovery from '@/components/Recovery';
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return <Recovery error={error} reset={reset} />;
}
