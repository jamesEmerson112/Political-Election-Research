import { describe, expect, it } from "vitest";
import { districtOf, officeChips, shortOfficeName } from "../web/src/lib/officeChips.js";
import { validFiles } from "./helpers.js";

// Parsed JSON, read loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = Record<string, any>;
const office = (id: string) => JSON.parse(validFiles().get(`offices/${id}.json`)!) as J;
const NB = "\u00a0";
const unverified = { by: "t", method: "search summary", date: "2030-01-01" };

describe("office scope chips", () => {
  const council = office("exampleville-council-member");
  const governor = office("example-state-governor");

  it("lists, in order: seeking, seats, district, appointments, CivLab link", () => {
    const chips = officeChips({
      held: council,
      heldText: "Exampleville City Council, District 3",
      heldCitations: [{ source: "src:x", quote: "District 3" }],
      seeking: governor,
    });
    expect(chips.map((c) => [c.icon, c.text])).toEqual([
      ["seeking", "Seeking Governor of Example State"],
      ["seats", "1 of 7 seats · ~21K residents"],
      ["elected_by", `Elected by District${NB}3`],
      ["appoints", "Appoints 12 seats"],
      ["link", "CivLab"],
    ]);
    expect(chips.find((c) => c.icon === "link")!.href).toBe("https://graph.civlab.org/zz/elected/zz-exampleville-city-council");
    expect(chips.every((c) => !c.lead)).toBe(true);
  });

  it("marks chips whose citations are all unverified, and shows a muted chip when no connections are recorded", () => {
    const held = {
      ...governor,
      seats: { value: 1, citations: [{ source: "src:x", unverified }] },
      constituents: undefined,
      budget: { value: 16_851_826_113, basis: "FY", citations: [{ source: "src:x", unverified }] },
      connections: undefined,
      links: {},
    };
    const chips = officeChips({ held, heldText: "Governor" });
    expect(chips.map((c) => c.text)).toEqual(["Single office", "$16.9B budget", "Connections not researched"]);
    expect(chips.map((c) => !!c.lead)).toEqual([true, true, false]);
    expect(chips[2]!.muted).toBe(true);
  });

  it("names a multi-seat body's budget by level, and shortens long confirmation text", () => {
    const held = {
      name: "Member, Example Senate",
      level: "state",
      seats: { value: 40, citations: [{ source: "src:x", quote: "40" }] },
      budget: { value: 351_700_000_000, citations: [{ source: "src:x", quote: "b" }] },
      connections: [
        { type: "confirms", text: "Votes on confirmation of the Governor's appointments to executive offices", citations: [{ source: "src:x", unverified }] },
        { type: "appoints", text: "Appoints members to state boards", citations: [{ source: "src:x", unverified }] },
      ],
    };
    const chips = officeChips({ held, seeking: { name: "U.S. Representative from Example State", seats: { value: 435, citations: [] } } });
    expect(chips.map((c) => c.text)).toEqual([`Seeking U.S. Representative · 1${NB}of${NB}435`, "1 of 40 seats", "Appoints board members", "Confirmation votes", "$351.7B state budget"]);
    expect(chips.find((c) => c.icon === "confirms")!.title).toBe("Votes on confirmation of the Governor's appointments to executive offices");
  });

  it("parses districts and short names", () => {
    expect(districtOf("San Francisco District 1 Supervisor")).toBe(1);
    expect(districtOf("California State Senator, District 11")).toBe(11);
    expect(districtOf("Governor")).toBeNull();
    expect(shortOfficeName("U.S. Representative from California")).toBe("U.S. Representative");
    expect(shortOfficeName("Member, San Francisco Board of Supervisors")).toBe("Member, San Francisco Board of Supervisors");
  });
});
