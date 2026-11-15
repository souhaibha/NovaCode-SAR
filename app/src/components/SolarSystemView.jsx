import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Procedural texture generators for planets & sun
function createSunTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(256, 128, 10, 256, 128, 256);
  grad.addColorStop(0, "#fff5d0");
  grad.addColorStop(0.3, "#ffcc33");
  grad.addColorStop(0.7, "#ff7700");
  grad.addColorStop(1, "#dd3300");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Solar flare granules
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 256;
    const r = Math.random() * 12 + 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${Math.floor(200 + Math.random() * 55)}, 50, ${Math.random() * 0.25})`;
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function createPlanetTexture(type) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (type === "mercury") {
    ctx.fillStyle = "#8c8880";
    ctx.fillRect(0, 0, 512, 256);
    // Crater noise
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const r = Math.random() * 6 + 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(50,50,50,0.3)" : "rgba(200,200,200,0.2)";
      ctx.fill();
    }
  } else if (type === "venus") {
    // Dense golden cloudy bands
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#d8b26e");
    grad.addColorStop(0.3, "#ebd39e");
    grad.addColorStop(0.5, "#d8aa5a");
    grad.addColorStop(0.7, "#f0dab0");
    grad.addColorStop(1, "#cfa050");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(255, 240, 200, ${Math.random() * 0.15})`;
      ctx.fillRect(0, Math.random() * 256, 512, Math.random() * 16 + 4);
    }
  } else if (type === "moon") {
    ctx.fillStyle = "#9ba0a6";
    ctx.fillRect(0, 0, 512, 256);
    // Lunar maria (dark patches)
    ctx.fillStyle = "rgba(60, 64, 67, 0.45)";
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 40 + 10, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === "mars") {
    // Rust red with dark basalt markings and polar caps
    ctx.fillStyle = "#c1440e";
    ctx.fillRect(0, 0, 512, 256);
    // Dark terrain markings
    ctx.fillStyle = "rgba(70, 30, 15, 0.4)";
    for (let i = 0; i < 25; i++) {
      ctx.beginPath();
      ctx.ellipse(Math.random() * 512, 100 + Math.random() * 100, Math.random() * 50 + 20, Math.random() * 20 + 8, Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
    // Polar ice caps
    ctx.fillStyle = "rgba(240, 248, 255, 0.85)";
    ctx.fillRect(0, 0, 512, 18);
    ctx.fillRect(0, 238, 512, 18);
  } else if (type === "jupiter") {
    // Multi-banded gas giant
    const colors = ["#d8ca9d", "#b58b5b", "#efd7b4", "#8d5c34", "#c99d66", "#f3e2cd", "#9c673d"];
    for (let y = 0; y < 256; y += 8) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillStyle = c;
      ctx.fillRect(0, y, 512, 8);
    }
    // Great Red Spot
    ctx.beginPath();
    ctx.ellipse(320, 150, 28, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#cc3718";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#8b200b";
    ctx.stroke();
  } else if (type === "saturn") {
    // Soft pastel ochre bands
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#dfcaa0");
    grad.addColorStop(0.2, "#eedcb3");
    grad.addColorStop(0.4, "#cfb584");
    grad.addColorStop(0.6, "#f3e4c4");
    grad.addColorStop(0.8, "#d9c190");
    grad.addColorStop(1, "#c7ae7c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
  } else if (type === "uranus") {
    // Pale aquamarine ice giant
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#76c2d6");
    grad.addColorStop(0.5, "#93e0e8");
    grad.addColorStop(1, "#6dbccf");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
  } else if (type === "neptune") {
    // Deep azure blue with subtle white storms
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#274687");
    grad.addColorStop(0.3, "#3d64b5");
    grad.addColorStop(0.7, "#1e3770");
    grad.addColorStop(1, "#182c58");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    // White cirrus bands
    ctx.fillStyle = "rgba(220, 240, 255, 0.25)";
    ctx.fillRect(0, 100, 512, 6);
    ctx.fillRect(0, 160, 512, 4);
  }

  return new THREE.CanvasTexture(canvas);
}

// Saturn Rings Texture with transparency & Cassini Division
function createSaturnRingsTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0.0, "rgba(0,0,0,0)");
  grad.addColorStop(0.1, "rgba(180,165,135,0.2)");
  grad.addColorStop(0.25, "rgba(215,195,160,0.85)");
  grad.addColorStop(0.55, "rgba(195,175,140,0.9)");
  // Cassini Division (gap)
  grad.addColorStop(0.58, "rgba(20,18,15,0.05)");
  grad.addColorStop(0.62, "rgba(20,18,15,0.05)");
  grad.addColorStop(0.65, "rgba(175,155,120,0.75)");
  grad.addColorStop(0.92, "rgba(150,130,100,0.6)");
  grad.addColorStop(1.0, "rgba(0,0,0,0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 1);
  return new THREE.CanvasTexture(canvas);
}

// Planetary catalog data
const PLANET_DATA = [
  {
    id: "mercury",
    name: "Mercure",
    englishName: "Mercury",
    color: "#a8a59b",
    radius: 1.2,
    orbitRadius: 36,
    speed: 0.04,
    rotationSpeed: 0.004,
    tilt: 0.03,
    type: "Planète tellurique",
    diameter: "4 879 km",
    distanceSun: "57.9 millions km (0.39 UA)",
    orbitalPeriod: "88 jours terrestres",
    temp: "-180°C à +430°C",
    description: "La planète la plus proche du Soleil et la plus petite du Système Solaire. Sa surface criblée d'impacts ressemble à celle de la Lune.",
  },
  {
    id: "venus",
    name: "Vénus",
    englishName: "Venus",
    color: "#e3bb76",
    radius: 2.1,
    orbitRadius: 54,
    speed: 0.025,
    rotationSpeed: -0.002,
    tilt: 3.1,
    type: "Planète tellurique",
    diameter: "12 104 km",
    distanceSun: "108.2 millions km (0.72 UA)",
    orbitalPeriod: "225 jours terrestres",
    temp: "+465°C (effet de serre intense)",
    description: "Souvent appelée la jumelle de la Terre par sa taille, son atmosphère dense en CO₂ crée un effet de serre extrême capable de fondre le plomb.",
  },
  {
    id: "earth",
    name: "Terre",
    englishName: "Earth",
    color: "#3a86ff",
    radius: 2.4,
    orbitRadius: 78,
    speed: 0.018,
    rotationSpeed: 0.01,
    tilt: 0.41,
    type: "Planète tellurique océanique",
    diameter: "12 742 km",
    distanceSun: "149.6 millions km (1.00 UA)",
    orbitalPeriod: "365.25 jours",
    temp: "-89°C à +58°C (moyenne 15°C)",
    hasMoon: true,
    description: "Le berceau de la vie et notre cible d'observation SAR. 71% de sa surface est recouverte d'eau liquide, protégée par une magnétosphère active.",
  },
  {
    id: "mars",
    name: "Mars",
    englishName: "Mars",
    color: "#c1440e",
    radius: 1.6,
    orbitRadius: 106,
    speed: 0.014,
    rotationSpeed: 0.009,
    tilt: 0.44,
    type: "Planète tellurique désertique",
    diameter: "6 779 km",
    distanceSun: "227.9 millions km (1.52 UA)",
    orbitalPeriod: "687 jours terrestres",
    temp: "-140°C à +20°C (moyenne -63°C)",
    description: "La planète rouge, riche en oxyde de fer. Elle abrite Olympus Mons, le plus haut volcan du Système Solaire (22 km de hauteur).",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    englishName: "Jupiter",
    color: "#d8ca9d",
    radius: 5.6,
    orbitRadius: 156,
    speed: 0.008,
    rotationSpeed: 0.024,
    tilt: 0.05,
    type: "Géante gazeuse",
    diameter: "139 820 km",
    distanceSun: "778.5 millions km (5.20 UA)",
    orbitalPeriod: "11.86 années terrestres",
    temp: "-110°C au sommet des nuages",
    description: "La plus imposante planète du Système Solaire, contenant plus de deux fois la masse de toutes les autres planètes réunies, avec sa célèbre Grande Tache Rouge.",
  },
  {
    id: "saturn",
    name: "Saturne",
    englishName: "Saturn",
    color: "#ead6b8",
    radius: 4.8,
    orbitRadius: 215,
    speed: 0.006,
    rotationSpeed: 0.022,
    tilt: 0.47,
    hasRings: true,
    type: "Géante gazeuse à anneaux",
    diameter: "116 460 km",
    distanceSun: "1.43 milliard km (9.58 UA)",
    orbitalPeriod: "29.45 années terrestres",
    temp: "-140°C",
    description: "Célèbre pour son majestueux système d'anneaux composé de milliards de fragments de glace d'eau et de roches s'étendant sur plus de 280 000 km.",
  },
  {
    id: "uranus",
    name: "Uranus",
    englishName: "Uranus",
    color: "#6dbccf",
    radius: 3.2,
    orbitRadius: 275,
    speed: 0.004,
    rotationSpeed: -0.014,
    tilt: 1.71,
    type: "Géante de glace",
    diameter: "50 724 km",
    distanceSun: "2.87 milliards km (19.2 UA)",
    orbitalPeriod: "84 années terrestres",
    temp: "-195°C",
    description: "Une géante de glaces à l'axe de rotation incliné à 98°, orbitant littéralement 'couchée sur le côté'.",
  },
  {
    id: "neptune",
    name: "Neptune",
    englishName: "Neptune",
    color: "#274687",
    radius: 3.1,
    orbitRadius: 335,
    speed: 0.003,
    rotationSpeed: 0.015,
    tilt: 0.49,
    type: "Géante de glace",
    diameter: "49 244 km",
    distanceSun: "4.50 milliards km (30.1 UA)",
    orbitalPeriod: "164.8 années terrestres",
    temp: "-200°C",
    description: "La planète la plus éloignée du Système Solaire, balayée par des vents supersoniques atteignant plus de 2 100 km/h dans une atmosphère d'azur profond.",
  },
];

export default function SolarSystemView({ onSwitchToEarth }) {
  const mountRef = useRef(null);
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [isPaused, setIsPaused] = useState(false);

  // References for animation loop
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const planetMeshesRef = useRef({});
  const orbitPivotsRef = useRef({});
  const animationFrameRef = useRef(null);
  const targetCamPosRef = useRef(null);
  const targetLookAtRef = useRef(null);

  // Texture loader with caching
  const textures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const earthTex = loader.load(`${import.meta.env.BASE_URL}textures/earth-blue-marble.jpg`);
    return {
      sun: createSunTexture(),
      mercury: createPlanetTexture("mercury"),
      venus: createPlanetTexture("venus"),
      earth: earthTex,
      moon: createPlanetTexture("moon"),
      mars: createPlanetTexture("mars"),
      jupiter: createPlanetTexture("jupiter"),
      saturn: createPlanetTexture("saturn"),
      saturnRings: createSaturnRingsTexture(),
      uranus: createPlanetTexture("uranus"),
      neptune: createPlanetTexture("neptune"),
    };
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 3000);
    camera.position.set(0, 160, 320);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 900;
    controls.minDistance = 15;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Deep Space Starfield (1500 stars)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1800;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const radius = 900 + Math.random() * 800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);

      const tint = Math.random();
      if (tint > 0.8) {
        // Warm gold
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.85;
        starColors[i * 3 + 2] = 0.6;
      } else if (tint > 0.6) {
        // Blue white
        starColors[i * 3] = 0.7;
        starColors[i * 3 + 1] = 0.9;
        starColors[i * 3 + 2] = 1.0;
      } else {
        // Pure white
        starColors[i * 3] = 0.95;
        starColors[i * 3 + 1] = 0.95;
        starColors[i * 3 + 2] = 0.95;
      }
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // 6. Ambient Light (soft cosmic fill)
    const ambientLight = new THREE.AmbientLight(0x1a2336, 0.45);
    scene.add(ambientLight);

    // 7. Sun
    const sunGeometry = new THREE.SphereGeometry(14, 48, 48);
    const sunMaterial = new THREE.MeshBasicMaterial({
      map: textures.sun,
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.name = "sun";
    scene.add(sun);

    // Sun Corona Glow (Soft outer atmospheric sprite shell)
    const coronaGeo = new THREE.SphereGeometry(16.5, 32, 32);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    sun.add(corona);

    // Central PointLight radiating outward from Sun
    const sunLight = new THREE.PointLight(0xfff5e6, 3.2, 1200, 0.45);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // 8. Planets & Orbits
    const planetMeshes = {};
    const orbitPivots = {};

    PLANET_DATA.forEach((p) => {
      // Orbit group that rotates around Sun
      const pivot = new THREE.Group();
      scene.add(pivot);
      orbitPivots[p.id] = pivot;

      // Draw Orbit Track
      const orbitCurve = new THREE.EllipseCurve(
        0, 0,
        p.orbitRadius, p.orbitRadius,
        0, 2 * Math.PI,
        false, 0
      );
      const orbitPoints = orbitCurve.getPoints(128);
      const orbitGeo = new THREE.BufferGeometry().setFromPoints(
        orbitPoints.map((pt) => new THREE.Vector3(pt.x, 0, pt.y))
      );
      const orbitMat = new THREE.LineBasicMaterial({
        color: 0x3cddc7,
        transparent: true,
        opacity: 0.18,
      });
      const orbitLine = new THREE.LineLoop(orbitGeo, orbitMat);
      scene.add(orbitLine);

      // Planet Mesh
      const geo = new THREE.SphereGeometry(p.radius, 36, 36);
      const mat = new THREE.MeshStandardMaterial({
        map: textures[p.id] || textures.mercury,
        roughness: 0.7,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.orbitRadius, 0, 0);
      mesh.rotation.z = p.tilt;
      mesh.userData = p;
      pivot.add(mesh);
      planetMeshes[p.id] = mesh;

      // Add Moon if Earth
      if (p.hasMoon) {
        const moonOrbitPivot = new THREE.Group();
        mesh.add(moonOrbitPivot);

        const moonGeo = new THREE.SphereGeometry(0.55, 24, 24);
        const moonMat = new THREE.MeshStandardMaterial({
          map: textures.moon,
          roughness: 0.9,
        });
        const moonMesh = new THREE.Mesh(moonGeo, moonMat);
        moonMesh.position.set(5.2, 0, 0);
        moonOrbitPivot.add(moonMesh);
        pivot.userData.moonPivot = moonOrbitPivot;
      }

      // Add Saturn Rings
      if (p.hasRings) {
        const ringGeo = new THREE.RingGeometry(p.radius * 1.35, p.radius * 2.45, 64);
        // Correct UV mapping for radial ring gradient
        const pos = ringGeo.attributes.position;
        const uvs = [];
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, i);
          const dist = v.length();
          const u = (dist - p.radius * 1.35) / (p.radius * 2.45 - p.radius * 1.35);
          uvs.push(u, 0);
        }
        ringGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));

        const ringMat = new THREE.MeshStandardMaterial({
          map: textures.saturnRings,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          roughness: 0.5,
        });
        const rings = new THREE.Mesh(ringGeo, ringMat);
        rings.rotation.x = Math.PI / 2;
        rings.rotation.y = 0.45;
        mesh.add(rings);
      }
    });

    // 9. Asteroid Belt (Between Mars & Jupiter, r = 126..142)
    const asteroidGeo = new THREE.BufferGeometry();
    const asteroidCount = 450;
    const asteroidPositions = new Float32Array(asteroidCount * 3);
    for (let i = 0; i < asteroidCount; i++) {
      const r = 126 + Math.random() * 16;
      const angle = Math.random() * Math.PI * 2;
      const yOffset = (Math.random() - 0.5) * 4;
      asteroidPositions[i * 3] = r * Math.cos(angle);
      asteroidPositions[i * 3 + 1] = yOffset;
      asteroidPositions[i * 3 + 2] = r * Math.sin(angle);
    }
    asteroidGeo.setAttribute("position", new THREE.BufferAttribute(asteroidPositions, 3));
    const asteroidMat = new THREE.PointsMaterial({
      color: 0x9e9885,
      size: 1.1,
      transparent: true,
      opacity: 0.65,
    });
    const asteroidBelt = new THREE.Points(asteroidGeo, asteroidMat);
    scene.add(asteroidBelt);

    planetMeshesRef.current = planetMeshes;
    orbitPivotsRef.current = orbitPivots;

    // Raycasting for planet clicks
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshesList = Object.values(planetMeshes);
      const intersects = raycaster.intersectObjects(meshesList);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit.userData?.id) {
          focusOnPlanet(hit.userData);
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let lastTime = performance.now();
    const animate = (time) => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Rotate Sun
      sun.rotation.y += 0.002;

      // Animate orbits and rotations
      if (!isPaused) {
        PLANET_DATA.forEach((p) => {
          const pivot = orbitPivots[p.id];
          const mesh = planetMeshes[p.id];
          if (pivot) {
            pivot.rotation.y += p.speed * speedMultiplier * delta * 8;
            if (pivot.userData?.moonPivot) {
              pivot.userData.moonPivot.rotation.y += 0.04 * speedMultiplier;
            }
          }
          if (mesh) {
            mesh.rotation.y += p.rotationSpeed * speedMultiplier * delta * 12;
          }
        });
      }

      // Smooth camera interpolation toward target
      if (targetCamPosRef.current && targetLookAtRef.current) {
        camera.position.lerp(targetCamPosRef.current, 0.045);
        controls.target.lerp(targetLookAtRef.current, 0.045);
        if (camera.position.distanceTo(targetCamPosRef.current) < 0.5) {
          targetCamPosRef.current = null;
          targetLookAtRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate(performance.now());

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [textures, speedMultiplier, isPaused]);

  // Focus camera on a planet
  const focusOnPlanet = useCallback((planet) => {
    setSelectedPlanet(planet);
    const mesh = planetMeshesRef.current[planet.id];
    if (!mesh || !cameraRef.current) return;

    // Get current world position of the planet
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    const offsetDist = Math.max(planet.radius * 4.5, 12);
    targetCamPosRef.current = new THREE.Vector3(
      worldPos.x + offsetDist * 0.7,
      worldPos.y + offsetDist * 0.45,
      worldPos.z + offsetDist * 0.7
    );
    targetLookAtRef.current = worldPos.clone();
  }, []);

  // Reset to wide global cosmic view
  const resetCamera = useCallback(() => {
    setSelectedPlanet(null);
    targetCamPosRef.current = new THREE.Vector3(0, 160, 320);
    targetLookAtRef.current = new THREE.Vector3(0, 0, 0);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#010409]">
      {/* Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Planet Quick-Select Ribbon at the top */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#090f1d]/85 backdrop-blur-md border border-[rgba(60,74,70,0.5)] shadow-2xl max-w-[95vw] overflow-x-auto">
        <button
          type="button"
          onClick={resetCamera}
          className={`px-3 py-1 rounded-xl text-xs font-mono transition-colors flex items-center gap-1 ${
            !selectedPlanet ? "bg-[#1c293d] text-[#57f1db] font-semibold" : "text-[#8e9eb0] hover:text-[#dce2f6]"
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">public</span>
          <span>Vue globale</span>
        </button>

        {PLANET_DATA.map((p) => {
          const isActive = selectedPlanet?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => focusOnPlanet(p)}
              className={`px-2.5 py-1 rounded-xl text-xs font-mono transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? "bg-[#1c293d] text-[#57f1db] font-semibold border border-[rgba(87,241,219,0.3)] shadow-sm"
                  : "text-[#8e9eb0] hover:text-[#dce2f6] hover:bg-[#151f30]/50"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: p.color }}
              />
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Simulation Controls at Bottom-Left */}
      <div className="absolute bottom-4 left-6 z-20 flex items-center gap-2 p-1.5 rounded-xl bg-[#090f1d]/85 backdrop-blur-md border border-[rgba(60,74,70,0.5)] shadow-xl text-xs font-mono text-[#bacac5]">
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          className="p-1.5 rounded-lg hover:bg-[#1b2538] hover:text-[#57f1db] transition-colors"
          title={isPaused ? "Reprendre l'orbite" : "Mettre en pause"}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isPaused ? "play_arrow" : "pause"}
          </span>
        </button>

        <div className="h-4 w-[1px] bg-[rgba(60,74,70,0.5)]" />

        <span className="text-[10px] text-[#78889b] uppercase tracking-wider">Vitesse:</span>
        {[1, 3, 10].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeedMultiplier(s)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors ${
              speedMultiplier === s
                ? "bg-[#1c293d] text-[#57f1db] font-bold"
                : "text-[#8e9eb0] hover:text-[#dce2f6]"
            }`}
          >
            {s}x
          </button>
        ))}

        <div className="h-4 w-[1px] bg-[rgba(60,74,70,0.5)]" />

        <button
          type="button"
          onClick={resetCamera}
          className="px-2 py-1 rounded-lg hover:bg-[#1b2538] hover:text-[#57f1db] transition-colors flex items-center gap-1 text-[11px]"
        >
          <span className="material-symbols-outlined text-[14px]">center_focus_strong</span>
          <span>Recentrer</span>
        </button>
      </div>

      {/* Navigation Hint at Bottom */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none hidden md:flex items-center gap-2 text-[11px] font-mono text-[#78889b] bg-[#090f1d]/75 backdrop-blur-md px-3 py-1 rounded-lg border border-[rgba(60,74,70,0.3)]">
        <span className="material-symbols-outlined text-[13px] text-[#57f1db]">touch_app</span>
        <span>Clic sur une planète pour zoomer • Glisser pour tourner • Molette pour zoom</span>
      </div>

      {/* Planet Inspector Card on the Right when a planet is selected */}
      {selectedPlanet && (
        <aside className="absolute top-24 right-6 z-30 w-80 max-w-[calc(100vw-32px)] p-4 rounded-2xl bg-[#0a1122]/95 backdrop-blur-xl border border-[rgba(87,241,219,0.3)] shadow-2xl text-[#dce2f6] animate-fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(60,74,70,0.4)]">
            <div className="flex items-center gap-2.5">
              <span
                className="w-4 h-4 rounded-full ring-2 ring-white/20 shadow-md"
                style={{ backgroundColor: selectedPlanet.color }}
              />
              <div>
                <h3 className="font-bold text-base font-sans leading-tight">
                  {selectedPlanet.name}
                </h3>
                <span className="text-[11px] font-mono text-[#57f1db]">
                  {selectedPlanet.type}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlanet(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#8e9eb0] hover:text-white hover:bg-[#1e2a3f] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[#bacac5]">
            {selectedPlanet.description}
          </p>

          <div className="mt-4 space-y-2 text-xs font-mono bg-[#050a14]/60 p-3 rounded-xl border border-[rgba(60,74,70,0.3)]">
            <div className="flex justify-between">
              <span className="text-[#78889b]">Diamètre :</span>
              <span className="text-white font-semibold">{selectedPlanet.diameter}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78889b]">Distance Soleil :</span>
              <span className="text-white font-semibold">{selectedPlanet.distanceSun}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78889b]">Révolution :</span>
              <span className="text-white font-semibold">{selectedPlanet.orbitalPeriod}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#78889b]">Température :</span>
              <span className="text-white font-semibold">{selectedPlanet.temp}</span>
            </div>
          </div>

          {selectedPlanet.id === "earth" && onSwitchToEarth && (
            <button
              type="button"
              onClick={onSwitchToEarth}
              className="mt-4 w-full py-2.5 px-3 rounded-xl bg-[#57f1db] text-[#003731] font-bold text-xs font-mono flex items-center justify-center gap-2 hover:bg-[#62fae3] shadow-lg shadow-[#57f1db]/20 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">travel_explore</span>
              <span>Inspecter la Terre (Données SAR)</span>
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
