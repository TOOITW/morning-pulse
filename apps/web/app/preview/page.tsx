'use client';
import { useEffect, useState } from 'react';

export default function PreviewPage() {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/preview-newsletter?format=html')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load preview');
        return r.text();
      })
      .then(setHtml)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>📧 Newsletter Preview</h1>
      {loading && <p>載入中...</p>}
      {error && <p style={{ color: 'red' }}>錯誤: {error}</p>}
      {!loading && !error && (
        <iframe
          title="newsletter"
          style={{
            width: '100%',
            minHeight: '70vh',
            border: '1px solid #ddd',
            borderRadius: 8,
            background: 'white',
          }}
          srcDoc={html}
        />
      )}
      <p style={{ marginTop: '1rem', fontSize: 12, color: '#666' }}>
        資料目前為 mock，待 pipeline 接入後自動生成。
      </p>
    </div>
  );
}
