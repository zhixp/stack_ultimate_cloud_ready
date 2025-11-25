// public/game/script.js

window.startGame = startGame;
window.focus();

// --- CONFIGURATION ---
const BOX_HEIGHT = 1.5;       // Chunky Slabs
const ORIGINAL_SIZE = 6.5;    // 30% Larger Blocks
const CAMERA_WIDTH = 40;      // 15% Zoom Out (Wide Angle)
const TRAVEL_DISTANCE = 25;   // Full Screen Sweep (Wanderer Mode)

// SPEED CONFIG (Gradual Ramp)
const SPEED_BASE = 0.0005;      // Ultra Slow Start
const SPEED_INCREMENT = 0.0002; // +0.0002 Speed
const SPEED_INTERVAL = 4;       // Every 4 Blocks

// --- SENTINEL BIOMETRICS ---
let clickOffsets = [];
let startTime = 0;

// --- STATE ---
let scene, camera, renderer, world;
let stack = [];
let overhangs = [];
let particles = [];
let gameEnded = false;
let hue = 230; // Deep Purple Start
let combo = 0;

const scoreEl = document.getElementById("score");
const instructionsEl = document.getElementById("instructions");

init();

function init() {
    // 1. Physics
    world = new CANNON.World();
    world.gravity.set(0, -30, 0); // Heavy gravity
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 40;

    // 2. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd8b5cf); // Premium Mauve

    // 3. Camera (Sentinel Wide Setup)
    const aspect = window.innerWidth / window.innerHeight;
    const height = CAMERA_WIDTH / aspect;
    
    camera = new THREE.OrthographicCamera(
        CAMERA_WIDTH / -2, CAMERA_WIDTH / 2, 
        height / 2, height / -2, 
        0, 100
    );
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    // 4. Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // 5. Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    
    // FIX: INVISIBLE EDGE (Massive Shadow Box)
    const d = 150; 
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    resetGame();
    animate();
}

function resetGame() {
    // Cleanup
    stack.forEach(i => { scene.remove(i.mesh); world.remove(i.body); });
    overhangs.forEach(i => { scene.remove(i.mesh); world.remove(i.body); });
    particles.forEach(p => scene.remove(p.mesh));
    
    stack = [];
    overhangs = [];
    particles = [];
    
    gameEnded = false;
    hue = 230;
    combo = 0;
    
    if(scoreEl) scoreEl.innerText = "0";
    if(instructionsEl) instructionsEl.style.display = "none";
    
    // Sentinel Reset
    clickOffsets = [];
    startTime = Date.now();

    // Base Blocks
    addLayer(0, 0, ORIGINAL_SIZE, ORIGINAL_SIZE);
    addLayer(-20, 0, ORIGINAL_SIZE, ORIGINAL_SIZE, "x"); // Start far off-screen

    camera.position.y = 4;
    camera.lookAt(0, 0, 0);
}

function startGame() {
    if(gameEnded) resetGame();
}

function addLayer(x, z, width, depth, direction) {
    const y = stack.length * BOX_HEIGHT;
    const color = new THREE.Color(`hsl(${hue}, 60%, 65%)`);
    
    const geometry = new THREE.BoxGeometry(width, BOX_HEIGHT, depth);
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Static Body for Stack
    const shape = new CANNON.Box(new CANNON.Vec3(width/2, BOX_HEIGHT/2, depth/2));
    const body = new CANNON.Body({ mass: 0, shape });
    body.position.set(x, y, z);
    world.addBody(body);

    stack.push({ mesh, body, width, depth, direction });
}

function addOverhang(x, z, width, depth, color) {
    const y = (stack.length - 1) * BOX_HEIGHT;
    const geometry = new THREE.BoxGeometry(width, BOX_HEIGHT, depth);
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Dynamic Body for Debris
    const shape = new CANNON.Box(new CANNON.Vec3(width/2, BOX_HEIGHT/2, depth/2));
    // Mass 5 = Heavy Drop (Dead Weight)
    const body = new CANNON.Body({ mass: 5, shape });
    body.position.set(x, y, z);
    
    // Low Spin (0.1)
    const rand = () => (Math.random() - 0.5) * 0.1;
    body.angularVelocity.set(rand(), rand(), rand()); 

    world.addBody(body);
    overhangs.push({ mesh, body });
}

function spawnParticles(x, y, z, color) {
    for (let i = 0; i < 10; i++) {
        const size = 0.1 + Math.random() * 0.2;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
        
        const velX = (Math.random() - 0.5) * 5;
        const velY = (Math.random() - 0.5) * 5;
        const velZ = (Math.random() - 0.5) * 5;

        scene.add(mesh);
        particles.push({ mesh, velX, velY, velZ, life: 1.0 });
    }
}

