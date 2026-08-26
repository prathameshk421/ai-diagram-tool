# Canvas audit 48–76: targeting, labels, questions, undo, messy voice

Research only. No code. Scores the planned `arch-scene/v1` file (`diagram.arch.yaml`) — **not** the shipped nine Command ops.

**Contract under test:** the agent surgically edits YAML; the kernel owns geometry; the agent never invents `x`,`y`,`width`,`height` or ink points; the host injects `selection[]` before the turn. Schema fields: `nodes`, `edges`, `groups`, `ink`, `passes`, `constraints`, `board.palette`.

**Grades**

| Grade | Meaning |
|---|---|
| **WORKS** | Unique YAML write (or a guaranteed non-write) with today’s fields. Kernel can execute without guessing. |
| **WORKS_IF** | Possible only with a named host/kernel condition. Missing that condition → silent wrong edit. |
| **FAILS** | Schema cannot express it, or doing it honestly requires vision / invented facts / a second board / mutating a question. |

Harsh on: no vision (`blue one`, `left` Kafka), undo granularity, duplicate board, question-vs-mutate, compound intents, color not in schema, protocol hallucination.

Shipped `{op, args}` Command JSON **fails this cluster almost outright**. `bigger` / `equalize` / `connect` cover 48 / 51 / 50 only when selection is already right and the rest of the sentence is ignored. Everything below assumes the YAML canvas, not that preview schema.

---

## Fixture (before any of 48–76)

Two Kafka boxes on purpose. Payments sits beside Kafka, not under API. DB label is misspelled. One unlabeled box “next to” the DB. Pins exist in the real file (human/kernel); they are omitted here because the agent must not write them.

```yaml
schema: arch-scene/v1
board: { grid: 8, flow: left-to-right, palette: architecture }
selection: []
nodes:
  client:  { kind: unknown,   label: person,     icon: null,     shape: ellipse,    size: sm, style: sketch }
  api:     { kind: service,   label: API,        icon: null,     shape: rectangle,  size: md, style: sketch }
  payments:{ kind: service,   label: Payments,   icon: null,     shape: rectangle,  size: md, style: sketch }
  kafka_l: { kind: queue,     label: Kafka,      icon: kafka,    shape: queue,      size: sm, style: sketch }
  kafka_r: { kind: queue,     label: Kafka,      icon: kafka,    shape: queue,      size: md, style: sketch }
  db:      { kind: datastore, label: postgress,  icon: postgres, shape: rectangle,  size: md, style: sketch }
  mystery: { kind: unknown,   label: Box,        icon: null,     shape: rectangle,  size: md, style: sketch }
edges:
  client_api:    { from: client,    to: api,     label: "", kind: sync,  route: straight }
  api_db:        { from: api,       to: db,      label: "", kind: sync,  route: straight }
  api_kafka_r:   { from: api,       to: kafka_r, label: "", kind: sync,  route: ortho }
  payments_kafka:{ from: payments,  to: kafka_r, label: "", kind: sync,  route: ortho }
groups: {}
ink:
  stroke_new: { convert: null }   # just-drawn blob; points are renderer-only
passes: []
constraints: []
```

Host spatial fact (not in agent YAML unless `rel` is projected): `kafka_l` is left of `kafka_r`; `mystery` is adjacent to `db`; `payments` is horizontally beside `kafka_r`, not below `api`.

---

## Scoreboard

