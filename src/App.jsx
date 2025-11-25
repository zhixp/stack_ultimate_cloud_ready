/* global BigInt */
import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, http, parseEther, formatEther, keccak256, toBytes, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import Game from './Game';
import Modal from './components/Modal';
import GameOverModal from './components/GameOverModal';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './abi';

// HARDCODED PRODUCTION URL
const BACKEND_API_URL = "https://stack-backend-node.onrender.com/api/submit-score";
const ENTRY_FEE = "0.00001";
const GAS_BUFFER = 0.00005;

const abstractChain = {
  id: 11124, name: 'Abstract Testnet', network: 'abstract-testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
};

function App() {
  const { login, authenticated, user, logout, signMessage } = usePrivy();
  const { wallets } = useWallets();
  
  const [potSize, setPotSize] = useState("0");
  const [highScore, setHighScore] = useState("0");
  const [targetScore, setTargetScore] = useState(0);
  const [burnerBalance, setBurnerBalance] = useState("0");
  const [burnerAddress, setBurnerAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("0.001"); 
  const [isGameActive, setIsGameActive] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  
  const [infoModal, setInfoModal] = useState({ open: false, title: "", content: "", type: "info" });
  const [showResult, setShowResult] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [isRecordingScore, setIsRecordingScore] = useState(false);
  
  const [showWalletMgr, setShowWalletMgr] = useState(false);
  const [viewPrivateKey, setViewPrivateKey] = useState(false);

  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLoadingLeaders, setIsLoadingLeaders] = useState(false);

  const showInfo = (title, content, type = "info") => setInfoModal({ open: true, title, content, type });

  useEffect(() => {
    const storedKey = localStorage.getItem("stack_burner_key");
    if (storedKey && storedKey.startsWith("0x") && storedKey.length === 66) {
        try {
            const account = privateKeyToAccount(storedKey);
            setBurnerAddress(account.address);
        } catch (e) {
            localStorage.removeItem("stack_burner_key");
        }
    }
  }, []);

  const handleShowLeaderboard = async () => {
      setShowLeaderboard(true);
      setIsLoadingLeaders(true);
      try {
          const publicClient = createPublicClient({ chain: abstractChain, transport: http() });
          const logs = await publicClient.getLogs({  
            address: CONTRACT_ADDRESS,
            event: parseAbiItem('event NewHighScore(address indexed player, uint256 score)'),
            fromBlock: 'earliest', toBlock: 'latest'
          });
          const scores = logs.map(log => ({ player: log.args.player, score: Number(log.args.score) }));
          const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 30);
          setLeaderboardData(sorted);
      } catch (e) { console.error(e); } finally { setIsLoadingLeaders(false); }
  };

  const handleRestoreWallet = async () => {
      if (!authenticated || wallets.length === 0) {
          showInfo("Connection Lost", "Please Logout and Login again.", "error");
          return;
      }
      try {
          setIsWriting(true);
          const wallet = wallets[0]; 
          await wallet.switchChain(11124);
          const provider = await wallet.getEthereumProvider();
          const client = createWalletClient({ account: wallet.address, chain: abstractChain, transport: custom(provider) });
          
          const signature = await client.signMessage({ 
              account: wallet.address,
              message: "Generate My Stack Ultimate Wallet Key\n\n(Signing this will restore your game balance)" 
          });
          const deterministicKey = keccak256(toBytes(signature));
          localStorage.setItem("stack_burner_key", deterministicKey);
          const account = privateKeyToAccount(deterministicKey);
          setBurnerAddress(account.address);
          showInfo("Success", "Wallet Restored!", "success");
          fetchGameState();
      } catch (e) { showInfo("Error", "Could not sign message.", "error"); } finally { setIsWriting(false); }
  };

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

  const handleTopUp = async () => {
      if (!burnerAddress) { showInfo("No Wallet", "Please Initialize Wallet first.", "error"); return; }
      if (!depositAmount || parseFloat(depositAmount) <= 0) { showInfo("Error", "Invalid amount.", "error"); return; }
      try {
          setIsWriting(true);
          const wallet = wallets[0];
          await wallet.switchChain(11124);
          const provider = await wallet.getEthereumProvider();
          const client = createWalletClient({ account: wallet.address, chain: abstractChain, transport: custom(provider) });
          await client.sendTransaction({ to: burnerAddress, value: parseEther(depositAmount) });
          showInfo("Success", `Deposited ${depositAmount} ETH!`, "success");
          setTimeout(fetchGameState, 2000); 
      } catch(e) { showInfo("Deposit Failed", "Check Main Wallet balance.", "error"); } finally { setIsWriting(false); }
  };

  const handleWithdraw = async () => {
      if (!burnerAddress) return;
      if (parseFloat(burnerBalance) <= 0) { showInfo("Error", "Wallet is empty.", "error"); return; }
      try {
          setIsWriting(true);
          const pKey = localStorage.getItem("stack_burner_key");
          const account = privateKeyToAccount(pKey);
          const client = createWalletClient({ account, chain: abstractChain, transport: http() });
          const publicClient = createPublicClient({ chain: abstractChain, transport: http() });
          const balance = await publicClient.getBalance({ address: burnerAddress });
          const buffer = parseEther("0.00005"); 
          const valueToSend = balance - buffer;
          if (valueToSend <= 0n) { showInfo("Balance Low", `Need > 0.00005 ETH for gas.`, "error"); return; }
          const userAddress = user?.wallet?.address;
          await client.sendTransaction({ to: userAddress, value: valueToSend });
          showInfo("Success", `Withdrew ~${formatEther(valueToSend)} ETH!`, "success");
          setTimeout(fetchGameState, 2000);
      } catch (e) { showInfo("Failed", e.shortMessage || "Unknown error", "error"); } finally { setIsWriting(false); }
  };

  const handleStartGame = async () => {
      if (!burnerAddress) { showInfo("No Wallet", "Please Initialize Game Wallet.", "error"); return; }
      const required = parseFloat(ENTRY_FEE) + GAS_BUFFER;
      if (parseFloat(burnerBalance) < required) {
          showInfo("Low Balance", `Need ${required} ETH (Ticket + Gas).`, "error");
          return;
      }
      try {
          setIsGameActive(true); 
          setShowResult(false);
          const pKey = localStorage.getItem("stack_burner_key");
          const account = privateKeyToAccount(pKey);
          const client = createWalletClient({ account, chain: abstractChain, transport: http() });
          await client.writeContract({
             address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'startGame',
             value: parseEther(ENTRY_FEE)
          });
      } catch (e) { setIsGameActive(false); showInfo("Session Failed", e.shortMessage || "Network Error", "error"); }
  };

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
        setIsRecordingScore(false);
        setShowResult(false);
        showInfo("Error", "Submission failed: " + error.message, "error");
    }
  };

  const copyPrivateKey = () => {
      const key = localStorage.getItem("stack_burner_key");
      if(key) { navigator.clipboard.writeText(key); alert("Key Copied!"); }
      else { alert("No key found. Initialize wallet first."); }
  };

  return (
    <div className="ui-app-container">
      <Modal isOpen={infoModal.open} onClose={() => setInfoModal({...infoModal, open: false})} title={infoModal.title} type={infoModal.type}>{infoModal.content}</Modal>
      {showResult && <GameOverModal score={lastScore} isRecording={isRecordingScore} onClose={() => setShowResult(false)} onReplay={handleStartGame} />}

      {showLeaderboard && (
        <div className="ui-modal-overlay" style={{
            position:'fixed', top:0, left:0, width:'100%', height:'100%', 
            background:'rgba(0,0,0,0.9)', zIndex:11000, display:'flex', justifyContent:'center', alignItems:'center'
        }}>
            <div style={{background:'#1a1a1a', padding:'20px', borderRadius:'15px', border:'1px solid #444', width:'90%', maxWidth:'500px', maxHeight:'80vh', overflowY:'auto'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                    <h2 style={{color:'#fff', margin:0}}>🏆 TOP 30</h2>
                    <button onClick={() => setShowLeaderboard(false)} style={{background:'transparent', border:'none', color:'#fff', fontSize:'1.5rem', cursor:'pointer'}}>×</button>
                </div>
                {isLoadingLeaders ? (
                    <div style={{textAlign:'center', color:'#aaa', padding:'20px'}}>Loading...</div>
                ) : (
                    <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                        {leaderboardData.length === 0 ? <div style={{textAlign:'center', color:'#666'}}>No records yet.</div> : null}
                        {leaderboardData.map((entry, index) => (
                            <div key={index} style={{display:'flex', justifyContent:'space-between', background:'#111', padding:'10px', borderRadius:'8px', border:'1px solid #333'}}>
                                <div style={{display:'flex', gap:'10px'}}>
                                    <span style={{color: index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : '#666', fontWeight:'bold'}}>#{index + 1}</span>
                                    <span style={{color:'#aaa', fontFamily:'monospace'}}>{entry.player.substring(0, 8)}...</span>
                                </div>
                                <div style={{color:'#0f0', fontWeight:'bold'}}>{entry.score}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}

      {showWalletMgr && (
        <div className="ui-modal-overlay" style={{
            position:'fixed', top:0, left:0, width:'100%', height:'100%', 
            background:'rgba(0,0,0,0.9)', zIndex:11000, display:'flex', justifyContent:'center', alignItems:'center'
        }}>
            <div style={{background:'#1a1a1a', padding:'30px', borderRadius:'15px', border:'1px solid #444', maxWidth:'400px', width:'90%'}}>
                <h2 style={{color:'#fff', marginTop:0}}>WALLET SETTINGS</h2>
                <div style={{background:'#000', padding:'10px', borderRadius:'5px', margin:'15px 0', overflowWrap:'break-word', fontFamily:'monospace', color:'#0f0', fontSize:'0.8rem'}}>
                    {viewPrivateKey ? (localStorage.getItem("stack_burner_key") || "No Key Found") : "•".repeat(64)}
                </div>
                <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
                    <button className="ui-btn-buy" onClick={() => setViewPrivateKey(!viewPrivateKey)} style={{fontSize:'0.8rem'}}>{viewPrivateKey ? "HIDE" : "REVEAL"}</button>
                    <button className="ui-btn-buy" onClick={copyPrivateKey} style={{fontSize:'0.8rem'}}>COPY KEY</button>
                </div>
                <div style={{display:'flex', gap:'10px'}}>
                    <button className="ui-btn-buy" onClick={() => setShowWalletMgr(false)} style={{background:'#333', width:'100%'}}>CLOSE</button>
                </div>
            </div>
        </div>
      )}

      <div className="ui-top-bar">
        <div className="ui-logo">STACK <span className="ui-highlight">ULTIMATE</span></div>
        <div className="ui-ticker">💰 POT: {potSize} ETH &nbsp;|&nbsp; 🎮 WALLET: {burnerAddress ? Number(burnerBalance).toFixed(5) : "---"} ETH</div>
        
        {/* CHANGE: LEADERBOARD BUTTON MOVED HERE */}
        <button onClick={handleShowLeaderboard} style={{marginLeft:'15px', background:'transparent', border:'1px solid #555', color:'#0ff', padding:'5px 10px', borderRadius:'5px', cursor:'pointer', fontSize:'0.8rem'}}>🏆 LEADERS</button>

        {authenticated ? <button onClick={logout} className="ui-btn-connect" style={{marginLeft:'15px'}}>LOGOUT</button> : <button onClick={login} className="ui-btn-connect" style={{marginLeft:'15px'}}>LOGIN</button>}
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
                    {!burnerAddress ? (
                        <div style={{textAlign:'center', padding:'20px'}}>
                            <div style={{color:'#aaa', marginBottom:'15px'}}>Initialize game wallet to play</div>
                            <button className="ui-btn-play" onClick={handleRestoreWallet} disabled={isWriting} style={{fontSize:'1rem'}}>
                                🔑 INITIALIZE / RESTORE
                            </button>
                            <p style={{color:'#666', fontSize:'0.7rem', marginTop:'10px'}}>Signs a secure key from your wallet.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '15px'}}>
                                <div style={{color: '#aaa', fontSize: '0.9rem', letterSpacing: '1px', textTransform: 'uppercase'}}>In-Game Wallet</div>
                                <button onClick={() => setShowWalletMgr(true)} style={{background:'transparent', border:'1px solid #555', color:'#aaa', padding:'5px 10px', borderRadius:'5px', cursor:'pointer', fontSize:'0.8rem'}}>⚙️</button>
                            </div>
                            <div className="ui-value" style={{fontSize: '2rem', marginBottom: '20px', color: '#fff', textShadow: '0 0 10px rgba(255,255,255,0.1)'}}>{Number(burnerBalance).toFixed(5)} ETH</div>
                            <div style={{display: 'flex', gap: '10px', marginBottom: '15px'}}>
                                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} step="0.001" style={{background: '#222', border: '1px solid #555', color: 'white', padding: '10px', borderRadius: '5px', width: '100px', textAlign: 'center'}} />
                                <button className="ui-btn-buy" onClick={handleTopUp} disabled={isWriting} style={{flex: 1, fontSize: '0.9rem'}}>⬇ DEPOSIT</button>
                            </div>
                            <button className="ui-btn-buy" onClick={handleWithdraw} disabled={isWriting} style={{width: '100%', background: '#333', border: '1px solid #555', fontSize: '0.9rem', marginBottom: '20px'}}>⬆ WITHDRAW ALL</button>
                            <div style={{height: '1px', background: '#333', marginBottom: '20px'}}></div>
                            <button className="ui-btn-play" style={{width: '100%', padding: '15px', fontSize: '1.2rem'}} onClick={handleStartGame} disabled={isWriting || parseFloat(burnerBalance) < (parseFloat(ENTRY_FEE) + GAS_BUFFER)}>PLAY FOR POT ({ENTRY_FEE} ETH)</button>
                            <div className="ui-text-warning" style={{marginTop:'10px', fontSize: '0.8rem', opacity: 0.7}}>Session Secured. No Popups.</div>
                        </>
                    )}
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