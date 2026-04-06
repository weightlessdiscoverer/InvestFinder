#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const REPORT_PATH = path.join(PROJECT_ROOT, 'quality-report.txt');
const ANALYZED_ROOTS = ['server.js', 'src', 'public'];

const COVERAGE_THRESHOLDS = {
  statements: 80,
  branches: 70,
  functions: 80,
  lines: 80,
};

function nowIso() {
  return new Date().toISOString();
}

function rel(p) {
  return path.relative(PROJECT_ROOT, p).replace(/\\/g, '/');
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
}

function listFilesRecursive(rootDir, matcher) {
  const out = [];

  function walk(curr) {
    let entries;
    try {
      entries = fs.readdirSync(curr, { withFileTypes: true });
    } catch (_err) {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      const fullPath = path.join(curr, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (matcher(fullPath)) {
        out.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return out.sort();
}

function toLineNumber(content, index) {
  if (index < 0) return 1;
  const snippet = content.slice(0, index);
  return snippet.split('\n').length;
}

function statusForPercentage(value, warnThreshold) {
  if (value == null || Number.isNaN(value)) return 'KRITISCH';
  if (value < 50) return 'KRITISCH';
  if (value < warnThreshold) return 'WARNUNG';
  return 'OK';
}

function severityRank(severity) {
  const rank = { KRITISCH: 0, WARNUNG: 1, INFO: 2 };
  return rank[severity] ?? 3;
}

function stripJsCommentsKeepLines(code) {
  let out = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        out += '\n';
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        out += '  ';
        i += 2;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (inSingle && ch === "'") {
        inSingle = false;
      } else if (inDouble && ch === '"') {
        inDouble = false;
      } else if (inTemplate && ch === '`') {
        inTemplate = false;
      }
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      out += '  ';
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      out += '  ';
      i += 2;
      continue;
    }

    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inTemplate = true;

    out += ch;
    i += 1;
  }

  return out;
}

function computeFileMetrics(filePath, code) {
  const lines = code.split(/\r?\n/);
  const loc = lines.length;
  const codeNoComments = stripJsCommentsKeepLines(code);
  const sloc = codeNoComments
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .length;

  const functionRegexes = [
    /\bfunction\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(/g,
    /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*function\b/g,
  ];

  let functionCount = 0;
  for (const rgx of functionRegexes) {
    const m = code.match(rgx);
    functionCount += m ? m.length : 0;
  }

  const todoRegex = /(TODO|FIXME)/g;
  const todoDetails = [];
  let t;
  while ((t = todoRegex.exec(code)) !== null) {
    todoDetails.push({
      tag: t[1],
      line: toLineNumber(code, t.index),
    });
  }

  return {
    file: rel(filePath),
    loc,
    sloc,
    functionCount,
    todoCount: todoDetails.length,
    todoDetails,
    modularizationCandidate: sloc > 200,
  };
}

function findMatchingBrace(code, openIndex) {
  if (openIndex < 0 || code[openIndex] !== '{') return -1;

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = openIndex; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (inSingle && ch === "'") inSingle = false;
      else if (inDouble && ch === '"') inDouble = false;
      else if (inTemplate && ch === '`') inTemplate = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function countComplexity(body) {
  const base = 1;
  const patterns = [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?[^:]/g,
    /&&/g,
    /\|\|/g,
  ];

  let score = base;
  for (const pattern of patterns) {
    const hits = body.match(pattern);
    score += hits ? hits.length : 0;
  }

  return score;
}

function complexityStatus(score) {
  if (score <= 5) return 'GUT';
  if (score <= 10) return 'AKZEPTABEL';
  if (score <= 20) return 'WARNUNG';
  return 'KRITISCH';
}

function analyzeComplexityForFile(filePath, code) {
  const functions = [];
  const functionPatterns = [
    { regex: /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g, nameGroup: 1 },
    { regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g, nameGroup: 1 },
    { regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*function\b/g, nameGroup: 1 },
  ];

  for (const pattern of functionPatterns) {
    let m;
    while ((m = pattern.regex.exec(code)) !== null) {
      const fnName = m[pattern.nameGroup] || '<anonymous>';
      const braceIndex = code.indexOf('{', m.index);
      if (braceIndex === -1) continue;
      const endBrace = findMatchingBrace(code, braceIndex);
      if (endBrace === -1) continue;

      const body = code.slice(braceIndex + 1, endBrace);
      const complexity = countComplexity(body);
      const line = toLineNumber(code, m.index);

      functions.push({
        file: rel(filePath),
        name: fnName,
        line,
        complexity,
        status: complexityStatus(complexity),
      });
    }
  }

  const moduleComplexity = functions.reduce((sum, fn) => sum + fn.complexity, 0);

  return {
    file: rel(filePath),
    moduleComplexity,
    moduleStatus: complexityStatus(moduleComplexity),
    functions,
  };
}

function extractRequires(filePath, code) {
  const requires = [];
  const rgx = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = rgx.exec(code)) !== null) {
    const spec = m[1];
    const line = toLineNumber(code, m.index);
    requires.push({
      file: rel(filePath),
      spec,
      line,
    });
  }
  return requires;
}

function resolveLocalRequire(baseFilePath, spec) {
  const baseDir = path.dirname(baseFilePath);
  const abs = path.resolve(baseDir, spec);

  const candidates = [
    abs,
    `${abs}.js`,
    path.join(abs, 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return path.resolve(candidate);
      }
    } catch (_err) {
      // ignore
    }
  }

  return null;
}

function detectCycles(graph) {
  const visited = new Set();
  const stack = new Set();
  const pathStack = [];
  const cycles = [];

  function dfs(node) {
    visited.add(node);
    stack.add(node);
    pathStack.push(node);

    const edges = graph.get(node) || [];
    for (const next of edges) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (stack.has(next)) {
        const startIdx = pathStack.indexOf(next);
        if (startIdx >= 0) {
          const cycle = pathStack.slice(startIdx).concat(next);
          const key = cycle.join('->');
          if (!cycles.some(c => c.key === key)) {
            cycles.push({ key, nodes: cycle });
          }
        }
      }
    }

    stack.delete(node);
    pathStack.pop();
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles.map(c => c.nodes);
}

function analyzeCoverage(testFiles) {
  if (testFiles.length === 0) {
    return {
      hasTests: false,
      reason: 'KEINE TESTS VORHANDEN',
      metricsByFile: [],
      total: null,
    };
  }

  const coverageRun = spawnSync('node', ['--test', '--experimental-test-coverage'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 180000,
  });

  const output = `${coverageRun.stdout || ''}\n${coverageRun.stderr || ''}`.trim();

  if (coverageRun.status !== 0) {
    const coverageUnsupported = /bad option: --experimental-test-coverage/i.test(output);
    return {
      hasTests: true,
      reason: coverageUnsupported
        ? 'Tests vorhanden, aber native Node-Coverage wird von dieser Node-Version nicht unterstuetzt.'
        : 'Tests vorhanden, aber Coverage-Lauf ist fehlgeschlagen.',
      metricsByFile: [],
      total: null,
      rawOutput: output,
    };
  }

  const lines = output.split(/\r?\n/);
  const startIdx = lines.findIndex(line => /start of coverage report/i.test(line));
  const endIdx = lines.findIndex(line => /end of coverage report/i.test(line));

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return {
      hasTests: true,
      reason: 'Tests erfolgreich, aber kein Coverage-Report im Node-Output gefunden.',
      metricsByFile: [],
      total: null,
      rawOutput: output,
    };
  }

  const tableLines = lines.slice(startIdx + 1, endIdx);
  const metricsByFile = [];
  let total = null;

  for (const rawLine of tableLines) {
    const cleanLine = rawLine
      .replace(/^\s*ℹ\s*/, '')
      .replace(/^#\s+/, '')
      .trim();
    if (!cleanLine || cleanLine.startsWith('-') || cleanLine.startsWith('file ')) {
      continue;
    }

    const match = cleanLine.match(/^(.+?)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|/);
    if (!match) {
      continue;
    }

    const row = {
      file: match[1].trim(),
      lines: Number(match[2]),
      branches: Number(match[3]),
      functions: Number(match[4]),
    };

    if (row.file.toLowerCase() === 'all files') {
      total = {
        statements: row.lines,
        branches: row.branches,
        functions: row.functions,
        lines: row.lines,
      };
      continue;
    }

    metricsByFile.push({
      file: row.file,
      statements: row.lines,
      branches: row.branches,
      functions: row.functions,
      lines: row.lines,
    });
  }

  return {
    hasTests: true,
    reason: total
      ? 'Coverage ueber Node --experimental-test-coverage erfolgreich gelesen.'
      : 'Coverage-Tabelle erkannt, aber Summenzeile (all files) fehlt.',
    metricsByFile,
    total,
  };
}

function analyzeSecurity(codeFiles, serverContent, analysisContent) {
  const dangerousPatterns = [
    { label: 'eval()', regex: /\beval\s*\(/g },
    { label: 'Function()', regex: /\bFunction\s*\(/g },
    { label: 'exec()', regex: /\bexec\s*\(/g },
    { label: 'child_process', regex: /\bchild_process\b/g },
  ];

  const secretRegex = /(API[-_]?KEY|password|secret|token)\s*[:=]\s*['"`][^'"`]+['"`]/gi;

  const dangerousFindings = [];
  const secretFindings = [];

  for (const filePath of codeFiles) {
    const content = safeRead(filePath);
    if (content == null) continue;

    for (const pattern of dangerousPatterns) {
      let m;
      while ((m = pattern.regex.exec(content)) !== null) {
        dangerousFindings.push({
          type: pattern.label,
          file: rel(filePath),
          line: toLineNumber(content, m.index),
        });
      }
      pattern.regex.lastIndex = 0;
    }

    let s;
    while ((s = secretRegex.exec(content)) !== null) {
      secretFindings.push({
        file: rel(filePath),
        line: toLineNumber(content, s.index),
        snippet: s[0].slice(0, 120),
      });
    }
    secretRegex.lastIndex = 0;
  }

  const validationPatterns = [
    /normalizeSmaPeriod/,
    /normalizeProviderFilter/,
    /Number\.isInteger/,
    /throw new Error/,
  ];

  const serverValidation = validationPatterns.some(rgx => rgx.test(serverContent || ''));
  const analysisValidation = validationPatterns.some(rgx => rgx.test(analysisContent || ''));

  return {
    dangerousFindings,
    secretFindings,
    inputValidation: {
      server: serverValidation,
      analysis: analysisValidation,
      overall: serverValidation && analysisValidation,
    },
  };
}

function classifyFileRisk(metric, complexityEntry) {
  let score = 0;

  if (metric.sloc > 200) score += 3;
  else if (metric.sloc > 120) score += 2;
  else if (metric.sloc > 60) score += 1;

  if (metric.todoCount >= 3) score += 2;
  else if (metric.todoCount > 0) score += 1;

  if (complexityEntry.moduleComplexity > 20) score += 3;
  else if (complexityEntry.moduleComplexity > 10) score += 2;
  else if (complexityEntry.moduleComplexity > 5) score += 1;

  let label = 'NIEDRIG';
  if (score >= 6) label = 'HOCH';
  else if (score >= 3) label = 'MITTEL';

  return { score, label };
}

function runDynamicSmokeChecks() {
  const checks = [];

  function record(name, status, detail) {
    checks.push({ name, status, detail });
  }

  try {
    const analysis = require(path.join(PROJECT_ROOT, 'src', 'analysis.js'));
    const p = analysis.normalizeSmaPeriod(50);
    record('analysis.normalizeSmaPeriod(50)', p === 50 ? 'OK' : 'WARNUNG', `Rueckgabewert: ${p}`);
  } catch (err) {
    record('analysis.normalizeSmaPeriod(50)', 'KRITISCH', err.message);
  }

  try {
    const signals = require(path.join(PROJECT_ROOT, 'src', 'signals.js'));
    const signal = signals.detectBreakoutSignal({
      dates: ['2026-01-01', '2026-01-02', '2026-01-03'],
      closes: [10, 9, 11],
      smaPeriod: 2,
    });
    record('signals.detectBreakoutSignal(smoke)', signal.signal === true ? 'OK' : 'WARNUNG', `signal=${signal.signal}`);
  } catch (err) {
    record('signals.detectBreakoutSignal(smoke)', 'KRITISCH', err.message);
  }

  try {
    const universe = require(path.join(PROJECT_ROOT, 'src', 'etfUniverseService.js'));
    const filter = universe.normalizeProviderFilter('all');
    record('etfUniverseService.normalizeProviderFilter(all)', filter === 'all' ? 'OK' : 'WARNUNG', `Rueckgabewert: ${filter}`);
  } catch (err) {
    record('etfUniverseService.normalizeProviderFilter(all)', 'KRITISCH', err.message);
  }

  return checks;
}

function generateRecommendations(context) {
  const recommendations = [];

  if (!context.coverage.hasTests) {
    recommendations.push({
      severity: 'WARNUNG',
      message:
        'Keine automatisierten Tests vorhanden. Test-Priorisierung: src/analysis.js -> src/signals.js -> src/indicators.js -> src/dataService.js',
      file: 'src/analysis.js',
    });
  }

  if (context.coverage.total) {
    const c = context.coverage.total;
    const checks = [
      ['Statements', c.statements, COVERAGE_THRESHOLDS.statements],
      ['Branches', c.branches, COVERAGE_THRESHOLDS.branches],
      ['Functions', c.functions, COVERAGE_THRESHOLDS.functions],
      ['Lines', c.lines, COVERAGE_THRESHOLDS.lines],
    ];

    for (const [label, value, threshold] of checks) {
      const status = statusForPercentage(value, threshold);
      if (status !== 'OK') {
        recommendations.push({
          severity: status === 'KRITISCH' ? 'KRITISCH' : 'WARNUNG',
          message: `${label}-Coverage ${value}% unter Zielwert ${threshold}%.`,
          file: 'coverage-summary',
        });
      }
    }
  }

  for (const fn of context.complexityTop) {
    if (fn.status === 'WARNUNG' || fn.status === 'KRITISCH') {
      recommendations.push({
        severity: fn.status === 'KRITISCH' ? 'KRITISCH' : 'WARNUNG',
        message: `Hohe Komplexitaet (${fn.complexity}) in Funktion ${fn.name}. Refactoring empfohlen.`,
        file: `${fn.file}:${fn.line}`,
      });
    }
  }

  for (const metric of context.metrics) {
    if (metric.modularizationCandidate) {
      recommendations.push({
        severity: 'WARNUNG',
        message: `Datei hat hohe SLOC (${metric.sloc}) und sollte modularisiert werden.`,
        file: metric.file,
      });
    }
  }

  for (const cycle of context.cycles) {
    recommendations.push({
      severity: 'KRITISCH',
      message: `Zirkulaere Abhaengigkeit erkannt: ${cycle.map(relPath => rel(relPath)).join(' -> ')}`,
      file: rel(cycle[0]),
    });
  }

  for (const finding of context.security.dangerousFindings) {
    recommendations.push({
      severity: 'KRITISCH',
      message: `Gefaehrlicher Aufruf erkannt (${finding.type}).`,
      file: `${finding.file}:${finding.line}`,
    });
  }

  for (const finding of context.security.secretFindings) {
    recommendations.push({
      severity: 'KRITISCH',
      message: `Moegliches hardcoded Secret gefunden (${finding.snippet}).`,
      file: `${finding.file}:${finding.line}`,
    });
  }

  if (!context.security.inputValidation.overall) {
    recommendations.push({
      severity: 'WARNUNG',
      message: 'Input-Validierung in server.js und analysis.js unvollstaendig.',
      file: 'server.js',
    });
  } else {
    recommendations.push({
      severity: 'INFO',
      message: 'Input-Validierung in server.js und src/analysis.js erkannt.',
      file: 'server.js',
    });
  }

  if (context.externalDependencyWarnings.length > 0) {
    for (const warning of context.externalDependencyWarnings) {
      recommendations.push({
        severity: 'WARNUNG',
        message: warning,
        file: 'package.json',
      });
    }
  }

  recommendations.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return recommendations;
}

function main() {
  const startIso = nowIso();

  const serverPath = path.join(PROJECT_ROOT, 'server.js');
  const srcDir = path.join(PROJECT_ROOT, 'src');
  const publicDir = path.join(PROJECT_ROOT, 'public');

  const srcJsFiles = fs.existsSync(srcDir)
    ? listFilesRecursive(srcDir, f => f.endsWith('.js'))
    : [];
  const publicFiles = fs.existsSync(publicDir)
    ? listFilesRecursive(publicDir, f => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.css'))
    : [];

  const analyzedFiles = [serverPath, ...srcJsFiles, ...publicFiles]
    .filter(filePath => fs.existsSync(filePath));

  const jsForStaticAnalysis = [serverPath, ...srcJsFiles, path.join(publicDir, 'app.js')]
    .filter(filePath => fs.existsSync(filePath));

  const testFiles = listFilesRecursive(PROJECT_ROOT, f =>
    f.endsWith('.test.js') ||
    f.endsWith('.spec.js') ||
    f.includes(`${path.sep}__tests__${path.sep}`)
  );

  const coverage = analyzeCoverage(testFiles);

  const metricsTargets = [serverPath, ...srcJsFiles].filter(f => fs.existsSync(f));
  const metrics = [];
  const complexityByFile = [];
  const requiresByFile = [];
  const graph = new Map();

  for (const filePath of metricsTargets) {
    try {
      const content = safeRead(filePath);
      if (content == null) continue;

      metrics.push(computeFileMetrics(filePath, content));

      const complexity = analyzeComplexityForFile(filePath, content);
      complexityByFile.push(complexity);

      const requires = extractRequires(filePath, content);
      requiresByFile.push({ file: rel(filePath), requires });

      const localDeps = [];
      for (const r of requires) {
        if (r.spec.startsWith('.')) {
          const resolved = resolveLocalRequire(filePath, r.spec);
          if (resolved) localDeps.push(resolved);
        }
      }
      graph.set(path.resolve(filePath), localDeps);
    } catch (_err) {
      // robust mode: continue with other files
    }
  }

  const functionComplexities = complexityByFile.flatMap(item => item.functions);
  const complexityTop = [...functionComplexities]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 5);

  const cycles = detectCycles(graph);

  const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
  let dependencies = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    dependencies = pkg.dependencies || {};
  } catch (_err) {
    dependencies = {};
  }

  const externalDependencyWarnings = [];
  if (dependencies['node-fetch']) {
    const versionSpec = String(dependencies['node-fetch']);
    const majorMatch = versionSpec.match(/(\d+)/);
    if (majorMatch && Number(majorMatch[1]) < 3) {
      externalDependencyWarnings.push(
        `node-fetch Version ${versionSpec} erkannt (potenzielles Sicherheits-/Wartungsrisiko bei < v3).`
      );
    }
  }
  if (dependencies.express) {
    const majorMatch = String(dependencies.express).match(/(\d+)/);
    if (majorMatch && Number(majorMatch[1]) < 5) {
      externalDependencyWarnings.push(
        `express Version ${dependencies.express} erkannt (Pruefung auf bekannte CVEs und Update-Pfad zu v5 empfohlen).`
      );
    }
  }

  const serverContent = safeRead(serverPath) || '';
  const analysisContent = safeRead(path.join(srcDir, 'analysis.js')) || '';
  const security = analyzeSecurity(jsForStaticAnalysis, serverContent, analysisContent);

  const riskByFile = metrics.map(metric => {
    const complexity = complexityByFile.find(c => c.file === metric.file) || {
      moduleComplexity: 0,
    };
    return {
      file: metric.file,
      ...classifyFileRisk(metric, complexity),
    };
  });

  const dynamicChecks = runDynamicSmokeChecks();

  const recommendations = generateRecommendations({
    coverage,
    complexityTop,
    metrics,
    cycles,
    security,
    externalDependencyWarnings,
  });

  const summaryCounts = recommendations.reduce(
    (acc, rec) => {
      if (rec.severity === 'KRITISCH') acc.critical += 1;
      else if (rec.severity === 'WARNUNG') acc.warning += 1;
      else acc.info += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 }
  );

  const sections = [];

  sections.push('=== 1. HEADER ===');
  sections.push(`Projektname: InvestFinder`);
  sections.push(`Analysezeitpunkt: ${startIso}`);
  sections.push(`Node.js-Version: ${process.version}`);
  sections.push(`Analysierte Wurzelpfade: ${ANALYZED_ROOTS.join(', ')}`);
  sections.push('Analysierte Dateipfade:');
  for (const p of analyzedFiles) {
    sections.push(`- ${rel(p)}`);
  }

  sections.push('');
  sections.push('=== 2. TESTABDECKUNG ===');
  sections.push(`Gefundene Testdateien: ${testFiles.length}`);
  if (testFiles.length === 0) {
    sections.push('Status: KEINE TESTS VORHANDEN');
    sections.push('Empfohlene Grenzwerte: Statements >= 80%, Branches >= 70%, Functions >= 80%, Lines >= 80%');
    sections.push('Handlungsempfehlung (Prioritaet): src/analysis.js > src/signals.js > src/indicators.js > src/dataService.js');
  } else {
    sections.push(`Status: ${coverage.reason}`);
    sections.push('Empfohlene Grenzwerte: Statements >= 80%, Branches >= 70%, Functions >= 80%, Lines >= 80%');

    if (coverage.total) {
      const total = coverage.total;
      const metricsToPrint = [
        ['Statements', total.statements, COVERAGE_THRESHOLDS.statements],
        ['Branches', total.branches, COVERAGE_THRESHOLDS.branches],
        ['Functions', total.functions, COVERAGE_THRESHOLDS.functions],
        ['Lines', total.lines, COVERAGE_THRESHOLDS.lines],
      ];
      sections.push('Gesamt-Coverage:');
      for (const [label, value, threshold] of metricsToPrint) {
        sections.push(
          `- ${label}: ${value}% | Ziel >= ${threshold}% | Status: ${statusForPercentage(value, threshold)}`
        );
      }
    }

    if (coverage.metricsByFile.length > 0) {
      sections.push('Coverage je Datei:');
      for (const fileMetric of coverage.metricsByFile) {
        sections.push(
          `- ${fileMetric.file}: S=${fileMetric.statements}% B=${fileMetric.branches}% F=${fileMetric.functions}% L=${fileMetric.lines}%`
        );
      }
    }

    if (coverage.rawOutput) {
      sections.push('Hinweis: Rohausgabe der Testausfuehrung (gekürzt):');
      sections.push(coverage.rawOutput.slice(0, 600));
    }
  }

  sections.push('');
  sections.push('=== 3. CODE-KOMPLEXITAET ===');
  sections.push('Grenzwerte: <=5 GUT | 6-10 AKZEPTABEL | 11-20 WARNUNG | >20 KRITISCH');
  for (const entry of complexityByFile) {
    sections.push(`Datei ${entry.file}: Modul-Komplexitaet ${entry.moduleComplexity} (${entry.moduleStatus})`);
    for (const fn of entry.functions) {
      sections.push(`  - ${fn.name} (Zeile ${fn.line}): ${fn.complexity} (${fn.status})`);
    }
  }
  sections.push('Top-5 komplexeste Funktionen/Module:');
  if (complexityTop.length === 0) {
    sections.push('- Keine Funktionen erkannt');
  } else {
    for (const fn of complexityTop) {
      sections.push(`- ${fn.file}:${fn.line} ${fn.name} -> ${fn.complexity} (${fn.status})`);
    }
  }

  sections.push('');
  sections.push('=== 4. CODE-METRIKEN ===');
  for (const m of metrics) {
    sections.push(
      `- ${m.file}: LOC=${m.loc}, SLOC=${m.sloc}, Funktionen=${m.functionCount}, TODO/FIXME=${m.todoCount}`
    );
    if (m.todoDetails.length > 0) {
      sections.push(`  -> TODO/FIXME Zeilen: ${m.todoDetails.map(d => `${d.tag}@${d.line}`).join(', ')}`);
    }
    if (m.modularizationCandidate) {
      sections.push('  -> WARNUNG: SLOC > 200, Modularisierung empfohlen');
    }
  }
  sections.push('Datei-Risiko-Scores (heuristisch):');
  for (const risk of riskByFile.sort((a, b) => b.score - a.score)) {
    sections.push(`- ${risk.file}: Score=${risk.score} | Risiko=${risk.label}`);
  }

  sections.push('');
  sections.push('=== 5. ABHAENGIGKEITSANALYSE ===');
  sections.push('require()-Imports je Datei:');
  for (const dep of requiresByFile) {
    sections.push(`- ${dep.file}:`);
    if (dep.requires.length === 0) {
      sections.push('  (keine require-Imports)');
      continue;
    }
    for (const r of dep.requires) {
      sections.push(`  - Zeile ${r.line}: require('${r.spec}')`);
    }
  }

  if (cycles.length > 0) {
    sections.push('Zirkulaere Abhaengigkeiten: KRITISCH');
    for (const cycle of cycles) {
      sections.push(`- ${cycle.map(n => rel(n)).join(' -> ')}`);
    }
  } else {
    sections.push('Zirkulaere Abhaengigkeiten: keine gefunden');
  }

  sections.push('Externe npm-Pakete (package.json):');
  const depEntries = Object.entries(dependencies);
  if (depEntries.length === 0) {
    sections.push('- Keine externen Dependencies gefunden');
  } else {
    for (const [name, version] of depEntries) {
      sections.push(`- ${name}: ${version}`);
    }
  }
  if (externalDependencyWarnings.length > 0) {
    sections.push('Security-Hinweise zu Dependencies:');
    for (const warning of externalDependencyWarnings) {
      sections.push(`- WARNUNG: ${warning}`);
    }
  }

  sections.push('');
  sections.push('=== 6. SICHERHEITSHINWEISE ===');
  if (security.dangerousFindings.length === 0) {
    sections.push('- Keine Nutzung von eval(), Function(), exec() oder child_process gefunden');
  } else {
    sections.push('- KRITISCH: Gefaehrliche APIs gefunden');
    for (const finding of security.dangerousFindings) {
      sections.push(`  - ${finding.file}:${finding.line} -> ${finding.type}`);
    }
  }

  if (security.secretFindings.length === 0) {
    sections.push('- Keine offensichtlichen hardcoded Secrets gefunden');
  } else {
    sections.push('- KRITISCH: Moegliche hardcoded Secrets gefunden');
    for (const s of security.secretFindings) {
      sections.push(`  - ${s.file}:${s.line} -> ${s.snippet}`);
    }
  }

  sections.push('Input-Validierung in API-Pfad:');
  sections.push(
    `- server.js: ${security.inputValidation.server ? 'vorhanden' : 'nicht erkannt'}`
  );
  sections.push(
    `- src/analysis.js: ${security.inputValidation.analysis ? 'vorhanden' : 'nicht erkannt'}`
  );

  sections.push('');
  sections.push('=== 7. HANDLUNGSEMPFEHLUNGEN (ZUSAMMENFASSUNG) ===');
  sections.push(`Findings gesamt: KRITISCH=${summaryCounts.critical}, WARNUNG=${summaryCounts.warning}, INFO=${summaryCounts.info}`);
  if (recommendations.length === 0) {
    sections.push('[INFO] Keine offenen Findings erkannt.');
  } else {
    for (const rec of recommendations) {
      sections.push(`[${rec.severity}] ${rec.message} | Datei: ${rec.file}`);
    }
  }

  sections.push('');
  sections.push('=== 8. DYNAMISCHE SMOKE-CHECKS ===');
  for (const check of dynamicChecks) {
    sections.push(`[${check.status}] ${check.name} | ${check.detail}`);
  }

  const report = sections.join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(`Quality report generated: ${REPORT_PATH}`);
}

try {
  main();
} catch (err) {
  const fallback = [
    '=== QUALITY REPORT GENERATION FAILED ===',
    `Zeitpunkt: ${nowIso()}`,
    `Fehler: ${err.message}`,
    err.stack || '',
    '',
  ].join('\n');

  try {
    fs.writeFileSync(REPORT_PATH, fallback, 'utf8');
  } catch (_err) {
    // ignore secondary failures
  }

  console.error('Fehler beim Erstellen des Quality Reports:', err.message);
  console.error(`Fallback report path: ${REPORT_PATH}`);
  process.exitCode = 1;
}
