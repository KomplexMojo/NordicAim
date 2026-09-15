export const meta = {
  name: 'run-milestones',
  description: 'Advance the MVP milestone plan: pick the next ready milestone, implement it at its model/effort, independent review with up to 2 fix rounds, then commit and push; stops at owner gates, blocking questions or repeated review failure',
  whenToUse: 'Implementing docs/milestones for advanced-shooting-analysis. args: { mode?: "run" | "step" (default run), maxMilestones?: number, only?: "M03", dryRun?: boolean }',
  phases: [
    { title: 'Select', detail: 'read docs/milestones/README.md and pick the next ready milestone' },
    { title: 'Implement', detail: 'milestone-implementer at the milestone model/effort' },
    { title: 'Review', detail: 'milestone-reviewer at the milestone model/effort; up to 2 fix rounds' },
    { title: 'Finalize', detail: 'record owner checks, update status, commit and push' },
  ],
}

const MODEL_NAMES = { sonnet: 'Claude Sonnet 5', opus: 'Claude Opus 5', haiku: 'Claude Haiku 4.5', fable: 'Claude Fable 5.1' }
const MODELS = ['sonnet', 'opus', 'haiku', 'fable']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const CMD = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    result: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    note: { type: 'string' },
  },
  required: ['command', 'result'],
}

const SELECT_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    id: { type: 'string' },
    title: { type: 'string' },
    file: { type: 'string' },
    status: { type: 'string' },
    implementerModel: { type: 'string', enum: MODELS },
    implementerEffort: { type: 'string', enum: EFFORTS },
    reviewerModel: { type: 'string', enum: MODELS },
    reviewerEffort: { type: 'string', enum: EFFORTS },
    ownerGate: { type: 'boolean' },
    workingTreeClean: { type: 'boolean' },
    dirtyFiles: { type: 'array', items: { type: 'string' } },
    pendingCount: { type: 'integer' },
    blocked: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['found', 'reason', 'pendingCount', 'workingTreeClean'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['complete', 'blocked'] },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    commandsRun: { type: 'array', items: CMD },
    humanChecks: { type: 'array', items: { type: 'string' } },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, blocking: { type: 'boolean' } },
        required: ['question', 'blocking'],
      },
    },
    blockedReason: { type: 'string' },
  },
  required: ['status', 'summary', 'filesChanged', 'commandsRun', 'humanChecks', 'openQuestions'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file: { type: 'string' },
          detail: { type: 'string' },
          expected: { type: 'string' },
        },
        required: ['severity', 'detail', 'expected'],
      },
    },
    commandsRun: { type: 'array', items: CMD },
    humanChecks: { type: 'array', items: { type: 'string' } },
    blockingOpenQuestions: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['verdict', 'issues', 'commandsRun', 'humanChecks', 'blockingOpenQuestions', 'summary'],
}

const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    committed: { type: 'boolean' },
    pushed: { type: 'boolean' },
    commitSha: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['committed', 'pushed', 'note'],
}

const uniq = (list) => [...new Set(list)]

// Fallback instructions, used only when the custom agent types in .claude/agents/ are not loaded
// (agent definitions are read at session start, so a session that created them cannot use them yet).
// Keep these in sync with .claude/agents/milestone-implementer.md and milestone-reviewer.md.
const IMPLEMENTER_INSTRUCTIONS = [
  'ROLE: milestone implementer for advanced-shooting-analysis. You implement ONE milestone.',
  '- Read the milestone file completely, then only the spec sections under "Read first". AGENTS.md rules and hard invariants apply in full.',
  '- Implement every step and file with the exact names, signatures, paths and formats from the specs. Never invent constants; if the spec is silent or ambiguous, add it to the milestone "Open questions" and report it.',
  '- Write every listed test and a unit test for every spec test vector the milestone touches (exact values and tolerances).',
  '- Run `pnpm check` (once M01 created it) and every Acceptance command that does not need a human; fix failures.',
  '- Fill the milestone "Completion notes" truthfully (commands, results, deviations).',
  '- ORCHESTRATION OVERRIDES: do NOT commit, push, or set Status to "done"; do NOT perform human-required steps (return them as concrete humanChecks); nothing from docs/BACKLOG.md; no unrelated refactors or unapproved dependencies.',
  '- If you cannot complete the milestone at all, return status "blocked" with a specific reason.',
].join('\n')

