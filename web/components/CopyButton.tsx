'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copy fix prompt' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  );
}
