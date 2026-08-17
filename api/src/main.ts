import { patchEmptyEnvFromFile } from './load-env';

patchEmptyEnvFromFile();

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const localhostPort3Patterns = [
    /^https?:\/\/localhost:3\d*$/,
    /^https?:\/\/127\.0\.0\.1:3\d*$/,
    /^https?:\/\/\[::1\]:3\d*$/,
    /^http?:\/\/127\.0\.0\.1:3\d*$/,
    /^http?:\/\/localhost:3\d*$/,
    /^http?:\/\/\[::1\]:3\d*$/,
  ];

  const corsOriginEnv =
    process.env.CORS_ORIGIN?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  app.enableCors({
    origin:
      corsOriginEnv.length > 0
        ? [...corsOriginEnv, ...localhostPort3Patterns]
        : localhostPort3Patterns,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Previa-Api-Key',
      'X-Previa-Setup-Key',
      'X-Previa-Cluster-Key',
      'X-Deployer-Api-Key',
      'X-Deployer-Setup-Key',
      'X-Deployer-Cluster-Key',
      'X-Requested-With',
    ],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Previa API')
    .setDescription('Documentação da API do Previa')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'jwt',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-previa-api-key',
        description: 'Chave usada para endpoints de deploy',
      },
      'deploy-api-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-previa-setup-key',
        description:
          'Chave gerada na máquina root (PREVIA_SETUP_KEY) para bootstrap de usuários',
      },
      'setup-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'x-previa-cluster-key',
        description: 'Chave cluster (clu_…) para leitura remota entre nós',
      },
      'cluster-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000, () => {
    console.log(`Listening in port ${process.env.PORT ?? 3000}`);
  });
}
bootstrap();