| # | Utterance | Grade |
|---|---|---|
| 48 | The Kafka box is too small | WORKS_IF |
| 49 | Move payments under the API, not next to Kafka | WORKS_IF |
| 50 | Connect the thing I just drew to Postgres | WORKS_IF |
| 51 | Make those two the same size | WORKS_IF |
| 52 | This one and that one, they're the same service, dedupe | **FAILS** |
| 53 | Not that Kafka, the one on the left, the producer | **FAILS** |
| 54 | um the blue one next to the database, make it the cache | **FAILS** |
| 55 | Label the arrows with the protocol | **FAILS** |
| 56 | Fix the typos, it's PostgreSQL not postgress | **WORKS** |
| 57 | Use official AWS icons, this looks like clipart | WORKS_IF |
| 58 | Add a legend | **FAILS** |
| 59 | Number the request path 1-2-3-4 | **FAILS** |
| 60 | The arrow from API to DB should go the other way | WORKS_IF |
| 61 | That's a read replica, dotted line, label it async replica | WORKS_IF |
| 62 | What's the single point of failure here? | WORKS_IF |
| 63 | Where does a request actually go? | WORKS_IF |
| 64 | Are we missing a cache? | WORKS_IF |
| 65 | Does this match a 3-tier AWS app? | WORKS_IF |
| 66 | Explain this to a PM in two sentences | WORKS_IF |
| 67 | No not the whole board, just the selected one | WORKS_IF |
| 68 | Put it back, that wasn't what I meant | WORKS_IF |
| 69 | Same layout, different icons | WORKS_IF |
| 70 | Start over from my sketch but keep the names | WORKS_IF |
| 71 | Make another version next to this, don't overwrite | **FAILS** |
| 72 | Wait wait the Kafka thing—undo the last bit only | **FAILS** |
| 73 | okay so like uh make the db look like a db and shove redis in front of it | WORKS_IF |
| 74 | no no leave kafka, I said the database | WORKS_IF |
| 75 | this—taps—is the user, stick figure is fine actually just label it Client | WORKS_IF |
| 76 | can you just… you know… architecture-ify it | WORKS_IF |

**1 WORKS / 20 WORKS_IF / 8 FAILS.** A YAML agent that only patches this schema will look smart on 56 and lie on 52–55, 58–59, 71–72.

---

## Schema holes this cluster punches

Add these or keep the FAILS. Do not “fix” targeting by stuffing color or raw `x,y` into the model.

| Hole | Needed for | Shape |
|---|---|---|
| Named-referent beats selection | 48, 49, 56, 60, 74 | Host resolver: utterance label/icon match wins over stale `selection[]` |
| `place.side` includes `below`/`above` | 49, 73 | `left\|right\|above\|below`. Negative “not next to X” is **not** a field — do not fake it |
| `lastDrawn` (host) | 50 | Not YAML. Host sets `selection` to last minted node **or** expose `recents.drawn` |
| `merge` pass | 52 | `passes: [{ type: merge, nodes: [a,b], keep: a }]`. Kernel rewires edges, drops the other id |
| Spatial `rel` in **agent view**, not pins | 53 | Host-projected `left_of` / `next_to`. Reading `pin.x` is a contract leak. Still FAIL without it or a click |
| Color targeting | 54 | **Do not add `color` as a query key.** No vision. Selection or unique label only |
| Protocol field that stays empty | 55 | Optional `edges.*.protocol`. Agent must not fill it. Ask or no-op |
| `board.legend` | 58 | `{ show: true, items: auto }` kernel-built from kinds in use. Dummy legend nodes pollute SPOF/path |
| `annotate-path` pass | 59 | Kernel walk, then `edges.*.seq`. LLM-written `1..4` is topology hallucination |
| Answer channel | 62–66 | **Zero YAML writes.** Byte-identical file. `say` / host chat only |
| Op journal, not snapshot-only | 67, 68, 72, 74 | Per-hunk undo. Whole-file snapshots cannot do 72 |
| `freezePins` restyle | 69 | Beautify today may min-gap / equalize and **move** boxes |
| Durable ink + `keepLabels` | 70 | If `ink.points` die after first convert, 70 FAILS |
| Duplicate / variant | 71 | `passes: [{ type: duplicate, side: right, idSuffix: _v2 }]` **or** `variants[]`. One node map cannot clone |
| Insert-on-path | 73 | `passes: [{ type: insert, node: redis, before: db, onEdgesTo: db }]`. Bare add-node leaves `api→db` intact |

---

## Targeting 48–54

### 48 The Kafka box is too small

