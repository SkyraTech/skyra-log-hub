import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface JsonTreeNode {
  key: string;
  value: unknown;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  depth: number;
  expanded: boolean;
  children?: JsonTreeNode[];
  itemCount?: number;
}

@Component({
  selector: 'skyra-json-inspector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-inspector.component.html',
  styleUrl: './json-inspector.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonInspectorComponent {
  readonly data = input<unknown>(null);
  readonly maxDepth = input<number>(5);
  readonly initialExpandedDepth = input<number>(2);

  readonly copied = signal<boolean>(false);

  copyRawJson(): void {
    const raw = this.data();
    if (raw === undefined || raw === null) return;
    try {
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      navigator.clipboard.writeText(text).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    } catch {
      // Ignore clipboard failure in restricted environments
    }
  }

  isObject(val: unknown): val is Record<string, unknown> {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  }

  isArray(val: unknown): val is unknown[] {
    return Array.isArray(val);
  }

  getType(val: unknown): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    const t = typeof val;
    if (t === 'object') return 'object';
    if (t === 'string') return 'string';
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    return 'string';
  }

  formatValue(val: unknown): string {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') return `"${val}"`;
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return String(val);
      }
    }
    return String(val);
  }
}
