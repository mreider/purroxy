import fs from 'fs';
import path from 'path';
import type { Capability } from '../shared/types';

// Storage uses the Capability type but keeps the "workflows" directory name
// for backward compatibility with existing profiles on disk.
type Workflow = Capability;

function getWorkflowDir(profilesDir: string, profileId: string): string {
  return path.join(profilesDir, profileId, 'workflows');
}

function getWorkflowPath(profilesDir: string, profileId: string, workflowId: string): string {
  return path.join(getWorkflowDir(profilesDir, profileId), `${workflowId}.json`);
}

export function saveWorkflow(profilesDir: string, workflow: Workflow): void {
  const dir = getWorkflowDir(profilesDir, workflow.profileId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${workflow.id}.json`),
    JSON.stringify(workflow, null, 2)
  );
}

export function loadWorkflow(profilesDir: string, profileId: string, workflowId: string): Workflow | null {
  const filePath = getWorkflowPath(profilesDir, profileId, workflowId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function listWorkflows(profilesDir: string, profileId: string): Workflow[] {
  const dir = getWorkflowDir(profilesDir, profileId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const workflows: Workflow[] = [];

  for (const file of files) {
    try {
      const wf = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      workflows.push(wf);
    } catch {
      // Skip corrupt files
    }
  }

  return workflows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteWorkflow(profilesDir: string, profileId: string, workflowId: string): void {
  const filePath = getWorkflowPath(profilesDir, profileId, workflowId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
