import React, { useEffect, useRef } from "react";

const Game = ({ gameActive, onGameOver }) => {
  const iframeRef = useRef(null);
  
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === "GAME_OVER") {
        console.log("Game over received via Bridge. Score:", event.data.score);
        onGameOver(event.data.score);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onGameOver]);

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.focus();
    }
  }, []);

  if (!gameActive) return null;

  return (
    <div className="game-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        background: '#d0cbd0'
    }}>
      <iframe 
        ref={iframeRef}
        src="/game/index.html" 
        title="Stack Game"
        style={{width: '100%', height: '100%', border: 'none', display: 'block'}}
        scrolling="no"
      />
       <button 
        onClick={() => onGameOver(0)} // Manual Exit
        style={{
            position:'absolute', top: 20, right: 20, 
            padding: '10px 20px', background:'red', color:'white', 
            border:'none', borderRadius:'5px', cursor:'pointer', fontWeight:'bold'
        }}
      >
        EXIT
      </button>
    </div>
  );
};

export default Game;