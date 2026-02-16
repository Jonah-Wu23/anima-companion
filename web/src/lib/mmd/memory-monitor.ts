import * as THREE from 'three';

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

export interface MemoryStats {
  capturedAt: number;
  textures: number;
  geometries: number;
  programs: number;
  renderCalls: number;
  triangles: number;
  points: number;
  lines: number;
  usedJsHeapMb: number | null;
  jsHeapLimitMb: number | null;
}

export interface MemoryDelta {
  textures: number;
  geometries: number;
  programs: number;
  renderCalls: number;
  triangles: number;
  points: number;
  lines: number;
  usedJsHeapMb: number | null;
}

function toMb(value: number): number {
  return value / (1024 * 1024);
}

export class MemoryMonitor {
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scope = 'mmd'
  ) {}

  capture(): MemoryStats {
    const info = this.renderer.info;
    const perf = performance as PerformanceWithMemory;
    const usedJsHeapMb = perf.memory ? toMb(perf.memory.usedJSHeapSize) : null;
    const jsHeapLimitMb = perf.memory ? toMb(perf.memory.jsHeapSizeLimit) : null;
    const programs = Array.isArray(info.programs) ? info.programs.length : 0;

    return {
      capturedAt: Date.now(),
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs,
      renderCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      usedJsHeapMb,
      jsHeapLimitMb,
    };
  }

  compare(before: MemoryStats, after: MemoryStats): MemoryDelta {
    return {
      textures: after.textures - before.textures,
      geometries: after.geometries - before.geometries,
      programs: after.programs - before.programs,
      renderCalls: after.renderCalls - before.renderCalls,
      triangles: after.triangles - before.triangles,
      points: after.points - before.points,
      lines: after.lines - before.lines,
      usedJsHeapMb:
        before.usedJsHeapMb !== null && after.usedJsHeapMb !== null
          ? after.usedJsHeapMb - before.usedJsHeapMb
          : null,
    };
  }

  shouldForceCleanup(stats: MemoryStats): boolean {
    return stats.textures >= 256 || stats.geometries >= 256 || stats.programs >= 128;
  }

  logSnapshot(stats: MemoryStats, label = 'snapshot'): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    console.info(
      `[${this.scope}] ${label}`,
      JSON.stringify(
        {
          textures: stats.textures,
          geometries: stats.geometries,
          programs: stats.programs,
          renderCalls: stats.renderCalls,
          triangles: stats.triangles,
          usedJsHeapMb: stats.usedJsHeapMb,
          jsHeapLimitMb: stats.jsHeapLimitMb,
        },
        null,
        2
      )
    );
  }

  logComparison(before: MemoryStats, after: MemoryStats, label = 'diff'): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const delta = this.compare(before, after);
    console.info(
      `[${this.scope}] ${label}`,
      JSON.stringify(
        {
          delta,
          before: {
            textures: before.textures,
            geometries: before.geometries,
            programs: before.programs,
            usedJsHeapMb: before.usedJsHeapMb,
          },
          after: {
            textures: after.textures,
            geometries: after.geometries,
            programs: after.programs,
            usedJsHeapMb: after.usedJsHeapMb,
          },
        },
        null,
        2
      )
    );
  }
}
