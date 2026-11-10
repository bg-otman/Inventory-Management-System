'use client';
import Recovery from '@/components/Recovery';
export default function GlobalError({ error }: { error: Error }) {
  return (
    <html>
      <body style={{ margin: 0 }}>
        <Recovery error={error} reset={() => location.reload()} />
      </body>
    </html>
  );
}
