
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ArchitectureVizService } from './services/architecture-viz.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrls: []
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  
  // UI State
  selectedNodeName = signal<string | null>(null);
  selectedNodeDescription = signal<string | null>(null);
  
  isInitialized = false;

  constructor(private vizService: ArchitectureVizService) {}

  ngAfterViewInit() {
    if (this.canvasContainer) {
      this.vizService.initialize(this.canvasContainer.nativeElement, (name, desc) => {
        this.selectedNodeName.set(name);
        this.selectedNodeDescription.set(desc);
      });
      this.isInitialized = true;
    }
  }

  ngOnDestroy() {
    this.vizService.dispose();
  }

  resetCamera() {
    this.vizService.resetCamera();
  }

  togglePulses() {
    this.vizService.toggleAnimation();
  }
}
