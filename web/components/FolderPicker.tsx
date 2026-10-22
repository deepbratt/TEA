'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';

interface Listing {
  path: string;
  parent: string | null;
  folders: { name: string; path: string; looksLikeApp: boolean }[];
  roots: string[];
}

/** A dialog that browses this computer's folders (names only) and returns the chosen path. */
export function FolderPicker({ start, onPick, onClose }: { start?: string; onPick: (path: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState('');

  const open = async (path?: string) => {
    setError('');
    try {
      setListing(await api<Listing>(`/api/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`));
    } catch (err) {
      setError(errorText(err).message);
    }
  };

  useEffect(() => {
    dialog.current?.showModal();
    void open(start || undefined);
  }, []);

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="picker-title">
      <div className="picker">
        <div className="picker-head">
          <h2 id="picker-title" className="section-title">
            Choose a folder
          </h2>
          {listing && listing.roots.length > 1 && (
            <select aria-label="Drive" value={listing.roots.find((r) => listing.path.startsWith(r)) ?? ''} onChange={(e) => void open(e.target.value)}>
              {listing.roots.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
        </div>
        <p className="mono path">{listing?.path ?? 'Loading…'}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <ul className="pick-list tall" aria-label="Folders">
          {listing?.parent && (
            <li>
              <button type="button" className="pick" onClick={() => void open(listing.parent!)}>
                <span aria-hidden="true">↑</span> <span className="name">Up one level</span>
              </button>
            </li>
          )}
          {listing?.folders.map((f) => (
            <li key={f.path}>
              <button type="button" className="pick" onClick={() => void open(f.path)}>
                <span className="name">{f.name}</span>
                {f.looksLikeApp && <span className="tag">app</span>}
              </button>
            </li>
          ))}
          {listing && listing.folders.length === 0 && <li className="placeholder">No folders here.</li>}
        </ul>
        <div className="picker-foot">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!listing}
            onClick={() => {
              if (listing) onPick(listing.path);
              dialog.current?.close();
            }}
          >
            Use this folder
          </button>
        </div>
      </div>
    </dialog>
  );
}
