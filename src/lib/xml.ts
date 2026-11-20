import type { RawRecord } from "./types";
import { withLeafKeys } from "./flatten";

interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
  depth: number;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, name, dec, hex) => {
    if (name) return ENTITIES[name.toLowerCase()];
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

const stripNs = (name: string) => name.replace(/^.*:/, "");

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) attrs[stripNs(m[1])] = decode(m[2] ?? m[3] ?? "");
  return attrs;
}

/**
 * Lightweight XML reader: finds the repeated element (e.g. <customer>) closest
 * to the top of the document and turns each one into a flat record.
 */
export function xmlToRecords(xml: string): RawRecord[] {
  const root: XNode = { name: "#root", attrs: {}, children: [], text: "", depth: 0 };
  const stack: XNode[] = [root];
  const all: XNode[] = [];

  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|(<!\[CDATA\[[\s\S]*?\]\]>)|<(\/?)([A-Za-z_][\w:.\-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.text += m[1].slice(9, -3);
    } else if (m[6] !== undefined) {
      top.text += decode(m[6]);
    } else if (m[3]) {
      const name = stripNs(m[3]);
      if (m[2]) {
        if (stack.length > 1 && top.name === name) stack.pop();
      } else {
        if (stack.length > 60) throw new Error("XML is nested too deeply");
        const node: XNode = { name, attrs: parseAttrs(m[4]), children: [], text: "", depth: stack.length };
        top.children.push(node);
        all.push(node);
        if (!m[5]) stack.push(node);
      }
    }
  }

  const hasStructure = (n: XNode) => n.children.length > 0 || Object.keys(n.attrs).length > 0;
  const stats = new Map<string, { count: number; depth: number }>();
  for (const n of all) {
    if (!hasStructure(n)) continue;
    const s = stats.get(n.name);
    stats.set(n.name, { count: (s?.count ?? 0) + 1, depth: Math.min(s?.depth ?? 99, n.depth) });
  }

  // Prefer the shallowest repeated element; break ties by count.
  let best: string | undefined;
  let bestStat = { count: 0, depth: 99 };
  for (const [name, s] of stats) {
    if (s.count < 2) continue;
    if (!best || s.depth < bestStat.depth || (s.depth === bestStat.depth && s.count > bestStat.count)) {
      best = name;
      bestStat = s;
    }
  }

  let nodes: XNode[];
  if (best) {
    nodes = all.filter((n) => n.name === best && hasStructure(n));
  } else {
    const rootEl = root.children[0];
    if (!rootEl) return [];
    const kids = rootEl.children.filter(hasStructure);
    nodes = kids.length ? kids : [rootEl];
  }
  return nodes.map((n) => withLeafKeys(nodeToRecord(n)));
}

function nodeToRecord(node: XNode): RawRecord {
  const out: RawRecord = {};
  const visit = (n: XNode, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(n.attrs)) out[prefix ? `${prefix}.${k}` : k] = v;
    if (n.children.length === 0 && prefix) out[prefix] = n.text.trim();
    if (depth > 10) return;
    for (const c of n.children) visit(c, prefix ? `${prefix}.${c.name}` : c.name, depth + 1);
  };
  visit(node, "", 0);
  return out;
}