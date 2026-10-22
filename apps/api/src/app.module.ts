import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./common/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { HealthModule } from "./modules/health/health.module";
import { InternalModule } from "./modules/internal/internal.module";
import { KnowledgeBasesModule } from "./modules/knowledge-bases/knowledge-bases.module";
import { ModelConfigsModule } from "./modules/model-configs/model-configs.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    KnowledgeBasesModule,
    ModelConfigsModule,
    ChatModule,
    InternalModule,
  ],
})
export class AppModule {}
