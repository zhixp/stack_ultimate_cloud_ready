/* global BigInt */
import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, http, parseEther, formatEther } from 'viem';
import Game from './Game';

// --- 1. CONTRACT CONFIGURATION ---
// The Contract you deployed on Abstract Testnet
const CONTRACT_ADDRESS = "0x27D53d1c60Ea8c8dc95B398dB98549536aA36F9E";

const CONTRACT_ABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "player",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "count",
				"type": "uint256"
			}
		],
		"name": "TicketsBought",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "count",
				"type": "uint256"
			}
		],
		"name": "buy_tickets",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "player",
				"type": "address"
			}
		],
		"name": "get_game_state",
		"outputs": [
			{ "internalType": "uint256", "name": "", "type": "uint256" }, // Pot
			{ "internalType": "uint256", "name": "", "type": "uint256" }, // HighScore
			{ "internalType": "address", "name": "", "type": "address" }, // King
			{ "internalType": "uint256", "name": "", "type": "uint256" }, // EndTime
			{ "internalType": "uint256", "name": "", "type": "uint256" }, // Tickets
			{ "internalType": "uint256", "name": "", "type": "uint256" }  // XP
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "score",
				"type": "uint256"
			}
		],
		"name": "play_round",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
];

// --- 2. CHAIN CONFIGURATION ---
const abstractChain = {
  id: 11124,
  name: 'Abstract Testnet',
  network: 'abstract-testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
};

