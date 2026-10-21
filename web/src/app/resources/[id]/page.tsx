import { DEMO_RESOURCE_STATIC_PARAMS } from '@/demo/fixtures';
import ResourceDetailClient from './ResourceDetailClient';

export function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO === '1') {
    return DEMO_RESOURCE_STATIC_PARAMS;
  }
  return [];
}

export default function ResourceDetailPage() {
  return <ResourceDetailClient />;
}
