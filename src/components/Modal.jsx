import React from 'react';

// SENTINEL UI COMPONENT: CUSTOM MODAL
const Modal = ({ isOpen, title, children, onClose, type = "info", onAction = null }) => {
  if (!isOpen) return null;

  const headerColor = type === 'error' ? 'red' : type === 'success' ? '#00ff00' : '#00d0ff';

  return (
    <div className="ui-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 10000,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      backdropFilter: 'blur(5px)'
    }}>
      <div className="ui-modal-container" style={{
        background: '#1a1a1a', border: `2px solid ${headerColor}`,
        borderRadius: '15px', padding: '2px', minWidth: '350px', maxWidth: '90%',
        boxShadow: `0 0 20px ${headerColor}40`, animation: 'popIn 0.3s ease'
      }}>
        
        {/* HEADER */}
        <div className="ui-modal-header" style={{
          background: `linear-gradient(90deg, ${headerColor}20, transparent)`,
          padding: '15px 20px', borderBottom: '1px solid #333',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 className="ui-modal-title" style={{ margin: 0, color: headerColor, fontSize: '1.2rem', textTransform: 'uppercase' }}>
            {title}
          </h2>
          <button className="ui-btn-close" onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#666', fontSize: '1.5rem', cursor: 'pointer'
          }}>×</button>
        </div>

        {/* BODY */}
        <div className="ui-modal-body" style={{ padding: '20px', color: '#eee', lineHeight: '1.6' }}>
          {children}
        </div>

        {/* FOOTER */}
        <div className="ui-modal-footer" style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          
          {/* Show Cancel if there is an action */}
          {onAction && (
              <button className="ui-btn-modal-cancel" onClick={onClose} style={{
                background: '#333', color: '#aaa', border: '1px solid #555',
                padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer'
              }}>
                CANCEL
              </button>
          )}

          <button className="ui-btn-modal-action" onClick={onAction || onClose} style={{
            background: headerColor, color: '#000', border: 'none',
            padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer'
          }}>
            {onAction ? "SUBMIT SCORE" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;