import { Module } from "@nestjs/common";
import { ModelConfigsModule } from "../model-configs/model-configs.module";
import { SearchConfigsController } from "./search-configs.controller";
import { SearchConfigsService } from "./search-configs.service";

@Module({
  imports: [ModelConfigsModule],
  controllers: [SearchConfigsController],
  providers: [SearchConfigsService],
  exports: [SearchConfigsService],
})
export class SearchConfigsModule {}
