// setup.js — run once after installing The Gedeon Construct.
// Copies skills and agents, merges hooks into ~/.claude/settings.json,
// seeds ~/.claude/gedeon/ home tree.
// Usage: node setup.js
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { atomicWrite } = require('./hooks/lib/atomic-write');

const ROOT       = __dirname;
const HOME       = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const GC_HOME    = path.join(CLAUDE_DIR, 'gedeon');
const toHookPath = name => path.join(ROOT, 'hooks', name).replace(/\\/g, '/');
const tilde      = p => p.replace(HOME, '~');

// ── 1. Copy skills ────────────────────────────────────────────────────────────
const skillsSrc  = path.join(ROOT, 'skills');
const skillsDest = path.join(CLAUDE_DIR, 'skills');
if (fs.existsSync(skillsSrc)) {
  fs.mkdirSync(skillsDest, { recursive: true });
  for (const entry of fs.readdirSync(skillsSrc)) {
    const src  = path.join(skillsSrc, entry);
    const dest = path.join(skillsDest, entry);
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, dest, { recursive: true });
  }
}

// ── 2. Copy agents ────────────────────────────────────────────────────────────
const agentsSrc  = path.join(ROOT, 'agents');
const agentsDest = path.join(CLAUDE_DIR, 'agents');
if (fs.existsSync(agentsSrc)) {
  fs.mkdirSync(agentsDest, { recursive: true });
  for (const entry of fs.readdirSync(agentsSrc)) {
    const src  = path.join(agentsSrc, entry);
    const dest = path.join(agentsDest, entry);
    fs.copyFileSync(src, dest);
  }
}

// ── 3. Copy tools ────────────────────────────────────────────────────────────
// filter excludes dotfiles (e.g. tools/llm-bridge/.quota-state.json, a gitignored, dev-local
// runtime-generated file with real quota data — round 1 preflight finding, 2026-07-24: the
// unfiltered recursive copy would leak it into every global install) — source code never
// starts with '.', so this is a safe, future-proof exclusion, not a name-specific one-off.
const toolsSrc  = path.join(ROOT, 'tools');
const toolsDest = path.join(CLAUDE_DIR, 'tools');
if (fs.existsSync(toolsSrc)) {
  fs.mkdirSync(toolsDest, { recursive: true });
  for (const entry of fs.readdirSync(toolsSrc)) {
    const src  = path.join(toolsSrc, entry);
    const dest = path.join(toolsDest, entry);
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, {
        recursive: true,
        filter: (srcPath) => !path.basename(srcPath).startsWith('.'),
      });
    }
  }
}

// ── 4. Merge hooks into ~/.claude/settings.json ───────────────────────────────
// Each hook group is tagged with "id": "gedeon-construct" as a marker.
// On reinstall: entries with that id are replaced. Other hooks are untouched.
const HOOK_ID = 'gedeon-construct';
const gcHooks = {
  SessionStart: [
    { id: HOOK_ID,
      hooks: [{ type: 'command', command: `node "${toHookPath('gc-session-start.js')}"` }] }
  ],
  PreToolUse: [
    { id: HOOK_ID, matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: `node "${toHookPath('gc-pre-write-guard.js')}"`, timeout: 5 }] }
  ],
  Stop: [
    { id: HOOK_ID,
      hooks: [{ type: 'command', command: `node "${toHookPath('gc-stop-reminder.js')}"` }] }
  ],
  UserPromptSubmit: [
    { id: HOOK_ID,
      hooks: [{ type: 'command', command: `node "${toHookPath('gc-ui-intent-hook.js')}"`, timeout: 5 }] }
  ],
};

const globalSettings = path.join(CLAUDE_DIR, 'settings.json');
let existing = {};
if (fs.existsSync(globalSettings)) {
  try { existing = JSON.parse(fs.readFileSync(globalSettings, 'utf8')); } catch (_) {}
}

// Merge hooks
if (!existing.hooks) existing.hooks = {};
for (const [event, entries] of Object.entries(gcHooks)) {
  if (!existing.hooks[event]) existing.hooks[event] = [];
  // Remove any previous gedeon-construct entries, then append fresh ones
  existing.hooks[event] = existing.hooks[event].filter(e => e.id !== HOOK_ID);
  existing.hooks[event].push(...entries);
}

// Merge permissions — scoped to the exact skill folders this package ships,
// not a gc-* wildcard (which could also match an unrelated dropped-in folder)
const toPermPath = p => process.platform === 'win32'
  ? p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
  : p;
const installedSkillNames = fs.existsSync(skillsSrc)
  ? fs.readdirSync(skillsSrc).filter(e => fs.statSync(path.join(skillsSrc, e)).isDirectory())
  : [];
