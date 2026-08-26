import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const rootDir = process.cwd();

console.log("Validating TrueForge agent manifests and skill specifications...");

// 1. Validate Root Agent Manifest
const rootManifestPath = path.join(rootDir, "agents", "sentinel_root.json");
assert.ok(fs.existsSync(rootManifestPath), "agents/sentinel_root.json must exist");
const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, "utf-8"));

assert.strictEqual(rootManifest.name, "sentinel_root");
assert.ok(rootManifest.model && rootManifest.model.provider, "Root agent must declare model provider");
assert.ok(rootManifest.system_prompt.length > 50, "System prompt must not be empty");
assert.strictEqual(rootManifest.subagents.length, 2, "Root agent must declare 2 subagents");
assert.strictEqual(rootManifest.approval_gates.create_pull_request.approval_required, true, "create_pull_request must require approval");
assert.strictEqual(rootManifest.approval_gates.deploy_hotfix.approval_required, true, "deploy_hotfix must require approval");
assert.strictEqual(rootManifest.approval_gates.post_slack_update.approval_required, true, "post_slack_update must require approval");

console.log("✓ Root Agent Manifest (agents/sentinel_root.json) validated successfully.");

// 2. Validate Subagent Manifests
for (const sub of rootManifest.subagents) {
  const subPath = path.join(rootDir, sub.manifest_path);
  assert.ok(fs.existsSync(subPath), `Subagent manifest at ${sub.manifest_path} must exist`);
  const subManifest = JSON.parse(fs.readFileSync(subPath, "utf-8"));
  assert.strictEqual(subManifest.name, sub.name, `Subagent name must match manifest name`);
  assert.ok(subManifest.system_prompt.length > 50, `Subagent ${sub.name} system prompt must not be empty`);
  console.log(`✓ Subagent Manifest (${sub.manifest_path}) validated successfully.`);
}

// 3. Validate Skills
const skillPaths = [
  "skills/incident-triage/SKILL.md",
  "skills/hotfix-generator/SKILL.md",
];

for (const sp of skillPaths) {
  const fullPath = path.join(rootDir, sp);
  assert.ok(fs.existsSync(fullPath), `Skill file at ${sp} must exist`);
  const content = fs.readFileSync(fullPath, "utf-8");
  assert.ok(content.startsWith("---"), `Skill at ${sp} must have YAML frontmatter`);
  assert.ok(content.includes("name:"), `Skill at ${sp} frontmatter must contain name`);
  assert.ok(content.includes("description:"), `Skill at ${sp} frontmatter must contain description`);
  console.log(`✓ Skill Playbook (${sp}) validated successfully.`);
}

console.log("\n========================================================");
console.log(" ALL AGENT SPECS AND SKILLS VALIDATED WITH ZERO ERRORS ");
console.log("========================================================\n");
