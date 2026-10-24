import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./common/database.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { HealthModule } from "./modules/health/health.module";
import { InternalModule } from "./modules/internal/internal.module";
import { KnowledgeBasesModule } from "./modules/knowledge-bases/knowledge-bases.module";
import { MembersModule } from "./modules/members/members.module";
import { ModelConfigsModule } from "./modules/model-configs/model-configs.module";
import { SearchConfigsModule } from "./modules/search-configs/search-configs.module";

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
    SearchConfigsModule,
    ChatModule,
    InternalModule,
    MembersModule,
    AuditModule,
  ],
})
export class AppModule {}
