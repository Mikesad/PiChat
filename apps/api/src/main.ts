import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import { HttpStatus } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { ApiException } from "./common/api-error";
import { ApiExceptionFilter } from "./common/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  await app.register(fastifyCookie);
  const maxUploadBytes = Number(process.env.UPLOAD_MAX_BYTES ?? 20 * 1024 * 1024);
  await app.register(fastifyMultipart, {
    limits: {
      fileSize:
        Number.isFinite(maxUploadBytes) && maxUploadBytes > 0 ? maxUploadBytes : 20 * 1024 * 1024,
      files: 1,
      fields: 2,
    },
    throwFileSizeLimit: true,
  });

  const adapter = app.getHttpAdapter() as FastifyAdapter;
  adapter.useBodyParser("application/json", false, {}, (_request, body, done) => {
    const text = body.toString().trim();
    if (text.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      done(
        new ApiException("invalid_request", "请求体不是有效 JSON", HttpStatus.BAD_REQUEST),
        undefined,
      );
    }
  });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
