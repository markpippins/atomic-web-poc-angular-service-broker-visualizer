
import { Injectable, NgZone, Signal, signal, WritableSignal } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { Subject } from 'rxjs';
import { NodeType, getComponentConfig, COMPONENT_REGISTRY } from '../config/component-config';

export type { NodeType } from '../config/component-config';

export interface NodeData {
  id: string;
  type: NodeType;
  label: string;
  description: string;
  position: { x: number; y: number; z: number };
  color: string;
  connectedTo: string[]; // List of IDs this node sends data to
}

interface VisualNode {
  mesh: THREE.Mesh;
  data: NodeData;
  labelObj?: CSS2DObject;
  wireframe?: THREE.LineSegments;
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

  // State
  private nodes: Map<string, VisualNode> = new Map();
  // Key: "fromId::toId" (using :: as separator because UUIDs contain -)
  private connectionLines: Map<string, THREE.Line> = new Map(); 
  
  // Selection & Interaction
  private selectionBox!: THREE.BoxHelper;
  private selectedNodeId: string | null = null;
  private interactionMode: 'camera' | 'edit' = 'camera';
  
  // Dragging State
  private isDragging = false;
  private dragPlane = new THREE.Plane();
  private dragOffset = new THREE.Vector3();
  private draggedNodeId: string | null = null;
  
  // Signals & Events
  public selectedNodeData: WritableSignal<NodeData | null> = signal(null);
  public allNodes: WritableSignal<NodeData[]> = signal([]);
  public nodeDoubleClicked = new Subject<string>();
  public modeSignal: WritableSignal<'camera' | 'edit'> = signal('camera');

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private resizeObserver: ResizeObserver | null = null;

  constructor(private ngZone: NgZone) {}