const REVIEWER_INSTRUCTIONS = [
  'ROLE: independent, skeptical milestone reviewer for advanced-shooting-analysis. STRICTLY READ-ONLY: never create, edit or delete files (running tests/commands is fine). The implementer report is a claim, not evidence.',
  'Checklist:',
  '1. `git status` / `git diff` including untracked files; nothing under fixtures/private/.',
  '2. Every milestone step and file exists; names, signatures, paths, store names, routes and string formats match the specs exactly.',
  '3. Every spec test vector the milestone touches has a unit test with the exact expected value and tolerance; spot-check at least three against the spec.',
  '4. Run `pnpm check` and every Acceptance command that does not need a human; record results.',
  '5. AGENTS.md invariants: no backlog features, no runtime network calls, share rule, repo privacy, pure/adapter split, IndexedDB transaction rule, never overwrite manual edits, mm units with +y up, determinism, fake camera and test hooks gated by VITE_FAKE_CAMERA.',
  '6. Scope: nothing out of scope, no unrelated refactors, no unapproved dependencies. 7. Completion notes match what you observed.',
  'Verdict "pass" only with no blocker/major issues and all runnable acceptance commands passing. For each issue give severity, file, detail and expected behaviour with the spec reference.',
].join('\n')

let customAgentTypesAvailable = true

async function runAgent(agentType, fallbackInstructions, prompt, opts) {
  if (customAgentTypesAvailable) {
    try {
      return await agent(prompt, { ...opts, agentType })
    } catch (err) {
      const message = String((err && err.message) || err)
      if (!message.includes('not found')) throw err
      customAgentTypesAvailable = false
      log(`custom agent type ${agentType} is not loaded in this session; using built-in agents with embedded instructions`)
    }
  }
  return await agent(`${fallbackInstructions}\n\n---\n\n${prompt}`, opts)
}

function selectPrompt(only) {
  return [
    'You are the selector for the run-milestones workflow in the advanced-shooting-analysis repo. Do not modify any file.',
    '1. Read docs/milestones/README.md and parse the milestone table columns: ID (with a link to the milestone file), Milestone, MVP step, Depends on, Implementer ("<model> · <effort>"), Reviewer ("<model> · <effort>"), Owner gate ("yes"/"no"), Status.',
    '2. A milestone is READY when its Status is exactly "pending" or "in-progress" and every ID in its "Depends on" column has Status exactly "done".',
    only
      ? `3. Only consider ${only}. If it is not READY, return found=false and explain why in reason.`
      : '3. If any READY milestone is "in-progress", choose it (resume). Otherwise choose the READY milestone with the lowest number.',
    '4. Run `git status --porcelain`. workingTreeClean = output is empty; dirtyFiles = the listed paths.',
    '5. pendingCount = number of milestones whose Status is not "done". blocked = IDs whose Status starts with "blocked".',
    'Return found, id, title, file (repo-relative path from the table link, e.g. docs/milestones/M03-scoring-engine.md), status, implementerModel, implementerEffort, reviewerModel, reviewerEffort, ownerGate, workingTreeClean, dirtyFiles, pendingCount, blocked, and a one-sentence reason.',
  ].join('\n')
}

function implementPrompt(sel) {
  return [
    `Implement milestone ${sel.id} (${sel.title}). Milestone file: ${sel.file}.`,
    'Follow your agent instructions and AGENTS.md. Orchestration overrides apply: do NOT commit, push, or set Status to "done".',
    sel.status === 'in-progress'
      ? 'This milestone was started in an earlier run: inspect `git status` and `git diff` and continue from the current working tree.'
      : 'The working tree is clean; start by setting the Status to "in-progress" in docs/milestones/README.md.',
    'Run `pnpm check` (once it exists) and every Acceptance command that does not need a human, and fix failures.',
    'Return human-required steps as concrete humanChecks items, fill Completion notes, and report open questions (blocking only if later milestones cannot proceed correctly).',
  ].join('\n')
}

