/* global BigInt */
import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import Game from './Game';
import Modal from './components/Modal';
import GameOverModal from './components/GameOverModal';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './abi';

const BACKEND_API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/submit-score";
const ENTRY_FEE = "0.00001";

const abstractChain = {
  id: 11124, name: 'Abstract Testnet', network: 'abstract-testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
};

function App() {
  const { login, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  
  // State
  const [potSize, setPotSize] = useState("0");
  const [highScore, setHighScore] = useState("0");
  const [targetScore, setTargetScore] = useState(0);
  
  const [burnerBalance, setBurnerBalance] = useState("0");
  const [burnerAddress, setBurnerAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("0.001"); 
  
  const [isGameActive, setIsGameActive] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  
  // Modals
  const [infoModal, setInfoModal] = useState({ open: false, title: "", content: "", type: "info" });
  const [showResult, setShowResult] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [isRecordingScore, setIsRecordingScore] = useState(false);

  const showInfo = (title, content, type = "info") => setInfoModal({ open: true, title, content, type });

  // --- INIT BURNER ---
  useEffect(() => {
    let pKey = localStorage.getItem("stack_burner_key");
    if (!pKey) {
        const randomKey = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem("stack_burner_key", randomKey);
        pKey = randomKey;
    }
    const account = privateKeyToAccount(pKey);
    setBurnerAddress(account.address);
  }, []);

  // --- DATA LOOP ---
  const fetchGameState = async () => {
    try {
      const publicClient = createPublicClient({ chain: abstractChain, transport: http() });
      
      const [pot, hs, target] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'pot' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'currentHighScore' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'targetScore' }),
      ]);
      setPotSize(formatEther(pot));
      setHighScore(hs.toString());
      setTargetScore(Number(target));

      if (burnerAddress) {
          const bal = await publicClient.getBalance({ address: burnerAddress });
          setBurnerBalance(formatEther(bal));
      }
    } catch (error) { console.error("Read Error:", error); }
  };

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 5000);
    return () => clearInterval(interval);
  }, [user, burnerAddress]);

  // --- DEPOSIT (Main -> Burner) ---
  const handleTopUp = async () => {
      if (!depositAmount || parseFloat(depositAmount) <= 0) {
          showInfo("Error", "Please enter a valid amount.", "error");
          return;
      }

      try {
          setIsWriting(true);
          const wallet = wallets[0];
          await wallet.switchChain(11124);
          const provider = await wallet.getEthereumProvider();
          const client = createWalletClient({ account: wallet.address, chain: abstractChain, transport: custom(provider) });
          
          await client.sendTransaction({ 
              to: burnerAddress, 
              value: parseEther(depositAmount) 
          });
          
          showInfo("Success", `Deposited ${depositAmount} ETH!`, "success");
          setTimeout(fetchGameState, 2000); 
      } catch(e) { 
          console.error(e);
          showInfo("Deposit Failed", "Check Main Wallet balance.", "error"); 
      } finally { 
          setIsWriting(false); 
      }
  };

  // --- WITHDRAW (Burner -> Main) ---
  const handleWithdraw = async () => {
      if (parseFloat(burnerBalance) <= 0) {
          showInfo("Error", "Wallet is empty.", "error");
          return;
      }

      try {
          setIsWriting(true);
          const pKey = localStorage.getItem("stack_burner_key");
          const account = privateKeyToAccount(pKey);
          
          // NOTE: We use the standard public client for the Burner
          const client = createWalletClient({ account, chain: abstractChain, transport: http() });
          const publicClient = createPublicClient({ chain: abstractChain, transport: http() });

          // 1. Get current balance
          const balance = await publicClient.getBalance({ address: burnerAddress });
          
          // 2. STATIC GAS BUFFER (0.0002 ETH)
          // This covers L2 execution + L1 Data fees safely.
          const buffer = parseEther("0.0002");
          
          // 3. Calculate Max Sendable
          const valueToSend = balance - buffer;

          if (valueToSend <= 0n) {
              showInfo("Balance Too Low", "You need at least 0.0002 ETH to cover gas fees.", "error");
              return;
          }

          const userAddress = user?.wallet?.address;
          if (!userAddress) throw new Error("No main wallet connected");

          // 4. Send Transaction
          // NOTE: No MetaMask popup here. The Burner signs this instantly.
          await client.sendTransaction({
              to: userAddress,
              value: valueToSend
          });

          showInfo("Success", `Withdrew ~${formatEther(valueToSend)} ETH!`, "success");
          setTimeout(fetchGameState, 2000);

      } catch (e) {
          console.error(e);
          // Display the actual error message for better debugging
          showInfo("Withdrawal Failed", e.shortMessage || e.message || "Unknown error", "error");
      } finally {
          setIsWriting(false);
      }
  };

  // --- START GAME ---
  const handleStartGame = async () => {
      if (parseFloat(burnerBalance) < parseFloat(ENTRY_FEE)) {
          showInfo("Low Balance", "Top Up Game Wallet to play.", "error");
          return;
      }
      try {
          setIsGameActive(true); 
          setShowResult(false);
          const pKey = localStorage.getItem("stack_burner_key");
          const account = privateKeyToAccount(pKey);
          const client = createWalletClient({ account, chain: abstractChain, transport: http() });
          
          client.writeContract({
             address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'startGame',
             value: parseEther(ENTRY_FEE)
          });
      } catch (e) {
          setIsGameActive(false);
          showInfo("Error", "Could not start session.", "error");
      }
  };

  // --- GAME OVER ---
  const handleGameOver = async (score, biometrics) => {
    setIsGameActive(false);
    if (score === 0 || !biometrics) return;

    setLastScore(score);
    setShowResult(true);
    setIsRecordingScore(true);

    try {
        const pKey = localStorage.getItem("stack_burner_key");
        const account = privateKeyToAccount(pKey); 
        
        const response = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userAddress: account.address, 
                gameData: { score, duration: biometrics.duration, clickOffsets: biometrics.clickOffsets }
            })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.message);

        const client = createWalletClient({ account, chain: abstractChain, transport: http() });
        await client.writeContract({
            address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'submitScore',
            args: [BigInt(score), data.signature]
        });
        
        fetchGameState();
        setTimeout(() => setIsRecordingScore(false), 1000); 
    } catch (error) {
        console.error(error);
        setIsRecordingScore(false);
        setShowResult(false);
        showInfo("Error", "Submission failed.", "error");
    }
  };

  return (
    <div className="ui-app-container">
      <Modal isOpen={infoModal.open} onClose={() => setInfoModal({...infoModal, open: false})} title={infoModal.title} type={infoModal.type}>{infoModal.content}</Modal>
      {showResult && <GameOverModal score={lastScore} isRecording={isRecordingScore} onClose={() => setShowResult(false)} onReplay={handleStartGame} />}

      <div className="ui-top-bar">
        <div className="ui-logo">STACK <span className="ui-highlight">ULTIMATE</span></div>
        <div className="ui-ticker">💰 POT: {potSize} ETH &nbsp;|&nbsp; 🎮 WALLET: {Number(burnerBalance).toFixed(5)} ETH</div>
        {authenticated ? <button onClick={logout} className="ui-btn-connect">LOGOUT</button> : <button onClick={login} className="ui-btn-connect">LOGIN</button>}
      </div>

      <div className="ui-arena">
        {!authenticated ? (
            <div className="ui-card-welcome"><h1>PROOF OF SKILL</h1><button onClick={login} className="ui-btn-play">LOGIN</button></div>
        ) : (
          <>
            {!isGameActive ? (
              <div className="ui-card-lobby">
                <div className="ui-stats-row">
                  <div className="ui-stat-box"><div className="ui-label">TARGET</div><div className="ui-value">{targetScore}</div></div>
                  <div className="ui-stat-box"><div className="ui-label">HIGH SCORE</div><div className="ui-value">{highScore}</div></div>
                </div>
                
                <div className="ui-shop-section" style={{marginTop: '20px', padding: '20px', border: '1px solid #444', borderRadius: '10px', background: 'rgba(0,0,0,0.3)'}}>
                    <div style={{marginBottom: '15px', color: '#aaa', fontSize: '0.9rem', letterSpacing: '1px', textTransform: 'uppercase'}}>In-Game Wallet</div>
                    <div className="ui-value" style={{fontSize: '2rem', marginBottom: '20px', color: '#fff', textShadow: '0 0 10px rgba(255,255,255,0.1)'}}>{Number(burnerBalance).toFixed(5)} ETH</div>
                    
                    {/* DEPOSIT */}
                    <div style={{display: 'flex', gap: '10px', marginBottom: '15px'}}>
                        <input 
                            type="number" 
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            step="0.001"
                            style={{
                                background: '#222', border: '1px solid #555', color: 'white', 
                                padding: '10px', borderRadius: '5px', width: '100px', textAlign: 'center'
                            }}
                        />
                        <button className="ui-btn-buy" onClick={handleTopUp} disabled={isWriting} style={{flex: 1, fontSize: '0.9rem'}}>
                           ⬇ DEPOSIT
                        </button>
                    </div>

                    {/* WITHDRAW */}
                    <button className="ui-btn-buy" onClick={handleWithdraw} disabled={isWriting} style={{width: '100%', background: '#333', border: '1px solid #555', fontSize: '0.9rem', marginBottom: '20px'}}>
                           ⬆ WITHDRAW ALL
                    </button>
                    
                    <div style={{height: '1px', background: '#333', marginBottom: '20px'}}></div>

                    {/* PLAY */}
                    <button className="ui-btn-play" style={{width: '100%', padding: '15px', fontSize: '1.2rem'}} onClick={handleStartGame} disabled={isWriting || parseFloat(burnerBalance) < parseFloat(ENTRY_FEE)}>
                        PLAY FOR POT ({ENTRY_FEE} ETH)
                    </button>
                    
                    <div className="ui-text-warning" style={{marginTop:'10px', fontSize: '0.8rem', opacity: 0.7}}>
                        Session Secured. No Popups.
                    </div>
                </div>
              </div>
            ) : (
              <Game gameActive={isGameActive} onGameOver={handleGameOver} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
export default App;