  initialize(container: HTMLElement) {
    this.container = container;

    // 1. Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000510);
    this.scene.fog = new THREE.FogExp2(0x000510, 0.008);

    // 2. Setup Camera
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(-20, 40, 120);

    // 3. Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.domElement.style.outline = 'none';
    container.appendChild(this.renderer.domElement);

    // 4. Setup Label Renderer
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    // 5. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // 6. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(20, 20, 20);
    this.scene.add(pointLight);
    const pointLight2 = new THREE.PointLight(0x4444ff, 0.8);
    pointLight2.position.set(-20, -10, 10);
    this.scene.add(pointLight2);

    // 7. Helpers
    this.selectionBox = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)), 0xffff00);
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    // 8. Event Listeners
    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(container);
    
    // We attach pointer events to the Renderer DOM Element
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.renderer.domElement.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.renderer.domElement.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.renderer.domElement.addEventListener('dblclick', (e) => this.onDoubleClick(e));

    // 9. Start Loop
    this.loadDefaultScene();
    this.ngZone.runOutsideAngular(() => this.animate());
    setTimeout(() => this.onWindowResize(), 0);
  }

  // --- Core Operations ---

  public setInteractionMode(mode: 'camera' | 'edit') {
    this.interactionMode = mode;
    this.modeSignal.set(mode);
    
    // Enable/Disable Orbit Controls based on mode
    this.controls.enabled = (mode === 'camera');
    
    // Visual cursor feedback
    this.renderer.domElement.style.cursor = mode === 'camera' ? 'grab' : 'default';

    // Force update connections to ensure they are consistent with current positions
    this.updateAllConnections();
  }

  public clearScene() {
    this.nodes.forEach(node => {
      this.scene.remove(node.mesh);
      if (node.labelObj) node.mesh.remove(node.labelObj);
      node.mesh.geometry.dispose();
      (node.mesh.material as THREE.Material).dispose();
    });
    this.nodes.clear();
    this.connectionLines.forEach(line => {
      this.scene.remove(line);
      line.geometry.dispose();
    });
    this.connectionLines.clear();
    this.deselect();
    this.allNodes.set([]);
  }

  public addNode(
    type: NodeType, 
    pos: { x: number, y: number, z: number } = {x: 0, y: 0, z: 0},
    label?: string,
    description: string = 'Description...',
    colorOverride?: string
  ): string {
    const id = crypto.randomUUID();
    const config = getComponentConfig(type);
    
    const colorHex = colorOverride ? parseInt(colorOverride.replace('#', ''), 16) : config.defaultColor;

    // Auto-generate label based on Registry Default Prefix if not provided
    if (!label) {
      const count = Array.from(this.nodes.values()).filter(n => n.data.type === type).length;
      label = `${config.defaultNamePrefix} ${count + 1}`;
    }

    let geometry: THREE.BufferGeometry;
    switch (config.geometry) {
      case 'sphere': geometry = new THREE.SphereGeometry(0.7, 32, 16); break;
      case 'torus': geometry = new THREE.TorusGeometry(0.7, 0.2, 16, 100); break;
      case 'octahedron': geometry = new THREE.OctahedronGeometry(1); break;
      case 'cylinder': geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
      case 'icosahedron': geometry = new THREE.IcosahedronGeometry(1); break;
      case 'box': geometry = new THREE.BoxGeometry(1, 1, 1); break;
      case 'tall-cylinder': geometry = new THREE.CylinderGeometry(0.8, 0.8, 3, 32); break;
      default: geometry = new THREE.BoxGeometry(1, 1, 1);
    }
    const material = new THREE.MeshPhongMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 0.2, shininess: 100, flatShading: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.scale.setScalar(config.scale);
    mesh.userData = { id, type };

    const wireGeo = new THREE.WireframeGeometry(geometry);
    const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
    const wireframe = new THREE.LineSegments(wireGeo, wireMat);
    mesh.add(wireframe);

    let labelObj: CSS2DObject | undefined;
    if (label) {
      const div = document.createElement('div');
      div.className = 'label';
      div.textContent = label;
      labelObj = new CSS2DObject(div);
      labelObj.position.set(0, config.geometry === 'tall-cylinder' ? 2 : 1.5, 0);
      mesh.add(labelObj);
    }

    const nodeData: NodeData = {
      id, type, label, description, position: pos, 
      color: '#' + new THREE.Color(colorHex).getHexString(),
      connectedTo: [] 
    };

    this.scene.add(mesh);
    this.nodes.set(id, { mesh, data: nodeData, labelObj, wireframe });
    this.updateAllNodesSignal();

    return id;
  }

  public updateNode(id: string, updates: Partial<NodeData>) {
    const node = this.nodes.get(id);
    if (!node) return;

    node.data = { ...node.data, ...updates };

    if (updates.position) {
      node.mesh.position.set(updates.position.x, updates.position.y, updates.position.z);
      // Connections will be updated in the next frame of animate loop
    }

    if (updates.color) {
      const color = new THREE.Color(updates.color);
      (node.mesh.material as THREE.MeshPhongMaterial).color = color;
      (node.mesh.material as THREE.MeshPhongMaterial).emissive = color;
    }

    if (updates.label !== undefined && node.labelObj) {
      node.labelObj.element.textContent = updates.label;
    }

    if (this.selectedNodeId === id) {
      this.selectionBox.update();
      this.selectedNodeData.set(node.data);
    }
    this.updateAllNodesSignal();
  }

  public deleteNode(id: string) {
    const node = this.nodes.get(id);
    if (!node) return;
    
    node.data.connectedTo.forEach(targetId => this.removeVisualConnection(id, targetId));
    
    this.nodes.forEach(otherNode => {
      if (otherNode.data.connectedTo.includes(id)) {
        this.disconnectNodes(otherNode.data.id, id);
      }
    });

    this.scene.remove(node.mesh);
    this.nodes.delete(id);

    if (this.selectedNodeId === id) this.deselect();
    this.updateAllNodesSignal();
  }

  // --- Connection Management ---

  public connectNodes(fromId: string, toId: string) {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) return;
    
    // Check Config Rules
    const fromConfig = getComponentConfig(fromNode.data.type);
    const allowed = fromConfig.allowedConnections;
    
    if (allowed !== 'all' && !allowed.includes(toNode.data.type)) {
      console.warn(`Connection not allowed: ${fromNode.data.type} cannot connect to ${toNode.data.type}`);
      return; 
    }

    if (fromNode.data.connectedTo.includes(toId)) return;
    fromNode.data.connectedTo.push(toId);
    this.createVisualConnection(fromId, toId);
    if (this.selectedNodeId === fromId) this.selectedNodeData.set(fromNode.data);
  }

  public disconnectNodes(fromId: string, toId: string) {
    const fromNode = this.nodes.get(fromId);
    if (!fromNode) return;
    fromNode.data.connectedTo = fromNode.data.connectedTo.filter(id => id !== toId);
    this.removeVisualConnection(fromId, toId);
    if (this.selectedNodeId === fromId) this.selectedNodeData.set(fromNode.data);
  }

  private createVisualConnection(fromId: string, toId: string) {
    // We use :: separator to avoid conflict with UUID hyphens
    const key = `${fromId}::${toId}`;
    if (this.connectionLines.has(key)) return;
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) return;
    
    const points = [fromNode.mesh.position, toNode.mesh.position];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x4aa8d8, transparent: true, opacity: 0.4 });
    const line = new THREE.Line(geometry, material);
    
    // Store IDs in userData so we don't have to parse the string key later
    line.userData = { fromId, toId };
    
    this.scene.add(line);
    this.connectionLines.set(key, line);
  }

  private removeVisualConnection(fromId: string, toId: string) {
    const key = `${fromId}::${toId}`;
    const line = this.connectionLines.get(key);
    if (line) {
      this.scene.remove(line);
      line.geometry.dispose();
      this.connectionLines.delete(key);
    }
  }

  private updateAllConnections() {
    this.connectionLines.forEach((line) => {
      // Use userData to get IDs reliably
      const { fromId, toId } = line.userData;
      
      const fromNode = this.nodes.get(fromId);
      const toNode = this.nodes.get(toId);
      
      if (fromNode && toNode) {
        const positions = line.geometry.attributes['position'].array as Float32Array;
        
        // Update positions
        positions[0] = fromNode.mesh.position.x;
        positions[1] = fromNode.mesh.position.y;
        positions[2] = fromNode.mesh.position.z;
        positions[3] = toNode.mesh.position.x;
        positions[4] = toNode.mesh.position.y;
        positions[5] = toNode.mesh.position.z;
        
        line.geometry.attributes['position'].needsUpdate = true;
        
        // Important to update bounding sphere so lines don't get culled if they stretch far
        line.geometry.computeBoundingSphere();
      }
    });
  }

  // --- Input & Interaction Handling ---

  private onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return; // Only Left Click

    const intersects = this.raycast(event);
    
    if (intersects.length > 0) {
      // Hit a node
      const object = intersects[0].object;
      const id = object.userData['id'];
      
      // Select it
      this.selectNode(id);

      // If Edit Mode, Start Dragging
      if (this.interactionMode === 'edit') {
        this.isDragging = true;
        this.draggedNodeId = id;
        this.controls.enabled = false; // Ensure controls don't fight

        // Create a drag plane at the object's position, facing the camera
        const normal = new THREE.Vector3();
        this.camera.getWorldDirection(normal);
        normal.negate(); // Plane normal faces camera
        this.dragPlane.setFromNormalAndCoplanarPoint(normal, object.position);

        // Calculate offset
        const intersectionPoint = intersects[0].point;
        this.dragOffset.subVectors(object.position, intersectionPoint);

        this.renderer.domElement.style.cursor = 'grabbing';
      }
    } else {
      // Hit nothing
      this.deselect();
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (this.isDragging && this.draggedNodeId && this.interactionMode === 'edit') {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const targetPoint = new THREE.Vector3();
      
      // Raycast against the invisible drag plane
      if (this.raycaster.ray.intersectPlane(this.dragPlane, targetPoint)) {
        // Apply offset
        targetPoint.add(this.dragOffset);
        
        // Update Mesh Position
        const node = this.nodes.get(this.draggedNodeId);
        if (node) {
          node.mesh.position.copy(targetPoint);
          node.data.position = { x: targetPoint.x, y: targetPoint.y, z: targetPoint.z };
          
          this.selectionBox.update();
          // Connections are updated in the animate loop now
        }
      }
    }
  }

  private onPointerUp(event: PointerEvent) {
    if (this.isDragging && this.draggedNodeId) {
      // Finalize Drag
      const node = this.nodes.get(this.draggedNodeId);
      if (node) {
        this.selectedNodeData.set({ ...node.data }); // Trigger UI update
        this.updateAllNodesSignal();
      }
      
      this.isDragging = false;
      this.draggedNodeId = null;
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  private onDoubleClick(event: MouseEvent) {
    // Double click always selects and focuses
    const intersects = this.raycast(event);
    if (intersects.length > 0) {
      const id = intersects[0].object.userData['id'];
      this.selectNode(id);
      this.nodeDoubleClicked.next(id);
    }
  }

  private raycast(event: MouseEvent | PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Intersect the Meshes
    return this.raycaster.intersectObjects(
      Array.from(this.nodes.values()).map(n => n.mesh), 
      false // Not recursive, we only want the main mesh
    );
  }

  public selectNode(id: string) {
    const node = this.nodes.get(id);
    if (!node) return;
    
    // De-select previous if different
    if (this.selectedNodeId && this.selectedNodeId !== id) {
       // logic if needed
    }

    this.selectedNodeId = id;
    this.selectionBox.setFromObject(node.mesh);
    this.selectionBox.visible = true;
    
    // We create a new object ref to trigger signal
    this.selectedNodeData.set({ ...node.data });
  }

  public deselect() {
    this.selectedNodeId = null;
    this.selectionBox.visible = false;
    this.selectedNodeData.set(null);
  }

  private updateAllNodesSignal() {
    this.allNodes.set(Array.from(this.nodes.values()).map(n => n.data));
  }

  // --- Animation & Config ---

  private animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.controls && this.controls.enabled) this.controls.update();

    const time = Date.now() * 0.001;
    this.nodes.forEach(node => {
        // Only float if not selected and not dragging
        if (node.data.id !== this.selectedNodeId && !this.isDragging) {
           node.mesh.position.y = node.data.position.y + Math.sin(time + node.mesh.position.x) * 0.02;
        }
        node.mesh.rotation.y += 0.002;
    });

    // Keep connections in sync with floating nodes
    this.updateAllConnections();

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private onWindowResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);
  }

  public dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer) this.renderer.dispose();
  }

  // --- Default Scenario ---

  public loadDefaultScene() {
    this.clearScene();

    const host = this.addNode('host', { x: 0, y: 35, z: -10 }, 'Host Server', 'Central Authority');
    const obs = this.addNode('internal', { x: 15, y: 38, z: -10 }, 'Observability', 'ELK Stack', '#7c3aed');
    this.connectNodes(host, obs);

    const gateway = this.addNode('gateway', { x: 0, y: 0, z: 0 }, 'API Gateway', 'Ingress');
    const proxy = this.addNode('proxy', { x: -25, y: 0, z: 0 }, 'Proxies', 'Load Balancer');
    this.connectNodes(proxy, gateway);
    this.connectNodes(gateway, host);

    const broker = this.addNode('transformer', { x: 25, y: 0, z: 0 }, 'Service Broker', 'Message Bus', '#f97316');
    this.connectNodes(gateway, broker);

    const auth = this.addNode('internal', { x: 25, y: 15, z: 0 }, 'Auth Svc', 'Security', '#14b8a6');
    this.connectNodes(gateway, auth);
    
    const extA = this.addNode('external', { x: 50, y: 10, z: 5 }, 'External A', 'Payment Provider');
    const extB = this.addNode('external', { x: 50, y: -10, z: 5 }, 'External B', 'Logistics');
    
    this.connectNodes(broker, extA);
    this.connectNodes(broker, extB);

    for(let i=0; i<3; i++) {
        const c = this.addNode('client', { x: -50, y: (i-1)*10, z: 0 });
        this.connectNodes(c, proxy);
    }
  }
}