function reviewPrompt(sel, impl, round) {
  return [
    `Independently review milestone ${sel.id} (${sel.title}). Milestone file: ${sel.file}. Review round ${round}.`,
    'The implementer reported the following. These are claims to verify, not evidence:',
    JSON.stringify({ summary: impl.summary, filesChanged: impl.filesChanged, commandsRun: impl.commandsRun }, null, 2),
    'Follow your reviewer checklist: inspect git status/diff (including untracked files), compare against the milestone and its Read-first specs, verify test vectors, run `pnpm check` and every non-human Acceptance command yourself, check AGENTS.md invariants and scope, and confirm Completion notes are truthful.',
    'verdict = "pass" only if there are no blocker or major issues and every runnable acceptance command passes. Do not edit files.',
  ].join('\n')
}

function fixPrompt(sel, review, round) {
  return [
    `Fix round ${round} for milestone ${sel.id} (${sel.title}). Milestone file: ${sel.file}.`,
    'An independent reviewer found these issues:',
    JSON.stringify(review.issues, null, 2),
    'Reviewer command results:',
    JSON.stringify(review.commandsRun, null, 2),
    'Fix every blocker and major issue (minor ones where cheap) within the milestone scope. Orchestration overrides still apply: do NOT commit, push, or mark done.',
    'Re-run `pnpm check` and the Acceptance commands, update Completion notes, and return the same fields as before.',
  ].join('\n')
}

function finalizePrompt(sel, impl, humanChecks, blockingQuestions) {
  const statusText = blockingQuestions.length
    ? `"blocked: ${blockingQuestions[0].slice(0, 80).replace(/"/g, "'")}"`
    : '"done"'
  const trailer = MODEL_NAMES[sel.implementerModel] || 'Claude'
  return [
    `Finalize milestone ${sel.id} (${sel.title}); its independent review passed.`,
    '1. Run `git status --porcelain`. If any path is under fixtures/private/, stop and return committed=false. If `pnpm check:privacy` exists, run it; if it fails, return committed=false.',
    `2. In docs/milestones/README.md set the Status of ${sel.id} to ${statusText}. Change nothing else in that table.`,
    humanChecks.length
      ? `3. Append a section "## ${sel.id} — ${sel.title}" to docs/milestones/OWNER-CHECKS.md with one "- [ ] " checkbox per owner action. The raw items below come from both the implementer and the reviewer and often repeat each other: MERGE duplicates into a short, ordered, plain-language checklist (usually 3–6 items), keeping every distinct action and any exact URLs, file paths and check names.\nRaw items:\n${humanChecks.map((h) => `- ${h}`).join('\n')}\n`
      : '3. No owner checks to record for this milestone.',
    '4. Run `git add -A`, then commit with exactly this message (replace the summary placeholder with one or two sentences based on the summary below):',
    '',
    `${sel.id}: ${sel.title}`,
    '',
    '<summary>',
    '',
    `Co-Authored-By: ${trailer} <noreply@anthropic.com>`,
    '',
    `Implementer summary: ${impl.summary}`,
    '5. Run `git push origin main`.',
    'Return committed, pushed, commitSha (short SHA), and a note describing anything unusual.',
  ].join('\n')
}

const opts = args || {}
const mode = opts.mode === 'step' ? 'step' : 'run'
const maxMilestones = Number.isInteger(opts.maxMilestones) ? opts.maxMilestones : mode === 'step' ? 1 : 15
const results = []
let stopReason = `reached maxMilestones (${maxMilestones})`

