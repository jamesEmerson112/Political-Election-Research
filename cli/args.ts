import path from "node:path";
import { DEFAULT_DATA_DIR } from "../src/paths.js";

export interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

/** Minimal deterministic argv parser: --flag, --key value, positionals. */
export function parseArgs(argv = process.argv.slice(2)): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2) as [string, string | undefined];
      if (v !== undefined) flags.set(k, v);
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--") && VALUE_FLAGS.has(k)) flags.set(k, argv[++i]!);
      else flags.set(k, true);
    } else positional.push(a);
  }
  return { positional, flags };
}

const VALUE_FLAGS = new Set(["data", "contest", "subject", "file", "today", "through", "top", "limit", "out", "save", "cache", "stride", "boe", "boe-field", "boe-bef", "tolerance", "quantum"]);

export function dataDir(args: Args): string {
  const d = args.flags.get("data");
  return typeof d === "string" ? path.resolve(d) : DEFAULT_DATA_DIR;
}

export function flagStr(args: Args, k: string): string | undefined {
  const v = args.flags.get(k);
  return typeof v === "string" ? v : undefined;
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}