const gcPerms = [
  ...installedSkillNames.flatMap(name => [
    `Edit(${toPermPath(skillsDest)}/${name}/**)`,
    `Write(${toPermPath(skillsDest)}/${name}/**)`,
  ]),
  `Write(${toPermPath(GC_HOME)}/**)`,
];
if (!existing.permissions) existing.permissions = {};
if (!existing.permissions.allow) existing.permissions.allow = [];
for (const p of gcPerms) {
  if (!existing.permissions.allow.includes(p)) existing.permissions.allow.push(p);
}

fs.mkdirSync(CLAUDE_DIR, { recursive: true });
fs.writeFileSync(globalSettings, JSON.stringify(existing, null, 2) + '\n');

// ── 5. Seed ~/.claude/gedeon/ home tree ───────────────────────────────────────
for (const dir of ['user', 'projects', 'plans'].map(d => path.join(GC_HOME, d))) {
  fs.mkdirSync(dir, { recursive: true });
}
const seeds = [
  { file: path.join(GC_HOME, 'user', 'memory.md'),
    content: '# User Preferences\n<!-- gc-eop and gc-correct append here. gc-bootstrap reads this. -->\n' },
  { file: path.join(GC_HOME, 'projects', 'index.json'), content: '[]\n' },
];
for (const s of seeds) {
  if (!fs.existsSync(s.file)) fs.writeFileSync(s.file, s.content, 'utf8');
}

// config.json is refreshed on every run (read-merge-write), not write-once-if-absent:
// packagePath/version must stay current across a `git pull` + re-run, while installedAt
// and any fields a later /gc-update run persists (e.g. lastUpdateCheckAt) survive.
const configFile = path.join(GC_HOME, 'config.json');
let existingConfig = {};
if (fs.existsSync(configFile)) {
  try { existingConfig = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { existingConfig = {}; }
}
const { version } = require('./package.json');
const configContent = JSON.stringify({
  ...existingConfig,
  installedAt: existingConfig.installedAt || new Date().toISOString(),
  packagePath: ROOT,
  version,
}, null, 2) + '\n';
atomicWrite(configFile, configContent);

// ── 6. Report ─────────────────────────────────────────────────────────────────
const skillCount = fs.existsSync(skillsSrc)
  ? fs.readdirSync(skillsSrc).filter(e => fs.statSync(path.join(skillsSrc, e)).isDirectory()).length : 0;
const agentCount = fs.existsSync(agentsSrc)
  ? fs.readdirSync(agentsSrc).filter(e => e.endsWith('.md')).length : 0;
const toolsCount = fs.existsSync(toolsSrc)
  ? fs.readdirSync(toolsSrc).filter(e => fs.statSync(path.join(toolsSrc, e)).isDirectory()).length : 0;
const hookCount  = Object.values(gcHooks).reduce((n, arr) => n + arr.length, 0);

console.log('');
console.log('The Gedeon Construct -- installation complete.');
console.log(`  Skills:      ${String(skillCount).padStart(2)}  ->  ${tilde(skillsDest)}`);
console.log(`  Agents:      ${String(agentCount).padStart(2)}  ->  ${tilde(agentsDest)}`);
console.log(`  Tools:       ${String(toolsCount).padStart(2)}  ->  ${tilde(toolsDest)}`);
console.log(`  Hooks:       ${String(hookCount).padStart(2)}  ->  ${tilde(globalSettings)}`);
console.log(`  Permissions: ${String(gcPerms.length).padStart(2)}  ->  ${tilde(globalSettings)} (gc-* skills + gedeon home)`);
console.log(`  Gedeon home:      ${tilde(GC_HOME)}`);
console.log('');
console.log('===========================================================');
console.log('');
console.log('  Run /gc-init in Claude Code to meet Gedeon.');
console.log('');
console.log('  He will introduce himself and learn what');
console.log('  you would like him to call you.');
console.log('');
console.log('  (Optional: all skills are active without /gc-init)');
console.log('');
console.log('===========================================================');
console.log('');
console.log('All gc-* skills are active in your Claude Code session.');
console.log('Core pipeline:');
console.log('');
console.log('  /gc-bootstrap  ->  scan workspace, clarify intent');
console.log('  /gc-discuss    ->  (optional) elicit requirements');
console.log('  /gc-plan       ->  evidence-based implementation plan');
console.log('  /gc-preflight  ->  parallel audit, binary mechanical Gate (PASS/STOP)');
console.log('  /gc-execute    ->  wave-based execution, closed-loop verify');
console.log('  /gc-review     ->  multi-reviewer panel, pessimistic merge');
console.log('  /gc-eop        ->  learnings, session digest, close');
console.log('');
console.log('Specialist:  /gc-cynefin  /gc-brainstorm  /gc-probe  /gc-debug  /gc-lean  /gc-shebang  /gc-uiux  /gc-uiux-review');
console.log('Project:     /gc-morning  /gc-resume  /gc-status  /gc-progress  /gc-ship');
console.log('');
console.log('More info: https://github.com/moosison/gedeon-construct');
console.log('');
