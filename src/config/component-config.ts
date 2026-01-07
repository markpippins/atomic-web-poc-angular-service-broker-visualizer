
export type NodeType = string; // Relaxed from union type to string to support dynamic types

export interface ComponentConfig {
  id: string;            // Unique Internal ID
  type: NodeType;        // Slug used in code/save files (e.g., 'client', 'custom-1')
  label: string;         // Display label
  defaultNamePrefix: string; 
  description?: string;
  
  // Inheritance
  parentId?: string;     // ID of the component this extends
  isSystem?: boolean;    // If true, cannot be deleted/edited
  category?: string;     // For grouping

  // 3D Visual Properties
  geometry: 'sphere' | 'torus' | 'octahedron' | 'cylinder' | 'icosahedron' | 'box' | 'tall-cylinder';
  defaultColor: number; 
  scale: number;

  // UI Palette Properties
  iconClass: string; 
  colorClass: string; 
  
  // Logic Rules
  allowedConnections: NodeType[] | 'all'; 
}

// Initial System Components
export const INITIAL_REGISTRY: ComponentConfig[] = [
  { 
    id: 'sys-client',
    type: 'client', 
    label: 'Client', 
    defaultNamePrefix: 'Client',
    geometry: 'sphere', 
    defaultColor: 0x06b6d4, 
    scale: 1,
    iconClass: 'rounded-full',
    colorClass: 'bg-cyan-500',
    allowedConnections: ['proxy', 'gateway'],
    isSystem: true,
    category: 'Ingress'
  },
  { 
    id: 'sys-proxy',
    type: 'proxy', 
    label: 'Gateway Proxy', 
    defaultNamePrefix: 'Proxy',
    geometry: 'torus', 
    defaultColor: 0x10b981, 
    scale: 2.5,
    iconClass: 'rounded-full ring-4 ring-emerald-500',
    colorClass: 'bg-transparent',
    allowedConnections: ['gateway'],
    isSystem: true,
    category: 'Ingress'
  },
  { 
    id: 'sys-gateway',
    type: 'gateway', 
    label: 'API Gateway', 
    defaultNamePrefix: 'Gateway',
    geometry: 'octahedron', 
    defaultColor: 0xd946ef, 
    scale: 3,
    iconClass: 'rotate-45',
    colorClass: 'bg-fuchsia-500',
    allowedConnections: ['host', 'transformer', 'internal'],
    isSystem: true,
    category: 'Core'
  },
  { 
    id: 'sys-host',
    type: 'host', 
    label: 'Host Server', 
    defaultNamePrefix: 'Host',
    geometry: 'tall-cylinder', 
    defaultColor: 0x94a3b8, 
    scale: 2,
    iconClass: 'rounded-sm',
    colorClass: 'bg-slate-400 h-6',
    allowedConnections: ['internal', 'external'],
    isSystem: true,
    category: 'Infrastructure'
  },
  { 
    id: 'sys-transformer',
    type: 'transformer', 
    label: 'Transformer / Broker', 
    defaultNamePrefix: 'Broker',
    geometry: 'icosahedron', 
    defaultColor: 0x3b82f6, 
    scale: 2,
    iconClass: 'rounded-lg',
    colorClass: 'bg-blue-500',
    allowedConnections: ['external', 'internal'],
    isSystem: true,
    category: 'Integration'
  },
  { 
    id: 'sys-internal',
    type: 'internal', 
    label: 'Internal Svc', 
    defaultNamePrefix: 'Service',
    geometry: 'cylinder', 
    defaultColor: 0xeab308, 
    scale: 1.5,
    iconClass: 'rounded-sm',
    colorClass: 'bg-yellow-500',
    allowedConnections: ['internal', 'host'],
    isSystem: true,
    category: 'Core'
  },
  { 
    id: 'sys-external',
    type: 'external', 
    label: 'External Svc', 
    defaultNamePrefix: 'External',
    geometry: 'box', 
    defaultColor: 0x8b5cf6, 
    scale: 2,
    iconClass: 'rounded-sm',
    colorClass: 'bg-violet-500 w-5 h-5',
    allowedConnections: [],
    isSystem: true,
    category: 'External'
  },
];

// Deprecated: Use ComponentRegistryService instead
export const COMPONENT_REGISTRY = INITIAL_REGISTRY;
export const getComponentConfig = (type: NodeType) => INITIAL_REGISTRY.find(c => c.type === type)!;
