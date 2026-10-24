import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { IngestionModule } from "../ingestion/ingestion.module";
import { ModelConfigsModule } from "../model-configs/model-configs.module";
import { AccessCheckController } from "./access-check.controller";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { KnowledgeBaseRemoteService } from "./knowledge-base-remote.service";
import { KnowledgeBasesController } from "./knowledge-bases.controller";
import { KnowledgeBasesService } from "./knowledge-bases.service";

@Module({
  imports: [AccessControlModule, IngestionModule, ModelConfigsModule],
  controllers: [KnowledgeBasesController, DocumentsController, AccessCheckController],
  providers: [KnowledgeBasesService, DocumentsService, KnowledgeBaseRemoteService],
})
export class KnowledgeBasesModule {}