**WORKS_IF** exactly one node matches Kafka (`label` / `icon` / id). Then bump discrete `size` one step. Kernel maps `sm|md|lg` to pixels. No `x,y`.

```yaml
# unique kafka_l only — if both kafka_l and kafka_r exist, DO NOT WRITE
nodes:
  kafka_l:
    size: md    # was sm
```

**Loopholes**

- Fixture has **two** Kafkas. Unique-name match fails. Must ask or use `selection[]`. Guessing `kafka_l` is vision.
- Named “Kafka” vs stale selection (payments): name must win, or you resize the wrong box.
- `size` is three steps. Already `lg` → no-op, not a 4th size, not a pixel `width`.
- Kernel pixel box can stay small because the label is short — user still says “too small”. Equalize/`bigger` on AABB is honest; enum-only bump is a cheat.
- Agent writes `width`/`height` → validator reject. That path is a FAIL even if it “looks” right.

### 49 Move payments under the API, not next to Kafka

**WORKS_IF** unique `payments` + `api`, `place.side` includes `below`, and the agent **deletes `payments` pin** (allowed) instead of inventing a new one.

```yaml
nodes:
  payments:
    pin: null          # unpin; kernel writes the new pin
constraints:
  - { op: place, node: payments, side: below, of: api }
```

**Loopholes**

- Example schema only showed `side: left`. Missing `below` → agent emits `x,y` → FAIL.
- “Not next to Kafka” has **no** constraint. If API is itself beside Kafka, `place below api` still parks payments next to Kafka. Do not add `avoid:` to satisfy the sentence without a solver that understands it.
- “Under” ≠ `groups.api.contains`. Containment is the wrong edit.
- `locked: true` on payments → refuse.
- Compound sentence: implementing only “not next to Kafka” (nudge away) misses “under the API”.

### 50 Connect the thing I just drew to Postgres

**WORKS_IF** the host put the just-drawn **node** id in `selection` (or `recents.drawn`), and exactly one Postgres (`label`/`icon`, including the `postgress` typo). Then mint an edge. Do not invent Postgres.

```yaml
selection: [stroke_new]   # host must have converted or selected this
edges:
  stroke_new_db:
    from: stroke_new
    to: db
    label: ""
    kind: sync
    route: ortho
```

**Loopholes**

- Schema has no `lastDrawn`. If `selection` is still `[api, db]`, you connect the wrong things.
- Just-drawn is still `ink.stroke_new` with `convert: null` — ink is not a legal `from`. Need `convert-ink` first, then connect. Two-pass. Skipping convert and pointing an edge at an ink id FAILS.
- Direction unspecified (`thing→Postgres` vs reverse). Default `from: lastDrawn, to: db` and say so.
- Label `postgress` vs spoken “Postgres”: matcher must be fuzzy on datastore/postgres icon, not exact string.
- Agent mints a second `postgres_2` instead of using `db` → FAIL.

### 51 Make those two the same size

**WORKS_IF** `selection.length == 2`. Constraint, not enum copy.

```yaml
selection: [api, payments]   # host
constraints:
  - { op: equalize, dim: both, nodes: [api, payments] }
```

**Loopholes**

- No selection, or 1 / 3+ ids: **FAIL** (deixis, no vision). Do not pick “the two services”.
- Equalize **pixel AABB** (max width/height). Setting both `size: md` while boxes still differ is a lie.
- Policy: grow-to-max, not shrink-to-mean (architecture boxes). Pick one in the kernel; do not let the LLM pass a pixel number.
- Equalizing a group frame vs its children: only selected ids.

### 52 This one and that one, they're the same service, dedupe

**FAILS.** No merge. Deleting one node by hand drops edges, or grouping them fakes identity.

Illegal “workaround” (do not do this):

```yaml
# WRONG: delete payments and hope
nodes:
  payments: null
```

**Required YAML (not in schema today)**

```yaml
selection: [api, payments]
passes:
  - { type: merge, nodes: [api, payments], keep: api }
```

