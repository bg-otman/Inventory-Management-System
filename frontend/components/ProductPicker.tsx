'use client';
import { useId, useState } from 'react';
import { Product, normalizeSearch } from '@/lib/types';
export default function ProductPicker({
  products,
  value,
  name,
  onChange,
  free = false,
}: {
  products: Product[];
  value: string | null;
  name: string;
  onChange: (id: string | null, name: string) => void;
  free?: boolean;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const matches = products
    .filter(
      (p) =>
        (p.active || p.id === value) &&
        normalizeSearch(p.name + ' ' + p.description).includes(normalizeSearch(name)),
    )
    .slice(0, 30);
  const choose = (p: Product) => {
    onChange(p.id, p.name);
    setOpen(false);
  };
  return (
    <div className="product-picker">
      <input
        role="combobox"
        aria-label="Rechercher un produit"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id}
        autoComplete="off"
        value={name}
        placeholder="Tapez le nom du produit…"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(null, e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setIndex((i) => Math.min(i + 1, matches.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            if (matches[index]) choose(matches[index]);
          }
        }}
      />
      {open && (
        <div role="listbox" id={id} className="product-options">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              <strong>{p.name}</strong>
              <small>{p.description || 'Produit du catalogue'}</small>
            </button>
          ))}
          {!matches.length && <p>Aucun produit correspondant.</p>}
          {free && name.trim() && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(null, name);
                setOpen(false);
              }}
            >
              Utiliser « {name} » comme ligne libre
            </button>
          )}
        </div>
      )}
      {name && !value && (
        <small className="field-hint">
          {free
            ? 'Article libre — aucun stock nécessaire.'
            : 'Sélectionnez un résultat ou créez ce produit avant de confirmer.'}
        </small>
      )}
    </div>
  );
}
