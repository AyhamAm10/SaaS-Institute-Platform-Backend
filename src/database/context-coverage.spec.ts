import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Context coverage (role.md §3): every model carrying `academicYearId` or
 * `branchId` must be read through a ContextScopedRepository, so the header
 * year / branch always apply. A model may only be left out with a written
 * reason here; a new model without a scoped repository fails this test.
 */
const CONTEXT_EXEMPT: Record<string, string> = {
  ReceiptSequence: 'internal counter, always addressed by explicit (branch, year) keys inside a payment',
  BranchTeacher: 'link table of a teacher to its branches; read through TeacherRepository (branch-scoped)',
};

// Jest runs from the project root (ESM: no __dirname)
const ROOT = process.cwd();

function modelsWithContextFields(): string[] {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const models: string[] = [];
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (/^\s+(academicYearId|branchId)\s/m.test(match[2])) models.push(match[1]);
  }
  return models;
}

function repositoryFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return repositoryFiles(path);
    return name.endsWith('.repository.ts') ? [path] : [];
  });
}

/** model delegate name (camelCase) → does a ContextScoped repository read it? */
function scopedDelegates(): Set<string> {
  const scoped = new Set<string>();
  for (const file of repositoryFiles(join(ROOT, 'src', 'modules'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/class \w+\s+extends\s+(\w+)<[\s\S]*?super\(prisma, '(\w+)'\)/g)) {
      if (match[1] === 'ContextScopedRepository') scoped.add(match[2]);
    }
  }
  return scoped;
}

describe('Operational context coverage', () => {
  const models = modelsWithContextFields();
  const scoped = scopedDelegates();
  const camel = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

  it('finds the models that carry a year or a branch', () => {
    expect(models).toEqual(expect.arrayContaining(['Section', 'Payment', 'StudentSubscription', 'DailyAttendance', 'Student']));
  });

  it.each(models)('%s is context-scoped or documented as exempt', (model) => {
    const covered = scoped.has(camel(model)) || model in CONTEXT_EXEMPT;
    if (!covered) {
      throw new Error(`${model} has academicYearId / branchId but no ContextScopedRepository (role.md §3)`);
    }
  });

  it('exempt entries are real models with a reason', () => {
    for (const [model, reason] of Object.entries(CONTEXT_EXEMPT)) {
      expect(models).toContain(model);
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
