// public/game/script.js

window.startGame = startGame;
window.focus();

// --- GLOBALS ---
let camera, scene, renderer;
let world;
let lastTime;
let stack;
let overhangs;

// --- SENTINEL BIOMETRICS ---
let clickOffsets = [];
let startTime = 0;

// --- CONFIGURATION ---
const boxHeight = 1.5; 
const originalBoxSize = 6.5; 

// SPEED CONFIGURATION
const BASE_SPEED = 0.0005;      
const SPEED_INCREMENT = 0.0002; 
const SPEED_INTERVAL = 4;       

// VISUALS
const CAMERA_WIDTH = 40;       
const TRAVEL_DISTANCE = 25;    

// --- STATE ---
let autoplay = false;
let gameEnded;
let isPlaying = false;
let animationId = null;

// COLOR STATE (The Palette System)
let hue = 230;          // Start Hue
let paletteCount = 0;   // Tracks 0-4 block cycle
let isDarkening = true; // Toggles Light->Dark vs Dark->Light
let targetBgColor = new THREE.Color(); // For smooth blending

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");

init();

function init() {
  autoplay = false;
  gameEnded = false;
  isPlaying = false;
  lastTime = 0;
  stack = [];
  overhangs = [];
  
  // Reset Color State
  hue = 230;
  paletteCount = 0;
  isDarkening = true;

  clickOffsets = [];
  startTime = 0;

  // 1. PHYSICS
  world = new CANNON.World();
  world.gravity.set(0, -30, 0); 
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  // 2. CAMERA
  const aspect = window.innerWidth / window.innerHeight;
  const height = CAMERA_WIDTH / aspect;

  camera = new THREE.OrthographicCamera(
    CAMERA_WIDTH / -2, CAMERA_WIDTH / 2, height / 2, height / -2, 0, 100
  );
  
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  // 3. SCENE
  scene = new THREE.Scene();
  scene.background = new THREE.Color();
  setTargetBackground(); // Initialize BG color
  scene.background.copy(targetBgColor);

  addLayer(0, 0, originalBoxSize, originalBoxSize);
  addLayer(-20, 0, originalBoxSize, originalBoxSize, "x");

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
  scene.add(ambientLight);

  // LIGHTING FIX (Invisible Edge)
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(50, 100, 50); 
  dirLight.castShadow = true;
  
  const d = 150; 
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);
}

function startGame() {
  if (animationId) cancelAnimationFrame(animationId);
  isPlaying = true;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];
  
  // Reset Colors
  hue = 230;
  paletteCount = 0;
  isDarkening = true;
  setTargetBackground();
  
  clickOffsets = [];
  startTime = Date.now();

  if (instructionsElement) instructionsElement.style.display = "none";
  if (scoreElement) scoreElement.innerText = 0;

  if (world) {
    while (world.bodies.length > 0) {
      world.remove(world.bodies[0]);
    }
  }

  if (scene) {
    while (scene.children.find((c) => c.type == "Mesh")) {
      const mesh = scene.children.find((c) => c.type == "Mesh");
      scene.remove(mesh);
    }
    
    scene.background.copy(targetBgColor);
    addLayer(0, 0, originalBoxSize, originalBoxSize);
    addLayer(-20, 0, originalBoxSize, originalBoxSize, "x");
  }

  if (camera) {
    const aspect = window.innerWidth / window.innerHeight;
    const height = CAMERA_WIDTH / aspect;
    camera.left = CAMERA_WIDTH / -2;
    camera.right = CAMERA_WIDTH / 2;
    camera.top = height / 2;
    camera.bottom = height / -2;
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
}

// --- COLOR LOGIC ---
function getCurrentBlockColor() {
    // Logic: 4 steps of Lightness
    // If darkening: 75 -> 70 -> 65 -> 60
    // If lightening: 60 -> 65 -> 70 -> 75
    let lightness;
    if (isDarkening) {
        lightness = 75 - (paletteCount * 5);
    } else {
        lightness = 60 + (paletteCount * 5);
    }
    return new THREE.Color(`hsl(${hue}, 70%, ${lightness}%)`);
}

function setTargetBackground() {
    // Background is a pastel version of the current hue
    // High lightness (85%), Low saturation (30%) for "blending" feel
    targetBgColor.setHSL(hue / 360, 0.3, 0.85);
}

function cycleColor() {
    paletteCount++;
    
    // Every 4 blocks, shift hue and reverse gradient
    if (paletteCount >= 4) {
        paletteCount = 0;
        hue += 30; // Shift to next color theme
        isDarkening = !isDarkening; // Reverse light/dark direction
        setTargetBackground(); // Update background target
    }
}

function addLayer(x, z, width, depth, direction) {
  const y = boxHeight * stack.length;
  const layer = generateBox(x, y, z, width, depth, false);
  layer.direction = direction;
  stack.push(layer);
}