for (let i = 0; i < maxMilestones; i++) {
  phase('Select')
  const sel = await agent(selectPrompt(opts.only), {
    label: `select #${i + 1}`,
    phase: 'Select',
    model: 'sonnet',
    effort: 'low',
    schema: SELECT_SCHEMA,
  })
  if (!sel) { stopReason = 'selector agent did not return'; break }
  if (!sel.found) {
    stopReason = sel.pendingCount === 0 ? 'all milestones are done' : `no ready milestone: ${sel.reason}`
    break
  }
  if (!sel.implementerModel || !sel.implementerEffort || !sel.reviewerModel || !sel.reviewerEffort) {
    stopReason = `${sel.id}: model/effort columns missing in the milestone index`
    break
  }
  if (!sel.workingTreeClean && sel.status !== 'in-progress') {
    stopReason = `working tree not clean before starting ${sel.id}: ${(sel.dirtyFiles || []).join(', ')}`
    break
  }

  const plan = `${sel.id} ${sel.title} — implementer ${sel.implementerModel}/${sel.implementerEffort}, reviewer ${sel.reviewerModel}/${sel.reviewerEffort}${sel.ownerGate ? ', owner gate' : ''}`
  log(plan)
  if (opts.dryRun) {
    results.push({ id: sel.id, dryRun: true, plan, status: sel.status, pendingCount: sel.pendingCount })
    stopReason = 'dry run: selection only'
    break
  }

  const rec = { id: sel.id, title: sel.title, reviewRounds: 0, fixRounds: 0, humanChecks: [], openQuestions: [] }

  phase('Implement')
  let impl = await runAgent('milestone-implementer', IMPLEMENTER_INSTRUCTIONS, implementPrompt(sel), {
    label: `implement ${sel.id}`,
    phase: 'Implement',
    model: sel.implementerModel,
    effort: sel.implementerEffort,
    schema: IMPL_SCHEMA,
  })
  if (!impl) { stopReason = `${sel.id}: implementer did not return`; results.push(rec); break }
  if (impl.status === 'blocked') {
    rec.blocked = impl.blockedReason || 'no reason given'
    stopReason = `${sel.id} blocked: ${rec.blocked}`
    results.push(rec)
    break
  }

  let review = null
  for (;;) {
    rec.reviewRounds++
    phase('Review')
    review = await runAgent('milestone-reviewer', REVIEWER_INSTRUCTIONS, reviewPrompt(sel, impl, rec.reviewRounds), {
      label: `review ${sel.id} (round ${rec.reviewRounds})`,
      phase: 'Review',
      model: sel.reviewerModel,
      effort: sel.reviewerEffort,
      schema: REVIEW_SCHEMA,
    })
    if (!review || review.verdict === 'pass' || rec.fixRounds >= 2) break
    rec.fixRounds++
    phase('Implement')
    impl = await runAgent('milestone-implementer', IMPLEMENTER_INSTRUCTIONS, fixPrompt(sel, review, rec.fixRounds), {
      label: `fix ${sel.id} (round ${rec.fixRounds})`,
      phase: 'Implement',
      model: sel.implementerModel,
      effort: sel.implementerEffort,
      schema: IMPL_SCHEMA,
    })
    if (!impl || impl.status === 'blocked') break
  }

  if (!impl || impl.status === 'blocked') {
    rec.blocked = impl ? impl.blockedReason : 'implementer did not return during fixes'
    stopReason = `${sel.id} blocked during fixes: ${rec.blocked}`
    results.push(rec)
    break
  }
  if (!review || review.verdict !== 'pass') {
    rec.lastReview = review
    stopReason = `${sel.id}: review did not pass after ${rec.fixRounds} fix round(s); see lastReview issues`
    results.push(rec)
    break
  }

  rec.humanChecks = uniq([...(impl.humanChecks || []), ...(review.humanChecks || [])])
  rec.openQuestions = impl.openQuestions || []
  const blockingQuestions = uniq([
    ...(review.blockingOpenQuestions || []),
    ...rec.openQuestions.filter((q) => q.blocking).map((q) => q.question),
  ])

  phase('Finalize')
  const fin = await agent(finalizePrompt(sel, impl, rec.humanChecks, blockingQuestions), {
    label: `finalize ${sel.id}`,
    phase: 'Finalize',
    model: 'sonnet',
    effort: 'low',
    schema: FINAL_SCHEMA,
  })
  rec.commit = fin
  results.push(rec)
  if (!fin || !fin.committed) { stopReason = `${sel.id}: commit failed${fin ? `: ${fin.note}` : ''}`; break }
  if (!fin.pushed) { stopReason = `${sel.id}: committed ${fin.commitSha || ''} but push failed: ${fin.note}`; break }
  log(`${sel.id} committed ${fin.commitSha || ''} (reviews: ${rec.reviewRounds}, fixes: ${rec.fixRounds})`)

  if (blockingQuestions.length) {
    stopReason = `${sel.id}: blocking open question(s) need the owner: ${blockingQuestions.join(' | ')}`
    break
  }
  if (sel.ownerGate) {
    stopReason = `${sel.id} is an owner gate: complete its items in docs/milestones/OWNER-CHECKS.md, then start the workflow again`
    break
  }
  if (mode === 'step' || opts.only) {
    stopReason = opts.only ? `only ${opts.only} requested` : 'step mode: one milestone completed'
    break
  }
}

return { mode, stopReason, results }
