import { describe, expect, it } from "vitest";
import { parseChoice, type Choice } from "../web/src/lib/ballot.js";
import { defaultView, overviewHash, stateLabel, statesOf, viewOf, viewParam } from "../web/src/lib/stateView.js";

const BOTH = ["ca", "nv"];

describe("Overview: one state at a time", () => {
  it("lists California first, then the other states by code", () => {
    expect(statesOf(["nv", "ca", "nv", "ca"])).toEqual(["ca", "nv"]);
    expect(statesOf(["zz"])).toEqual(["zz"]);
    expect(statesOf(["nv", "az", ""])).toEqual(["az", "nv"]);
    expect(stateLabel("nv")).toBe("Nevada · Las Vegas");
    expect(stateLabel("ca")).toBe("California");
    expect(stateLabel("zz")).toBe("ZZ");
  });

  it("reads view= from the link, and not My ballot's own st=nv", () => {
    expect(viewParam("view=nv")).toBe("nv");
    expect(viewParam("view=ca&st=nv&cd=1")).toBe("ca");
    expect(viewParam("cd=11&view=nv")).toBe("nv");
    expect(viewParam("st=nv&cd=1")).toBeNull();
    expect(viewParam("")).toBeNull();
    expect(viewParam("view=nevada")).toBeNull();
  });

  it("opens on the link's state, else My ballot's, else the first state", () => {
    expect(defaultView({}, BOTH)).toBe("ca");
    expect(defaultView({ st: "nv", cd: [1] }, BOTH)).toBe("nv");
    expect(defaultView({ cd: [11] }, BOTH)).toBe("ca");
    // The demo has one place of its own: a California ballot doesn't change what it shows.
    expect(defaultView({ cd: [11] }, ["zz"])).toBe("zz");
    expect(viewOf("nv", { cd: [11] }, BOTH)).toBe("nv");
    expect(viewOf("ca", { st: "nv", cd: [1] }, BOTH)).toBe("ca");
    expect(viewOf("az", {}, BOTH)).toBe("ca");
    expect(viewOf(null, { st: "nv", cd: [1] }, BOTH)).toBe("nv");
  });

  it("writes view= only when it isn't the default, after keeping My ballot's own parameters", () => {
    const cases: Array<[string, Choice, string]> = [
      ["ca", {}, "#overview"],
      ["nv", {}, "#overview?view=nv"],
      ["ca", { cd: [11] }, "#overview?cd=11"],
      ["nv", { cd: [11] }, "#overview?view=nv&cd=11"],
      ["nv", { st: "nv", cd: [1] }, "#overview?st=nv&cd=1"],
      ["ca", { st: "nv", cd: [1] }, "#overview?view=ca&st=nv&cd=1"],
    ];
    for (const [view, choice, hash] of cases) {
      expect(overviewHash(view, choice, BOTH)).toBe(hash);
      // Round trip: the address gives back the same state and ballot.
      const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
      expect(viewOf(viewParam(query), parseChoice(query), BOTH)).toBe(view);
      expect(parseChoice(query)).toEqual(choice);
    }
    expect(overviewHash("zz", {}, ["zz"])).toBe("#overview");
  });
});
