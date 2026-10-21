import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { IngestionModule } from "../ingestion/ingestion.module";
import { AccessCheckController } from "./access-check.controller";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { KnowledgeBasesController } from "./knowledge-bases.controller";
import { KnowledgeBasesService } from "./knowledge-bases.service";

@Module({
  imports: [AccessControlModule, IngestionModule],
  controllers: [KnowledgeBasesController, DocumentsController, AccessCheckController],
  providers: [KnowledgeBasesService, DocumentsService],
})
export class KnowledgeBasesModule {}
