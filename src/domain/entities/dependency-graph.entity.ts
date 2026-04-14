export interface DependencyNode {
  filePath: string;
  imports: string[];
  importedBy: string[];
  /** Centrality score — higher means more imported by others (good Tier 1 candidate) */
  centrality: number;
}

export class DependencyGraph {
  private readonly nodeMap: Map<string, DependencyNode> = new Map();

  addNode(filePath: string): void {
    if (!this.nodeMap.has(filePath)) {
      this.nodeMap.set(filePath, { filePath, imports: [], importedBy: [], centrality: 0 });
    }
  }

  addEdge(from: string, to: string): void {
    this.addNode(from);
    this.addNode(to);
    const fromNode = this.nodeMap.get(from)!;
    const toNode = this.nodeMap.get(to)!;
    if (!fromNode.imports.includes(to)) fromNode.imports.push(to);
    if (!toNode.importedBy.includes(from)) toNode.importedBy.push(from);
  }

  computeCentrality(): void {
    const total = this.nodeMap.size || 1;
    for (const node of this.nodeMap.values()) {
      node.centrality = node.importedBy.length / total;
    }
  }

  getNode(filePath: string): DependencyNode | undefined {
    return this.nodeMap.get(filePath);
  }

  getAllNodes(): DependencyNode[] {
    return Array.from(this.nodeMap.values());
  }

  /** Returns top N most-imported files (Tier 1 candidates) */
  getTopCentralNodes(n: number): DependencyNode[] {
    return this.getAllNodes()
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, n);
  }
}
