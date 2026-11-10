'use client';
import { useEffect, useState } from 'react';
export default function Recovery({ error, reset }: { error: Error; reset: () => void }) {
  const [ar, setAr] = useState(false);
  useEffect(() => {
    const current = document.documentElement.lang;
    setAr(false);
    window.inventoryDesktop?.reportError('Render: ' + error.message);
    window.inventoryDesktop?.ready();
  }, [error]);
  const button = {
    padding: '12px 20px',
    border: '1px solid #cdd8d1',
    borderRadius: 8,
    background: '#fff',
    color: '#183b31',
    fontSize: 15,
    cursor: 'pointer',
  };
  return (
    <main
      dir={'ltr'}
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeContent: 'center',
        textAlign: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: '#f7f8f5',
        color: '#183b31',
        fontFamily: 'system-ui',
      }}
    >
      <h1>Inventory</h1>
      <h2>{'Impossible d’afficher cette page'}</h2>
      <p>
        {
          'Vos données enregistrées sont conservées. Réessayez ou ouvrez le journal pour obtenir de l’aide.'
        }
      </p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 16,
        }}
      >
        <button style={button} onClick={reset}>
          {'Réessayer'}
        </button>
        <button style={button} onClick={() => void window.inventoryDesktop?.openLog()}>
          {'Ouvrir le journal'}
        </button>
      </div>
    </main>
  );
}