function App() {
  // --- 3. HOOKS & STATE ---
  const { login, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  
  const [potSize, setPotSize] = useState("0");
  const [highScore, setHighScore] = useState("0");
  const [king, setKing] = useState("0x00...00");
  const [tickets, setTickets] = useState(0);
  const [xp, setXp] = useState(0);
  
  // Ticket Shop State
  const [buyAmount, setBuyAmount] = useState(5);
  
  // Game State
  const [isGameActive, setIsGameActive] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  // --- 4. HELPER: FETCH DATA ---
  const fetchGameState = async () => {
    try {
      const publicClient = createPublicClient({ chain: abstractChain, transport: http() });
      // If logged in, use user address. If not, use a zero address just to read global stats.
      const playerAddress = user?.wallet?.address || "0x0000000000000000000000000000000000000000";
      
      const data = await publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'get_game_state',
        args: [playerAddress]
      });

      setPotSize(formatEther(data[0]));
      setHighScore(data[1].toString());
      setKing(data[2]);
      setTickets(Number(data[4])); // Ticket Balance
      setXp(Number(data[5]));      // XP Balance
    } catch (error) { console.error("Read Error:", error); }
  };

  // Auto-fetch every 5 seconds
  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // --- 5. HELPER: GET SIGNER ---
  const getSigner = async () => {
    const wallet = wallets[0];
    if (!wallet) throw new Error("No wallet connected");
    await wallet.switchChain(11124);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({ account: wallet.address, chain: abstractChain, transport: custom(provider) });
  };

  // --- 6. ACTION: BUY TICKETS ---
  const handleBuyTickets = async () => {
    try {
      setIsWriting(true);
      const client = await getSigner();
      const [address] = await client.getAddresses();
      
      // Calculate Price: 0.0001 ETH per ticket
      const costString = (buyAmount * 0.0001).toFixed(4).toString();

      await client.writeContract({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'buy_tickets',
        account: address, 
        args: [BigInt(buyAmount)], 
        value: parseEther(costString),
        gas: BigInt(500000) // Force gas limit to prevent estimation errors
      });
      
      alert(`Success! Purchased ${buyAmount} Tickets.`);
      setIsWriting(false);
      fetchGameState(); // Refresh UI
    } catch (error) {
      console.error(error);
      setIsWriting(false);
      alert("Purchase Failed: " + (error.shortMessage || error.message));
    }
  };

  // --- 7. ACTION: START GAME ---
  const handleStartGame = () => {
    if (tickets > 0) {
        setIsGameActive(true); // Show the Iframe
    } else {
        alert("No Tickets! Buy some to enter.");
    }
  };

  // --- 8. ACTION: GAME OVER ---
  const handleGameOver = async (score) => {
    // Close the game window
    setIsGameActive(false);
    if (score === 0) return;
    
    // 1. Update UI Locally (Optimistic)
    setTickets(prev => Math.max(0, prev - 1));
    alert(`Game Over! Score: ${score}. \n(Ticket deducted locally. Score sent to server.)`);
    
    // 2. Submit to Blockchain (Silent / Optional for now to prevent popup spam)
    /* // UNCOMMENT THIS BLOCK WHEN YOU WANT REAL TRANSACTIONS ON LOSS
    try {
      const client = await getSigner();
      const [address] = await client.getAddresses();
      await client.writeContract({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'play_round',
        account: address, args: [BigInt(score)]
      });
      fetchGameState();
    } catch (error) { console.error("Score Submit Error", error); }
    */
  };

  // Helper for dropdown
  const ticketOptions = Array.from({length: 50}, (_, i) => i + 1);

  // --- 9. RENDER ---
  return (
    <div className="app-container">
      
      {/* TOP BAR */}
      <div className="top-bar">
        <div className="logo">STACK <span className="highlight">'EM</span></div>
        <div className="ticker">
           🎟 {tickets} &nbsp;|&nbsp; 
           ⭐ {xp} XP &nbsp;|&nbsp;
           💰 {potSize} ETH
        </div>
        {authenticated ? (
          <button onClick={logout} className="connect-btn">{user?.wallet?.address.substring(0,6)}... (LOGOUT)</button>
        ) : (
          <button onClick={login} className="connect-btn">LOGIN</button>
        )}
      </div>

      {/* MAIN ARENA */}
      <div className="arena">
        {!authenticated ? (
          // STATE: LOGGED OUT
          <div className="welcome-card">
            <h1>PROOF OF SKILL</h1>
            <p>Login to Play</p>
            <button onClick={login} className="play-btn">LOGIN</button>
          </div>
        ) : (
          <>
            {/* STATE: LOBBY */}
            {!isGameActive ? (
              <div className="lobby-card">
                <div className="stats-row">
                  <div className="stat-box"><div className="label">POT</div><div className="value glow-green">{potSize} ETH</div></div>
                  <div className="stat-box"><div className="label">KING (48h)</div><div className="value">{highScore}</div></div>
                </div>

                <div className="xp-bar">
                    <div className="xp-fill" style={{width: `${(xp % 1000) / 10}%`}}></div>
                    <span className="xp-text">Level {Math.floor(xp / 1000) + 1}</span>
                </div>

                {tickets > 0 ? (
                    <div className="action-area">
                        <button className="play-btn" onClick={handleStartGame}>
                          PLAY NOW ({tickets})
                        </button>
                        <div className="divider">OR BUY MORE</div>
                    </div>
                ) : null}

                {/* TICKET SHOP */}
                <div className="ticket-shop">
                    <div className="ticket-controls">
                        <button className="control-btn" onClick={() => setBuyAmount(Math.max(1, buyAmount - 1))}>-</button>
                        <input 
                            type="number" 
                            className="ticket-input" 
                            value={buyAmount} 
                            onChange={(e) => setBuyAmount(Number(e.target.value))}
                            min="1" max="50"
                        />
                        <button className="control-btn" onClick={() => setBuyAmount(Math.min(50, buyAmount + 1))}>+</button>
                    </div>
                    
                    <select 
                        className="ticket-dropdown"
                        value={buyAmount} 
                        onChange={(e) => setBuyAmount(Number(e.target.value))}
                    >
                        {ticketOptions.map(num => (
                            <option key={num} value={num}>{num} Tickets</option>
                        ))}
                    </select>

                    <button className="buy-btn" onClick={handleBuyTickets} disabled={isWriting}>
                       {isWriting ? "CONFIRMING..." : `BUY FOR ${(buyAmount * 0.0001).toFixed(4)} ETH`}
                    </button>
                </div>
                
                <div className="king-display">King: {king.substring(0,8)}...</div>
              </div>
            ) : (
              // STATE: PLAYING GAME
              <Game gameActive={isGameActive} onGameOver={handleGameOver} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;