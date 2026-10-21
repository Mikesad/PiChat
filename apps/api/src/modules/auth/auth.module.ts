import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
