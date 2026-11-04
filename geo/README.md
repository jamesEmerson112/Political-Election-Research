# geo/: district boundaries for "My ballot"

The site's **My ballot** panel narrows the Overview to the contests on one voter's ballot. To turn a ZIP code or a device location into districts *inside the browser*, with no geocoder or API call, it needs district outlines and a ZIP table. This folder holds them:

| file | what |
|---|---|
| `ca-2026-districts.json` | simplified outlines of California's U.S. House (52), State Senate (40) and Assembly (80) districts, plus a ZIP-code table. Generated; don't edit by hand. |
| `manifest.json` | provenance of every input (URL, publisher, license, dates, bytes, sha256, registered `src:` ref), the output's sha256, the parameters and the verification results |
| `nv-2026-districts.json`, `manifest.nv.json` | the same for Nevada (Las Vegas ballots): U.S. House (4), State Senate (21), Assembly (42), counties (17) and the City of Las Vegas. See [Nevada](#nevada-las-vegas-ballots). |

Rebuild with `npm run import:districts -- --verify`. Same inputs give the same bytes. The command downloads about 1.6 GB of Census files into the gitignored `.cache/geo/` and checks each against its pinned sha256. A changed upstream file stops the run. You can delete the cache afterwards.

## Why `geo/` and not `data/`

`data/` holds research records: small, cited JSON claims that `put`, `validate` and `fmt` manage. Boundary files are a different thing: derived, generated geometry with no claims about candidates, rebuilt by a script from pinned public files. Keeping them here keeps the record store and its tooling unchanged (`validate` only walks `data/`). Provenance is in `manifest.json`.

The two inputs that carry the map choice for U.S. House are also registered as sources:
- `src:www2-census-gov-79fceea71e`: the TIGER/Line shapes
- `src:www2-census-gov-ade03cc232`: the block equivalency file

## Which maps

- **U.S. House: the 2026 map, adopted by AB 604 and approved by Proposition 50 (November 2025).**
  - It comes from the Census Bureau's files for the **120th Congress**, the one elected on November 3, 2026.
  - It is *not* the 2021 Citizens Redistricting Commission map. That map is the Census "CD118"/"CD119" files, the Census geocoder, and most copies on GitHub and npm. Those are wrong for 2026 House races.
- **State Senate and Assembly: the 2021 Commission maps.** Proposition 50 changed only congressional lines. They come from the Census "2026 state legislative" files.
- **Board of Equalization: not included yet.** See [Adding the Board of Equalization](#adding-the-board-of-equalization).

## Inputs

All are U.S. Census Bureau files. They are public domain as works of the U.S. federal government (17 U.S.C. § 105). Exact URLs, sizes and hashes are in `manifest.json`.

| id | file | used for |
|---|---|---|
| `cd120-shapes` | TIGER/Line 2026 `tl_2026_06_cd120.zip` | House outlines |
| `cd120-bef` | 120th Congressional District block equivalency files `cd120.zip` (`CD120_06.txt`) | ZIP table, verification |
| `sldu-shapes`, `sldl-shapes` | TIGER/Line 2026 `tl_2026_06_sldu.zip`, `tl_2026_06_sldl.zip` | Senate and Assembly outlines |
| `sldu-bef`, `sldl-bef` | 2026 state legislative block equivalency files `sldu26.zip`, `sldl26.zip` | ZIP table, verification |
| `zcta-blocks` | 2020 ZCTA-to-block relationship file `tab20_zcta520_tabblock20_natl.txt` | which blocks make up each ZIP area |
| `blocks` | TIGER/Line 2026 `tl_2026_06_tabblock20.zip` (only its `.dbf`: `HOUSING20`, `INTPTLAT20`, `INTPTLON20`) | ZIP shares by housing units, verification points |

### Checking that "CD120" really is the Proposition 50 map

This one-off check was run on 2026-11-03 and is not part of the importer. It compared the California block equivalency file (`CD120_06.txt`, 519,723 blocks) with a block-by-block transcription of the AB 604 district descriptions (whole counties, whole tracts and listed blocks per district). The transcription is `ca_prop50_spec.txt` in github.com/redstoneruin/ca-prop50-districts.
- **519,723 of 519,723 blocks agree.**
- The same blocks differ from the 2021 map (`CD119`) for 25.7% of blocks.
- The transcription repository has no license, so it was used only for this comparison and nothing from it is redistributed.
- The official AB 604 text is published by the Secretary of State, but it was not reachable from the build environment.
- The Census Bureau's `CD120_BlockSplits.pdf` lists no split blocks in California.

## Output format (`ca-districts/1`)

- **`layers.<cd|sd|ad>.districts.<n>`**: the rings of district *n*, as lists of shared arcs.
  - The outlines are built as one topology across all layers, so a boundary two districts share is stored, and simplified, once. Adjacent districts have no gaps or overlaps.
- **`arcs`**: each arc is simplified with Douglas–Peucker at **`tolerance_m` = 120 m**, then snapped to a 0.00005° grid and delta-encoded as text (Google polyline integer encoding).
- **`margin_m` = 137 m** bounds the distance between a stored outline and the official one: the tolerance plus half a grid cell, plus 10%.
  - The site treats any point within `margin_m` of a boundary, plus the device's reported accuracy, as possibly in either district and shows both.
- **`zips`**: one row per 2020 ZIP Code Tabulation Area (ZCTA), e.g. `94025:c16/71,15/29;s13;a23/79,21/21`.
  - Letters: `c` House, `s` Senate, `a` Assembly, `b` BOE.
  - `/p` is the share of the ZCTA's 2020 housing units in that district, in whole percent (kept between 1 and 99 when several districts hold homes). `0` means the district holds part of the ZCTA's land but no housing units were counted there.
  - `;x` marks a ZCTA that also covers land outside California.
  - ZCTAs approximate ZIP Code delivery areas. PO-box-only and newer ZIP codes have none, and the site says so.
- The coordinates are NAD83 longitude/latitude, used as-is.

## Verification

`--verify` takes the internal point of every 10th 2020 census block (51,973 points) and looks it up in the generated file with the site's own code (`web/src/lib/geo.ts`). It then checks that the block's district in the equivalency file is among the possible districts. Results from the current file (`manifest.json`, `verification`):

| layer | points checked | district not among possible | homes where the lookup returns more than one district |
|---|---|---|---|
| House | 51,973 | 0 | 2.6% |
| Senate | 51,973 | 0 | 2.0% |
| Assembly | 51,973 | 0 | 2.8% |

The ZIP table has 1,808 ZCTAs. Of these, 653 span more than one House district; the site lists every one with its share of homes. Six ZCTAs cross the state line.

## Adding the Board of Equalization

The Census Bureau publishes no BOE boundaries. The authoritative file is the California Citizens Redistricting Commission's **"Final BOE Shapefiles" (ZIP)**, listed on https://wedrawthelines.ca.gov/final-maps/ (2021 map, still in effect: Proposition 50 did not change it). That host was blocked from the build environment on 2026-11-03, so the site asks voters to pick their BOE district.

To add it:

1. Download the ZIP. Record the site's terms of use in the manifest notes.
   - If its `.prj` is projected (e.g. California Albers), convert it to longitude/latitude first, for example `npx mapshaper in.zip -proj wgs84 -o out.zip`. The importer refuses projected files.
2. Find the field that holds the district number (1–4) in its `.dbf`.
3. Run `npm run import:districts -- --verify --boe <zip> --boe-field <FIELD>`.
   - Optional: `--boe-bef <file>` with the Commission's BOE block equivalency file (GEOID,…,district) also adds BOE to the ZIP table.
4. The manifest records the BOE file's name and sha256. Add its URL, publisher, license and dates to `INPUTS` in `cli/import-districts.ts` so later runs re-download and check it.

The site picks the BOE layer up automatically: location lookups then resolve BOE too.

## Nevada (Las Vegas ballots)

`npm run import:districts -- --state nv --verify` builds `nv-2026-districts.json` (about 29 KB) and `manifest.nv.json` the same way, from pinned Census files: Nevada's own TIGER/Line 2026 shapes and blocks, plus the national equivalency and ZCTA files that the California build pins too. It reuses an existing cache. A first run downloads about 1.3 GB, mostly the national ZCTA file, which you can delete afterwards. Visitors never download any of this: they get the small generated file, inlined in the page, and their ZIP code is looked up there.

| layer | source | notes |
|---|---|---|
| `cd` | `tl_2026_32_cd120`; `NationalCD120.txt` (Nevada rows) | Nevada did not redistrict for the 120th Congress, so the archive has no Nevada-only file |
| `sd`, `ad` | `tl_2026_32_sldu`, `tl_2026_32_sldl`; national 2026 SLD equivalency files | |
| `county` | `tl_2026_us_county` (STATEFP 32), numbered by county FIPS (Clark = 3) | blocks: the county code in the block GEOID |
| `city` | `tl_2026_32_place`, PLACEFP 40000 (City of Las Vegas), stored as district 1 | blocks: whether the block's internal point is inside the 2026 outline; 0 = outside. There is no equivalency file for places. |

- **ZIP table:** the letters `k` (county) and `l` (city) are added. `l0` means outside the City of Las Vegas. Many "Las Vegas" mailing ZIPs are outside the city, for example the Strip (89109, unincorporated Clark County) or Henderson (89052), so the site shows the city's share of homes and adds the city's contests only for homes inside it.
- **Point lookups:** the `city` layer reports 0 ("outside") as possible whenever a point is outside the outline, or within the margin of its edge.
- **Verification:** every 10th Nevada block, 5,741 points, with 0 misses in all five layers (`manifest.nv.json`).
- **Not included:** Las Vegas City Council wards, Clark County Commission districts, CCSD trustee districts and Board of Regents districts. The Census Bureau publishes none of them, so the site asks voters to pick these from their sample ballot or Clark County's voter lookup.
