
import { Injectable, NgZone } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

interface NodeConfig {
  id: string;
  label: string;
  description: string;
  position: THREE.Vector3;
  color: number;
  geometryType: 'box' | 'sphere' | 'octahedron' | 'torus' | 'cylinder' | 'icosahedron' | 'dodecahedron';
  scale: number;
}

interface Connection {
  from: string;
  to: string;
  color: number;
}

@Injectable({
  providedIn: 'root'
})
export class ArchitectureVizService {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private labelRenderer!: CSS2DRenderer;
  private controls!: OrbitControls;
  private animationId: number | null = null;
  private container!: HTMLElement;

  private nodes: Map<string, THREE.Mesh> = new Map();
  private pulses: { mesh: THREE.Mesh; path: THREE.CatmullRomCurve3; progress: number; speed: number }[] = [];
  
  private isAnimating = true;
  private onNodeHover?: (name: string | null, desc: string | null) => void;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private resizeObserver: ResizeObserver | null = null;

  constructor(private ngZone: NgZone) {}

  initialize(container: HTMLElement, hoverCallback: (name: string | null, desc: string | null) => void) {
    this.container = container;
    this.onNodeHover = hoverCallback;

    // 1. Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000510);
    this.scene.fog = new THREE.FogExp2(0x000510, 0.008);

    // 2. Setup Camera
    // Initial size might be 0, we update in resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 30, 90); // Zoomed out to fit expanded layout

    // 3. Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // 4. Setup Label Renderer
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through
    container.appendChild(this.labelRenderer.domElement);

    // 5. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 200;

    // 6. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(20, 20, 20);
    this.scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0x4444ff, 0.8);
    pointLight2.position.set(-20, -10, 10);
    this.scene.add(pointLight2);

    // 7. Create Architecture
    this.createArchitecture();

    // 8. Event Listeners
    // Use ResizeObserver for robust sizing
    this.resizeObserver = new ResizeObserver(() => {
        this.onWindowResize();
    });
    this.resizeObserver.observe(container);

