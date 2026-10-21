import { Injectable, NotFoundException } from '@nestjs/common';
import { ClusterAggregatorService } from '../cluster/cluster-aggregator.service';
import { parseRemoteId } from '../cluster/cluster.types';
import type { CreateResourceDto } from './dto/create-resource.dto';
import type { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesService, type ResourceListItem } from './resources.service';

@Injectable()
export class ResourcesApiService {
  constructor(
    private readonly resources: ResourcesService,
    private readonly cluster: ClusterAggregatorService,
  ) {}

  listLocalForApi() {
    return this.resources.listLocalForApi();
  }

  getLocalOneForApi(id: string) {
    return this.resources.getLocalOneForApi(id);
  }

  listForApi() {
    return this.cluster.aggregateResources();
  }

  async getOneForApi(id: string) {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.getRemoteResource(remote.nodeId, remote.remoteId);
    }
    const row = await this.resources.getLocalOneForApi(id);
    return this.cluster.tagLocal(row);
  }

  async create(dto: CreateResourceDto) {
    const row = await this.resources.create(dto);
    return this.cluster.tagLocal(row);
  }

  async update(id: string, dto: UpdateResourceDto) {
    const remote = parseRemoteId(id);
    if (remote) {
      throw new NotFoundException(
        'Edição de recursos remotos ainda não é suportada; edite no nó de origem',
      );
    }
    const row = await this.resources.update(id, dto);
    return this.cluster.tagLocal(row);
  }

  async start(id: string) {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.startRemoteResource(remote.nodeId, remote.remoteId);
    }
    const row = await this.resources.startLocal(id);
    return this.cluster.tagLocal(row);
  }

  async stop(id: string) {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.stopRemoteResource(remote.nodeId, remote.remoteId);
    }
    const row = await this.resources.stopLocal(id);
    return this.cluster.tagLocal(row);
  }

  async remove(id: string) {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.removeRemoteResource(remote.nodeId, remote.remoteId);
    }
    return this.resources.removeLocal(id);
  }

  async logs(id: string, lines: number) {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.remoteResourceLogs(remote.nodeId, remote.remoteId, lines);
    }
    return this.resources.logsLocal(id, lines);
  }
}
