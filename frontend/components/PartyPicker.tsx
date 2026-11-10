'use client';
import { useEffect, useId, useState } from 'react';
import { Party, normalizeSearch } from '@/lib/types';

export default function PartyPicker({
  parties,
  value,
  kind,
  required = false,
  disabled = false,
  onChange,
  onCreate,
}: {
  parties: Party[];
  value: string;
  kind: Party['kind'];
  required?: boolean;
  disabled?: boolean;
  onChange: (id: string) => void;
  onCreate: () => void;
}) {
  const id = useId();
  const selected = parties.find((party) => party.id === value);
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!open) setQuery(selected?.name || '');
  }, [open, selected?.name, value]);
  const candidates = parties.filter(
    (party) =>
      party.kind === kind &&
      (party.active || party.id === value) &&
      normalizeSearch(`${party.name} ${party.phone}`).includes(normalizeSearch(query)),
  );
  const walkIn = kind === 'customer';
  const optionCount = candidates.length + (walkIn ? 1 : 0) + 1;
  const choose = (party: Party) => {
    setQuery(party.name);
    setOpen(false);
    onChange(party.id);
  };
  const clear = () => {
    setQuery('');
    setOpen(false);
    onChange('');
  };

  return (
    <div className="party-picker">
      <input
        role="combobox"
        aria-label={kind === 'supplier' ? 'Rechercher un fournisseur' : 'Rechercher un client'}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id}
        aria-required={required}
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={query}
        placeholder={
          walkIn ? 'Client de passage ou rechercher un client…' : 'Rechercher un fournisseur…'
        }
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
          onChange('');
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setIndex((current) => Math.min(current + 1, optionCount - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIndex((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (walkIn && index === 0) clear();
            else {
              const partyIndex = index - (walkIn ? 1 : 0);
              if (candidates[partyIndex]) choose(candidates[partyIndex]);
              else if (index === optionCount - 1) {
                setOpen(false);
                setQuery(selected?.name || '');
                onCreate();
              }
            }
          }
        }}
      />
      {open && (
        <div role="listbox" id={id} className="product-options">
          {walkIn && (
            <button
              type="button"
              role="option"
              aria-selected={index === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={clear}
            >
              <strong>Client de passage</strong>
              <small>Vente sans compte client</small>
            </button>
          )}
          {candidates.map((party, partyIndex) => {
            const optionIndex = partyIndex + (walkIn ? 1 : 0);
            return (
              <button
                key={party.id}
                type="button"
                role="option"
                aria-selected={optionIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(party)}
              >
                <strong>{party.name}</strong>
                <small>
                  {party.phone || (party.active ? '' : 'Compte retiré')}
                  {!party.active && party.phone ? ' · Compte retiré' : ''}
                </small>
              </button>
            );
          })}
          {!candidates.length && <p>Aucun résultat correspondant.</p>}
          <button
            type="button"
            role="option"
            aria-selected={index === optionCount - 1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              setQuery(selected?.name || '');
              onCreate();
            }}
          >
            <strong>＋ {kind === 'supplier' ? 'Créer un fournisseur' : 'Créer un client'}</strong>
          </button>
        </div>
      )}
    </div>
  );
}
