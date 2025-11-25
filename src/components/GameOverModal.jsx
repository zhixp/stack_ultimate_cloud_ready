import React from 'react';

const GameOverModal = ({ score, isRecording, onClose, onReplay }) => {
  return (
    <div className="ui-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: 10000,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s'
    }}>
      
      {isRecording ? (
        <div style={{ textAlign: 'center' }}>
          <div className="ui-loader" style={{
            width: '50px', height: '50px', border: '5px solid #333',
            borderTop: '5px solid #00ff00', borderRadius: '50%',
            animation: 'spin 1s linear infinite', margin: '0 auto 20px'
          }}></div>
          <h2 style={{ color: '#fff', fontFamily: 'monospace', fontSize: '1.5rem' }}>
            VERIFYING WITH SENTINEL...
          </h2>
        </div>
      ) : (
        <div className="ui-result-card" style={{
          background: '#111', border: '2px solid #333', borderRadius: '20px',
          padding: '40px', textAlign: 'center', minWidth: '300px',
          boxShadow: '0 0 50px rgba(0,255,0,0.1)', animation: 'popIn 0.3s'
        }}>
          <h1 style={{ color: '#888', margin: 0, fontSize: '1rem', letterSpacing: '2px' }}>GAME OVER</h1>
          <div style={{ fontSize: '5rem', fontWeight: 'bold', color: '#fff', margin: '20px 0' }}>{score}</div>
          <div style={{ background: 'rgba(0,255,0,0.1)', color: '#00ff00', padding: '5px 10px', borderRadius: '5px', fontSize: '0.8rem', display: 'inline-block', marginBottom: '30px' }}>
            ✅ RECORDED ON CHAIN
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={onReplay} style={{ background: '#fff', color: '#000', border: 'none', padding: '15px 30px', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer' }}>PLAY AGAIN</button>
            <button onClick={onClose} style={{ background: 'transparent', color: '#666', border: '2px solid #333', padding: '15px 30px', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer' }}>MENU</button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};
export default GameOverModal;