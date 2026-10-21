import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDatabase, type Database } from "@pichat/db";

export const DATABASE = Symbol("DATABASE");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const connectionString = config.get<string>("DATABASE_URL");
        if (!connectionString) {
          throw new Error("DATABASE_URL is not configured");
        }
        return createDatabase(connectionString);
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