function addOverhang(x, z, width, depth) {
  const y = boxHeight * (stack.length - 1);
  const overhang = generateBox(x, y, z, width, depth, true);
  overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
  const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
  
  // GET THEME COLOR
  const color = getCurrentBlockColor();
  
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
  
  // Mass 5 (Dead weight)
  let mass = falls ? 5 : 0;
  mass *= width / originalBoxSize;
  mass *= depth / originalBoxSize;

  const body = new CANNON.Body({ mass, shape });
  body.position.set(x, y, z);
  
  if (falls) {
      const spin = Math.random() * 0.1;
      body.angularVelocity.set(spin, 0, spin);
  }

  world.addBody(body);
  return { threejs: mesh, cannonjs: body, width, depth };
}

function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction == "x" ? overlap : topLayer.width;
  const newDepth = direction == "z" ? overlap : topLayer.depth;

  topLayer.width = newWidth;
  topLayer.depth = newDepth;
  topLayer.threejs.scale[direction] = overlap / size;
  topLayer.threejs.position[direction] -= delta / 2;
  topLayer.cannonjs.position[direction] -= delta / 2;

  const overhangShift = (overlap / 2 + (size - overlap) / 2) * Math.sign(delta);
  const overhangX = direction == "x" ? topLayer.threejs.position.x + overhangShift : topLayer.threejs.position.x;
  const overhangZ = direction == "z" ? topLayer.threejs.position.z + overhangShift : topLayer.threejs.position.z;
  const overhangWidth = direction == "x" ? size - overlap : topLayer.width;
  const overhangDepth = direction == "z" ? size - overlap : topLayer.depth;

  addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);
}

function animation() {
  if (lastTime) {
    const timePassed = performance.now() - lastTime;
    const topLayer = stack[stack.length - 1];
    const boxShouldMove = !gameEnded && !autoplay;

    if (boxShouldMove) {
      const level = stack.length; 
      let currentSpeed = BASE_SPEED + (Math.floor(level / SPEED_INTERVAL) * SPEED_INCREMENT);
      
      const movePos = Math.sin(Date.now() * currentSpeed) * TRAVEL_DISTANCE;
      
      if (topLayer.direction === 'x') {
        topLayer.threejs.position.x = movePos;
        topLayer.cannonjs.position.x = movePos;
      } else {
        topLayer.threejs.position.z = movePos;
        topLayer.cannonjs.position.z = movePos;
      }
    }

    // BACKGROUND BLENDING
    // Smoothly transition the current background to the target hue
    if (scene.background) {
        scene.background.lerp(targetBgColor, 0.02);
    }

    const targetY = boxHeight * (stack.length - 2) + 4;
    camera.position.y += (targetY - camera.position.y) * 0.1;

    updatePhysics(timePassed);
    renderer.render(scene, camera);
  }
  lastTime = performance.now();
}

function updatePhysics(timePassed) {
  world.step(timePassed / 1000);
  overhangs.forEach((element) => {
    element.threejs.position.copy(element.cannonjs.position);
    element.threejs.quaternion.copy(element.cannonjs.quaternion);
  });
}

function missedTheSpot() {
  const topLayer = stack[stack.length - 1];
  addOverhang(topLayer.threejs.position.x, topLayer.threejs.position.z, topLayer.width, topLayer.depth);
  world.remove(topLayer.cannonjs);
  scene.remove(topLayer.threejs);

  gameEnded = true;
  isPlaying = false;
  if (instructionsElement) instructionsElement.style.display = "flex";
  
  const finalScore = stack.length - 1; 
  const duration = Date.now() - startTime;
  
  if (finalScore > 0) {
      const payload = { 
          type: "GAME_OVER", 
          score: finalScore,
          biometrics: { duration, clickOffsets }
      };
      window.parent.postMessage(payload, "*");
  }
}

function splitBlockAndAddNextOneIfOverlaps() {
  if (gameEnded) return;
  const topLayer = stack[stack.length - 1];
  const previousLayer = stack[stack.length - 2];
  const direction = topLayer.direction;
  const size = direction == "x" ? topLayer.width : topLayer.depth;
  const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];
  const overhangSize = Math.abs(delta);
  const overlap = size - overhangSize;

  if (overlap > 0) {
    cutBox(topLayer, overlap, size, delta);
    clickOffsets.push(delta);
    
    // UPDATE COLOR CYCLE
    cycleColor();
    
    const nextX = direction == "x" ? topLayer.threejs.position.x : -20;
    const nextZ = direction == "z" ? topLayer.threejs.position.z : -20;
    const newWidth = topLayer.width;
    const newDepth = topLayer.depth;
    const nextDirection = direction == "x" ? "z" : "x";
    
    if (scoreElement) scoreElement.innerText = stack.length - 1;
    addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
  } else {
    missedTheSpot();
  }
}

window.addEventListener("mousedown", (e) => {
    if (isPlaying) {
        e.preventDefault();
        splitBlockAndAddNextOneIfOverlaps();
    }
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.key === " ") {
    event.preventDefault();
    if (isPlaying) splitBlockAndAddNextOneIfOverlaps();
    else if (!gameEnded && document.getElementById("instructions").style.display !== "none") startGame();
  }
});
window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  const height = CAMERA_WIDTH / aspect;
  camera.left = CAMERA_WIDTH / -2;
  camera.right = CAMERA_WIDTH / 2;
  camera.top = height / 2;
  camera.bottom = height / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});