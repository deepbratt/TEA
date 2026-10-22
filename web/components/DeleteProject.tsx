'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

export function DeleteProject({ projectKey, name }: { projectKey: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <section className="card danger" aria-labelledby="delete-title">
      <h2 id="delete-title" className="section-title">
        Remove project
      </h2>
      <p className="help">Removes {name} from the config file. Your code and past reports are left alone.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-danger"
        onClick={async () => {
          if (!window.confirm(`Remove ${name} from TEA?`)) return;
          try {
            await api(`/api/projects/${projectKey}`, { method: 'DELETE' });
            router.push('/');
            router.refresh();
          } catch (err) {
            setError(errorText(err).message);
          }
        }}
      >
        Remove project
      </button>
    </section>
  );
}
