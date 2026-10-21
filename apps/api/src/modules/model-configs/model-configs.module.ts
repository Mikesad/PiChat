import { Module } from "@nestjs/common";
import { modelConfigCryptoProvider } from "./model-config-crypto.provider";
import { ModelConfigsController } from "./model-configs.controller";
import { ModelConfigsService } from "./model-configs.service";

@Module({
  controllers: [ModelConfigsController],
  providers: [modelConfigCryptoProvider, ModelConfigsService],
})
export class ModelConfigsModule {}
