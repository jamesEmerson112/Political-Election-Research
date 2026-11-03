# Draft question sets for San Francisco's local races (2026-11-03)

**Status: drafts for the maintainer to approve. Not on the agendas.** AGENTS.md hard rule 6 fixes an agenda's questions before research, so stance research for these races waits until they are approved. Approved questions go into `data/issues/` and the agendas through `put`.

They come from the research agents' reports, word for word. The agents drafted them from Mission Local's weekly candidate questions; the City College set rests on search summaries only.

## Board of Education (SFUSD) and City College (CCSF)

No existing issue question applies to either race; `q:ai/*` is about frontier AI developers and data centers. `issue.schema.json`'s `area` list has no "education" value, so these use "other" unless you add one.

**SFUSD.** The sources are Mission Local's weekly questions, which I opened, and its race article.
1. **Should SFUSD replace its elementary enrollment lottery with assignment that gives priority to the school nearest a student's home?**
   - Support: favors proximity or neighborhood assignment.
   - Oppose: favors keeping citywide choice (the lottery).
2. **Should SFUSD close or merge schools to reduce excess capacity?**
   - Support: favors closures or mergers, such as those planned for 2029-30.
   - Oppose: opposes them.
3. **Should SFUSD spend reserves above the state-required minimum on current programs and staff?**
   - Support: favors drawing reserves down.
   - Oppose: favors keeping them above the minimum.
4. **Should SFUSD keep offering Algebra 1 in 8th grade to students who are ready?**
   - Support: favors 8th-grade Algebra 1.
   - Oppose: favors starting Algebra 1 in 9th grade for all students.
5. **Should SFUSD set strict limits on students' screen time and use of AI tools in class?**
   - Support: favors strict limits.
   - Oppose: opposes strict limits.
6. **In its next labor agreements (current ones expire June 30, 2027), should SFUSD raise educator pay even if that requires reductions elsewhere in the budget?**
   - Support: favors raises with offsetting cuts.
   - Oppose: favors holding pay to avoid the cuts.
7. **Should SFUSD seek voter approval to renew or replace the Prop G parcel tax before it expires?**
   - Support: favors renewal or replacement.
   - Oppose: opposes it.

**CCSF.** These are based on search summaries only, so please confirm the underlying issues first.
1. **Should CCSF lease its closed Downtown campus for revenue rather than reopen it for classes?**
   - Support: favors leasing or partnerships for revenue.
   - Oppose: favors reopening it for classes.
2. **Should CCSF move more classes and services onto Ocean Campus and reduce its other centers?**
   - Support: favors consolidation.
   - Oppose: opposes it.
3. **Should CCSF spend reserves above the required minimum on classes and staff?**
   - Support: favors spending them.
   - Oppose: favors keeping them.
4. **Should CCSF build or partner to provide student housing?**
   - Support: favors it.
   - Oppose: opposes it.
5. **Should CCSF seek more city funding to expand Free City College?**
   - Support: favors seeking it.
   - Oppose: opposes it.
6. **Should CCSF cut course sections or programs to close a projected budget deficit?**
   - Support: favors cuts.
   - Oppose: opposes them.

## Board of Supervisors (Districts 2, 4, 6, 8, 10)

These are based on Mission Local's weekly candidate questions across the districts, and are the same for every district.
1. `housing/citywide-rezoning`
   - Text: "Should San Francisco allow taller, denser housing in neighborhoods where zoning now limits height and density, as in the 2025 citywide rezoning plan?"
   - Area: housing
   - Support: favors allowing added height and density citywide, including on western and northern corridors.
   - Oppose: favors keeping existing height and density limits.
2. `housing/expand-rent-control`
   - Text: "Should San Francisco extend rent control to more rental units, as far as state law allows?"
   - Area: housing
   - Support: favors covering more units.
   - Oppose: favors keeping current coverage.
3. `public-safety/police-license-plate-cameras`
   - Text: "Should SFPD keep using automated license-plate reader cameras such as Flock?"
   - Area: public_safety
   - Support: favors continued or expanded use.
   - Oppose: favors ending use or not renewing the contract.
4. `health/end-drug-use-supply-distribution`
   - Text: "Should San Francisco stop distributing drug-use supplies such as pipes and foil through city-funded programs?"
   - Area: health
   - Support: favors stopping distribution.
   - Oppose: favors continuing it.
5. `government/expand-mayoral-authority`
   - Text: "Should the mayor have more direct authority over city departments and commissions?"
   - Area: government
   - Support: favors more mayoral authority.
   - Oppose: favors keeping the current authority of commissions and the Board.
6. `government/limit-outside-election-spending`
   - Text: "Should San Francisco adopt new limits on outside (independent-expenditure) spending in city elections, as far as the law allows?"
   - Area: government
   - Support: favors new limits.
   - Oppose: favors current rules.
7. `transportation/local-tax-for-muni`
   - Text: "Should San Francisco raise local taxes to fund Muni service?"
   - Area: transportation
   - Support: favors a new or higher local tax for Muni.
   - Oppose: opposes one.
8. `transportation/bike-lanes-over-parking`
   - Text: "Should the city build or expand protected bike lanes even where that removes street parking?"
   - Area: transportation
   - Support: favors the lanes even with parking loss.
   - Oppose: favors keeping the parking.

Existing questions:
- `q:ai/data-center-moratorium` applies directly: the D10 candidates were asked about it, and the Board passed a 45-day data-center moratorium.
- `q:housing/transit-oriented-upzoning` fits only partly, because it is framed as state law.
- `q:immigration/expand-cooperation-federal-enforcement` fits only partly, as the city's sanctuary policy.
- The federal civil-rights, tax and health questions do not apply.

New issue files would be needed for public safety and government.