**Loopholes**

- Which id survives? Pins, labels, incoming vs outgoing edges, group membership. Kernel must define `keep` (selection[0] or longest label).
- Merge vs `groups` “same layer”: user asked for **one box**, not a frame.
- Selection ≠ 2 → ask. “This one and that one” is not a label.
- Rewire: `client→api` and `client→payments` must collapse, not duplicate.

### 53 Not that Kafka, the one on the left, the producer

**FAILS.** Position targeting. Two nodes share `label: Kafka`. No `role: producer`. No dialogue memory of “that Kafka”. Agent-facing YAML must not be grepped for `pin.x`.

Not a legal write: “set `kafka_l.label: producer` because left.” That is the model doing geometry.

**WORKS only if** the host already re-selected `kafka_l`, **or** a unique label already says producer. Then a later command can edit that id. This utterance by itself does not.

**Loopholes**

- Projecting `rel: [left_of:kafka_r]` into the agent view would make “left Kafka” a **name**, not vision — still need uniqueness. Two left-of relations (stacked) re-break it.
- “The producer” without that word in `label`/`icon` is a role hallucination (Kafka has producers; the box might be the cluster).
- Reading pins to sort by `x` violates “kernel does geometry” on the **read** path. Same class of bug as emitting `x`.
- Previous turn’s wrong Kafka stays mutated unless 72/74-class undo exists.

### 54 um the blue one next to the database, make it the cache

**FAILS.** Color is not in the schema. “Next to the database” is spatial. No vision.

If **and only if** `selection: [mystery]` already (host click), the restyle is boring and fine:

```yaml
nodes:
  mystery:
    kind: datastore
    label: Cache
    icon: redis
    shape: rectangle
```

Do **not** add `fill: blue` so the agent can query it. Palette tokens (`board.palette`) are not node color. Sketch “blue” is a pixel fact.

**Loopholes**

- AWS palette “blue” services (RDS, ELB) — still not “the blue one” the user tapped.
- Restyling `db` because it is “the database” ignores “next to”.
- Inventing a new `cache` node instead of retargeting `mystery` duplicates the box.

---

## Labels / arrows 55–61

### 55 Label the arrows with the protocol

**FAILS.** Protocol hallucination. User did not name HTTP, gRPC, SQL, or Kafka. Kinds do not determine wire protocol (API→DB is not always SQL; API→Kafka is not always protobuf).

Forbidden:

```yaml
edges:
  client_api: { label: HTTP }
  api_db:     { label: SQL }
  api_kafka_r:{ label: Kafka }
```

Honest behavior: `unknown` / ask “which protocol?”, or leave labels empty. Optional future field `protocol: unknown` that the agent is **banned** from filling.

**Loopholes**

- Beautify that “helpfully” stamps HTTP on every `sync` edge.
- Mixing `label` (user text) with protocol — later 56-style typo fixes smash protocols.
- One protocol for the whole board.

### 56 Fix the typos, it's PostgreSQL not postgress

**WORKS.** User supplied both strings. Scan **labels** (nodes, edges, groups). Do not rename ids or `icon: postgres`.

```yaml
nodes:
  db:
    label: PostgreSQL    # was postgress
```

**Loopholes**

- Rewriting `id: db` or `icon: postgres` to `PostgreSQL` breaks edges and the stencil table.
- Whole-board vs selection: this utterance names the string, so board-wide label replace is correct. Do not require selection.
- Whisper already produced `postgres` — no substring `postgress` → no-op, not a fuzzy “fix all English”.
- `postgress` in a group title or edge label must be included; icon keys must not.

### 57 Use official AWS icons, this looks like clipart

**WORKS_IF** the kernel owns a **closed** kind/label → AWS Architecture Icon map, and restyle **does not reflow pins**. Agent sets palette only.

```yaml
board:
  palette: aws
passes:
  - { type: beautify, scope: board, freezeTopology: true, freezePins: true }
```

