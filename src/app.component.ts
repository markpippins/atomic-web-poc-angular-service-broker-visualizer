
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ArchitectureVizService, NodeData } from './services/architecture-viz.service';
import { NodeType } from './config/component-config';
import { ComponentRegistryService } from './services/component-registry.service';
import { ComponentCreatorComponent } from './components/component-creator.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ComponentCreatorComponent],
  templateUrl: './app.component.html',
  styleUrls: []
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('labelInput') labelInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
  // Tab State
  activeTab = signal<'canvas' | 'creator'>('canvas');

  // UI Panels
  isPaletteOpen = signal(true);
  isInspectorOpen = signal(true);
  
  // Interaction Mode
  currentMode = this.vizService.modeSignal;
  isSimulationActive = this.vizService.isSimulationActive;

  // Tools - loaded from Registry Service
  toolItems = this.registry.allComponents;

  // Inspector Form Data
  selectedNode = this.vizService.selectedNodeData;
  allNodes = this.vizService.allNodes;
  
  // Computed list of nodes we can connect to (not self, not already connected, AND allowed by config)
  availableTargets = computed(() => {
    const current = this.selectedNode();
    const all = this.allNodes();
    if (!current) return [];
    
    // Get connection rules for current node type
    const config = this.registry.getConfig(current.type);
    
    return all.filter(n => {
      // Rule 1: Cannot connect to self
      if (n.id === current.id) return false;
      // Rule 2: Cannot connect if already connected
      if (current.connectedTo.includes(n.id)) return false;
      // Rule 3: Must be in allowed connections list
      if (config.allowedConnections !== 'all' && !config.allowedConnections.includes(n.type)) return false;
      
      return true;
    });
  });

  // Derived list of actual connection objects for display
  currentConnections = computed(() => {
    const current = this.selectedNode();
    const all = this.allNodes();
    if (!current) return [];
    return current.connectedTo.map(targetId => {
      const target = all.find(n => n.id === targetId);
      return target ? { id: targetId, label: target.label } : { id: targetId, label: 'Unknown' };
    });
  });
  
  // Form Models (synced with effect)
  formLabel = '';
  formDesc = '';
  formColor = '#ffffff';
  formX = 0;
  formY = 0;
  formZ = 0;
  
  // Connection Form
  selectedTargetId = '';

  private sub = new Subscription();

  constructor(
      private vizService: ArchitectureVizService,
      private registry: ComponentRegistryService
  ) {
    // Sync Selected Node to Form
    effect(() => {
      const node = this.selectedNode();
      if (node) {
        this.formLabel = node.label;
        this.formDesc = node.description;
        this.formColor = node.color;
        this.formX = Number(node.position.x.toFixed(2));
        this.formY = Number(node.position.y.toFixed(2));
        this.formZ = Number(node.position.z.toFixed(2));
        
        // Only open inspector if we are in canvas mode
        if (this.activeTab() === 'canvas') {
            this.isInspectorOpen.set(true); 
        }
        this.selectedTargetId = ''; // Reset dropdown
      }
    });

    // Listen for Double Click to Focus
    this.sub.add(this.vizService.nodeDoubleClicked.subscribe(() => {
      setTimeout(() => {
        if(this.labelInput) this.labelInput.nativeElement.focus();
      }, 50);
    }));
  }

  ngAfterViewInit() {
    // We only initialize if the container is present (which depends on the tab)
    // But since we use display:none or similar, we might want to check
    if (this.canvasContainer) {
      this.vizService.initialize(this.canvasContainer.nativeElement);
    }
  }

  ngOnDestroy() {
    this.vizService.dispose();
    this.sub.unsubscribe();
  }

  switchTab(tab: 'canvas' | 'creator') {
      this.activeTab.set(tab);
  }

  // --- Actions ---
  
  setMode(mode: 'camera' | 'edit') {
    this.vizService.setInteractionMode(mode);
  }
  
  toggleSimulation() {
    this.vizService.toggleSimulation(!this.isSimulationActive());
  }

  addNode(type: NodeType) {
    const x = (Math.random() - 0.5) * 40;
    const y = (Math.random() - 0.5) * 20 + 10;
    const z = (Math.random() - 0.5) * 20;
    const id = this.vizService.addNode(type, { x, y, z });
    this.vizService.selectNode(id);
    
    // Auto switch to edit mode when adding so they can move it
    this.setMode('edit');
  }

  clearCanvas() {
    this.vizService.clearScene();
  }

  resetDemo() {
     if(confirm('Discard changes and reload default demo?')) {
       this.vizService.loadDefaultScene();
     }
  }
  
  // --- Save / Load ---
  
  saveJson() {
    const json = this.vizService.exportSceneToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architecture-diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  
  triggerLoad() {
    this.fileInput.nativeElement.click();
  }
  
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
           this.vizService.importSceneFromJson(result);
           input.value = ''; // Reset
        }
      };
      reader.readAsText(file);
    }
  }

  // --- Form Handling ---

  onFormChange() {
    const node = this.selectedNode();
    if (!node) return;

    this.vizService.updateNode(node.id, {
      label: this.formLabel,
      description: this.formDesc,
      color: this.formColor,
      position: { x: this.formX, y: this.formY, z: this.formZ }
    });
  }

  deleteSelected() {
    const node = this.selectedNode();
    if(node) {
      this.vizService.deleteNode(node.id);
    }
  }

  // --- Connections ---

  addConnection() {
    const current = this.selectedNode();
    if(current && this.selectedTargetId) {
      this.vizService.connectNodes(current.id, this.selectedTargetId);
      this.selectedTargetId = ''; // Reset
    }
  }

  removeConnection(targetId: string) {
    const current = this.selectedNode();
    if(current) {
      this.vizService.disconnectNodes(current.id, targetId);
    }
  }

  togglePalette() { this.isPaletteOpen.update(v => !v); }
  toggleInspector() { this.isInspectorOpen.update(v => !v); }
}
