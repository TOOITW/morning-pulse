export default function PreviewPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>📧 Newsletter Preview</h1>
      <p>Preview API is being developed...</p>

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          background: '#f5f5f5',
          borderRadius: '8px',
        }}
      >
        <h2>Mock Newsletter</h2>
        <div style={{ marginTop: '1rem' }}>
          <article
            style={{
              padding: '1rem',
              background: 'white',
              marginBottom: '1rem',
              borderRadius: '4px',
            }}
          >
            <h3>Bitcoin 突破 $100,000 創歷史新高</h3>
            <p>加密貨幣市場迎來重大里程碑，比特幣價格首次突破十萬美元大關...</p>
            <small style={{ color: '#666' }}>來源: Reuters Business</small>
          </article>

          <article
            style={{
              padding: '1rem',
              background: 'white',
              marginBottom: '1rem',
              borderRadius: '4px',
            }}
          >
            <h3>Apple 發布革命性 AR 眼鏡</h3>
            <p>Apple 在年度開發者大會上發布首款消費級 AR 眼鏡...</p>
            <small style={{ color: '#666' }}>來源: CNBC Top News</small>
          </article>
        </div>
      </div>
    </div>
  );
}
