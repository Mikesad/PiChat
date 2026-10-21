import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createProducerRedisOptions,
  INGESTION_JOB_OPTIONS,
  INGESTION_QUEUE,
  type IngestionJob,
} from "@pichat/queue";
import { Queue } from "bullmq";
import { serviceUnavailable } from "../../common/api-error";

@Injectable()
export class IngestionQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(IngestionQueueService.name);
  private readonly queue: Queue<IngestionJob>;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const redisUrl = config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.queue = new Queue<IngestionJob>(INGESTION_QUEUE, {
      connection: createProducerRedisOptions(redisUrl),
      defaultJobOptions: INGESTION_JOB_OPTIONS,
    });
    this.queue.on("error", () => {
      this.logger.warn("Ingestion queue Redis connection is unavailable");
    });
  }

  async enqueue(job: IngestionJob): Promise<void> {
    try {
      await this.queue.add("ingest", job);
    } catch {
      throw serviceUnavailable("任务队列暂时不可用，文档已保存，请稍后重试解析");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
