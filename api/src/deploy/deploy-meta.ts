export type DeployMeta = {
  projectSlug: string;
  branch: string;
  branchSlug: string;
  pm2Name: string;
  port: number;
  runner?: 'pm2' | 'docker';
  /** Staging build for zero-downtime; cutover happens after health check. */
  zeroDowntime?: boolean;
  livePm2Name?: string;
  stagingPm2Name?: string;
  previousPort?: number | null;
  liveColor?: 'primary' | 'next';
  stagingColor?: 'primary' | 'next';
};