function cutBox() {
    const top = stack[stack.length - 1];
    const prev = stack[stack.length - 2];
    const dir = top.direction;

    const delta = top.mesh.position[dir] - prev.mesh.position[dir];
    const size = dir === "x" ? top.width : top.depth;
    const diff = Math.abs(delta);
    const overlap = size - diff;

    if (overlap > 0) {
        const newW = dir === "x" ? overlap : top.width;
        const newD = dir === "z" ? overlap : top.depth;
        
        // Update Top
        top.width = newW;
        top.depth = newD;
        top.mesh.scale[dir] = overlap / size;
        top.mesh.position[dir] -= delta / 2;
        top.body.position[dir] -= delta / 2;

        // Spawn Debris
        const shift = (overlap/2 + diff/2) * Math.sign(delta);
        const ox = dir === "x" ? top.mesh.position.x + shift : top.mesh.position.x;
        const oz = dir === "z" ? top.mesh.position.z + shift : top.mesh.position.z;
        const ow = dir === "x" ? diff : newW;
        const od = dir === "z" ? diff : newD;
        
        if(ow > 0.05 && od > 0.05) { 
            addOverhang(ox, oz, ow, od, top.mesh.material.color);
        }

        // Sentinel Biometrics
        clickOffsets.push(delta);

        // Particles (Visual Flair)
        if (diff < 0.5) {
            spawnParticles(top.mesh.position.x, top.mesh.position.y, top.mesh.position.z, top.mesh.material.color);
        }

        // Next Layer
        hue += 5;
        if(scoreEl) scoreEl.innerText = stack.length - 1;

        const nextDir = dir === "x" ? "z" : "x";
        
        // Spawn far off-screen based on Travel Distance
        const spawnDist = TRAVEL_DISTANCE * 1.1;
        const nx = nextDir === "x" ? -spawnDist : top.mesh.position.x;
        const nz = nextDir === "z" ? -spawnDist : top.mesh.position.z;

        addLayer(nx, nz, newW, newD, nextDir);
    } else {
        gameOver();
    }
}

function gameOver() {
    gameEnded = true;
    const top = stack[stack.length - 1];
    addOverhang(top.mesh.position.x, top.mesh.position.z, top.width, top.depth, top.mesh.material.color);
    scene.remove(top.mesh);
    world.remove(top.body);
    stack.pop();

    const score = stack.length - 1;
    const duration = Date.now() - startTime;
    
    // Show Instructions again
    if(instructionsEl) instructionsEl.style.display = "flex";

    // Send Data
    if(score > 0) {
        window.parent.postMessage({ 
            type: "GAME_OVER", 
            score: score,
            biometrics: { duration, clickOffsets }
        }, "*");
    }
}

function animate() {
    requestAnimationFrame(animate);

    if (!gameEnded && stack.length > 1) {
        const top = stack[stack.length - 1];
        
        // DYNAMIC SPEED LOGIC
        const level = stack.length;
        let currentSpeed = SPEED_BASE + (Math.floor(level / SPEED_INTERVAL) * SPEED_INCREMENT);
        
        // MOVEMENT LOGIC
        const time = Date.now();
        // Use specific time scale for smooth sin wave
        const pos = Math.sin(time * currentSpeed) * TRAVEL_DISTANCE;
        
        if (top.direction === "x") {
            top.mesh.position.x = pos;
            top.body.position.x = pos;
        } else {
            top.mesh.position.z = pos;
            top.body.position.z = pos;
        }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 0.03;
        p.mesh.position.x += p.velX * 0.05;
        p.mesh.position.y += p.velY * 0.05;
        p.mesh.position.z += p.velZ * 0.05;
        p.mesh.scale.setScalar(p.life);
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }

    // Camera Follow
    if(!gameEnded) {
        let targetY = stack.length * BOX_HEIGHT + 4;
        camera.position.y += (targetY - camera.position.y) * 0.05;
    }

    world.step(1/60);
    overhangs.forEach(o => {
        o.mesh.position.copy(o.body.position);
        o.mesh.quaternion.copy(o.body.quaternion);
    });

    renderer.render(scene, camera);
}

// --- CONTROLS ---
window.addEventListener("mousedown", (e) => {
    if(!gameEnded) cutBox();
});

window.addEventListener("keydown", (e) => {
    if(e.code === "Space") {
        e.preventDefault();
        if(!gameEnded) cutBox();
        else startGame();
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