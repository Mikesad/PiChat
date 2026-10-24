import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { ModelConfigsModule } from "../model-configs/model-configs.module";
import { InternalGuard } from "./internal.guard";
import { InternalAccessController } from "./internal-access.controller";
import { InternalAccessService } from "./internal-access.service";

@Module({
  imports: [AccessControlModule, ModelConfigsModule],
  controllers: [InternalAccessController],
  providers: [InternalAccessService, InternalGuard],
})
export class InternalModule {}
