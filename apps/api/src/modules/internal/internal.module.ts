import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { InternalGuard } from "./internal.guard";
import { InternalAccessController } from "./internal-access.controller";
import { InternalAccessService } from "./internal-access.service";

@Module({
  imports: [AccessControlModule],
  controllers: [InternalAccessController],
  providers: [InternalAccessService, InternalGuard],
})
export class InternalModule {}