Kernel may rewrite `icon: postgres` → `aws.rds` from a table. The LLM must not emit `icon: aws.elasticache-redis-something`.

**Loopholes**

- Trademarked official icon packs — product/legal, not YAML.
- Kafka → MSK vs EC2-hosted Kafka is a guess. Table should keep `icon: kafka` unless label says MSK.
- `freezeTopology` does not freeze layout; min-gap beautify **moves** boxes and fails “this looks like clipart” (icons only).
- Open `icon` string is an unbounded hallucination surface. Enum or kernel-only remap.

### 58 Add a legend

**FAILS.** No legend object. Agent-created nodes (`lg_svc`, `lg_db`, …) become graph entities: 62 will call the legend a SPOF, 63 will route through it, 71 will clone it.

**Required YAML**

```yaml
board:
  legend: { show: true, items: auto }
```

Kernel draws an overlay from distinct `kind`/`icon` values in use. Not selectable architecture nodes.

**Loopholes**

- `groups.legend.contains: [...]` still sits in the scene graph.
- Auto items on a messy board (every `unknown`) is noise; still better than fake nodes.

### 59 Number the request path 1-2-3-4

**FAILS** as an LLM label write. Path identity is kernel graph search. The fixture’s walk is 3 hops (`client→api→db`) or forks to Kafka — not “1-2-3-4”. Stamping 1..4 on four arbitrary edges is fiction.

Forbidden:

```yaml
edges:
  client_api: { label: "1" }
  api_db:     { label: "2" }
  # ...invent 3 and 4
```

**Required YAML**

```yaml
passes:
  - { type: annotate-path, from: client, to: db }  # kernel sets edges.*.seq
```

If the unique path length ≠ 4, say so; do not pad.

**Loopholes**

- Multiple sinks (db and kafka). Unspecified.
- Numbering nodes vs edges.
- Cycles / async replica edges included as “the request path”.
- Doing 59 as a side effect of question 63.

### 60 The arrow from API to DB should go the other way

**WORKS_IF** exactly one edge `api→db`. Swap endpoints. Do not emit coordinates for the arrow.

```yaml
edges:
  api_db:
    from: db
    to: api
```

**Loopholes**

- Two API–DB edges (read and write): which one? Need `selection` on the edge.
- Reverse vs add a second opposite edge (bidirectional). Utterance says “the other way” → swap, do not duplicate.
- Label `reads` (if any) becomes a lie after reverse. Kernel should not invent `writes`; clear or ask.
- Selecting the two nodes with no edge id: `from/to` pair must be unique.

### 61 That's a read replica, dotted line, label it async replica

**WORKS_IF** `selection` is that **edge** (or the pair is unique). `kind: async` is the dotted mapping. Do not add a `stroke: dotted` field for the LLM.

```yaml
selection: [api_db]   # host; otherwise FAIL
edges:
  api_db:
    kind: async
    label: async replica
nodes:
  db:
    label: PostgreSQL read replica   # only if the box was the referent too
```

**Loopholes**

- Compound: “that’s a read replica” often means the **box**; “dotted line, label it async replica” means the **edge**. One selection cannot be both unless the host selected the edge and the kernel updates `to`.
- Applying `kind: async` to every edge into `db`.
- Dotted+sync: schema cannot say “dotted but synchronous”. Good — don’t add raw stroke.
- Empty deixis (“that’s”) with `selection: []` → FAIL. No vision of a dotted-looking scribble.

---

## Questions 62–66 (must not mutate the file)

Acceptance for this whole band: **SHA of `diagram.arch.yaml` unchanged**. If the only I/O is “agent writes YAML”, every item **FAILS** because a helpful model will add replicas, number paths, insert Redis, or switch `palette: aws`.

All five are **WORKS_IF** a distinct **answer channel** exists (host chat / `say` / read tools). No `passes`, no `constraints`, no new nodes.

### 62 What's the single point of failure here?

**WORKS_IF** answer mode + preferably a kernel articulation-point / singleton-kind report (one `db`, one `api`, no replica edge).

