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

// SPEED CONFIG
const BASE_SPEED = 0.0005;      
const SPEED_INCREMENT = 0.0002; 
const SPEED_INTERVAL = 4;       

// VISUALS
// CHANGE: Increased to 40 to prevent edge clipping on all aspect ratios
const ZOOM = 40; 
const TRAVEL_DISTANCE = 25; 

// --- STATE ---
let autoplay = false;
let gameEnded;
let isPlaying = false;
let animationId = null;
let hue = 200; 

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
  hue = 200; 

  clickOffsets = [];
  startTime = 0;

  // 1. PHYSICS
  world = new CANNON.World();
  world.gravity.set(0, -30, 0); 
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 40;

  // 2. SCENE
  scene = new THREE.Scene();

  // 3. CAMERA
  const aspect = window.innerWidth / window.innerHeight;
  const d = ZOOM; 
  
  camera = new THREE.OrthographicCamera(
    -d * aspect, d * aspect, 
    d, -d, 
    1, 1000 
  );
  
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  // 4. RENDERER
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animation);
  document.body.appendChild(renderer.domElement);
  
  updateBackground();

  // 5. LIGHTS
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 60, 20); 
  dirLight.castShadow = true;
  
  // SHADOW TUNING (Fixes fading/artifacts)
  dirLight.shadow.bias = -0.0005; // Removes shadow acne/lines
  const shadowD = 200; 
  dirLight.shadow.camera.left = -shadowD;
  dirLight.shadow.camera.right = shadowD;
  dirLight.shadow.camera.top = shadowD;
  dirLight.shadow.camera.bottom = -shadowD;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  scene.add(dirLight);

  // Base Blocks
  addLayer(0, 0, originalBoxSize, originalBoxSize);
  addLayer(-30, 0, originalBoxSize, originalBoxSize, "x");
}

function startGame() {
  if (animationId) cancelAnimationFrame(animationId);
  isPlaying = true;
  gameEnded = false;
  lastTime = 0;
  stack = [];
  overhangs = [];
  hue = 200;
  
  clickOffsets = [];
  startTime = Date.now();

  if (instructionsElement) instructionsElement.style.display = "none";
  if (scoreElement) scoreElement.innerText = 0;
  updateBackground();

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
    
    addLayer(0, 0, originalBoxSize, originalBoxSize);
    addLayer(-30, 0, originalBoxSize, originalBoxSize, "x");
  }

  if (camera) {
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
  }
}

function updateBackground() {
    const h1 = hue % 360;
    const h2 = (hue + 40) % 360;
    document.body.style.background = `linear-gradient(180deg, hsl(${h1}, 50%, 80%) 0%, hsl(${h2}, 50%, 90%) 100%)`;
    if(scoreElement) scoreElement.style.color = `hsl(${h1}, 30%, 30%)`;
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
  const color = new THREE.Color(`hsl(${hue}, 60%, 65%)`);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
  
  let mass = falls ? 0.5 : 0; // Dead Weight
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

// --- CORE CHANGE: DESTROY & REBUILD STRATEGY ---
function cutBox(topLayer, overlap, size, delta) {
  const direction = topLayer.direction;
  const newWidth = direction == "x" ? overlap : topLayer.width;
  const newDepth = direction == "z" ? overlap : topLayer.depth;

  // 1. Remove the OLD Visual Mesh & Physics Body
  scene.remove(topLayer.threejs);
  world.remove(topLayer.cannonjs);

  // 2. Calculate New Position
  const newX = direction == "x" ? topLayer.threejs.position.x - (delta / 2) : topLayer.threejs.position.x;
  const newZ = direction == "z" ? topLayer.threejs.position.z - (delta / 2) : topLayer.threejs.position.z;
  const newY = topLayer.threejs.position.y;

  // 3. Create BRAND NEW Block with Exact Dimensions
  // This prevents scaling artifacts and "Invisible Edge" bugs
  const newLayer = generateBox(newX, newY, newZ, newWidth, newDepth, false);
  newLayer.direction = direction;
  
  // 4. Replace the top stack item with the new, clean block
  stack.pop();
  stack.push(newLayer);

  // 5. Spawn Debris
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
    hue += 4;
    updateBackground();
    
    const nextX = direction == "x" ? topLayer.threejs.position.x : -30;
    const nextZ = direction == "z" ? topLayer.threejs.position.z : -30;
    const newWidth = topLayer.width; // Using the UPDATED geometry width
    const newDepth = topLayer.depth; // Using the UPDATED geometry depth
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
  const d = ZOOM;
  camera.left = -d * aspect;
  camera.right = d * aspect;
  camera.top = d;
  camera.bottom = -d;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});