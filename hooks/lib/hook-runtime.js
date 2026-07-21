// hooks/lib/hook-runtime.js
// @ai-rules:
// 1. [Constraint]: CommonJS only — no ESM imports. Required by the Node hook runner.
// 2. [Pattern]: Return null on missing/corrupt files — never throw. Callers check for null.
// 3. [Constraint]: No external dependencies — built-ins only (path, fs, os).
// 4. [Gotcha]: readGedeonFile accepts a relative path — all call sites must use string literals until a containment guard is added.
// Shared stdin reader, pipeline-state loader, session-pointer writer, and Gedeon home utilities for all gc-* hooks.
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const STATE_RELATIVE = path.join('.claude', 'gc-pipeline.json');

function readStdin(timeoutMs = 5000) {
  return new Promise(resolve => {
    let input = '';
    const t = setTimeout(() => resolve(null), timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { input += c; });
    process.stdin.on('end', () => {
      clearTimeout(t);
      try { resolve(JSON.parse(input || '{}')); } catch { resolve({}); }
    });
  });
}

function loadPipelineState(cwd) {
  const stateFile = path.resolve(cwd, STATE_RELATIVE);
  if (process.env.GC_DEBUG) {
    process.stderr.write(`[gc] checking state: ${stateFile}\n`);
  }
  if (!fs.existsSync(stateFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (e) {
    process.stderr.write(`[gedeon-construct] corrupt pipeline state: ${e.message}\n`);
    return null;
  }
}

function gedeonHome() {
  return path.join(os.homedir(), '.claude', 'gedeon');
}

function readGedeonFile(relPath) {
  const full = path.join(gedeonHome(), relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function readAgentFile(cwd, name) {
  const full = path.resolve(cwd, 'agents', `${name}.md`);
  if (!fs.existsSync(full)) return null;
  try {
    let raw = fs.readFileSync(full, 'utf8');
    raw = raw.replace(/^﻿/, '');             // strip BOM
    raw = raw.replace(/\r\n/g, '\n');               // normalize CRLF
    const noFm = raw.replace(/^---[\s\S]*?---\n/, '');
    return noFm.replace(/^\n*(\/\/[^\n]*\n)+\n?/, '').trim();
  } catch { return null; }
}

function parseMarkdownSection(content, headingName) {
  const escaped = headingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(regex);
  return match ? match[1].trim() : '';
}

function readConstructSection(cwd, sectionName) {
  const stateFile = path.resolve(cwd, '.construct', 'STATE.md');
  if (!fs.existsSync(stateFile)) return '';
  try {
    const content = fs.readFileSync(stateFile, 'utf8');
    return parseMarkdownSection(content, sectionName);
  } catch { return ''; }
}

function parseErrorCounts(section) {
  const counts = {};
  for (const line of section.split('\n')) {
    const match = line.trim().match(/^(\S+):\s*(\d+)$/);
    if (match) counts[match[1]] = parseInt(match[2], 10);
  }
  return counts;
}

function serializeErrorCounts(counts) {
  return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function writeSessionPointer(cwd, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return;
  try {
    if (!fs.existsSync(path.resolve(cwd, '.construct'))) return;
    const dir = path.resolve(cwd, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'gc-session.json'),
      JSON.stringify({ sessionId }) + '\n');
  } catch (e) {
    process.stderr.write(`[gedeon-construct] session-pointer write failed: ${e.message}\n`);
  }
}

module.exports = {
  readStdin,
  loadPipelineState,
  gedeonHome,
  readGedeonFile,
  readAgentFile,
  parseMarkdownSection,
  readConstructSection,
  parseErrorCounts,
  serializeErrorCounts,
  writeSessionPointer,
};
