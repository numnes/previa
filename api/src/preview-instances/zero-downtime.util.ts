import type { Project } from '../entities/project.entity';
import type { PreviewInstance } from '../entities/preview-instance.entity';
import { normalizeHealthCheckPath } from '../preview-instances/health-check.util';

export function projectHasHealthCheck(
  project: Pick<Project, 'healthCheckPath'>,
): boolean {
  return normalizeHealthCheckPath(project.healthCheckPath) != null;
}

/**
 * Effective ZD: project flag wins (forces all branches).
 * Instance flag only applies when the project flag is off.
 */
export function effectiveZeroDowntime(
  project: Pick<Project, 'zeroDowntimeEnabled'>,
  instance: Pick<PreviewInstance, 'zeroDowntimeEnabled'> | null | undefined,
): boolean {
  if (project.zeroDowntimeEnabled) return true;
  return !!instance?.zeroDowntimeEnabled;
}