**Loopholes**

- Adding a replica “to fix” the SPOF (mutate).
- Calling `kafka_l` and `kafka_r` redundant without checking they are not both required.
- Legend nodes or ink counted as services.
- LLM SPOF that names components **not in the file**.

### 63 Where does a request actually go?

**WORKS_IF** answer mode + walk `edges` from `kind: actor` (or `client`) to datastores. Cite ids/labels only.

**Loopholes**

- Writing `seq` labels (does 59).
- Inventing a cache or load balancer hop that is not an edge.
- Forks: must say “or” (db vs kafka), not pick one.

### 64 Are we missing a cache?

**WORKS_IF** answer mode. Heuristic is allowed in **speech** (“API talks to DB with no redis neighbor”).

**Loopholes**

- Inserting Redis. That is 73, not 64. This is the classic question-vs-mutate fail.
- “No” because `mystery` sits next to `db` — it is not a cache until labeled.

### 65 Does this match a 3-tier AWS app?

**WORKS_IF** answer mode. Checklist against **file facts**: actor / service / datastore, groups as VPC, `palette: aws`. Current fixture is not AWS and has no tiers-as-groups → answer should be **no**, with what is missing.

**Loopholes**

- Restyle to AWS + add ALB/VPC to “make it match”.
- Fuzzy 3-tier (client/api/db vs presentation/app/data). Define the checklist in code; don’t let the LLM expand the diagram.

### 66 Explain this to a PM in two sentences

**WORKS_IF** answer mode. Two sentences, only nodes/edges present.

**Loopholes**

- Triggering `beautify` because “explain” sounds like polish.
- Inventing “the payments service processes cards via Kafka” if that edge/label isn’t there.

---

## Undo / scope 67–72

Undo is **host history**. The agent does not write an “undo” YAML. Inverse diffs from model memory are FAILS.

### 67 No not the whole board, just the selected one

**WORKS_IF** the host knows the **last mutating pass** and can revert it, then replay with `scope: selection`.

```yaml
selection: [kafka_l]
passes:
  - { type: beautify, scope: selection, freezeTopology: true }
```

**Loopholes**

- No last-op record: agent guesses `beautify` on selection and leaves the rest of the board in the global-pass state (partial).
- Last op was equalize-all: replaying equalize on one node is a no-op; the others stay equalized. Must **revert** global equalize first.
- `selection: []` → ask, do not use last selection silently if the user just changed it.
- `passes.scope` exists; `constraints` in the plan are not scoped. Global align cannot be narrowed without a journal.

### 68 Put it back, that wasn't what I meant

**WORKS_IF** host restores the previous file snapshot. Agent writes nothing.

**Loopholes**

- User meant “wrong interpretation, try the other op” — restore plus a new intent. Snapshot-only undo is still correct for “put it back”.
- Agent reconstructs old labels from the prompt (wrong).
- No snapshots → FAILS. YAML has no history field; do not add `previous:` blobs for the LLM to edit.

### 69 Same layout, different icons

**WORKS_IF** restyle with **pins frozen**. Today’s `beautify` + `freezeTopology` still allows min-gap / equalize / tidy — that **changes layout**.

```yaml
board: { palette: aws }   # or style: clean on nodes
passes:
  - { type: restyle, scope: board, freezePins: true, freezeTopology: true }
```

**Loopholes**

- Icon swap changes AABB (AWS glyph vs rectangle) → neighbors overlap unless the kernel grows in place without translation. Define that.
- Agent deletes pins “so layout can breathe”.
- Different icons **and** `tidy-layout` because beautify recipes are bundled.

### 70 Start over from my sketch but keep the names

**WORKS_IF** ink strokes still exist in the **host** file (points may be stripped from the agent copy) and convert can re-run with a label map.

```yaml
passes:
  - { type: convert-ink, scope: board, keepLabels: true }
```

`keepLabels`: match old node labels onto new converted boxes (stable ids if possible). Topology follows ink, not the last beautify.

