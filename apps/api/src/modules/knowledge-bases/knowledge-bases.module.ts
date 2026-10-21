import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AccessCheckController } from "./access-check.controller";
import { DocumentsController } from "./documents.controller";
import { KnowledgeBasesController } from "./knowledge-bases.controller";
import { KnowledgeBasesService } from "./knowledge-bases.service";

@Module({
  imports: [AccessControlModule],
  controllers: [KnowledgeBasesController, DocumentsController, AccessCheckController],
  providers: [KnowledgeBasesService],
})
export class KnowledgeBasesModule {}
