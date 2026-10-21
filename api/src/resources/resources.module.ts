import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ClusterModule } from '../cluster/cluster.module';
import { ProvisionedResource } from '../entities/provisioned-resource.entity';
import { ResourcesApiService } from './resources-api.service';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([ProvisionedResource]),
    forwardRef(() => ClusterModule),
  ],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourcesApiService],
  exports: [ResourcesService, ResourcesApiService],
})
export class ResourcesModule {}
