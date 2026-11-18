import {
  ChangeDetectionStrategy,
  inject,
  ElementRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import '@skyra-tech-platform/tabs';
import { SeverityBadgeComponent } from '../../../../shared/ui/severity-badge/severity-badge.component';
import { JsonInspectorComponent } from '../json-inspector/json-inspector.component';
import { LogExplorerRow } from '../../domain/log-event.model';

type DrawerTab = 'summary' | 'ecs' | 'raw';

@Component({
  selector: 'skyra-log-event-drawer',
  standalone: true,
  imports: [CommonModule, SeverityBadgeComponent, JsonInspectorComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './log-event-drawer.component.html',
  styleUrl: './log-event-drawer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogEventDrawerComponent {
  private readonly element=inject<ElementRef<HTMLElement>>(ElementRef);
  @HostListener('document:keydown',['$event'])containTab(event:KeyboardEvent){if(event.key!=='Tab'||!this.isOpen())return;const root=this.element.nativeElement.querySelector('skyra-tech-drawer');if(!root)return;const focusable:HTMLElement[]=[];const visit=(node:Element)=>{if(node instanceof HTMLSlotElement){const assigned=node.assignedElements({flatten:true});for(const child of assigned.length?assigned:Array.from(node.children))visit(child);return;}if(node instanceof HTMLElement&&!node.shadowRoot&&node.matches('button,a[href],input,select,textarea,[tabindex]')&&node.tabIndex>=0&&!node.hasAttribute('disabled')&&node.getClientRects().length)focusable.push(node);for(const child of Array.from(node.shadowRoot?.children??node.children))visit(child);};visit(root);if(!focusable.length)return;let active:Element|null=document.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;const index=focusable.indexOf(active as HTMLElement);if(event.shiftKey&&index<=0){event.preventDefault();focusable.at(-1)!.focus();}else if(!event.shiftKey&&(index<0||index===focusable.length-1)){event.preventDefault();focusable[0]!.focus();}}
  readonly log = input<LogExplorerRow | null>(null);
  readonly isOpen = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly investigateCorrelation=output<string>();
  readonly investigateTrace=output<string>();
  readonly close = output<void>();

  readonly activeTab = signal<DrawerTab>('summary');
  readonly copiedKey = signal<string | null>(null);

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.isOpen()) {
      event.preventDefault();
      this.close.emit();
    }
  }

  setTab(tab: DrawerTab): void {
    this.activeTab.set(tab);
  }

  onTabsChange(event: Event): void {
    const custom = event as CustomEvent<{ value: DrawerTab }>;
    if (custom.detail?.value) {
      this.activeTab.set(custom.detail.value);
    }
  }

  onClose(): void {
    this.close.emit();
  }

  copyToClipboard(key: string, text: string): void {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text).then(() => {
        this.copiedKey.set(key);
        setTimeout(() => this.copiedKey.set(null), 2000);
      });
    } catch {
      // Ignore
    }
  }

  formatTimestampLocal(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  }
}
