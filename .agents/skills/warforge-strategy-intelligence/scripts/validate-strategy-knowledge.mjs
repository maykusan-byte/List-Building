import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const workspaceIndex = args.indexOf('--workspace');
const workspaceRoot = resolve(workspaceIndex >= 0 ? args[workspaceIndex + 1] : '.');
const knowledgePath = args.find((arg, index) => index !== workspaceIndex + 1 && !arg.startsWith('--'));
const canonicalKnowledgePath = resolve(workspaceRoot, 'warforge-pwa/data/strategy/knowledge-base.json');
const canonicalValidatorPath = resolve(workspaceRoot, 'warforge-pwa/scripts/strategy-knowledge.mjs');

if (!knowledgePath) {
  console.error('Usage: node validate-strategy-knowledge.mjs warforge-pwa/data/strategy/knowledge-base.json --workspace <workspace-root>');
  process.exitCode = 1;
} else if (resolve(workspaceRoot, knowledgePath) !== canonicalKnowledgePath) {
  console.error('Ce relais valide uniquement la source de verite Warforge : ' + canonicalKnowledgePath);
  process.exitCode = 1;
} else if (!existsSync(canonicalValidatorPath)) {
  console.error('Validateur canonique introuvable : ' + canonicalValidatorPath);
  process.exitCode = 1;
} else {
  try {
    const { loadValidatedStrategyKnowledge } = await import(pathToFileURL(canonicalValidatorPath).href);
    await loadValidatedStrategyKnowledge();
    console.log('Connaissance strategique validee par le validateur canonique de la PWA.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
