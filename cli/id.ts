/**
 * npm run -s id -- slug "<name>"        -> deterministic slug
 * npm run -s id -- source "<url>"       -> source id + canonical url
 * npm run -s id -- relationship < rec   -> deterministic relationship id
 */
import { canonicalUrl, relationshipId, slugify, sourceId } from "../src/ids.js";
import { parseArgs, readStdin } from "./args.js";

const args = parseArgs();
const [what, value] = args.positional;
switch (what) {
  case "slug":
    console.log(slugify(value ?? ""));
    break;
  case "source":
    console.log(JSON.stringify({ id: sourceId(value ?? ""), ref: `src:${sourceId(value ?? "")}`, canonical_url: canonicalUrl(value ?? "") }));
    break;
  case "relationship":
    console.log(relationshipId(JSON.parse(await readStdin()) as Record<string, unknown>));
    break;
  default:
    console.error('usage: npm run -s id -- slug "<name>" | source "<url>" | relationship < record.json');
    process.exit(2);
}
