'use client';
import React, { useState } from 'react';
import { Env, Field } from './ui';
export function InlineParty({
  env,
  kind,
  onCreated,
  onCancel,
}: {
  env: Env;
  kind: 'customer' | 'supplier';
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = env,
    [f, setF] = useState({ name: '', phone: '', address: '', notes: '' });
  const label = kind === 'supplier' ? 'createSupplier' : 'createCustomer';
  return (
    <section
      className="inline-supplier"
      aria-label={t(label)}
      onKeyDown={(e) => {
        if (
          e.key === 'Enter' &&
          !(e.target instanceof HTMLTextAreaElement) &&
          !(e.target instanceof HTMLButtonElement)
        )
          e.preventDefault();
      }}
    >
      <h3>{t(label)}</h3>
      <p className="field-hint">{t('peopleHelp')}</p>
      <Field label={t('fullName') + ' *'}>
        <input
          value={f.name}
          maxLength={200}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </Field>
      <div className="form-grid">
        <Field label={t('phone') + ' · ' + t('optional')}>
          <input
            type="tel"
            dir="ltr"
            maxLength={100}
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </Field>
        <Field label={t('address') + ' · ' + t('optional')}>
          <input
            maxLength={1000}
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t('notes') + ' · ' + t('optional')}>
        <textarea
          rows={2}
          maxLength={4000}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </Field>
      <div className="button-row">
        <button type="button" className="btn small" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="btn small primary"
          disabled={env.busy || !f.name.trim()}
          onClick={async () => {
            try {
              const r = await env.act('/parties', { kind, ...f });
              onCreated(r.id);
            } catch {}
          }}
        >
          {t(label)}
        </button>
      </div>
    </section>
  );
}