**Loopholes**

- Points discarded after first convert → **cannot** start from the sketch. This will be the default implementation unless you keep ink. Then this item FAILS.
- New ids break edges; “keep the names” is labels, not ids — kernel must remap `from`/`to`.
- ELK tidy after convert throws away sketch placement. Default: pin from ink bbox, no tidy.
- Adjacent to refused whole-board generation; allowed only because ink is user geometry.

### 71 Make another version next to this, don't overwrite

**FAILS.** One board, one id namespace. Cloning `api` without a suffix collides. Inventing pins “to the right” is coordinate emission.

Not in schema: `variants[]`, `boards[]`, or `duplicate` pass.

**Required YAML**

```yaml
passes:
  - { type: duplicate, side: right, idSuffix: _v2, freezeSource: true }
```

Kernel copies nodes/edges/groups, prefixes ids, places the clone as a **group** to the right of the source AABB. Agent does not list new `x,y`.

**Loopholes**

- Duplicate-in-place then `place` each node — compound, easy to overwrite.
- Clone shares ids → overwrite (the thing the user forbade).
- SPOF/path/legend after clone: two APIs. Answer mode must scope to a variant or the user is lost.
- “Next to this” with a selection of one node: clone the board or the selection? Utterance says “version” of the diagram → whole board. Selection-only clone is a different product.

### 72 Wait wait the Kafka thing—undo the last bit only

**FAILS** with snapshot-per-turn history. A compound turn (76 beautify + 48 kafka size + 57 palette) is one snapshot. Restoring it undoes the non-Kafka bits. There is no `passes[-1]` addressing in the file after the kernel **clears** passes.

Needs an **op journal** (hunks: `nodes.kafka_l.size`, `board.palette`, …) and undo of the last hunk whose target matches Kafka, or the last hunk if it was the Kafka edit.

**Loopholes**

- Undo last **turn** (68) is not “last bit”.
- Agent sets `kafka_l` back from memory and leaves a wrong sibling Kafka (`kafka_r`) that was also touched.
- Passes already cleared — nothing in YAML to “delete the last pass”.
- Whisper split: “wait wait” as its own turn with empty mutation, then “the Kafka thing” as a new targeting command that **edits** instead of undoing.

---

## Messy voice 73–76

### 73 okay so like uh make the db look like a db and shove redis in front of it

**WORKS_IF** unique datastore, insert-on-path exists, and `place` uses `board.flow` for “in front” (LTR → `side: left` of db). Filler words are the LLM’s problem; they are not a schema problem.

```yaml
nodes:
  db:
    kind: datastore
    shape: cylinder
    icon: postgres
    label: PostgreSQL
  redis:
    kind: datastore
    label: Redis
    icon: redis
    shape: rectangle
    size: md
    style: clean
    # no pin
edges:
  api_db: null
  api_redis: { from: api, to: redis, label: "", kind: sync, route: ortho }
  redis_db:  { from: redis, to: db,  label: "", kind: sync, route: ortho }
constraints:
  - { op: place, node: redis, side: left, of: db }
```

Better (if added): `passes: [{ type: insert, node: redis, before: db, onEdgesTo: db }]`.

**Loopholes**

- Compound: restyle db **and** insert redis. Doing only the cylinder is a miss; doing only redis leaves a rectangle “db”.
- Add redis **without** deleting `api→db` (parallel edge). Insert-on-path is the documented loophole.
- “In front” vs `above` if flow is top-to-bottom. Must read `board.flow`, not invent `y`.
- Pinning redis with made-up `x,y`.
- Touching Kafka (see 74).

### 74 no no leave kafka, I said the database

**WORKS_IF** host undoes the last mutation that targeted Kafka, then reapplies that op to `db`. Agent must not only `nodes.kafka_l.locked: true` (that **leaves the damage**).

Sequence: journal undo hunk(s) whose ids are Kafka → replay on `db`.

**Loopholes**

