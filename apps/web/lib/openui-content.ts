export function uniqueOpenUiReferences(value: unknown): unknown {
  // Scope identity to one answer/render. Never deduplicate labels or table values.
  const seen = new Set<string>();
  const duplicate = Symbol('duplicate-reference');
  function visit(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(visit).filter((item) => item !== duplicate);
    }
    if (!node || typeof node !== 'object' || !('type' in node) || node.type !== 'element')
      return node;
    if ('statementId' in node && typeof node.statementId === 'string') {
      if (seen.has(node.statementId)) return duplicate;
      seen.add(node.statementId);
    }
    if (
      'props' in node &&
      node.props &&
      typeof node.props === 'object' &&
      'children' in node.props
    ) {
      return { ...node, props: { ...node.props, children: visit(node.props.children) } };
    }
    return node;
  }
  return visit(value);
}
