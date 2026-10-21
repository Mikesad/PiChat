import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./common/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { KnowledgeBasesModule } from "./modules/knowledge-bases/knowledge-bases.module";

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
  ],
})
export class AppModule {}
