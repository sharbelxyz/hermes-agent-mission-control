# Dispatch Dashboard — Findings Summary for Triage

## Critical Issues (Fix Before 40 Technicians)

### 1. Efficiency Double-Count on Mirrored Jobs (Lead + Apprentice)
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 625-690 (buildRosterMap)
- **Problem:** When lead + apprentice assigned to same job, both count job's efficiency independently → 50% efficiency shows as 100%
- **Risk:** Technician roster KPIs inflated by 2x at crews with pairings
- **Fix:** Track `leadTechnicianId` in buildRosterMap, skip re-counting when seen under lead
- **Test:** Assert 2-person crew on 50% job shows 50% efficiency, not 100%

### 2. Sold Hours Read-Model Returns Empty — No Fallback
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 528; `line 506-521`
- **Problem:** REST API timeout → no sold-hours data → capacity KPI shows "Unknown" (null), dispatcher can't verify coverage
- **Risk:** Dashboard blind to under-capacity situation; no retry fallback
- **Fix:** Add warehouse fallback (mart_sold_hours_by_job or 7-day rolling cache)
- **Test:** Mock REST timeout, verify fallback returns reasonable default

### 3. Map Query Has No LIMIT — N+1 DoS Risk
- **Location:** `apps/web/app/api/dispatch/today-jobs-map/route.ts` line 61-96
- **Problem:** Query returns ALL appointments for day, no pagination; client refreshes every 60s → full table scans
- **Risk:** At 50 techs (250+ appointments), connection pool saturation after 5+ concurrent users
- **Fix:** Add `LIMIT 250` to query; materialize view with indexed columns
- **Test:** Run 10 concurrent requests, verify response < 1s and pool < 80% utilization

---

## High-Risk Issues (Fix in Sprint 1)

### 4. Multiple Assignments Per Appointment Not Handled
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 665-680; `today-jobs-map/route.ts` line 82-84
- **Problem:** Only first assignment captured; split crew (lead + apprentice) shows only 1 technician on map/queue
- **Risk:** Dispatcher doesn't see true crew size; schedule/capacity decisions wrong
- **Fix:** Change Map to store array of assignments; create separate job record per active assignment
- **Test:** Create appointment with 2 active assignments, verify both appear in dashboard

### 5. Zero-Sold-Hours Jobs Inflate Technician Efficiency
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 735-741
- **Problem:** Jobs with 0 sold hours treated as `null` efficiency, excluded from technician average → efficiency artificially high
- **Risk:** Technician showing 85% efficiency when true is 75%
- **Fix:** Treat `0 sold / scheduled` as explicit `0%` efficiency in aggregation
- **Test:** Tech with 9 normal jobs (80% avg) + 1 zero-sold should show 72%, not 80%

### 6. Timezone DST Bug in nextWorkingDate()
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 198-217
- **Problem:** Date parsed as local server timezone, not Brisbane → pull-forward candidates show wrong date during DST transitions
- **Risk:** At DST boundary (Oct 4, April 5), date off by ±1 day
- **Fix:** Parse input as UTC, not local: `new Date(\`${date}T00:00:00Z\`)`
- **Test:** Verify nextWorkingDate works across Oct 4, 2026 and April 5, 2026 boundaries

---

## Medium-Risk Issues (Fix in Sprint 2)

### 7. POReadiness Status Enum Mismatch
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 71-82
- **Problem:** ServiceTitan PO statuses like "pending_receipt" not in enum; treated as "ready"
- **Fix:** Make status a string; add explicit mapping function
- **Test:** Verify unknown PO statuses logged, not silently treated as ready

### 8. Missing actualEndTime on DispatchJob
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 29-53
- **Problem:** Can't see running-late jobs in real-time; only planned times shown
- **Fix:** Add actualStartTime, actualEndTime, runningLate boolean
- **Test:** Job started 2hrs ago, still not done should show "running_late" status

### 9. AttentionJobs KPI Ambiguous
- **Location:** `apps/web/app/dashboards/dispatch/DispatchDashboardClient.tsx` line 158
- **Problem:** "Needs action = 5" but note says "5 unassigned"; actually 2 unassigned + 2 overbooked + 1 underbooked
- **Fix:** Update note to show breakdown, or split into 3 separate KPIs
- **Test:** Dashboard with 2 unassigned, 2 overbooked should show "Needs action: 4" not "5"

### 10. Efficiency KPI Includes Completed Jobs — Capacity Optimism Bias
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 940-949; capacity calc around line 970
- **Problem:** "Remaining sold-hours gap" includes already-completed work → shows 0 gap at end of day even if unstarted jobs are underwater
- **Fix:** Separate "remaining (unstarted)" from "completed" KPIs
- **Test:** End of day with 10h completed, 5h scheduled but unstarted should show "5h gap", not "0h"

### 11. All Jobs Loaded Into Memory — No Pagination
- **Location:** `apps/web/lib/dispatch/read-model.ts` line 506-521
- **Problem:** No pagination/filtering; loads 250+ appointments + 50+ customers + 30+ locations into memory
- **Risk:** Bloated response (50KB+), slow re-renders, memory spikes
- **Fix:** Server-side filter by role; add caching; limit to 100 jobs on initial load
- **Test:** Response < 10KB, render time < 1s for 100 jobs

### 12. Timestamp Cast Queries Not Indexed
- **Location:** `apps/web/app/api/dispatch/today-jobs-map/route.ts` line 91
- **Problem:** `(rsa.source_payload->>'start')::timestamptz AT TIME ZONE ...` not indexable → full table scan
- **Risk:** Query time degrades as raw tables grow
- **Fix:** Materialize computed columns (appt_start_utc), add index
- **Test:** Query time stable at 100, 500, 1000 rows

---

## Verification Checklist

Before deploying dispatch to 50-tech scale:

- [ ] Efficiency mirrors test passes (dedup verification)
- [ ] Sold-hours fallback implemented and tested
- [ ] Map query LIMIT + response time verified < 1s
- [ ] Assignment array refactoring complete
- [ ] Zero-sold-hours tests pass
- [ ] DST transitions tested (Oct 4, April 5, 2026)
- [ ] actualEndTime field added
- [ ] AttentionJobs KPI note updated or split
- [ ] Remaining sold-hours (unstarted only) KPI calculated
- [ ] Load test: 10 concurrent users, response time p95 < 2s
- [ ] Indexes created on appt_start_utc, ingested_at
- [ ] Caching layer (5min TTL) implemented
- [ ] Monitoring alerts for empty sold-hours, efficiency > 100% in place

---

## File Locations for Quick Reference

| Issue | File | Lines |
|-------|------|-------|
| Efficiency double-count | read-model.ts | 625-690, 321-330 |
| Sold-hours fallback | read-model.ts | 506-521, 528 |
| Map query LIMIT | today-jobs-map/route.ts | 61-96 |
| Assignment dedup | read-model.ts | 665-680 |
| Zero-sold efficiency | read-model.ts | 735-741 |
| DST timezone | read-model.ts | 198-217 |
| PO status enum | read-model.ts | 71-82 |
| ActualEndTime | read-model.ts | 29-53 |
| AttentionJobs KPI | DispatchDashboardClient.tsx | 158 |
| Remaining hours | read-model.ts | 940-949, 970 |
| Memory pagination | read-model.ts | 506-521 |
| Timestamp indexes | today-jobs-map/route.ts | 61-96 |