    // We attach mouse move to the renderer canvas for raycasting
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));

    // 9. Start Loop
    this.ngZone.runOutsideAngular(() => this.animate());
    
    // Force initial resize check after a microtask, just in case DOM wasn't ready
    setTimeout(() => this.onWindowResize(), 0);
  }

  private createArchitecture() {
    // Define Nodes
    const nodesConfig: NodeConfig[] = [
      // PROXY: Moved "in front" of Gateway (Left side)
      { 
        id: 'proxy', 
        label: 'Gateway Proxies', 
        description: 'Decouples the API Gateway from external traffic and handles load balancing.',
        position: new THREE.Vector3(-25, 0, 0), 
        color: 0x10b981, // Emerald
        geometryType: 'torus', 
        scale: 2.5
      },
      // API GATEWAY: Center
      { 
        id: 'gateway', 
        label: 'API Gateway', 
        description: 'Single entry point. Routes requests to the Service Broker.',
        position: new THREE.Vector3(0, 0, 0), 
        color: 0xd946ef, // Fuchsia
        geometryType: 'octahedron', 
        scale: 3 
      },
      // SUPPORT: Registry & Limiter attached to Gateway
      { 
        id: 'registry', 
        label: 'Service Registry', 
        description: 'Database of available service instances and their locations.',
        position: new THREE.Vector3(0, 12, -5), 
        color: 0xeab308, // Yellow
        geometryType: 'cylinder', 
        scale: 2 
      },
      { 
        id: 'limiter', 
        label: 'Rate Limiter', 
        description: 'Controls the rate of traffic sent or received by the network.',
        position: new THREE.Vector3(0, -12, -5), 
        color: 0xf43f5e, // Rose
        geometryType: 'box', 
        scale: 2 
      },
      // SERVICE BROKER: Right of Gateway
      { 
        id: 'broker', 
        label: 'Service Broker', 
        description: 'Central message bus/middleware. Manages service discovery, routing, and decoupling.',
        position: new THREE.Vector3(25, 0, 0), 
        color: 0xf97316, // Orange
        geometryType: 'dodecahedron', 
        scale: 2.5 
      },
      // TRANSFORMER: Upper Right Branch
      { 
        id: 'transformer', 
        label: 'REST Transformer', 
        description: 'Adapts and transforms messages between different formats.',
        position: new THREE.Vector3(45, 12, 0), 
        color: 0x3b82f6, // Blue
        geometryType: 'icosahedron', 
        scale: 2 
      },
      // BROKER RELIANT SERVICES: Lower Right Branch (Cluster)
      { 
        id: 'brokerService1', 
        label: 'Auth Service', 
        description: 'Broker-reliant service for authentication.',
        position: new THREE.Vector3(45, -10, 0), 
        color: 0x14b8a6, // Teal
        geometryType: 'sphere', 
        scale: 2 
      },
      { 
        id: 'brokerService2', 
        label: 'Audit Log', 
        description: 'Broker-reliant service for logging events.',
        position: new THREE.Vector3(55, -15, 5), 
        color: 0x14b8a6, // Teal
        geometryType: 'sphere', 
        scale: 1.8 
      },
      { 
        id: 'brokerService3', 
        label: 'Notification Svc', 
        description: 'Broker-reliant service for dispatching alerts.',
        position: new THREE.Vector3(40, -18, -5), 
        color: 0x14b8a6, // Teal
        geometryType: 'sphere', 
        scale: 1.8 
      },
      // REST SERVICES: Far Right
      { 
        id: 'serviceA', 
        label: 'REST Service A', 
        description: 'Core business logic microservice.',
        position: new THREE.Vector3(65, 15, 5), 
        color: 0x8b5cf6, // Violet
        geometryType: 'box', 
        scale: 1.5 
      },
      { 
        id: 'serviceB', 
        label: 'REST Service B', 
        description: 'Data processing microservice.',
        position: new THREE.Vector3(65, 8, 5), 
        color: 0x8b5cf6, // Violet
        geometryType: 'box', 
        scale: 1.5 
      }
    ];

    // Create Clients (Cluster) - Further Left
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const radius = 8;
      nodesConfig.push({
        id: `client_${i}`,
        label: i === 2 ? 'Clients' : '', // Only label one
        description: 'External applications consuming the API.',
        position: new THREE.Vector3(-50, Math.cos(angle) * radius, Math.sin(angle) * radius),
        color: 0x06b6d4, // Cyan
        geometryType: 'sphere',
        scale: 1
      });
    }

    // Build Nodes
    nodesConfig.forEach(config => this.createNode(config));

    // Define Connections
    const connections: Connection[] = [
      // Gateway Support
      { from: 'gateway', to: 'registry', color: 0xeab308 },
      { from: 'gateway', to: 'limiter', color: 0xf43f5e },
      
      // Main Pipeline: Proxy -> Gateway -> Broker
      { from: 'proxy', to: 'gateway', color: 0x10b981 }, // Emerald
      { from: 'gateway', to: 'broker', color: 0xd946ef }, // Fuchsia

      // Broker Distribution
      { from: 'broker', to: 'transformer', color: 0xf97316 }, // Orange Out
      { from: 'broker', to: 'brokerService1', color: 0xf97316 }, // Orange Out
      { from: 'broker', to: 'brokerService2', color: 0xf97316 }, // Orange Out
      { from: 'broker', to: 'brokerService3', color: 0xf97316 }, // Orange Out
      
      // Transformer -> REST Services
      { from: 'transformer', to: 'serviceA', color: 0x3b82f6 },
      { from: 'transformer', to: 'serviceB', color: 0x3b82f6 },
    ];

    // Connect all clients to Proxy
    for (let i = 0; i < 5; i++) {
      connections.push({ from: `client_${i}`, to: 'proxy', color: 0x06b6d4 });
    }

    // Build Connections
    connections.forEach(conn => this.createConnection(conn));
  }

  private createNode(config: NodeConfig) {
    let geometry: THREE.BufferGeometry;
    switch (config.geometryType) {
      case 'box': geometry = new THREE.BoxGeometry(1, 1, 1); break;
      case 'sphere': geometry = new THREE.SphereGeometry(0.7, 32, 16); break;
      case 'octahedron': geometry = new THREE.OctahedronGeometry(1); break;
      case 'torus': geometry = new THREE.TorusGeometry(0.7, 0.2, 16, 100); break;
      case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
      case 'icosahedron': geometry = new THREE.IcosahedronGeometry(1); break;
      case 'dodecahedron': geometry = new THREE.DodecahedronGeometry(1); break;
      default: geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshPhongMaterial({
      color: config.color,
      emissive: config.color,
      emissiveIntensity: 0.2,
      shininess: 100,
      flatShading: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(config.position);
    mesh.scale.setScalar(config.scale);
    mesh.userData = { 
      id: config.id, 
      originalScale: config.scale,
      description: config.description,
      name: config.label
    };

    // Add glowing wireframe overlay
    const wireGeo = new THREE.WireframeGeometry(geometry);
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    mesh.add(wireframe);

    this.scene.add(mesh);
    this.nodes.set(config.id, mesh);

    // Add HTML Label
    if (config.label) {
      const div = document.createElement('div');
      div.className = 'label';
      div.textContent = config.label;
      const label = new CSS2DObject(div);
      label.position.set(0, 1.5, 0); // Offset above the object
      mesh.add(label);
    }
  }

  private createConnection(conn: Connection) {
    const startNode = this.nodes.get(conn.from);
    const endNode = this.nodes.get(conn.to);
    if (!startNode || !endNode) return;

    // Create visual line
    const start = startNode.position;
    const end = endNode.position;
    
    // Create curve for smoother look
    const distance = start.distanceTo(end);
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    // Add a slight arc upwards or sideways based on distance to make it look organic
    midPoint.y += distance * 0.1; 

    const curve = new THREE.CatmullRomCurve3([
      start,
      midPoint,
      end
    ]);

    const points = curve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: conn.color, 
      transparent: true, 
      opacity: 0.15 
    });
    
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    // Start pulses on this path
    // We add multiple pulses with random offsets
    const pulseCount = 2;
    for (let i = 0; i < pulseCount; i++) {
      this.createPulse(curve, conn.color, Math.random());
    }
  }

  private createPulse(path: THREE.CatmullRomCurve3, color: number, startProgress: number) {
    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, material);
    
    // Create a light trail for the pulse
    const light = new THREE.PointLight(color, 2, 8);
    mesh.add(light);

    this.scene.add(mesh);

    this.pulses.push({
      mesh,
      path,
      progress: startProgress,
      speed: 0.005 + Math.random() * 0.005 // Variable speed
    });
  }

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());

    if (this.controls) this.controls.update();

    const time = Date.now() * 0.001;

    // Animate Nodes (Float gently)
    this.nodes.forEach((mesh, id) => {
      // Different float phases based on position to avoid uniformity
      mesh.position.y += Math.sin(time + mesh.position.x) * 0.02;
      mesh.rotation.y += 0.005;
      
      // Interaction highlight pulse
      if (mesh.userData['hovered']) {
        const s = mesh.userData['originalScale'] * (1 + Math.sin(time * 10) * 0.1);
        mesh.scale.setScalar(s);
      } else {
        // Return to normal
        mesh.scale.lerp(new THREE.Vector3().setScalar(mesh.userData['originalScale']), 0.1);
      }
    });

    // Animate Pulses
    if (this.isAnimating) {
      this.pulses.forEach(pulse => {
        pulse.progress += pulse.speed;
        if (pulse.progress > 1) pulse.progress = 0;
        
        const point = pulse.path.getPoint(pulse.progress);
        pulse.mesh.position.copy(point);
      });
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private onMouseMove(event: MouseEvent) {
    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(Array.from(this.nodes.values()));

    // Reset all hovered states
    this.nodes.forEach(n => n.userData['hovered'] = false);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      object.userData['hovered'] = true;
      
      // Notify UI
      if (this.onNodeHover) {
        this.onNodeHover(object.userData['name'], object.userData['description']);
      }
      
      document.body.style.cursor = 'pointer';
    } else {
      if (this.onNodeHover) {
        this.onNodeHover(null, null);
      }
      document.body.style.cursor = 'default';
    }
  }

  private onWindowResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  resetCamera() {
    if (!this.camera || !this.controls) return;
    this.camera.position.set(0, 30, 90);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  toggleAnimation() {
    this.isAnimating = !this.isAnimating;
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.resizeObserver) {
        this.resizeObserver.disconnect();
    }
    // Cleanup if necessary
    if (this.renderer) {
        this.renderer.dispose();
    }
  }
}
