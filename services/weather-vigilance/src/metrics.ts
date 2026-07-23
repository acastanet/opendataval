export class Metrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  inc(name: string, value = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + value); }
  set(name: string, value: number): void { this.gauges.set(name, value); }
  render(): string {
    const lines: string[] = [];
    for (const [name, value] of [...this.counters.entries()].sort()) lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
    for (const [name, value] of [...this.gauges.entries()].sort()) lines.push(`# TYPE ${name} gauge`, `${name} ${value}`);
    return `${lines.join("\n")}\n`;
  }
}