- Selection still Kafka: utterance retarget **must** beat selection.
- Locking Kafka and restyling db → Kafka stays in the wrong size/icon from 48/73.
- No journal → FAILS (same class as 72).
- Two Kafkas: “leave kafka” means both, not “leave the left one”.

### 75 this—taps—is the user, stick figure is fine actually just label it Client

**WORKS_IF** the tap is in `selection[]` (host pointer). Transcript “this is the user” without a tap FAILS (deixis).

```yaml
selection: [client]   # from tap
nodes:
  client:
    kind: actor
    shape: actor
    label: Client
    style: sketch      # stick figure is fine — do not AWS-person this
```

**Loopholes**

- Whisper drops the tap; only “this is the user” → wrong node if selection empty.
- Beautify/AWS palette upgrades stick figure to an official person icon against “stick figure is fine”.
- Label `Client` vs id `client` — id stays host-minted.

### 76 can you just… you know… architecture-ify it

**WORKS_IF** `beautify` is a **closed recipe**: snap shapes, stencil from existing kind/icon, orthogonalize routes, min-gap, `style: clean`, convert `ink.convert: auto`. `freezeTopology: true`. **No new nodes** (no Redis, no VPC, no legend, no AWS unless `palette` is already `aws`).

```yaml
passes:
  - { type: beautify, scope: board, freezeTopology: true }
```

**Loopholes**

- Unbounded “make it architecture”: 3-tier AWS, caches, numbered paths, official icons, legend — this utterance is not 57–59, 64, 65, 73.
- Scope: “it” = the board, not a random selection. If something is selected, still default **board** unless 67-style “just the selected one” was said.
- `tidy-layout` / ELK as part of beautify **moves** everything — user sketch positions die. Prefer pin-preserving snap/min-gap.
- Running 76 after 75 must not replace the stick figure (respect `style: sketch` on locked or recently labeled actors) — otherwise 75 is a lie.

---

## Global loopholes (fail closed)

1. **No vision.** `blue`, `left`, `this`, `that`, `those two`, `the thing I just drew`, `taps` are host problems (`selection`, `lastDrawn`, pointer, optional `rel` projection). The file has no eyes. Guessing is a FAIL, not a WORKS_IF with a shrug.
2. **Do not add color to the schema to pass 54.** It becomes a fake vision API and still fails on “looks blue” ink.
3. **Do not let the agent read `pin.x` to pass 53.** That is coordinates on the inbound path.
4. **Questions are a different tool.** One-channel YAML editing will mutate 62–66. Test: hash unchanged.
5. **Undo is not a YAML field.** Snapshots pass 68; they fail 72 and often 67/74. Journal hunks or admit FAILS.
6. **One board.** 71 is a product hole, not a prompt-engineering hole.
7. **Compound turns** (73, 61, 49, 74) need one atomic kernel recipe. Two half-edits look like WORKS in a demo and fail in review.
8. **Hallucination surfaces:** `edges.label` protocols (55), path numbers (59), AWS icon keys (57), SPOF/cache/3-tier answers that add topology (62–65).
9. **Shipped Command JSON** (`perfect|align|…`) cannot represent merge, reverse-edge, palette, legend, variants, answer-only, or insert-on-path. Do not stretch `connect` / `bigger` to this cluster.

---

## What “done” would mean for this band

Before claiming the YAML canvas handles 48–76:

- Validator rejects agent-written coordinates and ink points.
- Host injects `selection[]`, pointer taps, and last-drawn node ids.
- Kernel `place`/`equalize`/`insert`/`merge`/`duplicate`/`annotate-path`/`restyle`/`legend` exist or the matching rows stay FAILS.
- Answer mode has tests that the file is byte-identical after 62–66.
- Journal can undo “the Kafka bit” without rolling the whole board.
- Fixtures include **two Kafkas**, a misspelled Postgres, an unlabeled neighbor, and a just-drawn ink stroke — the happy-path single-Kafka demo cheats 48, 50, 53, 54.
