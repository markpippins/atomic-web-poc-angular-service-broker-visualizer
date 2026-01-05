
export type NodeType = 'client' | 'proxy' | 'gateway' | 'host' | 'transformer' | 'external' | 'internal';

export interface ComponentConfig {
  type: NodeType;
  label: string; // Display label in Palette
  defaultNamePrefix: string; // Prefix for auto-generated names (e.g., "Client")
  
  // 3D Visual Properties
  geometry: 'sphere' | 'torus' | 'octahedron' | 'cylinder' | 'icosahedron' | 'box' | 'tall-cylinder';
  defaultColor: number; // Hex number for Three.js
  scale: number;

  // UI Palette Properties
  iconClass: string; // Tailwind classes for shape/style
  colorClass: string; // Tailwind classes for background color
  
  // Logic Rules
  allowedConnections: NodeType[] | 'all'; // List of types this component can output to
}

export const COMPONENT_REGISTRY: ComponentConfig[] = [
  { 
    type: 'client', 
    label: 'Client', 
    defaultNamePrefix: 'Client',
    geometry: 'sphere', 
    defaultColor: 0x06b6d4, 
    scale: 1,
    iconClass: 'rounded-full',
    colorClass: 'bg-cyan-500',
    allowedConnections: ['proxy', 'gateway'] // Clients usually connect to ingress
  },
  { 
    type: 'proxy', 
    label: 'Gateway Proxy', 
    defaultNamePrefix: 'Proxy',
    geometry: 'torus', 
    defaultColor: 0x10b981, 
    scale: 2.5,
    iconClass: 'rounded-full ring-4 ring-emerald-500',
    colorClass: 'bg-transparent',
    allowedConnections: ['gateway']
  },
  { 
    type: 'gateway', 
    label: 'API Gateway', 
    defaultNamePrefix: 'Gateway',
    geometry: 'octahedron', 
    defaultColor: 0xd946ef, 
    scale: 3,
    iconClass: 'rotate-45',
    colorClass: 'bg-fuchsia-500',
    allowedConnections: ['host', 'transformer', 'internal']
  },
  { 
    type: 'host', 
    label: 'Host Server', 
    defaultNamePrefix: 'Host',
    geometry: 'tall-cylinder', 
    defaultColor: 0x94a3b8, 
    scale: 2,
    iconClass: 'rounded-sm',
    colorClass: 'bg-slate-400 h-6',
    allowedConnections: ['internal', 'external']
  },
  { 
    type: 'transformer', 
    label: 'Transformer / Broker', 
    defaultNamePrefix: 'Broker',
    geometry: 'icosahedron', 
    defaultColor: 0x3b82f6, 
    scale: 2,
    iconClass: 'rounded-lg',
    colorClass: 'bg-blue-500',
    allowedConnections: ['external', 'internal']
  },
  { 
    type: 'internal', 
    label: 'Internal Svc', 
    defaultNamePrefix: 'Service',
    geometry: 'cylinder', 
    defaultColor: 0xeab308, 
    scale: 1.5,
    iconClass: 'rounded-sm',
    colorClass: 'bg-yellow-500',
    allowedConnections: ['internal', 'host'] // Microservices often talk to each other
  },
  { 
    type: 'external', 
    label: 'External Svc', 
    defaultNamePrefix: 'External',
    geometry: 'box', 
    defaultColor: 0x8b5cf6, 
    scale: 2,
    iconClass: 'rounded-sm',
    colorClass: 'bg-violet-500 w-5 h-5',
    allowedConnections: [] // Usually an endpoint, doesn't initiate calls back in this diagram
  },
];

export const getComponentConfig = (type: NodeType): ComponentConfig => {
  const config = COMPONENT_REGISTRY.find(c => c.type === type);
  if (!config) throw new Error(`Configuration for type ${type} not found`);
  return config;
};
